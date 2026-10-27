# Plan forward (handoff, 2026-10-27)

Read this first. Each step has one command block and the line that proves it worked. Do them in order.
Branch: `claude/router-and-graph-rm` (repo `5oclockshadow/codegen-v3`). Production = `/opt/Krishna/codegen-v3` on Thor,
served at `localhost:9903`, changed only through the warden. Skills to load: work-on-the-real-thing,
terminal-shell-scripting, gopher, dspy-signatures-and-optimization, pc-reader-graph, release-convergence.

## State right now
- Production promoted release `c1793069874-c395` (all branch work up to 2ecd18f). Redis repaired.
- New on the branch, NOT yet on Thor: skills reach the model (20960ae), DSPy-driven think, Gopher service
  (gopher/ + Dockerfile.gopher + compose `gopher`), reader lane, `app/plugins/pcgraph.py`, 6 new skills, this plan.
- Tests: full suite green locally; warden release tree green (gopher/ and tester/ tests skip there by design).

## 1. Land the branch on production (warden-gated)
```bash
git -C /opt/odyssey fetch -q origin claude/router-and-graph-rm && git -C /opt/odyssey reset -q --hard origin/claude/router-and-graph-rm
cd /opt/Krishna/codegen-v3 && bash /opt/odyssey/scripts/land_krishna.sh
```
Proof: `result: promoting | running <new release>`. Then `curl -s localhost:9903/api/v3/pc/stats` returns `{"files": 0, …}`.

## 2. Start Gopher (web + terminal, whole PC read-only)
```bash
cd /opt/Krishna/codegen-v3 && docker compose up -d --build gopher && sleep 15 && curl -s localhost:9960/health
```
Proof: `{"ok":true,…,"skills":12…}`. Web: http://localhost:9960 · terminal: `docker exec -it gopher python -m gopher chat`.
Smoke in the terminal: `/run sha256 target=abc` → `ba7816bf…`; `/run timestamp`; then ask
`lint /pc/<some file>.py and write a report` → a report path + `verify_report` VALID.

## 3. Optimize Gopher's signature (DSPy)
In the Gopher console: `/optimize`, then `/status` until `state: done`. Proof: `before`/`after` scores; `compiled: true`
in /health. If `after` ≤ `before`, add golden items (gopher/optimize.py) for the failures you saw and rerun.

## 4. Reader lane: PC → graph
Check progress: `curl -s localhost:9960/api/reader` (read/sent/failed/top) and `curl -s localhost:9903/api/v3/pc/stats`.
If `failed` grows: the small model id is wrong → set `GOPHER_READER_MODEL` in `.env` to a model the router lists
(`curl -s 192.168.1.204:8776/v1/models`) and `docker compose up -d gopher`. Pause with `POST /api/reader/pause`.

## 5. Stop the stopgap
```bash
pkill -f "pipe/pipe.py"; fuser -k 9913/tcp
```
Optional: make Gopher answer the GitHub pipe (no copy-paste): in `/opt/odyssey/pipe/pipe.env` set
`CODEGEN_URL=http://127.0.0.1:9960` and `CODEGEN_THINK_PATH=/api/think`, then
`nohup python3 /opt/odyssey/pipe/pipe.py --repo /opt/odyssey > /opt/odyssey/pipe.log 2>&1 &`.

## 6. Next code work (one PR-sized step each, tests first)
1. **Codegen think optimization**: compile `StructuredSignature` with BootstrapFewShot on app/eval golden set →
   save `STATE_DIR/think_compiled.json` (think already loads it). Report before/after.
2. **Bare-bone**: remove `app/legacy.py` routes (UI uses none; move `setup_dspy` into llm.py; drop 5 lines in
   tests/test_api.py). Split `app/main.py` (1000+ lines) into routers < 300 lines so local models can edit it.
3. **Consolidate skills** to ~15 (merge pipe-*, retire thor-restart/odyssey-only ones after step 5).
4. **Multi-shell tab** is still not done (needs a design that keeps it safe on a localhost-only console).
5. **Gopher skills to add** (each = function + test + golden item): json_schema_validate, git_status (read-only),
   compose_ps (read-only docker), http_check(url), diff_files, csv_profile.

## 7. Codegen UI upgrade: flexible windows (Krishna's ask, 2026-10-27)
Goal: arrange the console like Claude's: every view is a pane you can split, resize, drag, tab, pop out, close.
- Layout engine: a small in-house split-tree in `static/plugins/layout.js` (no framework). A node is
  `{split: "row"|"col", sizes: [..%], children: [...]}` or `{tabs: [viewIds], active}`.
- Every existing view (Code, Graph, Brain, Data, Board, Connectome, Claude ⇄ Codegen) and every plugin tab becomes a
  dockable view. Drag a tab onto an edge of any pane to split there, or onto the middle to join its tabs.
- Splitters: 6px drag handles (pointer events, keyboard arrows for a11y), min pane 160px, double-click = equalize.
- Pane menu: maximize/restore, pop out (`window.open` of `/?view=<id>&solo=1`, same plugin renders full-window),
  close (view goes back to a "+ add view" list).
- Persist the tree in localStorage (`cg_layout_v1`, try/catch), plus 3 presets (Code+Chat, Graph+Brain, Ops:
  Board+Pipe+Connectome) and "Reset layout".
- Phone (<700px): the tree collapses to one tab strip; no splitting.
- Contract: views keep `render(el)`, but `el` is now the pane body. Re-render on resize via ResizeObserver
  (Monaco `layout()`, connectome canvas size). No timers per pane; the host's refresh stays.
- Tests: layout.js served, no setInterval, tree (de)serialization round-trips; Playwright: split, resize, reload
  restores the layout.

## Rules that matter
- Features over scaffolding; no parallel instances; everything to production through the warden.
- Every command you give the user ends with its proof line. Never ask them to paste UI text.
- `date -u` for timestamps; thread.md is append-only; pull --rebase before push; run the full suite before push.
