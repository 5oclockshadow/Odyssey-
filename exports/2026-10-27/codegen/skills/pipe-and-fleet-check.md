---
name: pipe-and-fleet-check
intro: Diagnose the Claude⇄fleet pipe and codegen's own liveness on Thor before anyone has to. Check in order, stop at the first broken link, report it in one line with the fix.
---

The pipe is: Claude appends `## claude` to `pipe/thread.md` → `pipe/pipe.py` (on Thor) pulls →
POST `/api/v3/think` here → appends `## codegen` → commits → pushes. When it "looks stuck", walk the
chain in this order and name the first link that fails. Never guess; read the evidence.

## The chain (check in order)
1. **Am I up?** `GET /api/health/live` → `{"ok":true}`. If not: read the tail of `codegen.log`.
   Known cause on bare metal: `PermissionError: '/output'` — set `OUTPUT_DIR` / `STATE_DIR` to
   writable paths (e.g. `/opt/odyssey/data/{output,state}`); `/output`, `/state` are Docker paths.
2. **Right port?** Thor ports: `:9902` = Krishna dashboard (not codegen), `:9903` = old master
   codegen (no `/api/v3/think`), `:9904` = tester, `:9901` = other. This build runs on `:9913`.
   Confirm `/openapi.json` lists `/api/v3/think`.
3. **Router reachable?** `GET /api/v3/route-health` → `router_ok: true` (fleet router
   `192.168.1.204:8776/v1`). If false, every think will fail or hang — report the router, not me.
4. **Think in flight or done?** uvicorn logs a request only when it *completes*. Seeing
   `route-health 200` but no `POST /api/v3/think` line means the model is still generating
   (Thor `qwen3-coder-30b`, up to ~1100 tokens, can take 1–3 min; pipe timeout 300 s). That is
   waiting, not stuck. Only call it stuck past `PIPE_TIMEOUT`.
5. **Reply written?** `tail pipe/thread.md` — a new `## codegen <iso>` block = think returned.
6. **Committed?** `git log -1` shows `pipe: codegen reply …`.
7. **Pushed?** `git status -sb` ahead of origin + the pipe process not returning = `git push` is
   blocked on credentials (HTTPS clone). Fix: `git remote set-url origin
   git@github.com:5oclockshadow/codegen-v3.git` (or `gh auth login`), then push.

## Config gotchas already hit
- `thread.md` is **append-only**. Editing an existing block (even a header timestamp) while a reply
  commit is local makes the driver's `pull --rebase` conflict. Before this fix that wedged the clone
  ("Pulling is not possible because you have unmerged files") and the pipe went silent. The driver now
  aborts the rebase and logs `SYNC FAILED`. Recovery: `git rebase --abort; git reset --hard origin/<branch>`.
- Headers carry the real UTC time (`date -u +%FT%T+00:00`). KPIs are computed from them.
- `pipe/pipe.env` values must not carry inline `# comments` (the driver now strips ` #…`, but keep
  comments on their own lines).
- `pipe/pipe.env` is gitignored — keys never go in a commit.

## Report format (one line, then the fix)
`PIPE: <link #> <name> — <evidence> → <fix>` e.g.
`PIPE: 4 think in flight — route-health 200 at 14:21:04, no POST yet → wait; model generating.`
If all seven pass: `PIPE: green — reply <sha> pushed in <secs>s.`

## Latency to record (feed the audit)
health p50, route-health ms, think wall seconds, commit→push seconds. Append to
`research/README.md` so `scripts/thor_audit.py` trends them.
