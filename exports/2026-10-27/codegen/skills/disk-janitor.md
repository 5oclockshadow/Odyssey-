---
name: disk-janitor
intro: Keep Thor's disk from filling (it hit 100% / 0 bytes on 2026-10-27 and took codegen, git and the pipe down). Free only regenerable, non-critical things automatically; report everything else for a human.
---
# Disk janitor

**Automatic**: lane `disk-guard` (every 10 min, priority 2) runs `scripts/disk_janitor.sh --apply`
when free space on `/` < `DISK_GUARD_MB` (default 5120) and writes a `disk` event (or `alert` if it is still low).
Manual: `GET /api/v3/disk` (dry-run report), `POST /api/v3/disk/clean` (tier 0 now).
With codegen down: `bash /opt/odyssey/scripts/disk_janitor.sh` (dry run), then `--apply`.

**Tier 0: delete automatically (regenerable)**: docker build cache, dangling images, the
`docker/model-runner:latest-cuda` image (can't run on Thor's Jetson driver), pip/uv/npm/go/yarn
caches, `__pycache__` in /opt/odyssey, codegen/pipe logs over 200MB (trimmed to the last 20MB), `*.incomplete`
downloads older than a day, and with passwordless sudo: rotated `/var/log` files (`*.1`, `*.gz`, `*.old`),
the journal above 500M, and the apt cache.

**Log spam is a root cause, not a cleanup.** 2.3G of journal accumulated in hours on 2026-10-27. Find the
source: `journalctl --since -1h -o cat --output-fields=SYSLOG_IDENTIFIER | sort | uniq -c | sort -rn | head`.
Report it and fix it; don't just keep vacuuming.

**Tier 1: report only, never delete**: docker volumes (they hold redis/phoenix/warden/state),
stopped containers (includes the stopped production `codegen-v3`), model files (`*.gguf`, HF cache,
DMR store), warden releases (prune through the warden so rollback stays valid), anything in
`/opt/Krishna`, `state/`, `.git`, and user files.

**Dedupe (safe, run when tier 0 is not enough)**: `bash scripts/dedupe.sh` (report) / `--apply`
hardlinks byte-identical *immutable* big files (gguf, safetensors, ollama blobs, archives) so every path keeps
working and the bytes are stored once. It never touches databases or state (phoenix.db, *.vscdb, json), because
a write through one link would change the other.

**When tier 0 is not enough**: post the tier-1 list (largest files > 5G, volume and container
sizes) to the user with a one-line recommendation each. Do not escalate on your own. A deleted model
is a multi-GB re-download, and a deleted volume is lost state.

**Report**: `DISK: <free>MB free · tier0 freed <n>MB · tier1 top: <path size>, …`.
