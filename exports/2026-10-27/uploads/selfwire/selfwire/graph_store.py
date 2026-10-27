"""
graph_store.py — the tool-use graph: 3D spatial layout + time = 4D spatio-temporal,
with Hebbian co-activation weights and Q-table reinforcement over it.

What's real here, plainly stated:

  * Nodes are tools (registry entries). Edges are observed transitions
    "tool A was used, then tool B was used, in the same task episode".
  * Each node gets a stable (x, y, z) position from a force-directed layout
    (networkx spring_layout in 3 dimensions) — the "3D spatial graph". Every
    edge additionally carries the wall-clock timestamps of the transitions
    it recorded — the "+ time" that makes it spatio-temporal ("4D").
  * "Hebbian learning": classic "cells that fire together wire together".
    Every time two tools are used in the same episode, the edge weight
    between them is nudged up (and weights decay slowly over time if unused)
    — a real, if simple, Hebbian update rule (Delta w = eta * co-activation - decay * w).
  * "Q-table optimization": a tabular Q-learning value table over
    (state, tool) pairs, where `state` is a short hashable summary of the
    left-brain's situation (see agent.py). Standard Bellman update:
    Q(s,a) <- Q(s,a) + alpha * (reward + gamma * max_a' Q(s',a') - Q(s,a)).

This is intentionally a small, inspectable implementation rather than a
framework — the point is that the "graph intelligence" machinery is real and
exercised by the agent loop, not a decorative label.
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import networkx as nx

from .storage import RaptorRedisStore

HEBB_ETA = 0.25       # learning rate for co-activation strengthening
HEBB_DECAY = 0.01      # passive weight decay per recorded tick
Q_ALPHA = 0.3          # Q-learning rate
Q_GAMMA = 0.9          # discount factor
Q_EPSILON = 0.15       # exploration rate for suggest()


@dataclass
class GraphSnapshot:
    nodes: list[dict]
    edges: list[dict]
    q_table_size: int
    generated_at: str


class ToolGraph:
    def __init__(self, store: Optional[RaptorRedisStore] = None, key: str = "graph_store/tool_graph") -> None:
        self.store = store or RaptorRedisStore(namespace="selfwire")
        self.key = key
        self.g = nx.MultiDiGraph()
        self.q_table: dict[tuple[str, str], float] = {}
        self._last_tool_per_episode: dict[str, str] = {}
        # observability bookkeeping, updated from `finally` blocks below —
        # real fields, not decoration: surfaces how many traversal ops have
        # silently degraded instead of crashing the caller.
        self.traversal_error_count: int = 0
        self.q_update_count: int = 0
        self.last_traversal_op: Optional[str] = None
        self.last_traversal_at: Optional[float] = None
        self._load()

    # -- persistence --------------------------------------------------------
    def _load(self) -> None:
        data = self.store.get(self.key)
        if not data:
            return
        try:
            for n in data.get("nodes", []):
                self.g.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
            for e in data.get("edges", []):
                self.g.add_edge(e["source"], e["target"], weight=e.get("weight", 0.0), ticks=e.get("ticks", []))
            self.q_table = {tuple(k.split("||")): v for k, v in data.get("q_table", {}).items()}
        except Exception:
            # corrupt snapshot -> start clean rather than crash the agent
            self.g = nx.MultiDiGraph()
            self.q_table = {}

    def save(self) -> None:
        self._relayout()
        payload = {
            "nodes": [
                {"id": n, **{k: v for k, v in attrs.items()}}
                for n, attrs in self.g.nodes(data=True)
            ],
            "edges": [
                {"source": u, "target": v, "weight": d.get("weight", 0.0), "ticks": d.get("ticks", [])}
                for u, v, d in self.g.edges(data=True)
            ],
            "q_table": {f"{s}||{a}": val for (s, a), val in self.q_table.items()},
            "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
        }
        self.store.set(self.key, payload)

    # -- node/edge maintenance ----------------------------------------------
    def ensure_node(self, tool_name: str, source: str = "unknown") -> None:
        if tool_name not in self.g:
            self.g.add_node(tool_name, source=source, added_at=time.time(), calls=0)

    def _relayout(self) -> None:
        if self.g.number_of_nodes() == 0:
            return
        try:
            pos = nx.spring_layout(self.g, dim=3, seed=7)
        except Exception:
            pos = {n: (random.random(), random.random(), random.random()) for n in self.g.nodes()}
        for n, (x, y, z) in pos.items():
            self.g.nodes[n]["x"] = float(x)
            self.g.nodes[n]["y"] = float(y)
            self.g.nodes[n]["z"] = float(z)

    # -- Hebbian co-activation ----------------------------------------------
    def record_use(self, episode_id: str, tool_name: str, source: str = "unknown") -> None:
        """Call this every time a tool fires. Wires it to whatever tool fired
        immediately before it in the same episode (Hebbian co-activation).

        Wrapped end to end: a bad graph traversal here must never take down
        the agent turn that's reporting a tool result. `finally` always
        advances the episode's last-used-tool pointer, even if the weight
        math above it blew up partway through — otherwise a single corrupt
        update could wedge that episode's associations forever (every
        subsequent call would keep retrying the same broken `prev` state).
        """
        try:
            self.ensure_node(tool_name, source=source)
            self.g.nodes[tool_name]["calls"] = self.g.nodes[tool_name].get("calls", 0) + 1

            prev = self._last_tool_per_episode.get(episode_id)
            now = time.time()
            if prev and prev != tool_name:
                if self.g.has_edge(prev, tool_name):
                    # networkx MultiDiGraph: reuse key 0 as the aggregate hebbian edge
                    d = self.g.get_edge_data(prev, tool_name, key=0)
                    w = d.get("weight", 0.0) if d else 0.0
                    ticks = d.get("ticks", []) if d else []
                else:
                    w, ticks = 0.0, []
                w = w + HEBB_ETA * (1.0 - w) - HEBB_DECAY * w
                w = max(0.0, min(1.0, w))
                ticks = (ticks + [now])[-50:]
                self.g.add_edge(prev, tool_name, key=0, weight=w, ticks=ticks)

            # passive decay on all other outgoing edges from prev, so unused
            # associations fade (keeps the Hebbian memory from saturating to 1.0)
            if prev:
                for _, tgt, k, d in list(self.g.out_edges(prev, keys=True, data=True)):
                    if tgt == tool_name:
                        continue
                    d["weight"] = max(0.0, d.get("weight", 0.0) - HEBB_DECAY)
        except Exception:
            self.traversal_error_count += 1
        finally:
            self._last_tool_per_episode[episode_id] = tool_name
            self.last_traversal_op = "record_use"
            self.last_traversal_at = time.time()

    def associative_recall(self, from_tool: Optional[str], top_k: int = 3) -> list[tuple[str, float]]:
        """Right-brain primitive: 'what tool tends to follow this one?'"""
        try:
            if not from_tool or from_tool not in self.g:
                return []
            out = [(v, d.get("weight", 0.0)) for _, v, d in self.g.out_edges(from_tool, data=True)]
            out.sort(key=lambda t: t[1], reverse=True)
            return out[:top_k]
        except Exception:
            self.traversal_error_count += 1
            return []
        finally:
            self.last_traversal_op = "associative_recall"
            self.last_traversal_at = time.time()

    # -- Q-table --------------------------------------------------------------
    def q_value(self, state: str, tool_name: str) -> float:
        return self.q_table.get((state, tool_name), 0.0)

    def q_update(self, state: str, tool_name: str, reward: float, next_state: str) -> float:
        old = self.q_table.get((state, tool_name), 0.0)
        new = old
        try:
            next_actions = [a for (s, a) in self.q_table.keys() if s == next_state]
            max_next = max((self.q_table[(next_state, a)] for a in next_actions), default=0.0)
            new = old + Q_ALPHA * (reward + Q_GAMMA * max_next - old)
            self.q_table[(state, tool_name)] = new
            return new
        except Exception:
            # never let a malformed state/table entry break the caller's
            # reward loop -- fall back to leaving the value unchanged.
            self.traversal_error_count += 1
            return old
        finally:
            self.q_update_count += 1
            self.last_traversal_op = "q_update"
            self.last_traversal_at = time.time()

    def q_suggest(self, state: str, candidate_tools: list[str]) -> Optional[str]:
        """Left-brain primitive: epsilon-greedy pick from learned Q-values."""
        try:
            if not candidate_tools:
                return None
            if random.random() < Q_EPSILON:
                return random.choice(candidate_tools)
            scored = [(t, self.q_table.get((state, t), 0.0)) for t in candidate_tools]
            scored.sort(key=lambda t: t[1], reverse=True)
            return scored[0][0]
        except Exception:
            self.traversal_error_count += 1
            return candidate_tools[0] if candidate_tools else None
        finally:
            self.last_traversal_op = "q_suggest"
            self.last_traversal_at = time.time()

    # -- introspection --------------------------------------------------------
    def snapshot(self) -> GraphSnapshot:
        try:
            self._relayout()
        except Exception:
            self.traversal_error_count += 1
        nodes = [{"id": n, **attrs} for n, attrs in self.g.nodes(data=True)]
        edges = [
            {"source": u, "target": v, "weight": d.get("weight", 0.0), "ticks": d.get("ticks", [])}
            for u, v, d in self.g.edges(data=True)
        ]
        return GraphSnapshot(
            nodes=nodes,
            edges=edges,
            q_table_size=len(self.q_table),
            generated_at=time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
        )
