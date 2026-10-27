"""TESTER's brain, which is TESTER. One typed hypergraph holds the agent, its tools, its own source, the stack's code, pages, services and data,
every check it ran, every finding and every fix. Same file shape as the engine's graph (nodes, edges, types, Hebbian weight w), so either
can be read by the same tools. Edges that led to a verified fix are strengthened; the rest decay toward a floor and are never lost."""
import json
import os
import threading
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("TESTER_STATE") or HERE / "state")

TYPES = {
    "agent": "an agent; TESTER's own node is this graph",
    "tool": "something an agent can do, tied to the code that does it",
    "app": "a top-level part of the repository: an app, a site, research, marketing",
    "file": "a file in the repository; kind says python, js, page, config, data, docker, compose",
    "code": "a function or class",
    "test": "a pytest test",
    "route": "an HTTP route a server answers",
    "service": "a container in docker compose",
    "data": "a data file, store or volume the code reads or writes",
    "check": "one kind of test TESTER runs",
    "run": "one run of checks",
    "finding": "something a check found wrong, with its evidence",
    "fix": "a change TESTER made and verified, or tried and rejected",
    "lesson": "what TESTER keeps from a fix, tied to the code it is about",
}
LANES = {"agent": "agent", "tool": "tool", "app": "module", "file": "module", "code": "module", "route": "module", "service": "module",
         "test": "work", "check": "work", "run": "work", "finding": "question", "fix": "claim", "lesson": "thought", "data": "source"}
KEEP = ("id", "type", "label", "kind", "path", "file", "line", "doc", "check", "severity", "status", "diagnosis", "method", "lines")


