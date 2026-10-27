"""The Institute's fair repricing of GPU-linked commodities and assets, and the ledger of what it cannot yet do. The agent does the work with its own tools
(reprice_record, limit_note); this module only validates, stores and computes. It fetches no price and writes no figure: a record is refused unless it carries
sourced drivers, scenarios that sum to one and span both directions, a stated range that agrees with them, and its limits. Every expected value is computed
here from the agent's own weights. Nothing that rests on a simulated source can be published."""
import json
import os
import re
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
LOCK = threading.Lock()
KINDS = ("commodity", "equity", "credit", "rental", "power", "crypto")
CONF = ("low", "medium", "high")
AREAS = ("data", "method", "model", "coverage", "access")
STATUS = ("open", "working", "lifted")
BASIS = ("real", "simulated")
PUBLIC = ("id", "asset", "kind", "unit", "market", "as_of", "fair_low", "fair_high", "expected_rerate", "rerate_low", "rerate_high", "net_drivers", "scenarios",
          "drivers", "sources", "limits", "why", "confidence", "basis", "history", "age_h")


def _p(name: str) -> Path:
    return STATE / "reprice" / name


def _load(name: str, default):
    p = _p(name)
    return json.loads(p.read_text()) if p.exists() else default


def _save(name: str, data):
    _p(name).parent.mkdir(parents=True, exist_ok=True)
    _p(name).write_text(json.dumps(data, indent=1))


def _num(v, name: str, lo=None, hi=None) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number")
    if (lo is not None and x < lo) or (hi is not None and x > hi):
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return x


