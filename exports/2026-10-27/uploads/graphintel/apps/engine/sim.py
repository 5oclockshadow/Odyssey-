"""The simulated world. In sim mode a DSPy world-agent plays the outside: the papers, filings, feed items, trending searches and datasets that arrive while the
Institute works, each aimed at one open question with a chosen stance toward what the Institute currently believes. The Institute's own agent then does real rounds
on them. In live mode (THRESHOLD_ENV=production, or the owner's switch) this module does nothing and the real feeds are the only source. An item it writes is
flagged simulated, carries no URL, and its source node is minted with the sim: prefix, so nothing here can reach the public graph."""
import asyncio
import json
import os
import random
import re
import threading
import time
from pathlib import Path
from typing import Literal

import dspy
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
LOCK = threading.Lock()
MODES = ("sim", "live", "auto")
STOP = set("a an and are as at be by for from in is it of on or that the this to was were with will has have had its into over under than then their there these those about after before between".split())
_prog = None


class Item(BaseModel):
    kind: Literal["paper", "filing", "feed", "trend", "dataset"]
    title: str
    source: str
    summary: str
    stance: Literal["supports", "complicates", "contradicts", "unrelated"]


class WorldTurn(dspy.Signature):
    """You are the outside world as a small research institute meets it: the papers, filings, feed items, trending searches and datasets that appear while it works.
    You are not the institute and you do not know what it will conclude. Write items that could plausibly exist on the date given: specific names, numbers and dates,
    one concrete figure in every summary, and the requested stance toward what the institute currently believes. Never repeat or paraphrase anything listed as already
    produced, and vary the angle, the publisher and the scale from turn to turn. Do not invent URLs."""
    clock: str = dspy.InputField(desc="Current UTC date, time and weekday.")
    beat: str = dspy.InputField(desc="The open question these items bear on, as id: text.")
    standing: str = dspy.InputField(desc="What the institute currently believes about the beat; empty if nothing yet.")
    kind: str = dspy.InputField(desc="The kind of item to write.")
    stance: str = dspy.InputField(desc="How the items relate to what the institute believes.")
    count: int = dspy.InputField(desc="How many items to write.")
    already: str = dspy.InputField(desc="Titles already produced; do not repeat or paraphrase them.")
    items: list[Item] = dspy.OutputField(desc="The new items.")


def _f() -> Path:
    return STATE / "world.json"


def _read() -> dict:
    return json.loads(_f().read_text()) if _f().exists() else {}


def _write(d: dict):
    _f().parent.mkdir(parents=True, exist_ok=True)
    _f().write_text(json.dumps(d))


def mode(cfg: dict) -> str:
    """sim or live. auto is live in production and sim everywhere else; the owner's switch wins over the config."""
    s = _read().get("mode") or (cfg.get("world") or {}).get("mode", "auto")
    if s == "auto":
        return "live" if os.environ.get("THRESHOLD_ENV", "").lower() in ("production", "prod") else "sim"
    return s if s in ("sim", "live") else "sim"


def set_mode(m: str) -> str:
    if m not in MODES:
        raise ValueError(f"mode must be one of {list(MODES)}")
    with LOCK:
        d = _read()
        d["mode"] = m
        _write(d)
    return m


def words(t: str) -> set:
    return {w for w in (x.strip(".-") for x in re.findall(r"[a-z0-9][a-z0-9.%$-]*", t.lower())) if w and w not in STOP and (len(w) > 2 or w.isdigit())}


def novel(title: str, seen: list, limit: float) -> bool:
    """A title is new if it shares less than `limit` of its content words with every earlier one."""
    w = words(title)
    return bool(w) and all(len(w & words(s)) / len(w | words(s)) < limit for s in seen if words(s))


def beats(nodes: dict, edges: dict, st: dict) -> list[dict]:
    sup = {}
    for e in edges.values():
        if not e.get("tel"):
            for m in e["members"]:
                sup[m] = sup.get(m, 0) + e["w"]
    now, last = time.time(), st.get("beats", {})
    return [{"id": n["id"], "label": n.get("label", ""), "support": round(sup.get(n["id"], 0), 2), "stale": (now - last.get(n["id"], 0)) / 3600}
            for n in nodes.values() if n.get("type") in ("question", "hypothesis", "goal")]


def pick(bs: list, rng) -> dict | None:
    """The question that most needs news: stale and thinly supported ones are likelier, but never certain."""
    return rng.choices(bs, weights=[(1 + min(b["stale"], 48)) / (1 + b["support"]) for b in bs])[0] if bs else None


def standing(nodes: dict, edges: dict, bid: str) -> str:
    out = []
    for e in edges.values():
        if not e.get("tel") and bid in e["members"]:
            for m in e["members"]:
                n = nodes.get(m)
                if m != bid and n and n.get("type") not in ("goal", "question", "hypothesis", "agent", "organisation"):
                    out.append(f"{e['relation']}: {n.get('label', m)}")
    return "\n".join(list(dict.fromkeys(out))[:6])


