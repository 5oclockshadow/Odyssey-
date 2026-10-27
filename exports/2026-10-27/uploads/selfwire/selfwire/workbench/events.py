"""
events.py — a thread-safe publish/subscribe bus that bridges worker threads
(test runs, improvement loops, file edits) to asyncio consumers (the SSE
endpoint) without either side blocking the other.

Publishers call `publish()` from any thread. Each async subscriber owns an
`asyncio.Queue` on its own event loop; delivery goes through
`loop.call_soon_threadsafe`, which is the one safe way to hand data to a loop
from a foreign thread. A slow subscriber never blocks a publisher: when its
queue is full, the event is dropped *for that subscriber only* and counted.
"""

from __future__ import annotations

import asyncio
import itertools
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Optional


@dataclass(frozen=True)
class Event:
    id: int
    type: str
    data: Any
    ts: float


class Subscription:
    def __init__(self, bus: "EventBus", loop: asyncio.AbstractEventLoop, maxsize: int) -> None:
        self._bus = bus
        self._loop = loop
        self.queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=maxsize)
        self.dropped = 0

    def _offer(self, event: Event) -> None:
        # runs on the subscriber's own loop thread
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            self.dropped += 1

    async def get(self, timeout: Optional[float] = None) -> Optional[Event]:
        try:
            return await asyncio.wait_for(self.queue.get(), timeout)
        except asyncio.TimeoutError:
            return None

    def close(self) -> None:
        self._bus._remove(self)

    async def __aenter__(self) -> "Subscription":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        self.close()


class EventBus:
    def __init__(self, history: int = 500, subscriber_queue: int = 2000) -> None:
        self._lock = threading.Lock()
        self._subs: list[Subscription] = []
        self._listeners: list[Callable[[Event], Any]] = []
        self._history: deque[Event] = deque(maxlen=history)
        self._ids = itertools.count(1)
        self._subscriber_queue = subscriber_queue

    def publish(self, type: str, data: Any) -> Event:
        with self._lock:
            event = Event(id=next(self._ids), type=type, data=data, ts=time.time())
            self._history.append(event)
            subs = list(self._subs)
            listeners = list(self._listeners)
        for sub in subs:
            try:
                sub._loop.call_soon_threadsafe(sub._offer, event)
            except RuntimeError:
                # the subscriber's loop is closed; it can never read again
                self._remove(sub)
        for fn in listeners:
            try:
                fn(event)
            except Exception:
                # a broken listener must never break the publisher
                # (a test run or an improvement loop)
                continue
        return event

    def subscribe(self) -> Subscription:
        """Must be called from inside a running event loop."""
        loop = asyncio.get_running_loop()
        sub = Subscription(self, loop, self._subscriber_queue)
        with self._lock:
            self._subs.append(sub)
        return sub

    def _remove(self, sub: Subscription) -> None:
        with self._lock:
            if sub in self._subs:
                self._subs.remove(sub)

    def add_listener(self, fn: Callable[[Event], Any]) -> None:
        with self._lock:
            self._listeners.append(fn)

    def remove_listener(self, fn: Callable[[Event], Any]) -> None:
        with self._lock:
            if fn in self._listeners:
                self._listeners.remove(fn)

    def history(self, type: Optional[str] = None) -> list[Event]:
        with self._lock:
            events = list(self._history)
        return [e for e in events if type is None or e.type == type]

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)
