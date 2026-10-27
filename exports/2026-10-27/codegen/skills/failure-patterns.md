---
name: failure-patterns
intro: The ways work went wrong here before, and the check that now catches each one. Read before every task and every supervision pass.
---
# Failure patterns and their guards (learned 2026-10-26)

| Pattern | What happened | Guard (code) | What you do |
|---|---|---|---|
| Passed but saved nothing | Tester merge plan passed twice, 0 files (unnamed markdown block) | unnamed blocks named + logged; "0 files written" = failed | Name every block with its path |
| Off-target output | v12 tiers wrote `main.py` at the repo root instead of patching `apps/engine/v1.py` | `expected_outputs` on tasks: other files are stowed, missing ones fail the job | Always declare expected_outputs; spell exact paths in the instruction |
| Untested candidate passes | connectome/flags/board candidates "passed" because they shipped no test | task candidates without a `tests/` file are refused; every plugin must load | Ship the test the done-check describes; smoke-test endpoints before recommending |
| Invented APIs | connectome used `db.cache`, `db.graph` (do not exist), 3 times | plugin guide lists the real APIs; plugin_api is the only import | Use only the documented APIs; when unsure, read the code node first |
| Circular import | plugin did `from app.main import ...` at module level and silently failed to load | plugin-load test fails the candidate | Import app.plugin_api only |
| Autonomy loop | error mode re-proposed the same mirror-pull warning 3 times; fixes were no-ops | one attempt per issue per 24 h; no-op candidates refused | Fix root causes; an empty error message means look at the exception type |
| Whole-tree revert | two candidates built on the same release overwrite each other on promotion | keep one self candidate pending at a time (until the warden rebases) | Combine related self changes into one candidate |
| Fabricated research | a research task with no web fetch capability would invent URLs | capability-gap flag blocks the task | Add the capability first (research job kind), then the task |
| Nested staging repo | v12 copy sat inside the /opt/Krishna git repo; commits would sweep in fleet files | staging copies are made standalone (`git init` at their root) | Check `git rev-parse --show-toplevel` before committing |
| Self-matching pkill | `pkill -f <pattern>` matched the new watcher and killed it (exit 144) | anchored patterns only (`^...`), or kill by PID | Never pkill with a pattern your own command line contains |
| Watcher crash on restart | API returned non-JSON while prod restarted | watchers treat parse errors as "restarting" | Expect restarts after approvals; jobs resume (attempt 2) |
