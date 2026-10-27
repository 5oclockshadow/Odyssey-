"""
server.py — the workbench's HTTP API (FastAPI) and live dashboard.

The contract is docs/WORKBENCH_API.md. Highlights:
  * `GET /` serves the dashboard as it was when the server started. The agent
    may edit the dashboard file, but its edits only render at `/preview`,
    under a Content-Security-Policy that forbids network access (so preview
    JS can never call the API with your token). A human adopts them with
    Restart.
  * DNS-rebinding guard: every request's Host (and Origin, when sent) must be
    loopback or explicitly allowed, so a web page you visit cannot drive the
    API by rebinding its domain to 127.0.0.1.
  * `GET /api/events` is a Server-Sent Events stream of everything happening
    (file edits, test output, job status, improvement phases, chat).
  * Optional token auth on every /api route (header or ?token=), compared in
    constant time. The CLI refuses to bind a non-loopback address without one.
  * Tree-mutating routes return 409 while an improvement job owns the tree.
  * `POST /api/restart` re-execs the server so backend edits take effect, but
    only after a fresh interpreter proves the new code still imports.
"""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import sys
import threading
import time
from contextlib import asynccontextmanager
from typing import Callable, Iterable, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import __version__
from .core import Workbench
from .jobs import JobConflict, JobNotFound
from .settings import LMNotConfigured
from .skills import SkillError
from .tester import TestRunnerError
from .workspace import GitError, PathRejected, WorkspaceError
from .agent_tools import ToolRefused

PING_SECONDS = 15.0


class FileBody(BaseModel):
    path: str
    content: str


class MoveBody(BaseModel):
    src: str
    dst: str


class CommitBody(BaseModel):
    message: str


class RollbackBody(BaseModel):
    sha: str


class TestsBody(BaseModel):
    selector: Optional[str] = None
    keyword: Optional[str] = None


class ImproveBody(BaseModel):
    goal: str
    max_attempts: int = Field(default=3, ge=1, le=10)


class ChatBody(BaseModel):
    message: str


class SkillBody(BaseModel):
    content: str


class SettingsBody(BaseModel):
    model: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    max_iters: Optional[int] = None
    allow_unsafe_levers: Optional[bool] = None


LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
PREVIEW_CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
               "img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'")
PAGE_HEADERS = {"Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff"}


def _hostname(value: str) -> str:
    """'127.0.0.1:8765' -> '127.0.0.1', '[::1]:8765' -> '::1', 'Evil.COM' -> 'evil.com'."""
    try:
        return (urlsplit("//" + value.strip()).hostname or "").lower()
    except ValueError:
        return ""


def _status_for(exc: Exception) -> int:
    if isinstance(exc, JobConflict):
        return 409
    if isinstance(exc, (FileNotFoundError, JobNotFound)):
        return 404
    return 400


def _register_files_and_git(api: APIRouter, wb: Workbench, ensure_idle: Callable[[], None]) -> None:
    # -- files ---------------------------------------------------------------------
    @api.get("/tree")
    def tree() -> dict:
        return {"root": str(wb.root), "files": [f.model_dump() for f in wb.workspace.list_files()],
                "protected": list(wb.workspace.protected)}

    @api.get("/file")
    def get_file(path: str) -> dict:
        content = wb.workspace.read(path)
        info = wb.workspace.stat(path)
        return {"path": info.path, "content": content, "size": info.size, "mtime": info.mtime}

    @api.put("/file")
    def put_file(body: FileBody) -> dict:
        ensure_idle()
        info = wb.workspace.write(body.path, body.content)
        return {"ok": True, "path": info.path, "size": info.size}

    @api.delete("/file")
    def delete_file(path: str) -> dict:
        ensure_idle()
        return {"ok": True, "path": wb.workspace.delete(path)}

    @api.post("/file/move")
    def move_file(body: MoveBody) -> dict:
        ensure_idle()
        src, dst = wb.workspace.move(body.src, body.dst)
        return {"ok": True, "src": src, "dst": dst}

    # -- git -----------------------------------------------------------------------
    @api.get("/git/status")
    def git_status() -> dict:
        return wb.workspace.status().model_dump()

    @api.get("/git/log")
    def git_log(limit: int = 30) -> dict:
        return {"commits": [c.model_dump() for c in wb.workspace.log(limit)]}

    @api.get("/git/diff")
    def git_diff(ref: Optional[str] = None) -> dict:
        return {"diff": wb.workspace.diff(ref or None)}

    @api.post("/git/commit")
    def git_commit(body: CommitBody) -> dict:
        ensure_idle()
        return {"sha": wb.workspace.commit(body.message)}

    @api.post("/git/rollback")
    def git_rollback(body: RollbackBody) -> dict:
        ensure_idle()
        return {"head": wb.workspace.rollback(body.sha)}


