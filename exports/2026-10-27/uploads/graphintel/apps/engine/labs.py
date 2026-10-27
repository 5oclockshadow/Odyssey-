"""Labs: long-running programmes with phases, candidates and gates. A lab is a question in the graph plus a ladder a candidate has to climb —
each phase has an exit test, and nothing advances until a real run passes it. The agent proposes candidates and runs cells with its own tools; this
module only keeps the ledger and enforces the gates. Cells are real code, run in the sandbox (agent-dind), never simulated here."""
import json
import os
import re
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
CFG: dict = {}
GRAPH = None
LOCK = threading.Lock()
ID = re.compile(r"[a-z0-9][a-z0-9-]{1,40}")


def _file(lab: str) -> Path:
    return STATE / "labs" / f"{lab}.json"


def defs() -> dict:
    return CFG.get("labs") or {}


def load(lab: str) -> dict:
    p = _file(lab)
    return json.loads(p.read_text()) if p.exists() else {"candidates": {}, "runs": []}


def _save(lab: str, d: dict):
    _file(lab).parent.mkdir(parents=True, exist_ok=True)
    _file(lab).write_text(json.dumps(d, indent=1))


def _mutate(lab: str, fn):
    with LOCK:
        d = load(lab)
        out = fn(d)
        d["runs"] = d["runs"][-200:]
        _save(lab, d)
        return out


def phases(lab: str) -> list[dict]:
    return (defs().get(lab) or {}).get("phases") or []


def phase(lab: str, n: int) -> dict:
    ps = phases(lab)
    return ps[n] if 0 <= n < len(ps) else {}


def propose(lab: str, cid: str, label: str, payload: dict, evidence: str, actor: str = "brain") -> dict:
    """A candidate enters at phase 0. `payload` is whatever the lab's cells need (a SMILES string, a block height, a parameter set)."""
    if lab not in defs():
        raise KeyError(lab)
    if not ID.fullmatch(cid):
        raise ValueError("id: lowercase letters, digits and dashes, 2–41 characters")
    d = load(lab)
    if cid in d["candidates"]:
        raise ValueError("that candidate exists; run a cell on it instead")
    cap = (defs()[lab].get("max_candidates") or 2000)
    if len(d["candidates"]) >= cap:
        raise ValueError(f"the lab is at its candidate cap ({cap})")
    rec = {"id": cid, "label": str(label)[:160], "payload": payload, "phase": 0, "state": "open", "by": actor, "ts": time.time(),
           "evidence": str(evidence)[:600], "passed": [], "results": {}}
    _mutate(lab, lambda x: x["candidates"].__setitem__(cid, rec))
    if GRAPH is not None:
        q = defs()[lab].get("question", "")
        GRAPH.observe([{"id": f"cand:{lab}:{cid}", "type": "candidate", "label": f"{lab}/{cid}: {label}"[:160], "tel": True, "lab": lab, "phase": 0}],
                      [{"id": f"cand:{lab}:{cid}>tests", "relation": "tests", "members": [f"cand:{lab}:{cid}", q]}] if q in GRAPH.nodes else [], w=0.5)
    return rec


def cell(lab: str, n: int, payload: dict) -> dict:
    """The code for one phase, with the candidate's payload substituted. Returns {language, files, command, network} for sandbox.run."""
    p = phase(lab, n)
    if not p.get("cell"):
        raise ValueError(f"phase {n} of {lab} is not a computational phase; record its result with lab_record")
    code = p["cell"].replace("$PAYLOAD", json.dumps(payload))
    return {"language": p.get("language", "python"), "files": {p.get("file", "main.py"): code, **(p.get("files") or {})}, "command": p.get("command") or "", "network": bool(p.get("network"))}


