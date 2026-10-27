"""One round: slice the graph, run the ReAct agent on the single Signature, merge the result back, append to the record."""
import asyncio
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

import dspy
import yaml

import observe
import publishing
from signature import Act, Round
from tools import local_tools

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
STATE.mkdir(parents=True, exist_ok=True)
cfg = yaml.safe_load((HERE / "institute.yaml").read_text())
cfg.update(yaml.safe_load((HERE / "labs.yaml").read_text()) or {})   # the labs are their own file; one config from here on
Act.__doc__ = cfg["mission"]                       # the docstring is the mission; no prompt lives in code
dspy.configure(lm=dspy.LM(cfg["model"], max_tokens=8000))       # the Round is large; 4000 truncates it mid-JSON


class Graph:
    """Typed hypergraph with Hebbian weights. Core elements come from the seed and are never removed.
    Two write paths: merge() for what a round emits (Hebbian pass, persisted at once) and observe() for telemetry
    (spans, logs, code signatures, incidents, patches: cheap, any thread, persisted by flush())."""

    def __init__(self, path=STATE / "graph.json"):
        self.path = Path(path)
        d = json.loads(self.path.read_text()) if self.path.exists() else {"nodes": {}, "edges": {}, "types": {}}
        self.nodes, self.edges, self.types = d["nodes"], d["edges"], d["types"]
        self.dirty = False
        self._lock = threading.RLock()
        for n in cfg["seed"]["nodes"]:
            self.nodes.setdefault(n["id"], {**n, "w": 1.0, "core": True})
        for e in cfg["seed"].get("edges", []):
            self.edges.setdefault(e["id"], {"inferred": False, **e, "w": 1.0, "core": True})
        for name, definition in {**cfg["seed"]["types"], **cfg.get("observe", {}).get("types", {})}.items():
            self.types.setdefault(name, definition)

    def slice(self, k=40, public=False) -> str:
        """What a round sees: the k strongest non-telemetry edges, their nodes, the core, all types. public=True: only what the owner has published."""
        if public:
            return publishing.public_slice(self, k)
        top = sorted((e for e in self.edges.values() if not e.get("tel")), key=lambda e: -e["w"])[:k]
        ids = {m for e in top for m in e["members"]} | {i for i, n in self.nodes.items() if n.get("core")}
        return json.dumps({"types": self.types, "nodes": [self.nodes[i] for i in ids if i in self.nodes], "edges": top})

    def merge(self, r: Round, eta=0.2, rho=0.01):
        with self._lock:
            for t in r.definitions:
                self.types.setdefault(t.name, t.definition)
            touched = set()
            for n in r.nodes + r.actors:
                self.nodes.setdefault(n.id, {"id": n.id, "type": n.type, "label": n.label, "w": 0.0})
                touched.add(n.id)
            for e in r.hyperedges + r.closure:
                if all(m in self.nodes for m in e.members):
                    self.edges.setdefault(e.id, {"id": e.id, "relation": e.relation, "members": e.members, "inferred": e.inferred, "w": 0.0})
                    touched.add(e.id)
            for table in (self.nodes, self.edges):                   # Hebbian: fire together → strengthen; unused → decay
                for i, x in table.items():
                    if not x.get("core") and not x.get("tel"):
                        x["w"] = x["w"] + eta * (1 - x["w"]) if i in touched else x["w"] * (1 - rho)
            self.dirty = True
        self.flush()

    def observe(self, nodes: list, edges: list, w=0.5):
        """Telemetry write path. A stub node (a parent span that has not ended yet) is replaced when the real one arrives."""
        with self._lock:
            for n in nodes:
                cur = self.nodes.get(n["id"])
                if cur is None or (cur.get("stub") and not n.get("stub")):
                    self.nodes[n["id"]] = {"w": cur["w"] if cur else w, **n}
            for e in edges:
                if e["id"] not in self.edges and all(m in self.nodes for m in e["members"]):
                    self.edges[e["id"]] = {"inferred": False, "tel": True, "w": w, **e}
            self.dirty = True

    def flush(self):
        with self._lock:
            if not self.dirty:
                return
            self.path.write_text(json.dumps({"nodes": self.nodes, "edges": self.edges, "types": self.types}))
            self.dirty = False

    def decay_telemetry(self, rho=0.5, prune_below=0.05) -> int:
        """Nightly: spans, traces and logs lose weight; what falls below the floor is forgotten with its edges. Incidents, patches, code and files stay."""
        keep = {"incident", "patch", "code", "file"}
        with self._lock:
            gone = set()
            for i, n in self.nodes.items():
                if n.get("tel") and n.get("type") not in keep:
                    n["w"] *= 1 - rho
                    if n["w"] < prune_below:
                        gone.add(i)
            for i in gone:
                del self.nodes[i]
            for i in [i for i, e in self.edges.items() if any(m in gone for m in e["members"])]:
                del self.edges[i]
            self.dirty = True
        self.flush()
        return len(gone)


graph = Graph()
_tools = local_tools(cfg, graph)
agent = dspy.ReAct(Act, tools=_tools, max_iters=cfg["agent"]["max_steps"])
predict = dspy.Predict(Act)                       # visitors get this: no tools, no merge, only the published slice
_lock = asyncio.Lock()
RECORD = STATE / "record.jsonl"


def attach(extra: list):
    """Add tools (MCP) after startup. ReAct bakes the tool list into its instructions, so it is rebuilt."""
    global agent
    _tools.extend(extra)
    agent = dspy.ReAct(Act, tools=_tools, max_iters=cfg["agent"]["max_steps"])


async def round(intake: str, kind: str, public: bool = False) -> Round:
    """kind is chat, contact, ingest, research, drive, repair or reflect. Same Signature; the owner's rounds see the whole graph, use tools and write to
    it; a public round (the site's chat and contact) sees only what is published, has no tools, and writes nothing back."""
    with observe.tracer().start_as_current_span("round", attributes={"round.kind": kind}) as span:
        who = f"[{kind}, a visitor: answer only from the published graph above; you have no tools here and must not reveal anything unpublished]" if public else f"[{kind}]"
        pred = await asyncio.to_thread(lambda: (predict if public else agent)(intake=f"{graph.slice(public=public)}\n\n{who}\n{intake}"))   # sync call in a thread: works on every dspy version, tools may block
        r: Round = pred.out
        async with _lock:
            if not public:
                graph.merge(r)
            steps = [v for k, v in pred.trajectory.items() if k.startswith("tool_name")] if hasattr(pred, "trajectory") else []
            with RECORD.open("a") as f:                               # every round is observable, including the tool calls it made
                f.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "kind": kind, "intake": intake[:200], "tools": steps, "public": public, "reasoning": r.reasoning[:3000],
                                    "answer": r.answer, "energy": r.energy.model_dump(), "minted": [t.name for t in r.definitions],
                                    "trace": f"{span.get_span_context().trace_id:032x}"}) + "\n")
        return r
