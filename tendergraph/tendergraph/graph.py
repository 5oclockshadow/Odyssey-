"""The one intelligence graph — Agent = Graph.

A 3D/4D networkx DiGraph of typed nodes (models.Archetype) with Hebbian edges and
a Q-table-ready structure. There is no separate agent object: the graph's MISSION
node plus its traversal state IS the agent (per the Skilld architecture). Recall
is token-overlap + one Hebbian hop; traverse follows edges for multi-hop context.
Persistence is real and explicit: tendergraph/store.py (Redis when configured, else a JSON snapshot).
"""
from __future__ import annotations

import re
import threading
import time
from typing import Any, Callable

import networkx as nx

TOK = re.compile(r"[a-z0-9]+")


class Graph:
    def __init__(self):
        self.g = nx.MultiDiGraph()
        self._tok: dict[str, set] = {}
        self.lock = threading.RLock()
        self.ensure("mission", "TenderGraph mission: find and win public & private work.",
                    archetype="opportunity")

    # -- write -------------------------------------------------------------- #
    def ensure(self, nid: str, text: str = "", archetype: str = "source", **attrs) -> str:
        with self.lock:
            if nid not in self.g:
                self.g.add_node(nid, text=text, archetype=archetype, t=time.time(), attrs=attrs)
                self._tok[nid] = set(TOK.findall((text + " " + nid).lower()))
            elif text or attrs:
                node = self.g.nodes[nid]
                if text:
                    node["text"] = text
                    self._tok[nid] = set(TOK.findall((text + " " + nid).lower()))
                node["attrs"] = {**node.get("attrs", {}), **attrs}
            return nid

    def link(self, a: str, b: str, rel: str = "linked", w: float = 0.1):
        with self.lock:
            if a in self.g and b in self.g:
                if self.g.has_edge(a, b, key=rel):
                    self.g[a][b][rel]["w"] = min(1.0, self.g[a][b][rel]["w"] + w)
                else:
                    self.g.add_edge(a, b, key=rel, w=w)

    # -- Hebbian ------------------------------------------------------------ #
    def coactivate(self, ids: list[str], lr: float = 0.1):
        with self.lock:
            for i, a in enumerate(ids):
                for b in ids[i + 1:]:
                    if a in self.g and b in self.g:
                        self.link(a, b, "coactivates", lr)
                        self.link(b, a, "coactivates", lr)

    def decay(self, rate: float = 0.01):
        """Keep plasticity bounded — unused edges fade (no saturation)."""
        with self.lock:
            dead = []
            for a, b, k, e in self.g.edges(keys=True, data=True):
                if k == "coactivates":
                    e["w"] = max(0.0, e["w"] - rate)
                    if e["w"] <= 0.0:
                        dead.append((a, b, k))
            for a, b, k in dead:
                self.g.remove_edge(a, b, key=k)

    # -- read --------------------------------------------------------------- #
    def recall(self, query: str, k: int = 6, hebbian: float = 0.6,
               skip: Callable | None = None) -> list[dict]:
        q = set(TOK.findall(str(query).lower()))
        with self.lock:
            lex = {n: len(q & t) for n, t in self._tok.items()
                   if q & t and not (skip and skip(self.g.nodes[n]))}
            score = dict(lex)
            if hebbian:
                for s in list(lex):
                    for a, b, kk, e in list(self.g.out_edges(s, keys=True, data=True)) + \
                            list(self.g.in_edges(s, keys=True, data=True)):
                        if kk != "coactivates":
                            continue
                        n = b if a == s else a
                        if n != s:
                            score[n] = score.get(n, 0) + hebbian * e["w"]
            top = sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
            return [{"id": n, "score": round(s, 3),
                     "text": self.g.nodes[n].get("text", ""),
                     "archetype": self.g.nodes[n].get("archetype", "")} for n, s in top]

    def neighbors(self, nid: str, k: int = 20) -> list[dict]:
        with self.lock:
            if nid not in self.g:
                return []
            out = [{"id": b, "rel": r, "w": round(e["w"], 3)}
                   for _, b, r, e in self.g.out_edges(nid, keys=True, data=True)]
            out += [{"id": a, "rel": r, "w": round(e["w"], 3)}
                    for a, _, r, e in self.g.in_edges(nid, keys=True, data=True)]
            return sorted(out, key=lambda x: -x["w"])[:k]

    def stats(self) -> dict:
        with self.lock:
            kinds: dict[str, int] = {}
            for _, d in self.g.nodes(data=True):
                kinds[d.get("archetype", "?")] = kinds.get(d.get("archetype", "?"), 0) + 1
            return {"nodes": self.g.number_of_nodes(), "edges": self.g.number_of_edges(),
                    "archetypes": kinds}
