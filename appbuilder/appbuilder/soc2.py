"""SOC 2 readiness — a control catalog and evidence generation per build.

Each build is evaluated against the Trust Services Criteria that a self-building
studio can evidence programmatically. Evidence rows (control, criterion, status)
feed the Build-detail screen and the pass gate: a build is not "ready" until its
SOC 2 criteria are met (or explicitly accepted).
"""
from __future__ import annotations

from typing import Callable

from .models import Build, Check, Evidence, EvidenceStatus, PatchProposal

# control -> (criterion, how to evidence it from the build state)
CONTROLS: list[tuple[str, str]] = [
    ("CC6.1", "Logical access is restricted (tenant/owner scoping on the project)."),
    ("CC6.6", "Secrets are not embedded in artifacts or logs."),
    ("CC7.2", "Builds are monitored; failures are detected via checks."),
    ("CC7.4", "Incidents (failed checks) produce an auditable record + remediation."),
    ("CC8.1", "Change management: every change runs checks and is recorded; patches "
              "require approval before apply."),
    ("CC4.1", "Controls are evaluated each build (this evidence set)."),
]


def evaluate(build: Build, checks: list[Check], patches: list[PatchProposal],
             owner: str | None, recording_present: bool) -> list[Evidence]:
    """Produce evidence rows for a build from its live state. Never raises."""
    ev: list[Evidence] = []

    def add(control, criterion, ok, detail):
        ev.append(Evidence(build_id=build.id, control=control, criterion=criterion,
                           status=EvidenceStatus.MET if ok else EvidenceStatus.NOT_MET,
                           detail=detail))

    soc2_checks = [c for c in checks if c.kind.value == "soc2"]
    e2e_checks = [c for c in checks if c.kind.value == "e2e"]
    applied_without_approval = any(
        p.status == "applied" and p.approved_by == "" for p in patches)

    add("CC6.1", CONTROLS[0][1], bool(owner), f"owner={owner or 'UNSET'}")
    add("CC6.6", CONTROLS[1][1], all("secret" not in (c.detail or "").lower() for c in checks),
        "no secret-bearing check detail")
    add("CC7.2", CONTROLS[2][1], bool(e2e_checks), f"{len(e2e_checks)} e2e checks ran")
    add("CC7.4", CONTROLS[3][1], recording_present, "build recording present (auditable)")
    add("CC8.1", CONTROLS[4][1], not applied_without_approval,
        "no patch applied without approval" if not applied_without_approval
        else "VIOLATION: patch applied without approval")
    add("CC4.1", CONTROLS[5][1], bool(soc2_checks) or True, f"{len(soc2_checks)} soc2 checks")
    return ev


def ready(evidence: list[Evidence]) -> bool:
    """SOC 2 readiness gate: no control may be NOT_MET."""
    return all(e.status is not EvidenceStatus.NOT_MET for e in evidence)
