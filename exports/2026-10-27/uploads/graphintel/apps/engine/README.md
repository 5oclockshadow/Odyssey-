# apps/engine — the agent behind The Threshold Institute

One DSPy ReAct agent on one Signature, one typed hypergraph, one priority queue. The company is `institute.yaml`. Everything the engine does is written into the graph it reasons over.

| file | what |
|---|---|
| `institute.yaml` | model, mission, seed core, tools, MCP servers, observe, sandbox, apps, heal, owner, day, reflect, research, publish, github |
| `signature.py` | the single Signature; output is a depth-two `Round` (reasoning first, then the graph deltas, then the answer and energy) |
| `round.py` | `round(intake, kind)`: slice → ReAct → merge; the `Graph` with two write paths (`merge` for rounds, `observe` for telemetry), Hebbian weights, nightly decay; `state/record.jsonl` |
| `tools.py` | `web_search` · `fetch_url` · `graph_query` · `run_tests` · `publish` (drafts to the outbox until enabled) · `sandbox_run` · `ship_app`; MCP loader |
| `observe.py` | OpenTelemetry → Phoenix; spans, logs and signed functions → graph; any error → incident |
| `heal.py` | incident → `locate()` through the graph → repair round → sandbox tests → pull request / live fix + relaunch / app rebuilt; owner actions |
| `sandbox.py` | docker-in-docker: `run` in 8 languages, `build`, `transfer`, `publish`, `ship`, `reconcile` every five minutes, `ensure_phoenix`, `ensure_images` |
| `reflect.py` | the `Q` table, `daily()` reflection, telemetry decay, tomorrow's plan, the scheduler |
| `day.py` | `compile()` the owner's day from the record, incidents, apps, outbox, graph, reflections; `act_post` |
| `auth.py` | owner password → signed session cookie; the `owner` dependency |
| `main.py` | the care loop: priority queue (chat 0 · contact 1 · repair 2 · ingest 3 · reflect 4 · research 5 · re-examine 7), workers, apps loop, flush loop, stdin chat |
| `serve.py` | FastAPI: `/round` `/graph` `/record` `/apps` `/event` `/health` · `/auth/login` `/auth/logout` `/auth/check` · `/owner/day` `/owner/act` `/owner/incidents` `/owner/sandbox` `/owner/ship` |
| `test_engine.py` | 41 tests; no model, no network, no docker |
| `fixtures/day.json` | the day the terminal replays when no engine answers; its shape is checked against `day.compile()` |

```
pip install -r requirements.txt
pytest -q
python main.py ../../research/notes.md     # terminal: stdin is chat, files are ingest rounds
uvicorn serve:app --port 8000              # the door; behind nginx it is /api/
```

Environment: `ANTHROPIC_API_KEY` (or the key for the model in the yaml), `OWNER_PASSWORD` or `OWNER_PASSWORD_HASH`, `SESSION_SECRET`;
`AGENT_DOCKER_HOST`, `WEB_DOCKER_HOST`, `PHOENIX_ENDPOINT`, `PHOENIX_PUBLIC`, `APPS_REGISTRY` are set by compose. Without docker the engine still runs: sandbox tools and repairs report unavailable, apps do not ship, spans stay in the graph only.
