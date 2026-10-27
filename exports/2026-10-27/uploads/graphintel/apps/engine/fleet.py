"""Sub-agents. Each is a small container with one job and its own sources. The brain (SEXTANT, through the fleet_* tools) and the owner (through
/owner/fleet) have the same create, read, update, delete. `where` chooses the daemon: child → agent-dind, the brain's own docker; sibling → web-dind,
beside the shipped apps. A sub-agent may have a parent; deleting a parent deletes its children. Workers print JSON lines; harvest() turns them into
ingest rounds. Records live in state/fleet.json and reconcile() makes the containers match them."""
import io
import json
import os
import re
import threading
import time
from pathlib import Path

import ledger
import sandbox
import signals

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
CFG: dict = {}
IMAGE = "threshold/worker:latest"
WHERE = {"child": "agent", "sibling": "web"}
NAME = re.compile(r"[a-z0-9][a-z0-9-]{1,30}")
LOCK = threading.Lock()
_since: dict[str, float] = {}
DEFAULT = {"role": "", "where": "child", "parent": "", "sources": [], "every": 900, "prompt": "", "enabled": True, "from_node": "", "why": ""}
DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /w\nCOPY worker.py parsers.py ./\nCMD ["python", "-u", "worker.py"]\n'


def docker_for(where: str):
    return sandbox.client(WHERE[where])


def load() -> dict:
    p = STATE / "fleet.json"
    return json.loads(p.read_text()) if p.exists() else {}


def _mutate(fn):
    with LOCK:
        d = load()
        out = fn(d)
        STATE.mkdir(parents=True, exist_ok=True)
        (STATE / "fleet.json").write_text(json.dumps(d, indent=1))
        return out


def _note(actor: str, op: str, id: str, **kw):
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / "fleet.jsonl").open("a") as f:
        f.write(json.dumps({"ts": time.time(), "actor": actor, "op": op, "id": id, **kw}) + "\n")


def history(n: int = 60) -> list[dict]:
    p = STATE / "fleet.jsonl"
    return [json.loads(x) for x in p.read_text().splitlines()[-n:]][::-1] if p.exists() else []


def _clean(raw: dict, d: dict, old: dict | None = None) -> dict:
    a = {**(old or DEFAULT), **{k: v for k, v in raw.items() if v is not None}}
    if a["where"] not in WHERE:
        raise ValueError(f"where must be one of {list(WHERE)}")
    if a["parent"] and a["parent"] not in d:
        raise ValueError("no such parent")
    if a["parent"] and old and a["parent"] in _tree(d, old["id"]) + [old["id"]]:
        raise ValueError("a sub-agent cannot be its own descendant's child")
    if not isinstance(a["sources"], list):
        raise ValueError("sources is a list of source ids")
    a["sources"] = [str(s) for s in a["sources"]][:10]
    a["every"], a["role"], a["prompt"], a["enabled"] = max(60, min(int(a["every"]), 86400)), str(a["role"])[:80], str(a["prompt"])[:2000], bool(a["enabled"])
    a["from_node"], a["why"] = str(a.get("from_node") or "")[:60], str(a.get("why") or "")[:300]
    return a


def _tree(d: dict, id: str) -> list[str]:
    kids = [k for k, a in d.items() if a["parent"] == id]
    return kids + [x for k in kids for x in _tree(d, k)]


def _depth(d: dict, id: str) -> int:
    n = 0
    while d[id]["parent"] and n < 5:
        id, n = d[id]["parent"], n + 1
    return n


def _run(c, a: dict):
    try:
        c.images.get(IMAGE)
    except Exception:
        ctx = {"Dockerfile": DOCKERFILE, "worker.py": (HERE / "worker" / "worker.py").read_text(), "parsers.py": (HERE / "parsers.py").read_text()}
        c.images.build(fileobj=io.BytesIO(sandbox._tar(ctx)), custom_context=True, tag=IMAGE, rm=True)
    c.containers.run(IMAGE, name=f"sub-{a['id']}", detach=True, labels={"threshold": "subagent", "sub": a["id"], "rev": str(a["rev"])},
                     environment={"SUB_ID": a["id"], "SUB_SOURCES": json.dumps(signals.resolve(a["sources"])), "SUB_EVERY": str(a["every"])},
                     mem_limit="128m", nano_cpus=int(0.25e9), restart_policy={"Name": "unless-stopped"})


