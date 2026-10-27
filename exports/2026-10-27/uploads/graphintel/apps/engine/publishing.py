"""What the public sees. Nothing is public until the owner approves it. SEXTANT proposes a batch (a note, the nodes and edges it rests on, its
sources); approving flags those nodes and edges `pub`; retracting unflags them. The public API serves flagged items in full and everything else as
grey shapes: an opaque id and a weight, no label, type or relation. Telemetry (spans, logs, code, incidents) is never part of the public graph."""
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
DIR = STATE / "publish"
RECORD = STATE / "record.jsonl"
FEED_KINDS = ("research", "reexamine", "ingest")


def _save(rec: dict):
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / f"{rec['key']}.json").write_text(json.dumps(rec))


def get(key: str) -> dict | None:
    p = DIR / f"{key}.json"
    return json.loads(p.read_text()) if "/" not in key and p.exists() else None


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DIR.glob("*.json"))] if DIR.exists() else []


def propose(title: str, node_ids: list, edge_ids: list, note: str, sources: list) -> dict:
    key = f"{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}-{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:36] or 'note'}"
    rec = {"id": f"publish:{key}", "key": key, "title": title[:120], "nodes": list(node_ids)[:200], "edges": list(edge_ids)[:400], "note": note[:8000],
           "sources": [str(s)[:300] for s in sources][:30], "status": "proposed", "ts": datetime.now(timezone.utc).isoformat()}
    _save(rec)
    return rec


def act(key: str, action: str, graph) -> dict:
    """approve flags the batch public; retract unflags it (anything another published batch still covers stays); decline closes it."""
    rec = get(key)
    if not rec:
        return {"ok": False, "error": "unknown batch"}
    want = {"approve": ("proposed", "published"), "retract": ("published", "retracted"), "decline": ("proposed", "declined")}.get(action)
    if not want or rec["status"] != want[0]:
        return {"ok": False, "error": f"cannot {action} a {rec['status']} batch"}
    rec["status"] = want[1]
    _save(rec)
    others = [r for r in load() if r["status"] == "published" and r["key"] != key]
    keep = {i for r in others for i in r["nodes"] + r["edges"]}
    with graph._lock:
        for table, ids in ((graph.nodes, rec["nodes"]), (graph.edges, rec["edges"])):
            for i in ids:
                if i in table and not table[i].get("tel") and not table[i].get("core"):          # seeded items keep the visibility yaml gave them
                    table[i]["pub"] = (action == "approve") or (action == "retract" and i in keep)
        graph.dirty = True
    graph.flush()
    return {"ok": True, "status": rec["status"], "nodes": len(rec["nodes"]), "edges": len(rec["edges"])}


def publish_now(title: str, node_ids: list, note: str, graph) -> dict:
    """The owner publishes directly from the agent space: a batch with the edges among the chosen nodes, approved at once."""
    ids = set(node_ids)
    edges = [e["id"] for e in graph.edges.values() if not e.get("tel") and len(e["members"]) >= 2 and all(m in ids for m in e["members"])]
    rec = propose(title, node_ids, edges, note, [])
    return {**rec, **act(rec["key"], "approve", graph)}


def opaque(i: str) -> str:
    """Stable opaque id for a withheld item: keyed by the session secret (env or the generated state/session.secret), never a constant."""
    import auth
    return "g:" + hmac.new(auth.secret(), i.encode(), hashlib.sha256).hexdigest()[:12]


def public_slice(graph, k: int = 40) -> str:
    """What the public chat is allowed to know: published nodes, and published edges among them."""
    ok = {i for i, n in graph.nodes.items() if n.get("pub")}
    top = sorted((e for e in graph.edges.values() if e.get("pub") and not e.get("tel") and all(m in ok for m in e["members"])), key=lambda e: -e["w"])[:k]
    return json.dumps({"types": graph.types, "nodes": [graph.nodes[i] for i in ok], "edges": top})


