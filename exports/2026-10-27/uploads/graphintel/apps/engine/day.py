"""The owner's day, compiled from what the Institute actually did: the record, the incidents, the apps, the outbox, the graph,
the reflection. GET /owner/day returns compile(); the terminal renders it. Nothing here is invented; every item points at a file."""
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

import upgrades

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
ROOT = HERE.parents[1]
CFG: dict = {}
KEYS = ["now", "date", "phase", "phases", "vitals", "night", "stream", "needs_you", "incidents", "apps", "posts", "upgrades", "weakest", "strongest", "q", "reflection", "research_today", "traces"]
DEFAULT_SCHEDULE = [
    {"at": "06:00", "id": "night", "title": "Night report"}, {"at": "07:30", "id": "brief", "title": "Morning brief"},
    {"at": "09:00", "id": "inbox", "title": "Inbox and approvals"}, {"at": "11:00", "id": "incidents", "title": "Incidents"},
    {"at": "13:00", "id": "ship", "title": "Ship"}, {"at": "15:00", "id": "research", "title": "Research"},
    {"at": "17:00", "id": "publish", "title": "Publish"}, {"at": "22:00", "id": "reflection", "title": "Reflection"},
]
TITLES = {"chat": "Chat", "contact": "Contact answered", "research": "Research", "reexamine": "Re-examined", "repair": "Repair round", "reflect": "Reflection", "ingest": "Ingested"}
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def tz():
    return ZoneInfo(CFG.get("timezone", "UTC"))


def _jsonl(path: Path) -> list[dict]:
    out = []
    if path.exists():
        for line in path.read_text().splitlines():
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def _ts(s) -> datetime:
    if isinstance(s, (int, float)):
        return datetime.fromtimestamp(s, timezone.utc).astimezone(tz())
    d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(tz())


def _at(day_start: datetime, hhmm: str) -> datetime:
    h, m = map(int, str(hhmm).split(":"))
    return day_start.replace(hour=h, minute=m)


def phase_of(t: datetime, day_start: datetime, sched: list) -> str:
    for i, p in enumerate(sched):
        start = _at(day_start, p["at"])
        end = _at(day_start, sched[i + 1]["at"]) if i + 1 < len(sched) else day_start + timedelta(days=1)
        if start <= t < end:
            return p["id"]
    return sched[-1]["id"]                                  # before the first phase: still last night's


def _registry(cfg) -> dict:
    import sandbox
    return sandbox.registry()["apps"]


def _cadence_today(cfg, weekday: int) -> list[str]:
    p = (HERE / cfg["publish"].get("schedule", "../../marketing/schedule.yaml")).resolve()
    if not p.exists():
        return []
    sched = yaml.safe_load(p.read_text()) or {}
    return [f"{ch} at {c.get('time', '')}: {c.get('what', '')}" for ch, c in (sched.get("cadence") or {}).items() if DAYS[weekday] in (c.get("days") or [])]


