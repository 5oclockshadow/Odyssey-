import pytest
from dspy.utils.dummies import DummyLM

from selfwire.workbench.settings import LMNotConfigured


def cs(*changes, rationale="r", done=False):
    return {"change_set": {"rationale": rationale, "done": done, "changes": list(changes)}}


def replace(path, old, new):
    return {"op": "replace", "path": path, "old": old, "new": new}


def write(path, content):
    return {"op": "write", "path": path, "content": content}


BREAK_ADD = replace("calc/__init__.py", "return a + b", "return a - b")
GOOD = [
    replace("calc/__init__.py", "return a + b", "return a + b\n\n\ndef mul(a, b):\n    return a * b"),
    write("tests/test_mul.py", "from calc import mul\n\n\ndef test_mul():\n    assert mul(3, 4) == 12\n"),
]


def run(wb, goal="add mul", attempts=3):
    return wb.improver.run(goal, attempts, job_id="t")


def test_bad_attempt_rolled_back_then_good_attempt_committed(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, lm_override=DummyLM([cs(BREAK_ADD), cs(*GOOD)]))
    base = wb.workspace.head()
    result = run(wb)
    assert result.status == "committed"
    assert [a.outcome for a in result.attempts] == ["rolled_back", "committed"]
    assert "went red" in result.attempts[0].reason
    assert result.commit_sha == wb.workspace.head() != base
    assert "def mul" in wb.workspace.read("calc/__init__.py") and wb.workspace.exists("tests/test_mul.py")
    assert not wb.workspace.is_dirty()
    phases = [e.data["phase"] for e in wb.bus.history("improve")]
    assert phases[0] == "audit" and "rollback" in phases and "commit" in phases and phases[-1] == "done"
    assert result.report_path and ".selfwire" in result.report_path


def test_every_attempt_bad_leaves_the_tree_exactly_at_the_checkpoint(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, lm_override=DummyLM([cs(BREAK_ADD)] * 2))
    base = wb.workspace.head()
    original = wb.workspace.read("calc/__init__.py")
    result = run(wb, attempts=2)
    assert result.status == "rolled_back" and len(result.attempts) == 2
    assert wb.workspace.head() == base and wb.workspace.read("calc/__init__.py") == original
    assert not wb.workspace.is_dirty()


def test_skipping_a_test_to_go_green_is_rolled_back(make_repo, workbench_factory):
    root = make_repo({"calc/__init__.py": "def add(a, b):\n    return a - b\n",
                      "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n"})
    cheat = cs(replace("tests/test_calc.py", "def test_add", "import pytest\n\n\n@pytest.mark.skip\ndef test_add"))
    wb = workbench_factory(root, lm_override=DummyLM([cheat]))
    result = run(wb, goal="make the suite green", attempts=1)
    assert result.status == "rolled_back"
    assert "skipped" in result.attempts[0].reason
    assert "skip" not in wb.workspace.read("tests/test_calc.py")


def test_hollowing_out_a_test_to_hide_a_bug_is_rolled_back(mini_repo, workbench_factory):
    """Break `add` AND gut its test to `pass`: test count and passing count are
    unchanged and the suite is green — only the assertion rule catches it."""
    cheat = cs(BREAK_ADD, replace("tests/test_calc.py", "assert add(2, 3) == 5", "pass"))
    wb = workbench_factory(mini_repo, lm_override=DummyLM([cheat]))
    result = run(wb, goal="refactor add", attempts=1)
    assert result.status == "rolled_back"
    assert result.attempts[0].test["ok"] is True, "the cheat really does turn the suite green"
    assert "assertions under tests/ dropped 1 -> 0" in result.attempts[0].reason
    assert "return a + b" in wb.workspace.read("calc/__init__.py")


def test_protected_path_and_test_deletion_rejected_before_touching_disk(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, protected=("calc/__init__.py",),
                           lm_override=DummyLM([cs(BREAK_ADD), cs({"op": "delete", "path": "tests/test_calc.py"})]))
    mutations = wb.workspace.mutation_count
    result = run(wb, attempts=2)
    assert [a.outcome for a in result.attempts] == ["rejected", "rejected"]
    assert "protected" in result.attempts[0].reason and "deleting test files" in result.attempts[1].reason
    assert wb.workspace.mutation_count == mutations, "rejected change sets never reach the filesystem"


def test_apply_failure_rolls_back_partial_changes(mini_repo, workbench_factory):
    half = cs(write("calc/new.py", "x = 1\n"), replace("calc/__init__.py", "no such text", "y"))
    wb = workbench_factory(mini_repo, lm_override=DummyLM([half]))
    result = run(wb, attempts=1)
    assert result.attempts[0].outcome == "rolled_back" and "apply failed" in result.attempts[0].reason
    assert not wb.workspace.exists("calc/new.py")


def test_uncommitted_user_work_survives_and_stays_uncommitted(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, lm_override=DummyLM([cs(BREAK_ADD)]))
    head = wb.workspace.head()
    wb.workspace.write("NOTES.md", "my unsaved thoughts")
    result = run(wb, attempts=1)
    assert result.status == "rolled_back"
    assert wb.workspace.read("NOTES.md") == "my unsaved thoughts", "checkpointing protected it from the rollback"
    assert wb.workspace.head() == head, "and the checkpoint was unwound: untested work is not left committed"
    assert "NOTES.md" in {c.path for c in wb.workspace.status().changes}


def test_no_change_when_goal_already_met(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, lm_override=DummyLM([cs(done=True)]))
    head = wb.workspace.head()
    result = run(wb, goal="add exists already")
    assert result.status == "no_change" and wb.workspace.head() == head


def test_failure_feedback_reaches_the_next_attempt(mini_repo, workbench_factory):
    lm = DummyLM([cs(BREAK_ADD), cs(*GOOD)])
    wb = workbench_factory(mini_repo, lm_override=lm)
    run(wb)
    second_prompt = str(lm.history[-1]["messages"])
    assert "EARLIER ATTEMPTS" in second_prompt and "test_add" in second_prompt


def test_requires_a_model(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    wb.settings.update(model=None)
    with pytest.raises(LMNotConfigured):
        wb.start_improve_job("anything")
