"""Threshold Ops: the owner's console service. It sees every container on three docker daemons (the host, the agent's, the site's), streams their
logs, opens a shell in any of them, edits the repository, shows the engine's traces, and hosts a separate ops agent whose only job is to report
on all of it and propose changes. It is not SEXTANT and has no say over the research. Same owner login (cookie and secret) as the engine."""
import asyncio
import contextvars
import hashlib
import hmac
import json
import os
import shutil
import time
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket
from pydantic import BaseModel

WORKSPACE = Path(os.environ.get("WORKSPACE", "/workspace")).resolve()
ENGINE = os.environ.get("ENGINE_URL", "http://agent:8000")
PHOENIX = os.environ.get("PHOENIX_PUBLIC", "http://localhost:6006")
COOKIE = "threshold_owner"
DAEMONS = {"host": os.environ.get("HOST_DOCKER", "unix:///var/run/docker.sock"),
           "agent": os.environ.get("AGENT_DOCKER_HOST", "tcp://agent-dind:2375"),
           "web": os.environ.get("WEB_DOCKER_HOST", "tcp://web-dind:2375")}
PROTECTED = {"ops", "web", "agent", "agent-dind", "web-dind"}        # these can be restarted from here, never stopped or removed from here
HIDDEN = {".git", "node_modules", "__pycache__", ".pytest_cache"}
ACTIONS = {"start", "stop", "restart", "pause", "unpause", "remove"}
CLIENTS: dict = {}
PROPOSALS: contextvars.ContextVar = contextvars.ContextVar("proposals", default=None)
app = FastAPI(title="Threshold Ops")
UI = Path(os.environ.get("UI_DIR", Path(__file__).parent / "ui"))      # built pages: the agent space. Static; every call they make is behind the owner login.
if UI.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/ui", StaticFiles(directory=UI, html=True), name="ui")


# — auth: the engine's cookie, verified here with the same secret —

def verify(token: str | None) -> bool:
    secret = os.environ.get("SESSION_SECRET")
    if not secret or not token or token.count(".") != 2:
        return False
    who, exp, sig = token.split(".")
    good = hmac.compare_digest(hmac.new(secret.encode(), f"{who}.{exp}".encode(), "sha256").hexdigest(), sig)
    return good and who == "owner" and exp.isdigit() and int(exp) > time.time()


def token_of(request) -> str | None:
    auth = request.headers.get("authorization", "")
    return request.cookies.get(COOKIE) or (auth[7:] if auth.lower().startswith("bearer ") else None)


def owner(request: Request):
    if not verify(token_of(request)):
        raise HTTPException(401, "owner login required (SESSION_SECRET must match the engine's)")
    return token_of(request)


# — containers —

def client(daemon: str):
    if daemon not in DAEMONS:
        raise HTTPException(404, f"unknown daemon {daemon}")
    if daemon not in CLIENTS:
        import docker
        CLIENTS[daemon] = docker.DockerClient(base_url=DAEMONS[daemon], timeout=20)
    return CLIENTS[daemon]


def row(daemon: str, c) -> dict:
    a = c.attrs
    st, cfg = a.get("State", {}), a.get("Config", {})
    ports = [f"{p.split('/')[0]}→{b[0]['HostPort']}" for p, b in (a.get("NetworkSettings", {}).get("Ports") or {}).items() if b]
    return {"daemon": daemon, "id": c.id[:12], "name": c.name, "image": cfg.get("Image", ""), "state": st.get("Status", "?"),
            "health": (st.get("Health") or {}).get("Status", ""), "started": st.get("StartedAt", ""), "restarts": a.get("RestartCount", 0),
            "exit": st.get("ExitCode", 0), "ports": ports, "protected": c.name in PROTECTED}


def containers() -> tuple[list, dict]:
    out, errs = [], {}
    for d in DAEMONS:
        try:
            out += [row(d, c) for c in client(d).containers.list(all=True)]
        except Exception as ex:
            errs[d] = str(ex)[:140]
    return out, errs


def find(daemon: str, name: str):
    try:
        return client(daemon).containers.get(name)
    except Exception:
        raise HTTPException(404, f"no container {name} on {daemon}")


def act_container(daemon: str, name: str, action: str) -> dict:
    if action not in ACTIONS:
        raise HTTPException(400, f"action must be one of {sorted(ACTIONS)}")
    if name in PROTECTED and action in ("stop", "remove", "pause"):
        raise HTTPException(403, f"{name} holds the stack up; restart it, or use the host shell to {action} it")
    c = find(daemon, name)
    getattr(c, "remove" if action == "remove" else action)(**({"force": True} if action == "remove" else {}))
    return {"ok": True, "daemon": daemon, "name": name, "action": action}


def logs(daemon: str, name: str, tail: int = 200) -> str:
    return find(daemon, name).logs(tail=max(1, min(tail, 2000)), timestamps=True).decode(errors="replace")


# — files: the repository, confined to the workspace —

def safe(rel: str) -> Path:
    p = (WORKSPACE / rel.lstrip("/")).resolve()
    if p != WORKSPACE and WORKSPACE not in p.parents:
        raise HTTPException(400, "outside the workspace")
    if HIDDEN & set(p.relative_to(WORKSPACE).parts):
        raise HTTPException(403, "hidden")
    return p


def listing(rel: str = "") -> list[dict]:
    p = safe(rel)
    if not p.is_dir():
        raise HTTPException(404, "not a directory")
    return sorted(({"name": f.name, "dir": f.is_dir(), "path": f.relative_to(WORKSPACE).as_posix()} for f in p.iterdir() if f.name not in HIDDEN),
                  key=lambda e: (not e["dir"], e["name"].lower()))