def compile(graph, cfg, pending: int = 0, now: datetime | None = None) -> dict:
    import heal
    import reflect
    sched = CFG.get("schedule") or DEFAULT_SCHEDULE
    now = now or datetime.now(tz())
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    night_from, night_to = day_start - timedelta(hours=2), _at(day_start, sched[0]["at"])
    hm = lambda t: t.strftime("%H:%M")
    ph = lambda t: sched[0]["id"] if t < night_to else phase_of(t, day_start, sched)      # everything before the night report belongs to the night
    stream, research_today, series = [], [], []
    for i, r in enumerate(_jsonl(STATE / "record.jsonl")):
        t = _ts(r["ts"])
        if t < night_from:
            continue
        d, k, intake = float((r.get("energy") or {}).get("delta", 0.0)), r.get("kind", "research"), r.get("intake", "")
        if t >= day_start:
            series.append(round(d, 3))
        if k in ("research", "reexamine"):
            research_today.append({"topic": intake.split(": ", 1)[-1][:120], "delta": d})
        title = TITLES.get(k, k)
        if k == "research":
            title = "Research: " + intake.split(": ", 1)[-1].strip()[:90]
        elif k == "reexamine":
            title = "Re-examined " + (intake.split("Re-examine edge ", 1)[1].split(":")[0] if "Re-examine edge " in intake else "an edge")
        elif k in ("chat", "contact"):
            title = f"{TITLES[k]}: {intake[:80]}"
        tags = [f"ΔE {d:+.2f}"] + ([f"+{len(r['minted'])} types"] if r.get("minted") else []) + ([f"{len(r['tools'])} tool calls"] if r.get("tools") else [])
        stream.append({"id": f"round:{i}", "ts": t.isoformat(), "t": hm(t), "phase": ph(t), "kind": k, "title": title,
                       "detail": (r.get("answer") or "")[:260], "tags": tags, "steps": [], "actions": [], "status": "done"})
    incidents = []
    for iid, rec in heal.latest().items():
        first = _ts(rec.get("first_ts", rec["ts"]))
        if first < now - timedelta(hours=24):
            continue
        code = str(rec.get("code") or "?").split(":", 1)[-1]
        steps = [{"t": hm(first), "s": "raised", "d": f"{rec.get('type', 'error')} in {code} · via {rec.get('source', 'span')}"}]
        if rec.get("file"):
            steps.append({"t": hm(first), "s": "located", "d": f"{Path(rec['file']).name}:{rec.get('line', '?')} · {rec.get('strategy', '')}".rstrip(" ·")})
        if rec.get("tests"):
            steps.append({"t": hm(_ts(rec["ts"])), "s": "tests", "d": rec["tests"].strip().splitlines()[-1][:100] if rec["tests"].strip() else ""})
        if rec.get("outcome"):
            steps.append({"t": hm(_ts(rec["ts"])), "s": rec["outcome"].split("_")[0], "d": heal.OUTCOMES.get(rec["outcome"], rec["outcome"]) + (f" · {rec['pr']}" if rec.get("pr") else "")})
        if rec.get("owner"):
            steps.append({"t": hm(_ts(rec["ts"])), "s": "owner", "d": rec["owner"]})
        status = rec.get("status", "open")
        actions = []
        if status == "waiting" and not rec.get("owner"):
            actions = [{"id": "approve", "label": "Approve and merge"}, {"id": "decline", "label": "Close"}]
        elif status == "closed" and rec.get("outcome") in ("tests_failed", "no_patch", "sandbox_unavailable", "patch_failed", "ship_failed") and not rec.get("owner"):
            actions = [{"id": "retry", "label": "Retry"}, {"id": "mute", "label": "Mute"}]
        item = {"id": iid, "ts": first.isoformat(), "t": hm(first), "phase": ph(first), "kind": "incident",
                "title": f"{rec.get('type', 'error')} in {code}", "detail": (rec.get("message") or "")[:200], "tags": [rec.get("source", ""), f"attempt {rec.get('attempts', 1)}"],
                "steps": steps, "actions": actions, "status": "repairing" if status == "open" else status, "pr": rec.get("pr"), "file": rec.get("file"), "line": rec.get("line")}
        stream.append(item)
        incidents.append({k: item.get(k) for k in ("id", "title", "status", "pr", "file", "line")} | {"outcome": rec.get("outcome"), "type": rec.get("type"), "code": rec.get("code")})
    outbox = STATE / cfg["publish"]["outbox"]
    posts = []
    for f in sorted(outbox.glob("*.md")) if outbox.exists() else []:
        if not re.fullmatch(r"\d{8}T\d{6}-[a-z]+\.md", f.name):            # publish() names drafts <utc stamp>-<channel>.md; anything else is not a draft
            continue
        try:
            created = datetime.strptime(f.stem.split("-")[0], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc).astimezone(tz())
        except ValueError:
            created = datetime.fromtimestamp(f.stat().st_mtime, tz())
        text = f.read_text()
        title = text.splitlines()[0][2:].strip() if text.startswith("# ") else text.strip().splitlines()[0][:80] if text.strip() else f.name
        item = {"id": f"post:{f.name}", "ts": created.isoformat(), "t": hm(created), "phase": ph(created), "kind": "post",
                "title": f"Draft for {f.stem.rsplit('-', 1)[-1]}: {title}", "detail": text[:260], "tags": [f"{len(text.split())} words"], "steps": [],
                "actions": [{"id": "approve", "label": "Approve and post"}, {"id": "decline", "label": "Decline"}], "status": "waiting", "file": str(f)}
        stream.append(item)
        posts.append({"id": item["id"], "channel": f.stem.rsplit("-", 1)[-1], "title": title, "ts": item["ts"]})
    ups = []
    for u in upgrades.load():
        t = _ts(u["ts"])
        waiting = u["status"] == "proposed"
        if not waiting and t < now - timedelta(hours=24):
            continue
        item = {"id": u["id"], "ts": t.isoformat(), "t": hm(t), "phase": ph(t), "kind": "upgrade", "title": u["title"], "detail": u["rationale"][:260],
                "tags": ["diff" if u.get("diff") else "plan", u["status"].replace("_", " ")], "steps": [], "status": "waiting" if waiting else "done", "pr": u.get("pr"),
                "actions": [{"id": "approve", "label": "Test and open PR" if u.get("diff") else "Open issue"}, {"id": "decline", "label": "Decline"}] if waiting else []}
        stream.append(item)
        ups.append({k: item[k] for k in ("id", "title", "status", "pr")} | {"diff": bool(u.get("diff"))})
    apps = []
    for name, a in _registry(cfg).items():
        pub = _ts(a["published"]) if a.get("published") else None
        apps.append({**a, "status": "healthy" if a.get("healthy") else "unhealthy"})
        if pub and pub >= night_from:
            stream.append({"id": f"app:{name}", "ts": pub.isoformat(), "t": hm(pub), "phase": ph(pub), "kind": "app", "title": f"{name} shipped",
                           "detail": f"{a.get('language')} · port {a.get('port')} · {'healthy' if a.get('healthy') else 'unhealthy'} · {a.get('url')}",
                           "tags": [a.get("language", ""), f"{a.get('restarts', 0)} restarts"], "steps": [], "status": "healthy" if a.get("healthy") else "unhealthy",
                           "actions": [{"id": "open", "label": "Open", "href": a.get("url")}, {"id": "relaunch", "label": "Relaunch"}]})
    stream.sort(key=lambda x: x["ts"])
    night_items = [x for x in stream if night_from <= _ts(x["ts"]) < night_to]
    rounds = [x for x in night_items if x["kind"] in TITLES]
    by_kind = {}
    for x in rounds:
        by_kind[x["kind"]] = by_kind.get(x["kind"], 0) + 1
    night = {"from": hm(night_from), "to": hm(night_to), "rounds": len(rounds), "by_kind": by_kind,
             "delta": round(sum(float(t[3:]) for x in rounds for t in x["tags"] if t.startswith("ΔE ")), 2),
             "fixed": sum(1 for x in night_items if x["kind"] == "incident" and x["status"] in ("waiting", "closed")),
             "shipped": sum(1 for x in night_items if x["kind"] == "app"), "drafted": sum(1 for x in night_items if x["kind"] == "post")}
    current = phase_of(now, day_start, sched)
    phases = []
    queued = len(list((STATE / "apps" / "queue").glob("*/ship.json"))) if (STATE / "apps" / "queue").exists() else 0
    every = cfg.get("apps", {}).get("publish_every_seconds", 300) // 60
    plan = {"ship": f"{queued} queued · {len(apps)} live, reconciled every {every} min",
            "research": f"{pending} rounds pending · {len(cfg['research']['topics'])} topics, re-ranked nightly",
            "publish": " · ".join(_cadence_today(cfg, now.weekday())) or "nothing scheduled today",
            "reflection": f"at {CFG.get('reflect_at', '22:00')}: reflect round, telemetry decays, Q-table updates, tomorrow's plan",
            "incidents": "every error becomes an incident node; the graph locates it; the sandbox tests the fix",
            "inbox": "contact messages are answered by the agent; approvals wait here", "brief": "energy trend, weakest edges, what waits on you",
            "night": f"what happened {hm(night_from)}–{hm(night_to)}"}
    for i, p in enumerate(sched):
        start = _at(day_start, p["at"])
        state = "current" if p["id"] == current else ("done" if start < now else "ahead")
        items = [x for x in stream if x["phase"] == p["id"]]
        phases.append({**p, "state": state, "count": len(items), "planned": plan.get(p["id"], "")})
    edges = sorted((e for e in graph.edges.values() if not e.get("tel")), key=lambda e: e["w"])
    q = reflect.Q(alpha=cfg.get("reflect", {}).get("alpha", 0.3), epsilon=cfg.get("reflect", {}).get("epsilon", 0.1))
    refl = _jsonl(STATE / "reflections.jsonl")
    last = refl[-1] if refl else None
    reflection = {"ts": last["ts"], "answer": last["answer"][:700], "plan": last.get("plan", []), "pruned": last.get("pruned", 0)} if last else None
    vitals = {"nodes": len(graph.nodes), "edges": len(graph.edges), "types": len(graph.types), "pending": pending, "energy": round(sum(series), 2), "series": series[-48:],
              "incidents_open": sum(1 for x in incidents if x["status"] in ("repairing", "waiting")), "apps_live": sum(1 for a in apps if a.get("healthy")),
              "model": cfg["model"], "phoenix": os.environ.get("PHOENIX_PUBLIC") or CFG.get("phoenix_public", "http://localhost:6006")}
    return {"now": now.isoformat(), "date": f"{now:%A} {now.day} {now:%B %Y}", "phase": current, "phases": phases, "vitals": vitals, "night": night, "stream": stream,
            "needs_you": [x for x in stream if x["status"] == "waiting"], "incidents": incidents, "apps": apps, "posts": posts, "upgrades": ups,
            "weakest": [{k: e[k] for k in ("id", "relation", "members", "w")} for e in edges[:5]],
            "strongest": [{k: e[k] for k in ("id", "relation", "members", "w")} for e in edges[-5:][::-1]],
            "q": [{"state": r["state"], "action": r["action"], "v": r["v"], "n": r["n"]} for r in q.top(6)], "reflection": reflection, "research_today": research_today,
            "traces": reflect.trace_stats(graph)}


