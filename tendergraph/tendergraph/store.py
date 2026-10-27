"""Graph persistence — real backends only, picked explicitly, loud on failure. No fakes, no silent cascade.

- TENDERGRAPH_REDIS_URL set  -> Redis (key `tendergraph:graph`). The `redis` package missing or the server
  unreachable is a startup error, never a quiet fall back to something that only looks like Redis.
- otherwise                  -> a JSON snapshot on disk (TENDERGRAPH_STATE, default ./state/graph.json),
  written atomically (tmp file + replace).
`describe()` says which store is live; /health reports it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import networkx as nx

from .graph import TOK

KEY = "tendergraph:graph"


class FileStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def describe(self) -> str:
        return f"file:{self.path}"

    def load(self) -> dict | None:
        try:
            return json.loads(self.path.read_text())
        except FileNotFoundError:
            return None

    def save(self, data: dict) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data))
        tmp.replace(self.path)


class RedisStore:
    def __init__(self, url: str):
        try:
            import redis  # real client only
        except ImportError as e:
            raise RuntimeError("TENDERGRAPH_REDIS_URL is set but the `redis` package is not installed") from e
        self.url = url
        self.r = redis.Redis.from_url(url)
        self.r.ping()  # unreachable server = startup error, not a silent fallback

    def describe(self) -> str:
        return f"redis:{self.url.rsplit('@', 1)[-1]}"

    def load(self) -> dict | None:
        raw = self.r.get(KEY)
        return json.loads(raw) if raw else None

    def save(self, data: dict) -> None:
        self.r.set(KEY, json.dumps(data))


def from_env():
    url = os.environ.get("TENDERGRAPH_REDIS_URL", "").strip()
    return RedisStore(url) if url else FileStore(os.environ.get("TENDERGRAPH_STATE", "state/graph.json"))


def dump(graph) -> dict:
    with graph.lock:
        return nx.node_link_data(graph.g, edges="links")


def restore(graph, data: dict) -> int:
    """Replace the graph's contents with a snapshot; rebuilds the recall index. Returns the node count."""
    g = nx.node_link_graph(data, directed=True, multigraph=True, edges="links")
    with graph.lock:
        graph.g = g
        graph._tok = {}
        for nid, node in g.nodes(data=True):
            graph._tok[nid] = set(TOK.findall((str(node.get("text", "")) + " " + str(nid)).lower()))
    return g.number_of_nodes()
