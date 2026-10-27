"""Provenance: who did what, what it asked, what it read, and where each agent sits in the graph.
Built from the ledger (work), the fleet (agents) and the graph (questions, claims, sources). Pure: the caller passes the data,
so one function serves the owner (everything) and the public (published nodes only, agents by number, no answers)."""
import time

QUESTION = {"question", "hypothesis", "goal"}
SOURCE = {"source", "paper", "document", "feed", "item", "dataset", "url"}


def lane(t: str) -> str:
    t = (t or "").lower()
    return "question" if t in QUESTION else "source" if t in SOURCE else "claim"


def build(nodes: dict, edges: dict, agents: list, tasks: list, public: bool = False, cap: int = 400) -> dict:
    pub = lambda i: bool(nodes.get(i, {}).get("pub"))
    roster = [{"id": "sextant", "num": 0, "name": "SEXTANT", "role": "the brain", "status": "running", "where": "agent", "from_node": ""}]
    for i, a in enumerate(sorted(agents, key=lambda a: (a.get("created") or 0, a["id"])), 1):
        fn = a.get("from_node") or ""
        roster.append({"id": a["id"], "num": i, "name": f"agent #{i}" if public else a["id"], "role": a.get("role", ""), "status": a.get("status", "?"),
                       "where": a.get("where", ""), "from_node": fn if (not public or pub(fn)) else "", "items": a.get("items", 0), "errors": a.get("errors", 0)})
    known = {a["id"] for a in roster}
    works, used, hidden = [], {}, 0
    for t in tasks:
        who = str(t.get("who") or "sextant").removeprefix("sub:")
        who = who if who in known else "sextant"
        ids = [i for i in (t.get("node_ids") or []) if i in nodes and not nodes[i].get("tel")]
        if public:
            hidden += sum(1 for i in ids if not pub(i))
            ids = [i for i in ids if pub(i)]
            if not ids:
                continue
        start, end, state = t.get("started") or t.get("ts"), t.get("ts"), t.get("state", "")
        origin = str(t.get("origin") or "").removeprefix("sub:")
        w = {"id": t["id"], "agent": who, "origin": origin if origin in known and origin != who else "", "kind": t.get("kind", ""), "title": t.get("title", ""),
             "state": state, "started": start if state != "planned" else None, "ts": end,
             "dur": round(end - start, 1) if state in ("done", "failed") and start and end else None, "energy": t.get("energy"), "nodes": ids[:60], "sim": bool(t.get("sim"))}
        if not public:
            w["note"] = str(t.get("note", ""))[:600]
        works.append(w)
        for i in ids:
            used[i] = used.get(i, 0) + 1
    for a in roster:
        if a["from_node"] in nodes and not nodes[a["from_node"]].get("tel"):
            used.setdefault(a["from_node"], 0)
    keep = sorted(used, key=lambda i: -used[i])[:cap]
    ks = set(keep)
    out_nodes = [{"id": i, "label": nodes[i].get("label", i), "type": nodes[i].get("type", ""), "lane": lane(nodes[i].get("type")), "pub": pub(i), "refs": used[i], "sim": str(i).startswith("sim:")} for i in keep]
    out_edges, seen = [], set()
    for e in edges.values():
        if e.get("tel"):
            continue
        m = [x for x in e.get("members", []) if x in ks]
        for a, b in zip(m, m[1:]):
            k = (a, b, e.get("relation", ""))
            if k not in seen:
                seen.add(k)
                out_edges.append({"a": a, "b": b, "rel": e.get("relation", ""), "w": round(e.get("w", 0), 3)})
    return {"agents": roster, "works": works, "nodes": out_nodes, "edges": out_edges[:cap * 3], "hidden": hidden, "public": public, "ts": time.time()}


def brain(nodes: dict, edges: dict, agents: list, tasks: list, tools: list, thoughts: list) -> dict:
    """The agent's own graph: the institute it runs, plus itself, its tools, its own source files and its recent thoughts, each thought linked
    to the work it was about. Owner only; the self-model nodes are telemetry and never published."""
    out = build(nodes, edges, agents, tasks)
    files = sorted(i for i, n in nodes.items() if n.get("type") == "file")[:60]
    tl = [i for i in (f"code:tools.{t if isinstance(t, str) else t.get('name', '')}" for t in tools) if i in nodes][:80]
    home = lambda i: f"file:{i.split(':', 1)[1].split('.', 1)[0]}.py"
    sn = [{"id": i, "label": nodes[i].get("label", i), "type": "file", "lane": "module"} for i in files]
    sn += [{"id": i, "label": i.split(".", 1)[-1], "type": "tool", "lane": "tool"} for i in tl]
    se = [{"a": f"s:{i}", "b": f"s:{home(i)}", "rel": "defined_in"} for i in tl if home(i) in nodes]
    by_title = {w["title"]: w["id"] for w in out["works"]}
    for m in thoughts[-30:]:
        tid, text = f"thought:{m['id']}", str(m.get("text", ""))
        sn.append({"id": tid, "label": text[:160], "type": "thought", "lane": "thought", "ts": m.get("ts")})
        wid = by_title.get(text.split(" — ")[0])
        if wid:
            se.append({"a": f"s:{tid}", "b": f"w:{wid}", "rel": "about"})
    out["self"] = {"nodes": sn, "edges": se}
    return out
