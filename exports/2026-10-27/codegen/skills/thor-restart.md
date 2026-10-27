---
name: thor-restart
intro: Bring codegen (:9913) and the Claude⇄codegen pipe back to a known-good state on Thor with one command, without losing data or a pending reply. Use when the pipe is silent, the clone is wedged, the build is stale, or after any push that changes app/ or pipe/.
---

One command does it. Never improvise the steps by hand.

    bash /opt/odyssey/scripts/thor_restart.sh            # sync to the branch + restart + verify
    bash /opt/odyssey/scripts/thor_restart.sh --no-pull  # restart only (config/env change)

## What it does (in order, stops at the first FAIL)
1. **Stop**: kills the pipe driver and whatever holds :9913.
2. **Sync**: saves `pipe/thread.md` to `/tmp/thread.local.<ts>.md`, aborts any half-done rebase or
   merge, then `reset --hard origin/<branch>`. Untracked files (`data/`, `*.log`, `pipe/pipe.env`)
   are kept. It prints `WARN local-only thread blocks` if a codegen reply never reached GitHub.
3. **DMR**: asks `localhost:12434/engines/v1/models`. DMR routes turn on only if it answers, with
   exactly the models it lists.
4. **Start codegen** on :9913 with writable `OUTPUT_DIR`/`STATE_DIR` and waits up to 30 s for
   `/api/health/live`.
5. **Verify build**: `/api/v3/route-health` must list `candidates`. If it doesn't, an old build is on
   the port (`FAIL old build`). The candidate list prints DMR first when DMR is up.
6. **Start pipe**: launches `pipe/pipe.py` and tails `pipe.log`.

## When to run it
- `pipe.log` shows `SYNC FAILED`, or git says "unmerged files" / "Pulling is not possible".
- The Claude ⇄ Codegen tab shows `waiting on codegen` for more than 5 min with a stale driver heartbeat.
- After Claude pushes changes to `app/`, `static/` or `pipe/` (running code doesn't hot-reload from git).

## Reading the result
- `OK codegen :9913 + pipe running` = green. Report: `RESTART: green — head <sha>, dmr <models|off>`.
- `FAIL fetch` = network or credentials on Thor (see pipe-and-fleet-check link 7).
- `FAIL codegen not up` = read the printed `codegen.log` tail. `PermissionError '/output'` means the
  env didn't apply.
- `FAIL old build` = something else owns :9913. Check `ss -ltnp | grep 9913`.
- `WARN local-only thread blocks` = re-append the saved reply to `pipe/thread.md` as a new block,
  then commit and push. Never edit an existing block.

## Never
- Edit existing blocks in `thread.md` (append only, real UTC timestamps).
- Touch `/opt/Krishna` or the ports :9902 (Krishna dashboard), :9903 (production), :9904 (tester).
- Paste UI text into the shell. Run only the command above.
