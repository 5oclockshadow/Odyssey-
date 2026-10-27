# selfwire

A DSPy agent that can grow its own capabilities at runtime — and, since
0.3.0, a local **Workbench**: a dashboard where you chat with the agent while
it creates, reads, updates, and deletes files in its own codebase, runs its
tests, audits itself, and improves itself behind a test gate (the *moat*).

## Workbench (0.3.0)

```bash
uv venv --python 3.13 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m selfwire.workbench --root .        # serves this repo
# open the printed URL (it carries a per-run access token)
```

Point `--root` at any git repo (one is initialised if missing). In the
dashboard:

- **Chat.** `/`-commands work with no model at all: `/ls`, `/cat`, `/write`,
  `/rm`, `/mv`, `/test`, `/audit`, `/diff`, `/log`, `/commit`, `/rollback`,
  `/improve`, `/skills`, `/tools`, `/model`. Plain messages go to the SelfWire
  agent once a model is set (Settings, `/model anthropic/claude-sonnet-4-5`,
  or `SELFWIRE_LM_MODEL`). The agent's tools are the workbench itself:
  read/write/replace/delete files, run tests, audit, git, skills.
- **Files + editor.** Every edit — yours or the agent's — streams live to
  every open dashboard. The dashboard UI is itself a file in this repo
  (`selfwire/workbench/ui/index.html`) the agent may edit: its edits render
  at `/preview` (with no API access) and are adopted when you press
  **Restart**, which also applies backend edits — after first proving the
  new code still imports.
- **Tests / Audit / Improve / Git / Jobs / Skills / Graph** panels. Audit
  gives a 0-100 score, findings, and a plan; "Improve this" on any plan item
  starts the improvement loop on it.

### The moat

`/improve <goal>` (or the Improve panel) runs:

```
checkpoint -> baseline tests + audit -> [plan -> pre-check -> apply
-> full tests + audit -> verdict -> commit | rollback] x attempts
```

A change is **kept only if all of these hold**, and rolled back to the
checkpoint otherwise (the reasons feed the next attempt):

- the full suite stays green (or a red suite gets strictly less red);
- collected and passing test counts don't drop; skipped tests don't rise;
- the number of assertions under `tests/` doesn't drop (no gutting a test
  to `pass`);
- no new high-severity audit finding;
- the run is trustworthy: JUnit counts agree with pytest's own summary,
  and the run didn't modify `.git` hooks/config or interpreter startup files
  (those are snapshotted and restored around every run);
- the lines it adds contain no gaming constructs (`os._exit`, JUnit access,
  `pytest_plugins`, pytest hooks outside conftest, pytest env options,
  `.git`/`.pth` access, `sys.argv` in tests);
- it doesn't touch the **test harness** — the whole `selfwire/workbench/`
  package except its UI, any `conftest.py`, and every pytest config file —
  which is read-only to the agent (you can still edit it), and never
  deletes test files.

Uncommitted work is checkpointed before an improvement starts, so a
rollback never loses it. From chat, the agent's `git_commit` is refused
unless the latest *full* test run passed *after* its last edit. Every
improvement writes an HTML context report and pre/post telemetry JSON to
`.selfwire/reports/` (git-excluded, off-limits to file tools). Full rules:
`selfwire/workbench/moat.py` — itself read-only from the workbench.

### Security and threat model

The server can edit files and run code, so: a random access token is
generated every run (or pass `--token` / `SELFWIRE_WORKBENCH_TOKEN`;
`--no-token` is loopback-only); requests whose Host or Origin isn't loopback
(or `--allow-host`) get 403, which blocks DNS-rebinding from web pages; git
never runs hooks; paths are sandboxed and checked case-insensitively; the
agent's `exec` and MCP-launch levers are **off** in the workbench unless you
enable "unsafe levers" in Settings.

Be clear about what the moat is: a guard against a model *drifting into*
reward hacking or committing broken code. It is not a sandbox — the test
suite runs code the agent wrote, as your user. For hard isolation, run the
workbench in its container. Each hardening above came from an independent
review of this release and has a regression test
(`tests/test_workbench_hardening.py`). API contract:
[docs/WORKBENCH_API.md](docs/WORKBENCH_API.md).

