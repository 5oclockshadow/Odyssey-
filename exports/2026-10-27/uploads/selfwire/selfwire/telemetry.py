"""
telemetry.py — DSPy -> Arize Phoenix tracing, plus the plain-JSON inference
lifecycle log the architecture mandate calls for (pre-task planning snapshot,
post-task validation snapshot, both ISO 8601 timestamped).

Phoenix wiring is entirely best-effort: if `arize-phoenix-otel` /
`openinference-instrumentation-dspy` aren't importable, or there's no
Phoenix collector reachable at the configured endpoint, `register()` swallows
the failure and the rest of the system runs exactly the same, just without
traces leaving the process. The JSON lifecycle log has no such dependency —
it's always written locally, so telemetry is never load-bearing for the
agent actually working.
"""

from __future__ import annotations

import json
import os
import socket
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


@dataclass
class LifecycleRecord:
    run_id: str
    phase: str  # "pre_task" | "post_task"
    timestamp: str
    task: str
    strategic_choices: dict = field(default_factory=dict)
    state_transitions: list = field(default_factory=list)
    analytical_weights: dict = field(default_factory=dict)
    result: Optional[dict] = None


class Telemetry:
    def __init__(
        self,
        log_dir: Optional[str] = None,
        phoenix_endpoint: Optional[str] = None,
        enable_phoenix: Optional[bool] = None,
        probe_timeout: float = 0.35,
    ) -> None:
        self.log_dir = Path(log_dir or (Path(__file__).resolve().parent.parent / "reports" / "telemetry"))
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.phoenix_endpoint = phoenix_endpoint or os.environ.get("PHOENIX_COLLECTOR_ENDPOINT")
        # Phoenix is opt-in and probed before we ever touch its SDK. Reason:
        # `phoenix.otel.register()` installs a SimpleSpanProcessor by default,
        # which exports *synchronously* and retries with backoff on every
        # span if the collector isn't reachable — that blocked a plain agent
        # run for ~90s in testing with no collector running. "Best-effort
        # telemetry" has to mean it can't do that, so: no explicit opt-in (env
        # var or constructor flag) or no endpoint configured -> we never call
        # into the phoenix SDK at all; explicit opt-in but the endpoint isn't
        # reachable on a fast local probe -> same, skipped, no SDK call.
        if enable_phoenix is None:
            enable_phoenix = os.environ.get("SELFWIRE_ENABLE_PHOENIX", "").lower() in ("1", "true", "yes")
        self._enable_phoenix = enable_phoenix
        self._probe_timeout = probe_timeout
        self.phoenix_status = self._try_register_phoenix()

    # -- Phoenix / OpenTelemetry wiring (best-effort, opt-in, pre-probed) ------
    def _probe_reachable(self, endpoint: str) -> bool:
        try:
            parsed = urlparse(endpoint if "//" in endpoint else f"//{endpoint}")
            host = parsed.hostname or "localhost"
            port = parsed.port or 4317
            with socket.create_connection((host, port), timeout=self._probe_timeout):
                return True
        except Exception:
            return False

    def _try_register_phoenix(self) -> dict:
        status = {"enabled": False, "reason": None, "endpoint": self.phoenix_endpoint}
        if not self._enable_phoenix:
            status["reason"] = "disabled by default (set SELFWIRE_ENABLE_PHOENIX=1 or pass enable_phoenix=True)"
            return status
        endpoint = self.phoenix_endpoint or "localhost:4317"
        if not self._probe_reachable(endpoint):
            status["reason"] = f"no collector reachable at {endpoint} (probed, {self._probe_timeout}s timeout) — skipped"
            return status
        try:
            from phoenix.otel import register  # arize-phoenix-otel

            tracer_provider = register(
                project_name="selfwire", endpoint=self.phoenix_endpoint,
                auto_instrument=False, batch=True,  # batched + async export; never block the calling thread
                verbose=False,
            )
            try:
                from openinference.instrumentation.dspy import DSPyInstrumentor

                DSPyInstrumentor().instrument(tracer_provider=tracer_provider)
            except Exception as e:
                status["reason"] = f"dspy instrumentor failed: {e}"
                return status
            status["enabled"] = True
            return status
        except Exception as e:
            status["reason"] = f"phoenix registration failed: {e}"
            return status

    # -- JSON lifecycle log -----------------------------------------------------
    def new_run_id(self) -> str:
        return uuid.uuid4().hex[:12]

    def pre_task(self, run_id: str, task: str, strategic_choices: dict, state_transitions: Optional[list] = None) -> Path:
        record = LifecycleRecord(
            run_id=run_id, phase="pre_task", timestamp=_now_iso(), task=task,
            strategic_choices=strategic_choices, state_transitions=state_transitions or [],
        )
        return self._write(record)

    def post_task(
        self, run_id: str, task: str, state_transitions: list, analytical_weights: dict, result: dict
    ) -> Path:
        record = LifecycleRecord(
            run_id=run_id, phase="post_task", timestamp=_now_iso(), task=task,
            state_transitions=state_transitions, analytical_weights=analytical_weights, result=result,
        )
        return self._write(record)

    def _write(self, record: LifecycleRecord) -> Path:
        path = self.log_dir / f"{record.run_id}.{record.phase}.json"
        try:
            path.write_text(json.dumps(asdict(record), indent=2, default=str), encoding="utf-8")
        except Exception:
            pass  # telemetry must never block the agent
        return path

    def read_run(self, run_id: str) -> dict:
        out = {}
        for phase in ("pre_task", "post_task"):
            p = self.log_dir / f"{run_id}.{phase}.json"
            if p.exists():
                try:
                    out[phase] = json.loads(p.read_text(encoding="utf-8"))
                except Exception:
                    out[phase] = None
        return out
