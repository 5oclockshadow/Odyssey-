---
name: release-convergence
intro: There are two codegen lines — the warden-promoted production release and the git branch Claude pushes to. Know which build you are looking at, and converge them through one gated release instead of letting them drift.
---
# Release convergence (learned 2026-10-27)

**What happened**: production (release `c1793003696-6b34`, :9903 on Thor) ran 18 h without any of
the git branch's ~30 commits. Its autonomy had been dead for 15 h. The user saw a "stale" console while
Claude's work was live on :9913. Same project, two lines, and no bridge between them.

**Know the build before judging it**
    for p in 9903 9913; do curl -s localhost:$p/api/v3/handshake; echo; done
`release` + `sha256` name the running tree. Signs of the branch build: a Claude ⇄ Codegen tab,
`candidates` in `/api/v3/route-health`, and autonomy "paused (backoff)" instead of "stopped".

**Converge, gated**
1. Branch green: tests pass, and thor-restart on :9913 is green.
2. Submit the branch head to the warden as ONE candidate (source=deploy). It builds, runs a
   throwaway container, and the handshake proves the exact tree hash.
3. A human approves in the Approval queue. Roll back stays one click away.
4. After promotion, self-rewrite candidates rebase on the new release. Never on the stale one.

**The one command**: `bash scripts/land_krishna.sh` (`--dry-run` first). It saves local changes,
fast-forwards the `/opt/Krishna/codegen-v3` working copy, then runs `scripts/deploy.sh`, so
production still changes only through the warden. `/opt/odyssey` is just the pipe's mailbox clone.

**Never**: copy files into `/opt/Krishna` or restart its containers by hand (that bypasses the warden), promote two parallel
lines, or let a self-rewrite "fix" something the branch already fixed. Check the branch log first.

**Report**: `RELEASE: prod <release> <sha12> · branch <sha7> · ahead <n> · action <submit|wait|none>`.
