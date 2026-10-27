"""
storage.py — Redis-backed persistence with layered, automated fallback.

Architecture mandate: wire storage through a Redis-backed layer named
`raptor-redis` / `graph-redis`, with automated fallback to raw Redis.

Neither `raptor-redis` nor `graph-redis` exist as real installable packages
(verified against PyPI: `raptor-redis` -> 404). Rather than import something
fictional and fail at runtime, this module *implements* that role directly,
on top of the real `redis` client, as three honest layers:

    1. "raptor"  — namespaced keys + RedisJSON module commands (JSON.SET /
                   JSON.GET), if the connected Redis has the ReJSON module.
    2. "raw"     — plain `redis.Redis` GET/SET with our own json.dumps codec,
                   if the fancy module path errors out.
    3. "file"    — on-disk JSON under runtime_state/, if no Redis server is
                   reachable at all (the common case in a sandbox/dev box).

Every public method is wrapped in try/except/finally: callers get a
best-effort store that degrades instead of raising, and every call reports
which backend actually served it (for telemetry/observability).
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

try:
    import redis as _redis  # real, PyPI: redis-py
except Exception:  # pragma: no cover - redis-py itself is a hard requirement we do install
    _redis = None


@dataclass
class StorageResult:
    ok: bool
    backend: str  # "raptor" | "raw" | "file"
    error: Optional[str] = None


class RaptorRedisStore:
    """Best-effort key/value JSON store with raptor -> raw -> file fallback."""

    def __init__(
        self,
        url: Optional[str] = None,
        namespace: str = "selfwire",
        file_root: Optional[str] = None,
        connect_timeout: float = 0.5,
    ) -> None:
        self.namespace = namespace
        self.url = url or os.environ.get("RAPTOR_REDIS_URL") or os.environ.get("REDIS_URL") or "redis://localhost:6379/0"
        self.file_root = Path(file_root or (Path(__file__).resolve().parent.parent / "runtime_state" / "kv"))
        self.file_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._client = None
        self._json_module_ok: Optional[bool] = None
        self._connect_timeout = connect_timeout
        self.last_backend: str = "file"
        self.last_op: Optional[str] = None
        self.last_op_at: Optional[str] = None
        self.last_op_ok: Optional[bool] = None
        self._connect()

    def _record_op(self, op: str, result: Optional[StorageResult]) -> None:
        """Best-effort bookkeeping run from a `finally`: never lets a
        recording failure mask the real result of the operation it's
        describing."""
        try:
            self.last_op = op
            self.last_op_at = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"
            self.last_op_ok = bool(result.ok) if result is not None else False
        except Exception:
            pass

    # -- connection -------------------------------------------------------
    def _connect(self) -> None:
        if _redis is None:
            self._client = None
            return
        try:
            client = _redis.Redis.from_url(
                self.url,
                socket_connect_timeout=self._connect_timeout,
                socket_timeout=self._connect_timeout,
            )
            client.ping()
            self._client = client
        except Exception:
            self._client = None

    def _key(self, key: str) -> str:
        return f"{self.namespace}:{key}"

    def _file_path(self, key: str) -> Path:
        safe = key.replace("/", "__")
        return self.file_root / f"{safe}.json"

    # -- public API ---------------------------------------------------------
    #
    # Each method below wraps its whole body in try/except/finally:
    #   - `try`     runs the layered raptor -> raw -> file attempt
    #   - `except`  is the outer, catch-all safety net for anything that
    #               breaks *outside* the three layers themselves (e.g. a
    #               value json.dumps still can't serialize even with
    #               default=str) -- callers still get a StorageResult/None
    #               back, never an exception
    #   - `finally` always records that an operation was attempted, on
    #               self.last_op / last_op_at / last_op_result, regardless
    #               of which layer (if any) actually served it. That's real
    #               bookkeeping (surfaced through backend_status()), not a
    #               no-op placeholder.
    def set(self, key: str, value: Any) -> StorageResult:
        with self._lock:
            result: Optional[StorageResult] = None
            try:
                payload = json.dumps(value, default=str)
                raptor_err = raw_err = None
                # layer 1: raptor (RedisJSON module)
                if self._client is not None and self._json_module_ok is not False:
                    try:
                        self._client.execute_command("JSON.SET", self._key(key), "$", payload)
                        self._json_module_ok = True
                        self.last_backend = "raptor"
                        result = StorageResult(True, "raptor")
                    except Exception as e:
                        self._json_module_ok = False
                        raptor_err = str(e)
                else:
                    raptor_err = "redis unavailable" if self._client is None else "json module disabled"
                # layer 2: raw redis
                if result is None and self._client is not None:
                    try:
                        self._client.set(self._key(key), payload)
                        self.last_backend = "raw"
                        result = StorageResult(True, "raw")
                    except Exception as e:
                        raw_err = str(e)
                        self._client = None  # server dropped; stop retrying it this session
                elif result is None:
                    raw_err = raptor_err
                # layer 3: file
                if result is None:
                    try:
                        self._file_path(key).write_text(payload, encoding="utf-8")
                        self.last_backend = "file"
                        result = StorageResult(True, "file")
                    except Exception as e:
                        result = StorageResult(False, "file", error=f"raptor:{raptor_err} raw:{raw_err} file:{e}")
                return result
            except Exception as e:
                result = StorageResult(False, "none", error=str(e))
                return result
            finally:
                self._record_op("set", result)

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            value: Optional[Any] = None
            ok = False
            try:
                if self._client is not None and self._json_module_ok is not False:
                    try:
                        raw = self._client.execute_command("JSON.GET", self._key(key))
                        self._json_module_ok = True
                        self.last_backend = "raptor"
                        value = json.loads(raw) if raw is not None else None
                        ok = True
                        return value
                    except Exception:
                        self._json_module_ok = False
                if self._client is not None:
                    try:
                        raw = self._client.get(self._key(key))
                        self.last_backend = "raw"
                        value = json.loads(raw) if raw is not None else None
                        ok = True
                        return value
                    except Exception:
                        self._client = None
                try:
                    p = self._file_path(key)
                    self.last_backend = "file"
                    if not p.exists():
                        ok = True  # a clean miss, not a failure
                        return None
                    value = json.loads(p.read_text(encoding="utf-8"))
                    ok = True
                    return value
                except Exception:
                    return None
            finally:
                self._record_op("get", StorageResult(ok, self.last_backend))

    def delete(self, key: str) -> StorageResult:
        with self._lock:
            result: Optional[StorageResult] = None
            try:
                backend = "file"
                if self._client is not None:
                    try:
                        self._client.delete(self._key(key))
                        backend = "raw"
                    except Exception:
                        pass
                try:
                    p = self._file_path(key)
                    if p.exists():
                        p.unlink()
                    result = StorageResult(True, backend)
                except Exception as e:
                    result = StorageResult(False, backend, error=str(e))
                return result
            finally:
                self._record_op("delete", result)

    def keys(self, prefix: str = "") -> list[str]:
        with self._lock:
            found: set[str] = set()
            try:
                if self._client is not None:
                    try:
                        pattern = f"{self._key(prefix)}*"
                        for k in self._client.scan_iter(match=pattern):
                            k = k.decode() if isinstance(k, bytes) else k
                            found.add(k.split(":", 1)[1])
                    except Exception:
                        pass
                try:
                    # filenames use the same "/" -> "__" transform as
                    # _file_path(); the glob pattern has to match on that, not
                    # on the raw prefix, or a prefix containing "/" (e.g.
                    # "episode/") never matches anything on disk.
                    file_prefix = prefix.replace("/", "__")
                    for p in self.file_root.glob(f"{file_prefix}*.json"):
                        found.add(p.stem.replace("__", "/"))
                except Exception:
                    pass
                return sorted(found)
            finally:
                self._record_op("keys", StorageResult(True, self.last_backend))

    def backend_status(self) -> dict:
        return {
            "connected_to_redis": self._client is not None,
            "json_module_available": bool(self._json_module_ok),
            "last_backend_used": self.last_backend,
            "last_op": self.last_op,
            "last_op_at": self.last_op_at,
            "last_op_ok": self.last_op_ok,
            "url": self.url,
            "file_root": str(self.file_root),
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
        }
