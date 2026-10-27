# Execution log

## What was requested
30 escalating audit/plan/execute/verify rounds, a SOC 2 readiness package, three consecutive test passes, a containerised build run, a fresh-clone run, and a versioned zip.

## What was done (2026-10-10)
One pass, not 30. It was a documentation and gap-finding pass over the existing code, reading `auth.py`, `serve.py`, `publishing.py`, `hub.py` and the test names by search.

## What was not done, and why
- No test run (three or otherwise). No Python or Docker in this environment.
- No container build, no restore drill, no fresh-clone run.
- No zip. This environment cannot create versioned archives; use `present_fs_item_for_download` on the `soc2/` folder, or `git archive` on a real host.
- No Requirements Ledger with per-ask entries; the conversation history was partly trimmed, so a faithful ledger would be incomplete. Rebuild it from the chat on request.
- Telemetry files (`telemetry_*_pre/post.json`) not created: nothing was validated to put in them.
- None of the control gaps below were fixed in code in this pass.

## Findings (round 1)
| Sev | Finding | Control |
| --- | --- | --- |
| major | `/auth/login` has no rate limit or lockout | CC6.1 |
| major | Unsalted SHA-256 password hash | CC6.1 |
| major | HTTP only; no TLS | CC6.7 |
| major | ops holds the host Docker socket | CC6.3 |
| major | No backup or restore | A1.2 |
| major | No dedicated security audit log (login, failed login, approvals) | CC7.2 |
| minor | Opaque id falls back to constant secret; SHA-1, 8 hex | CC6.1 |
| minor | No retention or deletion for visitor text | C1.2, P |
| minor | `extra="forbid"` not confirmed on all models | CC6.6 |
| minor | Dependencies unpinned, no vulnerability scan | CC8.1 |
| minor | Phoenix port exposed | CC6.6 |

## Decisions
- Tenant isolation marked n/a (single owner); public/private separation is the equivalent control.
- Statuses never exceed `impl-untested` until a run produces evidence.

## Next round (needs a real host)
1. Run the three pytest suites three times; record output in `soc2/evidence/`.
2. Fix the six majors above, each with a positive and a negative test.
3. `docker compose up -d --build`, run the journey, record healthchecks.
4. Run gitleaks and pip-audit; pin versions.
5. Restore drill; fill RTO/RPO with measured values.

## Round 2 (2026-10-10): hardening pass, code changed, still not run
Closed in code (each with a test written, none executed):
- Salted scrypt password hash; legacy sha256 still accepted. Test: scrypt roundtrip, malformed hash.
- Security audit log (login success, fail, lockout, logout, publish, approvals, retention), credentials dropped, failures to write never break a request. Tests: three.
- Request models refuse unknown fields. Test: unknown-field refusal.
- Opaque ids keyed by the real session secret, SHA-256, 12 hex. Tests: keyed and stable; no private label or relation in any public field.
- Retention purge endpoint and function. Test: old, new, unreadable and missing rows.
- Owner routes with missing, forged, expired and malformed tokens (attack scenario). Test written.
- nginx security headers, body cap; Phoenix bound to localhost; TLS template; backup and restore script.
Correction: round 1 said `/auth/login` had no rate limit. It does (5 per 10 minutes per address). Matrix fixed.
Still open: MFA, secret scan, dependency pinning and pip-audit, retention scheduling, TLS deployed, restore drill, alerting, idempotency review, legacy hash retirement. Test count is now 41 + 9 = 50 by file inspection; no run.
