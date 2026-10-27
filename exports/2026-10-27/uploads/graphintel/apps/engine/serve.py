"""The engine's door. Behind the site's nginx it is /api/. uvicorn serve:app --port 8000
All wiring lives in main.py; this file is only the HTTP surface and the lifespan that runs the same loops."""
import asyncio
import json
import logging
import os
import re
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

import observe
import tools
observe.sign_module(tools)                        # runtime signatures first, so the agent's tool list holds the signed functions
import round as R                                 # noqa: E402  (imports tools, builds the agent)
import auth                                       # noqa: E402
import bus                                        # noqa: E402
import day                                        # noqa: E402
import display                                    # noqa: E402
import fleet                                      # noqa: E402
import labs                                       # noqa: E402
import apikeys                                    # noqa: E402
import ledger                                     # noqa: E402
import provenance                                 # noqa: E402
import reprice                                   # noqa: E402
import sim                                       # noqa: E402
import v1                                        # noqa: E402
import signals                                    # noqa: E402
import heal                                       # noqa: E402
import main as loop                               # noqa: E402
import mindful                                    # noqa: E402
import oversight                                  # noqa: E402
import publishing                                 # noqa: E402
import sandbox                                    # noqa: E402
import upgrades                                   # noqa: E402

for m in (R, heal, sandbox, upgrades):
    observe.sign_module(m)
cfg, graph = R.cfg, R.graph
loop.setup()
log = logging.getLogger("serve")


@asynccontextmanager
async def lifespan(app):
    loop.bind(asyncio.get_running_loop())
    tasks = [asyncio.create_task(c) for c in [loop.boot(), *loop.coroutines()]]
    yield
    for t in tasks:
        t.cancel()
    graph.flush()