def entries() -> list[dict]:
    p = _p("entries.jsonl")
    out = []
    for line in (p.read_text().splitlines() if p.exists() else []):
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def record(e: dict, actor: str = "sextant") -> dict:
    asset = " ".join(str(e.get("asset", "")).split())[:60]
    kind, conf = str(e.get("kind", "")).lower(), str(e.get("confidence", "low")).lower()
    if not asset:
        raise ValueError("an entry needs an asset")
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {list(KINDS)}")
    if conf not in CONF:
        raise ValueError(f"confidence must be one of {list(CONF)}")
    why = " ".join(str(e.get("why", "")).split())
    if len(why) < 40:
        raise ValueError("why must say what moves the price, in a sentence or two")
    srcs = []
    for s in e.get("sources") or []:
        sid, basis = str(s.get("id", "")).strip(), str(s.get("basis", "")).lower()
        if not sid or basis not in BASIS:
            raise ValueError(f"each source needs an id and a basis of {list(BASIS)}")
        srcs.append({"id": sid, "label": str(s.get("label", sid))[:120], "url": str(s.get("url", ""))[:300], "basis": basis, "as_of": str(s.get("as_of", ""))[:20]})
    if len(srcs) < 2:
        raise ValueError("cite at least two sources")
    ids = {s["id"] for s in srcs}
    drivers = []
    for d in e.get("drivers") or []:
        ev = [str(x) for x in d.get("evidence") or []]
        if not ev or any(x not in ids for x in ev):
            raise ValueError(f"driver {d.get('name')!r} must cite source ids from your own sources list")
        drivers.append({"name": str(d.get("name", ""))[:100], "direction": 1 if _num(d.get("direction", 0), "direction") > 0 else -1,
                        "weight": _num(d.get("weight", 0.5), "weight", 0, 1), "evidence": ev})
    if len(drivers) < 2:
        raise ValueError("give at least two drivers, each citing your sources")
    sc = [{"name": str(s.get("name", ""))[:100], "p": _num(s.get("p"), "scenario p", 0, 1), "rerate_pct": _num(s.get("rerate_pct"), "scenario rerate_pct", -100, 1000),
           "note": str(s.get("note", ""))[:240]} for s in e.get("scenarios") or []]
    if len(sc) < 2:
        raise ValueError("give at least two scenarios")
    tot = sum(s["p"] for s in sc)
    if abs(tot - 1) > 0.02:
        raise ValueError(f"scenario probabilities sum to {tot:.2f}; they must sum to 1")
    for s in sc:
        s["p"] = round(s["p"] / tot, 4)
    lo, hi = min(s["rerate_pct"] for s in sc), max(s["rerate_pct"] for s in sc)
    one_sided = str(e.get("one_sided_reason", "")).strip()
    if not lo < 0 < hi and not one_sided:
        raise ValueError("scenarios must span both directions (one raises the value, one lowers it) or say why not in one_sided_reason")
    expected = round(sum(s["p"] * s["rerate_pct"] for s in sc), 2)
    market, fl, fh = e.get("market"), e.get("fair_low"), e.get("fair_high")
    if market is not None:
        market = _num(market, "market", 1e-9)
        if fl is None or fh is None:
            raise ValueError("with a sourced market price, give fair_low and fair_high in the same unit")
        fl, fh = _num(fl, "fair_low", 0), _num(fh, "fair_high", 0)
        if fl > fh:
            raise ValueError("fair_low is above fair_high")
        a, b = (fl / market - 1) * 100, (fh / market - 1) * 100
        if not a - 5 <= expected <= b + 5:
            raise ValueError(f"your scenario-weighted re-rate ({expected:+.1f}%) falls outside the fair range you stated ({a:+.1f}% to {b:+.1f}%); reconcile them")
        if not re.match(r"\d{4}-\d{2}-\d{2}", str(e.get("as_of", ""))):
            raise ValueError("a market price needs as_of as YYYY-MM-DD")
    else:
        fl = fh = None
    limits = [str(x)[:240] for x in e.get("limits") or [] if str(x).strip()]
    if not limits:
        raise ValueError("every repricing states what it cannot see: give at least one limit")
    real = sum(1 for s in srcs if s["basis"] == "real")
    if conf == "high" and real < 3:
        raise ValueError("high confidence needs three real sources")
    basis = "real" if real == len(srcs) else "simulated" if real == 0 else "mixed"
    row = {"id": f"px-{re.sub(r'[^a-z0-9]+', '-', asset.lower()).strip('-')[:24]}-{int(time.time() * 1000) % 10**9:x}", "ts": time.time(), "by": actor, "asset": asset, "kind": kind,
           "unit": str(e.get("unit", ""))[:24], "market": market, "as_of": str(e.get("as_of", ""))[:10], "fair_low": fl, "fair_high": fh, "scenarios": sc, "drivers": drivers,
           "sources": srcs, "limits": limits, "why": why[:900], "confidence": conf, "one_sided_reason": one_sided[:240], "rerate_low": lo, "rerate_high": hi,
           "expected_rerate": expected, "net_drivers": round(sum(d["direction"] * d["weight"] for d in drivers), 2), "basis": basis, "publishable": basis == "real"}
    with LOCK:
        _p("entries.jsonl").parent.mkdir(parents=True, exist_ok=True)
        with _p("entries.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
    return row


def set_pub(eid: str, on: bool) -> dict:
    e = next((x for x in entries() if x["id"] == eid), None)
    if not e:
        raise KeyError(eid)
    if on and not e["publishable"]:
        raise ValueError("an entry that rests on simulated sources can never be published")
    with LOCK:
        d = _load("pub.json", {})
        d[eid] = bool(on)
        _save("pub.json", d)
    return {"id": eid, "pub": bool(on)}


def board(public: bool = False) -> list[dict]:
    """The latest record for each asset, with its history of expected re-rates. Public: only what the owner has approved."""
    pubs, latest, hist = _load("pub.json", {}), {}, {}
    for e in entries():
        k = e["asset"].lower()
        latest[k] = e
        hist.setdefault(k, []).append([e["ts"], e["expected_rerate"]])
    rows = [{**e, "pub": bool(pubs.get(e["id"])), "history": hist[k][-24:], "age_h": round((time.time() - e["ts"]) / 3600, 1)} for k, e in latest.items()]
    return sorted((r for r in rows if r["pub"] or not public), key=lambda r: (r["kind"], r["asset"]))


def public_row(r: dict) -> dict:
    return {k: r.get(k) for k in PUBLIC}


def due(cfg: dict, n: int = 1) -> list[dict]:
    """The watchlist, most overdue first: assets never priced come before the stalest."""
    last = {e["asset"].lower(): e["ts"] for e in entries()}
    return sorted((cfg.get("reprice") or {}).get("watchlist", []), key=lambda a: last.get(a["asset"].lower(), 0))[:n]


def limits() -> list[dict]:
    return sorted(_load("limits.json", {}).values(), key=lambda l: ({"open": 0, "working": 1, "lifted": 2}[l["status"]], -l["severity"], l["id"]))


def public_limits() -> list[dict]:
    return [{k: l.get(k) for k in ("id", "text", "area", "severity", "status", "lifts_by")} for l in limits()]


def seed(cfg: dict) -> None:
    """First run only: the limitations the Institute starts out holding. After that the agent and the owner own the ledger."""
    with LOCK:
        if _load("limits.json", None) is not None:
            return
        d = {}
        for i, l in enumerate((cfg.get("reprice") or {}).get("limits", []), 1):
            d[f"lim-{i}"] = {"id": f"lim-{i}", "text": l["text"], "area": l.get("area", "data"), "severity": int(l.get("severity", 2)), "lifts_by": l.get("lifts_by", ""), "plan": "",
                             "owner_needed": l.get("owner_needed", ""), "status": "open", "ts": time.time(), "by": "seed", "history": []}
        _save("limits.json", d)


def note_limit(l: dict, actor: str = "sextant") -> dict:
    """Open, update or lift a limitation. Lifting needs a how."""
    text = " ".join(str(l.get("text", "")).split())[:300]
    if len(text) < 12:
        raise ValueError("state the limitation in a sentence")
    area, st = str(l.get("area", "data")), str(l.get("status") or "open")
    if area not in AREAS or st not in STATUS:
        raise ValueError(f"area must be one of {list(AREAS)} and status one of {list(STATUS)}")
    with LOCK:
        d = _load("limits.json", {})
        lid = str(l.get("id") or f"lim-{len(d) + 1}")
        cur = d.get(lid, {"id": lid, "ts": time.time(), "by": actor, "history": []})
        plan = str(l.get("plan", cur.get("plan", "")))[:300]
        if st == "lifted" and len(plan) < 12:
            raise ValueError("say how it was lifted in plan, with the evidence")
        cur.update({"text": text, "area": area, "severity": max(1, min(3, int(l.get("severity", cur.get("severity", 2))))), "status": st, "plan": plan,
                    "lifts_by": str(l.get("lifts_by", cur.get("lifts_by", "")))[:300], "owner_needed": str(l.get("owner_needed", cur.get("owner_needed", "")))[:200]})
        cur["history"] = (cur.get("history", []) + [{"ts": time.time(), "by": actor, "status": st, "plan": plan}])[-12:]
        d[lid] = cur
        _save("limits.json", d)
    return cur
