---
name: soc2-and-saas
intro: Maintain a SOC 2 posture across stacks and keep Codegen SaaS-ready (tenancy, tokens, quotas).
---

## SOC 2 posture (standing, testable controls)
- **Audit trail**: append-only, immutable event log of access + changes. Make
  the existing ledger SOC2-grade: per-row integrity hash chaining the previous
  hash, timestamps, actor, retention policy. Tamper-evident; never edit a row.
- **Access control**: least-privilege API tokens (per tenant/workspace), admin
  key for minting + rotation, log every auth decision (grant/deny). Scope every
  read/write by principal.
- **Change management**: every self-rewrite → approval queue with evidence; no
  direct prod writes; releases are promoted, not hot-patched; rollback ready.
- **Monitoring**: health, error rates, and control-failure alerts; a controls
  checklist mapped to CC1–CC9, each backed by a test that fails loudly if a
  control regresses.
Keep a `docs/soc2-controls.md` matrix: control → implementation → test → status.

## SaaS readiness
- Data model: sessions carry owner_id + workspace (done); scope all queries.
- Tokens: mint/resolve/list(masked)/revoke (done); add rotation + expiry.
- Quotas per tenant: LLM calls/hour, jobs/day, storage; meter usage; return 429
  with a clear message past the limit. Billing/plan hooks later.
- Workspace invites + roles (owner/member) as a follow-up.

## Rule
Security and tenancy changes ship with tests and never weaken an existing
control. A control without a test does not count as a control.
