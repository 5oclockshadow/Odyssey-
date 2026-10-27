"""The care loop. Every loop here is the agent's own initiative: research, drive, watch, repair, ship, reflect. Chat arrives on stdin.
Wiring (setup, bind, boot, coroutines) is shared with serve.py. python main.py [files to ingest]"""
import asyncio
import json
import logging
import os
import random
import sys
import time
from contextlib import AsyncExitStack

import auth
import bus
import day
import feeds
import fleet
import heal
import apikeys
import labs
import ledger
import mindful
import observe
import reflect
import reprice
import round as R
import sandbox
import selfmodel
import signals
import sim
import upgrades
from tools import mcp_tools

log = logging.getLogger("main")
queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
_seq = 0
WHO: dict = {}                                    # pid → the agent whose find started the round
PRIO = {"chat": 0, "contact": 1, "repair": 2, "ingest": 3, "reflect": 4, "staff": 5, "lab": 6, "reprice": 6, "drive": 7, "research": 8, "reexamine": 9}


def _ids(xs) -> list:
    return [i for i in (getattr(x, "id", None) or (x.get("id") if isinstance(x, dict) else None) for x in xs or []) if i][:60]


def put(kind: str, text: str, prio: int | None = None, who: str = "sextant"):
    global _seq
    _seq += 1
    pid = f"{int(time.time())}-{_seq}"
    WHO[pid] = who
    if kind != "repair":
        ledger.plan(who, ledger.title_for(kind, text), kind=kind, pid=pid)
    queue.put_nowait((PRIO[kind] if prio is None else prio, _seq, kind, text, pid))
    if kind not in ("chat", "contact"):                  # a chat caller is gone after a restart; everything else is worth resuming
        bus.STORE.pend(pid, {"kind": kind, "text": text[:20000]})


def _say(s):
    print(f"\n{s}\n> ", end="", flush=True)


def setup():
    """Point every module at the one config. Safe at import time."""
    c = R.cfg
    repo = os.environ.get("GITHUB_REPO") or c.get("github", {}).get("repo", "")
    heal.CFG, heal.GRAPH = {**c.get("heal", {}), "repo": repo}, R.graph
    upgrades.CFG = {"repo": repo, "base": c.get("github", {}).get("base", "main")}
    auth.CFG, day.CFG, reflect.CFG, sandbox.CFG = c.get("owner", {}), c.get("day", {}), c.get("reflect", {}), c.get("sandbox", {})
    mindful.CFG = {"mindful": c.get("publish", {}).get("mindful", {}), "timezone": c.get("day", {}).get("timezone", "UTC")}
    fleet.CFG, signals.CFG, labs.CFG, labs.GRAPH, apikeys.CFG = c.get("fleet", {}), c, c, R.graph, c
    heal.Q = reflect.Q(alpha=reflect.CFG.get("alpha", 0.3), epsilon=reflect.CFG.get("epsilon", 0.1))
    selfmodel.load(R.graph, R.HERE)                       # the graph knows every file and function of its own source
    c["research"]["topics"] += [t for t in day.topics_extra() if t not in c["research"]["topics"]]       # topics the owner added from the terminal


def bind(ev: asyncio.AbstractEventLoop):
    """Needs the running loop: incidents arrive from any thread, so repairs are queued thread-safely."""
    heal.PUT = lambda kind, text: ev.call_soon_threadsafe(put, kind, text)
    observe.install(R.cfg, R.graph, heal.on_incident)
    ev.set_exception_handler(observe.asyncio_handler)


async def boot():
    """Bring up what the agent depends on inside its own docker (Phoenix, Redis, the MCP hub, the repair image), then resume pending work."""
    if await asyncio.to_thread(sandbox.available, "agent"):
        try:
            started = await asyncio.to_thread(sandbox.ensure_services)
            await asyncio.to_thread(sandbox.ensure_images)
            log.info("agent docker ready; started %s", started or "nothing new")
        except Exception as ex:
            observe.report(ex, "boot")
    else:
        log.warning("agent docker unreachable at %s: sandbox, Phoenix, Redis and the MCP hub are off", sandbox._host("agent"))
    for pid, item in bus.STORE.pending().items():
        bus.STORE.done(pid)
        put(item["kind"], item["text"])


