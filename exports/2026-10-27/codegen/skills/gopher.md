---
name: gopher
intro: Gopher is the fleet's DSPy utility agent (web :9960 + terminal). Use it as hands on Thor — hashing, timestamps, linting, file reading/search, reports, Codegen recall/tasks, Anthropic spend — and as the reader that maps the whole PC into the graph.
---
# Gopher

**Talk to it**: web `http://localhost:9960` (console = same commands as the CLI) · terminal
`docker exec -it gopher python -m gopher chat` · one-shot `python -m gopher ask "…"` · skill `python -m gopher run sha256 target=abc`.
**API**: `POST /api/ask {task}` (SSE steps) · `POST /api/skill/<name> {args}` (no LM, exact) · `POST /api/think`
(pipe-compatible: point `pipe/pipe.env` CODEGEN_URL at :9960, CODEGEN_THINK_PATH=/api/think) · `/api/memory` ·
`/api/optimize` · `/api/reader` (+ `/api/reader/pause|resume|crawl|tick`) · `/health`.
**Skills** (fixed-purpose, verifiable, paths jailed to /pc, /workspace): sha256 (+expected → MATCH/MISMATCH),
timestamp (now / VALID / INVALID), lint (.py ruff · .json · .yaml · .sh · .js), read_file, list_dir, search,
write_report (sha256 + created header) → verify_report (VALID/TAMPERED), codegen_recall, codegen_task, anthropic_usage.
**Brain**: one DSPy signature `GopherTask(task, hints → answer, evidence)` run by `dspy.ReAct`; graph memory gives
`hints` (Q-table per task kind + Hebbian skill→skill chains). `/api/optimize` = BootstrapFewShot on a golden set
whose answers skills can prove; the compiled program is loaded on every run.
**Autonomy**: drop a task as `.md`/`.txt` into `<state>/inbox` → result JSON in `inbox/done/`. Reader lane runs always.
**Add a skill**: a typed, documented function with `@skill` in gopher/skills.py that returns text and never raises,
+ a test in tests/test_gopher.py, + a golden example in gopher/optimize.py if its answer is checkable.
