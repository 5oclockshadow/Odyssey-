---
name: codegen-usage
description: Drive Codegen v3 on Thor (localhost:9903) - sessions, model switch, live edit + preview, Loop mode (generate → judge → retry), MCP CRUD, Graph/Brain/Data views, autonomy YAML + error-driven mode, the approval queue and release swap/rollback, GitHub ingest and the R720 mirror, all via the UI or curl. Use when asked to "use codegen", "generate an app with codegen", "deploy codegen", "approve/roll back a codegen candidate", "ingest my GitHub into codegen", or to check codegen's graph/brain state.
---

# Codegen v3: how to drive it

Codegen v3 lives in `/opt/Krishna/codegen-v3` on Thor and runs as the compose project `codegen-v3`. Open the UI at **http://localhost:9903/**.
Host :9902 belongs to Nucleoi, so v3 maps 9903→9902. Codegen v2 keeps running on :9901 as a fallback.
Every LLM call goes through the fleet router `http://192.168.1.204:8776/v1`. Never call a model directly.

## 0. Check it is up
```bash
cd /opt/Krishna/codegen-v3
docker compose ps                                    # codegen-v3, -warden, -redis, -phoenix
curl -s localhost:9903/api/health | python3 -m json.tool   # router ok?, graph store=redis, role=prod
curl -s localhost:9903/api/v3/handshake              # which release + tree sha is running
```
If the router answers but chats hang, probe which models actually reply:
```bash
for m in pin/forgiveness/qwen3:14b-64k pin/radha/qwen3:4b-instruct-2507-q4_K_M; do
  curl -s -m 60 192.168.1.204:8776/v1/chat/completions -H 'Content-Type: application/json' \
    -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":5}" | head -c 120; echo; done
```
On 2026-10-25 only the `pin/...` routes answered. That is why the default model in `config.yaml` is the forgiveness pin.

## 1. Sessions, model switch, chat (UI: left rail → Sessions, top bar → model)
```bash
B=localhost:9903
SID=$(curl -s -XPOST $B/api/v3/sessions -H 'Content-Type: application/json' -d '{"title":"My task"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -s -XPATCH $B/api/v3/sessions/$SID -H 'Content-Type: application/json' -d '{"model":"pin/radha/qwen3:4b-instruct-2507-q4_K_M"}'
curl -N -XPOST $B/api/v3/sessions/$SID/chat -H 'Content-Type: application/json' \
  -d '{"content":"Write a FastAPI hello endpoint","files":["apps/x/main.py"]}'   # SSE: meta, data:{delta}, done
curl -s $B/api/v3/sessions/$SID          # messages + generations (persisted in SQLite, survive restarts)
curl -s $B/api/v3/models                 # router models + pins, "suggested" = best Q-value
```
Each chat also does the following:
- It pulls related graph nodes into the prompt; the meta event lists them.
- It coactivates those nodes (Hebbian learning).
- It updates the Q-table for the model.
- It writes an `event:chat` node linked to the session and the model.

## 2. Live edit + preview (UI: Files tab, editor, Preview / Live buttons)
- Ctrl+S saves; **Live** saves as you type and reloads the preview. HTML, Markdown and images render in the sandboxed iframe.
- **History** lists every saved version, with restore.
```bash
curl -s -XPUT $B/api/v3/file -H 'Content-Type: application/json' -d '{"path":"apps/demo/index.html","content":"<h1>hi</h1>"}'
curl -s "$B/api/v3/file/versions?path=apps/demo/index.html"
curl -s -XPOST $B/api/v3/file/restore/12
open http://localhost:9903/preview/apps/demo/index.html
```
The workspace is `/opt/Krishna/codegen-output`, shared with v2.