class Brain:
    def __init__(self, path=None):
        self.path = Path(path or STATE / "graph.json")
        d = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.nodes: dict = d.get("nodes", {})
        self.edges: dict = d.get("edges", {})
        self.types: dict = {**TYPES, **d.get("types", {})}
        self._lock = threading.RLock()
        self.dirty = False

    def copy(self):
        """A scratch brain: the same graph in memory, for re-reading a working copy without touching the real one."""
        with self._lock:
            nb = Brain.__new__(Brain)
            nb.path = self.path.with_suffix(".scratch.json")
            nb.nodes, nb.edges, nb.types = json.loads(json.dumps(self.nodes)), json.loads(json.dumps(self.edges)), dict(self.types)
            nb._lock, nb.dirty = threading.RLock(), False
            return nb

    def node(self, id: str, type: str, label: str, **attrs) -> dict:
        """Upsert. A node keeps its weight and every edge across re-reads; only what is passed changes."""
        with self._lock:
            w = attrs.pop("w", None)
            cur = self.nodes.get(id) or {"w": 0.5 if w is None else w}
            if w is not None and attrs.get("core"):
                cur["w"] = w
            cur.update({"id": id, "type": type, "label": label, **attrs})
            self.nodes[id] = cur
            self.dirty = True
            return cur

    def link(self, relation: str, *members: str, w: float = 0.5, **attrs):
        if len(members) < 2 or not all(m in self.nodes for m in members):
            return None
        eid = f"{relation}:{'|'.join(members)}"
        with self._lock:
            cur = self.edges.get(eid) or {"w": w}
            cur.update({"id": eid, "relation": relation, "members": list(members), **attrs})
            self.edges[eid] = cur
            self.dirty = True
        return eid

    def drop_nodes(self, ids) -> int:
        ids = set(ids)
        with self._lock:
            for i in ids:
                self.nodes.pop(i, None)
            for i in [i for i, e in self.edges.items() if any(m in ids for m in e["members"])]:
                del self.edges[i]
            self.dirty = True
        return len(ids)

    def drop_edges(self, pred) -> int:
        with self._lock:
            gone = [i for i, e in self.edges.items() if pred(e)]
            for i in gone:
                del self.edges[i]
            self.dirty = True
        return len(gone)

    def adjacency(self) -> dict:
        with self._lock:
            adj = defaultdict(list)
            for e in self.edges.values():
                for m in e["members"]:
                    adj[m].append(e)
            return adj

    def around(self, ids, hops: int = 2, k: int = 80):
        """The strongest edges within `hops` of ids, and their nodes: what TESTER attends to for one problem."""
        adj = self.adjacency()
        with self._lock:
            start = [i for i in ids if i in self.nodes]
            seen, frontier, picked = set(start), set(start), {}
            for _ in range(max(1, hops)):
                cand = {e["id"]: e for f in frontier for e in adj.get(f, [])}
                nxt = set()
                for e in sorted(cand.values(), key=lambda e: -e.get("w", 0))[:k]:
                    picked[e["id"]] = e
                    for m in e["members"]:
                        if m not in seen:
                            seen.add(m)
                            nxt.add(m)
                frontier = nxt
            edges = sorted(picked.values(), key=lambda e: -e.get("w", 0))[:k]
            keep = list(dict.fromkeys(start + [m for e in edges for m in e["members"]]))
            return [dict(self.nodes[i]) for i in keep if i in self.nodes], [dict(e) for e in edges]

    def slice(self, ids, hops: int = 2, k: int = 70) -> str:
        nodes, edges = self.around(ids, hops, k)
        small = [{x: (str(n[x])[:200] if isinstance(n[x], str) else n[x]) for x in KEEP if n.get(x) not in (None, "")} for n in nodes]
        return json.dumps({"nodes": small, "edges": [{"relation": e["relation"], "members": e["members"], "w": round(e.get("w", 0), 2)} for e in edges]})

    def search(self, text: str, n: int = 12) -> list:
        words = {w for w in text.lower().replace("/", " ").replace(".", " ").split() if len(w) > 2}
        with self._lock:
            scored = []
            for x in self.nodes.values():
                hay = f"{x['id']} {x.get('label', '')} {x.get('doc', '')} {x.get('path', '')}".lower()
                s = sum(1 for w in words if w in hay)
                if s:
                    scored.append((s + x.get("w", 0), x["id"]))
            return [i for _, i in sorted(scored, reverse=True)[:n]]

    def reinforce(self, ids, eta: float = 0.25):
        """Hebbian: what fired together on a verified fix gets stronger."""
        with self._lock:
            for i in ids:
                x = self.nodes.get(i) or self.edges.get(i)
                if x is not None:
                    x["w"] = x.get("w", 0.5) + eta * (1 - x.get("w", 0.5))
            self.dirty = True

    def weaken(self, ids, by: float = 0.05):
        with self._lock:
            for i in ids:
                x = self.nodes.get(i) or self.edges.get(i)
                if x is not None and not x.get("core"):
                    x["w"] = max(0.05, x.get("w", 0.5) * (1 - by))
            self.dirty = True

    def decay(self, rho: float = 0.01, floor: float = 0.05):
        """Each full run: every non-core edge loses a little; nothing structural is ever removed."""
        with self._lock:
            for e in self.edges.values():
                if not e.get("core"):
                    e["w"] = max(floor, e.get("w", 0.5) * (1 - rho))
            self.dirty = True

    def flush(self):
        with self._lock:
            if not self.dirty:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"nodes": self.nodes, "edges": self.edges, "types": self.types}))
            tmp.replace(self.path)
            self.dirty = False

    def stats(self) -> dict:
        with self._lock:
            return {"nodes": len(self.nodes), "edges": len(self.edges), "by_type": dict(Counter(n["type"] for n in self.nodes.values()))}

    def connectome(self, focus: str = "", hops: int = 2, limit: int = 900) -> dict:
        """The same graph in the shape apps/ops/src/connectome.js draws: lanes, labels, weights."""
        if focus:
            nodes, edges = self.around([focus], hops, limit)
        else:
            with self._lock:
                rank = {"agent": 0, "tool": 1, "finding": 2, "fix": 3, "lesson": 4, "service": 5, "app": 6, "route": 7, "check": 8, "file": 9, "data": 10, "code": 11, "test": 12, "run": 13}
                nodes = sorted((dict(n) for n in self.nodes.values()), key=lambda n: (rank.get(n["type"], 20), -n.get("w", 0)))[:limit]
                ids = {n["id"] for n in nodes}
                edges = [dict(e) for e in self.edges.values() if all(m in ids for m in e["members"])]
        out_n = [{"key": n["id"], "lane": LANES.get(n["type"], "claim"), "label": str(n.get("label", n["id"]))[:90], "size": 1.7 if n["type"] == "agent" else 0.8 + min(1.2, n.get("w", 0.5)),
                  "hot": n.get("status") == "open", "tip": n["type"] + (" · " + n["kind"] if n.get("kind") else "") + (" · " + n["status"] if n.get("status") else "")} for n in nodes]
        out_e = []
        for e in edges:
            m = e["members"]
            out_e += [{"a": m[i], "b": m[i + 1], "w": round(e.get("w", 0.5), 2), "rel": e["relation"]} for i in range(len(m) - 1)]
        return {"nodes": out_n, "edges": out_e}
