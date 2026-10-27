"""
reporter.py — the dual-format execution log (README.md + Telemetry JSON is
handled by telemetry.py) plus the persistent HTML historical-context report.

Two responsibilities:

  1. append_log(...) — every build/run step gets one human-readable line
     appended to reports/EXECUTION_LOG.md. Cheap, append-only, grep-able.

  2. write_context_report(...) / read_latest_context_report() — an HTML
     report of the run (what changed, what the tool graph looks like, what
     decisions were made) written to reports/context/ with a timestamped
     filename. Per the immutable-naming mandate this *is* a place where a
     new filename per run is correct: these are dated historical snapshots,
     not source modules, so nothing ever needs to import one by a stable
     name. `read_latest_context_report()` is what lets a new run "read and
     ingest the previous HTML reports to maintain state" before it starts.
"""

from __future__ import annotations

import html
import json
import re
import time
from pathlib import Path
from typing import Optional


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def _now_stamp() -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())


class Reporter:
    def __init__(self, reports_dir: Optional[str] = None) -> None:
        self.reports_dir = Path(reports_dir or (Path(__file__).resolve().parent.parent / "reports"))
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.context_dir = self.reports_dir / "context"
        self.context_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.reports_dir / "EXECUTION_LOG.md"
        self.last_log_write_ok: Optional[bool] = None
        self.last_report_write_ok: Optional[bool] = None
        if not self.log_path.exists():
            self.log_path.write_text(
                "# SelfWire Execution Log\n\nHuman-readable, append-only record of build/run steps.\n\n",
                encoding="utf-8",
            )

    # -- README execution log ---------------------------------------------------
    def append_log(self, heading: str, details: str = "") -> bool:
        """Append one entry to the execution log.

        This runs at the tail end of every agent turn (see agent.py), after
        the actual work already succeeded — a disk hiccup here must not turn
        a successful run into a crashed one. try/except/finally: the write
        itself is guarded; `finally` always records whether logging kept up
        (self.last_log_write_ok), so a run of silent logging failures is at
        least observable even though it's never fatal.
        """
        ok = False
        try:
            entry = f"## {_now_iso()} — {heading}\n\n{details}\n\n" if details else f"## {_now_iso()} — {heading}\n\n"
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(entry)
            ok = True
            return ok
        except Exception:
            return ok
        finally:
            self.last_log_write_ok = ok

    # -- HTML historical context report ------------------------------------------
    def read_latest_context_report(self) -> Optional[dict]:
        """Ingest state from the most recent prior HTML report, if any.
        Returns the embedded JSON state block, or None if no report exists yet."""
        reports = sorted(self.context_dir.glob("context-*.html"))
        if not reports:
            return None
        latest = reports[-1]
        try:
            text = latest.read_text(encoding="utf-8")
            match = re.search(
                r'<script id="selfwire-state" type="application/json">(.*?)</script>',
                text, re.DOTALL,
            )
            if not match:
                return None
            state = json.loads(match.group(1))
            state["_source_file"] = str(latest)
            return state
        except Exception:
            return None

    def write_context_report(self, run_id: str, summary: str, state: dict) -> Path:
        """Write the timestamped HTML context report.

        Same shape as append_log above: this is end-of-run bookkeeping that
        must never be allowed to turn a successful agent run into a crashed
        one, so the page-building and the actual write are both inside
        try/except, and `finally` unconditionally records whether it
        actually landed on disk (self.last_report_write_ok) — the caller
        still gets a Path back either way (matching telemetry.py's
        `_write()`), it just may point at a file that isn't there if the
        write failed; check last_report_write_ok to know which.
        """
        stamp = _now_stamp()
        path = self.context_dir / f"context-{stamp}-{run_id}.html"
        try:
            return self._write_context_report(path, run_id, summary, state)
        except Exception:
            return path
        finally:
            self.last_report_write_ok = path.exists()

    def _write_context_report(self, path: Path, run_id: str, summary: str, state: dict) -> Path:
        state_json = json.dumps(state, indent=2, default=str)
        tool_rows = "".join(
            f"<tr><td>{html.escape(str(t.get('name','')))}</td>"
            f"<td>{html.escape(str(t.get('source','')))}</td>"
            f"<td>{t.get('call_count',0)}</td>"
            f"<td>{t.get('error_count',0)}</td></tr>"
            for t in state.get("tools", [])
        )
        page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SelfWire context report — {html.escape(run_id)}</title>
<style>
  :root {{ --bg:#0a0e14; --panel:#0f1620; --neon:#39ff88; --neon2:#00e5ff; --text:#d8f5e3; --muted:#6d8a80; }}
  body {{ background:var(--bg); color:var(--text); font-family: ui-monospace, "SF Mono", Menlo, monospace; margin:0; padding:32px; }}
  h1 {{ color:var(--neon); text-shadow:0 0 8px var(--neon); font-size:20px; }}
  h2 {{ color:var(--neon2); text-shadow:0 0 6px var(--neon2); font-size:15px; margin-top:28px; }}
  .panel {{ background:var(--panel); border:1px solid #1c2b26; border-radius:8px; padding:16px; margin:12px 0; }}
  table {{ width:100%; border-collapse: collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:6px 10px; border-bottom:1px solid #1c2b26; }}
  th {{ color:var(--muted); font-weight:normal; }}
  .muted {{ color:var(--muted); font-size:12px; }}
  code {{ color:var(--neon); }}
</style>
</head>
<body>
  <h1>SelfWire — context report</h1>
  <p class="muted">run <code>{html.escape(run_id)}</code> — generated {_now_iso()}</p>
  <div class="panel">
    <h2>Summary</h2>
    <p>{html.escape(summary)}</p>
  </div>
  <div class="panel">
    <h2>Tools at end of run</h2>
    <table>
      <tr><th>name</th><th>source</th><th>calls</th><th>errors</th></tr>
      {tool_rows or '<tr><td colspan="4" class="muted">no tools registered</td></tr>'}
    </table>
  </div>
  <p class="muted">Full machine-readable state is embedded below and is re-read by the next run to preserve continuity.</p>
  <script id="selfwire-state" type="application/json">{state_json}</script>
</body>
</html>"""
        path.write_text(page, encoding="utf-8")
        return path
