# Prompt: build `testroom`, a library that ingests any source and builds, tests, triple-checks and reports every item in it

Paste this to the agent that will build it (Claude Code, run in this repository).

---

You are building **testroom**: a Python library, CLI, HTTP server and one-page UI. Point it at a source (a folder path or a git URL), given in
config or env. It ingests that source into one graph and discovers every item worth testing. It runs a layered test plan against each item,
checks every result three ways, routes failures to agents or people, and reports per item and per section as it goes. It stops when every
item is confirmed, or names what is blocked and on whom. It is the generalization of TESTER and the Build Room in this repository. It must
run against any repository, not only this one.

The specification is `apps/tester/skills/build-room.md`. Read it first and follow it exactly: item states, the scheduler, stall detection,
the triple check, dependencies, data, routing and replies, events, the item card, section rollups and the room. The layers and the launch gate
are in `apps/tester/skills/test-everything.md`. Where this prompt and the skill disagree, the skill wins. Report the disagreement.

## Where it lives

Build it in `repos/testroom/`, as one of the institute's repos. It must clear the six-check bar in `repos/registry.json`, so TESTER can gate
it. Add a registry entry: id `testroom`, cat `Harness · eval`, wave 1, lang `python`, builder `claude`, line `open`, status `built`. It is
published as `anima/testroom`; confirm the GitHub organisation with the owner before you push. Nothing in `src/` may import from
`apps/`. Port code by copying and adapting it, and credit the source file in a comment.

## Read these first (what to port, and what not to repeat)

| File | Take |
|---|---|
| `apps/tester/build.py` | the committed copy with the draft laid over it, scratch-dir test runs, publishing only changed files, `build_token`, atomic state, resume after restart |
| `apps/tester/factory.py`, `apps/tester/repo-factory.js` | pack, the six-check bar, `take_files` / `RepoFactory.take` (reply blocks), `configure` (links from the registry) |
| `apps/tester/ingest.py`, `brain.py`, `checks.py` | the graph, ingest, the static checks, the graph-driven plan, junit parsing, `repo_suites` |
| `apps/tester/qa.py`, `e2e.js`, `e2e/journeys.json` | pages in Playwright, the journeys DSL (go, click, fill, see, gone, has, count, value, back, wait) in Python and in the browser |
| `apps/tester/testkit.js` | the in-browser page check (blank, scroll, offscreen, rendering, names), clicking through tabs |
| `apps/tester/agent.py` | the fixer: verified fixes only, edits by exact find-and-replace, never weakening a test |
| `apps/tester/Build Room.dc.html`, `Test Dashboard v7.dc.html` | the two UIs to meld into one room (layout and behavior; not their code style) |
| `apps/engine/auth.py` (`builder`) | the receiving side of a signed, short-lived door |
| `apps/tester/test_build.py` | tests to port and extend |

The 56-round log in the skill ("What went wrong") is your regression suite. Encode it as `tests/fixtures/stuck-56.json`, a registry
state of 3 passing, 9 failing-unchanged (6 waiting on the author, 3 missing dependencies) and 88 queued. Assert that the scheduler starts
every queued item, re-runs none of the nine, and reports the six as blocked on the author and the three as blocked on the environment.

## Inputs: config and env

Precedence: CLI flag, then env, then config file, then defaults. The config file is found at `--config`, then `TESTROOM_CONFIG`, then
`./testroom.yaml`, then `<source>/testroom.yaml`. Every key below has an env override; print the resolved config in `testroom doctor`.