async def worker():
    while True:
        _, _, kind, text, pid = await queue.get()
        ledger.start("sextant", ledger.title_for(kind, text), kind=kind, pid=pid)
        try:
            if kind == "repair":                          # the graph found it; one round writes the fix; the sandbox judges it
                inc = json.loads(text)
                inc["strategy"] = heal.Q.choose(f"repair:{inc.get('type', 'error')}", heal.STRATEGIES) if heal.Q else "patch_minimal"
                r = await R.round(heal.intake_for(inc, inc["strategy"]), "repair")
                out = await heal.repair(inc, r.answer, sandbox)
                ledger.finish(pid, f"{inc['id']} → {out['outcome']}")
                _say(f"[repair] {inc['id']} → {out['outcome']}")
            elif kind == "reflect":
                rec = await reflect.daily(R.graph, R.cfg, R.round, heal.Q)
                ledger.finish(pid, f"pruned {rec['pruned']} telemetry nodes; {len(rec['plan'])} topics planned tomorrow")
                _say(f"[reflect] pruned {rec['pruned']} telemetry nodes · plan: {len(rec['plan'])} topics")
            else:
                r = await R.round(text, "research" if kind in ("reexamine", "staff", "lab", "reprice") else kind)
                ledger.finish(pid, r.answer, energy=round(r.energy.delta, 3), nodes=len(r.nodes), edges=len(r.hyperedges),
                              node_ids=_ids(r.nodes), edge_ids=_ids(r.hyperedges), origin=WHO.pop(pid, "sextant"))
                if kind in ("chat", "contact"):
                    ledger.say("sextant", "owner" if kind == "chat" else "visitor", "msg", r.answer)
                else:
                    ledger.say("sextant", "sextant", "thought", f"{ledger.title_for(kind, text)} — {r.answer}")
                _say(f"SEXTANT: {r.answer}" if kind == "chat" else f"[{kind}] ΔE={r.energy.delta:+.2f} +{len(r.nodes)} nodes +{len(r.hyperedges)} edges minted={[t.name for t in r.definitions]}")
        except Exception as ex:                           # the loop never dies; the failure becomes an incident unless it already was one
            if kind != "repair":
                observe.report(ex, kind)
            ledger.finish(pid, str(ex)[:300], state="failed")
            _say(f"[{kind}] failed: {ex}")
        finally:
            bus.STORE.done(pid)
            queue.task_done()


def weakest(n: int = 3) -> list[dict]:
    return sorted((e for e in R.graph.edges.values() if not e.get("tel") and not e.get("core")), key=lambda e: e["w"])[:n]


async def research_forever():
    """Hungry by design: every topic once at boot, then the graph's weakest edges every research.every_seconds, forever."""
    for topic in reflect.plan_topics(R.cfg, heal.Q) if heal.Q else R.cfg["research"]["topics"]:
        put("research", f"Research this topic and return what the Institute should know, as graph deltas with sources: {topic}")
    while True:
        await asyncio.sleep(R.cfg["research"]["every_seconds"])
        for e in weakest():
            put("reexamine", f"Re-examine edge {e['id']}: {e['relation']} over {e['members']}. Confirm, refine or retract, with a source.")


def drive_intake() -> str:
    """What to do with free time. The agent chooses; this only reminds it what it is for and what is open."""
    c, nodes = R.cfg["autonomy"], R.graph.nodes.values()
    pick = lambda t, k: random.sample([n["label"] for n in nodes if n.get("type") == t], min(k, sum(1 for n in nodes if n.get("type") == t)))
    plan = R.STATE / "plan.json"
    topics = json.loads(plan.read_text()).get("topics", [])[:3] if plan.exists() else []
    return (c["drive"] + "\n\nGOALS\n- " + "\n- ".join(pick("goal", 5)) + "\n\nOPEN QUESTIONS\n- " + "\n- ".join(pick("question", 3))
            + "\n\nWEAKEST EDGES\n- " + "\n- ".join(f"{e['id']}: {e['relation']} {e['members']}" for e in weakest()) + "\n\nTOMORROW'S PLAN\n- " + "\n- ".join(topics))


async def drive_forever():
    """Self-directed rounds: with the queue quiet, the agent decides what is most worth doing and does it with its tools."""
    c = R.cfg["autonomy"]
    while True:
        await asyncio.sleep(c["drive_every_seconds"])
        if queue.qsize() < c["max_pending"]:
            put("drive", drive_intake())


async def watch_forever():
    await feeds.watch_forever(R.cfg, put, bus.STORE)


def unstaffed() -> list[dict]:
    """Open questions, goals and hypotheses in the graph with no sub-agent watching them, weakest support first."""
    have, w = fleet.staffed(), {}
    for e in R.graph.edges.values():
        if not e.get("tel"):
            for m in e["members"]:
                w[m] = w.get(m, 0) + e["w"]
    return sorted(({"id": n["id"], "type": n["type"], "label": n.get("label", ""), "falsifier": n.get("falsifier", ""), "support": round(w.get(n["id"], 0), 2)}
                   for n in R.graph.nodes.values() if n.get("type") in ("question", "hypothesis", "goal") and n["id"] not in have), key=lambda n: n["support"])


