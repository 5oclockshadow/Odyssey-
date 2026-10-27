"""telemetry.py — the dual-format JSON lifecycle log (pre_task/post_task),
and the Phoenix wiring being genuinely best-effort (opt-in, pre-probed,
never blocking when no collector is reachable)."""

import json
import time

from selfwire.telemetry import Telemetry


def test_phoenix_disabled_by_default_and_does_not_touch_the_network(tmp_path):
    start = time.time()
    t = Telemetry(log_dir=tmp_path)
    elapsed = time.time() - start
    assert t.phoenix_status["enabled"] is False
    assert "disabled by default" in t.phoenix_status["reason"]
    assert elapsed < 2.0  # must not hang


def test_phoenix_explicit_opt_in_but_unreachable_skips_fast(tmp_path):
    start = time.time()
    t = Telemetry(log_dir=tmp_path, enable_phoenix=True, phoenix_endpoint="127.0.0.1:1", probe_timeout=0.2)
    elapsed = time.time() - start
    assert t.phoenix_status["enabled"] is False
    assert "no collector reachable" in t.phoenix_status["reason"]
    assert elapsed < 2.0  # bounded by probe_timeout, not a real connection attempt


def test_pre_task_writes_iso8601_timestamped_json(telemetry):
    run_id = telemetry.new_run_id()
    path = telemetry.pre_task(run_id, "do a thing", strategic_choices={"plan": "x"})
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["run_id"] == run_id
    assert data["phase"] == "pre_task"
    assert data["timestamp"].endswith("Z")
    assert "T" in data["timestamp"]  # ISO 8601


def test_post_task_writes_result_and_state_transitions(telemetry):
    run_id = telemetry.new_run_id()
    telemetry.pre_task(run_id, "do a thing", strategic_choices={})
    path = telemetry.post_task(
        run_id, "do a thing", state_transitions=[{"i": 0}], analytical_weights={"q": 1}, result={"ok": True}
    )
    data = json.loads(path.read_text())
    assert data["phase"] == "post_task"
    assert data["result"] == {"ok": True}
    assert data["state_transitions"] == [{"i": 0}]


def test_read_run_returns_both_phases(telemetry):
    run_id = telemetry.new_run_id()
    telemetry.pre_task(run_id, "task", strategic_choices={})
    telemetry.post_task(run_id, "task", state_transitions=[], analytical_weights={}, result={})
    out = telemetry.read_run(run_id)
    assert set(out.keys()) == {"pre_task", "post_task"}


def test_read_run_missing_run_returns_empty(telemetry):
    assert telemetry.read_run("does-not-exist") == {}


def test_write_never_raises_even_if_the_write_itself_fails(tmp_path, monkeypatch):
    # error injection: force Path.write_text to blow up (permission bits
    # don't reliably block writes when tests run as root, as they do in this
    # sandbox, so patch the failure in directly instead).
    t = Telemetry(log_dir=tmp_path)
    from pathlib import Path

    def boom(self, *a, **kw):
        raise OSError("disk is on fire")

    monkeypatch.setattr(Path, "write_text", boom)
    path = t.pre_task("x", "task", strategic_choices={})
    assert isinstance(path, Path)  # returns a Path either way, never raises
    assert not path.exists()  # ...but the write really did fail
