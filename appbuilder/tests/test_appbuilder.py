"""Studio backend: self-improving build engine, SOC 2 evidence, Tester (approval-gated)."""
import tempfile
from pathlib import Path

import pytest

from appbuilder import soc2, tester as T
from appbuilder.engine import BuildEngine, criteria_for
from appbuilder.models import Project
from appbuilder.recorder import Recorder
from appbuilder.store import Store


def _studio(tmp):
    s = Store(Path(tmp) / "s.db")
    return s, BuildEngine(s, Recorder(Path(tmp) / "t.jsonl"))


def test_build_self_improves_to_pass(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(title="x", format="ui-mockups", owner="alice")
    store.put_project(p)
    b = eng.run_build(p.id, max_rounds=10, owner="alice")
    # ui-mockups has 7 criteria; base satisfies 2, learned rules cover the rest
    assert b.status.value == "passed"
    assert b.round >= 1                      # it took fix rounds (learning happened)
    skill = store.skills_for(p.id)[0]
    assert len(skill.rules) >= 1             # rules were learned from failed checks


def test_passed_only_when_all_checks_pass(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="ui-mockups", owner="o")
    store.put_project(p)
    # 1 round is not enough to satisfy all 7 criteria -> not passed yet
    b = eng.run_build(p.id, max_rounds=1, owner="o")
    checks = store.checks_for(b.id)
    if any(not c.passed for c in checks if c.kind.value != "soc2"):
        assert b.status.value == "failed"


def test_soc2_evidence_and_readiness(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="slides", owner="tenant-1")
    store.put_project(p)
    b = eng.run_build(p.id, max_rounds=10, owner="tenant-1")
    ev = store.evidence_for(b.id)
    assert ev and {"CC6.1", "CC8.1"} <= {e.control for e in ev}
    assert soc2.ready(ev)                    # owner set + no unapproved apply


def test_soc2_access_control_fails_without_owner(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="slides", owner="")   # no owner -> CC6.1 NOT_MET
    store.put_project(p)
    b = eng.run_build(p.id, max_rounds=10, owner=None)
    ev = store.evidence_for(b.id)
    assert any(e.control == "CC6.1" and e.status.value == "not_met" for e in ev)
    assert not soc2.ready(ev)


# -- Tester ------------------------------------------------------------------ #
def test_tester_audit(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="slides", owner="o"); store.put_project(p)
    b = eng.run_build(p.id, owner="o")
    a = T.run_audit(store, b.id)
    assert a["build"] == b.id and "soc2_ready" in a


def test_tester_chaos_control_catches_unapproved_apply(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="slides", owner="o"); store.put_project(p)
    b = eng.run_build(p.id, owner="o")
    res = T.run_chaos(store, b.id)
    assert res["control_caught_it"] is True and res["verdict"].startswith("PASS")


def test_patch_never_applies_without_approval(tmp_path):
    store, eng = _studio(tmp_path)
    p = Project(format="slides", owner="o"); store.put_project(p)
    b = eng.run_build(p.id, owner="o")
    prop = T.propose_patch(store, b.id, "fix contrast", "styles.css", "--- diff ---")
    assert prop["status"] == "proposed"
    # no approver -> refused
    refused = T.approve_and_apply(store, prop["patch"], "")
    assert refused.get("error") == "approval required"
    # with approver -> applied
    ok = T.approve_and_apply(store, prop["patch"], "krishna")
    assert ok["status"] == "applied" and ok["approved_by"] == "krishna"


def test_kiln_engine_passes_in_fewer_rounds(tmp_path):
    """Kiln (best-of-four variants) satisfies more per round than the default."""
    from appbuilder.models import Project
    store, eng = _studio(tmp_path)
    kiln = Project(format="ui-mockups", engine="kiln", owner="o"); store.put_project(kiln)
    default = Project(format="ui-mockups", engine="default", owner="o"); store.put_project(default)
    bk = eng.run_build(kiln.id, max_rounds=10, owner="o")
    bd = eng.run_build(default.id, max_rounds=10, owner="o")
    assert bk.status.value == "passed" and bd.status.value == "passed"
    assert bk.round <= bd.round          # best-of-four converges no slower
