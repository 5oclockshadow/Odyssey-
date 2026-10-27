"""TESTER's door and its loop. uvicorn serve:app --port 8090
The loop reads the repository into the brain, runs every check, fixes what fails in the working copy, then watches for changed files and
lets the graph decide what to re-test. Everything TESTER knows, does and remembers is one graph, served whole at /graph."""
import hmac
import json
import logging
import os
import secrets
import shutil
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

import agent
import checks as C
import ingest
from brain import Brain

logging.basicConfig(level=logging.INFO, format="%(asctime)s tester %(message)s")
log = logging.getLogger("tester")
HERE = Path(__file__).resolve().parent
cfg = yaml.safe_load((HERE / "tester.yaml").read_text())
STATE = Path(os.environ.get("TESTER_STATE") or HERE / "state")
REPO = Path(os.environ.get("TESTER_REPO") or HERE.parents[1])          # the repository: /repo in the container
WORK = Path(os.environ.get("TESTER_WORK") or STATE / "work")           # TESTER's own copy, where it tests and tries fixes
PATCHES, RUNS = STATE / "patches", STATE / "runs.jsonl"
APPLY = os.environ.get("TESTER_APPLY") or cfg.get("apply", "propose")
SYNC_EXCLUDE = [".git", "node_modules", "__pycache__", ".pytest_cache", ".venv", "state"]
STATE.mkdir(parents=True, exist_ok=True)
brain = Brain(STATE / "graph.json")
agent.configure(cfg)


def _token() -> str:
    t = os.environ.get("TESTER_TOKEN", "").strip()
    if t:
        return t
    p = STATE / "token"
    if not p.exists():
        p.write_text(secrets.token_urlsafe(24))
        p.chmod(0o600)
        log.warning("no TESTER_TOKEN set; one was written to %s", p)
    return p.read_text().strip()


TOKEN = _token()


