# The Threshold Institute

A self-running think tank. One agent, one Signature (one input field, one output field), one graph. The company is a readable file.
Every span, log line, function, incident, patch, shipped app and feed item is written into that same graph. The agent reads all of its own
source and edits none of it; it proposes upgrades and you approve them.

```
cp .env.example .env        # model key · OWNER_PASSWORD · SESSION_SECRET · HUB_TOKEN · REDIS_PASSWORD (+ GitHub, Slack, X, LinkedIn when ready)
docker compose up -d        # the whole install
open http://localhost/terminal      # sign in: your day
open http://localhost:6006          # Phoenix: every span of every round
```

## What runs, and where

Four containers on the top layer. Everything else the agent needs it starts inside its own docker.

```
web ── nginx · / the site · /terminal the owner workspace · /api/ → agent · /a/<port>/ → apps
└── web-dind        every app the agent ships (app-<name>, 8100–8199), health-checked and relaunched every five minutes
agent ── the engine · read-only root filesystem · source baked in, owned by root · writes only to /state
└── agent-dind      sandbox runs in 8 languages (or any image) · started by the engine at boot:
      phoenix :6006   traces            redis :6379   dedupe, counters, pending work, caps
      mcp-hub :8765   one MCP server in front of every other (below)
```

Mounts: `state` (agent writes: graph, record, incidents, upgrades, outbox, Q-table), `registry` (agent writes, web reads: the apps list), two dind storage
volumes. Limits and `no-new-privileges` are in `docker-compose.yml`; the engine sets per-service limits for Phoenix, Redis and the hub in `institute.yaml`.

## TESTER (`apps/tester`)

One agent that is one graph: every file, function, route, page, service and data store, its own source and tools, every check, finding, fix
and lesson are nodes of one hypergraph. It tests the whole repository and the running stack (pytest for every app, JavaScript and page
scripts, Design Component templates, references, routes, compose, configs, secrets, every page in Chromium at 390 and 1440 px, the live
engine and site), fixes what fails in its own copy, keeps a fix only when re-testing shows the finding gone and nothing new broken, and
waits for you to apply it (`TESTER_APPLY=propose`, or `auto`). `localhost:8090/graph` serves the graph; details in `apps/tester/README.md`.

## The MCP hub (`apps/mcp-hub`)

The agent connects to one MCP server. Behind it: **filesystem** (a read-only copy of the repository at `/repo`, plus scratch), **github**, **slack**, **wolframalpha**,
**apify**, **fetch**, **sequential thinking**; native **terminal_run** (a throwaway container in agent-dind, `/work` persists, no network unless asked) and
**time_now**. The agent manages its own server list with `market_search` (the official MCP registry), `market_install`, `market_update`, `market_remove`:
allowed commands only, secret names not values, 30 servers at most, every change audited. Writes to the repository and to Slack are denied on those servers:
code goes through `plan_upgrade`, posts through `publish()`.

## Autonomy

The queue never sits idle. **research** re-examines the weakest edges every 30 s; **drive** gives the agent a free round every two minutes with its goals, open
questions, weakest edges and tomorrow's plan, and it chooses; **watch** turns new items in arXiv cs.AI/cs.MA and Hacker News into ingest rounds, each link once;
**repair** turns any error into incident → located by graph walk → diff → sandbox tests → pull request; **ship** tests, builds and publishes apps every five minutes;
**reflect** reads its day at 22:00, updates the Q-table, decays telemetry and plans tomorrow. Pending work survives restarts (Redis).

Seeded in `institute.yaml` as core nodes that are never removed: the charter, five goals, six open questions with their falsifiers, and the edges that tie them.

## Mindful social

One gate (`mindful.py`) for X, LinkedIn, Slack and Reddit: daily caps, quiet hours, spacing between posts, no duplicates, banned claims, character limits, and a
disclosure that the author is an agent. The agent never replies, follows or messages. While `publish.enabled` is false every post is a draft you approve in the terminal.

## Your day

| at | the agent | you |
|---|---|---|
| 06:00 | night report | read it |
| 07:30 | brief: energy trend, weakest edges, what waits | nothing yet |
| 09:00 | contact answered; PRs, upgrades and drafts wait | approve · decline · retry |
| 11:00 | incidents located and repaired in the sandbox | merge |
| 13:00 | apps shipped and relaunched | open · relaunch |
| 15:00 | research queue, re-ranked nightly | add a topic |
| 17:00 | publish cadence, drafts in the outbox | approve |
| 22:00 | reflection, Q-table, tomorrow's plan | read at 06:00 |

## Layout

```
apps/site/       the public site          apps/terminal/   the owner workspace       apps/hub/   the stack page
apps/web/        gateway: Dockerfile · nginx.conf · dist/ (index, terminal, stack, apps.json, fixtures)
apps/engine/     institute.yaml · signature · round · tools · observe · heal · upgrades · sandbox · reflect · day · auth · bus · mindful · feeds · selfmodel · main · serve
apps/mcp-hub/    hub.py · servers.json · Dockerfile · test_hub.py
research/        reports/ (three reports, Landscape 2026) · marketing/ (copy, schedule, outbox)
```

## Status

- Engine, hub and compose are written with tests that need no model, network or docker (`pytest -q` in `apps/engine` and in `apps/mcp-hub`). Nothing has run on a host yet; the first `docker compose up` will find things.
- Unverified: the Wolfram MCP package name and the exact shape of the MCP registry response (both handled defensively, both fixable through the market tools); `@modelcontextprotocol/server-github` and `-slack` are older reference servers.
- The hub holds the Docker socket of agent-dind, so a bug there reaches the sandbox daemon, not the host.
- After you merge a pull request, rebuild: `docker compose up -d --build agent`. The agent cannot deploy itself.
- No legal entity, no billing, no past performance. See `research/reports/Landscape 2026.dc.html` for what to settle first.