def sync(a: dict) -> str:
    """Make this one sub-agent's container match its record."""
    try:
        c = docker_for(a["where"])
        ours = c.containers.list(all=True, filters={"label": f"sub={a['id']}"})
        for x in [x for x in ours if x.labels.get("rev") != str(a["rev"])]:
            x.remove(force=True)
            ours.remove(x)
        if not a["enabled"]:
            for x in ours:
                x.status == "running" and x.stop()
            return "paused"
        if ours:
            if ours[0].status == "running":
                return "running"
            ours[0].start()
            return "restarted"
        _run(c, a)
        return "started"
    except Exception as ex:
        return f"docker unreachable: {str(ex)[:80]}"


def _drop(id: str, keep: str | None = None):
    for w in WHERE:
        if w == keep:
            continue
        try:
            for x in docker_for(w).containers.list(all=True, filters={"label": f"sub={id}"}):
                x.remove(force=True)
        except Exception:
            pass


def create(raw: dict, actor: str = "owner") -> dict:
    name = str(raw.get("name", ""))
    if not NAME.fullmatch(name):
        raise ValueError("name: lowercase letters, digits and dashes, 2–31 characters")

    def add(d):
        if name in d:
            raise ValueError("a sub-agent with that name exists")
        if len(d) >= CFG.get("max", 12):
            raise ValueError(f"the fleet is full ({CFG.get('max', 12)})")
        a = _clean({k: v for k, v in raw.items() if k != "name"}, d)
        if a["parent"] and _depth(d, a["parent"]) >= 3:
            raise ValueError("the tree is at most four levels deep")
        t = time.time()
        d[name] = {**a, "id": name, "name": name, "by": actor, "created": t, "rev": t, "items": 0, "errors": 0, "last_seen": 0}
        return d[name]
    a = _mutate(add)
    _note(actor, "create", name, where=a["where"], parent=a["parent"])
    ledger.say("brain" if actor == "brain" else "owner", f"sub:{name}", "assign", a["prompt"] or f"You are {a['role'] or 'a worker'}. Watch your sources and report what matters.")
    return {**a, "status": sync(a)}


def update(id: str, patch: dict, actor: str = "owner") -> dict:
    if "name" in patch and patch["name"] not in (None, id):
        raise ValueError("a sub-agent cannot be renamed; create a new one")

    def up(d):
        if id not in d:
            raise KeyError(id)
        old = d[id]
        d[id] = {**old, **_clean({k: v for k, v in patch.items() if k != "name"}, d, old)}
        if set(patch) - {"enabled", "name"}:
            d[id]["rev"] = time.time()                              # pausing and resuming keep the container; any other change rebuilds it
        return old["where"], d[id]
    was, a = _mutate(up)
    _drop(id, keep=a["where"]) if was != a["where"] else None
    _note(actor, "update", id, fields=sorted(k for k in patch if k != "name"))
    return {**a, "status": sync(a)}


def delete(id: str, actor: str = "owner") -> list[str]:
    def rm(d):
        if id not in d:
            raise KeyError(id)
        gone = [id] + _tree(d, id)
        for g in gone:
            del d[g]
        return gone
    gone = _mutate(rm)
    for g in gone:
        _drop(g)
    _note(actor, "delete", id, removed=gone)
    return gone


def act(id: str, action: str, actor: str = "owner") -> dict:
    if action not in ("pause", "resume", "restart"):
        raise ValueError("action is pause, resume or restart")
    if id not in load():
        raise KeyError(id)
    return update(id, {"role": load()[id]["role"]} if action == "restart" else {"enabled": action == "resume"}, actor) | {"action": action}