class Loop:
    def __init__(self):
        self.busy, self.last, self.jobs, self.stop = "", None, [], False
        self.wake, self.snap = threading.Event(), {}

    def open(self) -> list:
        with brain._lock:
            return [dict(n) for n in brain.nodes.values() if n["type"] == "finding" and n.get("status") == "open"]

    def sync(self):
        """The working copy follows the repository. TESTER never edits the repository while it tests."""
        WORK.mkdir(parents=True, exist_ok=True)
        if shutil.which("rsync"):
            ex = [a for s in SYNC_EXCLUDE for a in ("--exclude", s)]
            subprocess.run(["rsync", "-a", "--delete", *ex, f"{REPO}/", f"{WORK}/"], capture_output=True, timeout=900)
        else:
            shutil.rmtree(WORK, ignore_errors=True)
            shutil.copytree(REPO, WORK, ignore=shutil.ignore_patterns(*SYNC_EXCLUDE), symlinks=True)

    def run(self, changed=None, names=None, reason="full"):
        t0 = time.time()
        self.busy = "reading"
        self.sync()
        ingest.ingest(brain, REPO, cfg, only=None if changed is None else set(changed))
        ingest.selfmodel(brain, cfg, agent.TOOL_INFO, C.CHECKS)
        p = C.plan(brain, cfg, changed=None if changed is None else sorted(set(changed)), names=names)
        self.busy = "testing"
        found, status = C.run(p, brain, WORK, cfg)
        opened, resolved = self.merge(found, p)
        now_open = self.open()
        rid = "run:" + time.strftime("%Y%m%d-%H%M%S", time.gmtime(t0))
        brain.node(rid, "run", f"{reason} · {len(now_open)} open", reason=reason, ts=t0, seconds=round(time.time() - t0, 1), checks=status,
                   opened=len(opened), resolved=len(resolved), changed=list(changed or [])[:50])
        brain.link("ran", "agent:tester", rid, w=0.4)
        for c in status:
            brain.link("used", rid, "check:" + c, w=0.3)
        old = sorted(i for i, n in brain.nodes.items() if n["type"] == "run")[:-50]
        brain.drop_nodes(old)
        if p.get("full"):
            brain.decay()
        self.last = {"id": rid, "reason": reason, "ts": t0, "seconds": round(time.time() - t0, 1), "checks": status, "open": len(now_open), "opened": opened[:30], "resolved": resolved[:30]}
        with RUNS.open("a") as fh:
            fh.write(json.dumps(self.last) + "\n")
        brain.flush()
        log.info("%s: %d open, %d new, %d resolved in %.0fs", reason, len(now_open), len(opened), len(resolved), time.time() - t0)
        self.busy = "fixing"
        self.fix()
        brain.flush()
        self.busy = ""

    def merge(self, found, p):
        now, seen, opened, resolved = time.time(), set(), [], []
        for f in found:
            fid = "finding:" + f["key"]
            seen.add(fid)
            cur = brain.nodes.get(fid) or {}
            was_open = cur.get("status") == "open"
            if not was_open:
                opened.append(f["title"])
            brain.node(fid, "finding", f["title"], check=f["check"], detail=f["detail"], severity=f["severity"], file=f["file"], line=f["line"], points=f["points"][:24],
                       status="open", first=cur.get("first", now) if was_open else now, last=now, seen=cur.get("seen", 0) + 1)
            brain.link("found_by", fid, "check:" + f["check"], w=0.5)
            for x in f["points"]:
                brain.link("points_at", fid, x, w=0.6)
        for n in self.open():
            if n["id"] not in seen and C.covers(p, n):
                brain.node(n["id"], "finding", n["label"], status="resolved", resolved=now)
                resolved.append(n["label"])
        return opened, resolved

    def tries(self, fid) -> tuple:
        fx = [brain.nodes[e["members"][0]] for e in brain.adjacency().get(fid, []) if e["relation"] in ("fixes", "tried") and e["members"][0] in brain.nodes]
        return len(fx), any(x.get("status") == "verified" for x in fx)

    def as_finding(self, n) -> dict:
        return {"key": n["id"][len("finding:"):], "check": n.get("check", ""), "title": n["label"], "detail": n.get("detail", ""), "severity": n.get("severity", "error"),
                "file": n.get("file", ""), "line": n.get("line", 0), "points": n.get("points", [])}

    def fix(self, only=None):
        """Errors first, cheapest checks first; a finding waits for the owner after max_attempts or while a verified fix is unapplied."""
        if agent.MIND is None:
            return
        rank = {c: i for i, c in enumerate(["py", "lint", "js", "config", "refs", "routes", "compose", "templates", "pytest", "browser"])}
        opened = self.open()
        todo = [n for n in opened if (only is None or n["id"] == only) and n.get("severity") == "error" and n.get("check") not in ("live", "secrets")]
        todo = [n for n in todo if only or (lambda t: t[0] < cfg.get("max_attempts", 2) and not t[1])(self.tries(n["id"]))]
        todo.sort(key=lambda n: (rank.get(n.get("check"), 99), -n.get("w", 0.5)))
        baseline = {n["id"][len("finding:"):] for n in opened}
        for n in todo[: cfg.get("max_fixes_per_run", 6)]:
            res = agent.attempt(self.as_finding(n), brain, WORK, cfg, baseline, PATCHES)
            brain.flush()
            log.info("fix %s: %s %s", n["id"], "verified" if res.get("ok") else "not kept", res.get("why", ""))
            if res.get("ok") and APPLY == "auto" and not brain.nodes[res["fix"]].get("touches_tests"):
                try:
                    out = agent.apply_fix(res["fix"], brain, REPO, PATCHES)
                    self.jobs.append(("run", out["files"], None, "applied " + res["fix"]))
                except (KeyError, ValueError, OSError) as ex:
                    log.warning("could not apply %s: %s", res["fix"], ex)

    def snapshot(self) -> dict:
        return {rel: (st.st_mtime, st.st_size) for rel, _, _, st in ingest.walk(REPO, cfg.get("skip"))}

    def loop(self):
        self.jobs.insert(0, ("run", None, None, "start"))
        self.snap = self.snapshot()
        every, nxt = cfg.get("every_seconds", 1800), time.time() + cfg.get("every_seconds", 1800)
        while not self.stop:
            if self.jobs:
                kind, arg, names, reason = self.jobs.pop(0)
                try:
                    if kind == "run":
                        self.run(changed=arg, names=names, reason=reason)
                        if arg is None:
                            nxt = time.time() + every
                    elif kind == "fix":
                        self.busy = "fixing"
                        self.fix(only="finding:" + arg)
                        brain.flush()
                    elif kind == "apply":
                        out = agent.apply_fix(arg, brain, REPO, PATCHES)
                        brain.flush()
                        log.info("applied %s to %s", arg, ", ".join(out["files"]))
                        self.run(changed=out["files"], reason="applied " + arg)
                except Exception:
                    log.exception("job %s failed", kind)
                self.busy = ""
                continue
            self.wake.wait(cfg.get("watch_seconds", 20))
            self.wake.clear()
            now = self.snapshot()
            changed = sorted(k for k in set(now) | set(self.snap) if now.get(k) != self.snap.get(k))
            self.snap = now
            if changed:
                self.jobs.append(("run", changed, None, f"{len(changed)} file(s) changed"))
            elif time.time() >= nxt:
                self.jobs.append(("run", None, None, "scheduled"))


