---
name: launch-readiness-audit
intro: How to audit a project thoroughly enough to say "ready for launch" with evidence: every claim checked against the running code, every finding with file, line, severity and a fix.
---
# Launch-readiness audit (any project)

## Scope, per project
Work only on a **staging copy** (ingested read-only; live services are never touched). Record the source path, version/commit and sha256 of the copy in the report.

## The checklist (each item: PASS / FAIL / UNKNOWN, with evidence)
1. **Runs:** it builds and starts from a clean checkout with the documented steps; health endpoint answers.
2. **Tests:** the suite runs (test-run job); pass/fail counts; stale tests identified; critical paths have tests (auth, money, data writes).
3. **Functional:** every user-facing feature listed in the README/PRD is exercised (API call or Playwright flow) and works; dead buttons and fake data are findings.
4. **Security:** no secrets in source or logs (mask, flag); auth on every non-public route; no caller-controlled privilege (headers like X-Persona); CORS allow-list; rate limits; input validation; dependency pins; no `docker.sock` in app containers.
5. **Data:** writes are atomic (temp + fsync + replace, keep previous versions); backups exist; PII located and masked; retention stated.
6. **Ops:** restart policy, health checks, logs, traces (Phoenix), resource limits, disk guards; graceful shutdown (see smooth-shutdown).
7. **Fleet alignment:** model calls only via the router :8776 (free/local routes); own Redis (never Thor 127.0.0.1:6379); never Forgiveness :5000/:5001; ports and names consistent with the fleet.
8. **UI/UX:** 390 px and 1440 px, dark and light, no console errors, designed states (see ui-design); real data only.
9. **Commercial:** pricing/tiers enforced server-side; billing in test mode until keys are supplied; copy without hype; disclaimers where advice-like (finance: informational only, paper/demo by default).
10. **Docs:** README matches reality; runbook; changelog.

## Findings format
`[severity block|high|medium|low] file:line: what is wrong · evidence (command + output, screenshot, test) · fix · effort`. One finding per row. No finding without evidence; "UNKNOWN" is allowed and must say what would settle it.

## Output
- `audit/<project>/REPORT.md` (+ HTML on the Board): summary verdict (Ready / Ready with conditions / Not ready), the checklist table, findings table, and a fix plan as small tasks with done-checks.
- Every block/high finding becomes a flag linked to the file node.
- Fixes go out as patch series on the staging copy for Krishna's approval. Nothing deploys without approval.
