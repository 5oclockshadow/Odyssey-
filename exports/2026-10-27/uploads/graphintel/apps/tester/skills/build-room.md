# Skill: the build room, end to end — build, test, triple-check and report every item until it is confirmed or blocked

How TESTER runs the Build Room and the Test Dashboard as one room: it ingests a source, finds every item worth testing, runs the layered plan
in `test-everything.md` against each one, checks each result three ways, and reports per item and per section as it goes. It stops when every
item is confirmed, or says plainly which items are blocked, on whom, and what would unblock them. It never spends a round re-testing something
that cannot have changed.

Status: specification. The `testroom` library (`library-prompt.md`) builds it. The 0.4.1 Build Room already has the draft model, the reply
format and the six-check bar. It does not yet have the scheduler, the triple check, stall detection or per-item reporting described here.

---

## What went wrong in rounds 1–56 (the regressions this build must never repeat)

The Build Room's log at round 56, browser mode: **3 passing, 9 failing, 88 queued, 22 messages in the outbox**. The pass count was 3 in every
round from 49 to 56.

1. **Starvation.** Nine failing repos were re-tested every three rounds, three per round. They took all three slots of every round, so 88 queued
   repos never started.
2. **Re-testing what could not change.** The nine were re-tested with identical files, environment and results 18–19 times each. Nothing new
   was learned after the first run.
3. **Blocked, reported as failing.** Six of the nine were waiting for SEXTANT to write a Finding, an example or the code: seed-shuffle,
   hyperedge, style-studio, oversight, graph3d and seed-law-tiers. SEXTANT was unreachable, so every brief sat in the outbox. They were blocked,
   but the room kept calling them failing.
4. **Missing dependencies, reported as failed tests.** one-signature (`pydantic`), otel-graph (`opentelemetry`) and mcp-hub (`httpx`) failed
   with `ModuleNotFoundError`. The packed `requirements.txt` was empty, although its own comment said TESTER adds what the source imports.
5. **A vacuous test.** seed-law-tiers' smoke test was parametrized over zero modules. It reported `1 skipped`, tested nothing and was not
   named as a problem.
6. **Flaky journeys, reported as failures.** `every-route` and `phone-menu` failed at 360 px in rounds 45 and 50. They passed at 360 px in
   rounds 48, 51 and 54. Each failure was reported once and never re-run.
7. **No stall detection.** The loop would have spun to round 500 at a pass every 13 seconds and never said why.
8. **Chronological noise instead of state.** The feed repeated the same three failures every round. The room could not answer "what is item
   X's status, what is the evidence, how many tries, and who owns the next step".

---

## Items, sections and the graph

- **Source:** a folder path or a git URL, named in config or env. TESTER reads it and never writes to it unless `edit` is on and an item passes.
- **Graph:** everything ingested is nodes and edges. That covers files, symbols, tests, pages, routes, services, data files, checks, results,
  fixes and lessons. Blast radius is how many nodes depend on an item.
- **Item:** the unit the room builds and tests. It can be a Python package, a Node package, a page, a journey, a compose service, a data file,
  or a packaged repo from a registry (the hundred repos). Each item has an `owner` for its next step: `tester` (fix it), `author` (SEXTANT
  writes what is missing), `owner` (a human decision) or `environment` (a tool or network the room lacks).
- **Section:** a layer of `test-everything.md`, used as the unit of rollup.

| Section | Items | Checks |
|---|---|---|
| L0 static | every file and item | syntax, lint, templates, refs, routes, compose, config, secrets, **deps**, the bar |
| L1 unit | every package and packaged repo | pytest, node --test (executed, never vacuous) |
| L2 pages | every page × width | load, console, missing files, scroll, blank, rendering, names; tabs clicked at the widest |
| L2e journeys | every journey × width | journeys.json steps in a fresh context |
| data | every data file | parses, schema and drift since the last run, size, secrets, who reads it |
| L3–L9 | auth, tiers, metering, isolation, provenance, billing, security | the suites that prove them, mapped by test name; `needs owner` where no test can |
| L10 live | services over the network | health, every public GET, a page in a browser |

---

## Every item's states

`queued → building → built → testing → passing (k/3) → confirmed`, plus `failing`, `flaky`, `blocked (on whom, why)` and `skipped (why)`.

- **built** means the inputs changed and the item is not verified yet. It covers files written by TESTER, an agent, Claude or the owner.
- **fingerprint** is a hash of the item's files, its declared dependencies' fingerprints and the environment (tool versions, config). A result
  is only worth repeating when the fingerprint changed, a backoff elapsed, the item still needs confirming, or the owner asked.
- **blocked** applies when the next step belongs to someone who cannot act now: an unreachable agent, a human decision, or a missing tool or
  network. A blocked item is not scheduled until its fingerprint changes or it is unblocked. The report names the blocker.
- **skipped** always carries a reason (`needs E2E_KEY`, `node is not installed`). Skipped is never counted as passing.

---

## The scheduler (one round, K slots)

Fill in this order, and never take an item whose fingerprint and environment are unchanged since a failing result unless its backoff elapsed:

1. **asked:** the owner pressed "build and test now".
2. **changed:** status built (new work is verified first).
3. **fresh:** queued items, at least ⌈K/2⌉ slots while any remain.
4. **confirm:** passing items with fewer than 3 confirmations, at least one round after their last pass.
5. **retry:** failing items that are not blocked and are past their backoff (3, 6, 12, 24, then 48 rounds after the 1st, 2nd, 3rd, 4th and later
   identical failure). Retries get at most one slot, unless the round has slots left over.