## The agent

Barebones scaffold that gives a DSPy agent raw, runtime access to grow its
own capability surface, four ways:

1. **`registry`** — the live, mutable catalog of tools the agent can call.
   Every other lever mutates this; the agent reads it fresh every turn.
2. **`exec_tool`** — python's built-in `exec`, as a last resort: compile
   source that defines one function, register it as a new tool on the spot.
3. **`mcp_hub`** — attach to an *external* MCP server (any command that
   speaks the protocol over stdio) and pull its tools into the registry.
4. **`own_server`** — the agent's *own* FastMCP server. Everything it
   acquires from the other three levers is mirrored outward here, so any
   other MCP client can call back into it — and it exposes meta-tools
   (`add_python_tool`, `attach_mcp_server` equivalents, `remove_tool`) so
   growth can happen *over MCP itself*, not just from in-process Python.

All four are driven by one dual-process reasoning signature (`agent.py`):
a single `dspy.Signature` with exactly one `InputField` and one
`OutputField`, whose type is a single Pydantic `BaseModel` with three
`BaseModel`s stacked inside it — `left_brain` (sequential/logical trace,
feeds a Q-table), `right_brain` (associative/pattern trace, feeds a
Hebbian-weighted tool graph), and `synthesis` (the one actionable decision
that reconciles them). The loop itself is hand-rolled, not `dspy.ReAct`,
specifically so that signature is the *whole* program.

## Quickstart

