"""
moat.py — the rules that decide whether a self-made change is allowed to
stay. This file is a *protected path*: the workbench refuses to write or
delete it, so the agent cannot loosen its own gate. Edit it by hand.

A change set is checked twice:

1. Before it touches disk (`check_changeset`): bounded size, no protected
   paths, no test-harness paths, no deleting test files, every path inside
   the workspace, and no *gaming constructs* in the lines it adds
   (`scan_for_gaming`: os._exit, JUnit-report access, pytest_plugins, pytest
   hooks outside conftest, pytest env options, pytest internals, .git or
   interpreter-startup files, sys.argv in tests).
2. After the full suite runs on it (`evaluate`), against the baseline taken
   before the change:
     * a green baseline must stay green;
     * a red baseline must get strictly *less* red;
     * the number of collected tests may not drop;
     * the number of passing tests may not drop;
     * the number of skipped tests may not rise (no skipping your way green);
     * the run must not have timed out or been cancelled;
     * the run's JUnit counts must agree with pytest's own summary, and it
       must not have modified .git hooks/config or interpreter startup files
       (`TestReport.integrity_problems` / `.tampered`);
     * the audit's count of high-severity findings may not rise;
     * the number of assertions under tests/ may not drop (no hollowing a
       test out to `pass` so broken code goes green).

The *test harness* — the whole `selfwire/workbench/` package except its UI,
every conftest.py, and pytest's configuration files — is read-only to the
agent and the improvement loop.
Without that, a change could add a conftest hook that reports failures as
passes, deselect tests via pytest config, or rewrite the runner itself, and
satisfy every rule above while proving nothing. A human can still edit these
files from the dashboard; the moat guards against the agent, not against you.

Threat model, stated plainly: the moat stops a model from *drifting into*
reward hacking or committing broken code. It is not a sandbox. The test suite
executes code the agent wrote, as your user; determined, obfuscated code can
still do anything your user can. For hard isolation, run the workbench in
its container (docker-compose.yml).

Anything that fails a rule is rolled back to the checkpoint taken before the
change, and the reasons are fed into the next attempt.
"""

from __future__ import annotations

import ast
import re
from typing import TYPE_CHECKING, Iterable, Optional

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .auditor import AuditReport
    from .tester import TestReport
    from .workspace import Workspace


DEFAULT_HARNESS_PATHS: tuple[str, ...] = (
    "selfwire/workbench",  # the gate's own code: runner, auditor, loop, moat, server, tools
    "pytest.ini",
    ".pytest.ini",
    "pytest.toml",
    ".pytest.toml",
    "pyproject.toml",
    "setup.cfg",
    "tox.ini",
)
# the dashboard is agent-editable by design; server.py serves agent edits of it
# only from /preview (no API access) until a human restarts the server
DEFAULT_HARNESS_EXEMPT: tuple[str, ...] = ("selfwire/workbench/ui",)

# (pattern, why, applies_to_tests_only)
_GAMING_PATTERNS: tuple[tuple[re.Pattern, str, bool], ...] = (
    (re.compile(r"\b_exit\s*\("), "calls os._exit, which skips pytest's own reporting", False),
    (re.compile(r"junit", re.IGNORECASE), "touches pytest's JUnit report", False),
    (re.compile(r"\bpytest_plugins\b"), "declares pytest_plugins", False),
    (re.compile(r"^\s*(?:async\s+)?def\s+pytest_\w+\s*\(", re.MULTILINE), "defines a pytest hook outside conftest.py", False),
    (re.compile(r"PYTEST_(?:ADDOPTS|PLUGINS|DISABLE_PLUGIN_AUTOLOAD)"), "sets pytest's environment options", False),
    (re.compile(r"\b(?:from|import)\s+_pytest\b"), "imports pytest internals", False),
    (re.compile(r"\.git[/\\'\"]|hookspath", re.IGNORECASE), "touches git internals", False),
    (re.compile(r"\.pth\b|site-packages|sitecustomize|usercustomize"), "touches interpreter startup files", False),
    (re.compile(r"\bsys\s*\.\s*argv\b"), "reads the test runner's command line", True),
)


def added_text(old: str, new: str) -> str:
    """Lines present in `new` that are not in `old` (multiset difference),
    so pre-existing code never trips the scanner — only what a change adds."""
    remaining: dict[str, int] = {}
    for line in old.splitlines():
        remaining[line] = remaining.get(line, 0) + 1
    out = []
    for line in new.splitlines():
        if remaining.get(line, 0) > 0:
            remaining[line] -= 1
        else:
            out.append(line)
    return "\n".join(out)