def _verdict(lab: str, n: int, out: dict) -> dict:
    """A run passes only when its own exit test says so: the cell prints a JSON line with `pass` and the numbers behind it."""
    p, body = phase(lab, n), (out.get("stdout") or "")
    line = next((l for l in reversed(body.splitlines()) if l.strip().startswith("{")), "")
    try:
        rep = json.loads(line)
    except ValueError:
        rep = {}
    ok = bool(rep.get("pass")) and out.get("exit") == 0
    return {"pass": ok, "report": rep, "exit": out.get("exit"), "test": p.get("exit_test", ""), "stdout": body[-2000:], "stderr": (out.get("stderr") or "")[-1000:]}


def record(lab: str, cid: str, n: int, out: dict, actor: str = "brain") -> dict:
    """File a run against a candidate and move it if the phase's exit test passed. Advancing is the only way a candidate changes phase."""
    v = _verdict(lab, n, out)

    def apply(d):
        c = d["candidates"].get(cid) or (_ for _ in ()).throw(KeyError(cid))
        d["runs"].append({"cid": cid, "phase": n, "ts": time.time(), "by": actor, "pass": v["pass"], "report": v["report"], "exit": v["exit"], "tail": v["stdout"][-400:]})
        c["results"][str(n)] = {"ts": time.time(), "pass": v["pass"], "report": v["report"]}
        if v["pass"] and n == c["phase"]:
            c["passed"] = sorted(set(c["passed"] + [n]))
            c["phase"] = n + 1
            c["state"] = "proved" if c["phase"] >= len(phases(lab)) else "open"
        elif not v["pass"] and n == c["phase"]:
            c["state"] = "failed" if (phase(lab, n).get("fail_closes")) else "open"
        return dict(c)
    c = _mutate(lab, apply)
    if GRAPH is not None and f"cand:{lab}:{cid}" in GRAPH.nodes:
        GRAPH.nodes[f"cand:{lab}:{cid}"].update(phase=c["phase"], state=c["state"])
    return {"candidate": c, **v}


def note(lab: str, cid: str, text: str, actor: str = "brain") -> dict:
    """A wet-lab result, a reviewer's objection, an external report: evidence a cell cannot produce."""
    def apply(d):
        c = d["candidates"].get(cid) or (_ for _ in ()).throw(KeyError(cid))
        c["evidence"] = (c["evidence"] + "\n" + f"[{actor}] " + str(text))[-2000:]
        return dict(c)
    return _mutate(lab, apply)


def close(lab: str, cid: str, why: str, actor: str = "brain") -> dict:
    def apply(d):
        c = d["candidates"].get(cid) or (_ for _ in ()).throw(KeyError(cid))
        c["state"], c["closed_why"] = "closed", str(why)[:300]
        return dict(c)
    return _mutate(lab, apply)


def status(lab: str | None = None) -> list[dict]:
    out = []
    for name, spec in defs().items():
        if lab and name != lab:
            continue
        d = load(name)
        cands = list(d["candidates"].values())
        ps = phases(name)
        out.append({"id": name, "title": spec.get("title", name), "question": spec.get("question", ""), "brief": spec.get("brief", ""), "honest": spec.get("honest", ""),
                    "target": spec.get("target", 0), "phases": [{"n": i, "name": p.get("name", f"phase {i}"), "exit_test": p.get("exit_test", ""), "manual": not p.get("cell"),
                                                                 "at": sum(1 for c in cands if c["phase"] == i and c["state"] == "open")} for i, p in enumerate(ps)],
                    "counts": {"total": len(cands), "proved": sum(1 for c in cands if c["state"] == "proved"), "failed": sum(1 for c in cands if c["state"] == "failed"),
                               "closed": sum(1 for c in cands if c["state"] == "closed"), "runs": len(d["runs"])},
                    "candidates": sorted(cands, key=lambda c: (-c["phase"], -c["ts"]))[:40], "recent_runs": d["runs"][-12:][::-1]})
    return out


def queue(lab: str, n: int = 3) -> list[dict]:
    """Candidates sitting at a computational phase with no passing run: the work the lab actually owes."""
    d = load(lab)
    return [c for c in d["candidates"].values() if c["state"] == "open" and phase(lab, c["phase"]).get("cell") and str(c["phase"]) not in c["results"]][:n]
