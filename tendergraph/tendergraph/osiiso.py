"""osiiso — the execution router: dispatch work by its EXECUTION NATURE, not its
reasoning style, across ASYNC / THREAD / PROCESS lanes, with temporal multi-lane
non-blocking scheduling.

Per the Skilld architecture: osiiso routes a unit of work to
  * ASYNC   — native coroutines / IO you can await (network, LLM calls)
  * THREAD  — blocking IO that isn't async-friendly (subprocess, sync HTTP, disk)
  * PROCESS — CPU-bound work that must escape the GIL (parsing, scoring, graph algos)
so the event loop is NEVER blocked. Named lanes bound concurrency per class of
work and carry a temporal schedule (run-at / interval) so deadlines (e.g. a
tender closing) drive execution.
"""
from __future__ import annotations

import asyncio
import logging
import multiprocessing
import os
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable

log = logging.getLogger("tendergraph.osiiso")


class Lane(str, Enum):
    ASYNC = "async"
    THREAD = "thread"
    PROCESS = "process"


@dataclass
class LaneStats:
    submitted: int = 0
    done: int = 0
    failed: int = 0
    inflight: int = 0


LANES = int(os.environ.get("OSIISO_LANES", "25"))          # parallel lanes per class of work
MIN_LANES = int(os.environ.get("OSIISO_MIN_LANES", "15"))  # a thought's fan-out never drops below this


class Osiiso:
    """Route-and-run executor. One per process; `aclose()` on shutdown.

    25 lanes by default (OSIISO_LANES): 25 thread workers and 25 concurrent async calls. A fan-out (`map`)
    takes every free lane up to 25, and never fewer than OSIISO_MIN_LANES (15) even when others are busy.
    """

    def __init__(self, thread_workers: int = LANES, process_workers: int | None = None,
                 async_concurrency: int = LANES):
        self.lanes = max(1, thread_workers)
        self.min_lanes = max(1, min(MIN_LANES, self.lanes))
        self._threads = ThreadPoolExecutor(max_workers=self.lanes)
        self._procs: ProcessPoolExecutor | None = None
        self._process_workers = process_workers
        self._sema = asyncio.Semaphore(async_concurrency)
        self.stats: dict[Lane, LaneStats] = {ln: LaneStats() for ln in Lane}

    def _proc_pool(self) -> ProcessPoolExecutor:
        # Lazily created: forking a pool is expensive and not always needed.
        if self._procs is None:
            # 'spawn' avoids fork-in-a-multi-threaded-process deadlocks.
            self._procs = ProcessPoolExecutor(
                max_workers=self._process_workers,
                mp_context=multiprocessing.get_context("spawn"))
        return self._procs

    @staticmethod
    def classify(fn: Callable, nature: str | None = None) -> Lane:
        """Pick a lane. Explicit `nature` wins; else coroutine fns -> ASYNC,
        anything tagged cpu-bound -> PROCESS, otherwise THREAD (safe default for
        unknown blocking work)."""
        if nature:
            return Lane(nature)
        if asyncio.iscoroutinefunction(fn):
            return Lane.ASYNC
        if getattr(fn, "_osiiso_lane", None):
            return Lane(fn._osiiso_lane)  # type: ignore[attr-defined]
        return Lane.THREAD

    async def run(self, fn: Callable, *args, nature: str | None = None, **kwargs) -> Any:
        """Execute `fn` on the right lane and await the result. Never blocks the loop."""
        lane = self.classify(fn, nature)
        st = self.stats[lane]
        st.submitted += 1
        st.inflight += 1
        loop = asyncio.get_running_loop()
        try:
            if lane is Lane.ASYNC:
                async with self._sema:
                    result: Any = await fn(*args, **kwargs)
            elif lane is Lane.PROCESS:
                result = await loop.run_in_executor(self._proc_pool(), _call, fn, args, kwargs)
            else:  # THREAD
                result = await loop.run_in_executor(self._threads, _call, fn, args, kwargs)
            st.done += 1
            return result
        except Exception:
            st.failed += 1
            raise
        finally:
            st.inflight -= 1

    async def map(self, fn: Callable, items: list, *, nature: str | None = None,
                  limit: int = 0) -> list:
        """Run `fn` over items concurrently on its lane. Without `limit`: all free lanes, at least min_lanes."""
        if not limit:
            busy = sum(st.inflight for st in self.stats.values())
            limit = max(self.min_lanes, self.lanes - busy)
        sem = asyncio.Semaphore(limit)

        async def one(it):
            if sem:
                async with sem:
                    return await self.run(fn, it, nature=nature)
            return await self.run(fn, it, nature=nature)

        return await asyncio.gather(*(one(it) for it in items), return_exceptions=True)

    def snapshot(self) -> dict:
        return {"lanes": self.lanes, "min_lanes": self.min_lanes, **{ln.value: vars(st) for ln, st in self.stats.items()}}

    async def aclose(self):
        self._threads.shutdown(wait=False, cancel_futures=True)
        if self._procs is not None:
            self._procs.shutdown(wait=False, cancel_futures=True)


def _call(fn: Callable, args: tuple, kwargs: dict) -> Any:
    return fn(*args, **kwargs)


def cpu_bound(fn: Callable) -> Callable:
    """Tag a function so osiiso routes it to the PROCESS lane."""
    fn._osiiso_lane = Lane.PROCESS.value  # type: ignore[attr-defined]
    return fn


# --------------------------------------------------------------------------- #
# Temporal multi-lane scheduler — deadlines drive execution (tenders close).
# --------------------------------------------------------------------------- #
@dataclass
class Task:
    name: str
    fn: Callable
    interval_s: float = 0.0        # 0 = one-shot
    run_at: float = 0.0            # epoch; 0 = asap
    nature: str | None = None
    _next: float = 0.0
    paused: bool = False


@dataclass
class Scheduler:
    """Non-blocking loop that runs due tasks through osiiso. Pause-only."""
    osiiso: Osiiso
    tasks: list[Task] = field(default_factory=list)
    tick_s: float = 1.0
    _stop: bool = False

    def add(self, name: str, fn: Callable, *, interval_s: float = 0.0,
            run_at: float = 0.0, nature: str | None = None) -> Task:
        t = Task(name=name, fn=fn, interval_s=interval_s, run_at=run_at, nature=nature,
                 _next=run_at or time.time())
        self.tasks.append(t)
        return t

    async def run_forever(self):
        while not self._stop:
            now = time.time()
            for t in list(self.tasks):
                if t.paused or now < t._next:
                    continue
                try:
                    await self.osiiso.run(t.fn, nature=t.nature)
                except Exception as exc:  # a task never kills the scheduler
                    log.warning("scheduler task %s failed: %s", t.name, exc)
                if t.interval_s:
                    t._next = now + t.interval_s
                else:
                    self.tasks.remove(t)
            await asyncio.sleep(self.tick_s)

    def stop(self):
        self._stop = True
