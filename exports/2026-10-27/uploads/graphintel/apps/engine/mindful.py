"""Mindful posting. Every outbound post passes this one gate: daily caps, quiet hours, spacing, duplicates, banned claims, disclosure.
The agent never replies to, follows or messages anyone; it publishes, rarely, and says it is an agent."""
import hashlib
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import bus

CFG: dict = {}                 # {"mindful": {...}, "timezone": "UTC"}, set by main.setup()
STORE = bus.STORE
DISCLOSURE = "Written by SEXTANT, the Institute's agent."
BANNED = [r"guaranteed (returns?|profits?)", r"risk[- ]free", r"\b(buy|sell) (now|this)\b", r"you should (buy|sell|invest)"]


def _rules() -> dict:
    return CFG.get("mindful", {})


def _in_quiet(spec: str, now: datetime) -> bool:
    a, b = spec.split("-")
    s, e = (int(a[:2]) * 60 + int(a[3:5])), (int(b[:2]) * 60 + int(b[3:5]))
    t = now.hour * 60 + now.minute
    return s <= t < e if s < e else (t >= s or t < e)


def with_disclosure(channel: str, text: str) -> str:
    d = _rules().get("disclosure", DISCLOSURE)
    return text if channel == "x" or d in text else f"{text}\n\n{d}"       # on X the disclosure lives in the bio


def check(channel: str, text: str, now: datetime | None = None) -> dict:
    m, why = _rules(), []
    now = now or datetime.now(ZoneInfo(CFG.get("timezone", "UTC")))
    cap = m.get("per_day", {}).get(channel)
    if cap is not None and STORE.count(f"post:{channel}:{now:%Y%m%d}") >= cap:
        why.append(f"{channel} daily cap of {cap} reached")
    if m.get("quiet_hours") and _in_quiet(m["quiet_hours"], now):
        why.append(f"quiet hours {m['quiet_hours']}")
    if STORE.count(f"gap:{channel}") > 0:
        why.append(f"posted on {channel} within the last {m.get('min_gap_minutes', 90)} minutes")
    limit = m.get("max_chars", {}).get(channel)
    if limit and len(text) > limit:
        why.append(f"{len(text)} characters, limit {limit}")
    for pat in m.get("banned", BANNED):
        if re.search(pat, text, re.I):
            why.append(f"claim not allowed: {pat}")
    if STORE.count(f"dup:{channel}:{_h(text)}") > 0:
        why.append("already posted")
    return {"ok": not why, "reasons": why, "text": with_disclosure(channel, text)}


def _h(text: str) -> str:
    return hashlib.sha1(text.strip().lower().encode()).hexdigest()[:12]


def record(channel: str, text: str, now: datetime | None = None):
    now = now or datetime.now(ZoneInfo(CFG.get("timezone", "UTC")))
    STORE.hit(f"post:{channel}:{now:%Y%m%d}", 90000)
    STORE.hit(f"gap:{channel}", int(_rules().get("min_gap_minutes", 90)) * 60)
    STORE.hit(f"dup:{channel}:{_h(text)}", 30 * 86400)


def state(now: datetime | None = None) -> dict:
    """What the gate would say right now: quiet hours, and per channel how much of today's allowance is used."""
    m, now = _rules(), now or datetime.now(ZoneInfo(CFG.get("timezone", "UTC")))
    return {"quiet_hours": m.get("quiet_hours"), "quiet_now": bool(m.get("quiet_hours")) and _in_quiet(m["quiet_hours"], now), "min_gap_minutes": m.get("min_gap_minutes", 90),
            "disclosure": m.get("disclosure", DISCLOSURE),
            "channels": {c: {"used": STORE.count(f"post:{c}:{now:%Y%m%d}"), "cap": cap, "waiting_gap": STORE.count(f"gap:{c}") > 0} for c, cap in m.get("per_day", {}).items()}}
