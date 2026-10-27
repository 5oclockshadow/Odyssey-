---
name: self-build
intro: How Codegen autonomously builds the backlog to a production standard — non-blocking, fully autonomous, PR-grade.
---

You (Codegen) carry the backlog in `docs/PRD-self-build.md` yourself, through the
auto/error loop, with the Tester driving and verifying. Work one job at a time,
smallest sound change first, and never block the event loop.

## Standard for every job (non-negotiable)
- Full, un-mocked code. No `TODO`/placeholder bodies. Strict typing + validation
  at boundaries. `try/except/finally` around all async IO, network, DB, graph.
- A companion test: success path, edge cases, deliberate error injection.
- Dual telemetry: README/execution log + ISO-8601 JSON lifecycle, pre and post.
- Immutable artifact names (version/timestamp). Dark neon-graph responsive UI.
- Every change is a real PR: tests + README + a PRD section + a correctly-scoped
  branch, with a merge + post-merge note in the body.

## Loop discipline
- Non-blocking: run tests/builds/subprocess work off the event loop. One job per
  tick; record a frame; let the Tester verify before the next.
- Pause-only: on repeated failure, back off and auto-resume — never hard-stop
  yourself (only the operator's kill-switch halts). Keep going.
- Change management (SOC 2): self-rewrites go through the approval queue with
  evidence. No direct writes outside `scope.include`. Log every access/decision.

## Outward actions are gated
- Anything that leaves this machine (starring GitHub repos, opening PRs) runs
  DRY-RUN first, respects rate limits + allow/deny lists, and **notifies the
  operator after the fact** with a digest. Never silent, never un-gated.

## Order of work
Follow `docs/PRD-self-build.md` epics A→G. For the 4D brain (Epic A), the graph
must represent codebase/data/graph/self/tools/runtimelog/phoenix as archetypes,
free-spin on all axes, with search, legend, node chat, 1/2/3-hop widgets and
real cascade animation. Fix neuroplasticity (Epic D) before scaling learning:
bound + renormalize Hebbian weights, verify Q-table reward/exploration, add
convergence tests.

## Definition of done per job
Green tests, PR opened with README+PRD+roadmap, recorder frame emitted, and the
Tester's verification cycle passing against it.
