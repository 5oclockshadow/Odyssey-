import time

from selfwire.workbench import moat
from selfwire.workbench.auditor import AuditReport, Finding
from selfwire.workbench.improver import FileChange
from selfwire.workbench.moat import MoatPolicy
from selfwire.workbench.tester import TestReport
from selfwire.workbench.workspace import Workspace


def report(passed=10, failed=0, errors=0, skipped=0, ok=None, **kw):
    total = passed + failed + errors + skipped
    now = time.time()
    return TestReport(ok=(failed == 0 and errors == 0 and total > 0) if ok is None else ok,
                      exit_code=0 if failed == errors == 0 else 1, total=total, passed=passed, failed=failed,
                      errors=errors, skipped=skipped, started_at=now, finished_at=now, **kw)


def audit(*high_rules):
    findings = [Finding(severity="high", rule=r, path="x.py", message=r) for r in high_rules]
    return AuditReport(score=100, generated_at=0, files_scanned=1, metrics={}, findings=findings, plan=[])


P = MoatPolicy()


def test_green_to_green_is_accepted():
    assert moat.evaluate(P, report(10), report(11)).accepted


def test_green_to_red_is_rejected():
    v = moat.evaluate(P, report(10), report(9, failed=1))
    assert not v.accepted and any("went red" in r for r in v.reasons)


def test_red_baseline_must_get_strictly_less_red():
    base = report(8, failed=2)
    assert moat.evaluate(P, base, report(9, failed=1)).accepted
    assert not moat.evaluate(P, base, report(8, failed=2)).accepted


def test_deleting_tests_to_go_green_is_rejected():
    v = moat.evaluate(P, report(8, failed=2), report(8))
    assert not v.accepted and any("test count dropped" in r for r in v.reasons)


def test_skipping_tests_to_go_green_is_rejected():
    v = moat.evaluate(P, report(9, failed=1), report(9, skipped=1))
    assert not v.accepted and any("skipped" in r for r in v.reasons)


def test_passing_count_must_not_drop():
    v = moat.evaluate(P, report(10, skipped=0), report(9, failed=0, errors=0, skipped=0, ok=True))
    assert not v.accepted


def test_timeout_and_cancel_are_rejected():
    assert not moat.evaluate(P, report(10), report(10, timed_out=True)).accepted
    assert not moat.evaluate(P, report(10), report(10, cancelled=True)).accepted


def test_new_high_audit_finding_is_rejected_but_tests_failing_is_not_double_counted():
    assert not moat.evaluate(P, report(10), report(10), audit(), audit("syntax-error")).accepted
    assert moat.evaluate(P, report(8, failed=2), report(9, failed=1), audit("tests-failing"), audit("tests-failing")).accepted


def test_check_changeset_rules(mini_repo):
    ws = Workspace(mini_repo, protected=("selfwire/workbench/moat.py",))
    policy = MoatPolicy(protected_paths=ws.protected, max_files_per_change=3, max_bytes_per_file=50)

    def check(*changes):
        return moat.check_changeset(policy, changes, ws)

    assert check(FileChange(op="write", path="calc/x.py", content="y = 1\n")).accepted
    assert not check().accepted
    assert not check(FileChange(op="write", path="selfwire/workbench/moat.py", content="")).accepted
    assert not check(FileChange(op="delete", path="tests/test_calc.py")).accepted
    assert not check(FileChange(op="write", path="../evil.py", content="")).accepted
    assert not check(FileChange(op="write", path="big.py", content="x" * 51)).accepted
    assert not check(FileChange(op="replace", path="calc/__init__.py", old="", new="x")).accepted
    assert not check(*[FileChange(op="write", path=f"f{i}.py", content="") for i in range(4)]).accepted


def test_policy_description_names_every_rule():
    text = P.describe()
    for phrase in ("green", "count must not drop", "skipped", "assertions", "high-severity", "tests/", "moat.py",
                   "conftest.py", "selfwire/workbench", "os._exit", "JUnit"):
        assert phrase in text


def test_test_harness_is_off_limits_to_change_sets(mini_repo):
    ws = Workspace(mini_repo)
    for path in ("tests/conftest.py", "tests/a/b/conftest.py", "conftest.py", "pytest.ini", "pyproject.toml",
                 "selfwire/workbench/tester.py", "selfwire/workbench/improver.py"):
        verdict = moat.check_changeset(P, [FileChange(op="write", path=path, content="x = 1\n")], ws)
        assert not verdict.accepted and "test harness" in verdict.reasons[0], path
    assert P.is_harness("tests/sub/conftest.py") and not P.is_harness("tests/test_conftest_helpers.py")
    assert P.is_harness("selfwire/workbench/core.py") and P.is_harness("TESTS/CONFTEST.PY")
    assert not P.is_harness("selfwire/workbench/ui/index.html"), "the dashboard stays agent-editable"
    assert not P.is_harness("selfwire/agent.py"), "the rest of the agent stays agent-editable"


def test_hollowing_out_assertions_is_rejected(mini_repo):
    ws = Workspace(mini_repo)
    (mini_repo / "tests" / "test_more.py").write_text(
        "import pytest\n\n\ndef test_x():\n    assert 1\n    with pytest.raises(ValueError):\n        int('x')\n"
        "\n\ndef test_y(mock):\n    mock.assert_called_once()\n")
    assert moat.count_assertions(ws) == 4  # test_calc assert + assert + raises + assert_called_once
    v = moat.evaluate(P, report(10), report(10), baseline_assertions=4, candidate_assertions=3)
    assert not v.accepted and "assertions under tests/ dropped 4 -> 3" in v.reasons
    assert moat.evaluate(P, report(10), report(10), baseline_assertions=4, candidate_assertions=5).accepted
