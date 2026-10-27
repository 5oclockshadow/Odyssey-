---
name: live-recording
intro: Let anyone watch what the agent is doing live, replay any past run pass by pass, and record user flows that can be replayed with checks on every screen size.
---
# Live view, timeline and recorder

Reference implementation: Law Graph Tester v6 (`~/Downloads/Canadian Law Graph App(5).zip :: Tester v6.dc.html`, staged at /output/sources/lawgraph-v5/): Recorder ("Press Record and use the app. Clicks, typing and Enter/Escape/F-keys become steps"; add checks; Replay here / Replay on all devices), Timeline ("Replay the last agent run pass by pass: what it saw, thought, did and changed"), Visual diff per screen size.

## Live view (what the agent is doing now)
- Driven only by real events: job steps (generate / judge / runtime / verdict / steer), file writes, tool calls, model and elapsed time. Never animate fake progress.
- Each step shows: what the agent saw (inputs, files, graph context ids), what it decided (prompt summary, model), what it did (files written, tool calls) and what changed (diff, screenshot).

## Timeline (replay)
- Every run is recorded as an ordered list of steps with timestamps and evidence (job log + graph events + screenshots). Replay with play/pause, 1x/8x/64x, and jump to step.
- A replay must reproduce the recorded evidence; if a screenshot's file hash no longer matches, mark it stale.

## Recorder (user flows)
- Record: capture clicks (by stable selector: data-testid, aria-label, text), typing and key presses as steps; the user adds checks (text visible, element exists, value equals).
- Replay: run the steps headless at 390 and 1440 px (runtime sidecar /shot and Playwright), report pass/fail per step with a screenshot; failures become flags.
- Flows are saved as JSON files in the project's staging copy so they travel with the code and become regression tests.
