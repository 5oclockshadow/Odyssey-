#!/usr/bin/env python3
"""
build_status_report.py — writes a versioned, self-contained HTML status
report for the current tree (docs/build-reports/status-v<version>-<ts>.html)
plus matching pre/post telemetry JSON, from real data: a full test run, the
audit, the moat policy, and recent git history. Earlier reports are never
overwritten, so the folder is the project's build history.

    .venv/bin/python scripts/build_status_report.py
"""

from __future__ import annotations

import html
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from selfwire import __version__  # noqa: E402
from selfwire.workbench import moat  # noqa: E402
from selfwire.workbench.auditor import Auditor  # noqa: E402
from selfwire.workbench.moat import MoatPolicy  # noqa: E402
from selfwire.workbench.tester import TestRunner  # noqa: E402
from selfwire.workbench.workspace import Workspace  # noqa: E402

OUT_DIR = ROOT / "docs" / "build-reports"


def iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    base = OUT_DIR / f"status-v{__version__}-{stamp}"
    started = time.time()
    pre = {"phase": "pre", "timestamp": iso(started), "version": __version__,
           "plan": ["full pytest run", "audit with that run", "moat policy snapshot", "git history"]}
    Path(f"{base}.pre.json").write_text(json.dumps(pre, indent=2))

    ws = Workspace(ROOT)
    report = TestRunner(ROOT).run()
    audit = Auditor(ws).run(report)
    policy = MoatPolicy()
    commits = ws.log(12)
    assertions = moat.count_assertions(ws)

    post = {"phase": "post", "timestamp": iso(time.time()), "version": __version__,
            "tests": report.summary(), "audit": {"score": audit.score, "counts": audit.counts()},
            "assertions_under_tests": assertions, "head": ws.head()}
    Path(f"{base}.post.json").write_text(json.dumps(post, indent=2))

    e = html.escape
    finding_rows = "".join(
        f"<tr><td class='sev {e(f.severity)}'>{e(f.severity)}</td><td>{e(f.rule)}</td>"
        f"<td>{e(f.path or '')}{':' + str(f.line) if f.line else ''}</td><td>{e(f.message)}</td></tr>"
        for f in audit.findings) or "<tr><td colspan=4>No findings.</td></tr>"
    commit_rows = "".join(
        f"<tr><td class='sha'>{e(c.short)}</td><td>{e(c.date[:19])}</td><td>{e(c.message)}"
        f"{''.join(f' <span class=tag>{e(t)}</span>' for t in c.tags)}</td></tr>" for c in commits)
    status = "pass" if report.ok else "fail"
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SelfWire v{e(__version__)} status</title>
<style>
:root{{--bg:#05070a;--panel:#0d1319;--line:#1b2a24;--text:#d8f5e3;--muted:#7d978d;--green:#39ff88;--cyan:#00e5ff;--amber:#ffd23f;--red:#ff4d6d;}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}}
main{{max-width:1100px;margin:0 auto;padding:24px 16px}}h1{{color:var(--green);font-size:20px;margin:0 0 4px}}
h2{{font-size:14px;color:var(--cyan);margin:28px 0 8px;text-transform:uppercase;letter-spacing:.06em}}
.muted{{color:var(--muted)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}}
.big{{font-size:26px;font-weight:700}}.pass{{color:var(--green)}}.fail{{color:var(--red)}}
table{{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
td,th{{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-word}}
.sev.high{{color:var(--red)}}.sev.medium{{color:var(--amber)}}.sev.low,.sev.info{{color:var(--muted)}}
.sha{{color:var(--amber)}}.tag{{color:var(--cyan);border:1px solid var(--cyan);border-radius:6px;padding:0 5px;font-size:12px}}
pre{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere}}
</style></head><body><main>
<h1>SelfWire v{e(__version__)} — build status</h1>
<div class="muted">generated {e(iso(time.time()))} · HEAD {e((ws.head() or '')[:12])}</div>
<h2>Summary</h2>
<div class="grid">
 <div class="card"><div class="muted">tests</div><div class="big {status}">{report.passed}/{report.total}</div><div class="muted">{report.failed} failed · {report.errors} errors · {report.skipped} skipped · {report.duration:.0f}s</div></div>
 <div class="card"><div class="muted">audit score</div><div class="big">{audit.score}</div><div class="muted">{e(json.dumps(audit.counts()))}</div></div>
 <div class="card"><div class="muted">assertions under tests/</div><div class="big">{assertions}</div><div class="muted">moat floor for improvements</div></div>
 <div class="card"><div class="muted">python files</div><div class="big">{audit.metrics['py_files']}</div><div class="muted">{audit.metrics['loc']} lines · {audit.metrics['test_files']} test files</div></div>
</div>
<h2>Moat policy in force</h2><pre>{e(policy.describe())}</pre>
<h2>Audit findings</h2><table><tr><th>severity</th><th>rule</th><th>where</th><th>message</th></tr>{finding_rows}</table>
<h2>Recent history</h2><table><tr><th>sha</th><th>date</th><th>message</th></tr>{commit_rows}</table>
<h2>Test output (tail)</h2><pre>{e(chr(10).join(report.output_tail.splitlines()[-15:]))}</pre>
</main></body></html>"""
    Path(f"{base}.html").write_text(doc)
    print(f"wrote {base}.html (tests {report.passed}/{report.total}, audit {audit.score})")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
