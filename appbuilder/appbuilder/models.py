"""Ability-Based App Builder (Skilld Studio) — typed domain contracts.

Mirrors the product data model exactly: project / build / check / recording →
step / skill → rule / evidence (SOC 2) / job → job_result. Check-&-Capture at
every boundary; nothing downstream trusts a raw payload.
"""
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now() -> float:
    return time.time()


# -- enums ------------------------------------------------------------------- #
# The 14 buildable formats (the design skill library).
FORMATS = ("mobile-app-design", "ui-mockups", "wireframe", "slides", "document",
           "diagram", "animation", "3d-object", "color-type-pairing", "html-email",
           "resume", "flier", "research", "plotline")


class BuildStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PASSED = "passed"      # done ONLY when all checks pass
    FAILED = "failed"


class CheckKind(str, Enum):
    E2E = "e2e"
    SOC2 = "soc2"
    FORMAT = "format"      # formatting/adherence review


class JobKind(str, Enum):
    BATCH = "batch"
    ACADEMY = "academy"    # 130-round curriculum pass-rate run


class EvidenceStatus(str, Enum):
    MET = "met"
    PARTIAL = "partial"
    NOT_MET = "not_met"


# -- entities ---------------------------------------------------------------- #
class Project(BaseModel):
    id: str = Field(default_factory=lambda: _id("proj"))
    owner: str = ""                 # tenant/owner (SaaS)
    title: str = "Untitled"
    format: str = "ui-mockups"
    engine: str = "default"
    created: float = Field(default_factory=_now)
    updated: float = Field(default_factory=_now)


class Build(BaseModel):
    id: str = Field(default_factory=lambda: _id("build"))
    project_id: str
    engine: str = "default"
    status: BuildStatus = BuildStatus.QUEUED
    round: int = 0                  # fix-round index
    started: float | None = None
    finished: float | None = None   # set only when status == PASSED (all checks pass)


class Check(BaseModel):
    id: str = Field(default_factory=lambda: _id("check"))
    build_id: str
    name: str
    kind: CheckKind = CheckKind.E2E
    passed: bool = False
    detail: str = ""
    run_ref: str = ""               # pointer to the run that produced it


class Step(BaseModel):
    id: str = Field(default_factory=lambda: _id("step"))
    recording_id: str
    ts: float = Field(default_factory=_now)
    turn: int = 0
    tool: str = ""
    file: str = ""
    version_ref: str = ""           # artifact version at this step (replay scrub)


class Recording(BaseModel):
    id: str = Field(default_factory=lambda: _id("rec"))
    build_id: str
    steps: list[Step] = Field(default_factory=list)


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: _id("rule"))
    skill_id: str
    source_check: str = ""          # the check whose failure taught this rule
    version: int = 1
    active: bool = True
    text: str = ""


class Skill(BaseModel):
    id: str = Field(default_factory=lambda: _id("skill"))
    project_id: str
    version: int = 1
    md_ref: str = ""                # pointer to the SKILL.md content
    rules: list[Rule] = Field(default_factory=list)


class Evidence(BaseModel):
    """SOC 2 readiness: one control criterion's status for a build."""
    id: str = Field(default_factory=lambda: _id("ev"))
    build_id: str
    control: str                    # e.g. CC6.1
    criterion: str
    status: EvidenceStatus = EvidenceStatus.NOT_MET
    detail: str = ""


class JobResult(BaseModel):
    id: str = Field(default_factory=lambda: _id("jr"))
    template: str = ""
    engine: str = "default"
    first_pass: float = 0.0         # pass-rate on the first attempt
    final_pass: float = 0.0         # pass-rate after fix rounds


class Job(BaseModel):
    id: str = Field(default_factory=lambda: _id("job"))
    kind: JobKind = JobKind.BATCH
    status: str = "queued"
    schedule: str = ""              # cron-ish; "" = on demand
    results: list[JobResult] = Field(default_factory=list)


class PatchProposal(BaseModel):
    """A Tester-proposed fix. NEVER applied without explicit approval."""
    id: str = Field(default_factory=lambda: _id("patch"))
    build_id: str
    reason: str
    target: str                     # file/skill/rule the patch touches
    diff: str = ""
    status: str = "proposed"        # proposed | approved | applied | rejected
    approved_by: str = ""
    created: float = Field(default_factory=_now)