def scan_for_gaming(path: str, added: str, tests_dir: str = "tests") -> list[str]:
    """Reasons the added code looks like it is gaming the test gate rather
    than changing behaviour. Only .py files are scanned (other files cannot
    run during a test session); any .pth file is refused outright."""
    lowered = path.casefold()
    if lowered.endswith(".pth"):
        return [f"{path}: .pth files run code at interpreter startup"]
    if not lowered.endswith(".py"):
        return []
    in_tests = lowered.startswith(tests_dir.casefold().rstrip("/") + "/")
    reasons = []
    for pattern, why, tests_only in _GAMING_PATTERNS:
        if tests_only and not in_tests:
            continue
        if pattern.search(added):
            reasons.append(f"{path}: added code {why}")
    return reasons


class MoatPolicy(BaseModel):
    require_green: bool = True
    forbid_test_count_drop: bool = True
    forbid_passing_drop: bool = True
    forbid_skip_increase: bool = True
    forbid_high_findings_increase: bool = True
    forbid_test_deletion: bool = True
    tests_dir: str = "tests"
    max_files_per_change: int = 25
    max_bytes_per_file: int = 400_000
    forbid_assertion_drop: bool = True
    forbid_gaming_constructs: bool = True
    protected_paths: tuple[str, ...] = ("selfwire/workbench/moat.py",)
    harness_paths: tuple[str, ...] = DEFAULT_HARNESS_PATHS
    harness_exempt: tuple[str, ...] = DEFAULT_HARNESS_EXEMPT
    harness_basenames: tuple[str, ...] = ("conftest.py",)

    def is_harness(self, norm: str) -> bool:
        folded = norm.casefold().strip("/")
        if any(folded == e.casefold() or folded.startswith(e.casefold() + "/") for e in self.harness_exempt):
            return False
        name = folded.rsplit("/", 1)[-1]
        if name in {b.casefold() for b in self.harness_basenames}:
            return True
        return any(folded == p.casefold() or folded.startswith(p.casefold() + "/") for p in self.harness_paths)

    def describe(self) -> str:
        return (
            "MOAT RULES (a change is rolled back unless ALL hold): "
            "full test suite green (or strictly fewer failures if it started red); "
            "collected test count must not drop; passing count must not drop; "
            "skipped count must not rise; assertions under tests/ must not drop; "
            "JUnit must agree with pytest's summary and the run must not touch .git or startup files; "
            "no os._exit / JUnit access / pytest_plugins / pytest hooks / sys.argv-in-tests in added code; "
            "no new high-severity audit findings; "
            f"never delete files under {self.tests_dir}/; "
            f"at most {self.max_files_per_change} files per change; "
            f"read-only paths: {', '.join(self.protected_paths) or '(none)'}; "
            f"test harness you may not touch: {', '.join(self.harness_paths)}, and every "
            f"{'/'.join(self.harness_basenames)}."
        )


class Verdict(BaseModel):
    accepted: bool
    reasons: list[str] = Field(default_factory=list)


def check_changeset(policy: MoatPolicy, changes: Iterable, workspace: "Workspace") -> Verdict:
    """`changes` items need `.op`, `.path`, and `.content`/`.new` attributes."""
    reasons: list[str] = []
    items = list(changes)
    if not items:
        reasons.append("change set is empty")
    if len(items) > policy.max_files_per_change:
        reasons.append(f"change set touches {len(items)} files (max {policy.max_files_per_change})")
    tests_prefix = policy.tests_dir.rstrip("/") + "/"
    for change in items:
        try:
            norm = workspace.normalize(change.path)
        except Exception as e:  # PathRejected and friends; reported, never raised
            reasons.append(f"{change.path}: {e}")
            continue
        if workspace.is_protected(norm) or any(norm == p or norm.startswith(p + "/") for p in policy.protected_paths):
            reasons.append(f"{norm}: protected path is read-only")
        elif policy.is_harness(norm):
            reasons.append(f"{norm}: part of the test harness; only a human can change it")
        if change.op == "delete" and policy.forbid_test_deletion and norm.startswith(tests_prefix):
            reasons.append(f"{norm}: deleting test files is not allowed")
        payload: Optional[str] = change.content if change.op == "write" else (change.new if change.op == "replace" else None)
        if payload is not None and len(payload.encode("utf-8")) > policy.max_bytes_per_file:
            reasons.append(f"{norm}: content exceeds {policy.max_bytes_per_file} bytes")
        if change.op == "write" and change.content is None:
            reasons.append(f"{norm}: write needs `content`")
        if change.op == "replace" and not change.old:
            reasons.append(f"{norm}: replace needs a non-empty `old`")
        if policy.forbid_gaming_constructs and change.op in ("write", "replace"):
            if change.op == "write":
                try:
                    previous = workspace.read(norm) if workspace.exists(norm) else ""
                except Exception:  # binary/oversized existing file: scan the whole new content
                    previous = ""
                added = added_text(previous, change.content or "")
            else:
                added = added_text(change.old or "", change.new or "")
            reasons.extend(scan_for_gaming(norm, added, policy.tests_dir))
    return Verdict(accepted=not reasons, reasons=reasons)


