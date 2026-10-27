"""
auditor.py — a static audit of the workspace that produces a score, a list of
findings, and an ordered improvement plan. It is the "audit" and "plan" half
of the workbench's build -> test -> audit -> plan -> improve loop.

Per-file checks fan out across a thread pool with `osiiso.tmap` (each file is
parsed independently, so this parallelises cleanly). Checks:

  high    syntax-error      file does not parse
  high    import-error      a top-level package fails `import` in a fresh interpreter
  high    tests-failing     the most recent full test run was red
  medium  placeholder       a placeholder marker in a *comment* (found with
                            `tokenize`, so string literals never false-positive)
                            or a `raise NotImplementedError`
  medium  untested-module   a package module no test file references
  low     bare-except       `except:` with no exception type
  low     long-function     a function longer than LONG_FUNCTION_LINES
  low     large-file        a module longer than LARGE_FILE_LINES
  info    tests-not-run     no full test run recorded yet
"""

from __future__ import annotations

import ast
import io
import re
import subprocess
import sys
import tempfile
import time
import tokenize
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Optional

import osiiso
from pydantic import BaseModel, Field

from .tester import fresh_bytecode_env

if TYPE_CHECKING:
    from .tester import TestReport
    from .workspace import Workspace

Severity = Literal["high", "medium", "low", "info"]
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}
SEVERITY_PENALTY = {"high": 15, "medium": 5, "low": 1, "info": 0}
LOW_PENALTY_CAP = 20
LONG_FUNCTION_LINES = 80
LARGE_FILE_LINES = 800
# assembled so this module never contains the literal markers it hunts for
_MARKERS = ("TO" + "DO", "FIX" + "ME", "X" + "XX", "HA" + "CK")
_MARKER_RE = re.compile(r"\b(" + "|".join(_MARKERS) + r")\b")


class Finding(BaseModel):
    severity: Severity
    rule: str
    path: Optional[str] = None
    line: Optional[int] = None
    message: str


class PlanItem(BaseModel):
    priority: int
    title: str
    detail: str
    paths: list[str] = Field(default_factory=list)


class AuditReport(BaseModel):
    score: int
    generated_at: float
    files_scanned: int
    metrics: dict
    findings: list[Finding]
    plan: list[PlanItem]

    def counts(self) -> dict[str, int]:
        out = {k: 0 for k in SEVERITY_ORDER}
        for f in self.findings:
            out[f.severity] += 1
        return out


def _scan_file(rel: str, source: str) -> tuple[str, int, list[dict]]:
    """Runs on an osiiso worker thread (osiiso's map unpacks each
    `(rel, source)` tuple into positional args). Returns plain dicts so
    nothing thread-unsafe crosses back."""
    findings: list[dict] = []
    loc = source.count("\n") + (0 if source.endswith("\n") or not source else 1)
    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError as e:
        findings.append({"severity": "high", "rule": "syntax-error", "path": rel, "line": e.lineno,
                         "message": f"syntax error: {e.msg}"})
        return rel, loc, findings

    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.COMMENT and _MARKER_RE.search(tok.string):
                findings.append({"severity": "medium", "rule": "placeholder", "path": rel, "line": tok.start[0],
                                 "message": f"placeholder comment: {tok.string.strip()[:120]}"})
    except (tokenize.TokenError, IndentationError):
        pass  # ast already accepted the file; tokenizer edge cases are not findings

    for node in ast.walk(tree):
        if isinstance(node, ast.Raise) and node.exc is not None:
            target = node.exc.func if isinstance(node.exc, ast.Call) else node.exc
            if isinstance(target, ast.Name) and target.id == "NotImplementedError":
                findings.append({"severity": "medium", "rule": "placeholder", "path": rel, "line": node.lineno,
                                 "message": "raise NotImplementedError (unimplemented code path)"})
        elif isinstance(node, ast.ExceptHandler) and node.type is None:
            findings.append({"severity": "low", "rule": "bare-except", "path": rel, "line": node.lineno,
                             "message": "bare `except:` also catches KeyboardInterrupt/SystemExit"})
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            length = (node.end_lineno or node.lineno) - node.lineno + 1
            if length > LONG_FUNCTION_LINES:
                findings.append({"severity": "low", "rule": "long-function", "path": rel, "line": node.lineno,
                                 "message": f"function `{node.name}` is {length} lines (> {LONG_FUNCTION_LINES})"})
    if loc > LARGE_FILE_LINES:
        findings.append({"severity": "low", "rule": "large-file", "path": rel, "line": None,
                         "message": f"module is {loc} lines (> {LARGE_FILE_LINES})"})
    return rel, loc, findings