def add_topic(text: str, cfg, path: Path | None = None) -> dict:
    """Remember a research topic. The engine's code and institute.yaml are read-only to it, so owner topics live in state/topics.json and are
    merged into research.topics at startup (see topics_extra). With `path`, the topic is also written into that yaml, comments kept."""
    text = " ".join(str(text).split())[:200].replace('"', "'")
    if not text:
        return {"ok": False, "error": "empty topic"}
    extra = topics_extra()
    if text not in extra:
        STATE.mkdir(parents=True, exist_ok=True)
        (STATE / "topics.json").write_text(json.dumps(extra + [text]))
    cfg["research"]["topics"].append(text)
    if path:
        lines = Path(path).read_text().splitlines()
        i = next((i for i, ln in enumerate(lines) if ln.strip().startswith("topics:")), None)
        if i is None:
            return {"ok": False, "error": "no research.topics in the yaml"}
        j = i + 1
        while j < len(lines) and lines[j].startswith("    - "):
            j += 1
        lines.insert(j, f'    - "{text}"')
        Path(path).write_text("\n".join(lines) + "\n")
    return {"ok": True, "topic": text, "topics": len(cfg["research"]["topics"])}


def topics_extra() -> list[str]:
    p = STATE / "topics.json"
    return json.loads(p.read_text()) if p.exists() else []