def _register_work(api: APIRouter, wb: Workbench) -> None:
    # -- tests / audit / improve / jobs -------------------------------------------------
    @api.post("/tests/run")
    def tests_run(body: TestsBody) -> dict:
        job = wb.start_tests_job(body.selector or None, body.keyword or None)
        return {"job_id": job.id}

    @api.get("/tests/last")
    def tests_last() -> Optional[dict]:
        return wb.last_test_report.model_dump(mode="json") if wb.last_test_report else None

    @api.post("/audit")
    def audit() -> dict:
        return wb.run_audit().model_dump(mode="json")

    @api.get("/audit/last")
    def audit_last() -> Optional[dict]:
        return wb.last_audit.model_dump(mode="json") if wb.last_audit else None

    @api.post("/improve")
    def improve(body: ImproveBody) -> dict:
        job = wb.start_improve_job(body.goal, body.max_attempts)
        return {"job_id": job.id}

    @api.get("/jobs")
    def jobs(limit: int = 50) -> dict:
        return {"jobs": [j.model_dump(mode="json") for j in wb.jobs.list(limit)]}

    @api.get("/jobs/{job_id}")
    def job(job_id: str) -> dict:
        return wb.jobs.get(job_id).model_dump(mode="json")

    @api.post("/jobs/{job_id}/cancel")
    def cancel_job(job_id: str) -> dict:
        return {"ok": wb.jobs.cancel(job_id)}


def _register_skills_and_chat(api: APIRouter, wb: Workbench, ensure_idle: Callable[[], None]) -> None:
    # -- skills -----------------------------------------------------------------------
    @api.get("/skills")
    def skills() -> dict:
        return {"skills": [s.model_dump(exclude={"content"}) for s in wb.skills.list()]}

    @api.get("/skills/{name}")
    def skill(name: str) -> dict:
        return wb.skills.get(name).model_dump()

    @api.put("/skills/{name}")
    def put_skill(name: str, body: SkillBody) -> dict:
        ensure_idle()
        saved = wb.skills.put(name, body.content)
        return {"ok": True, "name": saved.name, "path": saved.path}

    @api.delete("/skills/{name}")
    def delete_skill(name: str) -> dict:
        ensure_idle()
        wb.skills.delete(name)
        return {"ok": True, "name": name}

    # -- chat ----------------------------------------------------------------------------
    @api.post("/chat")
    def chat(body: ChatBody) -> dict:
        return wb.chat.handle(body.message).model_dump(mode="json")

    @api.get("/chat/history")
    def chat_history() -> dict:
        return {"messages": [m.model_dump(mode="json") for m in wb.chat.history()]}


def _register_agent_and_events(api: APIRouter, wb: Workbench) -> None:
    # -- agent introspection -----------------------------------------------------------
    @api.get("/tools")
    def tools() -> dict:
        return {"tools": wb.agent().registry.stats()}

    @api.get("/graph")
    def graph() -> dict:
        snap = wb.agent().graph.snapshot()
        nodes = [{"id": n.get("id"), "source": n.get("source", "native"), "calls": n.get("calls", 0),
                  "x": n.get("x", 0.0), "y": n.get("y", 0.0), "z": n.get("z", 0.0)} for n in snap.nodes]
        edges = [{"source": e["source"], "target": e["target"], "weight": e["weight"]} for e in snap.edges]
        return {"nodes": nodes, "edges": edges}

    # -- events ----------------------------------------------------------------------------
    @api.get("/events")
    async def events(request: Request) -> EventSourceResponse:
        sub = wb.bus.subscribe()

        async def stream():
            try:
                yield {"event": "hello", "data": json.dumps({"version": __version__, "root": str(wb.root)})}
                while True:
                    if await request.is_disconnected():
                        break
                    event = await sub.get(timeout=PING_SECONDS)
                    if event is None:
                        yield {"event": "ping", "data": json.dumps({"t": time.time()})}
                        continue
                    yield {"event": event.type, "id": str(event.id), "data": json.dumps(event.data, default=str)}
            finally:
                sub.close()

        return EventSourceResponse(stream())


def _register_restart(api: APIRouter, app: FastAPI, wb: Workbench) -> None:
    # -- restart -------------------------------------------------------------------------
    @api.post("/restart")
    def restart() -> dict:
        argv = app.state.restart_argv
        if not argv:
            raise HTTPException(status_code=400, detail="this server was not launched with `python -m selfwire.workbench`; restart it by hand")
        if wb.jobs.group_busy("workspace"):
            raise HTTPException(status_code=409, detail="a test or improvement job is running; restart after it finishes")
        check = subprocess.run([sys.executable, "-c", "import selfwire.workbench.server"], cwd=os.getcwd(),
                               capture_output=True, text=True, timeout=120, errors="replace")
        if check.returncode != 0:
            tail = (check.stderr or check.stdout).strip().splitlines()[-3:]
            raise HTTPException(status_code=400, detail="restart refused — the code on disk no longer imports: " + " | ".join(tail))

        def reexec() -> None:
            time.sleep(0.5)
            wb.close()
            os.execv(sys.executable, [sys.executable, *argv])

        threading.Thread(target=reexec, name="workbench-restart", daemon=True).start()
        return {"ok": True, "restarting": True}


