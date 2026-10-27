import threading
import time

import pytest

from selfwire.workbench.events import EventBus
from selfwire.workbench.jobs import JobConflict, JobManager, JobNotFound


@pytest.fixture
def jobs():
    bus = EventBus()
    manager = JobManager(bus, workers=2)
    manager.bus = bus
    yield manager
    manager.shutdown()


def test_success_failure_and_events(jobs):
    ok = jobs.submit("demo", "adds", lambda ctx: {"sum": 2 + 2})
    bad = jobs.submit("demo", "raises", lambda ctx: 1 / 0)
    assert jobs.wait(ok.id).status == "succeeded" and jobs.get(ok.id).result == {"sum": 4}
    failed = jobs.wait(bad.id)
    assert failed.status == "failed" and "ZeroDivisionError" in failed.error
    statuses = [e.data["status"] for e in jobs.bus.history("job") if e.data["id"] == ok.id]
    assert statuses == ["queued", "running", "succeeded"]


def test_group_is_exclusive_until_the_job_finishes(jobs):
    gate = threading.Event()
    first = jobs.submit("improve", "holds the tree", lambda ctx: gate.wait(10), group="workspace")
    with pytest.raises(JobConflict, match="already running"):
        jobs.submit("tests", "would race", lambda ctx: None, group="workspace")
    assert jobs.group_busy("workspace") and jobs.kind_busy("improve")
    gate.set()
    jobs.wait(first.id)
    second = jobs.submit("tests", "now fine", lambda ctx: "ran", group="workspace")
    assert jobs.wait(second.id).result == "ran"


def test_cancel_signals_the_job(jobs):
    seen = threading.Event()

    def body(ctx):
        while not ctx.cancelled():
            time.sleep(0.02)
        seen.set()
        return "stopped"

    job = jobs.submit("demo", "loops", body)
    time.sleep(0.2)
    assert jobs.cancel(job.id) is True
    assert jobs.wait(job.id).status == "cancelled"
    assert seen.wait(3), "the cancel event must reach the running function"
    assert jobs.cancel(job.id) is False
    with pytest.raises(JobNotFound):
        jobs.cancel("missing")


def test_timeout_fails_the_job_and_sets_cancel(jobs):
    stopped = threading.Event()

    def body(ctx):
        ctx.cancel_event.wait(10)
        stopped.set()

    job = jobs.submit("demo", "too slow", body, timeout=0.3)
    result = jobs.wait(job.id, timeout=5)
    assert result.status == "failed" and "timeout" in result.error.lower()
    assert stopped.wait(3), "an abandoned attempt is told to stop"


def test_on_done_and_run_inline(jobs):
    done = []
    job = jobs.submit("demo", "x", lambda ctx: 7, on_done=done.append)
    jobs.wait(job.id)
    time.sleep(0.05)
    assert done and done[0].result == 7
    assert jobs.run_inline("tests", "inline", lambda ctx: ctx.job_id) == jobs.list(1)[0].id
    with pytest.raises(RuntimeError):
        jobs.run_inline("tests", "inline fail", lambda ctx: (_ for _ in ()).throw(RuntimeError("nope")))
    assert jobs.list(1)[0].status == "failed"


def test_history_is_bounded():
    manager = JobManager(EventBus(), workers=1, history=5)
    try:
        for i in range(12):
            manager.wait(manager.submit("demo", str(i), lambda ctx: None).id)
        assert len(manager.list(100)) == 5
    finally:
        manager.shutdown()
