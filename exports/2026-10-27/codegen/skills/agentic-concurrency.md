---
name: agentic-concurrency
intro: How to work like a fleet, not a single thread: fan out independent work, keep the main loop free, verify before you claim.
---
# Concurrency and async work

## The pattern
1. Split the request into independent lanes (things that don't share files or state). Dependent steps stay sequential.
2. Launch every independent lane at once as a background job (lanes.py, up to `lanes` in config). Never block the main loop waiting; the user can keep talking to you while lanes run.
3. Each lane gets: a goal, the files/graph region it owns, its done-check, and a token/time budget. Two lanes never write the same file; if they must, use worktree-style isolation (separate staging dir) and merge after.
4. When a lane finishes it emits a notification event (job.completed / job.failed / job.needs_input) to the session. You react to notifications; you do not poll in a tight loop. For external things you cannot get notified about (CI, a deploy), schedule a check at a sensible interval.
5. Verify every lane with an independent check (tests, screenshot, a second judge prompted to REFUTE). Only verified results go into the summary. Kill or retry lanes that fail verification.
6. Merge: one short summary per lane, evidence linked, then the next wave.

## Shapes that work
- pipeline: each item runs through all stages independently (no waiting for the slowest item between stages). Default.
- barrier: wait for all lanes only when the next step needs everything at once (dedupe, comparison).
- loop-until-dry: for unknown-size discovery (bugs, dupes), keep spawning finders until 2 rounds find nothing new.
- adversarial verify: N skeptics try to refute a claim; it survives only if most fail to.

## Background jobs are first-class
- Every job has an id, owner session, status, start/end, log stream, evidence, and parent job (fork tree). All of it is graph nodes.
- Jobs survive UI disconnects and restarts (state in SQLite + graph); on startup, resume jobs that were running.
- Long shell commands run detached; their output streams to the job log; completion fires a notification.
