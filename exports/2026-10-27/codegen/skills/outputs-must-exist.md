---
name: outputs-must-exist
intro: A job is not done because the judge liked the text. It is done when the files it promised exist on disk, are non-empty, and match what the judge reviewed.
---
# Outputs must exist (anti "passed but saved nothing")

**Why this skill exists:** on 2026-10-26 the Tester merge plan "passed" twice (job9124d505, job5218595d) and saved zero files. The model returned markdown blocks without a file name, the writer skipped them, and the judge scored the chat text instead of the files. Nobody noticed until a human looked.

## Rules for every job
1. **Declare outputs up front.** Every task lists `expected_outputs` (paths relative to the workspace, or at least a count and extension). A task with no declared outputs is a question, not a build.
2. **Name every block.** Every code/markdown block the model returns must carry a file name (` ```md plan.md`). An unnamed block is an error the writer reports, never something it silently drops. If the model forgets, ask it again with the path spelled out; do not invent a name silently (the fallback name from the first heading is allowed only when it is logged as a warning).
3. **Post-condition check before "passed".** After the writer runs and BEFORE the judge scores:
   - every declared output exists, is non-empty, and was modified by this job (mtime after job start);
   - record path, size and sha256 of each file in the job's evidence;
   - if any check fails: job status = `failed: missing outputs` with the list. Never `passed`.
4. **Judge the files, not the chat.** The judge reads the saved files from disk (by the recorded paths/hashes). Text that only exists in the model's reply cannot earn a pass.
5. **Report with evidence.** The job summary shows `N files written` with paths and hashes. "0 files written" is always surfaced as a failure on the Board, in red.
6. **Same rule for candidates.** A release candidate whose diff is empty, or that contains only backup files (`*.bak*`), is rejected. Backups live in `state/bak/`, never in `app/`.

## Done-check for this skill itself
A test feeds the writer one unnamed block and one named block: the named one is saved, the unnamed one produces a logged error or a logged fallback name, and a job that declared an output that was never written ends `failed: missing outputs`.