L = Loop()


@asynccontextmanager
async def lifespan(app):
    if os.environ.get("TESTER_LOOP", "on") != "off":
        threading.Thread(target=L.loop, daemon=True, name="tester-loop").start()
    auto = os.environ.get("BUILD_AUTOSTART") or "resume"          # resume: start again a run the container stopped in · on · off
    if auto == "on" or (auto == "resume" and BUILD.was_running):
        BUILD.start()
    yield
    BUILD.stop(resume=True)
    L.stop = True
    L.wake.set()
    brain.flush()


app = FastAPI(title="TESTER", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["authorization", "content-type"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RunIn(Strict):
    checks: list[str] = []
    files: list[str] = []


class AskIn(Strict):
    text: str


class WriteIn(Strict):
    path: str
    text: str


class PathIn(Strict):
    path: str


class BuildIn(Strict):
    target: int | None = None


class ReplyIn(Strict):
    text: str
    who: str = "OWNER"


EDIT = os.environ.get("TESTER_EDIT", "off") == "on"


def _in_repo(rel: str) -> Path:
    root = REPO.resolve()
    p = (root / rel).resolve()
    if p == root or root not in p.parents or any(s.startswith(".") or s == "state" for s in p.relative_to(root).parts):
        raise HTTPException(400, "path not allowed")
    return p


def owner(request: Request):
    h = request.headers.get("authorization", "")
    if not (h.lower().startswith("bearer ") and hmac.compare_digest(h[7:].strip().encode(), TOKEN.encode())):
        raise HTTPException(401, "TESTER token required")
    return True


@app.get("/health")
def health():
    return {"ok": True, "model": agent.MODEL, "fixing": agent.MIND is not None, "apply": APPLY, "busy": L.busy, "queued": len(L.jobs),
            "open": len(L.open()), "graph": brain.stats(), "last_run": L.last}


@app.get("/graph")
def graph(focus: str = "", hops: int = 2, limit: int = 900, format: str = "connectome"):
    """The whole of TESTER, or the neighbourhood of one node. format=connectome is what apps/ops/src/connectome.js draws; raw is the graph itself."""
    limit = max(1, min(limit, 5000))
    if format == "raw":
        if focus:
            nodes, edges = brain.around([focus], max(1, min(hops, 3)), limit)
        else:
            with brain._lock:
                nodes = sorted((dict(n) for n in brain.nodes.values()), key=lambda n: -n.get("w", 0))[:limit]
                ids = {n["id"] for n in nodes}
                edges = [dict(e) for e in brain.edges.values() if all(m in ids for m in e["members"])]
        return {"nodes": nodes, "edges": edges, "types": brain.types}
    return brain.connectome(focus, max(1, min(hops, 3)), limit)


@app.get("/node/{nid:path}")
def node(nid: str):
    if nid not in brain.nodes:
        raise HTTPException(404, "no such node")
    nodes, edges = brain.around([nid], 1, 150)
    return {"node": brain.nodes[nid], "neighbours": nodes, "edges": edges}


@app.get("/files")
def files():
    """Every file TESTER reads, for the dashboard when it runs against this container."""
    return {"files": [rel for rel, _, _, _ in ingest.walk(REPO, [s for s in cfg.get("skip", []) if s != "dist"])]}


SERVED = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".md": "text/plain"}


@app.get("/repo/{rel:path}")
def repo_file(rel: str):
    """The repository's pages and assets on this origin, so the dashboard can open every page in its live view and read its console.
    Dotfiles (.env), state and anything that is not a page, script, style, data or image are never served."""
    from fastapi.responses import FileResponse
    root = REPO.resolve()
    p = (root / rel).resolve()
    if p == root or root not in p.parents or any(s.startswith(".") or s == "state" for s in p.relative_to(root).parts) or p.suffix.lower() not in SERVED or not p.is_file():
        raise HTTPException(404, "not served")
    return FileResponse(p, media_type=SERVED[p.suffix.lower()], headers={"cache-control": "no-store"})


@app.get("/findings")
def findings(status: str = "open"):
    with brain._lock:
        out = [dict(n) for n in brain.nodes.values() if n["type"] == "finding" and (status == "all" or n.get("status") == status)]
    return {"findings": sorted(out, key=lambda n: (n.get("severity") != "error", n.get("check", ""), -n.get("last", 0)))}


@app.get("/fixes")
def fixes(n: int = 50):
    with brain._lock:
        out = sorted((dict(x) for x in brain.nodes.values() if x["type"] == "fix"), key=lambda x: -x.get("ts", 0))[: max(1, min(n, 500))]
    for x in out:
        p = PATCHES / x.get("patch", "-")
        x["diff"] = p.read_text()[:20000] if x.get("patch") and p.exists() else ""
    return {"fixes": out, "apply": APPLY}


@app.get("/runs")
def runs(n: int = 20):
    rows = RUNS.read_text().splitlines()[-max(1, min(n, 500)):] if RUNS.exists() else []
    return {"runs": [json.loads(r) for r in reversed(rows)]}


@app.post("/run", status_code=202)
def post_run(r: RunIn, _=Depends(owner)):
    bad = [c for c in r.checks if c not in C.CHECKS]
    if bad:
        raise HTTPException(400, f"unknown checks: {bad}; known: {C.CHECKS}")
    L.jobs.append(("run", r.files or None, r.checks or None, "asked"))
    L.wake.set()
    return {"queued": True, "position": len(L.jobs)}


@app.post("/fix/{key}", status_code=202)
def post_fix(key: str, _=Depends(owner)):
    if "finding:" + key not in brain.nodes:
        raise HTTPException(404, "no such finding")
    if agent.MIND is None:
        raise HTTPException(409, "no model is configured, so TESTER cannot fix; set ANTHROPIC_API_KEY")
    L.jobs.append(("fix", key, None, "asked"))
    L.wake.set()
    return {"queued": True}


@app.post("/fixes/{fx}/apply", status_code=202)
def post_apply(fx: str, _=Depends(owner)):
    """Queued ahead of everything else; the loop writes the files, then re-tests what they reach. GET /fixes shows the result."""
    n = brain.nodes.get(fx)
    if not n or n["type"] != "fix":
        raise HTTPException(404, "no such fix")
    if n.get("status") != "verified":
        raise HTTPException(409, f"only a verified fix can be applied; this one is {n.get('status')}")
    L.jobs.insert(0, ("apply", fx, None, "asked"))
    L.wake.set()
    return {"queued": True}


@app.post("/ask")
def post_ask(a: AskIn, _=Depends(owner)):
    return {"answer": agent.ask(brain, a.text[:2000])}


@app.get("/edit")
def edit_enabled():
    """Whether the dashboard may write to disk on this origin (set TESTER_EDIT=on). No token: the dashboard runs in the browser."""
    return {"edit": EDIT}


@app.post("/files/write")
def files_write(w: WriteIn):
    if not EDIT:
        raise HTTPException(403, "editing is off; start the container with TESTER_EDIT=on to write from the dashboard")
    p = _in_repo(w.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(w.text, encoding="utf-8")
    L.jobs.append(("run", [w.path], None, "edited " + w.path))
    L.wake.set()
    return {"ok": True, "path": w.path, "retest": True}


@app.post("/files/delete")
def files_delete(w: PathIn):
    if not EDIT:
        raise HTTPException(403, "editing is off; start the container with TESTER_EDIT=on to delete from the dashboard")
    p = _in_repo(w.path)
    if not p.is_file():
        raise HTTPException(404, "no such file")
    p.unlink()
    return {"ok": True, "path": w.path}


# — the Build Room's loop, server-side: TESTER × SEXTANT over repos/registry.json (build.py) —

import build as B                                   # noqa: E402  (after EDIT and the owner dependency exist)

BUILD = B.Build(cfg, REPO, WORK, STATE, EDIT, ask_tester=lambda t: agent.ask(brain, t) if agent.ASK is not None else None)   # None: no model, so the outbox


@app.get("/build")
def build_status():
    """Round, phase, every repo's status, the site walks, the feed and the outbox: what the Build Room shows."""
    return BUILD.status()


@app.post("/build/start", status_code=202)
def build_start(b: BuildIn, _=Depends(owner)):
    return BUILD.start(b.target)


@app.post("/build/stop", status_code=202)
def build_stop(_=Depends(owner)):
    return BUILD.stop()


@app.get("/build/rounds")
def build_rounds(n: int = 100):
    p = STATE / "build" / "rounds.jsonl"
    rows = p.read_text().splitlines()[-max(1, min(n, 500)):] if p.exists() else []
    return {"rounds": [json.loads(r) for r in rows]}


@app.post("/build/repo/{rid}", status_code=202)
def build_repo(rid: str, _=Depends(owner)):
    """Build and test one repo now (the Build Room's button): at the head of the next round while the loop runs, else at once."""
    out = BUILD.one(rid)
    if not out["ok"]:
        raise HTTPException(404, out["why"])
    return out


@app.post("/build/reply/{rid}")
def build_reply(rid: str, r: ReplyIn, _=Depends(owner)):
    """An agent's reply pasted by the owner: its `--- file:` blocks land in TESTER's draft of the repo and are verified next round."""
    if r.who not in ("OWNER", "SEXTANT", "CLAUDE", "TESTER"):
        raise HTTPException(400, "who is OWNER, SEXTANT, CLAUDE or TESTER")
    out = BUILD.reply(rid, r.text[:400_000], r.who)
    if not out["ok"]:
        raise HTTPException(404 if out["why"] == "no such repo" else 400, out["why"])
    return out


@app.get("/build/files/{rid}")
def build_files(rid: str):
    """A repo's files as the loop tests them: the committed copy with TESTER's draft laid over it (the Build Room's download)."""
    e = BUILD.entry(rid)
    if not e:
        raise HTTPException(404, "no such repo")
    return {"id": rid, "files": BUILD.files_of(e)}


@app.post("/build/reset")
def build_reset(_=Depends(owner)):
    out = BUILD.reset()
    if not out["ok"]:
        raise HTTPException(409, out["why"])
    return out
