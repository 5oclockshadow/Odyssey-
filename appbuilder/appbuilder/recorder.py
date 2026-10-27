"""Recorder — the live-view + playback substrate.

Every meaningful frame (a test run, a probe, a proposal, a state change) is
appended to a JSONL tape with a monotonic sequence number and timestamp. Live
viewers subscribe to an in-memory fan-out queue (for the live view); history and
the media-player scrubber read the tape back by sequence or time window
(playback). This mirrors how Codegen's bus persists session_events, so the same
media-player UI can play either tape.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

try:
    import asyncio
except Exception:  # pragma: no cover
    asyncio = None  # type: ignore


class Recorder:
    def __init__(self, tape_path: Path, keep_memory: int = 2000):
        self.tape_path = Path(tape_path)
        self.tape_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._seq = self._last_seq_on_disk()
        self._recent: list[dict] = []
        self._keep = keep_memory
        self._subs: set = set()  # asyncio.Queue fan-out for live view

    def _last_seq_on_disk(self) -> int:
        if not self.tape_path.exists():
            return 0
        last = 0
        try:
            with self.tape_path.open(encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        try:
                            last = max(last, int(json.loads(line).get("seq", last)))
                        except (ValueError, json.JSONDecodeError):
                            continue
        except OSError:
            pass
        return last

    # -- record --------------------------------------------------------------- #
    def record(self, kind: str, data: Any = None, **attrs) -> dict:
        with self._lock:
            self._seq += 1
            frame = {"seq": self._seq, "ts": round(time.time(), 3), "kind": kind,
                     "data": data if data is not None else {}, **attrs}
            try:
                with self.tape_path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(frame, ensure_ascii=False) + "\n")
            except OSError:
                pass
            self._recent.append(frame)
            if len(self._recent) > self._keep:
                self._recent = self._recent[-self._keep:]
        self._fanout(frame)
        return frame

    def _fanout(self, frame: dict):
        for q in list(self._subs):
            try:
                q.put_nowait(frame)
            except Exception:
                pass

    # -- live view ------------------------------------------------------------ #
    def subscribe(self):
        if asyncio is None:
            raise RuntimeError("asyncio unavailable")
        q: "asyncio.Queue" = asyncio.Queue(maxsize=2000)
        self._subs.add(q)
        return q

    def unsubscribe(self, q):
        self._subs.discard(q)

    # -- playback ------------------------------------------------------------- #
    def frames(self, since: int = 0, limit: int = 1000) -> list[dict]:
        """Frames with seq > since, oldest first (for the scrubber/playback)."""
        out = [f for f in self._recent if f["seq"] > since]
        if out:
            return out[:limit]
        # fall back to the tape when the window predates memory
        res: list[dict] = []
        if self.tape_path.exists():
            try:
                with self.tape_path.open(encoding="utf-8") as fh:
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            fr = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if fr.get("seq", 0) > since:
                            res.append(fr)
                            if len(res) >= limit:
                                break
            except OSError:
                pass
        return res

    def head(self) -> int:
        return self._seq
