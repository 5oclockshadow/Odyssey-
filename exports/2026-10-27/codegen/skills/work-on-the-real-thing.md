---
name: work-on-the-real-thing
intro: The user wants live work on the real system, visible as it happens. No side copies, no stripped-down clones, no ops scaffolding in place of features. Learned the hard way on 2026-10-27.
---
# Work on the real thing

**What went wrong (2026-10-27)**: to "get going fast", a second copy of codegen was run from
/opt/odyssey on :9913. It had no warden, no mirror and an empty brain. Hours went into restart
scripts, pipes and disk tooling around that copy while the actual asks (UI, multi-shell,
multi-task) didn't move. The user saw a worse system and no features. Don't repeat it.

**Rules**
1. **One system**: production is `/opt/Krishna/codegen-v3` on :9903, with its warden, its state volume
   and its mirror. Changes reach it only as warden candidates (task → candidate → handshake → tests →
   approve → promote). Never stand up a parallel instance to work around something. Fix the thing.
2. **Features over scaffolding**: if the user asked for a feature, the next commit is that feature.
   Tooling (scripts, pipes, guards) only when it directly unblocks the feature, and kept to minutes.
3. **Live and visible**: do work as `/api/v3/tasks` jobs so it shows in the Board and the Now strip.
   One small task per job, an exact `expected_outputs`, a test, and a `done_check` the tester can run.
4. **Tester verifies**: after a candidate promotes, `POST :9904/tick` and report the tester's verdict
   (recorder stream at `:9904/recorder/stream`). Untested isn't done.
5. **Claude writes the spec, codegen writes the code**: precise tasks in `tasks/queue-*.json`,
   submitted with `scripts/submit_queue.sh`. Claude reviews the candidates' diffs and doesn't hand-patch
   around codegen.
6. **When the user is frustrated, stop and re-read the ask.** The most recent concrete ask is the work.