_ASSERT_CALLS = ("raises", "warns", "approx", "fail")


def count_assertions(workspace: "Workspace", tests_dir: str = "tests") -> int:
    """`assert` statements plus pytest.raises/warns/approx/fail and
    assert*-style calls in every .py file under `tests_dir`."""
    prefix = tests_dir.rstrip("/") + "/"
    total = 0
    for info in workspace.list_files():
        if not (info.path.startswith(prefix) and info.path.endswith(".py")):
            continue
        try:
            tree = ast.parse(workspace.read(info.path))
        except (SyntaxError, ValueError, OSError):
            continue  # an unparseable test file fails the suite anyway
        for node in ast.walk(tree):
            if isinstance(node, ast.Assert):
                total += 1
            elif isinstance(node, ast.Call):
                fn = node.func
                name = fn.attr if isinstance(fn, ast.Attribute) else (fn.id if isinstance(fn, ast.Name) else "")
                if name in _ASSERT_CALLS or name.startswith("assert"):
                    total += 1
    return total


def evaluate(
    policy: MoatPolicy,
    baseline: "TestReport",
    candidate: "TestReport",
    baseline_audit: Optional["AuditReport"] = None,
    candidate_audit: Optional["AuditReport"] = None,
    baseline_assertions: Optional[int] = None,
    candidate_assertions: Optional[int] = None,
) -> Verdict:
    reasons: list[str] = []
    if candidate.timed_out:
        reasons.append("test run timed out")
    if candidate.cancelled:
        reasons.append("test run was cancelled")
    for problem in candidate.integrity_problems:
        reasons.append(f"untrustworthy test run: {problem}")
    if candidate.tampered:
        reasons.append(f"test run modified files outside the tree (restored): {', '.join(candidate.tampered[:5])}")
    bad_base = baseline.failed + baseline.errors
    bad_cand = candidate.failed + candidate.errors
    if policy.require_green:
        if baseline.ok and not candidate.ok:
            reasons.append(
                f"tests went red: {candidate.failed} failed, {candidate.errors} errors (exit {candidate.exit_code})"
            )
        elif not baseline.ok and not candidate.ok and bad_cand >= bad_base:
            reasons.append(
                f"baseline was red ({bad_base} failing); change must reduce failures but has {bad_cand}"
            )
    if policy.forbid_test_count_drop and candidate.total < baseline.total:
        reasons.append(f"collected test count dropped {baseline.total} -> {candidate.total}")
    if policy.forbid_passing_drop and candidate.passed < baseline.passed:
        reasons.append(f"passing test count dropped {baseline.passed} -> {candidate.passed}")
    if policy.forbid_skip_increase and candidate.skipped > baseline.skipped:
        reasons.append(f"skipped test count rose {baseline.skipped} -> {candidate.skipped}")
    if (policy.forbid_assertion_drop and baseline_assertions is not None and candidate_assertions is not None
            and candidate_assertions < baseline_assertions):
        reasons.append(f"assertions under {policy.tests_dir}/ dropped {baseline_assertions} -> {candidate_assertions}")
    if policy.forbid_high_findings_increase and baseline_audit is not None and candidate_audit is not None:
        before = baseline_audit.counts()["high"]
        after = candidate_audit.counts()["high"]
        # tests-failing is already judged above from the real run; don't count it twice
        before -= sum(1 for f in baseline_audit.findings if f.rule == "tests-failing")
        after -= sum(1 for f in candidate_audit.findings if f.rule == "tests-failing")
        if after > before:
            new = [f"{f.rule}@{f.path}" for f in candidate_audit.findings if f.severity == "high" and f.rule != "tests-failing"]
            reasons.append(f"high-severity audit findings rose {before} -> {after}: {', '.join(new[:5])}")
    return Verdict(accepted=not reasons, reasons=reasons)
