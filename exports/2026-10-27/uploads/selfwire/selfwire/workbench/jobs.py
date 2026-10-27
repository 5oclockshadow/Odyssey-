"""
jobs.py — background jobs (test runs, improvement loops) on a long-lived
`osiiso.ThreadQueue` running in "infinite" mode: workers stay up for the
life of the server and pick up submissions as they arrive, with per-job
timeouts and cancellation handled by osiiso.

Jobs can share an exclusive `group`. The workbench puts every job that runs
the test suite or edits the tree ("tests", "improve") in group "workspace",
so a test run never observes a half-applied improvement and two improvement
loops never fight over the same files: a second submission gets
`JobConflict` (HTTP 409) instead of queueing silently behind the first.

`run_inline()` gives work that must run on the caller's thread (the chat
agent's `run_tests` tool) the same Job record, events, and exclusivity.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

import osiiso
from pydantic import BaseModel

from .events import EventBus

JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
ACTIVE = ("queued", "running")


class JobConflict(Exception):
    pass


class JobNotFound(LookupError):
    pass


class Job(BaseModel):
    id: str
    kind: str
    title: str
    status: JobStatus = "queued"
    group: Optional[str] = None
    created_at: float
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None


@dataclass
class JobContext:
    job_id: str
    cancel_event: threading.Event
    bus: EventBus

    def cancelled(self) -> bool:
        return self.cancel_event.is_set()


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    try:
        return json.loads(json.dumps(value, default=str))
    except (TypeError, ValueError):
        return repr(value)


class JobManager:
    def __init__(self, bus: EventBus, *, workers: int = 2, history: int = 200) -> None:
        self._bus = bus
        self._lock = threading.RLock()
        self._jobs: "OrderedDict[str, Job]" = OrderedDict()
        self._handles: dict[str, Any] = {}
        self._cancels: dict[str, threading.Event] = {}
        self._history = history
        self._queue = osiiso.ThreadQueue(workers=workers, mode="infinite")
        self._queue.start()
        self._closed = False

    # -- bookkeeping ------------------------------------------------------------
    def _publish(self, job: Job) -> None:
        self._bus.publish("job", job.model_dump(mode="json"))

    def _reserve(self, kind: str, title: str, group: Optional[str]) -> Job:
        with self._lock:
            if self._closed:
                raise JobConflict("job manager is shut down")
            if group is not None:
                for other in self._jobs.values():
                    if other.group == group and other.status in ACTIVE:
                        raise JobConflict(f"a {other.kind} job ({other.id}) is already running: {other.title}")
            job = Job(id=uuid.uuid4().hex[:12], kind=kind, title=title, group=group, created_at=time.time())
            self._jobs[job.id] = job
            self._cancels[job.id] = threading.Event()
            self._trim()
        self._publish(job)
        return job

    def _trim(self) -> None:
        while len(self._jobs) > self._history:
            oldest_done = next((jid for jid, j in self._jobs.items() if j.status not in ACTIVE), None)
            if oldest_done is None:
                return
            self._jobs.pop(oldest_done)
            self._handles.pop(oldest_done, None)
            self._cancels.pop(oldest_done, None)

    def _mark_running(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "running"
            job.started_at = time.time()
            snapshot = job.model_copy()
        self._publish(snapshot)

    def _complete(self, job_id: str, status: JobStatus, *, value: Any = None, error: Optional[str] = None,
                  on_done: Optional[Callable[[Job], Any]] = None) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status not in ACTIVE:
                return job.model_copy() if job else Job(id=job_id, kind="?", title="?", created_at=0.0)
            cancel = self._cancels.get(job_id)
            if status == "succeeded" and cancel is not None and cancel.is_set():
                status = "cancelled"
            if status != "succeeded" and cancel is not None:
                cancel.set()  # a timed-out or failed job's abandoned thread should stop at its next check
            job.status = status
            job.finished_at = time.time()
            job.result = _jsonable(value) if value is not None else None
            job.error = error
            snapshot = job.model_copy()
        self._publish(snapshot)
        if on_done is not None:
            try:
                on_done(snapshot)
            except Exception:
                pass  # completion hooks are notifications; they never change the job's outcome
        return snapshot

    # -- submission ---------------------------------------------------------------
    def submit(
        self,
        kind: str,
        title: str,
        fn: Callable[[JobContext], Any],
        *,
        group: Optional[str] = None,
        timeout: Optional[float] = None,
        on_done: Optional[Callable[[Job], Any]] = None,
    ) -> Job:
        job = self._reserve(kind, title, group)
        ctx = JobContext(job_id=job.id, cancel_event=self._cancels[job.id], bus=self._bus)

        def body() -> Any:
            self._mark_running(job.id)
            return fn(ctx)

        def finished(handle: Any) -> None:
            result = handle.result()
            if result.status == "succeeded":
                self._complete(job.id, "succeeded", value=result.value, on_done=on_done)
            elif result.status == "cancelled":
                self._complete(job.id, "cancelled", error="cancelled", on_done=on_done)
            else:
                exc = result.exception
                message = f"{type(exc).__name__}: {exc}" if exc is not None else (result.message or "failed")
                self._complete(job.id, "failed", error=message, on_done=on_done)

        handle = self._queue.submit(body, timeout=timeout, name=f"{kind}:{job.id}")
        with self._lock:
            self._handles[job.id] = handle
        handle.add_done_callback(finished)
        return job.model_copy()

    def run_inline(self, kind: str, title: str, fn: Callable[[JobContext], Any], *, group: Optional[str] = None) -> Any:
        job = self._reserve(kind, title, group)
        ctx = JobContext(job_id=job.id, cancel_event=self._cancels[job.id], bus=self._bus)
        self._mark_running(job.id)
        try:
            value = fn(ctx)
        except BaseException as e:
            self._complete(job.id, "failed", error=f"{type(e).__name__}: {e}")
            raise
        self._complete(job.id, "succeeded", value=value)
        return value

    # -- control / query -------------------------------------------------------------
    def cancel(self, job_id: str) -> bool:
        with self._lock:
            if job_id not in self._jobs:
                raise JobNotFound(job_id)
            job = self._jobs[job_id]
            if job.status not in ACTIVE:
                return False
            self._cancels[job_id].set()
            handle = self._handles.get(job_id)
        if handle is not None:
            handle.cancel()
        return True

    def get(self, job_id: str) -> Job:
        with self._lock:
            if job_id not in self._jobs:
                raise JobNotFound(job_id)
            return self._jobs[job_id].model_copy()

    def list(self, limit: int = 50) -> list[Job]:
        with self._lock:
            jobs = [j.model_copy() for j in self._jobs.values()]
        return list(reversed(jobs))[: max(1, limit)]

    def kind_busy(self, kind: str) -> bool:
        with self._lock:
            return any(j.kind == kind and j.status in ACTIVE for j in self._jobs.values())

    def group_busy(self, group: str) -> bool:
        with self._lock:
            return any(j.group == group and j.status in ACTIVE for j in self._jobs.values())

    def wait(self, job_id: str, timeout: float = 60.0) -> Job:
        deadline = time.time() + timeout
        while time.time() < deadline:
            job = self.get(job_id)
            if job.status not in ACTIVE:
                return job
            time.sleep(0.05)
        raise TimeoutError(f"job {job_id} still {self.get(job_id).status} after {timeout}s")

    def shutdown(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            for event in self._cancels.values():
                event.set()
        self._queue.shutdown(force=True)
