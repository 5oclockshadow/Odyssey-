# Changelog

## 0.4.1 — the loop closes

- **Replies become files.** Every brief and failure message asks for `--- file: <path>` … `--- end` blocks; `factory.take_files` and `RepoFactory.take` (same rules) lay them over TESTER's draft, the repo turns *built*, and the next round verifies it. Before, SEXTANT's answer was only shown in the feed and nothing could reach *built*. A reply can also be pasted in the Build Room (`POST /build/reply/{id}`), so the outbox is no longer a dead end.
- **One model of a repo.** The committed copy (`repos/<id>`) with TESTER's draft (`state/build/repos/<id>`) laid over it, in the container and in the tab. Tests run in `state/build/run/<id>`, never inside the repository; the README link fix goes to the draft instead of whichever copy was found first. A repo whose files change, from any writer, is verified again. *Briefed* holds until something is written (it was overwritten by *failing* in the same round). With `TESTER_EDIT=on` a passing repo's changed files are written, existing repos included; `BRIEF.md` never is.
- **SEXTANT's door.** TESTER signs a five-minute build token with the shared `SESSION_SECRET` for the engine's new `POST /builder/say` (`auth.builder`), which opens that route and no other. `SEXTANT_TOKEN`, an owner session that expires after twelve hours, is only the fallback.
- **The room and the container agree.** In container mode Build now, Reset and Download act on the server (`POST /build/repo/{id}`, `POST /build/reset`, `GET /build/files/{id}`), and walks merge by time instead of being overwritten by the next poll. README links come from `repos/registry.json` `links` for both, with `INSTITUTE_SITE` / `INSTITUTE_GRAPH` overriding in the container. Audit proposals close when their condition clears. `qa.run_journeys` reports each journey's time as `e2e.js` does, so slow-journey proposals work in the container. The settings separate the TESTER token from the owner session.
- **Restarts.** `BUILD_AUTOSTART=resume`, the default, restarts a run the container stopped in. `status.json` is written atomically, and a walk where nothing ran no longer counts as clean.
- **The repos are TESTER suites.** `checks.repo_suites` finds every `repos/<id>/tests/test_*.py` in the graph, and `pytest_suites` runs tests kept in `tests/`. It had skipped the three cores, and `tester.yaml` no longer lists repos by hand.
- **The ladder has a floor.** When nothing below passes, the top rung's answer stands with `unchecked` naming the check it failed, instead of a 503 (an honest "the graph is silent" failed the refusal check). Tenants see `unavailable` for a rung that errored, never its address. `RUNG_TOP` names the configured model's rung, and a test ties `RUNG_PRICE` to the ladder.

## 0.4.0 — the ladder is code, and the Build Room runs in the container

- **Rung router** (`apps/engine/rungs.py`): the substrate ladder as code. `/v1/ask` now asks the cheapest rung first — the published graph with no model, then any OpenAI-compatible server named in `RUNG_SERVERS` (`lstm=http://lstm:8000#model,8b=…`), then the configured model — keeps the first answer that passes the checks (length, no refusal, a cited node id for scholars), rests a rung that errors for a minute, and meters the call at the rung that answered. The response names the rung and what each lower rung said. Six tests, no network.
- **Build loop, server-side** (`apps/tester/build.py`, `factory.py`): the Build Room's loop runs in the TESTER container — plan, pack from sources, the six-check bar, pytest or node --test in a subprocess, Playwright journeys through the site, routing to SEXTANT (`POST /owner/say` via `SEXTANT_URL` + `SEXTANT_TOKEN`, else the outbox) or TESTER's agent, audit to improve, and a record per round; stops at the target or after three clean walks with every repo passing. `GET /build`, `POST /build/start|stop`, `GET /build/rounds`; `BUILD_AUTOSTART=on` starts it at boot. With `TESTER_EDIT=on` passing repos land in `repos/` and the registry's statuses follow. TESTER makes one fix by itself: README links follow `INSTITUTE_SITE`. Eight tests, no network, no docker.
- **Build Room** (`apps/tester/Build Room.dc.html`): in container mode the room drives and mirrors the server loop instead of running in the tab.
- **Three research cores** (`repos/seed-gen`, `anima-harness`, `lstm-substrate`), `repo-factory.js`, `e2e.js` + `e2e/journeys.json` (also run by `qa.run_journeys`), and the institute site (`apps/web/src/Platform.dc.html`) on the Studio pick.


## 0.3.0 — read-only agent, MCP hub, Redis, autonomy, mindful posting

