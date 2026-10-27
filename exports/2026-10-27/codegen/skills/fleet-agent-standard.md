---
name: fleet-agent-standard
intro: The contract every fleet agent meets — Gopher, Jarvis, OpsBot, Codegen, the testers, and anything new. Check a service against this list before calling it done; build new ones to it from the start.
---
# Fleet agent standard (gopher · jarvis · opsbot · codegen · testers)

| # | Requirement | How it is proven |
|---|---|---|
| 1 | `GET /health` → `{ok, version, model, …}` in < 1 s | curl it; compose healthcheck uses it |
| 2 | Local-first inference: Thor llama-server (GPU) or DMR first, fleet router as fallback, per-call deadline | route-health / smoke shows the order and p50 |
| 3 | One DSPy signature per job (docstring = rules, typed fields); prompt and parse go through DSPy | the program/adapter is in code; compiled demos load if present |
| 4 | Skills are typed functions that return text and never raise; no free-form shell | a test per skill; `catalog` endpoint lists them |
| 5 | Verifiable outputs: anything claimed carries evidence (tool output, sha256, ISO-8601 time) | reports have sha + created; verify step exists |
| 6 | Paths jailed to declared roots; host mounts read-only unless the job is writing | a test that /etc/passwd is refused |
| 7 | Graph memory: runs/events into the graph (Codegen API or own), Hebbian/Q-table where choices repeat | `/api/memory` or graph stats grow with use |
| 8 | Live view: SSE/streaming of steps; a pane in the Codegen workspace (CGPlugins view) | open it in a pane, watch steps live |
| 9 | Dockerized, `127.0.0.1` ports only, restart unless-stopped, state in a named volume, no docker.sock | compose file review |
| 10 | Tests: unit per skill + one end-to-end with DummyLM; release-tree safe (`importorskip` for peer packages) | full suite + warden tree both green |
| 11 | Skills/docs: a `skills/<agent>.md` with how to talk to it, endpoints, add-a-skill steps | file exists, intro is one sentence |
| 12 | Failure is loud: errors in the stream and the log with the cause; never silent retries forever | kill its model and watch it say so |
New agent checklist = copy Gopher's layout (config.py, skills.py, memory.py, agent.py, server.py, cli.py, static/).