def staffing_intake() -> str:
    """What the agent is shown when it decides its own staff: its unwatched research, the sources it could give a post, and the fleet it already has."""
    import signals
    c, open_, now = R.cfg.get("staffing") or {}, unstaffed(), fleet.load()
    srcs = [f"{s['id']} ({s['label']}, {s['kind']})" for s in signals.all_sources() if s["enabled"]]
    mine = "\n- ".join(f"{a['id']}: {a['role']} — watches {a.get('from_node') or 'nothing in particular'} — {a['items']} items, {a['errors']} errors, "
                       f"last seen {int(time.time() - a['last_seen']) if a['last_seen'] else 'never'}s ago" for a in now.values()) or "empty"
    return (c.get("intake", "").strip()
            + "\n\nUNWATCHED, WEAKEST SUPPORT FIRST\n- " + "\n- ".join(f"{n['id']} [{n['type']}, support {n['support']}] {n['label']}"
                                                                        + (f" — falsifier: {n['falsifier']}" if n["falsifier"] else "") for n in open_[:8])
            + "\n\nSOURCES YOU CAN GIVE IT\n- " + "\n- ".join(srcs[:14])
            + f"\n\nYOUR FLEET ({len(now)} of {fleet.CFG.get('max', 12)}, room for {fleet.CFG.get('max', 12) - len(now)})\n- " + mine)


async def staffing_forever():
    """An institute staffed by the very research it studies: the agent is shown its own unwatched questions and decides for itself whether one deserves a
    standing post. It creates the sub-agent with its own fleet_create tool; nothing here creates anything."""
    c = R.cfg.get("staffing") or {}
    if not c.get("enabled", True):
        return
    await asyncio.sleep(c.get("first_after_seconds", 180))
    while True:
        try:
            if unstaffed() and len(fleet.load()) < fleet.CFG.get("max", 12) and queue.qsize() < R.cfg["autonomy"]["max_pending"]:
                put("staff", staffing_intake())
        except Exception as ex:
            observe.report(ex, "staffing")
        await asyncio.sleep(c.get("every_seconds", 1800))


def labs_intake() -> str:
    """What the agent is shown when a lab needs work: the lab's own brief and honest note, what it owes, and what has passed."""
    out = []
    for l in labs.status():
        q = labs.queue(l["id"], 3)
        out.append(f"LAB {l['id']} — {l['title']} (serves {l['question']})\n{l['brief'].strip()}\n\nWHAT THIS LAB CANNOT DO\n{l['honest'].strip()}\n\n"
                   + "PHASES\n- " + "\n- ".join(f"{p['n'] + 1} {p['name']} — exit test: {p['exit_test']}" + (" [a bench reports this, not a cell]" if p["manual"] else f" [{p['at']} waiting]") for p in l["phases"])
                   + f"\n\nCOUNTS {l['counts']}" + (f" · programme target {l['target']} candidates" if l["target"] else "")
                   + ("\n\nUNRUN, RUN THESE FIRST\n- " + "\n- ".join(f"{c['id']} at phase {c['phase'] + 1}: {c['label']}" for c in q) if q else "\n\nNothing is waiting on a run."))
    return (R.cfg.get("labs_loop") or {}).get("intake", "").strip() + "\n\n" + "\n\n———\n\n".join(out)


async def labs_forever():
    """The labs run themselves: the agent is shown each lab's queue and decides what to propose, run, record or close, with its own lab_* tools."""
    c = R.cfg.get("labs_loop") or {}
    if not c.get("enabled", True) or not labs.defs():
        return
    await asyncio.sleep(c.get("first_after_seconds", 240))
    while True:
        try:
            if queue.qsize() < R.cfg["autonomy"]["max_pending"]:
                put("lab", labs_intake())
        except Exception as ex:
            observe.report(ex, "labs")
        await asyncio.sleep(c.get("every_seconds", 600))