def read(rel: str) -> dict:
    p = safe(rel)
    if not p.is_file():
        raise HTTPException(404, "no such file")
    if p.stat().st_size > 1_000_000:
        raise HTTPException(413, "over 1 MB")
    try:
        return {"path": rel, "content": p.read_text()}
    except UnicodeDecodeError:
        raise HTTPException(415, "not a text file")


def write(rel: str, content: str) -> dict:
    p = safe(rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    return {"ok": True, "path": rel, "bytes": len(content.encode())}


def remove(rel: str) -> dict:
    p = safe(rel)
    if p == WORKSPACE:
        raise HTTPException(403, "not the workspace")
    shutil.rmtree(p) if p.is_dir() else p.unlink()
    return {"ok": True}


def search(query: str, limit: int = 40) -> list[dict]:
    out = []
    for f in WORKSPACE.rglob("*"):
        if len(out) >= limit or not f.is_file() or HIDDEN & set(f.relative_to(WORKSPACE).parts) or f.stat().st_size > 400_000:
            continue
        try:
            for i, ln in enumerate(f.read_text().splitlines(), 1):
                if query.lower() in ln.lower():
                    out.append({"path": f.relative_to(WORKSPACE).as_posix(), "line": i, "text": ln.strip()[:160]})
                    break
        except (UnicodeDecodeError, OSError):
            continue
    return out


# — the engine, seen from here —

async def engine(path: str, token: str | None = None):
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get(f"{ENGINE}{path}", cookies={COOKIE: token} if token else None)
            return r.json() if r.status_code == 200 else {"error": r.status_code}
    except Exception as ex:
        return {"error": str(ex)[:120]}


async def state(token: str | None = None) -> dict:
    (cs, errs), health = await asyncio.to_thread(containers), await engine("/health")
    spans = await engine("/owner/spans?n=60", token)
    return {"now": time.time(), "containers": cs, "daemon_errors": errs, "engine": health, "phoenix": PHOENIX, "spans": spans if "error" not in spans else {"error": spans["error"]},
            "summary": {"running": sum(c["state"] == "running" for c in cs), "total": len(cs), "unhealthy": sum(c["health"] == "unhealthy" or (c["state"] == "exited" and c["exit"] != 0) for c in cs)}}


# — routes —

@app.get("/state")
async def get_state(token=Depends(owner)):
    return await state(token)


@app.post("/containers/{daemon}/{name}/{action}")
async def post_action(daemon: str, name: str, action: str, _=Depends(owner)):
    return await asyncio.to_thread(act_container, daemon, name, action)


@app.get("/containers/{daemon}/{name}/logs")
async def get_logs(daemon: str, name: str, tail: int = 200, _=Depends(owner)):
    return {"logs": await asyncio.to_thread(logs, daemon, name, tail)}


@app.get("/fs")
def get_fs(path: str = "", _=Depends(owner)):
    return {"entries": listing(path)}


@app.get("/file")
def get_file(path: str, _=Depends(owner)):
    return read(path)


class FileBody(BaseModel):
    path: str
    content: str = ""


@app.put("/file")
def put_file(b: FileBody, _=Depends(owner)):
    return write(b.path, b.content)


@app.delete("/file")
def delete_file(path: str, _=Depends(owner)):
    return remove(path)


@app.get("/search")
def get_search(q: str, _=Depends(owner)):
    return {"hits": search(q)}


class Chat(BaseModel):
    text: str


@app.post("/chat")
async def post_chat(c: Chat, token=Depends(owner)):
    import agent
    return await agent.ask(c.text, token)


class Run(BaseModel):
    kind: str                     # container | edit
    daemon: str = ""
    name: str = ""
    action: str = ""
    path: str = ""
    content: str = ""


@app.post("/run")
async def post_run(r: Run, _=Depends(owner)):
    """Runs a proposal the operator clicked. Nothing the ops agent suggests happens before this call."""
    if r.kind == "container":
        return await asyncio.to_thread(act_container, r.daemon, r.name, r.action)
    if r.kind == "edit":
        return await asyncio.to_thread(write, r.path, r.content)
    raise HTTPException(400, "kind must be container or edit")


@app.websocket("/ws/exec/{daemon}/{name}")
async def ws_exec(ws: WebSocket, daemon: str, name: str):
    """A real pty in any container: the browser's xterm.js on one end, docker exec on the other. A frame starting with \\x01 is a resize."""
    if not verify(ws.cookies.get(COOKIE)):
        await ws.close(4401)
        return
    await ws.accept()
    api = client(daemon).api
    ex = api.exec_create(find(daemon, name).id, ["/bin/sh", "-c", "exec bash -l 2>/dev/null || exec sh"], tty=True, stdin=True)
    raw = api.exec_start(ex["Id"], tty=True, socket=True)._sock

    async def pump():
        while True:
            data = await asyncio.to_thread(raw.recv, 4096)
            if not data:
                break
            await ws.send_bytes(data)
        await ws.close()

    task = asyncio.create_task(pump())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("text") or (msg.get("bytes") or b"").decode(errors="ignore")
            if data.startswith("\x01"):
                size = json.loads(data[1:])
                api.exec_resize(ex["Id"], height=int(size["rows"]), width=int(size["cols"]))
            else:
                raw.send(data.encode())
    finally:
        task.cancel()
        raw.close()
