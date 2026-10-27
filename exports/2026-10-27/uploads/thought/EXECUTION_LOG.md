# Execution Log

Honest scope: one pass, not 30 rounds. No shell, Node, Docker or Python was available, so nothing below was run outside the browser sandbox.

## Pass 1 (2026-10-10)
Audit: read server/handler.js, index.js, validate.js, schema.sql, .env.example, package.json.
Changes: see SOC2_READINESS.md section 4 (7 defects) in server/handler.js, server/index.js, server/.env.example.
Tests: server/security-tests.js, 19 assertions, executed in the browser sandbox against an in-memory store with the real handler and validate code. Result 19/19, one run (not three).
Decisions: Pydantic and Python not used; the backend is Node and a rewrite would add risk. Verification of account-level controls skipped; product has no accounts.
Not done: rounds 2-30, Dockerfile, three-run stability, fresh clone, zip, Evidence Package folder, status HTML, telemetry JSON, SQLite store tests, worker tests, frontend narrow-width checks.

## Pass 2 (2026-10-13): user-style testing of the Atlas editor
Engine fuzz: 100 sessions, 6,103 random user actions (add, drop, link, move, merge, delete, outline, undo via snapshot, views, lens edits, ask) with integrity checks after every action. 0 defects.
Browser harness in the live page: 78 scripted checks (forms, canvas clicks, shift-select, group, move, merge, link editing, undo/redo, versions, ask, drop, menus, keys, all 10 views, three styles, import, outline, questions, sub-maps, routes, lens edits) plus 100 random UI rounds. No uncaught errors.
Suites: 160 tests, 160 pass in the browser (one needs localStorage, so it cannot run in the sandbox).
Defects found and fixed: offline auto grew placeholders out of placeholders ("? Thing: leads to ? Thing: …"); placeholders now read as the question itself and auto stops with a reason once only placeholders remain. Universe view labelled every idea, so text piled up; it now labels the nearest 22 plus the selection. Studio splash could stay up if a frame never reported loading; 6 s fallback. Alt+1/2/3 inside Atlas also switched its view; Alt is now left to the shell. The link panel selected far ends without jumping to their level. Custom kinds carried a redundant "note" attribute that produced "What is the note of X?" questions.
## Pass 3 (2026-10-15): dynamic lenses in Thought Graph
Request: help see input in a new light, and make exploring dynamic instead of a fixed menu.
Added `thought-lenses.js`: 22 lenses in 6 families (challenge, ground, people, time, scale, connect). Each scores itself against the selected thought (grounding, plane, wording such as plans, money, people, absolutes, depth from the goal, nearby, distant and clashing thoughts). The best fit always shows; the rest are weighted-random, one per family, and lenses already used drop back. Connect lenses pull in a distant or clashing thought from the map and link to it. Results are new linked thoughts ("seen as"), so any of them can be looked at again. Live AI writes the result and can invent lenses for the specific thought.
UI: "See it differently" block in the selected-thought card (4 lenses with reasons, Shuffle, Invent with Live AI, "Already seen as" list, link back to the source). Auto mode takes a lens step about every third step.
Tests: `thought-lens-tests.js`, 9 tests, 3 consecutive runs 9/9. Found and fixed during testing: lens text stacked on lens text, "same problem" matched a thought's own results, lens info was lost on save, awkward phrasing for statements vs plans.
## Pass 4 (2026-10-15): a free-running mind for Thought Graph
Request: thought mapping felt hard-coded. Cause: offline expansion reveals a prewritten bank, then falls back to four fixed bridge templates; live expansion was told which thought and which module to use.
Added `thought-mind.js`. With Live AI, Claude gets a snapshot of the whole map, its own open questions and its recent moves, and decides what to look at, what move to make (in its own words), where new thoughts attach and how they link (its own relation words). Questions carry forward between steps and are dropped when answered. Offline, a smaller mind with four drives (novelty, coherence, doubt, depth) that shift with the map's state picks among six moves (cross a claim between branches, apply a mechanism, find a pattern under a parent, ask why, surface a tension or doubt, answer an open question). It only works from the user's and grounded thoughts, never its own output, and skips anything that would not read cleanly.
UI: "Think" button (one free step) next to Auto; Auto now alternates mind steps, lens steps and the existing engine. Live AI stays opt-in because thought text leaves the device.
Tests: `thought-mind-tests.js`, 8 tests including a mocked Claude for the live path and five hostile replies.
Honest limit: offline it can only recombine words already on the map; open-ended thinking needs Live AI.
Known limits: sidebars have fixed widths, so the canvas gets narrow under ~800 px; undo re-ids every idea (positions are kept).