async def world_turn() -> list[dict]:
    """One turn of the simulated world: the DSPy world-agent writes what arrives, each item goes to the sub-agent watching its question (or to SEXTANT), and the
    Institute's own agent does a real round on it. Only ever called in sim mode."""
    agents = fleet.load()
    items = await sim.turn(R.cfg, R.graph.nodes, R.graph.edges, agents)
    for it in items:
        aid = it["agent"]
        who = f"sub:{aid}" if aid else "sextant"
        beat = {"id": it["beat"], "label": (R.graph.nodes.get(it["beat"]) or {}).get("label", it["beat"])}
        put("ingest", sim.intake(it, beat, agents.get(aid)), None, who)
        t = ledger.start(who, f"Found: {it['title'][:90]}", note=f"{it['kind']} · {it['source']}", kind="find", sim=True)
        ledger.finish(t["id"], "sent to SEXTANT")
        ledger.say(who if aid else "world", "sextant", "report", f"{it['title']} — {it['source']} (simulated {it['kind']}, {it['stance']})")
    return items


async def world_forever():
    """Where the outside world comes from. In sim mode a DSPy world-agent writes the papers, filings, feed items and trends that arrive; in live mode (production, or the
    owner's switch) it does nothing and the real feeds are the only source."""
    c = R.cfg.get("world") or {}
    await asyncio.sleep(c.get("first_after_seconds", 20))
    while True:
        try:
            if sim.mode(R.cfg) == "sim" and queue.qsize() < R.cfg["autonomy"]["max_pending"]:
                await world_turn()
        except Exception as ex:
            observe.report(ex, "world")
        await asyncio.sleep(sim.pause(c))


def reprice_intake() -> str:
    """What the agent is shown when it reprices: the most overdue name, the method, its last record of it, and the limitations it holds."""
    c, due = R.cfg.get("reprice") or {}, reprice.due(R.cfg, 1)
    if not due:
        return ""
    a = due[0]
    prior = next((e for e in reversed(reprice.entries()) if e["asset"].lower() == a["asset"].lower()), None)
    last = (f"\n\nYOUR LAST RECORD OF IT ({round((time.time() - prior['ts']) / 3600, 1)} hours ago)\n- expected re-rate {prior['expected_rerate']:+.1f}%, range {prior['rerate_low']:+.0f}% to "
            f"{prior['rerate_high']:+.0f}%, confidence {prior['confidence']}: {prior['why'][:240]}") if prior else "\n\nYou have never priced this asset."
    lim = [l for l in reprice.limits() if l["status"] != "lifted"][:10]
    return (f"REPRICE: {a['asset']}\n" + c.get("intake", "").strip() + f"\n\nASSET\n- {a['asset']} · kind {a['kind']} · unit {a.get('unit', '')}\n- where to look: {a.get('hint', '')}" + last
            + "\n\nLIMITATIONS YOU HOLD (put the ones that touch this asset in the record's limits)\n- "
            + "\n- ".join(f"{l['id']} [{l['area']}, severity {l['severity']}, {l['status']}] {l['text']}" for l in lim))


def limits_intake() -> str:
    """What the agent is shown when it works down its own limitations: every open one, worst first, with what would lift it and what only the owner can give."""
    c = R.cfg.get("reprice") or {}
    lim = sorted((l for l in reprice.limits() if l["status"] != "lifted"), key=lambda l: -l["severity"])[:12]
    if not lim:
        return ""
    rows = [f"{l['id']} [{l['area']}, severity {l['severity']}, {l['status']}] {l['text']} — lifts by: {l['lifts_by'] or 'unknown'}"
            + (f" — plan: {l['plan']}" if l["plan"] else "") + (f" — needs the owner: {l['owner_needed']}" if l.get("owner_needed") else "") for l in lim]
    return "LIMITS: work down the limitations\n" + c.get("limits_intake", "").strip() + "\n\nOPEN LIMITATIONS\n- " + "\n- ".join(rows)


async def reprice_forever():
    """The Institute reprices GPU-linked commodities and assets on its own clock and works down what it cannot yet see: every third round is about the limitations. The most
    overdue name goes to the agent with the method and its limits; the agent does the work with its own tools. Nothing here fetches a price or writes a number."""
    c = R.cfg.get("reprice") or {}
    if not c.get("enabled", True):
        return
    reprice.seed(R.cfg)
    await asyncio.sleep(c.get("first_after_seconds", 240))
    n = 0
    while True:
        try:
            if queue.qsize() < R.cfg["autonomy"]["max_pending"]:
                text = limits_intake() if n % 3 == 2 else reprice_intake()
                if text:
                    put("reprice", text)
            n += 1
        except Exception as ex:
            observe.report(ex, "reprice")
        await asyncio.sleep(c.get("every_seconds", 1200))


