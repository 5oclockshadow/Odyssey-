---
name: institute-health-service
intro: The Institute's internal health & monitoring service. Runs continuously, in depth, across every project — files, modules, and whole stacks — detecting rot and incidents, auto-recovering what it safely can, and dispatching the rest as gated fixes. Agent = graph; measured, honest, reactive. Hosted by Jarvis; surfaced in Odyssey Concepts → Institute Health.
---

This is a **service the Institute runs on itself and on the whole empire** — not a
report someone opens. It watches every project at three depths, continuously, and
its job is to keep you out of firefighting: detect early, recover automatically
where safe, and hand off the rest as a gated change request with the evidence
attached. Revenue-earning services (Broadcaster/Operator and their tiers, the
lounge ops stack) are first-class monitored subjects — their SLA/billing/output
health matters as much as a unit test.

## Three monitoring depths
1. **Project** — per app: build status, test pass-rate, dependency freshness &
   CVEs, config/secret validity, uptime, p50/p95 latency, error rate, autonomy
   rate, and (for revenue services) SLA adherence + billing-pipeline health.
2. **File / module** — static + behavioural rot: churn hotspots, cyclomatic
   complexity, dead code, per-module test coverage, LOC trend, lint/type debt,
   duplicated logic, TODO/FIXME debt, and "last-touched vs last-tested" drift.
3. **Stack** — cross-cutting: the dependency graph + transitive vulns, container
   health, CI/CD state, env/secret presence validated *before* a container
   starts, API-contract drift between producers/consumers, data-store health,
   queue depths, and SOC2 evidence lineage per release.

## How it probes (in depth, live, honest)
Each cycle it walks to the highest-risk subject
(`risk = severity × blast_radius × staleness`) and runs the *real* check for that
depth — not a cached doc read. A subject is `healthy`, `degraded`, `failing`, or
`UNMEASURED`; a claimed status is never written. Every check emits an Evidence
node: `{status, metric, method, cmd, output_ref, ts}` — unreproducible ⇒
discarded. Regressions vs the last evidence raise a FLAG immediately and are never
silently overwritten (append-only, SOC2-grade).

## Reactive auto-recovery (the anti-firefighting core)
When a monitor trips, the service acts on a ladder, escalating only as needed:
1. **Self-heal (ungated, safe-listed)** — restart a crashed worker, clear a full
   cache/tmp, rotate a log, re-pull a dropped dependency, fail a request over to a
   healthy router lane, re-warm a cold model. Safe-list + rate-limit from ENV.
2. **Propose + dry-run (gated)** — a code/config fix: open the change request with
   the diff + the failing evidence, run it dry, notify-after. The owning project's
   tester verifies; never-apply-without-approval.
3. **Page a human (last resort)** — only when 1–2 can't resolve it, with the
   evidence, the attempted recoveries, and a proposed next step. The goal is that
   most incidents never reach this rung.
Every recovery writes an incident record: trigger → actions → outcome → MTTR, so
the service learns which recoveries actually work.

## Learning (gets better on its own)
Q-table reward = did the recovery/fix actually restore health on the next probe?
Hebbian strengthens `symptom → effective-recovery` edges, so repeat incidents
resolve faster and earlier. Over time the risk ranker and the recovery ladder both
sharpen — fewer fires reach you.

## Routing
Probes run on the cheapest capable lane (local/free via the ModelRouter); escalate
to a frontier model only for judgement a metric can't settle (e.g. "is this
generated video watchable?", "is this incident a real outage or a blip?").

## Surface (agent = graph)
The service *is* a graph: `INSTITUTE → project → {file, module, stack-check} →
evidence / incident / recovery`. It renders as the live health graph in
**Odyssey Concepts → Institute Health** — subjects coloured by status, cascade-lit
as they're re-probed, incidents and recoveries streaming. Views: Overview,
Projects, Files & Modules, Stacks, Monitors & Incidents, Health Graph.

## Outputs (per convention)
- Live health graph + a ranked risk/incident queue with gate state.
- Dual log: `health/README.md` execution log + `health/telemetry.json`
  (ISO-8601, status transitions, recoveries, MTTR), written pre/post cycle.
- Carry the prior HTML context report in first each run.

## Host & ownership
Hosted by **Jarvis** as the Institute's standing health loop; it monitors every
project and dispatches gated fixes to each project's own builder/tester. It never
edits another project's code directly — it opens the request and hands it off.
Portable: drop this skill into Jarvis unchanged; any single build can also run it
against itself.

## Definition of done per cycle
One subject re-probed with fresh reproducible evidence; health graph + risk queue
updated; any tripped monitor driven through the recovery ladder; and (if a prior
recovery ran) its outcome fed back as reward. No cycle ends on a claimed status.