def act_post(name: str, action: str, cfg) -> dict:
    """Approve posts the draft through tools.send and moves it to outbox/sent; decline moves it to outbox/declined."""
    import reflect
    import tools
    outbox = STATE / cfg["publish"]["outbox"]
    f = outbox / name
    if "/" in name or f.suffix != ".md" or not f.exists():
        return {"ok": False, "error": "no such draft"}
    text, channel = f.read_text(), f.stem.rsplit("-", 1)[-1]
    title = text.splitlines()[0][2:].strip() if text.startswith("# ") else ""
    body = "\n".join(text.splitlines()[2:]).strip() if title else text
    if action == "approve":
        try:
            result = tools.send(channel, body, title)
        except KeyError as ex:
            return {"ok": False, "error": f"missing credential {ex}"}
        except Exception as ex:
            return {"ok": False, "error": str(ex)[:300]}
        dest, reward = outbox / "sent", 1.0
    elif action == "decline":
        result, dest, reward = "declined", outbox / "declined", -1.0
    else:
        return {"ok": False, "error": f"cannot {action} a draft"}
    dest.mkdir(exist_ok=True)
    f.rename(dest / f.name)
    reflect.Q(alpha=cfg.get("reflect", {}).get("alpha", 0.3)).update(f"publish:{channel}", "draft", reward)
    return {"ok": True, "result": result}