Python **3.13+** (required by `osiiso`, which runs the workbench's jobs and
the auditor's parallel file scan).

```bash
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python demo.py                 # agent walkthrough, zero credentials required
.venv/bin/python -m pytest -q            # 208 tests, ~75s
.venv/bin/python -m selfwire.workbench   # the dashboard
```

`demo.py` auto-detects `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Without
either, it runs the identical agent loop against a scripted `DummyLM` so the
whole thing — write a tool via `exec`, call it, attach a real external MCP
server, call one of *its* tools, respond — is runnable offline.

```python
import dspy
from selfwire.agent import bootstrap

dspy.settings.configure(lm=dspy.LM("anthropic/claude-3-5-haiku-latest"))
agent = bootstrap(max_iters=6)
pred = agent.run("write a tool that reverses a string, then use it on 'selfwire'")
print(pred.final_answer)

# or, async (a genuine async DSPy call via dspy.Predict.acall, not a
# thread-wrapped sync call — see agent.py's aforward() docstring):
pred = await agent.arun("...")
```

## Layout

```
selfwire/
  registry.py     lever 1 — the mutable tool catalog
  exec_tool.py     lever 2 — python exec -> new tool
  mcp_hub.py       lever 3 — attach external MCP servers
  own_server.py    lever 4 — the agent's own growable MCP server
  agent.py         the dual-brain signature + the loop that acts on it
  graph_store.py   Hebbian-weighted tool graph (3D layout + timestamps) + Q-table
  storage.py       Redis-backed persistence, raptor -> raw -> file fallback
  telemetry.py     Phoenix/OTel tracing (opt-in) + dual JSON lifecycle log
  reporter.py      README execution log + timestamped HTML context reports
  graph_viz.py     self-contained neon dark-mode 3D tool-graph viewer
  workbench/
    workspace.py   sandboxed file CRUD + git checkpoint/commit/rollback
    tester.py      pytest runner: live output, JUnit parsing, kill on cancel/timeout
    auditor.py     static audit (osiiso fan-out): score, findings, plan
    moat.py        the gate rules (read-only from the workbench)
    improver.py    test-gated improvement loop (one DSPy signature)
    jobs.py        osiiso ThreadQueue job manager, exclusive workspace group
    agent_tools.py workbench capabilities as agent tools (+ commit gate)
    agent_base.py  WorkbenchAgent: the dual-brain agent tuned for code work
    chat.py        slash commands + agent turns
    skills.py      skills/<name>/SKILL.md store
    server.py      FastAPI API + SSE + live UI; core.py wires it all
    ui/index.html  the dashboard (single file, offline, responsive)
skills/            skills the agent reads (and can write)
docs/              WORKBENCH_API.md
tests/             208 tests: unit, MCP subprocess, async, workbench, live-server e2e
demo.py            runnable walkthrough of all four levers
Dockerfile, docker-compose.yml   workbench + mcp + redis (+ optional phoenix)
```

## Notes worth knowing before you build on this

- **`raptor-redis` / `graph-redis` aren't real packages.** The architecture
  spec asked for storage wired through them; neither exists on PyPI
  (`raptor-redis` -> 404, checked at build time). `storage.py` *implements*
  that role directly on top of the real `redis` client: a RedisJSON-module
  path, falling back to raw Redis GET/SET, falling back to on-disk JSON if
  no Redis is reachable at all. Said so in the module docstring rather than
  importing something fictional and failing at runtime.
- **`exec_tool` is not a sandbox.** `_static_guard` blocks a few obviously
  dangerous patterns (shelling out, raw sockets, etc.) as a best-effort
  filter, not a security boundary. Anyone who can reach `define_tool` or
  `run_snippet` can run arbitrary code as this process's (or, for snippets,
  a child process's) user. Gate access to it accordingly — this is stated
  plainly in the module docstring, not glossed over.
- **Phoenix telemetry is opt-in and pre-probed**, specifically because the
  naive version (`phoenix.otel.register()` with defaults, called
  unconditionally) blocked a plain agent run for ~90 seconds in testing when
  no collector was running — its default `SimpleSpanProcessor` exports
  synchronously and retries with backoff on every span. Set
  `SELFWIRE_ENABLE_PHOENIX=1` and have a collector reachable (see
  `docker-compose.yml`'s `telemetry` profile) to turn it on; otherwise the
  agent never touches the Phoenix SDK at all.
- **Concurrency**: a single `bootstrap()`-ed agent's `ToolRegistry` is
  thread-safe (internal lock); `ToolGraph`'s in-memory mutations are not.
  Run concurrent tasks against separate agents, not one shared instance,
  until/unless that's added.
- **The "conscious human" framing** in the dual-brain signature's design
  brief is a design lens, implemented here as a real, inspectable
  dual-process (System 1 / System 2 -style) reasoning pattern — the code
  doesn't assert anything about consciousness, it just implements the
  mechanism as specified.
- **Immutable/versioned filenames**: applied where it actually makes sense —
  timestamped HTML context reports (`reports/context/context-<ts>-<run_id>.html`),
  timestamped telemetry JSON, a timestamped dist zip (`build_dist.py`) — and
  deliberately *not* applied to source module filenames, which have to stay
  stable for imports to work. `ToolRegistry` still versions every tool
  definition internally (`ToolRecord.version`, bumped on every redefinition)
  without renaming files.

- **mcp is pinned `<2`.** mcp 2.x renamed `FastMCP` to `MCPServer` and a
  fresh unpinned install broke `own_server.py` on import; the pin stays until
  `own_server` is ported.
- **Tests always run from current source.** The runner points Python at an
  empty per-run bytecode cache. Without that, a same-length edit made within
  the same second as an earlier import ran *stale* `.pyc` — broken code
  tested green (found and fixed during this release; regression-tested).

## Docker

```bash
cp .env.example .env   # set SELFWIRE_WORKBENCH_TOKEN (required) and optionally a model
UID=$(id -u) GID=$(id -g) docker compose up --build
# workbench: http://127.0.0.1:8765/?token=<token>   mcp: 127.0.0.1:8800
docker compose --profile telemetry up --build      # + phoenix, with SELFWIRE_ENABLE_PHOENIX=1
```

The workbench service bind-mounts this repo at `/workspace` and runs as your
uid, so the agent's (test-gated) edits land in your checkout, owned by you.

## Versioning

`selfwire` follows `MAJOR.MINOR.PATCH`, pre-1.0 (a `MINOR` bump can still
change internals). Current: **0.3.0** — see [CHANGELOG.md](CHANGELOG.md)
for what changed at each version. The installed version is also importable
at runtime as `selfwire.__version__`.
