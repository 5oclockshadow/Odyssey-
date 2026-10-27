---
name: self-improve
description: How to change SelfWire's own code safely — audit, plan, small edits, full test run, commit only when green.
---

# Self-improve

Use this whenever you are asked to fix, extend, or refactor SelfWire itself.

## Loop

1. **Audit first.** Call `audit_codebase()` and `run_tests()` so you know the
   baseline: score, findings, and how many tests pass.
2. **Read before you write.** `read_file(path)` every file you plan to touch.
   Never edit from memory.
3. **Smallest change that works.** Prefer `replace_in_file(path, old, new)`
   with an `old` snippet that occurs exactly once. Use `write_file` only for
   new files or full rewrites.
4. **Test what you changed.** Add or update a test under `tests/` for any new
   behaviour. Never delete, skip, or weaken an existing test.
5. **Run the full suite** with `run_tests()` (no selector). `git_commit` is
   refused unless the latest full run passed *after* your last edit.
6. **Red? Fix or roll back.** If tests fail and the fix is not obvious,
   `rollback_to(<sha before your edits>)` and try a different approach.
7. **Multi-file or risky work** goes through `start_improvement(goal)`
   instead: it checkpoints, applies, runs the suite, and keeps the change
   only if the moat accepts it.

## Moat (enforced, not optional)

`selfwire/workbench/moat.py` is read-only to you. A change is rolled back
unless the suite stays green (or gets strictly less red), the collected and
passing test counts do not drop, skipped tests do not rise, and no new
high-severity audit finding appears.