async def fleet_forever():
    """Every minute: sub-agents are made to match their records, their output becomes ingest rounds, and each one is a node the graph can reason about."""
    ev = asyncio.get_running_loop()
    await asyncio.sleep(20)
    while True:
        try:
            await asyncio.to_thread(fleet.reconcile)
            await asyncio.to_thread(fleet.harvest, lambda k, t, who="sextant": ev.call_soon_threadsafe(put, k, t, None, who), bus.STORE)
            for a in fleet.load().values():
                R.graph.observe([{"id": f"sub:{a['id']}", "type": "subagent", "label": f"{a['id']}: {a['role'] or 'worker'}", "tel": True, "where": a["where"], "enabled": a["enabled"], "items": a["items"]}],
                                [{"id": f"sub:{a['id']}>by", "relation": "works_for", "members": [f"sub:{a['id']}", "sextant"]}], w=0.7)
        except Exception as ex:
            observe.report(ex, "fleet")
        await asyncio.sleep(60)


async def flush_forever():
    while True:
        await asyncio.sleep(5)
        R.graph.flush()


async def apps_forever():
    """Every five minutes: ship the queue, relaunch what crashed, and turn a crash into an incident the graph can repair."""
    every = R.cfg.get("apps", {}).get("publish_every_seconds", 300)
    while True:
        await asyncio.sleep(every)
        if not await asyncio.to_thread(sandbox.available, "web"):
            continue
        try:
            for ev in await asyncio.to_thread(sandbox.reconcile):
                name = ev.get("name", "")
                if ev["event"] == "crashed":
                    meta = sandbox.app_meta(name)
                    heal.on_incident({"source": "app", "code": f"app:{name}", "type": "AppCrash", "line": 1, "message": f"{name} stopped and was restarted ({ev['restarts']} restarts)",
                                      "stack": ev.get("logs", ""), "file": str(sandbox.STATE / "apps" / name / sandbox.LANGS[meta["language"]]["file"]) if meta else None})
                elif ev["event"] == "ship_failed":
                    heal.on_incident({"source": "app", "code": f"app:{name}", "type": "ShipFailed", "message": (ev.get("output") or "")[:300], "stack": ev.get("output", "")})
                elif ev["event"] == "app_log":            # an error line in a running app: a log node on the app, not yet an incident
                    lid = f"log:app:{name}:{abs(hash(ev['line'])) % 10**8}"
                    R.graph.observe([{"id": lid, "type": "log", "label": ev["line"][:120], "tel": True, "level": "ERROR", "ts": time.time()}],
                                    [{"id": f"{lid}>app", "relation": "logged_by", "members": [lid, f"app:{name}"]}])
                    continue
                _say(f"[apps] {ev['event']} {name}")
            for name, a in sandbox.registry()["apps"].items():                    # every shipped app is a node the graph can reason about
                R.graph.observe([{"id": f"app:{name}", "type": "app", "label": name, "tel": True, "healthy": a.get("healthy"), "port": a.get("port"),
                                  "language": a.get("language"), "restarts": a.get("restarts", 0), "url": a.get("url")}],
                                [{"id": f"app:{name}>by", "relation": "shipped_by", "members": [f"app:{name}", "sextant"]}], w=0.8)
                R.graph.nodes[f"app:{name}"].update(healthy=a.get("healthy"), restarts=a.get("restarts", 0))
        except Exception as ex:
            observe.report(ex, "apps")


async def hub_forever():
    """Hold a session to the MCP hub open and give the agent its tools; if the hub is not up yet (the engine starts it), try again every minute."""
    while True:
        try:
            async with AsyncExitStack() as stack:
                tools = await mcp_tools(R.cfg, stack)
                if tools:
                    R.attach(tools)
                    await asyncio.Event().wait()
        except asyncio.CancelledError:
            raise
        except Exception as ex:
            log.warning("mcp hub session ended: %s", ex)
        await asyncio.sleep(60)


async def stdin_chat():
    loop = asyncio.get_running_loop()
    print("> ", end="", flush=True)
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if line.strip():
            put("chat", line.strip())


async def ingest(paths: list[str]):
    for p in paths:                                       # files on the command line are pumped into the same graph
        put("ingest", open(p).read()[:20000])


def coroutines() -> list:
    return [worker() for _ in range(R.cfg["concurrency"])] + [research_forever(), drive_forever(), watch_forever(), flush_forever(),
                                                                apps_forever(), fleet_forever(), staffing_forever(), labs_forever(), world_forever(), reprice_forever(), hub_forever(), reflect.scheduler(R.cfg, put)]


async def main():
    setup()
    bind(asyncio.get_running_loop())
    await asyncio.gather(boot(), ingest(sys.argv[1:]), stdin_chat(), *coroutines())


if __name__ == "__main__":
    asyncio.run(main())
