"""
core.py — `Workbench`, the one object that wires every workbench part to a
served repo: event bus, sandboxed workspace, test runner, auditor, skills,
osiiso job manager, moat policy, improvement loop, chat, and (lazily) the
SelfWire agent with the workbench toolkit registered as tools.

Every test run is wrapped in a tamper tripwire: .git hooks/info/config and
this interpreter's startup files (*.pth, sitecustomize, usercustomize) are
snapshotted before the run and, if test code changed them, restored after it
and the report is marked untrustworthy (`TestReport.tampered`).

Workbench state (reports, telemetry JSON, the agent's graph store) lives in
`<root>/.selfwire/`, which is git-excluded locally and off-limits to file
tools, so it never ends up in a commit and a rollback never deletes it.
"""

from __future__ import annotations

import site
import sys
import threading
from pathlib import Path
from typing import Iterable, Optional

import dspy

from ..exec_tool import ExecTool
from ..graph_store import ToolGraph
from ..mcp_hub import McpHub
from ..own_server import OwnServer
from ..registry import ToolRegistry
from ..reporter import Reporter
from ..storage import RaptorRedisStore
from ..telemetry import Telemetry
from .agent_base import WorkbenchAgent
from .agent_tools import WorkbenchToolkit
from .auditor import AuditReport, Auditor
from .chat import ChatService
from .events import EventBus
from .improver import ImprovementLoop
from .jobs import Job, JobManager
from .moat import MoatPolicy
from .settings import LMNotConfigured, WorkbenchSettings
from .skills import SkillStore
from .tester import TestReport, TestRunner
from .workspace import DEFAULT_PROTECTED, Workspace

WORKSPACE_GROUP = "workspace"
PACKAGE_UI = Path(__file__).resolve().parent / "ui" / "index.html"
WORKSPACE_UI_REL = "selfwire/workbench/ui/index.html"


def _startup_files() -> list[Path]:
    dirs = list(site.getsitepackages())
    try:
        dirs.append(site.getusersitepackages())
    except AttributeError:
        pass  # some embedded interpreters lack user site support
    found: list[Path] = []
    for d in dict.fromkeys(dirs):
        folder = Path(d)
        if not folder.is_dir():
            continue
        found += [p for p in folder.glob("*.pth") if p.is_file()]
        found += [folder / n for n in ("sitecustomize.py", "usercustomize.py") if (folder / n).is_file()]
    return found


def startup_snapshot() -> dict[str, bytes]:
    snap: dict[str, bytes] = {}
    for path in _startup_files():
        try:
            snap[str(path)] = path.read_bytes()
        except OSError:
            continue
    return snap


def startup_restore(snapshot: dict[str, bytes]) -> list[str]:
    changed: list[str] = []
    for path in _startup_files():
        if str(path) not in snapshot:
            try:
                path.unlink()
            except OSError:
                pass
            changed.append(str(path))
    for path_str, data in snapshot.items():
        path = Path(path_str)
        try:
            if path.is_file() and path.read_bytes() == data:
                continue
            path.write_bytes(data)
        except OSError:
            pass
        changed.append(path_str)
    return changed