## 3. Loop mode: generate → judge → retry (UI: composer → **Loop**, set "save to")
The judge checks Python compile, `node --check`, HTML structure, inline module scripts and importmap JSON. A failed verdict goes back to the model as critique. After the tries run out, the outer loop switches strategy: the next model by Q-value, more graph context, and a plan first.
```bash
curl -N -XPOST $B/api/v3/loop/run -H 'Content-Type: application/json' -d '{
  "goal": "'"$(cat /opt/Krishna/codegen-v3/demo/prompt_store.txt | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read())[1:-1])')"'",
  "models": ["pin/forgiveness/qwen3:14b-64k"], "save_to": "apps/store", "max_tokens": 12000,
  "files": ["broadcaster-src/Broadcaster.dc.html"]}'
```
The stream sends `event: step` (outer / generate / runtime / runtime-result / verdict / error), then `event: done` with `{passed, model, attempts, saved}`.

**Runtime judge + acceptance checks:**
- HTML attempts run headless (user unit `codegen-v3-runcheck`, `runcheck/runcheck.py`), and console errors fail the verdict.
- Add `"checks": [{"name","js","changes"}]` to assert behaviour in the live page. In the UI, the "checks" field takes a JSON file in the workspace, for example `checks/store.json` or `checks/broadcaster.json`.
- Ask the app to expose `window.__app` so checks can read its state.
- `"changes": true` samples the value twice; it must differ (something moves, a counter grows).
Worked examples from the demo: `demo/prompt_store.txt` (three.js store) and `demo/prompt_broadcaster.txt` (Broadcaster fix-up). The results are in `/opt/Krishna/codegen-output/apps/`.

