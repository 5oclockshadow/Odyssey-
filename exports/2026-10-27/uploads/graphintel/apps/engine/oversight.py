"""Oversee the overseers. The agents watch the institute; this watches the agents, and turns everything into one ranked list of fires
for the owner. GET /owner/fires returns triage(); the Overseer page renders it. Pure functions over day.compile() and the record, so it is testable
with no model and no network.

A fire is anything that wants a human: an item waiting on you, an incident, an unhealthy app, a role whose agent went silent or noisy, a shadow
that beats its holder, spend over the cap. Fires of the same kind are batched so one click clears many; only the top `budget` are shown as
"look now", the rest are "later" with the reason."""
from datetime import datetime, timedelta

# Which agent role produced a round of a given kind, and how often that role is expected to run (hours).
ROLES = {"scout": (("ingest",), 6), "theorist": (("research",), 12), "critic": (("reexamine", "reflect"), 24),
         "maintainer": (("repair",), 72), "sextant": (("chat", "contact"), 0), "publisher": (("post",), 48)}
BASE = {"incident": 70, "app": 60, "upgrade": 50, "post": 30, "silent": 55, "noisy": 65, "shadow": 45, "spend": 80}
ACTIONS = {"upgrade": ["approve", "decline"], "post": ["approve", "decline"], "incident": ["approve", "decline", "retry", "mute"],
           "app": ["relaunch"], "silent": ["wake"], "noisy": ["pause"], "shadow": ["promote", "hold"], "spend": ["raise", "throttle"]}


def _age_h(ts, now: datetime) -> float:
    t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    return max(0.0, (now - (t if t.tzinfo else t.replace(tzinfo=now.tzinfo))).total_seconds() / 3600)


def score(kind: str, age_h: float, repeats: int = 1) -> int:
    """Base by kind, +1 per hour waiting (max +20), +5 per repeat (max +15). Clamped to 0–100."""
    return max(0, min(100, BASE.get(kind, 40) + min(20, int(age_h)) + min(15, 5 * (repeats - 1))))


def watchers(record: list[dict], now: datetime) -> list[dict]:
    """Per role: rounds in the last 24 h, failure share, hours since last seen, and a state: ok · silent · noisy · idle (no schedule)."""
    out = []
    for role, (kinds, every) in ROLES.items():
        rs = [r for r in record if r.get("kind") in kinds]
        recent = [r for r in rs if _age_h(r["ts"], now) <= 24]
        failed = sum(1 for r in recent if r.get("error") or float((r.get("energy") or {}).get("delta", 0)) > 0.5)
        last = min((_age_h(r["ts"], now) for r in rs), default=None)
        fail = round(failed / len(recent), 2) if recent else 0.0
        state = "idle" if not every else "silent" if last is None or last > every * 2 else "noisy" if len(recent) >= 3 and fail > 0.3 else "ok"
        out.append({"role": role, "rounds_24h": len(recent), "fail": fail, "last_h": None if last is None else round(last, 1), "every_h": every, "state": state})
    return out


def triage(d: dict, record: list[dict], now: datetime, register: list[dict] | None = None, spend: dict | None = None, budget: int = 7) -> dict:
    fires = []
    for x in d.get("needs_you", []):
        fires.append({"id": x["id"], "kind": x["kind"], "source": x["kind"], "title": x["title"], "detail": x.get("detail", ""), "age_h": _age_h(x["ts"], now)})
    for i in d.get("incidents", []):
        if i.get("status") == "repairing":
            fires.append({"id": i["id"], "kind": "incident", "source": "maintainer", "title": i["title"], "detail": i.get("outcome") or "repair running", "age_h": 0.0})
    for a in d.get("apps", []):
        if not a.get("healthy"):
            fires.append({"id": f"app:{a.get('name')}", "kind": "app", "source": "maintainer", "title": f"{a.get('name')} unhealthy", "detail": f"{a.get('restarts', 0)} restarts", "age_h": 0.0})
    ws = watchers(record, now)
    for w in ws:
        if w["state"] in ("silent", "noisy"):
            why = f"no round for {w['last_h']} h, expected every {w['every_h']} h" if w["state"] == "silent" else f"{int(w['fail'] * 100)}% of {w['rounds_24h']} rounds failed"
            fires.append({"id": f"watch:{w['role']}", "kind": w["state"], "source": w["role"], "title": f"{w['role']} is {w['state']}", "detail": why, "age_h": w["last_h"] or 0.0})
    for r in register or []:
        if r.get("shadow") and float(r.get("shadow_score", 0)) > float(r.get("holder_score", 0)):
            fires.append({"id": f"shadow:{r['role']}", "kind": "shadow", "source": "critic", "title": f"{r['shadow']} beats {r['holder']} for {r['role']}",
                          "detail": f"{r['shadow_score']} vs {r['holder_score']} on the frozen split", "age_h": 0.0})
    if spend and spend.get("cap") and spend.get("used", 0) > spend["cap"] * 0.9:
        fires.append({"id": "spend", "kind": "spend", "source": "owner", "title": "Spend near the monthly cap", "detail": f"{spend['used']} of {spend['cap']}", "age_h": 0.0})
    seen, counts = {}, {}
    for f in fires:
        counts[f["kind"]] = counts.get(f["kind"], 0) + 1
    for f in fires:
        f["score"] = score(f["kind"], f["age_h"], 1)
        f["actions"] = ACTIONS.get(f["kind"], [])
        seen.setdefault(f["id"], f)
    ranked = sorted(seen.values(), key=lambda f: (-f["score"], f["id"]))
    batches = [{"kind": k, "n": n, "ids": [f["id"] for f in ranked if f["kind"] == k], "actions": ACTIONS.get(k, [])} for k, n in sorted(counts.items()) if n > 1 and ACTIONS.get(k)]
    now_, later = ranked[:budget], ranked[budget:]
    for f in later:
        f["why_later"] = "below the top %d" % budget
    return {"now": now.isoformat(), "total": len(ranked), "look_now": now_, "later": later, "batches": batches, "watchers": ws,
            "calm": not ranked, "minutes": round(sum(2 if f["kind"] in ("post", "upgrade") else 4 for f in now_), 0)}
