"""The owner's dynamic display: widgets in state/display.json that the brain (display_set) and the owner both edit. Each widget resolves its own
live rows here, so every UI (the Fleet console, the phone app) is only a renderer: {title, sub, tag, link, value} per row."""
import json
import os
import re
import time
from pathlib import Path

import fleet
import signals

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
TYPES, VIEWS = ("signals", "trends", "fleet", "vitals", "note"), ("list", "tiles", "bars")
BASE = {"type": "note", "title": "", "source": "", "geo": "US", "text": "", "size": 1, "view": "list", "limit": 8, "enabled": True}
DEFAULT = [{**BASE, "id": "w-trends", "type": "trends", "title": "Trending now", "size": 2, "view": "bars", "by": "seed"},
           {**BASE, "id": "w-signals", "type": "signals", "title": "Newest from your sources", "size": 2, "by": "seed"},
           {**BASE, "id": "w-fleet", "type": "fleet", "title": "Sub-agents", "view": "tiles", "limit": 12, "by": "seed"},
           {**BASE, "id": "w-vitals", "type": "vitals", "title": "The brain", "by": "seed"}]


def load() -> list[dict]:
    p = STATE / "display.json"
    return json.loads(p.read_text()) if p.exists() else [dict(w) for w in DEFAULT]


def _save(ws):
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / "display.json").write_text(json.dumps(ws, indent=1))


def upsert(spec: dict, by: str = "owner") -> dict:
    ws = load()
    id = spec.get("id") or f"w-{int(time.time() * 1000) % 10**8:x}"
    old = next((w for w in ws if w["id"] == id), None)
    w = {**(old or BASE), **{k: v for k, v in spec.items() if v is not None and k != "order"}, "id": id, "by": by}
    if w["type"] not in TYPES or w["view"] not in VIEWS:
        raise ValueError(f"type is one of {TYPES}, view one of {VIEWS}")
    w["size"], w["limit"], w["title"], w["text"] = max(1, min(int(w["size"]), 3)), max(1, min(int(w["limit"]), 30)), str(w["title"])[:60], str(w["text"])[:500]
    w["geo"] = str(w["geo"]).upper()[:2]
    if old:
        ws[ws.index(old)] = w
    else:
        ws.append(w)
    if spec.get("order") is not None:
        ws.insert(max(0, min(int(spec["order"]), len(ws) - 1)), ws.pop(ws.index(w)))
    _save(ws)
    return w


def remove(id: str) -> str:
    ws = load()
    if not any(w["id"] == id for w in ws):
        raise KeyError(id)
    _save([w for w in ws if w["id"] != id])
    return id


def _num(s) -> float:
    m = re.match(r"([\d,.]+)\s*([KkMm]?)", str(s))
    return float(m.group(1).replace(",", "") or 0) * {"": 1, "k": 1e3, "m": 1e6}[m.group(2).lower()] if m else 0


def rows(w: dict, vitals: dict) -> list[dict]:
    t = w["type"]
    try:
        if t == "trends":
            return [{"title": i["title"], "sub": (i["news"] or [""])[0], "tag": i["traffic"], "link": i["link"], "value": _num(i["traffic"])} for i in signals.trends_live(w["geo"])]
        if t == "signals":
            st, have = signals.status(), {s["id"]: s for s in signals.all_sources()}
            ids = [w["source"]] if w["source"] else [i for i in have if i in st]
            return [{"title": i["title"], "sub": have[s]["label"], "tag": i.get("traffic", ""), "link": i["link"], "value": _num(i.get("traffic", ""))} for s in ids if s in have for i in st.get(s, {}).get("items", [])]
        if t == "fleet":
            return [{"title": a["name"], "sub": a["role"] or a["where"], "tag": a["status"], "link": "", "value": a["items"]} for a in fleet.list_()]
        if t == "vitals":
            return [{"title": k, "sub": "", "tag": str(v), "link": "", "value": v if isinstance(v, (int, float)) else 0} for k, v in vitals.items()]
        return [{"title": w["text"], "sub": "", "tag": "", "link": "", "value": 0}] if w["text"] else []
    except Exception as ex:
        return [{"title": "unavailable", "sub": str(ex)[:120], "tag": "error", "link": "", "value": 0}]


def data(vitals: dict) -> list[dict]:
    return [{**w, "rows": rows(w, vitals)[: w["limit"]] if w["enabled"] else []} for w in load()]
