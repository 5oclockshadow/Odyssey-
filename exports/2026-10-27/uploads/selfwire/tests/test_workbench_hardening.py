"""
Regression tests for the independent security review of 0.3.0. Each
defense is exercised directly at its own boundary.
"""

import os

import pytest
from dspy.utils.dummies import DummyLM
from fastapi.testclient import TestClient

from selfwire.agent import AnalyticalTrace, DualCognitionFrame, IntuitiveTrace, SynthesizedAction
from selfwire.workbench import moat
from selfwire.workbench.improver import FileChange
from selfwire.workbench.moat import MoatPolicy
from selfwire.workbench.server import create_app
from selfwire.workbench.tester import TestRunner
from selfwire.workbench.workspace import PathRejected, Workspace


def cs(*changes):
    return {"change_set": {"rationale": "r", "done": False, "changes": list(changes)}}


def frame(**synthesis):
    return {"cognition": DualCognitionFrame(left_brain=AnalyticalTrace(), right_brain=IntuitiveTrace(),
                                            synthesis=SynthesizedAction(**synthesis)).model_dump()}


def test_pytest_config_variants_are_harness(mini_repo):
    ws = Workspace(mini_repo)
    for path in (".pytest.ini", "pytest.toml", ".pytest.toml", "setup.cfg", "tox.ini"):
        verdict = moat.check_changeset(MoatPolicy(), [FileChange(op="write", path=path, content="[pytest]\n")], ws)
        assert not verdict.accepted and "test harness" in verdict.reasons[0], path


def test_plugin_declaration_in_a_test_module_is_rejected(mini_repo):
    ws = Workspace(mini_repo)
    change = FileChange(op="write", path="tests/test_x.py", content="pytest_plugins = ['tests.helper']\n")
    verdict = moat.check_changeset(MoatPolicy(), [change], ws)
    assert not verdict.accepted and "pytest_plugins" in verdict.reasons[0]


def test_scanner_only_judges_added_lines(mini_repo):
    old = "import sys\nARGS = sys.argv\n"
    assert moat.scan_for_gaming("tests/t.py", moat.added_text(old, old + "X = 1\n")) == []
    assert moat.scan_for_gaming("tests/t.py", moat.added_text("", old))


def test_env_options_do_not_reach_the_test_run(mini_repo, monkeypatch):
    monkeypatch.setenv("PYTEST_ADDOPTS", "-p no_such_plugin_selfwire_xyz")
    report = TestRunner(mini_repo).run()
    assert report.ok and not report.integrity_problems


def test_git_meta_snapshot_restores_hooks_and_config(mini_repo):
    ws = Workspace(mini_repo)
    ws.ensure_repo()
    snap = ws.git_meta_snapshot()
    hook = mini_repo / ".git" / "hooks" / "post-commit"
    hook.write_text("#!/bin/sh\n")
    (mini_repo / ".git" / "config").write_text((mini_repo / ".git" / "config").read_text() + "\n# changed\n")
    changed = ws.git_meta_restore(snap)
    assert ".git/hooks/post-commit" in changed and ".git/config" in changed
    assert not hook.exists() and "# changed" not in (mini_repo / ".git" / "config").read_text()
    assert ws.git_meta_restore(ws.git_meta_snapshot()) == []


def test_workbench_git_never_runs_hooks(mini_repo):
    ws = Workspace(mini_repo)
    ws.ensure_repo()
    marker = mini_repo.parent / "hook-ran"
    hook = mini_repo / ".git" / "hooks" / "pre-commit"
    hook.write_text(f"#!/bin/sh\ntouch {marker}\n")
    hook.chmod(0o755)
    ws.write("x.txt", "x")
    ws.commit("with a hook present")
    assert not marker.exists()


def test_paths_are_compared_case_insensitively(mini_repo):
    ws = Workspace(mini_repo, protected=("calc/locked.py",))
    for bad in (".GIT/config", ".Env", "a/.VENV/x.py"):
        with pytest.raises(PathRejected):
            ws.resolve(bad)
    with pytest.raises(PathRejected, match="protected"):
        ws.write("CALC/LOCKED.py", "x")
    assert MoatPolicy().is_harness("Tests/Deep/ConfTest.py")


def test_agent_write_with_gaming_construct_is_refused(mini_repo, workbench_factory):
    script = [frame(action_type="call_tool", tool_name="write_file",
                    tool_args={"path": "tests/test_z.py", "content": "pytest_plugins = ['x']\n"}),
              frame(action_type="respond", final_answer="done")]
    wb = workbench_factory(mini_repo, lm_override=DummyLM(script))
    reply = wb.chat.handle("add a plugin")
    assert "refused" in reply.steps[0]["observation"]
    assert not wb.workspace.exists("tests/test_z.py")


def test_unsafe_levers_off_by_default_then_toggleable(mini_repo, workbench_factory):
    write_tool = frame(action_type="write_tool", new_tool_name="triple",
                       new_tool_code="def triple(n: int) -> int:\n    return n * 3", new_tool_description="x3")
    done = frame(action_type="respond", final_answer="ok")
    wb = workbench_factory(mini_repo, lm_override=DummyLM([write_tool, done, write_tool, done]))
    first = wb.chat.handle("make a tool")
    assert "disabled in the workbench" in first.steps[0]["observation"]
    wb.settings.update(allow_unsafe_levers=True)
    second = wb.chat.handle("make a tool")
    assert second.steps[0]["observation"].startswith("OK")


def test_dns_rebinding_and_cross_origin_are_refused(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    with TestClient(create_app(wb, allowed_hosts=["myhost.lan"])) as c:
        assert c.get("/api/health").status_code == 403  # Host: testserver
        assert c.get("/api/health", headers={"Host": "127.0.0.1:8765"}).status_code == 200
        assert c.get("/api/health", headers={"Host": "[::1]:8765"}).status_code == 200
        assert c.get("/api/health", headers={"Host": "myhost.lan:8765"}).status_code == 200
        assert c.get("/api/health", headers={"Host": "attacker.rebind.example:8765"}).status_code == 403
        loop = {"Host": "127.0.0.1:8765"}
        assert c.get("/api/health", headers={**loop, "Origin": "http://evil.example"}).status_code == 403
        assert c.get("/api/health", headers={**loop, "Origin": "null"}).status_code == 403
        assert c.get("/api/health", headers={**loop, "Origin": "http://127.0.0.1:8765"}).status_code == 200


def test_no_change_run_unwinds_the_checkpoint(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo, lm_override=DummyLM([{"change_set": {"rationale": "", "done": True, "changes": []}}]))
    head = wb.workspace.head()
    wb.workspace.write("calc/__init__.py", "def add(a, b):\n    return a - b\n")
    result = wb.improver.run("nothing to do", 1, job_id="t")
    assert result.status == "no_change"
    assert wb.workspace.head() == head
    assert "return a - b" in wb.workspace.read("calc/__init__.py")
    assert wb.workspace.is_dirty()


def test_settings_toggle_is_exposed_but_never_the_key():
    from selfwire.workbench.settings import WorkbenchSettings
    s = WorkbenchSettings(api_key="sk-hidden")
    pub = s.update(allow_unsafe_levers=True)
    assert pub["allow_unsafe_levers"] is True and "sk-hidden" not in str(pub)
    assert os.environ.get("SELFWIRE_ALLOW_UNSAFE_LEVERS", "") in ("", "0")
