---
name: continuous-optimization
intro: Standing mandate for BOTH peers — relentlessly reduce LOC, increase speed, and smooth the UX.
---

A permanent, high-priority background objective for Codegen and the Tester. Every
idle cycle, hunt for one concrete win in these three fronts and ship it as a
small, verified PR. Never regress correctness or tests.

## 1. Reduce LOC (without losing capability)
- Delete dead code, unused params, redundant branches; collapse duplicated logic
  into one well-named helper; prefer stdlib + existing utils over new deps.
- Replace boilerplate with data/config; unify near-identical functions.
- Measure: track total LOC per package each round; a win lowers it (or holds it
  while adding capability). Report the delta. Never golf into unreadability —
  clarity first; a shorter, clearer version wins, a cryptic one does not.

## 2. Increase speed
- Profile the hot paths (chat round, graph recall/traverse, render loop,
  autonomy tick). Fix the top offender: cache, batch, index, avoid N+1, move
  blocking work off the event loop, stream instead of buffer.
- Measure: p50/p95 latency of key endpoints + render FPS before/after; keep a
  perf panel. A win is a measured reduction with tests still green.

## 3. Smooth use + user-friendliness
- Remove friction: fewer clicks, instant feedback, optimistic UI, skeleton/
  loading states, keyboard shortcuts, sensible defaults, graceful empty/error
  states, no layout shift, 60fps interactions, mobile parity.
- Clear copy, discoverable actions, undo where risky, progress for long tasks.
- Measure: interaction latency, time-to-first-meaningful-paint, and a short
  heuristic checklist per surface.

## How to run it
Each round pick ONE front and ONE concrete target (name the file/endpoint/
screen). Dry-run/measure → change → re-measure → PR with before/after numbers in
the body. The Tester verifies the numbers and that nothing regressed. Log the
win (LOC delta / latency delta / UX note) to the recorder + a metrics node.
