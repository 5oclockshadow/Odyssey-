"""Once a day the Institute reads its own day and adjusts. A Q-table over the discrete choices it keeps making (how to repair,
what to research, what to publish); Hebbian decay and pruning of the day's telemetry; one reflect round; tomorrow's plan."""
import asyncio
import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
CFG: dict = {}


class Q:
    """state|action → value. choose() is ε-greedy; update() is the one-step rule with no successor: each choice is its own episode."""

    def __init__(self, path=None, alpha=0.3, epsilon=0.1):
        self.path, self.alpha, self.epsilon = Path(path or STATE / "q.json"), alpha, epsilon
        self.table = json.loads(self.path.read_text()) if self.path.exists() else {}

    def value(self, state, action):
        return self.table.get(f"{state}|{action}", {}).get("v", 0.0)

    def choose(self, state, actions, explore=True):
        actions = list(actions)
        if explore and random.random() < self.epsilon:
            return random.choice(actions)
        return max(actions, key=lambda a: self.value(state, a))

    def update(self, state, action, reward):
        cur = self.table.get(f"{state}|{action}", {"v": 0.0, "n": 0})
        cur = {"v": round(cur["v"] + self.alpha * (reward - cur["v"]), 4), "n": cur["n"] + 1, "state": state, "action": action}
        self.table[f"{state}|{action}"] = cur
        self.save()
        return cur["v"]

    def policy(self, state):
        rows = [r for r in self.table.values() if r["state"] == state]
        return max(rows, key=lambda r: r["v"])["action"] if rows else None

    def top(self, n=8):
        return sorted(self.table.values(), key=lambda r: -r["n"])[:n]

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.table))


def plan_topics(cfg, q: Q) -> list[str]:
    """Tomorrow's research order: the configured topics, re-ranked by what rounds on them have returned."""
    return sorted((str(t) for t in cfg["research"]["topics"]), key=lambda t: -q.value(f"research:{t[:40]}", "run"))


def trace_stats(graph, n: int = 8) -> list[dict]:
    """What ran, from the span nodes in the graph: calls, errors and mean duration per code path. Reflection reads this; so does the terminal."""
    agg: dict[str, dict] = {}
    for node in graph.nodes.values():
        if node.get("type") != "span" or node.get("stub"):
            continue
        a = agg.setdefault(node["label"], {"name": node["label"], "calls": 0, "errors": 0, "ms": 0.0})
        a["calls"] += 1
        a["errors"] += int(node.get("status") == "ERROR")
        a["ms"] += float(node.get("ms") or 0)
    rows = sorted(agg.values(), key=lambda r: -r["calls"])[:n]
    for r in rows:
        r["ms"] = round(r["ms"] / r["calls"], 1)
    return rows


def _tz(cfg):
    return ZoneInfo(cfg.get("day", {}).get("timezone", "UTC"))


async def daily(graph, cfg, round_fn, q: Q | None = None, now=None) -> dict:
    """The reflect round, the Q updates from today's research, telemetry decay, tomorrow's plan. Returns what was written."""
    import day
    q = q or Q(alpha=CFG.get("alpha", 0.3), epsilon=CFG.get("epsilon", 0.1))
    d = day.compile(graph, cfg, now=now)
    intake = ("Daily reflection. Below is what the Institute did today, in numbers and outcomes. In `answer`: (1) three sentences on what moved "
              "the graph most and whether consistency energy fell; (2) the three weakest edges to re-examine tomorrow, by id; (3) one thing to stop "
              "doing; (4) tomorrow's research topics in order, one per line, each line starting with '- '.\n\n"
              + json.dumps({k: d[k] for k in ("night", "vitals", "weakest", "apps", "q", "traces")})[:12000]
              + "\n\nINCIDENTS\n" + json.dumps([{k: i.get(k) for k in ("id", "type", "code", "outcome")} for i in d["incidents"]])[:3000])
    r = await round_fn(intake, "reflect")
    for row in d["research_today"]:
        q.update(f"research:{row['topic'][:40]}", "run", -row["delta"])      # a round that lowered the energy was worth running
    pruned = graph.decay_telemetry(CFG.get("telemetry_decay", 0.5), CFG.get("prune_below", 0.05))
    topics = [ln[2:].strip() for ln in r.answer.splitlines() if ln.startswith("- ")] or plan_topics(cfg, q)
    rec = {"ts": datetime.now(_tz(cfg)).isoformat(), "answer": r.answer, "energy": r.energy.model_dump(), "pruned": pruned, "plan": topics}
    STATE.mkdir(exist_ok=True)
    with (STATE / "reflections.jsonl").open("a") as f:
        f.write(json.dumps(rec) + "\n")
    (STATE / "plan.json").write_text(json.dumps({"ts": rec["ts"], "topics": topics}))
    return rec


async def scheduler(cfg, put):
    """Sleep until day.reflect_at, queue the reflect round, repeat. The night report needs no model: the terminal compiles it from the record."""
    tz = _tz(cfg)
    hh, mm = map(int, str(cfg.get("day", {}).get("reflect_at", "22:00")).split(":"))
    while True:
        now = datetime.now(tz)
        at = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if at <= now:
            at += timedelta(days=1)
        await asyncio.sleep((at - now).total_seconds())
        put("reflect", "scheduled")