```yaml
source: .                         # TESTROOM_SOURCE: a path, git+https://host/org/repo@ref, or a list
# sources: [{name: app, path: ./}, {name: lib, git: "https://github.com/org/lib", ref: v1.2.0}]
include: ["**/*"]
exclude: [.git, node_modules, __pycache__, .venv, dist, build, .testroom]
data: [data/, fixtures/]          # TESTROOM_DATA (comma-separated): folders ingested as data items
state: .testroom                  # TESTROOM_STATE: graph, events, drafts, scratch, reports
registry: repos/registry.json     # optional: items to pack from sources (the hundred-repos case); absent = discover only
discover: {python: true, node: true, pages: {globs: ["**/*.html"], widths: [360, 768, 1440]}, compose: true, data: true}
journeys: apps/tester/e2e/journeys.json
plan: [L0, L1, L2, L2e, data, L10]            # the sections to run, in order; L3–L9 map named test suites to layers (below)
layers: {L4: ["apps/engine/test_world.py"], L9: ["apps/engine/test_engine.py::test_*auth*"]}
loop: {rounds: 500, per_round: 3, retries: 3, confirm: 3, backoff: [3, 6, 12, 24, 48], stall_rounds: 5, stop_on_stall: false, pause_seconds: 1}
bar: [tests, compose, readme, hygiene, example, links]
links: {site: "https://…", graph: "https://…"}  # what every packed README must link
agents:
  fixer:  {kind: http, url: "http://tester:8090/ask", token_env: TESTER_TOKEN}
  author: {kind: http, url: "http://agent:8000/builder/say", secret_env: SESSION_SECRET}   # signs a 5-minute token per message
  owner:  {kind: outbox}
edit: false                       # TESTROOM_EDIT=on: passing items' changed files are written back to a path source
live: {http: [{id: site, url: "http://web/"}], openapi: "http://agent:8000/openapi.json"}
offline: false                    # TESTROOM_OFFLINE=on: no installs; such items are blocked (environment)
```

