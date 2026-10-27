"""
agent_tools.py — the workbench's capabilities, exposed to the SelfWire agent
as ordinary registry tools (source "workbench"), so the same dual-brain loop
that writes tools with `exec` and attaches MCP servers can also read, edit,
test, audit, commit, and roll back its own codebase from the chat.

Guards:
  * every mutating tool refuses while an improvement job owns the tree;
  * `git_commit` refuses unless the most recent *full* test run passed and
    started after the latest edit — the agent cannot commit red or untested
    code from chat (a human committing from the dashboard is not gated);
  * paths go through Workspace.resolve, so protected/off-limits rules hold;
  * the test harness (MoatPolicy.is_harness: the gate's own modules, every
    conftest.py, pytest config) is read-only to the agent, and writes whose
    added lines contain gaming constructs (moat.scan_for_gaming) are refused.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from . import moat

if TYPE_CHECKING:
    from .core import Workbench

MAX_READ_CHARS = 60_000


class ToolRefused(RuntimeError):
    pass


class WorkbenchToolkit:
    def __init__(self, wb: "Workbench") -> None:
        self.wb = wb

    def _guard_mutation(self, *paths: str) -> None:
        if self.wb.jobs.kind_busy("improve"):
            raise ToolRefused("an improvement job owns the workspace right now; wait for it to finish")
        for path in paths:
            norm = self.wb.workspace.normalize(path)
            if self.wb.policy.is_harness(norm):
                raise ToolRefused(f"{norm} is part of the test harness; only a human can change it (ask them to edit it in the dashboard)")

    def _guard_content(self, path: str, old: str, new: str) -> None:
        reasons = moat.scan_for_gaming(self.wb.workspace.normalize(path), moat.added_text(old, new), self.wb.policy.tests_dir)
        if reasons:
            raise ToolRefused("refused: " + "; ".join(reasons))

    def tools(self) -> list:
        return [
            self.list_files, self.read_file, self.write_file, self.replace_in_file, self.delete_file,
            self.move_file, self.run_tests, self.audit_codebase, self.git_status, self.git_diff,
            self.git_log, self.git_commit, self.rollback_to, self.start_improvement,
            self.list_skills, self.read_skill, self.write_skill,
        ]

    def register_into(self, registry) -> list[str]:
        names = []
        for fn in self.tools():
            registry.register(fn, source="workbench", overwrite=True)
            names.append(fn.__name__)
        return names

    # -- files ------------------------------------------------------------------
    def list_files(self, prefix: str = "") -> list[str]:
        """List workspace file paths (repo-relative). Optional `prefix` filters, e.g. prefix='selfwire/workbench/'."""
        return [f.path for f in self.wb.workspace.list_files() if f.path.startswith(prefix or "")][:1000]

    def read_file(self, path: str, start_line: int = 1, end_line: int = 0) -> str:
        """Read a text file; each line is prefixed 'N| '. end_line=0 reads to the end. Use ranges for big files."""
        lines = self.wb.workspace.read(path).splitlines()
        start = max(1, int(start_line))
        end = len(lines) if not end_line or int(end_line) <= 0 else min(len(lines), int(end_line))
        body = "\n".join(f"{i}| {lines[i - 1]}" for i in range(start, end + 1))
        if len(body) > MAX_READ_CHARS:
            body = body[:MAX_READ_CHARS] + f"\n... [truncated; request a smaller line range, file has {len(lines)} lines]"
        return f"{path} (lines {start}-{end} of {len(lines)})\n{body}"

    def write_file(self, path: str, content: str) -> str:
        """Create or fully overwrite a file with `content`. Live immediately; run_tests afterwards."""
        self._guard_mutation(path)
        previous = self.wb.workspace.read(path) if self.wb.workspace.exists(path) else ""
        self._guard_content(path, previous, content)
        info = self.wb.workspace.write(path, content)
        return f"wrote {info.path} ({info.size} bytes)"

    def replace_in_file(self, path: str, old: str, new: str) -> str:
        """Replace exactly one occurrence of `old` with `new` (fails if `old` matches 0 or 2+ times)."""
        self._guard_mutation(path)
        self._guard_content(path, old, new)
        info = self.wb.workspace.replace_text(path, old, new)
        return f"edited {info.path} ({info.size} bytes)"

    def delete_file(self, path: str) -> str:
        """Delete a file from the workspace."""
        self._guard_mutation(path)
        return f"deleted {self.wb.workspace.delete(path)}"

    def move_file(self, src: str, dst: str) -> str:
        """Move/rename a file inside the workspace."""
        self._guard_mutation(src, dst)
        a, b = self.wb.workspace.move(src, dst)
        return f"moved {a} -> {b}"

    # -- verify -------------------------------------------------------------------
    def run_tests(self, selector: str = "", keyword: str = "") -> dict:
        """Run pytest. Optional `selector` (path or node id, e.g. tests/test_registry.py) and `keyword` (-k expr). Returns counts + first failures."""
        report = self.wb.run_tests_inline(selector or None, keyword or None)
        return {
            **report.summary(),
            "failures": [{"nodeid": f.nodeid, "message": f.message[:400]} for f in report.failures[:8]],
            "full_run": report.full_run,
            "output_tail": "\n".join(report.output_tail.splitlines()[-25:]) if not report.ok else "",
        }

    def audit_codebase(self) -> dict:
        """Static audit: score 0-100, top findings, and an ordered improvement plan."""
        audit = self.wb.run_audit()
        return {
            "score": audit.score,
            "counts": audit.counts(),
            "findings": [f.model_dump() for f in audit.findings[:15]],
            "plan": [p.model_dump() for p in audit.plan],
        }

    # -- git ----------------------------------------------------------------------------
    def git_status(self) -> dict:
        """Branch, HEAD, and uncommitted changes."""
        return self.wb.workspace.status().model_dump()

    def git_diff(self) -> str:
        """Unified diff of uncommitted changes (including new untracked files)."""
        return self.wb.workspace.diff()[:30_000] or "(no uncommitted changes)"

    def git_log(self, limit: int = 10) -> list[dict]:
        """Recent commits (sha, message, date, tags)."""
        return [c.model_dump() for c in self.wb.workspace.log(limit)]

    def git_commit(self, message: str) -> str:
        """Commit all changes. Refused unless the latest FULL test run passed and ran after your last edit — call run_tests() first."""
        self._guard_mutation()
        report = self.wb.last_test_report
        if report is None or not report.full_run:
            raise ToolRefused("commit refused: run the full suite first (run_tests() with no selector/keyword)")
        if not report.ok:
            raise ToolRefused(f"commit refused: last full test run failed ({report.failed} failed, {report.errors} errors)")
        if report.mutation_count != self.wb.workspace.mutation_count:
            raise ToolRefused("commit refused: files changed since the last full test run; run_tests() again")
        sha = self.wb.workspace.commit(message)
        return f"committed {sha[:10]}"

    def rollback_to(self, sha: str) -> str:
        """Hard-reset the workspace to commit `sha` (discards uncommitted changes)."""
        self._guard_mutation()
        return f"rolled back to {self.wb.workspace.rollback(sha)[:10]}"

    def start_improvement(self, goal: str, max_attempts: int = 3) -> str:
        """Start the test-gated self-improvement loop as a background job; changes are kept only if the moat accepts them."""
        job = self.wb.start_improve_job(goal, max_attempts)
        return f"started improvement job {job.id}; progress streams to the Improve panel"

    # -- skills --------------------------------------------------------------------------
    def list_skills(self) -> list[dict]:
        """Skills available to you (name + description)."""
        return [s.model_dump(exclude={"content"}) for s in self.wb.skills.list()]

    def read_skill(self, name: str) -> str:
        """Full content of one skill's SKILL.md."""
        return self.wb.skills.get(name).content or ""

    def write_skill(self, name: str, content: Optional[str] = None) -> str:
        """Create or replace a skill (markdown with name/description frontmatter)."""
        self._guard_mutation()
        skill = self.wb.skills.put(name, content or "")
        return f"saved skill {skill.name} at {skill.path}"
