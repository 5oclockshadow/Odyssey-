"""The work ledger and the message stream: what every actor in the Institute is doing, and what they say to each other. The engine writes here as it
works (main.worker, fleet.harvest, serve's chat), and the owner's console reads it. No model, no docker: two append-only files under state/."""
import json
import os
import re
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
STATES = ("planned", "ongoing", "done", "failed")
KINDS = ("assign", "report", "msg", "thought", "approval")
CAP = {"tasks": 400, "stream": 600}
LOCK = threading.Lock()
TITLES = {"chat": "Answer the owner", "contact": "Answer a visitor", "research": "Research", "reexamine": "Re-examine an edge", "repair": "Repair", "reflect": "Nightly reflection", "ingest": "Read an item", "drive": "Self-directed round", "staff": "Decide whether the research needs a new post", "find": "Found something", "lab": "Work the labs", "reprice": "Reprice", "world": "Simulated world turn"}
NOTAIL = ("reflect", "drive", "staff", "lab", "world")


def _p(name):
    return STATE / f"{name}.jsonl"


def _read(name: str) -> list[dict]:
    p = _p(name)
    if not p.exists():
        return []
    out = []
    for line in p.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def _append(name: str, row: dict):
    STATE.mkdir(parents=True, exist_ok=True)
    with LOCK:
        with _p(name).open("a") as f:
            f.write(json.dumps(row) + "\n")
        rows = _read(name)
        if len(rows) > CAP[name] * 1.5:
            _p(name).write_text("\n".join(json.dumps(r) for r in rows[-CAP[name]:]) + "\n")
    return row


def title_for(kind: str, intake: str) -> str:
    head = TITLES.get(kind, kind.title())
    text = str(intake or "").strip()
    tail = text.replace("\n", " ")
    if kind == "research":
        tail = tail.split(": ", 1)[-1]
    elif kind == "reexamine":
        tail = tail.split("Re-examine edge ", 1)[-1].split(": ", 1)[0]
    elif kind == "ingest":
        lines = [x.strip() for x in text.splitlines() if x.strip()]
        item = next((x for x in lines if re.match(r"^[A-Z]+ · .+ · .+", x)), "")
        body = [x for x in lines if not x.startswith(("[sub-agent", "SIMULATED"))]
        tail = item.split(" · ", 2)[2] if item else body[0] if body else tail.split("] ", 1)[-1]
    elif kind == "reprice":
        first = text.splitlines()[0] if text else ""
        head, tail = ("Work down the limitations", "") if first.startswith("LIMITS") else ("Reprice", first.split(":", 1)[-1].strip())
    return (head + (": " + tail[:90] if tail and kind not in NOTAIL else "")).strip()


def plan(who: str, title: str, note: str = "", kind: str = "round", pid: str = "", **extra) -> dict:
    """A task the actor intends to do. pid lets the caller reuse its own id (the queue's), so start() and finish() can find it."""
    return _append("tasks", {"id": pid or f"t{int(time.time() * 1000) % 10**10:x}", "who": who, "title": title[:160], "note": note[:400], "kind": kind, "state": "planned", "ts": time.time(), **extra})


def start(who: str, title: str, note: str = "", kind: str = "round", pid: str = "", **extra) -> dict:
    return _append("tasks", {"id": pid or f"t{int(time.time() * 1000) % 10**10:x}", "who": who, "title": title[:160], "note": note[:400], "kind": kind, "state": "ongoing", "ts": time.time(), **extra})


def finish(id: str, note: str = "", state: str = "done", **extra) -> dict:
    return _append("tasks", {"id": id, "state": state if state in STATES else "done", "note": str(note)[:400], "ts": time.time(), **extra})


def say(frm: str, to: str, kind: str, text: str) -> dict:
    """One message between actors: the brain assigning, a sub-agent reporting, the owner asking, the brain thinking aloud."""
    return _append("stream", {"id": f"m{int(time.time() * 1000) % 10**10:x}", "ts": time.time(), "from": frm[:40], "to": to[:40], "kind": kind if kind in KINDS else "msg", "text": str(text)[:1200]})


def board(n: int = 60) -> list[dict]:
    """Every task, newest write wins, so a row that was planned then started then finished appears once in its latest state."""
    by: dict[str, dict] = {}
    for r in _read("tasks"):
        cur = by.get(r["id"], {})
        by[r["id"]] = {**cur, **{k: v for k, v in r.items() if v not in ("", None)}, "state": r.get("state", cur.get("state", "planned"))}
        if r.get("state") == "ongoing" and "started" not in by[r["id"]]:
            by[r["id"]]["started"] = r["ts"]
    rows = sorted(by.values(), key=lambda r: -r["ts"])
    done = [r for r in rows if r["state"] in ("done", "failed")][:n // 2]
    return sorted([r for r in rows if r["state"] in ("planned", "ongoing")] + done, key=lambda r: -r["ts"])


def stream(n: int = 120) -> list[dict]:
    return _read("stream")[-max(1, min(n, CAP["stream"])):]


def actors(fleet_agents: list[dict]) -> list[dict]:
    """Who is in the Institute right now, and what each is doing: the brain plus every sub-agent, with its current task."""
    b, now = board(), {}
    for t in b:
        if t["state"] == "ongoing" and t["who"] not in now:
            now[t["who"]] = t
    out = [{"id": "sextant", "name": "SEXTANT", "role": "the brain", "kind": "brain", "status": "working" if "sextant" in now else "idle", "now": now.get("sextant"), "depth": 0}]
    for a in fleet_agents:
        key = f"sub:{a['id']}"
        out.append({"id": a["id"], "name": a["name"], "role": a.get("role", ""), "kind": "sub", "status": a.get("status", "?"), "now": now.get(key), "depth": a.get("depth", 0),
                    "items": a.get("items", 0), "errors": a.get("errors", 0), "where": a.get("where", ""), "enabled": a.get("enabled", True), "by": a.get("by", ""), "sources": a.get("sources", []), "every": a.get("every", 0), "parent": a.get("parent", ""), "prompt": a.get("prompt", ""), "last_seen": a.get("last_seen", 0)})
    return out


def counts() -> dict:
    b = board()
    return {s: sum(1 for t in b if t["state"] == s) for s in STATES}