Env: `TESTROOM_SOURCE`, `TESTROOM_CONFIG`, `TESTROOM_STATE`, `TESTROOM_DATA`, `TESTROOM_EDIT`, `TESTROOM_ROUNDS`, `TESTROOM_PER_ROUND`,
`TESTROOM_TOKEN` (the server's write routes), `TESTROOM_MODEL` (optional; with no model everything except agent fixing works),
`TESTROOM_OFFLINE`, `TESTROOM_PORT`. Accept this repository's names as aliases: `TESTER_REPO` for the source, `TESTER_STATE` for the
state, and `INSTITUTE_SITE` / `INSTITUTE_GRAPH` for the links.

A git source is cloned shallow into `state/sources/<name>` at the ref and pulled each round. It is never written to.

## Layout

```
repos/testroom/
  pyproject.toml  README.md  LICENSE  CHANGELOG.md  testroom.example.yaml  Dockerfile  docker-compose.yml  requirements*.txt
  testroom/                 config.py  source.py  ingest.py  graph.py  units.py  fingerprint.py  scheduler.py  triple.py  room.py  events.py
    checks/                 static.py  deps.py  secrets.py  bar.py  pytest_run.py  node_run.py  pages.py  journeys.py  data.py  live.py  custom.py
    agents/                 router.py  http.py  cli.py  outbox.py  reply.py  tokens.py
    report/                 md.py  json.py  html.py
    server.py  cli.py
    ui/                     index.html  room.js  e2e.js  reply.js  room.css      (no build step; ES modules; served by `testroom serve`)
  tests/                    one file per module; fixtures/ (stuck-56.json, replies/*.txt + expected.json, a sample repo)
  examples/                 quickstart.py (runs in < 60 s against examples/sample/), sample/ (a tiny repo with a package, a page, a data file, a journey)
  .github/workflows/ci.yml  pytest, node --test (reply.js parity), the quickstart, and testroom run on itself
```

## Interfaces

- **CLI:**
  - `testroom ingest`: graph, items and plan, printed per section.
  - `testroom run [--rounds N] [--section S] [--item ID] [--once]`: the loop, live per-item lines in the terminal. Exit 0 when the gate is
    ready, 1 when it is not, 2 when it stalls.
  - `testroom serve`: the HTTP API and the room.
  - `testroom report [--format md|json|html]`.
  - `testroom doctor`: the resolved config and which sections can run here (python, node, Playwright, docker, network).
- **Library:** `Room(Config.load())` with `.ingest()`, `.plan()`, `.round()`, `.run()`, `.events()` (an iterator), `.item(id)`, `.sections()`,
  `.report(fmt)`, `.reply(item, text, who)`, `.ask(item)`.
- **HTTP:**
  - Reads: `GET /status`, `GET /items`, `GET /items/{id}`, `GET /items/{id}/files`, `GET /sections`, `GET /events` (SSE; `?since=` replays
    from the JSONL), `GET /report.{md,json,html}`.
  - Writes, with a token: `POST /run`, `POST /stop`, `POST /reset` (keeps drafts), `POST /items/{id}/run`, `POST /items/{id}/reply`,
    `POST /items/{id}/unblock`.
- **Room (UI):** the layout in the skill. It reads only `/events` and `/status`, so the terminal, the report and the room show the same state.
  It must pass its own journeys at 360 and 1440 px, with keyboard focus visible and every control named.

## Acceptance tests (each one a test in `tests/`; no network, no model, no docker; Playwright tests marked and run in CI)

1. Precedence: a CLI flag beats env, env beats the config file, and the config file beats defaults. A git source is cloned (with git mocked)
   and never written to.
2. Discovery on `examples/sample`: the package, the page × widths, the journey, the data file and the compose service are all items.
3. `stuck-56.json`: every queued item starts within ⌈88/⌈K/2⌉⌉ rounds. None of the nine re-runs without a fingerprint change or a backoff.
   Six are blocked on the author and three on the environment.
4. Stall: with only blocked items left, a `stall` event comes within `stall_rounds`, the phase is `stalled`, and the report names every blocker.
5. Triple check: a runner that fails 1 run in 3 gives `flaky`; a consistent failure gives `fail 0/3`. A pass becomes `confirmed` only after
   3 rounds with no change. A file change resets confirmations.
6. Vacuous tests: zero collected, or all skipped, fails with `no test ran`.
7. Deps: a module that imports `pydantic` with an empty `requirements.txt` gives an L0 `deps` error. The packer pins it, and offline the item
   is `blocked (environment)`.
8. Replies: Python `take_files` and `ui/reply.js` give identical results on every fixture in `tests/fixtures/replies/`. Unsafe paths are
   dropped, and a single code fence is unwrapped.
9. Drafts: the source is never written while testing. Tests run in a scratch dir. With `edit` on, only the changed files of a passing item
   are written, and the draft is then spent.
10. Events: every status change emits an event. Secrets are masked in events, reports and the outbox. A restart resumes the round, and
    `status.json` is written atomically.
11. Doors: tokens last 15 minutes at most and are signed per message. A token for one door opens no other.
12. Reports: Markdown, JSON and HTML agree, and the gate verdict follows `test-everything.md`'s six conditions.
13. Dogfood: `TESTROOM_SOURCE=. testroom run --rounds 20` on the library itself reaches `done`, with every item confirmed.

## Order of work

1. config, source, ingest, graph, discovery, events, `testroom ingest`, `doctor`
2. static checks, deps, the runners with isolation, triple, the scheduler, the room loop, state, resume, md and json reports, `testroom run`
3. pages, journeys, data, live
4. agents, router, replies, drafts, publishing, tokens
5. the server, SSE, the room, the html report
6. examples, README, CI, dogfood, the six-check bar, the registry entry

Stop after each step and run the tests. Change as little as possible to make a failing test pass, and never weaken a test.

## Definition of done

- Every acceptance test passes in CI, and `testroom run` on this repository produces a report per section with no item left in a
  non-terminal state.
- The repo clears the bar: tests in CI with no network, compose in one line, README with `## Finding` and `## Hypothesis`, licence and
  pinned dependencies, a quickstart under 60 s, and links to the site and the graph.
  - Finding: the 56-round log, as numbers.
  - Hypothesis: "a scheduler keyed to input fingerprints, with fresh-work quotas, triple-checked results and stall detection, brings every
    item to a terminal state in at most ⌈items / ⌈K/2⌉⌉ + 3·confirm rounds". Falsifier: any fixture where it does not.
- Hand back a short note covering what you built, what you could not, the open `needs owner` items (the GitHub organisation, the public
  domain), and how to point the room at a new source in one line.