app = FastAPI(title="The Threshold Institute", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")          # unknown fields are refused at every trust boundary


class Intake(Strict):
    text: str
    kind: str = "chat"            # chat · contact · ingest · research


class Login(Strict):
    password: str


class Action(Strict):
    id: str                       # incident:<fp> · post:<file> · app:<name> · upgrade:<key> · day:reflect
    action: str


class Code(Strict):
    language: str
    code: str
    files: dict = {}
    command: str = ""


class Ship(Strict):
    name: str
    language: str
    files: dict
    port: int = 0


class Event(Strict):
    name: str                     # exam_passed · subscribed · app_opened · site_error · anything the site or an app wants the graph to know
    data: dict = {}
    actor: str = "institute"


class Topic(Strict):
    text: str


def _ip(request: Request) -> str:
    return request.client.host if request.client else "?"


# — public: the site —

@app.post("/round")
async def post_round(i: Intake, request: Request):
    """The site's chat and contact. Visitors get the published graph and no tools, and nothing they say is merged. Queued work is the owner's: /owner/queue."""
    auth.ratelimit(f"round:{_ip(request)}", 20, 60)
    if i.kind not in ("chat", "contact") or len(i.text) > 4000:
        raise HTTPException(400, "kind must be chat or contact, text under 4000 characters")
    r = await R.round(i.text, i.kind, public=True)
    return {"answer": r.answer}


@app.get("/public/graph")
def public_graph(request: Request, focus: str = "institute", hops: int = 2):
    """The hop view for everyone: published things in full, everything else a grey shape with an opaque id."""
    auth.ratelimit(f"pg:{_ip(request)}", 60, 60)
    return publishing.hood(graph, focus, hops, public=True)


@app.get("/public/notes")
def public_notes():
    return {"notes": publishing.notes()}


@app.get("/public/questions")
def public_questions():
    return {"questions": publishing.questions(graph)}


@app.get("/public/feed")
def public_feed(n: int = 30):
    return {"feed": publishing.feed(min(n, 100))}


@app.get("/public/counters")
def public_counters():
    return publishing.counters(graph)


@app.get("/graph")
def get_graph(k: int = 200):
    """Legacy shape for the site's dashboard, filtered to what is published."""
    ok = {i for i, n in graph.nodes.items() if n.get("pub")}
    top = sorted((e for e in graph.edges.values() if e.get("pub") and not e.get("tel") and all(m in ok for m in e["members"])), key=lambda e: -e["w"])[:k]
    return {"types": graph.types, "nodes": {i: graph.nodes[i] for i in ok}, "edges": top, "stats": publishing.counters(graph)}


@app.get("/apps")
def get_apps():
    return sandbox.registry()


@app.post("/event")
def post_event(e: Event, request: Request):
    """All data from everywhere: the site and the shipped apps write what happens to them straight into the graph, no model involved.
    An event whose name ends in _error is also an incident, so the owner sees it; site errors are known, not auto-patched."""
    auth.ratelimit(f"event:{_ip(request)}", 60, 60)
    if len(e.name) > 80 or len(str(e.data)) > 4000:
        raise HTTPException(400, "event too large")
    eid = observe.event(e.name, e.data, e.actor if e.actor in graph.nodes else "institute")
    if e.name.endswith("_error"):
        heal.on_incident({"source": "site", "code": f"code:site.{str(e.data.get('where', 'page'))[:40]}", "type": e.name, "message": str(e.data.get("message", ""))[:300],
                          "stack": str(e.data.get("stack", ""))[:3000], "span": None})
    return {"id": eid}


@app.get("/health")
def health():
    return {"ok": True, "model": cfg["model"], "concurrency": cfg["concurrency"], "pending": loop.queue.qsize(),
            "sandbox": {"agent": sandbox.available("agent"), "web": sandbox.available("web")}, "redis": bool(bus.STORE._conn()),
            "graph": {"nodes": len(graph.nodes), "edges": len(graph.edges)}}


# — the owner —

@app.post("/auth/login")
def login(l: Login, request: Request, response: Response):
    ip = _ip(request)
    try:
        auth.throttle(ip)
    except HTTPException:
        auth.audit("login", "locked_out", ip=ip)
        raise
    if not auth.password_ok(l.password):
        auth.audit("login", "fail", ip=ip)
        raise HTTPException(401, "wrong password" if (os.environ.get("OWNER_PASSWORD") or os.environ.get("OWNER_PASSWORD_HASH")) else "set OWNER_PASSWORD in .env first")
    token = auth.issue()
    auth.audit("login", "success", ip=ip)
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", secure=request.url.scheme == "https", max_age=auth.max_age(), path="/")
    return {"ok": True, "token": token}


@app.post("/auth/logout")
def logout(request: Request, response: Response):
    auth.audit("logout", "success", ip=_ip(request))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@app.get("/auth/check")
def check(_=Depends(auth.owner)):
    return {"ok": True}


@app.get("/owner/graph")
def owner_graph(focus: str = "institute", hops: int = 2, _=Depends(auth.owner)):
    """The agent's own view: everything, ungreyed, with what is published marked."""
    return publishing.hood(graph, focus, hops, public=False)


@app.get("/owner/record")
def owner_record(n: int = 40, _=Depends(auth.owner)):
    """Every round, newest first: kind, intake, tool calls, reasoning, answer, energy change."""
    return {"rounds": publishing._rounds()[-max(1, min(n, 200)):][::-1]}


@app.post("/owner/chat")
async def owner_chat(i: Intake, _=Depends(auth.owner)):
    r = await R.round(i.text, "chat")
    return {"answer": r.answer, "energy": r.energy.model_dump(), "minted": [t.name for t in r.definitions], "nodes": len(r.nodes), "hyperedges": len(r.hyperedges)}


@app.post("/owner/queue")
def owner_queue(i: Intake, _=Depends(auth.owner)):
    if i.kind not in ("ingest", "research"):
        raise HTTPException(400, "kind must be ingest or research")
    loop.put(i.kind, i.text)
    return {"queued": True, "pending": loop.queue.qsize()}


class Batch(Strict):
    title: str
    node_ids: list[str]
    edge_ids: list[str] = []
    note: str = ""
    sources: list[str] = []
    now: bool = False             # true: the owner publishes it directly


@app.get("/owner/publish")
def owner_publish(_=Depends(auth.owner)):
    return {"batches": publishing.load()[::-1]}


@app.post("/owner/publish")
def owner_publish_new(b: Batch, request: Request, _=Depends(auth.owner)):
    auth.audit("publish", "now" if b.now else "proposed", ip=_ip(request), title=b.title, nodes=len(b.node_ids))
    if b.now:
        return publishing.publish_now(b.title, b.node_ids, b.note, graph)
    return publishing.propose(b.title, b.node_ids, b.edge_ids, b.note, b.sources)


@app.get("/owner/mindful")
def owner_mindful(_=Depends(auth.owner)):
    return {**mindful.state(), "enabled": bool(cfg["publish"].get("enabled"))}


@app.get("/owner/hub")
async def owner_hub(_=Depends(auth.owner)):
    return {"servers": json.loads(await tools.hub_call("servers_list")), "audit": json.loads(await tools.hub_call("audit_tail", {"n": 40}))}


@app.get("/owner/hub/market")
async def owner_hub_market(q: str, _=Depends(auth.owner)):
    return {"results": json.loads(await tools.hub_call("market_search", {"query": q}))}


class AgentIn(Strict):
    name: str | None = None
    role: str | None = None
    where: str | None = None
    parent: str | None = None
    sources: list[str] | None = None
    every: int | None = None
    prompt: str | None = None
    enabled: bool | None = None


class SourceIn(Strict):
    kind: str | None = None
    url: str | None = None
    geo: str | None = None
    label: str | None = None
    every: int | None = None
    limit: int | None = None
    enabled: bool | None = None
    tags: list[str] | None = None


class WidgetIn(Strict):
    id: str | None = None
    type: str | None = None
    title: str | None = None
    source: str | None = None
    geo: str | None = None
    text: str | None = None
    size: int | None = None
    view: str | None = None
    limit: int | None = None
    enabled: bool | None = None
    order: int | None = None


def _do(f, *a):
    """Owner CRUD: a refusal is a 400 with the reason, an unknown id a 404."""
    try:
        return f(*a)
    except KeyError as ex:
        raise HTTPException(404, f"no such id: {ex.args[0]}")
    except ValueError as ex:
        raise HTTPException(400, str(ex))


@app.get("/owner/fleet")
def owner_fleet(_=Depends(auth.owner)):
    return {"agents": fleet.list_(), "history": fleet.history(40), "max": fleet.CFG.get("max", 12)}


@app.post("/owner/fleet")
def owner_fleet_create(a: AgentIn, request: Request, _=Depends(auth.owner)):
    auth.audit("fleet", "create", ip=_ip(request), target=a.name or "")
    return _do(fleet.create, a.model_dump(exclude_none=True), "owner")


@app.put("/owner/fleet/{id}")
def owner_fleet_update(id: str, a: AgentIn, request: Request, _=Depends(auth.owner)):
    auth.audit("fleet", "update", ip=_ip(request), target=id)
    return _do(fleet.update, id, a.model_dump(exclude_none=True), "owner")


@app.delete("/owner/fleet/{id}")
def owner_fleet_delete(id: str, request: Request, _=Depends(auth.owner)):
    auth.audit("fleet", "delete", ip=_ip(request), target=id)
    return {"removed": _do(fleet.delete, id, "owner")}


@app.post("/owner/fleet/{id}/{action}")
def owner_fleet_act(id: str, action: str, _=Depends(auth.owner)):
    return _do(fleet.act, id, action, "owner")


@app.get("/owner/fleet/{id}/logs")
def owner_fleet_logs(id: str, n: int = 80, _=Depends(auth.owner)):
    return {"logs": _do(fleet.logs, id, max(1, min(n, 500)))}


@app.get("/owner/sources")
def owner_sources(_=Depends(auth.owner)):
    return {"sources": signals.all_sources(), "status": signals.status()}


@app.post("/owner/sources")
def owner_sources_add(s: SourceIn, _=Depends(auth.owner)):
    return _do(signals.add, s.model_dump(exclude_none=True), "owner")


@app.put("/owner/sources/{id}")
def owner_sources_update(id: str, s: SourceIn, _=Depends(auth.owner)):
    return _do(signals.update, id, s.model_dump(exclude_none=True), "owner")


@app.delete("/owner/sources/{id}")
def owner_sources_remove(id: str, _=Depends(auth.owner)):
    return _do(signals.remove, id)


@app.post("/owner/sources/{id}/run")
async def owner_sources_run(id: str, _=Depends(auth.owner)):
    _do(signals.get, id)
    return {"queued": await signals.pump(loop.put, bus.STORE, only=id), "status": signals.status().get(id)}


@app.get("/owner/trends")
def owner_trends(geo: str = "US", _=Depends(auth.owner)):
    try:
        return {"geo": geo.upper(), "items": signals.trends_live(geo[:2].upper())}
    except Exception as ex:
        raise HTTPException(502, f"google trends unreachable: {str(ex)[:120]}")


@app.get("/owner/display")
def owner_display(_=Depends(auth.owner)):
    return {"widgets": display.data({"nodes": len(graph.nodes), "edges": len(graph.edges), "pending": loop.queue.qsize(), "model": cfg["model"]})}


@app.post("/owner/display")
def owner_display_set(w: WidgetIn, _=Depends(auth.owner)):
    return _do(display.upsert, w.model_dump(exclude_none=True), "owner")


@app.delete("/owner/display/{id}")
def owner_display_remove(id: str, _=Depends(auth.owner)):
    return {"removed": _do(display.remove, id)}


class Say(Strict):
    text: str
    to: str = "sextant"


@app.get("/owner/board")
def owner_board(n: int = 60, _=Depends(auth.owner)):
    """What the Institute is doing: planned, ongoing and recently done work, by actor, and who is in the fleet right now."""
    agents = fleet.list_()
    return {"tasks": ledger.board(max(4, min(n, 200))), "actors": ledger.actors(agents), "counts": ledger.counts(), "pending": loop.queue.qsize()}


@app.get("/owner/stream")
def owner_stream(n: int = 120, _=Depends(auth.owner)):
    """The live back and forth: the brain assigning, sub-agents reporting, the brain thinking aloud, and your own messages."""
    return {"messages": ledger.stream(n)}


@app.post("/owner/say")
async def owner_say(s: Say, _=Depends(auth.owner)):
    """Say something to the brain, or to one sub-agent (to='sub:<name>'). To the brain it is a chat round; to a sub-agent it becomes its next instruction."""
    text = s.text.strip()
    if not text or len(text) > 4000:
        raise HTTPException(400, "text must be 1–4000 characters")
    ledger.say("owner", s.to, "msg", text)
    if s.to in ("sextant", "brain"):
        r = await R.round(text, "chat")
        return {"answer": r.answer}
    name = s.to.split(":", 1)[-1]
    _do(fleet.update, name, {"prompt": text}, "owner")
    ledger.say("sextant", s.to, "assign", text)
    return {"answer": f"Passed to {name}; it is now its standing instruction."}


class BuilderSay(Strict):
    text: str
    repo: str = ""


@app.post("/builder/say")
async def builder_say(s: BuilderSay, who: str = Depends(auth.builder)):
    """TESTER's build loop (apps/tester/build.py) briefs SEXTANT: one chat round, in the stream as tester → sextant. SEXTANT answers with
    `--- file:` blocks that TESTER lays over its draft of the repo and verifies. A build token opens this door and no other."""
    text = s.text.strip()
    if not text or len(text) > 6000:
        raise HTTPException(400, "text must be 1–6000 characters")
    auth.ratelimit("builder", 30, 60)
    ledger.say("tester", "sextant", "msg", text)
    r = await R.round(f"[from TESTER's build loop{' · ' + s.repo[:80] if s.repo else ''}]\n{text}", "chat")
    ledger.say("sextant", "tester", "report", r.answer)
    return {"answer": r.answer}


@app.get("/owner/mind")
def owner_mind(focus: str = "institute", hops: int = 2, _=Depends(auth.owner)):
    """The graph as the thing that does the thinking: the neighbourhood, the goals and questions it holds, consistency energy, and what it minted."""
    hood = publishing.hood(graph, focus, hops, public=False)
    kind = lambda t: [{"id": n["id"], "label": n.get("label", ""), "type": n.get("type"), "pub": bool(n.get("pub")), "falsifier": n.get("falsifier", ""), "core": bool(n.get("core"))} for n in graph.nodes.values() if n.get("type") == t]
    rec = publishing._rounds()[-60:]
    energy = [{"ts": r.get("ts"), "delta": round(float((r.get("energy") or {}).get("delta", 0.0)), 3), "kind": r.get("kind"), "title": (r.get("intake") or "")[:90]} for r in rec]
    live = [e for e in graph.edges.values() if not e.get("tel")]
    return {"focus": focus, "hood": hood, "goals": kind("goal"), "questions": kind("question"), "hypotheses": kind("hypothesis"), "types": graph.types,
            "counts": {"nodes": len(graph.nodes), "edges": len(graph.edges), "types": len(graph.types), "reasoning_nodes": sum(1 for n in graph.nodes.values() if not n.get("tel")), "inferred": sum(1 for e in live if e.get("inferred"))},
            "energy": energy, "weakest": sorted(({"id": e["id"], "relation": e["relation"], "members": e["members"], "w": round(e["w"], 3)} for e in live), key=lambda e: e["w"])[:8],
            "strongest": sorted(({"id": e["id"], "relation": e["relation"], "members": e["members"], "w": round(e["w"], 3)} for e in live), key=lambda e: -e["w"])[:8],
            "minted": [t for t in graph.types if t not in (R.cfg.get("seed", {}).get("types") or {}) and t not in (R.cfg.get("observe", {}).get("types") or {})]}


@app.get("/owner/labs")
def owner_labs(lab: str | None = None, _=Depends(auth.owner)):
    """Every lab: its phases and exit tests, what it honestly cannot do, its candidates and the real runs filed against them."""
    return {"labs": labs.status(lab)}


@app.post("/owner/labs/{lab}/{id}/run")
async def owner_lab_run(lab: str, id: str, _=Depends(auth.owner)):
    out = await tools.lab_run(lab, id)
    if out.startswith("refused") or out.startswith("sandbox unavailable"):
        raise HTTPException(400, out)
    return json.loads(out)


@app.post("/owner/labs/{lab}/{id}/close")
def owner_lab_close(lab: str, id: str, request: Request, why: str = "closed by the owner", _=Depends(auth.owner)):
    auth.audit("lab", "close", ip=_ip(request), target=f"{lab}/{id}")
    return _do(labs.close, lab, id, why, "owner")


class Tenant(Strict):
    name: str | None = None
    plan: str | None = None
    cap_usd: float | None = None
    active: bool | None = None
    child_safe: bool | None = None


class Server(Strict):
    name: str


@app.get("/owner/config")
def owner_config(_=Depends(auth.owner)):
    """What the owner can see of how the Institute is set up: model, concurrency, the agent's tools, the day, the labs, publishing and the session."""
    pub = cfg.get("publish", {})
    return {"model": cfg["model"], "concurrency": cfg["concurrency"], "tools": cfg["agent"]["tools"], "autonomy": {k: cfg["autonomy"][k] for k in ("drive_every_seconds", "max_pending")},
            "staffing": {k: (cfg.get("staffing") or {}).get(k) for k in ("enabled", "every_seconds")}, "labs": list((cfg.get("labs") or {}).keys()),
            "schedule": (cfg.get("day") or {}).get("schedule", []), "publish": {"enabled": bool(pub.get("enabled")), "approval": pub.get("approval"), "mindful": pub.get("mindful", {})},
            "session": {"hours": cfg.get("owner", {}).get("session_hours", 12), "auth": "password set" if (os.environ.get("OWNER_PASSWORD") or os.environ.get("OWNER_PASSWORD_HASH")) else "no password set",
                        "hash_mode": bool(os.environ.get("OWNER_PASSWORD_HASH")), "retention_days": cfg.get("retention_days", 90)},
            "github": {"repo": os.environ.get("GITHUB_REPO") or cfg.get("github", {}).get("repo", ""), "base": cfg.get("github", {}).get("base", "main")},
            "site": {"apps_live": len(sandbox.registry()["apps"]), "ports": sandbox.registry().get("ports", [])}}


@app.post("/owner/hub/install")
async def owner_hub_install(s: Server, request: Request, _=Depends(auth.owner)):
    """Install an MCP server from the market into the agent's hub (the agent can do this too; this is the owner's hand on the same lever)."""
    auth.audit("mcp", "install", ip=_ip(request), target=s.name)
    try:
        return {"result": json.loads(await tools.hub_call("market_install", {"name": s.name}))}
    except Exception as ex:
        raise HTTPException(502, f"hub: {str(ex)[:160]}")


@app.post("/owner/hub/remove")
async def owner_hub_remove(s: Server, request: Request, _=Depends(auth.owner)):
    auth.audit("mcp", "remove", ip=_ip(request), target=s.name)
    try:
        return {"result": json.loads(await tools.hub_call("server_remove", {"name": s.name}))}
    except Exception as ex:
        raise HTTPException(502, f"hub: {str(ex)[:160]}")


@app.get("/owner/api")
def owner_api(_=Depends(auth.owner)):
    """The paid-API tenant sheet and the earnings summed from real metered calls."""
    return apikeys.sheet()


@app.post("/owner/api")
def owner_api_create(t: Tenant, request: Request, _=Depends(auth.owner)):
    auth.audit("api", "create_tenant", ip=_ip(request), target=t.name or "")
    return _do(apikeys.create, t.name or "", t.plan or "metered", t.cap_usd if t.cap_usd is not None else 100.0, "owner")


@app.put("/owner/api/{tid}")
def owner_api_update(tid: str, t: Tenant, _=Depends(auth.owner)):
    return _do(apikeys.update, tid, t.model_dump(exclude_none=True), "owner")


@app.post("/owner/api/{tid}/rotate")
def owner_api_rotate(tid: str, _=Depends(auth.owner)):
    return _do(apikeys.rotate, tid)


@app.delete("/owner/api/{tid}")
def owner_api_remove(tid: str, _=Depends(auth.owner)):
    return {"removed": _do(apikeys.remove, tid)["id"]}


@app.get("/owner/provenance")
def owner_provenance(n: int = 300, _=Depends(auth.owner)):
    """Who did what, what it asked and read, and where each agent sits: agents → work → questions → claims and sources, with durations."""
    out = provenance.build(graph.nodes, graph.edges, fleet.list_(), ledger.board(max(10, min(n, 400))))
    out["world"] = sim.status(cfg)
    return out


@app.get("/public/provenance")
def public_provenance(n: int = 300):
    """The same view for everyone else: published nodes only, agents by number, no answers."""
    out = provenance.build(graph.nodes, graph.edges, fleet.list_(), ledger.board(max(10, min(n, 400))), public=True)
    out["world"] = {"mode": sim.mode(cfg)}
    return out


@app.get("/owner/brain")
def owner_brain(n: int = 300, _=Depends(auth.owner)):
    """The agent's own brain: the institute graph plus SEXTANT itself, its tools, its source and its recent thoughts."""
    out = provenance.brain(graph.nodes, graph.edges, fleet.list_(), ledger.board(max(10, min(n, 400))), cfg["agent"]["tools"],
                            [m for m in ledger.stream(300) if m.get("kind") == "thought"])
    out["world"] = sim.status(cfg)
    return out


# — testers: ten invited seats that judge the brain —

class TesterLogin(Strict):
    user: str
    code: str


class TesterAsk(Strict):
    text: str
    key: str = ""                 # the brain element asked: a:<agent>, w:<work>, n:<node>, s:<self>


@app.post("/tester/login")
def tester_login(i: TesterLogin, request: Request):
    """Seat and code in, a signed session naming the seat out. Throttled and audited like the owner's login."""
    ip = request.client.host if request.client else ""
    auth.throttle(ip)
    s = auth.seat(i.user)
    if not auth.tester_ok(i.user, i.code):
        auth.audit("tester_login", "denied", actor="tester", ip=ip, seat=s)
        raise HTTPException(401, "unknown seat or code")
    auth.audit("tester_login", "ok", actor="tester-" + s, ip=ip)
    return {"token": auth.issue(who="tester-" + s), "seat": s}


@app.get("/tester/brain")
def tester_brain(n: int = 300, who: str = Depends(auth.tester)):
    """The brain testers are here to judge: the graph, SEXTANT, its tools, its source and its recent thoughts. Read-only."""
    out = provenance.brain(graph.nodes, graph.edges, fleet.list_(), ledger.board(max(10, min(n, 400))), cfg["agent"]["tools"],
                            [m for m in ledger.stream(300) if m.get("kind") == "thought"])
    out["world"] = {"mode": sim.mode(cfg)}
    out["seat"] = who
    return out


@app.post("/tester/ask")
async def tester_ask(i: TesterAsk, who: str = Depends(auth.tester)):
    """A tester talks to one element of the brain. It runs as a chat round, so what testers report lands in the graph."""
    auth.ratelimit("tester:" + who, 20, 60)
    key = re.sub(r"[^A-Za-z0-9:._\-]", "", i.key)[:120] or "a:sextant"
    r = await R.round(f"[{who} asks brain element {key}] {i.text[:2000]}", "chat")
    return {"answer": r.answer, "key": key, "energy": r.energy.model_dump(), "nodes": len(r.nodes)}


class WorldIn(Strict):
    mode: str | None = None
    turn: bool = False


class LimitIn(Strict):
    status: str | None = None
    plan: str | None = None
    owner_needed: str | None = None


app.include_router(v1.router)


@app.get("/owner/apps")
def owner_apps(_=Depends(auth.owner)):
    """The apps the agent has shipped and their health, for the owner's Site tab."""
    return sandbox.registry()


@app.get("/owner/world")
def owner_world(_=Depends(auth.owner)):
    """Where the outside world comes from: simulated by the DSPy world-agent, or live from the real feeds, and what the simulation has produced."""
    return sim.status(cfg)


@app.post("/owner/world")
async def owner_world_set(w: WorldIn, request: Request, _=Depends(auth.owner)):
    auth.audit("world", "set", ip=_ip(request), target=w.mode or "turn")
    if w.mode:
        _do(sim.set_mode, w.mode)
    items = []
    if w.turn:
        if sim.mode(cfg) != "sim":
            raise HTTPException(400, "the world is live: there is nothing to simulate")
        items = await loop.world_turn()
    return {**sim.status(cfg), "items": items}


@app.get("/owner/reprice")
def owner_reprice(_=Depends(auth.owner)):
    """The repricing board, the limitations ledger, what is due next and where the world comes from."""
    reprice.seed(cfg)
    return {"board": reprice.board(), "limits": reprice.limits(), "due": reprice.due(cfg, 5), "watchlist": (cfg.get("reprice") or {}).get("watchlist", []), "world": sim.status(cfg)}


@app.post("/owner/reprice/{eid}/publish")
def owner_reprice_publish(eid: str, request: Request, on: bool = True, _=Depends(auth.owner)):
    auth.audit("reprice", "publish" if on else "retract", ip=_ip(request), target=eid)
    return _do(reprice.set_pub, eid, on)


@app.put("/owner/limits/{lid}")
def owner_limit(lid: str, l: LimitIn, _=Depends(auth.owner)):
    cur = next((x for x in reprice.limits() if x["id"] == lid), None)
    if not cur:
        raise HTTPException(404, "no such limit")
    return _do(reprice.note_limit, {**cur, **l.model_dump(exclude_none=True)}, "owner")


@app.get("/public/reprice")
def public_reprice(request: Request):
    """What the owner has approved: the repricing board and every limitation, with the disclaimer."""
    auth.ratelimit(f"pr:{_ip(request)}", 60, 60)
    reprice.seed(cfg)
    return {"disclaimer": v1.DISCLAIMER, "board": [reprice.public_row(r) for r in reprice.board(public=True)], "limits": reprice.public_limits(), "world": {"mode": sim.mode(cfg)}}


@app.get("/owner/day")
def owner_day(_=Depends(auth.owner)):
    return day.compile(graph, cfg, pending=loop.queue.qsize())


@app.get("/owner/fires")
def owner_fires(budget: int = 7, _=Depends(auth.owner)):
    """Oversee the overseers: every fire ranked, batched, with the agents' own health. See oversight.py."""
    from datetime import datetime
    d = day.compile(graph, cfg, pending=loop.queue.qsize())
    reg = day.STATE / "register.json"
    register = json.loads(reg.read_text()) if reg.exists() else []
    spend = (cfg.get("budget") or {}) | {"used": cfg.get("budget", {}).get("used", 0)}
    return oversight.triage(d, day._jsonl(day.STATE / "record.jsonl"), datetime.fromisoformat(d["now"]), register, spend, max(1, min(budget, 30)))


@app.post("/owner/act")
async def owner_act(a: Action, request: Request, _=Depends(auth.owner)):
    kind, _, key = a.id.partition(":")
    auth.audit("approval", a.action, ip=_ip(request), target=a.id)
    if kind == "post":
        return await asyncio.to_thread(day.act_post, key, a.action, cfg)
    if kind == "incident":
        return await asyncio.to_thread(heal.act, a.id, a.action)
    if kind == "app":
        return await asyncio.to_thread(sandbox.act, key, a.action)
    if kind == "publish":
        return await asyncio.to_thread(publishing.act, key, a.action, graph)
    if kind == "upgrade":
        return await asyncio.to_thread(upgrades.act, key, a.action, sandbox)
    if kind == "day" and key == "reflect":
        loop.put("reflect", "owner")
        return {"ok": True, "queued": True}
    raise HTTPException(400, f"nothing to {a.action} on {a.id}")


@app.post("/owner/retention")
def owner_retention(request: Request, days: float | None = None, _=Depends(auth.owner)):
    """Delete round records and security events older than `days` (default retention_days in institute.yaml, else 90)."""
    d = days if days is not None else float(cfg.get("retention_days", 90))
    out = {"days": d, "record": auth.purge(publishing.RECORD, d), "security": auth.purge(auth.STATE / "security.jsonl", max(d, 365))}
    auth.audit("retention", "done", ip=_ip(request), **out)
    return out


@app.get("/owner/spans")
def owner_spans(n: int = 60, _=Depends(auth.owner)):
    """What the ops console shows as traces: the newest spans and log lines in the graph, and the open incidents."""
    pick = lambda t: sorted((v for v in graph.nodes.values() if v.get("type") == t and not v.get("stub")), key=lambda v: -float(v.get("ts") or 0))[: max(1, min(n, 300))]
    cut = lambda v, ks: {k: v.get(k) for k in ks}
    return {"spans": [cut(v, ("id", "label", "ms", "status", "kind", "ts")) for v in pick("span")], "logs": [cut(v, ("id", "label", "level", "ts")) for v in pick("log")],
            "incidents": [cut(i, ("id", "type", "message", "code", "status", "outcome", "ts")) for i in list(heal.latest().values())[-20:]]}


@app.get("/owner/incidents")
def owner_incidents(_=Depends(auth.owner)):
    return {"incidents": list(heal.latest().values())[-100:]}


@app.post("/owner/topic")
def owner_topic(t: Topic, _=Depends(auth.owner)):
    """Add a research topic from the terminal: written into institute.yaml (when writable) and queued now."""
    out = day.add_topic(t.text, cfg)
    if out.get("ok"):
        loop.put("research", f"Research this topic and return what the Institute should know, as graph deltas with sources: {out['topic']}")
    return out


@app.post("/owner/sandbox")
async def owner_sandbox(c: Code, _=Depends(auth.owner)):
    if c.language not in sandbox.LANGS:
        raise HTTPException(400, f"language must be one of {list(sandbox.LANGS)}")
    if not sandbox.available("agent"):
        raise HTTPException(503, "agent sandbox unreachable")
    return await asyncio.to_thread(sandbox.run, c.language, {sandbox.LANGS[c.language]["file"]: c.code, **c.files}, c.command or None)


@app.post("/owner/ship")
async def owner_ship(s: Ship, _=Depends(auth.owner)):
    return {"result": await asyncio.to_thread(tools.ship_app, s.name, s.language, json.dumps(s.files), s.port)}
