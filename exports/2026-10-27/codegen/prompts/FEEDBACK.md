# Feedback loop — getting fleet results back to Claude ASAP

Goal: run on the fleet, push results here, Claude pulls and we debug. Cheap, fast, no guessing.

## What every service writes (standing convention)
- `<service>/README.md` — human-readable execution log (what ran, what passed/failed, decisions).
- `<service>/telemetry.json` — structured, ISO-8601 timestamps, pre- and post-run.
- Codegen also keeps `research/gap-scorecard.json` (eval). Tester serves its graph.

## The one-shot that sends Claude something to debug
From any fleet node with the repo + `ROUTER_BASE_URL` set:
```bash
cd codegen-v3
# 1) fast checks (no cloud needed; honest UNMEASURED if no models)
python -m pytest -q tests/test_eval.py 2>&1 | tee research/last-tests.txt
python -m app.eval baseline        2>&1 | tee -a research/README.md
# 2) smoke the router egress (proves local-first wiring)
curl -s "$ROUTER_BASE_URL/route-health" | tee research/route-health.json || true
# 3) ship results back
git add research/ && git commit -m "fleet results $(date -u +%FT%TZ)" \
  && git push origin claude/router-and-graph-rm
```
Then tell Claude "pulled" (or let git-valve notify). Claude pulls, reads `research/`, we debug.

## git-valve (optional two-way bus)
`Odyssey-/git-valve` is the two-way GitHub comms bus if you want automated round-trips instead of
manual push/pull. Not required for the first loop — plain push/pull above is enough to start.

## Order of operations (credit-mindful)
1. Point every app's LM client at the fleet router (`00-routing.md`) — one change, biggest cost win.
2. Run the one-shot above; push.
3. Claude pulls, triages the first reds (likely: router base not set, missing dep, a stale import).
4. Iterate in small pushes. Keep cloud calls off until local routing is proven.