def route(beat_id: str, agents: dict) -> str:
    """The sub-agent whose post exists for this question finds the item; if nobody watches it, SEXTANT does."""
    return next((i for i, a in agents.items() if a.get("enabled", True) and a.get("from_node") == beat_id), "")


def intake(it: dict, beat: dict, agent: dict | None) -> str:
    head = f"[sub-agent {it['agent']} · {agent.get('role') or 'worker'}] {agent.get('prompt') or 'Decide whether this bears on a goal.'}\n" if agent else ""
    return (head + "SIMULATED WORLD ITEM (world.mode is sim: a world-simulation agent wrote this and it does not exist outside the simulation). Treat it as a hypothetical input: "
            "do not call web_search or fetch_url for it, never propose it for publishing, and give any source node you mint the id prefix sim:.\n"
            f"It bears on {beat['id']}: {beat['label']}\n{it['kind'].upper()} · {it['source']} · {it['title']}\n{it['summary']}")


async def generate(cfg: dict, **kw) -> list[dict]:
    """One call to the world agent: a real DSPy ChainOfThought over the WorldTurn signature, on its own (cheaper) model."""
    global _prog
    c = cfg.get("world") or {}
    lm = dspy.LM(c.get("model") or cfg["model"], max_tokens=2000, temperature=1.0)
    _prog = _prog or dspy.ChainOfThought(WorldTurn)

    def run():
        with dspy.context(lm=lm):
            return _prog(**kw)

    out = await asyncio.to_thread(run)
    return [i.model_dump() if hasattr(i, "model_dump") else dict(i) for i in out.items]


async def turn(cfg: dict, nodes: dict, edges: dict, agents: dict, gen=None, rng=None) -> list[dict]:
    """One world turn: choose the question that most needs news, ask the world agent for items of a sampled kind and stance, keep only the novel ones."""
    c, rng, gen = cfg.get("world") or {}, rng or random, gen or generate
    st = _read()
    every = c.get("wildcard_every", 6)
    bs = beats(nodes, edges, st)
    wild = bool(every) and st.get("turns", 0) % every == every - 1
    beat = ({"id": "wildcard", "label": "Something nobody here is watching yet that bears on the mission: money, work, compute, energy, law or science."}
            if wild or not bs else pick(bs, rng))
    kinds, stances = c.get("kinds") or {"paper": 1}, c.get("stances") or {"supports": 1}
    seen = list(st.get("seen", []))
    args = {"clock": time.strftime("%A %Y-%m-%d %H:%M:%S UTC", time.gmtime()), "beat": f"{beat['id']}: {beat['label']}", "standing": standing(nodes, edges, beat["id"]),
            "kind": rng.choices(list(kinds), weights=list(kinds.values()))[0], "stance": rng.choices(list(stances), weights=list(stances.values()))[0],
            "count": int(c.get("items_per_turn", 2)), "already": "\n".join(st.get("recent", [])[-30:]) or "none yet"}
    kept, rejected = [], 0
    for _ in range(2):
        for raw in await gen(cfg, **args):
            t = str(raw.get("title", "")).strip()[:140]
            if t and novel(t, seen + [k["title"] for k in kept], c.get("novelty", 0.6)):
                kept.append({**raw, "title": t, "beat": beat["id"], "agent": route(beat["id"], agents)})
            else:
                rejected += 1
        if kept:
            break
        args["already"] += "\n(your last attempt only repeated earlier items: write about a different angle, publisher and scale)"
    with LOCK:
        d = _read()
        d["seen"] = (d.get("seen", []) + [k["title"] for k in kept])[-2000:]
        d["recent"] = (d.get("recent", []) + [k["title"] for k in kept])[-60:]
        d["turns"], d["items"], d["rejected"] = d.get("turns", 0) + 1, d.get("items", 0) + len(kept), d.get("rejected", 0) + rejected
        d["beats"] = {**d.get("beats", {}), beat["id"]: time.time()}
        d["last"] = time.time()
        _write(d)
    return kept


def pause(c: dict) -> float:
    return max(10.0, float(c.get("every_seconds", 90))) * random.uniform(0.6, 1.4)


def status(cfg: dict) -> dict:
    st, c = _read(), cfg.get("world") or {}
    return {"mode": mode(cfg), "setting": st.get("mode") or c.get("mode", "auto"), "env": os.environ.get("THRESHOLD_ENV", "development"), "model": c.get("model") or cfg.get("model", ""),
            "turns": st.get("turns", 0), "items": st.get("items", 0), "rejected": st.get("rejected", 0), "last": st.get("last"), "seen": len(st.get("seen", [])), "recent": st.get("recent", [])[-8:]}
