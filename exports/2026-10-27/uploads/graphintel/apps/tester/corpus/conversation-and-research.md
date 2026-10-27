# Corpus for ingest — conversation and research since the beginning

A parseable record for the SEXTANT/Bridago brain and TESTER to ingest alongside the codebase. It captures the naming, the thesis, the research,
and everything built in the working sessions, so the graph holds the project's intent, not only its files.

## Naming and thesis
- **Anima** — the thesis: the graph seed + DSPy cognition layer carry the intelligence; the model is only the substrate.
- **Bridago** — the implementation: the shared seeded brain. **Rex** and **Jarvis** are branches of Bridago.
- **SEXTANT** — the engine agent (the brain), one DSPy ReAct agent on one Signature over a typed hypergraph with Hebbian weights (`apps/engine/round.py`).
- **TESTER** — the house QA/fixer agent; one agent that is one graph of the whole repository (`apps/tester/`).
- Headline experiment: seed once, show quality holds from a 30B model down to an LSTM on CPU.
- Message: you don't need expensive models when the cognitive/memory layer is built and seeded right; seeding determines graph intelligence.
- Research plan of record: `research/reports/Seeded Substrate Plan v4.dc.html`.

## Research and reports (in repo)
- `research/reports/` — Institute Blueprint, Graph Intelligence Report (v2/v3), AI Era Bubble, Cheap Brain Evidence, Catalogue 5M, Exposure and Templates, Landscape 2026, and the Seeded Substrate Plan.
- `research/reports/Graph Inversion Directive v1.dc.html` — owner directive to SEXTANT: investigate the opposite — whether graph intelligence has any purchase on inverting cryptography. Treat the consensus "no" as H0, build the strongest honest H1, classify it (core / constant-factor / orchestration), state what evidence would settle it. Research only; no live attacks.

## SaaS / API surface (what the institute sells)
- `/v1/*` paid API: one key per tenant (`Authorization: Bearer anma_…`), one persona per call (`X-Persona`), every call metered by the rung that answered (graph vs 30b). Personas are policy, not permission; nothing a persona asks for reaches an unpublished node.
- Plans: Metered ($0, pay-per-call), Team ($99/mo), Scale ($499/mo). Spend cap → 402; per-persona rate limit → 429; suspended tenant → 401.
- Site tiers: Visitor, Member, Pro, Owner (Pro adds shadow scores and raw tables).
- Rung prices (`apikeys.py`): lstm $0.00005, tiny $0.0001, 1-3b $0.0004, 8b $0.0012, 30b $0.004, graph $0.00001.

## Built in these sessions
- **Tester dashboards** — v1→v4 (console-first, verdict triage by severity × blast radius, readiness gauge + gap-filler), v5 (dropped Nocturne, modern "Aperture" theme, deep pass at six sizes, Live tab), v6 (real scaled live QA stage, device sizes, Check-this-page, 3-clean-passes tracker, downloadable report), v7 (**autonomous 120-round loop**: audit → plan → build → test-till-pass → audit → repeat, TESTER prompted through the agent API, live monitor; Explorer + SEXTANT cross-linked).
- **console-kit.js** — TigerGraph-grade generative console engine; 200 + 200 structurally unique archetypes (graph-console family + modern skins/palettes).
- **Console Studio / Tester Dashboard Studio / Studios Hub** — pickers over the kits; the Hub wires the live backend and assigns which studio UI each agent runs.
- **test-everything skill** (`apps/tester/skills/test-everything.md`) — the complete layered test plan: static → pytest → page QA → auth → API tiers/personas → metering/caps → multi-tenant isolation → provenance → billing → security → live stack, with a launch-readiness gate. Referenced from `tester.yaml`.
- **Layer 4–6 tests** added to `apps/engine/test_world.py` — spend cap 402, rate limit 429 + reset, usage isolation, key placement/guards.
- **marketing/funnel-email.html** — send-ready HTML funnel email for the paid API, crafted around the thesis and tiers; QA'd by TESTER via the pages sweep.

## Cross-links
- TESTER dashboard → Explorer (header button).
- Explorer → SEXTANT (the Agent-brain 4D view is SEXTANT itself; Ask-SEXTANT inline on every node).
- The funnel email → the API signup and the Signals research record.
