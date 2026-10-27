---
name: codebase-crud
description: Reference for the workbench file, git, and skill tools — paths, limits, and what each refuses.
---

# Codebase CRUD

All paths are relative to the repo root, e.g. `selfwire/workbench/tester.py`.

| Tool | Use | Refuses when |
|---|---|---|
| `list_files(prefix)` | find files | — |
| `read_file(path, start_line, end_line)` | read with line numbers | binary or > 2 MB |
| `write_file(path, content)` | create / overwrite | protected path, off-limits dir |
| `replace_in_file(path, old, new)` | precise edit | `old` matches 0 or 2+ times |
| `delete_file(path)` / `move_file(src, dst)` | remove / rename | protected path; dst exists |
| `run_tests(selector, keyword)` | pytest | another test/improve job running |
| `git_diff()` / `git_status()` / `git_log(n)` | inspect | — |
| `git_commit(message)` | commit | last full run red, or edits since it |
| `rollback_to(sha)` | hard reset | unknown sha |
| `write_skill(name, content)` | save a new skill | invalid name |

Off-limits everywhere: `.git/`, `.venv/`, `.env`, caches, `node_modules/`,
`.selfwire/` (workbench state). Every mutating tool refuses while an
improvement job is running.

The dashboard UI lives at `selfwire/workbench/ui/index.html` and you may edit
it: your edits render at `/preview` (no API access) and the human adopts them
with Restart. The rest of `selfwire/workbench/`, every `conftest.py`, and the
pytest config files are the test harness — read-only to you; ask the human.
Writes whose added lines contain gaming constructs (os._exit, JUnit access,
pytest_plugins, pytest hooks, .git/.pth access, sys.argv in tests) are refused.
The `write_tool` (exec) and `add_mcp_server` actions are off unless the human
enables unsafe levers.
