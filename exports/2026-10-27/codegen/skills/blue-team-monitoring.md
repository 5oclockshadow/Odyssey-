---
name: blue-team-monitoring
intro: Watch, detect and respond across the fleet — the signals we already have (System view, disk guard, route smoke, ledger, events, tester), what normal looks like, and the first response for each alert.
---
# Blue team: monitor · detect · respond

**Signals**: Workspace "Console + System" / "Ops" presets → System (per-core CPU, memory/swap, net, disk I/O),
Board (jobs/lanes), Claude ⇄ Codegen (pipe KPIs), Brain (approvals, errors). APIs: `/api/v3/system`,
`/api/v3/disk`, `/api/v3/route-smoke`, `/api/v3/ledger` (SHA-256 chain), `/api/v3/events`, Gopher `/api/reader`.
**Normal (Thor)**: memory < 85 %, swap < 50 %, disk free > 20 GB, journal growth < 200 MB/day, route smoke PASS,
ledger verified, no lane errors.
**Alerts → first response**
- Disk < 5 GB → disk-guard runs tier 0 automatically; if still low: find the writer, report tier 1.
- Swap > 50 % sustained (seen: 48 %) → list top memory processes, stop the idle model servers, report.
- Smoke FAIL / think timeouts → route-smoke-and-fix.
- Ledger BROKEN → stop autonomy (halt), report the first bad seq; never "repair" the chain silently.
- Unknown listener / new 0.0.0.0 port → red-team step 1 on it.
- Log spam → identify SYSLOG_IDENTIFIER, fix the source.
**Respond**: contain (pause/halt the agent, not delete), evidence (`write_report` with sha + time), fix via the
warden, verify the signal returned to normal, note it in failure-patterns.
