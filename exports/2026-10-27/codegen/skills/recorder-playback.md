---
name: recorder-playback
intro: Live-view recorder + media-player playback + record/replay test flows across devices (Tester-v4 dashboard).
---

Both peers record everything meaningful to a seq-stamped tape; the dashboard
plays it back like a media player and can record/replay test flows.

## Live view + playback (media player)
- Live toggle streams new frames (SSE) into the view as they happen (agent
  thinking, loading, downloading, approvals-awaiting, generating, verifying).
- Playback controls: play/pause, seek (scrubber over the tape timeline), speed
  (0.5–4×), step, and a shareable timestamp. Source = the recorder tape and
  Codegen's `session_events` (both seq-stamped; identical player).
- Multi-channel: several viewers watch/replay the same tape; presence shown.

## Record / replay test flows (across devices)
- **Record** a flow: capture user actions (clicks, inputs, navigation) with the
  element picked, into a named flow.
- **Add checks**: "text is shown", "element present", waits — pick element on
  screen. Flows list shows pass/fail per step.
- **Replay** a flow on demand and **on every device** (device matrix); report
  N passed / M failed with the failing step + screenshot.
- A top scorecard: health %, passed/failed counts, run-all + export.

## Working-state lanes overlay
Surface the engine's current lanes (load / download / think / approvals-awaiting
/ generate / verify) as a live strip, each lane fed from the bus/recorder, so
the operator sees what the agent is doing at a glance.

## Done when
Any tape plays back with full transport controls; a recorded flow replays green
across the device matrix; the live lanes reflect real engine state.
