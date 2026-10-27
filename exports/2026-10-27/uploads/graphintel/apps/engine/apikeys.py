"""Paid API tenants and what they earn. A tenant has keys and a plan; every metered call is appended to state/api/usage.jsonl with the rung that
answered and its price, so earnings are summed from real calls, never invented. serve records a call with record(); the public /v1 API (when enabled)
is the only writer. No model, no docker: files and arithmetic."""
import hashlib
import json
import os
import secrets
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
DIR = STATE / "api"
LOCK = threading.Lock()
CFG: dict = {}
PLANS = {"metered": {"label": "Metered", "monthly": 0.0}, "team": {"label": "Team", "monthly": 99.0}, "scale": {"label": "Scale", "monthly": 499.0}}
# price per call by the rung that answered it, in USD — the thesis made legible: the cheap rungs cost the tenant almost nothing
RUNG_PRICE = {"lstm": 0.00005, "tiny": 0.0001, "1-3b": 0.0004, "8b": 0.0012, "30b": 0.004, "graph": 0.00001}


def _load(name, default):
    p = DIR / name
    return json.loads(p.read_text()) if p.exists() else default


def _save(name, data):
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / name).write_text(json.dumps(data, indent=1))


def _usage() -> list[dict]:
    p = DIR / "usage.jsonl"
    if not p.exists():
        return []
    out = []
    for line in p.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def tenants() -> dict:
    return _load("tenants.json", {})


def create(name: str, plan: str = "metered", cap_usd: float = 100.0, actor: str = "owner") -> dict:
    name = " ".join(str(name).split())[:80]
    if not name:
        raise ValueError("a tenant needs a name")
    if plan not in PLANS:
        raise ValueError(f"plan must be one of {list(PLANS)}")
    with LOCK:
        d = tenants()
        tid = "t_" + secrets.token_hex(4)
        raw = "anma_" + secrets.token_hex(16)
        d[tid] = {"id": tid, "name": name, "plan": plan, "cap_usd": float(cap_usd), "created": time.time(), "by": actor, "active": True, "child_safe": False,
                  "keys": [{"id": "k_" + secrets.token_hex(3), "last4": raw[-4:], "hash": hashlib.sha256(raw.encode()).hexdigest(), "created": time.time()}]}
        _save("tenants.json", d)
    return {**d[tid], "secret_shown_once": raw}


def update(tid: str, patch: dict, actor: str = "owner") -> dict:
    with LOCK:
        d = tenants()
        t = d.get(tid) or (_ for _ in ()).throw(KeyError(tid))
        for k in ("name", "plan", "cap_usd", "active", "child_safe"):
            if k in patch and patch[k] is not None:
                if k == "plan" and patch[k] not in PLANS:
                    raise ValueError("unknown plan")
                t[k] = patch[k]
        _save("tenants.json", d)
    return t


def remove(tid: str) -> dict:
    with LOCK:
        d = tenants()
        gone = d.pop(tid, None) or (_ for _ in ()).throw(KeyError(tid))
        _save("tenants.json", d)
    return gone


def rotate(tid: str) -> dict:
    with LOCK:
        d = tenants()
        t = d.get(tid) or (_ for _ in ()).throw(KeyError(tid))
        raw = "anma_" + secrets.token_hex(16)
        t["keys"] = [{"id": "k_" + secrets.token_hex(3), "last4": raw[-4:], "hash": hashlib.sha256(raw.encode()).hexdigest(), "created": time.time()}]
        _save("tenants.json", d)
    return {**t, "secret_shown_once": raw}


def record(tid: str, rung: str, calls: int = 1) -> dict:
    """Meter real calls. The public API calls this once it knows which rung answered; earnings are summed from these lines, never set by hand."""
    price = RUNG_PRICE.get(rung, RUNG_PRICE["1-3b"]) * max(1, calls)
    row = {"ts": time.time(), "tid": tid, "rung": rung, "calls": calls, "usd": round(price, 6)}
    with LOCK:
        DIR.mkdir(parents=True, exist_ok=True)
        with (DIR / "usage.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
    return row


def _window(rows, days):
    cut = time.time() - days * 86400
    return [r for r in rows if r["ts"] >= cut]


def sheet() -> dict:
    """The tenant sheet and the earnings behind it: per-tenant calls, spend and rung mix this month, and the month's totals by rung."""
    d, rows = tenants(), _usage()
    month = _window(rows, 30)
    by_t: dict[str, dict] = {}
    for r in month:
        a = by_t.setdefault(r["tid"], {"calls": 0, "usd": 0.0, "rungs": {}})
        a["calls"] += r["calls"]
        a["usd"] += r["usd"]
        a["rungs"][r["rung"]] = a["rungs"].get(r["rung"], 0) + r["calls"]
    rung_totals: dict[str, dict] = {}
    for r in month:
        a = rung_totals.setdefault(r["rung"], {"calls": 0, "usd": 0.0})
        a["calls"] += r["calls"]
        a["usd"] += r["usd"]
    rows_out = []
    for tid, t in d.items():
        u = by_t.get(tid, {"calls": 0, "usd": 0.0, "rungs": {}})
        sub = PLANS[t["plan"]]["monthly"] if t.get("active") else 0.0
        rows_out.append({"id": tid, "name": t["name"], "plan": PLANS[t["plan"]]["label"], "active": t.get("active", True), "cap_usd": t.get("cap_usd", 0),
                         "calls": u["calls"], "metered_usd": round(u["usd"], 2), "subscription_usd": sub, "total_usd": round(u["usd"] + sub, 2),
                         "rungs": u["rungs"], "last4": (t["keys"][0]["last4"] if t.get("keys") else ""), "keys": len(t.get("keys", []))})
    metered = sum(r["metered_usd"] for r in rows_out)
    subs = sum(r["subscription_usd"] for r in rows_out)
    cpu_calls = sum(a["calls"] for k, a in rung_totals.items() if k in ("lstm", "tiny", "graph"))
    total_calls = sum(a["calls"] for a in rung_totals.values())
    return {"tenants": sorted(rows_out, key=lambda r: -r["total_usd"]), "rung_totals": rung_totals, "prices": RUNG_PRICE, "plans": PLANS,
            "mrr": round(subs, 2), "metered_month": round(metered, 2), "revenue_month": round(metered + subs, 2),
            "calls_month": total_calls, "cpu_share": round(cpu_calls / total_calls, 3) if total_calls else 0.0,
            "series": _daily(month)}


def _daily(rows) -> list[dict]:
    by = {}
    for r in rows:
        day = time.strftime("%m-%d", time.gmtime(r["ts"]))
        by[day] = by.get(day, 0.0) + r["usd"]
    return [{"day": d, "usd": round(v, 2)} for d, v in sorted(by.items())][-14:]


def verify(raw: str) -> dict | None:
    """The active tenant a raw key belongs to; keys are stored only as hashes."""
    if not raw or not raw.startswith("anma_"):
        return None
    h = hashlib.sha256(raw.encode()).hexdigest()
    return next((t for t in tenants().values() if t.get("active", True) and any(secrets.compare_digest(k["hash"], h) for k in t.get("keys", []))), None)


def spent(tid: str) -> float:
    """What a tenant has been metered this month."""
    return round(sum(r["usd"] for r in _window(_usage(), 30) if r["tid"] == tid), 6)