- **Read-only self**: the agent's code is baked into a root-owned image on a read-only filesystem; it writes only to `/state`. New tools `list_source`, `read_source`, `plan_upgrade`. Repairs and approved upgrades are tested in the sandbox and become pull requests through the GitHub API; the live-apply mode is gone.
- **MCP hub** (`apps/mcp-hub`): one server in front of filesystem (read-only repo), GitHub, Slack, Wolfram, Apify, fetch, sequential thinking, plus terminal and time; the agent installs, updates and removes servers itself through the registry. Writes to the repository and to Slack are denied there.
- **Inside agent-dind**: Phoenix, Redis and the hub are started by the engine at boot. Redis holds dedupe keys, post counters and pending work, which survives restarts.
- **Autonomy**: `drive` rounds, `watch` feeds, a seeded charter, five goals and six open questions as core nodes, the agent's own source as nodes in the graph, hungrier research (30 s).
- **Mindful posting**: one gate for X, LinkedIn, Slack and Reddit; Slack added.
- **Compose**: four top-layer containers, hardened (`no-new-privileges`, dropped capabilities, read-only agent root, limits, health checks, log rotation, an init step for volume ownership).
- **Terminal**: workspaces Today, Incidents, Upgrades, Ships, Sandbox, Research, Publish, Graph.
- **Report**: `research/reports/Landscape 2026.dc.html`.

## 0.2.0 — the graph observes itself, repairs itself, ships, and the owner gets a terminal

**Topology** — two containers on the top layer, `web` and `agent`, each with its own docker-in-docker. `web-dind` runs every app the agent ships (`/a/<port>/`); `agent-dind` runs sandbox code in eight languages, the repair image and Phoenix. nginx serves the site, proxies `/api/` to the agent on the same origin, and routes to apps by port. The repository is bind-mounted into the agent so state persists, git is available and live fixes land on disk.

**Observe** (`observe.py`) — OpenTelemetry to Phoenix plus a span processor that writes every span into the graph as a node with `in_trace`, `child_of` and `span_of` edges; a log handler that writes every log line as a node `logged_by` its function; `@signed` runtime code signatures that make every function a `code` node `defined_in` its file; process, asyncio and log hooks that turn any error into an incident.

**Heal** (`heal.py`) — incidents are nodes `raised_by` code; `locate()` walks the graph to the source, the trace and earlier patches; a `repair` round (same Signature) returns a diff; the sandbox tests it; then a pull request, a live fix with relaunch, or an app rebuilt and relaunched. Dedupe, attempt cap, owner actions (approve/merge, close, retry, mute).

**Sandbox** (`sandbox.py`) — run files in python, node, typescript, go, rust, bash, ruby or c with no network; build app images; move them to the site's daemon; run, health-check, register; reconcile every five minutes (ship the queue, relaunch what stopped); start Phoenix; build the repair image. Two new tools for the agent: `sandbox_run`, `ship_app` (tests required).

**Reflect** (`reflect.py`) — a Q-table over repair strategies, research topics and drafts; the nightly reflect round; telemetry decay and pruning; tomorrow's plan.

**Owner** (`auth.py`, `day.py`, `Threshold Terminal.dc.html`) — password login through the site with a signed cookie; `GET /owner/day` compiles the day from the record, incidents, apps, outbox, graph and reflections; `POST /owner/act` approves, declines, retries, mutes, relaunches, reflects. The terminal renders the eight phases, the needs-you strip, the vitals, and a prompt that is one chat round or a slash command.

**Tests** — 36, none needing a model, the network or docker.

**Stack hub** — rebuilt on the Nocturne system as ledgers: topology, your day, the agent's loops, the visitor's journey, where everything lives.

## 0.1.0 — first public release

**Engine** (`apps/engine`) — one DSPy ReAct agent on one Signature. Typed hypergraph with a seeded, unremovable core; Hebbian weights; priority queue where chat outranks research; the graph re-examines its weakest edges every minute. Tools: web search, page fetch, graph query, test runner, gated publisher; GitHub and sequential-thinking MCP servers attached at startup. FastAPI door (`/round`, `/graph`, `/record`, `/health`). Twelve tests, no model needed.

**Site** (`apps/web`) — landing and funnel, research notes, five-module academy with a ten-question exam, signals as published research behind certification, three working apps, the record, the build plan, the long-range ladder, the Signature lab, about, tiers with ten tester seats, contact that routes through the agent, the company file, the agent chat, and an owner dashboard with papers, experiments, code, the live thought graph, a markmap view and tester codes. Ships as one self-contained `dist/index.html`.

**Research** (`research/reports`) — three reports on agent ≡ graph with 69 live-checked sources, including the adversarial pass against the architecture.

**Marketing** (`marketing`) — launch copy for LinkedIn, X and Reddit; a publishing schedule with the rules the agent must follow; an outbox the agent drafts into until publishing is enabled.

**Ops** — Dockerfile, compose with docker-in-docker for agent-built apps, CI on every push, release on tag.
