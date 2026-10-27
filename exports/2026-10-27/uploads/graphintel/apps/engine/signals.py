"""Signals: what the Institute watches. A source is an RSS/Atom feed or Google Trends for one country. institute.yaml seeds them; the owner and the
brain add, change, switch off and remove their own in state/sources.json. Every new item becomes one ingest round, each link once, ever."""
import json
import os
import re
import time
from pathlib import Path

import httpx

import parsers

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
CFG: dict = {}
KINDS = ("rss", "trends")
_live: dict[str, tuple[float, list]] = {}


def _load(name: str, default):
    p = STATE / name
    return json.loads(p.read_text()) if p.exists() else default


def _save(name: str, data):
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / name).write_text(json.dumps(data, indent=1))


def trends_url(geo: str) -> str:
    return f"https://trends.google.com/trending/rss?geo={geo.upper()}"


def seeds() -> list[dict]:
    w, every = CFG.get("watch", {}), CFG.get("watch", {}).get("every_seconds", 900)
    out = [{"id": f"yaml:{i}", "kind": "rss", "url": u, "geo": "", "label": re.sub(r"^https?://(www\.)?", "", u).split("/")[0], "every": every, "enabled": True, "tags": [], "limit": w.get("per_feed", 10), "by": "seed", "seed": True}
           for i, u in enumerate(w.get("feeds", []))]
    out += [{"id": f"yaml:trends-{g.upper()}", "kind": "trends", "url": trends_url(g), "geo": g.upper(), "label": f"Google Trends {g.upper()}", "every": max(every, 1800), "enabled": True, "tags": [], "limit": 10, "by": "seed", "seed": True}
            for g in w.get("trends", [])]
    return out


def all_sources() -> list[dict]:
    s = _load("sources.json", {"user": {}, "off": []})
    return [{**x, "enabled": x["enabled"] and x["id"] not in s["off"]} for x in seeds()] + list(s["user"].values())


def get(id: str) -> dict:
    for s in all_sources():
        if s["id"] == id:
            return s
    raise KeyError(id)


def _clean(raw: dict, old: dict | None = None) -> dict:
    s = {**(old or {"kind": "rss", "url": "", "geo": "", "label": "", "every": 900, "enabled": True, "tags": [], "limit": 10}), **{k: v for k, v in raw.items() if v is not None}}
    if s["kind"] not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    if s["kind"] == "trends":
        if not re.fullmatch(r"[A-Za-z]{2}", str(s["geo"])):
            raise ValueError("trends needs a two-letter country code, e.g. US")
        s["geo"], s["url"] = s["geo"].upper(), trends_url(s["geo"])
    elif not re.fullmatch(r"https?://[^\s]{4,300}", str(s["url"])):
        raise ValueError("rss needs an http(s) url")
    s["label"] = str(s["label"] or (f"Google Trends {s['geo']}" if s["kind"] == "trends" else re.sub(r"^https?://(www\.)?", "", s["url"]).split("/")[0]))[:60]
    s["every"] = max(60, min(int(s["every"]), 86400))
    s["limit"] = max(1, min(int(s["limit"]), 50))
    s["tags"] = [str(t)[:24] for t in (s["tags"] or [])][:8]
    s["enabled"] = bool(s["enabled"])
    return s


def add(raw: dict, by: str = "owner") -> dict:
    s = _clean(raw)
    if any(x["kind"] == s["kind"] and x["url"] == s["url"] for x in all_sources()):
        raise ValueError("already watching that")
    s.update(id=f"s-{int(time.time() * 1000) % 10**9:x}", by=by, seed=False)
    d = _load("sources.json", {"user": {}, "off": []})
    d["user"][s["id"]] = s
    _save("sources.json", d)
    return s


def update(id: str, patch: dict, by: str = "owner") -> dict:
    d = _load("sources.json", {"user": {}, "off": []})
    if id in d["user"]:
        d["user"][id] = {**_clean({k: v for k, v in patch.items() if k != "id"}, d["user"][id]), "by": d["user"][id]["by"]}
        _save("sources.json", d)
        return d["user"][id]
    get(id)                                                    # a seed from institute.yaml can only be switched off or on
    if set(patch) - {"enabled"}:
        raise ValueError("a seeded source can only be switched on or off")
    d["off"] = [x for x in d["off"] if x != id] + ([] if patch.get("enabled", True) else [id])
    _save("sources.json", d)
    return get(id)


def remove(id: str) -> dict:
    d = _load("sources.json", {"user": {}, "off": []})
    if id not in d["user"]:
        get(id)
        raise ValueError("a seeded source cannot be removed; switch it off")
    gone = d["user"].pop(id)
    _save("sources.json", d)
    return gone


def status() -> dict:
    return _load("signals.json", {})


def resolve(ids: list[str]) -> list[dict]:
    have = {s["id"]: s for s in all_sources()}
    return [{k: have[i][k] for k in ("id", "kind", "url", "label", "limit")} for i in ids if i in have]


def describe(it: dict, label: str = "") -> str:
    if "traffic" in it:
        news = f" News: {'; '.join(it['news'][:3])}." if it.get("news") else ""
        return f"Trending search on {label or 'Google Trends'}: '{it['title']}' ({it.get('traffic') or 'traffic unknown'} searches).{news} Decide whether it bears on a goal or open question; if so, record what it adds, with a source; if not, say so in one line."
    return (f"New item from {label}: {it['title']} — {it['link']}. Fetch it, decide which goal or question it bears on, "
            "and record what it adds or contradicts, with the source.")


def trends_live(geo: str, ttl: int = 300) -> list[dict]:
    t, items = _live.get(geo, (0, []))
    if time.time() - t > ttl:
        items = parsers.trends(httpx.get(trends_url(geo), timeout=15, follow_redirects=True, headers={"user-agent": "threshold-institute/0.4"}).text)
        _live[geo] = (time.time(), items)
    return items


async def pump(put, store, force: bool = False, only: str | None = None) -> int:
    """Fetch every source that is due; queue each unseen item. `force` ignores the clock; `only` runs one source."""
    n, now, st, cap = 0, time.time(), status(), CFG.get("watch", {}).get("max_per_cycle", 5)
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"user-agent": "threshold-institute/0.4"}) as c:
        for s in all_sources():
            if (only and s["id"] != only) or not s["enabled"]:
                continue
            r = st.get(s["id"], {})
            if not (force or only) and now - r.get("last", 0) < s["every"]:
                continue
            try:
                items = (parsers.trends if s["kind"] == "trends" else parsers.rss)((await c.get(s["url"])).text)
                new = 0
                for it in items[: s["limit"]]:
                    if n < cap and store.once(f"sig:{s['id']}:{it['link'] or it['title']}", 30 * 86400):
                        put("ingest", describe(it, s["label"]))
                        n, new = n + 1, new + 1
                r = {"last": now, "ok": True, "err": "", "n": len(items), "new": new, "items": items[:20]}
            except Exception as ex:
                r = {**r, "last": now, "ok": False, "err": str(ex)[:200]}
            st[s["id"]] = r
    _save("signals.json", st)
    return n
