"""The Tester (MCP-style) — audits builds, injects chaos, proposes patches.

Hard rule: a proposed patch is NEVER applied without explicit approval. The
approval gate is itself a SOC 2 control (CC8.1), and `run_chaos` verifies the
system catches an unapproved apply.
"""
from __future__ import annotations

from . import soc2
from .models import PatchProposal
from .store import Store


def run_audit(store: Store, build_id: str) -> dict:
    """Re-evaluate a build's checks + SOC 2 evidence; report findings."""
    build = store.get_build(build_id)
    if build is None:
        return {"error": "no such build"}
    checks = store.checks_for(build_id)
    ev = store.evidence_for(build_id)
    failing = [c.name for c in checks if not c.passed]
    not_met = [e.control for e in ev if e.status.value == "not_met"]
    return {"build": build_id, "status": build.status.value,
            "checks": len(checks), "failing_checks": failing,
            "soc2_ready": soc2.ready(ev), "soc2_not_met": not_met}


def run_chaos(store: Store, build_id: str) -> dict:
    """Deliberate error injection: simulate a patch applied WITHOUT approval and
    confirm the SOC 2 change-management control catches it."""
    bad = PatchProposal(build_id=build_id, reason="chaos: unapproved apply",
                        target="engine.py", status="applied", approved_by="")
    store.put_patch(bad)
    build = store.get_build(build_id)
    owner = None
    if build:
        proj = store.get_project(build.project_id)
        owner = proj.owner if proj else None
    ev = soc2.evaluate(build, store.checks_for(build_id), store.patches_for(build_id),
                       owner, True) if build else []
    caught = any(e.control == "CC8.1" and e.status.value == "not_met" for e in ev)
    # clean up the injected fault so it doesn't poison real evidence
    bad.status = "rejected"
    store.put_patch(bad)
    return {"injected": "unapproved-apply", "control_caught_it": caught,
            "control": "CC8.1", "verdict": "PASS" if caught else "FAIL — control missed it"}


def propose_patch(store: Store, build_id: str, reason: str, target: str, diff: str = "") -> dict:
    """Create a proposal. Status = proposed. Applies nothing."""
    p = PatchProposal(build_id=build_id, reason=reason, target=target, diff=diff)
    store.put_patch(p)
    return {"patch": p.id, "status": p.status, "note": "requires approval before apply"}


def approve_and_apply(store: Store, patch_id: str, approved_by: str) -> dict:
    """Apply ONLY with a non-empty approver. Without approval -> refused."""
    p = store.get_patch(patch_id)
    if p is None:
        return {"error": "no such patch"}
    if not approved_by:
        return {"error": "approval required", "status": p.status}
    p.status = "applied"
    p.approved_by = approved_by
    store.put_patch(p)
    return {"patch": p.id, "status": "applied", "approved_by": approved_by}
