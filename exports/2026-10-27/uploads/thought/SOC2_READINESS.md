# Map Graph SOC 2 Readiness (draft v1, 2026-10-10)

This is readiness work, not certification. Only an independent CPA firm can issue a SOC 2 report.
Status key: **Implemented+tested** (test run, see EXECUTION_LOG) · **Implemented, untested** · **Documented only** · **Gap**.

## 1. Product and data
Map Graph is a static marketing site plus a Node/SQLite API (waitlist, survey, contact, events, admin stats/export, drip email worker). The mapping app (Thoughts/Atlas/Universe) runs entirely in the browser; no map content is sent to the server. Live-AI, when enabled by the user, sends text to Claude from the browser (third party, see section 5).

| Data | Where | Class |
|---|---|---|
| Email, name, role, use case, survey, referral code | signups | Confidential (personal) |
| Contact name/email/message | contacts | Confidential (personal) |
| Page/CTA events (type, page, session id) | events | Internal |
| Admin token | server env only | Restricted |
| Marketing pages, docs | static | Public |

Trust boundaries: browser to API (validated, rate limited); API to SQLite; worker to SMTP; admin to API (bearer token).

## 2. Scope of criteria
In scope: Security (CC1-CC9), Availability (A1, light), Processing Integrity (PI1, inputs), Confidentiality (C1), Privacy (P, waitlist data).
Excluded with reason: end-user accounts/sessions/MFA/tenant isolation. The product has no user login or multi-tenant data; the only privileged actor is one admin token. These become required if accounts are added.

## 3. Control matrix
| ID | Control | Implementation | Test | Status |
|---|---|---|---|---|
| CC6.1 | Admin endpoints fail closed, constant-time token compare | handler.js safeEq, isAdmin | security-tests: stats/export no token, wrong token, unset token, empty token | Implemented+tested |
| CC6.1 | No default credential; start refused with weak token | index.js startup check, .env.example blank | none (needs Node run) | Implemented, untested |
| CC6.6 | Rate limiting, spoof-resistant (X-Forwarded-For only if TRUST_PROXY=1) | handler.js | 13th POST 429; spoofed header no bypass | Implemented+tested |
| CC6.6 | Security headers, CORS locked in production, dotfile/db/sql/md/yaml not served | index.js | none | Implemented, untested |
| CC6.7 | TLS | Must be terminated by host/proxy; HSTS header sent | none | Documented only |
| CC6.1/C1 | Encryption at rest | SQLite file not encrypted | n/a | Gap: use encrypted volume |
| CC7.2 | Structured audit log: admin stats/export allowed/denied, rate-limit denials, server errors; actor is hashed ip or "admin"; no token, no raw ip | handler.js audit hook, index.js JSON lines | log content test | Implemented+tested |
| CC7.2 | Alerting on anomalies | none | n/a | Gap |
| CC7.3 | Incident response | section 6 | n/a | Documented only |
| CC8.1 | Change management | Rule: tests pass before release; no CI configured | n/a | Gap: no CI, no version control record in repo |
| CC9.2 | Vendor inventory | section 5 | n/a | Documented only |
| A1.2 | Store failure returns generic 500, logged | handler.js | store-throws test | Implemented+tested |
| A1.2 | Health check | GET /api/health | none | Implemented, untested |
| A1.2/A1.3 | Backup, restore test, RTO/RPO | none | n/a | Gap |
| PI1.2 | Input validation, length caps, enum allowlists, control-char stripping | validate.js | bad email, oversized, hostile name, unknown event type | Implemented+tested |
| PI1.2 | Idempotent signup (duplicate email returns existing) | handler.js, UNIQUE email | none | Implemented, untested |
| C1.1 | CSV export neutralises formula injection | csvCell | formula cell test | Implemented+tested |
| C1.2 | Retention and deletion | none; no delete endpoint | n/a | Gap |
| P3/P5 | Notice, access, deletion requests | none | n/a | Gap |
| CC1/CC2 | Policy set | section 7 | n/a | Documented only (unowned, unreviewed) |

Counts: 8 Implemented+tested, 4 Implemented untested, 6 Documented only or mixed, 6 Gap (see rows).

## 4. Known defects fixed this pass
1. /api/stats was open when ADMIN_TOKEN was unset.
2. Token compared with !== (timing leak).
3. .env.example shipped ADMIN_TOKEN=change-me.
4. X-Forwarded-For trusted unconditionally, so rate limits were bypassable.
5. CSV export allowed formula injection.
6. Errors swallowed with no log.
7. CORS defaulted to * and no security headers.

## 5. Vendors
Anthropic (user-initiated live-AI, text typed in the map, browser to vendor), SMTP provider (recipient email, name, referral code), Google Fonts (visitor IP), hosting provider (all server data).

## 6. Incident runbook (draft)
1. Detect: audit log lines with outcome "denied" in bursts, or "server_error".
2. Contain: rotate ADMIN_TOKEN, restart; set SERVE_STATIC=0 if site abuse.
3. Assess: which table, which period; contacts/signups hold personal data.
4. Notify: affected people and regulators per applicable law within required windows (owner decides).
5. Record: timeline, cause, fix, new test.

## 7. Policies needed (owners and review dates not yet assigned)
Information security, acceptable use, access review, data retention, incident response, vendor management.

## 8. Risk register
| Risk | L | I | Treatment |
|---|---|---|---|
| Admin token leak | M | H | rotate, long random token, audit log; add per-admin accounts |
| DB file theft | L | H | encrypted volume, backups |
| Spam/abuse of public POSTs | H | L | rate limit; add CAPTCHA if needed |
| SMTP outage | M | L | queue retries in worker |
| Personal data kept indefinitely | M | M | define retention, build deletion |

## 9. For a CPA auditor to assess independently
Design and operating effectiveness over time, policy approval and review evidence, access reviews, vendor due diligence, backup restore evidence, hosting/TLS configuration, personnel controls.