Leftover slots go to fresh, then confirm, then retry. With 9 failing-unchanged items and 88 queued, every queued item starts within
⌈88 / ⌈K/2⌉⌉ rounds, and none of the nine runs again until its files change or its backoff elapses.

## Stall detection

Progress means any of these: a status change other than a repeated identical failure, a fingerprint change, a new item started, a
confirmation, a reply that landed, or an item unblocked.

- After `stall_rounds` (5) rounds with no progress, emit `stall` with a diagnosis. Example: "6 items wait on SEXTANT (outbox: 22),
  3 on the environment (no `pydantic` here), 0 queued".
- Then move to phase `stalled`. Poll the source for changes at a long interval and resume on the first change. With `stop_on_stall`, stop.
- When every item is confirmed, skipped with a reason, or blocked, the phase is `done` or `blocked`. Never spin.

---

## The triple check

Each item needs three kinds of evidence:

1. **Static:** the bar, lint, deps, secrets and config for the item.
2. **Executed:** its tests ran and passed. At least one test executed, with 0 failed and 0 errors. All-skipped or zero collected is a failure
   (`no test ran`). For pages, no console error. For journeys, every step passed.
3. **Behavioral:** the item does its job end to end. The quickstart runs and exits 0 within 60 s. A package installs and imports in a clean
   environment. A page renders its content. A service answers its health check.

Re-run rules:

- A failing executed or behavioral check is re-run in a fresh tmp dir and a fresh browser context, up to 3 times in the same round.
  0/3 passes is `fail`, 1–2/3 is `flaky`, 3/3 is `pass`. Flakes are reported with every attempt's evidence and block `confirmed`.
- Static checks run once, because they are deterministic, and run again when the fingerprint changes.
- **Confirmation:** an item is confirmed after 3 passing rounds with no fingerprint change. Any change resets the count.
- The early stop needs every item confirmed (or skipped with a reason) and three clean site walks in a row.

## Dependencies

- Scan imports statically: `ast` for Python; `import`, `require` and dynamic import specifiers for JS. Leave out the stdlib
  (`sys.stdlib_module_names`) and the item's own modules.
- Map each import to its distribution. An import that is not declared is an L0 `deps` error: `imports pydantic; requirements.txt does not pin it`.
- The packer pins what it can, from the pin table or the installed version. The runner installs the declared dependencies into a per-item
  cache keyed by the requirements hash.
- When a dependency cannot be installed here (offline, no wheel), the item is `blocked (environment)` with the name of the dependency. It is
  not reported as failing.

## Data

Every file under a configured data folder is an item:

- It parses (CSV header and types, JSON, YAML, JSONL; Parquet when pyarrow is installed).
- Its schema has not drifted since the last run. Drift is a `warn`, plus the diff.
- It is under the size limit and holds no key-shaped string.
- The graph knows which code reads it. A data file nothing reads is a `warn`.

---

## Routing, replies and drafts

- A failure goes to the item's owner. `tester` is the fixer agent; its fixes are verified in the working copy and kept only if nothing it
  touched got worse. `author` is the writer agent, which writes from the item's research. `owner` is the outbox.
- Doors are signed: a short-lived HMAC token (no more than 15 minutes), signed per message. With no door open, the message waits in the outbox
  and the item is `blocked (author)`.
- Replies carry `--- file: <path>` … `--- end` blocks. Only safe paths are kept: no absolute paths, no `..`, no dotfiles except `.github/`.
  The files land in the item's **draft**, and the item becomes `built`.
- An item's files are the committed copy with the draft laid over it. Tests run in a scratch dir, never in the source. With `edit` on, a
  passing item's changed files are written, and the draft is spent.

## Reporting, per item and per section, as it goes

- **Events:** every action is one JSON line:
  `{t, round, kind, section, item, check, attempt, of, result, ms, evidence, status, owner, next}`. Kinds: `round_start`, `plan`, `start`,
  `result`, `status`, `route`, `reply`, `stall`, `round_end`, `report`. Secrets are masked before writing.
- **Item card:** status and since when, the owner of the next step, a triple-check grid (static, executed, behavioral × attempts),
  confirmations k/3, evidence, fingerprint, declared and undeclared deps, the last 20 results, messages and replies, blast radius.
  Evidence means bar rows with why, test counts and tail, the failing journey step, and page failures.
- **Section rollup:** items by state, pass rate, flakes, blocked items by owner, median duration, the top failures by blast radius, and the
  section's gate (green, red, not run, or needs owner).
- **Round summary:** only what changed (started, status changes, confirmations, new failures, flakes, unblocks). "3 re-tested, no change" is a
  single collapsed line.
- **Report:** Markdown, JSON and one-file HTML, written every round and on demand. It ends with the launch gate from `test-everything.md`:
  ready or not ready, the blocking items by severity and blast radius, and what each needs.

## The room (one page: the Build Room and the Test Dashboard melded)

- **Header:** source, mode, round of target, phase (including `stalled`), the gate verdict, run and pause, report.
- **Sections rail:** the rollup per layer; clicking a layer filters.
- **Item matrix:** tiles by state with confirmation pips; first column for launch-wave items.
- **Item card:** the card above, plus Build now, Download and a reply box.
- **Live stage:** the page or journey running now, at its width.
- **Rounds:** deltas, a chart, and proposals with the outbox.

The room's own journeys test it at 360 and 1440 px.
