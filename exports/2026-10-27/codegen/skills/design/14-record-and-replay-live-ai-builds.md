# Skill: Record and replay live AI builds

_Kiln skill · how every build becomes a replayable recording_

A recording is the build's full history, not a video: every chat turn, every tool step with its timestamp, and a snapshot of the files after each turn. Kiln replays it by scrubbing time.

## What gets recorded
- **Turns**: user messages and agent replies, with timestamps.
- **Steps**: each tool call (create, edit, build, test, type match, SOC 2, skill) with status, detail and time.
- **Versions**: a copy of every file after each turn that changed something (v1 first build, v2 iteration, …).
- **Reports**: the e2e check results that proved the build matched its template.

## Steps
1. Give every event a timestamp when it is created (`ts: Date.now()`), never after the fact.
2. After each agent turn, compare the files to the last snapshot; if anything changed, push `{ at, label, files }` to `versions`.
3. Persist the project (turns, steps, versions, report) to IndexedDB so recordings survive reloads.
4. To replay, collect all events in time order and expose a time cursor `t` from the first to the last event.
5. Render only events with `ts <= t`, and load the latest version with `at <= t` into the preview frame.
6. Play by advancing `t` faster than real time (8×) with a timer; scrubbing sets `t` directly.
7. Keep the recording read-only while replaying; exiting returns to the live project.

## Acceptance checks
- Replaying from the start shows the first user message alone and an empty preview.
- The preview switches to v1 exactly when the first build's step appears, then to v2 after the iteration.
- Scrubbing backwards removes later messages and restores the earlier preview.

## Prompt recipe
Add record-and-replay to a chat-driven builder. Timestamp every message and tool step on creation. Snapshot the project files after each turn that changes them. Persist turns, steps and snapshots. Build a replay bar with play/pause and a range slider over the recording's time span; render only events up to the cursor and show the latest snapshot before the cursor in the preview iframe.

## Pitfalls
- Snapshotting by reference: copy files (`JSON.parse(JSON.stringify(files))`) or later edits rewrite history.
- Missing timestamps on older events: fall back to sequence order with even spacing.
- Reloading the preview every frame: only swap the iframe when the active version changes.
