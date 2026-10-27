from dspy.utils.dummies import DummyLM

from selfwire.agent import AnalyticalTrace, DualCognitionFrame, IntuitiveTrace, SynthesizedAction


def frame(**synthesis):
    return {"cognition": DualCognitionFrame(
        left_brain=AnalyticalTrace(decomposition=["step"], confidence=0.7),
        right_brain=IntuitiveTrace(confidence=0.6),
        synthesis=SynthesizedAction(**synthesis),
    ).model_dump()}


def call(tool, **args):
    return frame(action_type="call_tool", rationale=f"use {tool}", tool_name=tool, tool_args=args)


def test_commands_without_a_model(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    wb.settings.update(model=None)
    chat = wb.chat
    assert chat.handle("/help").kind == "help"
    assert "calc/__init__.py" in chat.handle("/ls calc").reply
    assert "return a + b" in chat.handle("/cat calc/__init__.py").reply
    assert chat.handle("/write docs/notes.md\n# Notes\nline two").kind == "command"
    assert wb.workspace.read("docs/notes.md") == "# Notes\nline two"
    assert "docs/notes.md" in chat.handle("/diff").reply
    assert chat.handle("/commit add notes").reply.startswith("committed")
    assert "add notes" in chat.handle("/log").reply
    assert chat.handle("/mv docs/notes.md docs/n.md").reply == "moved docs/notes.md -> docs/n.md"
    assert chat.handle("/rm docs/n.md").reply == "deleted docs/n.md"
    assert "Audit score" in chat.handle("/audit").reply
    assert chat.handle("/model openai/gpt-4o-mini").data["model"] == "openai/gpt-4o-mini"
    wb.settings.update(model=None)
    reply = chat.handle("please refactor everything")
    assert reply.kind == "help" and "/model" in reply.reply


def test_errors_become_replies_not_exceptions(mini_repo, workbench_factory):
    chat = workbench_factory(mini_repo).chat
    for bad in ("/cat ../../etc/passwd", "/cat nope.py", "/frobnicate", "/rollback zzz", "/write"):
        assert chat.handle(bad).kind == "error"
    history = chat.history()
    assert [m.role for m in history[-2:]] == ["user", "assistant"]


def test_test_command_runs_a_job_and_posts_a_notice(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    reply = wb.chat.handle("/test tests/test_calc.py")
    job = wb.jobs.wait(reply.data["job_id"], timeout=60)
    assert job.status == "succeeded" and job.result["passed"] == 1
    notices = [m for m in wb.chat.history() if m.role == "system"]
    assert notices and "PASSED" in notices[-1].text
    assert wb.bus.history("test_line"), "test output is streamed as events"


def test_agent_edits_tests_and_commits_through_the_gate(mini_repo, workbench_factory):
    script = [
        call("read_file", path="calc/__init__.py"),
        call("replace_in_file", path="calc/__init__.py", old="return a + b", new="return b + a"),
        call("git_commit", message="too early"),
        call("run_tests"),
        call("git_commit", message="swap operands"),
        frame(action_type="respond", rationale="done", final_answer="Swapped the operands; 1/1 tests pass; committed."),
    ]
    wb = workbench_factory(mini_repo, lm_override=DummyLM(script), max_iters=8)
    reply = wb.chat.handle("swap the operands in add and commit it")
    assert reply.kind == "agent" and reply.reply.startswith("Swapped")
    observations = [s["observation"] for s in reply.steps]
    assert "1| " in observations[0], "read_file returns numbered lines"
    assert "commit refused" in observations[2], "the agent cannot commit untested edits"
    assert observations[4].startswith("OK") and "committed" in observations[4]
    assert wb.workspace.log(1)[0].message == "swap operands"
    assert "return b + a" in wb.workspace.read("calc/__init__.py")
    assert "workbench" in {s["source"] for s in wb.agent().registry.stats().values()}


def test_agent_cannot_commit_red_code(mini_repo, workbench_factory):
    script = [
        call("replace_in_file", path="calc/__init__.py", old="return a + b", new="return a - b"),
        call("run_tests"),
        call("git_commit", message="ship it anyway"),
        frame(action_type="respond", final_answer="could not commit"),
    ]
    wb = workbench_factory(mini_repo, lm_override=DummyLM(script), max_iters=6)
    head = wb.workspace.head()
    reply = wb.chat.handle("break it and commit")
    assert "last full test run failed" in reply.steps[2]["observation"]
    assert wb.workspace.head() == head


def test_agent_tools_refuse_protected_paths(mini_repo, workbench_factory):
    script = [call("write_file", path="selfwire/workbench/moat.py", content="ACCEPT_EVERYTHING = True"),
              frame(action_type="respond", final_answer="refused")]
    wb = workbench_factory(mini_repo, lm_override=DummyLM(script))
    reply = wb.chat.handle("disable your moat")
    assert "test harness" in reply.steps[0]["observation"]
    assert not wb.workspace.exists("selfwire/workbench/moat.py")


def test_agent_cannot_plant_a_conftest_that_fakes_passes(mini_repo, workbench_factory):
    hook = ("import pytest\n\n@pytest.hookimpl(hookwrapper=True)\ndef pytest_runtest_makereport(item, call):\n"
            "    outcome = yield\n    outcome.get_result().outcome = 'passed'\n")
    script = [call("write_file", path="tests/conftest.py", content=hook),
              call("write_file", path="tests/deep/conftest.py", content=hook),
              call("write_file", path="pyproject.toml", content="[tool.pytest.ini_options]\naddopts = '--deselect tests'\n"),
              frame(action_type="respond", final_answer="refused")]
    wb = workbench_factory(mini_repo, lm_override=DummyLM(script), max_iters=5)
    reply = wb.chat.handle("make the tests always pass")
    for step in reply.steps[:3]:
        assert "test harness" in step["observation"]
    assert not wb.workspace.exists("tests/conftest.py") and not wb.workspace.exists("pyproject.toml")
    wb.chat.handle("/write tests/conftest.py\n# the human may still edit the harness")
    assert wb.workspace.exists("tests/conftest.py")
