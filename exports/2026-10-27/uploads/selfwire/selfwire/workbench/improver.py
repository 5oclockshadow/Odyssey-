"""
improver.py — the test-gated self-improvement loop:

    checkpoint -> baseline tests + audit -> [plan -> moat pre-check -> apply
    -> full tests + audit -> moat verdict -> commit | rollback] x attempts

The plan step is one DSPy program — a single `ProposeChange` signature, one
InputField (`brief`), one OutputField (`change_set`, a Pydantic model) —
matching the 1-in/1-out shape the rest of selfwire uses. The brief carries
the goal, the moat rules, the baseline, the audit, the relevant files'
contents, and the exact failures of every earlier attempt, so each retry
learns from what the gate rejected.

Safety properties (each covered by tests):
  * uncommitted work is checkpointed first, so a rollback never loses it —
    and when the run ends without a commit, the checkpoint is unwound so that
    untested work goes back to being uncommitted instead of staying committed;
  * every rejected attempt is rolled back to that checkpoint before the next;
  * any unexpected exception after files were touched rolls back too;
  * only a change the moat accepts is committed, and only then.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal, Optional

import dspy
from pydantic import BaseModel, Field

from . import moat
from .workspace import WorkspaceError

if TYPE_CHECKING:
    from .auditor import AuditReport
    from .core import Workbench
    from .tester import TestReport

MAX_FILE_CHARS = 40_000
MAX_BRIEF_FILE_CHARS = 120_000


class FileChange(BaseModel):
    op: Literal["write", "replace", "delete"] = Field(description="write = full new content; replace = swap one exact snippet; delete = remove file")
    path: str = Field(description="workspace-relative path, e.g. selfwire/workbench/tester.py")
    content: Optional[str] = Field(default=None, description="full file content (op=write)")
    old: Optional[str] = Field(default=None, description="exact existing text, must occur exactly once (op=replace)")
    new: Optional[str] = Field(default=None, description="replacement text (op=replace)")


class ChangeSet(BaseModel):
    rationale: str = Field(default="", description="why this change achieves the goal and keeps tests green")
    done: bool = Field(default=False, description="true only if the goal is already met and no change is needed")
    changes: list[FileChange] = Field(default_factory=list)


class ProposeChange(dspy.Signature):
    """You are SelfWire improving your own codebase behind a strict test gate.
    Read the brief (goal, moat rules, baseline, audit, file contents, and the
    failures of earlier attempts) and return ONE change set. Keep every
    existing test passing; never delete, skip, or weaken tests; add tests for
    new behaviour. Prefer small `replace` edits whose `old` text matches the
    file exactly once; use `write` with the complete file for new files or
    rewrites. Set done=true with no changes only if the goal is already met."""

    brief: str = dspy.InputField(desc="goal, moat rules, baseline test/audit state, relevant file contents, prior attempt failures")
    change_set: ChangeSet = dspy.OutputField(desc="the single change set to apply this attempt")


class AttemptRecord(BaseModel):
    n: int
    rationale: str = ""
    changes: list[dict] = Field(default_factory=list)
    test: Optional[dict] = None
    audit_score: Optional[int] = None
    outcome: Literal["committed", "rolled_back", "rejected", "no_change", "error"]
    reason: str = ""


class ImproveResult(BaseModel):
    status: Literal["committed", "rolled_back", "no_change", "failed", "cancelled"]
    goal: str
    commit_sha: Optional[str] = None
    base_sha: Optional[str] = None
    baseline: dict = Field(default_factory=dict)
    attempts: list[AttemptRecord] = Field(default_factory=list)
    report_path: Optional[str] = None


@dataclass
class _RunState:
    """Everything one improvement run carries between attempts."""

    goal: str
    lm: Any
    job_id: str
    cancel_event: Optional[threading.Event]
    base_sha: str
    baseline: "TestReport"
    base_audit: "AuditReport"
    result: ImproveResult
    base_assertions: Optional[int] = None
    feedback: list[str] = field(default_factory=list)
    touched: set[str] = field(default_factory=set)

    def cancelled(self) -> bool:
        return self.cancel_event is not None and self.cancel_event.is_set()


class ImprovementLoop:
    def __init__(self, wb: "Workbench") -> None:
        self.wb = wb
        self.propose = dspy.Predict(ProposeChange)

    def _emit(self, job_id: str, attempt: int, phase: str, message: str, data: Optional[dict] = None) -> None:
        self.wb.bus.publish("improve", {"job_id": job_id, "attempt": attempt, "phase": phase,
                                        "message": message, "data": data or {}})

    # -- brief ----------------------------------------------------------------------
    def _relevant_paths(self, goal: str, audit: "AuditReport", baseline: "TestReport", touched: set[str]) -> list[str]:
        all_paths = [f.path for f in self.wb.workspace.list_files()]
        chosen: list[str] = []

        def add(path: Optional[str]) -> None:
            if path and path in all_paths and path not in chosen:
                chosen.append(path)

        for path in sorted(touched):
            add(path)
        lowered = goal.lower()
        for path in all_paths:
            name = path.rsplit("/", 1)[-1].lower()
            stem = name.rsplit(".", 1)[0]
            if path.lower() in lowered or name in lowered or (len(stem) > 3 and re.search(rf"\b{re.escape(stem)}\b", lowered)):
                add(path)
        for failure in baseline.failures:
            add(failure.nodeid.split("::", 1)[0])
        for item in audit.plan[:5]:
            for path in item.paths:
                add(path)
        if not chosen:
            add("README.md")
        return chosen

    def _brief(self, goal: str, baseline: "TestReport", audit: "AuditReport", feedback: list[str], touched: set[str]) -> str:
        sections = [
            f"GOAL:\n{goal}",
            self.wb.policy.describe(),
            f"BASELINE TESTS: {baseline.summary()}",
            "AUDIT (score {}):\n{}".format(
                audit.score,
                "\n".join(f"  [{f.severity}] {f.rule} {f.path or ''}:{f.line or ''} {f.message}" for f in audit.findings[:15]) or "  (no findings)",
            ),
            "FILE TREE:\n" + "\n".join(f"  {f.path}" for f in self.wb.workspace.list_files()[:400]),
            self.wb.skills.context_block(),
        ]
        budget = MAX_BRIEF_FILE_CHARS
        file_blocks = []
        for path in self._relevant_paths(goal, audit, baseline, touched):
            if budget <= 0:
                break
            try:
                content = self.wb.workspace.read(path)
            except (OSError, WorkspaceError):
                continue
            clipped = content[: min(MAX_FILE_CHARS, budget)]
            budget -= len(clipped)
            note = "" if len(clipped) == len(content) else f"\n... [truncated, {len(content)} chars total]"
            file_blocks.append(f"=== {path} ===\n{clipped}{note}")
        sections.append("RELEVANT FILES:\n" + ("\n\n".join(file_blocks) or "(none)"))
        if feedback:
            sections.append("EARLIER ATTEMPTS (all rolled back — do not repeat these mistakes):\n" + "\n\n".join(feedback))
        return "\n\n".join(sections)

    # -- apply ----------------------------------------------------------------------
    def _apply(self, change_set: ChangeSet) -> None:
        ws = self.wb.workspace
        for change in change_set.changes:
            if change.op == "write":
                ws.write(change.path, change.content or "")
            elif change.op == "replace":
                ws.replace_text(change.path, change.old or "", change.new or "")
            elif change.op == "delete":
                ws.delete(change.path)

    @staticmethod
    def _failure_feedback(n: int, reasons: list[str], report: Optional["TestReport"]) -> str:
        lines = [f"attempt {n} rejected: " + "; ".join(reasons)]
        if report is not None:
            for failure in report.failures[:6]:
                lines.append(f"  FAILED {failure.nodeid}: {failure.message[:300]}")
                if failure.text:
                    lines.append("    " + failure.text[-1200:].replace("\n", "\n    "))
            if not report.failures and report.output_tail:
                lines.append("  pytest output tail:\n    " + "\n    ".join(report.output_tail.splitlines()[-40:]))
        return "\n".join(lines)

    # -- loop -------------------------------------------------------------------------
    def run(self, goal: str, max_attempts: int = 3, *, job_id: str = "improve", cancel_event=None) -> ImproveResult:
        goal = (goal or "").strip()
        if not goal:
            raise ValueError("improvement goal is empty")
        max_attempts = max(1, min(int(max_attempts), 10))
        lm = self.wb.settings.build_lm()
        ws = self.wb.workspace
        telemetry = self.wb.telemetry
        run_id = telemetry.new_run_id()
        telemetry.pre_task(run_id=run_id, task=goal, strategic_choices={
            "kind": "improve", "max_attempts": max_attempts, "policy": self.wb.policy.model_dump(mode="json"),
        })

        self._emit(job_id, 0, "audit", "checkpointing and measuring the baseline")
        original_head = ws.head()
        was_dirty = ws.is_dirty()
        base_sha = ws.checkpoint(f"before improve: {goal[:60]}")
        try:
            result = self._run_from_checkpoint(goal, max_attempts, lm, job_id, cancel_event, base_sha)
        except BaseException:
            self._unwind(original_head, was_dirty, "failed")
            raise
        self._unwind(original_head, was_dirty, result.status)
        return self._finish(job_id, run_id, result)

    def _unwind(self, original_head: Optional[str], was_dirty: bool, status: str) -> None:
        if was_dirty and status != "committed" and original_head:
            self.wb.workspace.unwind_checkpoint(original_head)

    def _run_from_checkpoint(self, goal: str, max_attempts: int, lm: Any, job_id: str, cancel_event, base_sha: str) -> ImproveResult:
        ws = self.wb.workspace

        def cancelled() -> bool:
            return cancel_event is not None and cancel_event.is_set()

        baseline = self.wb.run_tests(job_id=job_id, cancel_event=cancel_event)
        result = ImproveResult(status="rolled_back", goal=goal, base_sha=base_sha, baseline=baseline.summary())
        if cancelled():
            result.status = "cancelled"
            return result
        base_audit = self.wb.run_audit()
        self._emit(job_id, 0, "audit", f"baseline: {baseline.passed}/{baseline.total} passing, audit score {base_audit.score}",
                   {"baseline": baseline.summary(), "audit_score": base_audit.score})

        state = _RunState(goal=goal, lm=lm, job_id=job_id, cancel_event=cancel_event, base_sha=base_sha,
                          baseline=baseline, base_audit=base_audit, result=result,
                          base_assertions=moat.count_assertions(ws, self.wb.policy.tests_dir))
        for n in range(1, max_attempts + 1):
            if state.cancelled():
                result.status = "cancelled"
                break
            if self._attempt(state, n):
                break
        return result

    # -- one attempt -------------------------------------------------------------------
    def _attempt(self, st: "_RunState", n: int) -> bool:
        """Plan, pre-check, apply, verify, then commit or roll back. Returns
        True when the loop should stop (committed, no change, cancelled)."""
        self._emit(st.job_id, n, "plan", "asking the model for a change set")
        try:
            with dspy.context(lm=st.lm):
                pred = self.propose(brief=self._brief(st.goal, st.baseline, st.base_audit, st.feedback, st.touched))
            change_set: ChangeSet = pred.change_set
        except Exception as e:  # LM transport/parse failure: record it and try again
            st.result.attempts.append(AttemptRecord(n=n, outcome="error", reason=f"planning failed: {type(e).__name__}: {e}"))
            st.feedback.append(f"attempt {n}: your output could not be used ({type(e).__name__}: {str(e)[:300]})")
            self._emit(st.job_id, n, "error", f"planning failed: {e}")
            return False

        summary = [{"op": c.op, "path": c.path} for c in change_set.changes]
        if change_set.done and not change_set.changes:
            st.result.attempts.append(AttemptRecord(n=n, rationale=change_set.rationale, outcome="no_change",
                                                    reason="model reports the goal is already met"))
            st.result.status = "no_change"
            self._emit(st.job_id, n, "done", "model reports the goal is already met; nothing changed")
            return True

        pre = moat.check_changeset(self.wb.policy, change_set.changes, self.wb.workspace)
        if not pre.accepted:
            st.result.attempts.append(AttemptRecord(n=n, rationale=change_set.rationale, changes=summary,
                                                    outcome="rejected", reason="; ".join(pre.reasons)))
            st.feedback.append(self._failure_feedback(n, pre.reasons, None))
            self._emit(st.job_id, n, "rollback", "rejected before applying: " + "; ".join(pre.reasons), {"reasons": pre.reasons})
            return False

        self._emit(st.job_id, n, "apply", f"applying {len(summary)} change(s)", {"changes": summary})
        try:
            self._apply(change_set)
            st.touched.update(c.path for c in change_set.changes if c.op != "delete")
        except (WorkspaceError, OSError, ValueError) as e:
            self.wb.workspace.rollback(st.base_sha)
            reason = f"apply failed: {e}"
            st.result.attempts.append(AttemptRecord(n=n, rationale=change_set.rationale, changes=summary,
                                                    outcome="rolled_back", reason=reason))
            st.feedback.append(self._failure_feedback(n, [reason], None))
            self._emit(st.job_id, n, "rollback", reason)
            return False
        return self._verify_and_settle(st, n, change_set, summary)

    def _verify_and_settle(self, st: "_RunState", n: int, change_set: ChangeSet, summary: list[dict]) -> bool:
        ws = self.wb.workspace
        try:
            self._emit(st.job_id, n, "test", "running the full suite on the change")
            candidate = self.wb.run_tests(job_id=st.job_id, cancel_event=st.cancel_event)
            if st.cancelled():
                ws.rollback(st.base_sha)
                st.result.status = "cancelled"
                return True
            cand_audit = self.wb.run_audit()
            verdict = moat.evaluate(self.wb.policy, st.baseline, candidate, st.base_audit, cand_audit,
                                    st.base_assertions, moat.count_assertions(ws, self.wb.policy.tests_dir))
        except BaseException:
            ws.rollback(st.base_sha)  # never leave an unverified change on disk
            raise

        record = AttemptRecord(n=n, rationale=change_set.rationale, changes=summary,
                               test=candidate.summary(), audit_score=cand_audit.score, outcome="rolled_back")
        if verdict.accepted:
            first_line = st.goal.splitlines()[0][:60]
            sha = ws.commit(f"improve: {first_line} (attempt {n})\n\n{change_set.rationale[:800]}")
            record.outcome = "committed"
            record.reason = f"moat accepted: {candidate.passed}/{candidate.total} passing, audit {cand_audit.score}"
            st.result.attempts.append(record)
            st.result.status = "committed"
            st.result.commit_sha = sha
            self._emit(st.job_id, n, "commit", f"committed {sha[:10]}", {"sha": sha, "test": candidate.summary()})
            return True

        ws.rollback(st.base_sha)
        record.reason = "; ".join(verdict.reasons)
        st.result.attempts.append(record)
        st.feedback.append(self._failure_feedback(n, verdict.reasons, candidate))
        self._emit(st.job_id, n, "rollback", "rolled back: " + record.reason, {"reasons": verdict.reasons, "test": candidate.summary()})
        return False

    def _finish(self, job_id: str, run_id: str, result: ImproveResult) -> ImproveResult:
        reporter = self.wb.reporter
        summary = f"improve [{result.status}] {result.goal[:120]} — {len(result.attempts)} attempt(s)"
        try:
            path = reporter.write_context_report(run_id=run_id, summary=summary, state=result.model_dump(mode="json"))
            result.report_path = str(path)
            reporter.append_log(f"improve {run_id}", summary)
        except OSError:
            result.report_path = None
        self.wb.telemetry.post_task(
            run_id=run_id, task=result.goal,
            state_transitions=[a.model_dump(mode="json") for a in result.attempts],
            analytical_weights={"attempts": len(result.attempts)},
            result={"status": result.status, "commit_sha": result.commit_sha},
        )
        self._emit(job_id, len(result.attempts), "done", f"finished: {result.status}", result.model_dump(mode="json"))
        return result