## 4. MCP CRUD (UI: left rail → MCP)
```bash
curl -s -XPOST $B/api/v3/mcp/servers -H 'Content-Type: application/json' \
  -d '{"name":"filesystem","config":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem@2025.8.21","/output"]}}'
curl -s -XPOST $B/api/v3/mcp/servers/filesystem/start
curl -s $B/api/v3/mcp/servers/filesystem/tools
curl -s -XPOST $B/api/v3/mcp/servers/filesystem/call -H 'Content-Type: application/json' -d '{"tool":"list_directory","arguments":{"path":"/output"}}'
curl -s -XDELETE $B/api/v3/mcp/servers/filesystem
# Codegen itself as an MCP server (streamable HTTP): tools list_files, read_file, write_file, generate, list_sessions
curl -s -XPOST $B/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Secrets in `env`/`headers` come back as `***`. Sending `***` back on an update keeps the stored value.

## 5. Graph / Brain / Data (top bar views)
- **Graph:**
  - Concentric orbs: the agent itself on the inner ring, activity in the middle, GitHub knowledge outside.
  - Pink edges are Hebbian. Search uses recall.
  - Clicking a node shows its detail. **Open in editor** works for `ws:`, `code:` (Codegen's own source, read-only) and `file:` (from the R720 mirror).
- **Brain:**
  - The approval queue, with approve / reject / roll back.
  - The consciousness field and lane strip.
  - Q-table, routing stats, judge verdicts, lessons, errors.
  - The autonomy YAML editor.
- **Data:** GitHub ingest progress, mirror counts and the repo table ("Clone fully"), sessions, generations, the ledger (chain-verified) and events.
```bash
curl -s "$B/api/v3/graph/stats"; curl -s "$B/api/v3/graph/recall?q=warden+rollback&k=5"
curl -s "$B/api/v3/graph/node?id=self:codegen"; curl -s "$B/api/v3/graph/analyze/pagerank?top=10"
curl -s "$B/api/v3/events?kind=error&n=20"; curl -s $B/api/v3/brain/summary; curl -s $B/api/v3/data/summary
curl -s $B/api/v3/lanes; curl -s -XPOST $B/api/v3/lanes/run/raptor     # run a maintenance job now
curl -s $B/api/v3/ledger/verify
```

## 6. Releases: candidate → handshake → approval → swap / rollback
Production runs `releases/current`, a symlink. The warden service owns the swap.
```bash
scripts/deploy.sh "what changed"            # working copy -> candidate -> verify -> approve -> promote (watched)
scripts/deploy.sh --build "deps changed"    # rebuild the image first (requirements or warden code changed)
curl -s $B/api/v3/rewrite/status            # candidates, history, warden ledger
curl -s -XPOST $B/api/v3/rewrite/propose -H 'Content-Type: application/json' -d '{"files":{"app/x.py":"..."},"reason":"..."}'
curl -s -XPOST $B/api/v3/rewrite/agent -H 'Content-Type: application/json' -d '{"instruction":"In app/tracing.py add enabled()","model":"pin/forgiveness/qwen3:14b-64k","max_files":1}'
curl -s -XPOST $B/api/v3/rewrite/approve/<candidate-id>     # owner only (UI button)
curl -s -XPOST "$B/api/v3/rewrite/rollback?reason=bad+release"
```
A candidate is promoted only if it passes all of the following:
- a health check
- `GET /api/v3/handshake?nonce=N`, which must prove the exact tree SHA
- its own `pytest -q tests`, run inside the candidate container

Production is watched for 45 s after promotion. Any failure rolls back. The watchdog also rolls back after 3 failed health checks.

## 7. Autonomy (Brain → Autonomy)
The config file is `/state/autonomy.yaml` inside the container. It is hot-reloaded and can be edited in the UI.
```yaml
enabled: true
mode: error        # auto | error | off   (bare `off` is fine; YAML reads it as false and Codegen maps it back)
goals: ["rewrite: add docstrings to app/judge.py"]
scope: {include: ["app/**","static/**","tests/**"], exclude: ["app/legacy.py"]}
allowed_actions: [propose, apply_small, run_tests, generate]
budgets: {llm_calls_per_hour: 12, candidates_per_day: 6}
stop: {max_consecutive_failures: 3, until: null}
schedule: {interval_s: 900, window: "00:00-23:59"}
```
```bash
curl -s $B/api/v3/autonomy/work?run_tests=true     # what error-driven mode would fix (tests, errors, git diff, test diff)
curl -s -XPOST "$B/api/v3/autonomy/tick?force=1"    # run one cycle now
```
Error-driven mode proposes candidates. Small verified fixes may be copied into the working copy, with backups in `.wip-backups/<id>`. Promotion always waits for approval in the UI. The optional `APPROVAL_WEBHOOK` env (for example a Telegram relay) sends a notice when a candidate is ready.

## 8. GitHub ingest and the R720 mirror
- The token is `~/.secrets/github.env`, mounted read-only as a compose secret. It is never placed in env and never printed.
- Ingest is read-only: REST GETs, GraphQL queries and clones only.
```bash
curl -s -XPOST $B/api/v3/ingest/github -H 'Content-Type: application/json' -d '{"deep_top":0}'   # resumes from checkpoint
curl -s $B/api/v3/ingest/github             # tier1 own/starred counts, rate remaining
curl -s $B/api/v3/mirror/status             # R720 mirror counts, free GB, alert
curl -s -XPOST $B/api/v3/mirror/sync        # pull changed files into the graph now (also every 10 min)
curl -s -XPOST "$B/api/v3/mirror/clone-full?repo=owner/name"
ssh r720 'systemctl status github-mirror-api github-mirror-sync.timer; python3 /opt/github-mirror/mirror.py status'
```
Mirror policy:
- Owned repos: full history.
- Starred repos ≤500 MB: `--depth 1`.
- Larger repos: sparse (status `skipped-size`).
- The disk guard stops cloning below 25 GB free.

Thor reaches the mirror through the user unit `codegen-v3-mirror-tunnel` (docker0 172.17.0.1:9931 → R720 127.0.0.1:9930).

## 9. Tracing and tests
- Phoenix: http://127.0.0.1:6016, project `codegen-v3`. Chat spans are LLM spans; dual-loop spans are CHAIN spans.
- Tests: `cd /opt/Krishna/codegen-v3 && python3 -m pytest -q tests`. For the mirror: `python3 -m pytest -q mirror/test_mirror.py`.

## Rules
- LLM access goes only through router :8776. Forgiveness :5000/:5001 is never touched.
- Thor's shared redis is never written to.
- Back up before overwriting.
- Promotion needs the owner's approval, except for operator deploys the owner asked for.
