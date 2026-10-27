---
name: terminal-shell-scripting
intro: How to write and run shell/Python one-liners and scripts that work the first time on Thor — the exact mistakes that cost hours on 2026-10-27 and the habits that prevent them.
---
# Terminal, shell and scripting (bash · git · docker · python)

**Scripts**
- Start with `set -euo pipefail` (or `set -u` when you handle failures yourself). `bash -n file.sh` before shipping.
- Dry-run by default, `--apply` to act. Print what you will do, then do it, then print the result (`== step` headers).
- Idempotent: re-running must be safe (check state first, `mkdir -p`, `ln -f` to a temp then `mv -f`).
- A trailing `[ cond ] && cmd` returns 1 when cond is false and fails the script/chain: use `if …; then …; fi`.
- Never `cd` into a downloaded/untrusted dir and run an interpreter there; use `python3 -I` and pass paths as args.
- Wait for services with a bounded loop that also checks the process is alive (`kill -0 $PID`), never a bare `sleep N`.

**Quoting**
- Heredocs: `<<'EOF'` (quoted) so `$` and backticks stay literal; unquoted only when you want expansion.
- `python3 -c '…'` inside single quotes: no `\"` escapes inside f-strings (Python < 3.12 rejects backslashes in
  f-string expressions). Use `%` formatting or a heredoc `python3 - <<'PY'`.
- Expansions that should become env assignments: `env A=1 ${X:+B=$X} cmd` (prefix assignments don't expand).

**Git**
- Before push: `git pull --rebase origin <branch>`; on conflict `git rebase --abort` (never leave a half rebase).
- Append-only shared files (pipe/thread.md): never edit existing lines; real UTC stamps `date -u +%FT%T+00:00`.
- Stale "unpushed" alarms: `git fetch origin '+refs/heads/B:refs/remotes/origin/B'`.

**Docker**
- One-off maintenance on a service's volume: `docker compose run --rm --no-deps --entrypoint sh <svc> -c '…'`.
- Redis "Bad file format … AOF": stop redis, back up `appendonlydir`, `redis-check-aof --fix <manifest>`, start.
- `docker compose stop <svc>` keeps the container; `container prune` would delete it — never prune blindly.
- Config/env changes need `docker compose up -d --no-deps <svc>` (recreate); `restart` keeps the old env.

**Processes / ports**
- Know the port map before killing: `ss -ltnp | grep :PORT`. `fuser -k PORT/tcp` kills whatever holds it.
- Logs: run python with `-u` so logs are unbuffered; tail them on failure, never report "failed" without the tail.

**Disk**
- `df -h /` first when anything "mysteriously" fails (no logs, failed pulls, redis crash = disk full).
- Free only regenerable things (see disk-janitor); find the writer (`journalctl … | uniq -c | sort -rn`).

**Verify, don't assume**: every command you hand a human ends with the line that proves it worked
(a health check, a count, a sha). Never paste UI text into a shell; give one copyable block per step.
