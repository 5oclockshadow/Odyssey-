"""Auto/pause/halt control — the same pause-only semantics Codegen's autonomy
uses, packaged so the Tester (a separate process) is self-contained.

- Full-auto is turned on from the environment (``<PREFIX>_AUTO_ENABLED``).
- Pause-only: `pause()`/`resume()` are reversible; failure backoff auto-resumes;
  there is no silent permanent stop.
- Hard-stop escape hatch: `halt()` / the ``<PREFIX>_AUTO_KILL`` env kill-switch
  are the only ways the loop truly stops.
"""
from __future__ import annotations

import os
import time


def _truthy(name: str) -> bool:
    return str(os.getenv(name, "")).strip().lower() in ("1", "true", "yes", "on")


class AutoControl:
    def __init__(self, prefix: str = "TENDER"):
        self.prefix = prefix
        self.paused = False
        self.pause_reason = ""
        self.pause_until = 0.0
        self._halted = False

    # -- env-driven defaults -------------------------------------------------- #
    def env_auto(self) -> bool:
        return _truthy(f"{self.prefix}_AUTO_ENABLED")

    def halted(self) -> bool:
        return self._halted or _truthy(f"{self.prefix}_AUTO_KILL")

    # -- transitions ---------------------------------------------------------- #
    def pause(self, reason: str = "manual"):
        self.paused, self.pause_reason = True, reason

    def resume(self):
        self.paused, self.pause_until = False, 0.0

    def backoff(self, seconds: float):
        """Timed pause that auto-resumes — used after consecutive failures."""
        self.pause_until = time.time() + seconds

    def halt(self):
        self._halted = True

    def clear_halt(self):
        self._halted = False

    # -- gate ----------------------------------------------------------------- #
    def blocked(self) -> str | None:
        """Why the loop may not run right now (None = good to go)."""
        if self.halted():
            return "halted (kill-switch)"
        if not self.env_auto() and not getattr(self, "_manual_on", False):
            return "disabled"
        if self.paused:
            return f"paused ({self.pause_reason or 'manual'})"
        now = time.time()
        if self.pause_until > now:
            return f"paused (backoff {int(self.pause_until - now)}s)"
        return None

    def enable(self):
        """Turn auto on without the env var (manual toggle)."""
        self._manual_on = True

    def disable(self):
        self._manual_on = False

    def status(self) -> dict:
        now = time.time()
        return {
            "auto": self.env_auto() or getattr(self, "_manual_on", False),
            "env_auto": self.env_auto(),
            "paused": self.paused,
            "pause_reason": self.pause_reason,
            "pause_remaining_s": max(0, int(self.pause_until - now)),
            "halted": self.halted(),
            "blocked": self.blocked(),
        }
