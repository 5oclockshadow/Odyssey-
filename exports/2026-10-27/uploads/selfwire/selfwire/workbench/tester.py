"""
tester.py — runs the workspace's pytest suite in a subprocess and turns the
result into a structured `TestReport`.

  * Output is streamed line by line to a callback as it is produced (the
    dashboard shows it live), while the last N lines are kept for the report.
  * Counts and failures come from pytest's JUnit XML (`junit_family=xunit1`,
    which records each test's file so node ids can be rebuilt exactly);
    when no XML is written — a collection error, an interpreter crash — the
    counts fall back to parsing pytest's terminal summary line.
  * The run lives in its own process group, so a timeout or a cancel kills
    pytest *and* anything it spawned (MCP subprocesses, servers under test).
  * Integrity: the JUnit counts must agree with pytest's own terminal summary,
    and a zero exit with no summary line at all (a test calling `os._exit`
    after forging the XML) is a failure, recorded in `integrity_problems`.
    PYTEST_ADDOPTS / PYTEST_PLUGINS are removed from the child environment so
    nothing outside the repo's (harness-protected) config can load plugins.
  * `selector` and `keyword` are validated before they reach argv: neither
    may start with "-", so they cannot smuggle in extra pytest options, and a
    selector must name a path inside the workspace.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET
from collections import deque
from pathlib import Path
from typing import Callable, Optional

from pydantic import BaseModel, Field

_SUMMARY_RE = re.compile(r"(\d+) (passed|failed|errors?|skipped|xfailed|xpassed|deselected)")


# variables that would let something outside the repo's own pytest config
# add options or load plugins into the gated test run
SCRUBBED_ENV = frozenset({"PYTEST_ADDOPTS", "PYTEST_PLUGINS"})


def fresh_bytecode_env(prefix: Path) -> dict[str, str]:
    """Environment for a child interpreter that must run the source *as it is
    on disk right now*.

    Python trusts a cached .pyc when the source's mtime (whole seconds) and
    size match. A same-length edit made within the same second as an earlier
    import — exactly what an automated edit-then-test loop does — would
    silently run the OLD bytecode, and broken code could test green.
    PYTHONPYCACHEPREFIX points bytecode lookup at an empty per-run directory,
    so every `__pycache__` in the tree is ignored and everything compiles
    from current source."""
    prefix.mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if k not in SCRUBBED_ENV}
    return {**env, "PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPYCACHEPREFIX": str(prefix)}


class TestRunnerError(Exception):
    __test__ = False  # not a pytest test class, despite the name


class TestFailure(BaseModel):
    __test__ = False
    nodeid: str
    message: str = ""
    text: str = ""


class TestReport(BaseModel):
    __test__ = False
    ok: bool
    exit_code: int
    total: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    duration: float = 0.0
    selector: Optional[str] = None
    keyword: Optional[str] = None
    started_at: float
    finished_at: float
    failures: list[TestFailure] = Field(default_factory=list)
    output_tail: str = ""
    cancelled: bool = False
    timed_out: bool = False
    mutation_count: int = -1
    integrity_problems: list[str] = Field(default_factory=list)
    tampered: list[str] = Field(default_factory=list)

    @property
    def full_run(self) -> bool:
        return not self.selector and not self.keyword

    def summary(self) -> dict:
        return {
            "ok": self.ok, "passed": self.passed, "failed": self.failed, "errors": self.errors,
            "skipped": self.skipped, "total": self.total, "duration": round(self.duration, 2),
            "exit_code": self.exit_code,
        }


class TestRunner:
    __test__ = False
    def __init__(
        self,
        root: str | Path,
        *,
        python: Optional[str] = None,
        timeout: float = 900.0,
        extra_args: tuple[str, ...] = (),
        tail_lines: int = 200,
    ) -> None:
        self.root = Path(root).resolve()
        self.python = python or sys.executable
        self.timeout = timeout
        self.extra_args = tuple(extra_args)
        self.tail_lines = tail_lines

    # -- input validation -----------------------------------------------------
    def _validate_selector(self, selector: Optional[str]) -> Optional[str]:
        if selector is None or not selector.strip():
            return None
        sel = selector.strip()
        if sel.startswith("-") or "\n" in sel or "\x00" in sel:
            raise TestRunnerError(f"invalid test selector: {selector!r}")
        path_part = sel.split("::", 1)[0]
        if path_part.startswith("/") or ".." in Path(path_part).parts:
            raise TestRunnerError(f"selector must be a workspace-relative path: {selector!r}")
        target = (self.root / path_part).resolve()
        if target != self.root and self.root not in target.parents:
            raise TestRunnerError(f"selector escapes the workspace: {selector!r}")
        if not target.exists():
            raise TestRunnerError(f"selector path does not exist: {path_part}")
        return sel

    @staticmethod
    def _validate_keyword(keyword: Optional[str]) -> Optional[str]:
        if keyword is None or not keyword.strip():
            return None
        kw = keyword.strip()
        if kw.startswith("-") or "\n" in kw or "\x00" in kw or len(kw) > 300:
            raise TestRunnerError(f"invalid -k expression: {keyword!r}")
        return kw

    # -- run ------------------------------------------------------------------------
    def run(
        self,
        selector: Optional[str] = None,
        keyword: Optional[str] = None,
        *,
        on_line: Optional[Callable[[str], None]] = None,
        cancel_event: Optional[threading.Event] = None,
        timeout: Optional[float] = None,
    ) -> TestReport:
        sel = self._validate_selector(selector)
        kw = self._validate_keyword(keyword)
        limit = timeout if timeout is not None else self.timeout
        with tempfile.TemporaryDirectory(prefix="selfwire-tests-") as td:
            junit = Path(td) / "junit.xml"
            cmd = [
                self.python, "-m", "pytest", "-q", "--color=no", "-p", "no:cacheprovider",
                f"--junitxml={junit}", "-o", "junit_family=xunit1", *self.extra_args,
            ]
            if sel:
                cmd.append(sel)
            if kw:
                cmd += ["-k", kw]
            env = fresh_bytecode_env(Path(td) / "pycache")
            started = time.time()
            try:
                proc = subprocess.Popen(
                    cmd, cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1, env=env, start_new_session=True, errors="replace",
                )
            except OSError as e:
                raise TestRunnerError(f"could not start pytest: {e}") from e

            tail: deque[str] = deque(maxlen=self.tail_lines)

            def pump() -> None:
                assert proc.stdout is not None
                for raw in proc.stdout:
                    line = raw.rstrip("\n")
                    tail.append(line)
                    if on_line is not None:
                        try:
                            on_line(line)
                        except Exception:
                            # a broken listener must not stop output draining,
                            # or pytest would block on a full pipe
                            continue

            reader = threading.Thread(target=pump, name="pytest-output", daemon=True)
            reader.start()
            cancelled, timed_out = self._supervise(proc, cancel_event, started + limit)
            reader.join(timeout=5)
            finished = time.time()
            output = "\n".join(tail)
            counts, failures = self._parse(junit, output)
            problems = self._integrity(counts, output, proc.returncode, cancelled or timed_out)

        exit_code = proc.returncode
        if timed_out:
            tail.append(f"[workbench] pytest killed after exceeding {limit:.0f}s timeout")
        if cancelled:
            tail.append("[workbench] pytest run cancelled")
        return TestReport(
            ok=(exit_code == 0 and not cancelled and not timed_out and counts["total"] > 0 and not problems),
            integrity_problems=problems,
            exit_code=exit_code,
            selector=sel,
            keyword=kw,
            started_at=started,
            finished_at=finished,
            duration=finished - started,
            failures=failures,
            output_tail="\n".join(tail),
            cancelled=cancelled,
            timed_out=timed_out,
            **counts,
        )

    @classmethod
    def _supervise(cls, proc: subprocess.Popen, cancel_event: Optional[threading.Event], deadline: float) -> tuple[bool, bool]:
        """Wait for pytest, killing its whole process group on cancel or
        deadline. Returns (cancelled, timed_out); the process is always reaped."""
        cancelled = timed_out = False
        try:
            while True:
                try:
                    proc.wait(timeout=0.2)
                    break
                except subprocess.TimeoutExpired:
                    if cancel_event is not None and cancel_event.is_set():
                        cancelled = True
                        cls._kill(proc)
                        break
                    if time.time() > deadline:
                        timed_out = True
                        cls._kill(proc)
                        break
        finally:
            if proc.poll() is None:
                cls._kill(proc)
            proc.wait()
        return cancelled, timed_out

    @staticmethod
    def _kill(proc: subprocess.Popen) -> None:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(proc.pid, sig)
            except (ProcessLookupError, PermissionError):
                return
            try:
                proc.wait(timeout=3)
                return
            except subprocess.TimeoutExpired:
                continue

    # -- parsing ---------------------------------------------------------------------
    def _parse(self, junit: Path, output: str) -> tuple[dict, list[TestFailure]]:
        if junit.exists() and junit.stat().st_size > 0:
            try:
                return self._parse_junit(junit)
            except ET.ParseError:
                pass  # fall through to the terminal summary
        return self._parse_summary_counts(output), []

    @staticmethod
    def _nodeid(case: ET.Element) -> str:
        name = case.get("name", "?")
        classname = case.get("classname", "")
        file = case.get("file")
        if file:
            module = file[:-3].replace("/", ".") if file.endswith(".py") else file.replace("/", ".")
            cls = classname[len(module) + 1:] if classname.startswith(module + ".") else ""
            return f"{file}{'::' + cls.replace('.', '::') if cls else ''}::{name}"
        if classname:
            return f"{classname.replace('.', '/')}.py::{name}"
        return name

    def _parse_junit(self, junit: Path) -> tuple[dict, list[TestFailure]]:
        root = ET.parse(junit).getroot()
        suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
        counts = {"total": 0, "failed": 0, "errors": 0, "skipped": 0}
        for suite in suites:
            counts["total"] += int(suite.get("tests", 0))
            counts["failed"] += int(suite.get("failures", 0))
            counts["errors"] += int(suite.get("errors", 0))
            counts["skipped"] += int(suite.get("skipped", 0))
        counts["passed"] = max(0, counts["total"] - counts["failed"] - counts["errors"] - counts["skipped"])
        failures: list[TestFailure] = []
        for case in root.iter("testcase"):
            for child in case:
                if child.tag in ("failure", "error"):
                    failures.append(
                        TestFailure(
                            nodeid=self._nodeid(case),
                            message=(child.get("message") or child.tag)[:2000],
                            text=(child.text or "")[:8000],
                        )
                    )
        return counts, failures

    def _integrity(self, counts: dict, output: str, exit_code: int, interrupted: bool) -> list[str]:
        """JUnit XML is written by code running in the same process as the
        tests, so test code can forge it. pytest's own summary line is a
        second, independent account; the two must agree."""
        if interrupted:
            return []
        summary = self._parse_summary(output)
        if summary["total"] == 0 and summary["xpassed"] == 0 and summary["xfailed"] == 0:
            if exit_code == 0 or counts.get("total", 0) > 0:
                return ["pytest printed no summary line (did a test call os._exit?); the results cannot be trusted"]
            return []
        problems = []
        if counts.get("passed", 0) != summary["passed"] + summary["xpassed"]:
            problems.append(f"JUnit says {counts.get('passed', 0)} passed but pytest's summary says {summary['passed'] + summary['xpassed']}")
        if counts.get("failed", 0) != summary["failed"]:
            problems.append(f"JUnit says {counts.get('failed', 0)} failed but pytest's summary says {summary['failed']}")
        return problems

    @staticmethod
    def _parse_summary(output: str) -> dict:
        found = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0, "xpassed": 0, "xfailed": 0}
        lines = [l for l in output.splitlines() if l.strip()]
        for line in reversed(lines[-5:]):
            matches = _SUMMARY_RE.findall(line)
            if not matches:
                continue
            for n, kind in matches:
                key = "errors" if kind.startswith("error") else kind
                if key in found:
                    found[key] = int(n)
            break
        found["total"] = found["passed"] + found["failed"] + found["errors"] + found["skipped"]
        return found

    def _parse_summary_counts(self, output: str) -> dict:
        found = self._parse_summary(output)
        return {k: found[k] for k in ("passed", "failed", "errors", "skipped", "total")}