class Auditor:
    def __init__(
        self,
        workspace: "Workspace",
        *,
        python: Optional[str] = None,
        tests_dir: str = "tests",
        packages: Optional[list[str]] = None,
        workers: int = 8,
        import_timeout: float = 90.0,
    ) -> None:
        self.workspace = workspace
        self.python = python or sys.executable
        self.tests_dir = tests_dir
        self._packages = packages
        self.workers = workers
        self.import_timeout = import_timeout

    def packages(self) -> list[str]:
        if self._packages is not None:
            return self._packages
        found = []
        for child in sorted(self.workspace.root.iterdir()):
            if child.is_dir() and (child / "__init__.py").is_file() and child.name != self.tests_dir:
                found.append(child.name)
        return found

    def _import_check(self, package: str) -> Optional[str]:
        with tempfile.TemporaryDirectory(prefix="selfwire-audit-") as td:
            try:
                proc = subprocess.run(
                    [self.python, "-c", f"import {package}"], cwd=self.workspace.root,
                    capture_output=True, text=True, timeout=self.import_timeout, errors="replace",
                    env=fresh_bytecode_env(Path(td)),  # never leave or trust .pyc files in the tree
                )
            except subprocess.TimeoutExpired:
                return f"`import {package}` timed out after {self.import_timeout:.0f}s"
        if proc.returncode != 0:
            output = (proc.stderr or proc.stdout).strip()
            return output.splitlines()[-1][:500] if output else f"exit {proc.returncode}"
        return None

    def run(self, last_test_report: Optional["TestReport"] = None) -> AuditReport:
        files = [f.path for f in self.workspace.list_files() if f.path.endswith(".py")]
        sources: list[tuple[str, str]] = []
        for rel in files:
            try:
                sources.append((rel, self.workspace.read(rel)))
            except (OSError, ValueError):
                continue
        results = osiiso.tmap(_scan_file, sources, workers=self.workers) if sources else ()

        findings: list[Finding] = []
        loc_total = 0
        for _rel, loc, file_findings in results:
            loc_total += loc
            findings.extend(Finding(**f) for f in file_findings)

        test_prefix = self.tests_dir.rstrip("/") + "/"
        test_files = [rel for rel, _ in sources if rel.startswith(test_prefix)]
        test_names = {Path(t).name for t in test_files}
        tests_text = "\n".join(src for rel, src in sources if rel.startswith(test_prefix))
        packages = self.packages()
        untested: list[str] = []
        for rel, _src in sources:
            parts = rel.split("/")
            if parts[0] not in packages or parts[-1] in ("__init__.py", "__main__.py"):
                continue
            stem = Path(rel).stem
            dotted = rel[:-3].replace("/", ".")
            referenced = (
                f"test_{stem}.py" in test_names
                # e.g. tests/test_workbench_chat.py covers selfwire/workbench/chat.py
                or any(t.startswith("test_") and t.endswith(f"_{stem}.py") for t in test_names)
                or dotted in tests_text
                or re.search(rf"\bimport\s+{re.escape(stem)}\b|\b{re.escape(stem)}\s+import\b", tests_text) is not None
            )
            if not referenced:
                untested.append(rel)
                findings.append(Finding(severity="medium", rule="untested-module", path=rel,
                                        message=f"no test file references `{dotted}`"))

        for package in packages:
            err = self._import_check(package)
            if err:
                findings.append(Finding(severity="high", rule="import-error", path=f"{package}/__init__.py",
                                        message=f"`import {package}` fails: {err}"))

        if last_test_report is None or not last_test_report.full_run:
            findings.append(Finding(severity="info", rule="tests-not-run",
                                    message="no full test run recorded yet; run the suite for a complete audit"))
        elif not last_test_report.ok:
            names = ", ".join(f.nodeid for f in last_test_report.failures[:5]) or f"exit code {last_test_report.exit_code}"
            findings.append(Finding(severity="high", rule="tests-failing",
                                    message=f"{last_test_report.failed} failed, {last_test_report.errors} errors: {names}"))

        findings.sort(key=lambda f: (SEVERITY_ORDER[f.severity], f.path or "", f.line or 0))
        penalty = sum(SEVERITY_PENALTY[f.severity] for f in findings if f.severity != "low")
        penalty += min(LOW_PENALTY_CAP, sum(1 for f in findings if f.severity == "low"))
        score = max(0, 100 - penalty)
        metrics = {
            "py_files": len(sources),
            "test_files": len(test_files),
            "loc": loc_total,
            "untested_modules": untested,
            "packages": packages,
            "last_test": last_test_report.summary() if last_test_report is not None else None,
        }
        return AuditReport(
            score=score, generated_at=time.time(), files_scanned=len(sources),
            metrics=metrics, findings=findings, plan=self._plan(findings),
        )

    @staticmethod
    def _plan(findings: list[Finding], limit: int = 10) -> list[PlanItem]:
        items: list[PlanItem] = []
        seen: set[tuple[str, Optional[str]]] = set()
        titles = {
            "syntax-error": "Fix the syntax error in {path}",
            "import-error": "Make `{path}` importable again",
            "tests-failing": "Get the failing tests green",
            "placeholder": "Implement the placeholder in {path}",
            "untested-module": "Add tests for {path}",
            "bare-except": "Narrow the bare except in {path}",
            "long-function": "Split the long function in {path}",
            "large-file": "Split {path} into smaller modules",
        }
        for f in findings:
            if f.rule not in titles:
                continue
            key = (f.rule, f.path)
            if key in seen:
                continue
            seen.add(key)
            detail = f.message + (f" (line {f.line})" if f.line else "")
            items.append(PlanItem(priority=len(items) + 1, title=titles[f.rule].format(path=f.path or "the suite"),
                                  detail=detail, paths=[f.path] if f.path else []))
            if len(items) >= limit:
                break
        return items