def _register_pages_and_guard(app: FastAPI, wb: Workbench, allowed_hosts: Iterable[str]) -> None:
    allowed = set(LOOPBACK_HOSTS) | {_hostname(h) or h.lower() for h in allowed_hosts}
    try:
        ui_snapshot: Optional[str] = wb.ui_path().read_text(encoding="utf-8")
    except OSError:
        ui_snapshot = None

    @app.middleware("http")
    async def host_guard(request: Request, call_next):
        host = _hostname(request.headers.get("host", ""))
        if host not in allowed:
            return JSONResponse({"detail": f"host {host or '(none)'!r} is not allowed (DNS-rebinding guard); "
                                           "start the server with --allow-host to permit it"}, status_code=403)
        origin = request.headers.get("origin")
        if origin is not None and _hostname(urlsplit(origin).netloc) not in allowed:
            return JSONResponse({"detail": "cross-origin request refused"}, status_code=403)
        return await call_next(request)

    # -- UI ------------------------------------------------------------------------
    @app.get("/", response_class=HTMLResponse)
    def index() -> HTMLResponse:
        if ui_snapshot is None:
            raise HTTPException(status_code=500, detail=f"dashboard file was unreadable at startup: {wb.ui_path()}")
        return HTMLResponse(ui_snapshot, headers=PAGE_HEADERS)

    @app.get("/preview", response_class=HTMLResponse)
    def preview() -> HTMLResponse:
        """The dashboard file as it is on disk right now (including agent
        edits), rendered with no network access at all."""
        path = wb.ui_path()
        try:
            html = path.read_text(encoding="utf-8")
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"dashboard file unreadable: {path}: {e}")
        return HTMLResponse(html, headers={**PAGE_HEADERS, "Content-Security-Policy": PREVIEW_CSP})


def create_app(
    workbench: Optional[Workbench] = None,
    *,
    root: Optional[str] = None,
    token: Optional[str] = None,
    restart_argv: Optional[list[str]] = None,
    allowed_hosts: Iterable[str] = (),
) -> FastAPI:
    if workbench is None:
        if root is None:
            raise ValueError("create_app needs a Workbench or a root path")
        workbench = Workbench(root)
    wb = workbench

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        wb.close()

    app = FastAPI(title="SelfWire Workbench", version=__version__, lifespan=lifespan)
    app.state.wb = wb
    app.state.token = token or None
    app.state.restart_argv = restart_argv
    _register_pages_and_guard(app, wb, allowed_hosts)
    for exc_type in (PathRejected, GitError, WorkspaceError, FileNotFoundError, JobConflict, JobNotFound,
                     LMNotConfigured, TestRunnerError, SkillError, ToolRefused, ValueError):
        @app.exception_handler(exc_type)
        async def _handle(_request: Request, exc: Exception) -> JSONResponse:
            message = str(exc) if not isinstance(exc, JobNotFound) else f"no such job: {exc}"
            return JSONResponse({"detail": message}, status_code=_status_for(exc))

    def require_token(request: Request) -> None:
        expected = app.state.token
        if not expected:
            return
        supplied = request.headers.get("x-selfwire-token") or request.query_params.get("token") or ""
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="invalid or missing workbench token")

    def ensure_idle() -> None:
        if wb.improve_running():
            raise HTTPException(status_code=409, detail="an improvement job owns the workspace; wait for it or cancel it")

    api = APIRouter(prefix="/api", dependencies=[Depends(require_token)])
    # -- health / settings ---------------------------------------------------------
    @api.get("/health")
    def health() -> dict:
        public = wb.settings.public()
        return {"ok": True, "version": __version__, "root": str(wb.root), "lm_configured": wb.settings.configured(),
                "model": public["model"], "python": sys.version.split()[0]}

    @api.get("/settings")
    def get_settings() -> dict:
        return wb.settings.public()

    @api.post("/settings")
    def post_settings(body: SettingsBody) -> dict:
        fields = body.model_dump(exclude_unset=True)
        return wb.settings.update(**fields)

    _register_files_and_git(api, wb, ensure_idle)
    _register_work(api, wb)
    _register_skills_and_chat(api, wb, ensure_idle)
    _register_agent_and_events(api, wb)
    _register_restart(api, app, wb)
    app.include_router(api)
    return app
