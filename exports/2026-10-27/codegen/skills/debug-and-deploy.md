---
name: debug-and-deploy
intro: The debugging and deployment playbook for the fleet — find the broken link fast, fix the root cause, ship through the warden, prove it live. Built from what actually broke on 2026-10-27.
---
# Debug → fix → deploy → prove

**Debug order (stop at the first broken link)**: disk (`df -h /`) → process up (`ss -ltnp | grep :PORT`, health) →
right build on the port (`/api/v3/handshake` sha) → dependencies healthy (`docker compose ps`: redis, warden) →
model route (`/api/v3/route-health`, route_smoke) → the request itself (logs with `-u`, the exact error line).
**Known causes → fixes**
- Nothing writes, logs empty, pulls fail → disk 100% → disk-janitor, find the writer.
- Redis "Bad file format … AOF" crash loop → back up appendonlydir, `redis-check-aof --fix <manifest>`.
- Warden candidate "1 error" before tests → a test imports a package releases don't ship → `importorskip`.
- UI "X is undefined"/blank panes → old build on the port, or a CSS class collision → namespace classes.
- Think hangs → per-route deadline + failover; check the model server's slots/ctx.
**Deploy**: tests (full + warden release tree) → push → `land_krishna.sh` (fast-forward working copy → warden
candidate → handshake → its pytest → promote) → `docker compose up -d --no-deps <svc>` only for env changes →
peer services (`gopher`) via `docker compose up -d --build gopher`.
**Prove**: health + one real request + the screenshot/metric that shows the change. Rollback: Brain → Roll back.
**Never**: patch production by hand, run a second copy "to test", or report done without the proof line.
