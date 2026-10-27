---
name: smooth-shutdown
intro: How to stop or hand over a running, self-improving agent (Institute, Broadcaster, Jarvis...) without losing its work: observe, let it finish or drain, checkpoint, then stop. Never kill mid-write.
---
# Smooth shutdown of a self-improving agent

Another agent's process (e.g. Institute's own audit/self-improvement loop on R720) is someone else's work in progress. Default: **let it finish**. Stopping it is an approval item for Krishna unless it is clearly harming something.

1. **Observe first (read-only):** container/process status, current task, last log lines, whether it is mid-write (graph save, patch apply), queue depth. Report what it is doing.
2. **Prefer finishing:** if it is in a bounded task, wait for the task boundary. Record the end state.
3. **If it must stop (approved):**
   - ask it to stop at the next boundary (its own pause/drain endpoint or flag file) rather than killing;
   - wait for the in-flight write to complete (atomic save finished, no temp files left, previous version kept);
   - checkpoint state (graph, queue, last round) and record sha256 of the saved files;
   - stop with the service manager's graceful stop and a timeout long enough for the save (never SIGKILL during a save; a 15 s TimeoutStopSec once cost 936 graph nodes);
   - verify after: files valid, previous version present, no temp files.
4. **Hand-over:** if its work continues elsewhere (e.g. moved into Codegen as tasks), list what it had queued and import it as tasks, so nothing is silently dropped.
5. **Restart path:** document how to resume it and confirm it loads the checkpoint (and falls back to the previous version) before calling the shutdown done.
