# Control matrix

Status key: `impl-untested` = code and test exist, never run. `gap` = not built. `design` = a design property with no dedicated test. Nothing is `verified`.

| ID | Control | Implementation | Owner | Test | Evidence to collect | Status |
| --- | --- | --- | --- | --- | --- | --- |
| CC6.1 | Owner authentication with signed, expiring session | `apps/engine/auth.py` (HMAC token, `exp`, httponly, samesite=lax, secure on https); password or SHA-256 hash via `OWNER_PASSWORD(_HASH)` | Owner | test_engine auth tests; `test_ops.py` forged and expired token | pytest output; login audit lines | impl-untested |
| CC6.1 | Salted scrypt password hash (`OWNER_PASSWORD_HASH=scrypt$…`); legacy sha256 still accepted | `auth.hash_password`, `auth.password_ok` | Owner | `test_scrypt_hash_roundtrip_and_legacy_hash` (incl. malformed hash) | pytest output | impl-untested; legacy sha256 path remains (retire it) |
| CC6.1 | Failed-login lockout: 5 attempts per 10 min per address, then 429 | `auth.throttle` in `/auth/login` (in-memory) | Owner | `test_login_is_audited_throttled_and_never_logs_the_password`, existing throttle test | pytest output | impl-untested; per-process, resets on restart |
| CC6.1 | MFA | none | Owner | none | n/a | **gap** |
| CC6.2 | Deprovisioning | One owner; rotate SESSION_SECRET to invalidate all sessions | Owner | none | rotation record | design |
| CC6.3 | Least privilege: visitors cannot write the graph or call tools | `post_round` public path: published slice only, no tools, nothing merged (`round.py`, `serve.py`) | Owner | `test_a_round_runs_off_the_event_loop_and_only_owners_write_the_graph` | pytest output | impl-untested |
| CC6.3 | Agent cannot edit its own code | read-only root FS, source root-owned; changes only via `plan_upgrade` → approval → sandbox tests → PR | Owner | upgrades tests in `test_engine.py` | PR records | impl-untested |
| CC6.6 | Phoenix bound to 127.0.0.1:6006 (SSH tunnel) | `docker-compose.yml` | Owner | none | `docker compose ps` | designed |
| CC6.6 | Rate limiting on public doors | `auth.ratelimit` (in memory, per IP) on `/round`, `/event`, `/public/graph` | Owner | `test_public_doors_are_rate_limited` | pytest output | impl-untested (in-memory: resets on restart; per-process) |
| CC6.6 | Input validation | All request models extend `Strict` (`extra="forbid"`); caps on chat (4000) and events (80/4000); nginx `client_max_body_size 64k` | Owner | `test_unknown_fields_are_refused_at_the_door` | pytest output | impl-untested; model-internal signature types not yet audited |
| CC6.7 | Encryption in transit | Template `apps/web/nginx.tls.conf.example` (443, TLS 1.2+, HSTS, owner-path allow-list); stack itself serves HTTP internally | Owner | none | curl -I https output | designed; **not deployed**, certificates are yours to supply |
| CC6.7 | Encryption at rest | none (plain files in `/state`) | Owner | none | n/a | **gap**: rely on host volume encryption; document |
| CC6.1 | Secrets only in environment | `.env.example`; no secrets in code (to be confirmed by scan) | Owner | none | secret-scan output | **gap**: run gitleaks |
| CC6.1 | Public API never leaks private data | `publishing.hood(public=True)`: unpublished nodes get an HMAC-SHA256 opaque id keyed by the session secret (env or generated `state/session.secret`), no label, type or relation; telemetry/code/incidents excluded | Owner | existing publishing test; `test_public_graph_withholds_private_labels_in_every_field`; `test_opaque_ids_are_keyed_stable_and_not_a_constant` | pytest output | impl-untested |
| CC7.2 | Audit log for hub actions | `apps/mcp-hub/hub.py` `audit()` → `audit.jsonl` (install, update, remove, denied) | Owner | `test_hub.py` audit assertions | sample `audit.jsonl` | impl-untested |
| CC7.2 | Security audit log: login success/fail/lockout, logout, publish, approvals, retention; time, actor, outcome, address; credentials never written | `auth.audit` → `state/security.jsonl`, called from `serve.py` | Owner | `test_security_log_has_actor_outcome_and_no_secrets`, `test_security_log_failure_does_not_crash_the_request`, login test | sample `security.jsonl` | impl-untested; data export is not a feature so not logged; no alerting yet |
| CC7.2 | Tracing | Phoenix over OTLP; spans in graph | Owner | none | Phoenix screenshot | design |
| CC7.3 | Incident detection and repair loop | `heal.py`: error → incident → located → diff → sandbox test → PR; owner approves | Owner | heal tests | incident records | impl-untested |
| CC7.4 | Incident response runbook | POLICIES.md | Owner | tabletop | exercise record | designed (never exercised) |
| CC8.1 | Change management | Upgrades via PR only; sandbox runs the full suite first; owner merges | Owner | upgrades tests | PR history | impl-untested |
| CC8.1 | Dependency pinning and vulnerability scan | `requirements.txt` present | Owner | none | pip-audit output | **gap**: pin exact versions, add pip-audit |
| CC3.2 | Risk register | RISK_AND_VENDORS.md | Owner | n/a | review record | drafted |
| CC9.2 | Vendor inventory | RISK_AND_VENDORS.md | Owner | n/a | review record | drafted |
| CC1/CC2 | Policy set with owner and review date | POLICIES.md | Owner | n/a | sign-off | drafted, unsigned |
| A1.2 | Health check and restart | `/health`, compose restart policy, site apps health-checked every 5 min | Owner | none | health output | impl-untested |
| A1.2 | Backup and restore with checksum | `scripts/backup.sh backup|restore`; targets RTO 4 h, RPO 24 h | Owner | none | restore drill record | designed; **never run**, no drill |
| A1.2 | Graceful degradation | public pages fall back to labelled sample data when engine is down | Owner | browser check (Research page only) | screenshot | partially observed |
| PI1.1 | Typed output, one in/one out Signature | `signature.py`; test enforces single fields | Owner | signature test | pytest output | impl-untested |
| PI1.2 | Approval before anything is public | publish batches proposed → owner approves; mindful gate drafts posts | Owner | publishing + mindful tests | queue records | impl-untested |
| PI1.4 | Idempotency on retries | not reviewed | Owner | none | n/a | **gap** |
| C1.1 | Confidential data separated | see CC6.1 public API row | Owner | publishing tests | pytest output | impl-untested |
| C1.2 | Retention and deletion | `POST /owner/retention` → `auth.purge` (rounds older than `retention_days`, default 90; security log 365+ days) | Owner | `test_retention_drops_old_rows_keeps_new_and_unreadable` | audit line `retention` | impl-untested; **not scheduled** (owner must call it) |
| P-series | Visitor text minimised, no tracking | rate-limit keys are IPs in memory; visitor text recorded in round record | Owner | none | n/a | partial; **gap**: retention, notice, deletion on request |
| Cross-cutting | ops container holds host Docker socket | `docker-compose.yml` | Owner | none | n/a | **accepted risk R1**; owner login equals host control |

Updated after the hardening pass: the earlier claim that `/auth/login` had no rate limit was wrong; it is throttled. Remaining gaps: MFA, secret-scan and dependency pinning/pip-audit, idempotency review, retention scheduling, TLS deployment, restore drill, alerting, retiring the legacy sha256 hash. Verified: 0 (nothing has run).