def hood(graph, focus: str = "institute", hops: int = 2, k: int = 120, public: bool = True) -> dict:
    """The subgraph within `hops` of `focus` (hyperedges link all their members). Public: unpublished things come back as grey shapes with opaque ids."""
    nodes, edges = graph.nodes, [e for e in graph.edges.values() if not e.get("tel")]
    pub = lambda i: bool(nodes.get(i, {}).get("pub"))
    if focus not in nodes or (public and not pub(focus)):
        focus = "institute"
    adj = {}
    for e in edges:
        for m in e["members"]:
            adj.setdefault(m, set()).update(x for x in e["members"] if x != m)
    seen, frontier = {focus: 0}, [focus]
    for h in range(1, max(1, min(int(hops), 3)) + 1):
        nxt = {j for i in frontier for j in adj.get(i, ()) if j not in seen}
        seen.update({j: h for j in nxt})
        frontier = list(nxt)
    keep = set(sorted((i for i in seen if i in nodes), key=lambda i: (i != focus, -float(nodes[i].get("w", 0))))[:k])
    oid = lambda i: opaque(i) if public and not pub(i) else i
    ns = [({"id": oid(i), "grey": True, "hop": seen[i], "w": nodes[i].get("w", 0)} if public and not pub(i) else
           {"id": i, "label": nodes[i].get("label", i), "type": nodes[i].get("type", ""), "hop": seen[i], "w": nodes[i].get("w", 0), "pub": pub(i),
            "core": bool(nodes[i].get("core")), "grey": False}) for i in keep]
    es = []
    for e in edges:
        ms = [m for m in e["members"] if m in keep]
        if len(ms) < 2:
            continue
        open_ = bool(e.get("pub")) and all(pub(m) for m in e["members"])
        es.append({"id": e["id"], "relation": e["relation"], "members": ms, "w": e.get("w", 0), "pub": bool(e.get("pub")), "inferred": bool(e.get("inferred")), "grey": False}
                  if open_ or not public else {"id": opaque(e["id"]), "grey": True, "members": [oid(m) for m in ms], "w": e.get("w", 0)})
    return {"focus": oid(focus), "hops": hops, "nodes": ns, "edges": es,
            "total": {"nodes": sum(1 for n in nodes.values() if not n.get("tel")), "edges": len(edges), "published": sum(1 for n in nodes.values() if n.get("pub"))}}


def notes() -> list[dict]:
    return [{k: r[k] for k in ("key", "title", "note", "sources", "ts")} for r in load() if r["status"] == "published"][::-1]


def questions(graph) -> list[dict]:
    """Open questions the owner has published, with how many edges rest on each (the support) and what would end each."""
    out = []
    for n in graph.nodes.values():
        if n.get("type") == "question" and n.get("pub"):
            inc = [e for e in graph.edges.values() if n["id"] in e["members"] and not e.get("tel")]
            out.append({"id": n["id"], "question": n["label"], "falsifier": n.get("falsifier", ""), "support": len(inc), "published_support": sum(1 for e in inc if e.get("pub"))})
    return out


def _rounds():
    if not RECORD.exists():
        return []
    out = []
    for ln in RECORD.read_text().splitlines():
        try:
            out.append(json.loads(ln))
        except ValueError:
            pass
    return out


def feed(n: int = 30) -> list[dict]:
    """Titles only: the topic a research round took, the item an ingest round read. Never the agent's reasoning or answer."""
    out = []
    for r in reversed(_rounds()):
        if r.get("kind") not in FEED_KINDS or r.get("public"):
            continue
        t = r.get("intake", "")
        m = re.match(r"New item from \S+: (.*?) — (https?://\S+?)\.? Fetch", t)
        title = f"Read: {m.group(1)}" if m else "Re-examined a claim" if r["kind"] == "reexamine" else t.rsplit(": ", 1)[-1][:140]
        out.append({"ts": r["ts"], "kind": r["kind"], "title": title, **({"link": m.group(2)} if m else {})})
        if len(out) >= n:
            break
    return out


def counters(graph) -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    real = [n for n in graph.nodes.values() if not n.get("tel")]
    return {"nodes": len(real), "edges": sum(1 for e in graph.edges.values() if not e.get("tel")), "published": sum(1 for n in real if n.get("pub")),
            "rounds_today": sum(1 for r in _rounds() if str(r.get("ts", "")).startswith(today) and not r.get("public"))}
