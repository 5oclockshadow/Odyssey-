---
name: broadcaster-audit-70round
intro: The 70-round audit + refactor plan for Broadcaster/Operator — several ways to break it down, every dimension, honest ratings.
---

Broadcaster = YouTube Channel Operator. Agent = Graph (codebase/brain/self).
It HAS every piece (router, dspy, hebbian, qtable, tenant/kestrel, saas/tiers,
media gen, email, tester, phoenix, operator) — this audit asks whether each is
wired *properly* and *measures* it, then fixes the gaps over 70 rounds. Honest
numbers only; a FLAG is never hidden.

## Break it down three ways (run all three; cross-check)
1. **By tier/stack** — site → tier app → admin → matrix → operator; for EACH
   meta-stack: graph wired? plasticity wired? dspy best-build? router present?
   SaaS/tenancy correct? autonomy rate?
2. **By pipeline** — scout → research → script → voice → visuals → assemble →
   safety → review → approve → publish → outreach/email → analytics → reward.
   Rate each stage's real quality + whether it's wired to real models/data.
3. **By product/customer** — each channel template + each onboarding tier
   (cities/universities/citizen/gov/military/private/corporate/farming): does it
   actually produce sellable, compliant output a customer would pay for?

## Dimensions to score each round (0–100, measured not claimed)
- **Media gen quality** (currently ~3% — the priority; see `media-gen-quality`):
  real models wired? output watchable/listenable? review catches bad output?
- **Graphs** wired at ALL levels/tiers (not backend-only); RAPTOR tree surfaced.
- **Hebbian + Q-table** wired properly: bounded plasticity + REAL rewards
  (watch-time/CTR via Analytics OAuth), converging — not stubbed.
- **DSPy** components match the best-known build (single OutputField contract,
  ReAct orchestrator, optimizer, per-call `dspy.context`).
- **Router** present + role/health/context/DMR-aware (align with codegen-v3).
- **SaaS** done properly: tenancy isolation, tiers working within each meta-
  stack, quotas/billing, tenant **containers** (kestrels) + **operator** +
  per-tenant secrets/config validated before a container starts.
- **Tester** upgraded + aligned with the other builds (audit/chaos/propose-patch
  never-apply-without-approval); real checks, error injection, CI.
- **Email/outreach** actually sends (gateway + tokens), tracked, compliant.
- **SOC 2** evidence per build/release (kestrel_soc2ready lineage).
- **Autonomy rate**: what % of channels/videos run end-to-end with zero human
  touch at acceptable quality? Report it; drive it up.

## The 70-round loop (pause-only, non-blocking, model-routed)
Each round: pick ONE dimension × ONE stack/pipeline/product cell, MEASURE it
live (not from docs), file the gap as a change request, fix the smallest root
cause, re-measure, ship a PR (tests + README + evidence), record a frame, update
the round-numbered scorecard (see `two-tier-self-audit` from the other builds).
Carry the prior HTML context report in first. Outward actions gated
(dry-run + notify-after). After 70 rounds, publish a refactor roadmap with the
remaining backlog ranked by customer impact.

## Known partials to close first (from Broadcaster's own AUDIT.md)
Q-table has no real rewards (needs Analytics OAuth) · RAPTOR tree backend-only
(browser shows flat Hebbian) · new modules (security, media_pipeline, tenancy,
qtable) lack CI tests · zip timestamp not in filename · README/telemetry writes
stalled · YouTube Data API wired but not exercised live · per-agent code sandbox
backend-only · prayer/infomercial templates missing.