def staffed() -> set[str]:
    """Which research nodes already have a watcher."""
    return {a["from_node"] for a in load().values() if a.get("from_node")}


def list_() -> list[dict]:
    d, live = load(), {}
    for w in WHERE:
        try:
            live[w] = {x.labels.get("sub"): x for x in docker_for(w).containers.list(all=True, filters={"label": "threshold=subagent"})}
        except Exception:
            live[w] = None

    def row(a):
        l = live[a["where"]]
        st = "docker unreachable" if l is None else "paused" if not a["enabled"] else l[a["id"]].status if a["id"] in l else "pending"
        return {**a, "status": st, "depth": _depth(d, a["id"])}
    out, seen = [], set()

    def walk(pid):
        for a in sorted((a for a in d.values() if a["parent"] == pid), key=lambda a: a["created"]):
            if a["id"] not in seen:
                seen.add(a["id"])
                out.append(row(a))
                walk(a["id"])
    walk("")
    return out


def logs(id: str, n: int = 80) -> str:
    a = load()[id]
    xs = docker_for(a["where"]).containers.list(all=True, filters={"label": f"sub={id}"})
    return xs[0].logs(tail=n).decode(errors="replace") if xs else "no container yet"


def reconcile() -> list[str]:
    """Containers match records: missing → started, stopped → started, wrong revision → rebuilt, orphans → removed."""
    d, out = load(), []
    for w in WHERE:
        try:
            for x in docker_for(w).containers.list(all=True, filters={"label": "threshold=subagent"}):
                if x.labels.get("sub") not in d or d[x.labels["sub"]]["where"] != w:
                    x.remove(force=True)
                    out.append(f"removed {x.labels.get('sub')}")
        except Exception:
            continue
    for a in d.values():
        r = sync(a)
        if r in ("started", "restarted"):
            out.append(f"{r} {a['id']}")
    return out


def harvest(put, store) -> int:
    """Read each running worker's JSON lines; every new item becomes an ingest round carrying the sub-agent's own prompt."""
    d, n, now, counts = load(), 0, time.time(), {}
    for w in WHERE:
        try:
            boxes = docker_for(w).containers.list(filters={"label": "threshold=subagent"})
        except Exception:
            continue
        for x in boxes:
            id = x.labels.get("sub")
            a = d.get(id)
            if not a:
                continue
            raw = x.logs(since=int(_since.get(id, now - 120)), tail=500).decode(errors="replace")
            _since[id] = now
            c = counts.setdefault(id, {"items": 0, "errors": 0, "last_seen": 0})
            for line in raw.splitlines():
                try:
                    e = json.loads(line) if line.startswith("{") else None
                except ValueError:
                    e = None
                if not e or e.get("sub") != id:
                    continue
                c["last_seen"] = max(c["last_seen"], e.get("ts", 0))
                if e.get("kind") == "error":
                    c["errors"] += 1
                    ledger.say(f"sub:{id}", "sextant", "report", f"error on {e.get('source', 'a source')}: {str(e.get('message', ''))[:160]}")
                elif e.get("kind") == "item" and store.once(f"sub:{id}:{e.get('link') or e.get('title')}", 30 * 86400):
                    put("ingest", f"[sub-agent {id} · {a['role'] or 'worker'}] {a['prompt'] or 'Decide whether this bears on a goal.'}\n" + signals.describe(e, e.get("label", "")), f"sub:{id}")
                    t = ledger.start(f"sub:{id}", f"Found: {str(e.get('title', ''))[:90]}", note=e.get("label", ""), kind="find")
                    ledger.finish(t["id"], "sent to SEXTANT")
                    ledger.say(f"sub:{id}", "sextant", "report", f"{e.get('title', '')} — {e.get('link', '')}".strip(" —"))
                    c["items"] += 1
                    n += 1

    def bump(d):
        for id, c in counts.items():
            if id in d:
                d[id]["items"] += c["items"]
                d[id]["errors"] += c["errors"]
                d[id]["last_seen"] = max(d[id]["last_seen"], c["last_seen"])
    counts and _mutate(bump)
    return n
