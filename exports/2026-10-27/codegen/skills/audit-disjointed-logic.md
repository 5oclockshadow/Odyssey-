---
name: audit-disjointed-logic
intro: A read-only method for finding logic that doesn't connect — callers bypassing the shared path, contracts each side reads differently, defaults pointing at the wrong thing, state that never resets. Found 9 real bugs in one pass on 2026-10-27.
---
# Auditing for disjointed logic

Trace a path end to end before judging any piece of it. For each subsystem:

1. **One source of truth?** Grep every caller of the decision (`router.select`, candidate lists,
   config defaults). Any caller that builds its own version is a bug. dual_loop skipped DMR this way.
2. **Contract both sides.** Read the host and the plugin, the producer and the consumer. Ask what the host
   assumes (re-calls render) and what the plugin assumes (called once). That mismatch stacked timers.
3. **Inputs counted fully?** A budget or fit check must include everything sent (prompt + context +
   reply), not just one term.
4. **Every outcome recorded?** Success and failure both feed health, Q-table and events. A path
   that never calls `learn` never improves.
5. **Defaults point at the right thing?** Ports, URLs, model ids. The pipe defaulted to :9902,
   which is another service.
6. **Can it wedge?** For every loop, ask what happens after a failure: a half-done rebase, an
   unpushed commit, a "stopped" state with no resume. Each needs a self-heal or a visible alarm.
7. **Configured but never triggered?** List lanes, jobs, env flags. Find which never fire, and why.
8. **Truth surfaces honest?** Status endpoints must show effective values (merged config), not
   the code constants.

**Output**: a table `# | file:line | problem | fix`, ranked by user impact. Fix the small, local
ones in one commit. Propose the rest. Don't run heavy tests on the user's box to "check". Read.
