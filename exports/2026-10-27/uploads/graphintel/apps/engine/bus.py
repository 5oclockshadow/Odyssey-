"""Shared small state: Redis when REDIS_URL is set (it runs inside the agent's docker), process memory otherwise.
Four operations: once (dedupe), hit (counters with expiry), count, and a pending-work mirror that survives restarts."""
import json
import logging
import os
import time

log = logging.getLogger("bus")


class Store:
    def __init__(self, url: str | None = None):
        self.url = os.environ.get("REDIS_URL") if url is None else url
        self.r, self.mem, self._next = None, {}, 0.0

    def _conn(self):
        """Connect lazily and retry every 30 s: Redis is started by the engine itself, after the engine is already running."""
        if self.r is None and self.url and time.time() >= self._next:
            self._next = time.time() + 30
            try:
                import redis
                r = redis.Redis.from_url(self.url, decode_responses=True, socket_connect_timeout=2, socket_timeout=3)
                r.ping()
                self.r = r
            except Exception as ex:
                log.debug("redis not reachable yet: %s", ex)
        return self.r

    def once(self, key: str, ttl: int) -> bool:
        """True the first time `key` is seen within ttl seconds."""
        if r := self._conn():
            return bool(r.set(f"ti:once:{key}", 1, nx=True, ex=int(ttl)))
        now = time.time()
        if self.mem.get(f"once:{key}", 0) > now:
            return False
        self.mem[f"once:{key}"] = now + ttl
        return True

    def hit(self, key: str, ttl: int) -> int:
        """Increment a counter that expires ttl seconds after its first hit; returns the new value."""
        if r := self._conn():
            k = f"ti:hit:{key}"
            n = r.incr(k)
            if n == 1:
                r.expire(k, int(ttl))
            return int(n)
        exp, n = self.mem.get(f"hit:{key}", (0, 0))
        now = time.time()
        if exp < now:
            exp, n = now + ttl, 0
        self.mem[f"hit:{key}"] = (exp, n + 1)
        return n + 1

    def count(self, key: str) -> int:
        if r := self._conn():
            return int(r.get(f"ti:hit:{key}") or 0)
        exp, n = self.mem.get(f"hit:{key}", (0, 0))
        return n if exp > time.time() else 0

    def pend(self, pid: str, item: dict):
        if r := self._conn():
            r.hset("ti:pending", pid, json.dumps(item))
        else:
            self.mem.setdefault("pending", {})[pid] = item

    def done(self, pid: str):
        if r := self._conn():
            r.hdel("ti:pending", pid)
        else:
            self.mem.get("pending", {}).pop(pid, None)

    def pending(self) -> dict:
        if r := self._conn():
            return {k: json.loads(v) for k, v in r.hgetall("ti:pending").items()}
        return dict(self.mem.get("pending", {}))


STORE = Store()