class Workbench:
    def __init__(
        self,
        root: str | Path,
        *,
        protected: Optional[Iterable[str]] = None,
        lm_override: Optional[dspy.LM] = None,
        python: Optional[str] = None,
        test_timeout: float = 900.0,
        job_workers: int = 2,
        max_iters: Optional[int] = None,
    ) -> None:
        self.bus = EventBus()
        self.workspace = Workspace(root, protected=DEFAULT_PROTECTED if protected is None else protected,
                                   emit=self.bus.publish)
        self.workspace.ensure_repo()
        self.root = self.workspace.root
        self.settings = WorkbenchSettings.from_env(lm_override=lm_override)
        if max_iters is not None:
            self.settings.update(max_iters=max_iters)
        self.python = python or sys.executable
        self.tester = TestRunner(self.root, python=self.python, timeout=test_timeout)
        self.auditor = Auditor(self.workspace, python=self.python)
        self.skills = SkillStore(self.workspace)
        self.jobs = JobManager(self.bus, workers=job_workers)
        self.policy = MoatPolicy(protected_paths=self.workspace.protected)
        state = self.workspace.state_dir
        self.reporter = Reporter(reports_dir=str(state / "reports"))
        self.telemetry = Telemetry(log_dir=str(state / "reports" / "telemetry"))
        self.last_test_report: Optional[TestReport] = None
        self.last_audit: Optional[AuditReport] = None
        self.improver = ImprovementLoop(self)
        self.toolkit = WorkbenchToolkit(self)
        self.chat = ChatService(self)
        self._agent: Optional[WorkbenchAgent] = None
        self._agent_lock = threading.Lock()
        self._turn_lock = threading.Lock()
        self._closed = False

    # -- tests ----------------------------------------------------------------------
    def run_tests(self, selector: Optional[str] = None, keyword: Optional[str] = None, *,
                  job_id: str = "inline", cancel_event: Optional[threading.Event] = None) -> TestReport:
        mutation = self.workspace.mutation_count
        git_meta = self.workspace.git_meta_snapshot()
        startup = startup_snapshot()
        try:
            report = self.tester.run(
                selector, keyword, cancel_event=cancel_event,
                on_line=lambda line: self.bus.publish("test_line", {"job_id": job_id, "line": line}),
            )
        finally:
            tampered = self.workspace.git_meta_restore(git_meta) + startup_restore(startup)
        if tampered:
            report.tampered = tampered
            report.ok = False
            self.bus.publish("test_line", {"job_id": job_id, "line": f"[workbench] test run modified {', '.join(tampered[:5])} — restored; results rejected"})
        report.mutation_count = mutation
        self.last_test_report = report
        self.bus.publish("test_report", {"job_id": job_id, "report": report.model_dump(mode="json")})
        return report

    def run_tests_inline(self, selector: Optional[str] = None, keyword: Optional[str] = None) -> TestReport:
        title = "tests: " + (" ".join(x for x in (selector, f"-k {keyword}" if keyword else None) if x) or "full suite")
        return self.jobs.run_inline(
            "tests", title,
            lambda ctx: self.run_tests(selector, keyword, job_id=ctx.job_id, cancel_event=ctx.cancel_event),
            group=WORKSPACE_GROUP,
        )

    def start_tests_job(self, selector: Optional[str] = None, keyword: Optional[str] = None) -> Job:
        # validate up front so a bad selector is a 400 now, not a failed job later
        self.tester._validate_selector(selector)
        self.tester._validate_keyword(keyword)
        title = "tests: " + (" ".join(x for x in (selector, f"-k {keyword}" if keyword else None) if x) or "full suite")
        return self.jobs.submit(
            "tests", title,
            lambda ctx: self.run_tests(selector, keyword, job_id=ctx.job_id, cancel_event=ctx.cancel_event),
            group=WORKSPACE_GROUP, timeout=self.tester.timeout + 60, on_done=self.chat.notify_job,
        )

    # -- audit / improve ----------------------------------------------------------------
    def run_audit(self) -> AuditReport:
        audit = self.auditor.run(self.last_test_report)
        self.last_audit = audit
        return audit

    def start_improve_job(self, goal: str, max_attempts: int = 3) -> Job:
        goal = (goal or "").strip()
        if not goal:
            raise ValueError("improvement goal is empty")
        if not self.settings.configured():
            raise LMNotConfigured("the improvement loop needs a language model: set one in Settings or with /model")
        return self.jobs.submit(
            "improve", f"improve: {goal.splitlines()[0][:80]}",
            lambda ctx: self.improver.run(goal, max_attempts, job_id=ctx.job_id, cancel_event=ctx.cancel_event),
            group=WORKSPACE_GROUP, on_done=self.chat.notify_job,
        )

    def improve_running(self) -> bool:
        return self.jobs.kind_busy("improve")

    # -- agent ----------------------------------------------------------------------------
    def agent(self) -> WorkbenchAgent:
        with self._agent_lock:
            if self._agent is None:
                store = RaptorRedisStore(namespace="workbench", file_root=str(self.workspace.state_dir / "kv"),
                                         connect_timeout=0.2)
                graph = ToolGraph(store=store, key="workbench/tool_graph")
                registry = ToolRegistry(graph=graph)
                exec_tool = ExecTool(registry)
                mcp_hub = McpHub(registry)
                own_server = OwnServer(registry, exec_tool=exec_tool, name="selfwire-workbench")
                self.toolkit.register_into(registry)
                own_server.sync_all()
                self._agent = WorkbenchAgent(
                    registry=registry, mcp_hub=mcp_hub, own_server=own_server, exec_tool=exec_tool,
                    graph=graph, telemetry=self.telemetry, reporter=self.reporter, max_iters=self.settings.max_iters,
                )
                self._agent.unsafe_levers_allowed = lambda: self.settings.allow_unsafe_levers
            self._agent.max_iters = self.settings.max_iters
            return self._agent

    def agent_turn(self, task: str) -> dspy.Prediction:
        lm = self.settings.build_lm()
        agent = self.agent()
        # one turn at a time: the agent's ToolGraph is not safe for concurrent mutation
        with self._turn_lock:
            return agent.forward(task, lm=lm)

    # -- misc ----------------------------------------------------------------------------
    def ui_path(self) -> Path:
        """The workspace's own copy of the UI when serving the selfwire repo —
        so an edit to it (by you or the agent) shows on the next page load —
        otherwise the copy shipped inside the installed package."""
        live = self.root / WORKSPACE_UI_REL
        return live if live.is_file() else PACKAGE_UI

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.jobs.shutdown()
        if self._agent is not None:
            try:
                self._agent.mcp_hub.shutdown()
            except Exception:
                pass  # best-effort teardown of MCP subprocesses on exit
