"""Owner login and tester seats. One owner, one password, a signed session cookie; ten tester seats signed the same way. No database, no third party."""
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, Request

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
CFG: dict = {}
COOKIE = "threshold_owner"
_attempts: dict[str, list[float]] = {}
_buckets: dict[str, list[float]] = {}


def ratelimit(key: str, limit: int, window: int):
    """Public doors (/round, /event) are open to anyone; this keeps one address from flooding the queue."""
    now = time.time()
    hits = [t for t in _buckets.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(429, "slow down")
    _buckets[key] = hits + [now]


def secret() -> bytes:
    s = os.environ.get("SESSION_SECRET")
    if s:
        return s.encode()
    p = STATE / "session.secret"
    if not p.exists():
        STATE.mkdir(exist_ok=True)
        p.write_text(secrets.token_hex(32))
    return p.read_text().strip().encode()


def password_ok(pw: str) -> bool:
    h, p = os.environ.get("OWNER_PASSWORD_HASH"), os.environ.get("OWNER_PASSWORD")
    if h and h.startswith("scrypt$"):
        try:
            _, salt, want = h.strip().split("$")
            got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32).hex()
            return hmac.compare_digest(got, want)
        except (ValueError, TypeError):
            return False
    if h:                                         # legacy unsalted sha256: still accepted, replace it with hash_password()
        return hmac.compare_digest(hashlib.sha256(pw.encode()).hexdigest(), h.strip().lower())
    if p:
        return hmac.compare_digest(pw, p)
    return False


def hash_password(pw: str) -> str:
    """Value for OWNER_PASSWORD_HASH: python -c 'import auth,sys; print(auth.hash_password(sys.argv[1]))' <password>"""
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32).hex()}"


_NEVER_LOGGED = {"password", "token", "secret", "authorization", "cookie", "key"}


def audit(event: str, outcome: str, actor: str = "owner", ip: str = "", **detail):
    """Security-relevant events (login, failed login, logout, publish, approvals, retention) as JSON lines in state/security.jsonl.
    Time, actor, outcome, address. Anything that looks like a credential is dropped; visitor text is never written here."""
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "event": event, "outcome": outcome, "actor": actor, "ip": ip,
           **{k: str(v)[:200] for k, v in detail.items() if k.lower() not in _NEVER_LOGGED}}
    try:
        STATE.mkdir(exist_ok=True)
        with (STATE / "security.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
    except OSError as e:
        logging.getLogger("auth").error("security log not written: %s", e)


def purge(path: Path, days: float) -> int:
    """Retention: drop JSON-lines rows older than `days` (ts is epoch seconds or ISO 8601). Rows without a readable ts are kept. Returns rows dropped."""
    if not path.exists():
        return 0
    cut, keep, dropped = time.time() - days * 86400, [], 0
    for ln in path.read_text().splitlines():
        try:
            t = json.loads(ln).get("ts")
            t = float(t) if isinstance(t, (int, float)) else datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError, AttributeError):
            keep.append(ln)
            continue
        if t < cut:
            dropped += 1
        else:
            keep.append(ln)
    tmp = path.with_suffix(".tmp")
    tmp.write_text("".join(x + "\n" for x in keep))
    tmp.replace(path)
    return dropped


def max_age() -> int:
    return int(3600 * float(CFG.get("session_hours", 12)))


def issue(hours: float | None = None, who: str = "owner") -> str:
    exp = int(time.time() + (3600 * hours if hours is not None else max_age()))
    body = f"{who}.{exp}"
    return f"{body}.{hmac.new(secret(), body.encode(), 'sha256').hexdigest()}"


def verify(token: str | None) -> bool:
    if not token or token.count(".") != 2:
        return False
    who, exp, sig = token.split(".")
    good = hmac.compare_digest(hmac.new(secret(), f"{who}.{exp}".encode(), "sha256").hexdigest(), sig)
    return good and who == "owner" and exp.isdigit() and int(exp) > time.time()


def throttle(ip: str, limit: int = 5, window: int = 600):
    now = time.time()
    hits = [t for t in _attempts.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(429, "too many attempts; wait ten minutes")
    _attempts[ip] = hits + [now]


def token_of(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    return request.cookies.get(COOKIE) or (auth[7:] if auth.lower().startswith("bearer ") else None)


def owner(request: Request):
    """FastAPI dependency: the request carries a valid owner session, or 401."""
    if not verify(token_of(request)):
        raise HTTPException(401, "owner login required")
    return True


def builder(request: Request) -> str:
    """FastAPI dependency for TESTER's build loop: the owner, or a build token (build.<exp>.<sig>, signed with SESSION_SECRET, at most fifteen
    minutes long). TESTER signs a fresh one per message, so it never holds an owner session; the token opens POST /builder/say and nothing else."""
    t = token_of(request)
    if verify(t):
        return "owner"
    if t and t.count(".") == 2:
        w, exp, sig = t.split(".")
        good = hmac.compare_digest(hmac.new(secret(), f"{w}.{exp}".encode(), "sha256").hexdigest(), sig)
        if good and w == "build" and exp.isdigit() and time.time() < int(exp) <= time.time() + 900:
            return "build"
    raise HTTPException(401, "owner session or build token required")


def seat(user: str) -> str:
    return re.sub(r"[^a-z0-9_-]", "", (user or "").strip().lower())[:40]


def testers() -> dict[str, str]:
    """Tester seats, seat -> code: TESTER_CODES="tester01:basalt-7492,tester02:ember-5155" or state/testers.json. Removing a seat ends its sessions."""
    seats: dict[str, str] = {}
    for pair in os.environ.get("TESTER_CODES", "").split(","):
        if ":" in pair:
            u, c = pair.split(":", 1)
            seats[u] = c
    p = STATE / "testers.json"
    if not seats and p.exists():
        try:
            seats = {str(k): str(v) for k, v in json.loads(p.read_text()).items()}
        except (ValueError, OSError, AttributeError):
            seats = {}
    return {seat(u): c.strip() for u, c in seats.items() if seat(u) and c.strip()}


def tester_ok(user: str, code: str) -> bool:
    want = testers().get(seat(user))
    return bool(want) and hmac.compare_digest((code or "").strip().lower().encode(), want.lower().encode())


def who(token: str | None) -> str | None:
    """'owner', 'tester-<seat>' for a seat that still exists, or None."""
    if not token or token.count(".") != 2:
        return None
    w, exp, sig = token.split(".")
    if not (hmac.compare_digest(hmac.new(secret(), f"{w}.{exp}".encode(), "sha256").hexdigest(), sig) and exp.isdigit() and int(exp) > time.time()):
        return None
    return w if w == "owner" or (w.startswith("tester-") and w[7:] in testers()) else None


def tester(request: Request) -> str:
    """FastAPI dependency: a live tester seat or the owner, or 401. Returns who."""
    w = who(token_of(request))
    if not w:
        raise HTTPException(401, "tester sign-in required")
    return w
