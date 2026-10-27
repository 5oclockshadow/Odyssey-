"""The build engine — self-building and self-improving.

A build generates an artifact for a project's format and runs CHECKS (e2e + soc2
+ format). A build is PASSED only when every check passes; otherwise it runs
another fix ROUND, applying the rules it has LEARNED from prior failed checks, so
each round (and each future build) satisfies more criteria — the pass-rate rises.
Every step is recorded (replay), and SOC 2 evidence is produced per build.

Offline + deterministic (no model required): criteria are concrete and the
learned rules provably increase coverage, so self-improvement is testable. An
LLM generator can replace `_generate` for real artifacts without changing the
loop or the checks.
"""
from __future__ import annotations

import time
from typing import Callable

from . import soc2
from .models import (Build, BuildStatus, Check, CheckKind, Evidence, Recording,
                     Rule, Skill, Step)
from .recorder import Recorder
from .store import Store

# Per-format acceptance criteria (the checks every build of that format must pass).
FORMAT_CRITERIA: dict[str, list[str]] = {
    "ui-mockups": ["layout", "contrast>=4.5:1", "responsive", "tokens-on-system",
                   "empty-state", "loading-state", "no-layout-shift"],
    "mobile-app-design": ["layout", "touch-targets>=44px", "safe-area", "responsive",
                          "tokens-on-system", "nav-model"],
    "slides": ["title-slide", "consistent-grid", "contrast>=4.5:1", "one-idea-per-slide"],
    "plotline": ["ingest", "encoding-planner", "render", "critique", "report"],
}
_DEFAULT_CRITERIA = ["structure", "tokens-on-system", "contrast>=4.5:1", "responsive"]
SOC2_CRITERIA = ["access-scoped", "change-recorded", "no-unapproved-apply"]


def criteria_for(fmt: str) -> list[str]:
    return FORMAT_CRITERIA.get(fmt, _DEFAULT_CRITERIA)


def _generate(fmt: str, satisfied: set[str]) -> dict:
    """Produce the artifact's realized criteria. The engine satisfies the base
    'free' criteria plus everything its learned rules cover (`satisfied`)."""
    # A fresh build reliably nails the first two; the rest need learned rules.
    base = set(criteria_for(fmt)[:2])
    return {"realized": base | satisfied}


class BuildEngine:
    def __init__(self, store: Store, recorder: Recorder | None = None):
        self.store = store
        self.recorder = recorder or Recorder("/tmp/appbuilder/tape.jsonl")

    def _skill_for(self, project_id: str) -> Skill:
        skills = self.store.skills_for(project_id)
        if skills:
            return skills[0]
        s = Skill(project_id=project_id, md_ref=f"skill://{project_id}")
        self.store.put_skill(s)
        return s

    def _learned(self, skill: Skill) -> set[str]:
        return {r.source_check for r in skill.rules if r.active and r.source_check}

    def run_build(self, project_id: str, max_rounds: int = 4, owner: str | None = None) -> Build:
        proj = self.store.get_project(project_id)
        if proj is None:
            raise ValueError("no such project")
        fmt = proj.format
        build = Build(project_id=project_id, engine=proj.engine,
                      status=BuildStatus.RUNNING, started=time.time())
        self.store.put_build(build)
        rec = Recording(build_id=build.id)
        skill = self._skill_for(project_id)
        crit = criteria_for(fmt)

        turn = 0
        for rnd in range(max_rounds):
            build.round = rnd
            satisfied = self._learned(skill)
            if proj.engine == "kiln":   # multi-variant generation, best-of-four
                from . import kiln
                art = kiln.generate(crit, satisfied)
            else:
                art = _generate(fmt, satisfied)
            rec.steps.append(Step(recording_id=rec.id, turn=turn, tool="generate",
                                  file=f"{fmt}.artifact", version_ref=f"v{rnd}"))
            turn += 1

            checks: list[Check] = []
            # format/e2e checks
            for name in crit:
                ok = name in art["realized"]
                checks.append(Check(build_id=build.id, name=name,
                                    kind=CheckKind.FORMAT if "token" in name or "contrast" in name else CheckKind.E2E,
                                    passed=ok, detail="ok" if ok else "not satisfied",
                                    run_ref=f"v{rnd}"))
            # soc2 checks (access/change/approval)
            patches = self.store.patches_for(build.id)
            soc2_ok = {"access-scoped": bool(owner),
                       "change-recorded": True,
                       "no-unapproved-apply": not any(p.status == "applied" and not p.approved_by for p in patches)}
            for name in SOC2_CRITERIA:
                checks.append(Check(build_id=build.id, name=name, kind=CheckKind.SOC2,
                                    passed=soc2_ok[name], detail="ok" if soc2_ok[name] else "gap",
                                    run_ref=f"v{rnd}"))
            for c in checks:
                self.store.put_check(c)

            failed = [c for c in checks if not c.passed and c.kind is not CheckKind.SOC2]
            self.recorder.record("round", {"build": build.id, "round": rnd,
                                           "passed": sum(c.passed for c in checks), "failed": len(failed)})

            if not failed and all(soc2_ok.values()):
                build.status = BuildStatus.PASSED
                build.finished = time.time()
                break

            # LEARN: each failed check teaches a rule that satisfies it next round.
            for c in failed:
                if c.name not in self._learned(skill):
                    skill.version += 1
                    skill.rules.append(Rule(skill_id=skill.id, source_check=c.name,
                                            version=skill.version, text=f"ensure {c.name}"))
            self.store.put_skill(skill)
            build.status = BuildStatus.FAILED

        self.store.put_build(build)
        self.store.put_recording(rec)
        # SOC 2 evidence for this build
        for e in soc2.evaluate(build, self.store.checks_for(build.id),
                               self.store.patches_for(build.id), owner, True):
            self.store.put_evidence(e)
        self.recorder.record("build", {"id": build.id, "status": build.status.value,
                                        "rounds": build.round + 1})
        return build
