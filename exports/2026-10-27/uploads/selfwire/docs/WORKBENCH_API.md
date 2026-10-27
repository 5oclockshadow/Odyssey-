# SelfWire Workbench — HTTP API contract (v0.3.0)

Base URL: `http://127.0.0.1:8765` (default). All JSON. All paths below are
relative to the served repo root ("the workspace").

## Auth

If the server was started with a token (`SELFWIRE_WORKBENCH_TOKEN` or
`--token`), every `/api/*` request must carry it as header
`X-Selfwire-Token: <token>` **or** query `?token=<token>` (the query form
exists because `EventSource` cannot set headers). Missing/wrong token →
`401 {"detail": "invalid or missing workbench token"}`. `GET /` (the UI) is
always served; the UI reads `?token=` from its own URL once and then sends it
on every call.

## Host / Origin guard

Requests whose `Host` (or `Origin`, when present) is not loopback
(`127.0.0.1`, `localhost`, `::1`) or a name passed with `--allow-host` get
`403`. This blocks DNS-rebinding attacks from web pages.

## Pages

- `GET /` — the dashboard as it was when the server started.
- `GET /preview` — the dashboard file as it is on disk now (including agent
  edits), served with a CSP of `connect-src 'none'`: it renders but cannot
  call the API. Restart adopts it.

## Errors

Any failure → non-2xx with `{"detail": "<human readable message>"}`.
- `400` invalid input (e.g. path escapes the workspace, protected path)
- `404` not found
- `409` conflict (e.g. a job of that kind is already running)

## Events — `GET /api/events` (Server-Sent Events)

Each message: `event: <type>` + `data: <json>`. Types:

| type | data |
|---|---|
| `hello` | `{version, root}` — sent once on connect |
| `job` | `Job` (see below) — every status change |
| `test_line` | `{job_id, line}` — one line of live pytest output |
| `test_report` | `{job_id, report: TestReport}` |
| `improve` | `{job_id, attempt, phase, message, data}` — `phase` ∈ `audit, plan, apply, test, commit, rollback, done, error` |
| `chat` | `ChatMessage` |
| `file` | `{op: "write"\|"delete"\|"move", path, dst?}` |
| `git` | `{op: "commit"\|"rollback"\|"checkpoint", sha, message}` |
| `ping` | `{t}` — keepalive every 15s |

## Health / settings

- `GET /api/health` → `{ok: true, version, root, lm_configured: bool, model: str|null, python}`
- `GET /api/settings` → `{model: str|null, has_key: bool, api_base: str|null, max_iters: int, allow_unsafe_levers: bool}`
- `POST /api/settings` body `{model?, api_key?, api_base?, max_iters?, allow_unsafe_levers?}` → same shape as GET.
  `allow_unsafe_levers` (default false) re-enables the agent's exec and MCP-launch actions, which bypass the moat.
  The key is held **in server memory only**, never written to disk or echoed back.

## Files (CRUD on the workspace)

- `GET /api/tree` → `{root, files: [{path, size, mtime}], protected: [str]}`
  Flat, sorted list of every non-ignored file. `protected` are path prefixes
  that are read-only (writes/deletes to them return 400).
- `GET /api/file?path=<rel>` → `{path, content, size, mtime}`
- `PUT /api/file` body `{path, content}` → `{ok: true, path, size}` (creates parent dirs)
  — tree-mutating routes (file PUT/DELETE/move, git commit/rollback, skill PUT/DELETE) return `409` while an improvement job runs
- `DELETE /api/file?path=<rel>` → `{ok: true, path}`
- `POST /api/file/move` body `{src, dst}` → `{ok: true, src, dst}`

## Git

- `GET /api/git/status` → `{branch, head, dirty: bool, changes: [{status, path}]}`
- `GET /api/git/log?limit=30` → `{commits: [{sha, short, message, author, date, tags: [str]}]}`
- `GET /api/git/diff?ref=<optional sha>` → `{diff: str}` (working tree vs HEAD, or that commit's patch)
- `POST /api/git/commit` body `{message}` → `{sha}` (400 if nothing to commit)
- `POST /api/git/rollback` body `{sha}` → `{head}` — hard-resets tracked files to `sha` and removes untracked, non-ignored files

## Tests

- `POST /api/tests/run` body `{selector?: str, keyword?: str}` → `{job_id}`
  (`selector` = pytest node/path like `tests/test_registry.py`; `keyword` = `-k` expression)
- `GET /api/tests/last` → `TestReport | null`

`TestReport`:
```json
{"ok": true, "exit_code": 0, "total": 91, "passed": 91, "failed": 0, "errors": 0,
 "skipped": 0, "duration": 8.6, "selector": null, "keyword": null,
 "started_at": 1761450000.0, "finished_at": 1761450008.6,
 "failures": [{"nodeid": "tests/x.py::test_y", "message": "AssertionError: ...", "text": "full traceback"}],
 "output_tail": "last ~200 lines of pytest output"}
```

## Audit

- `POST /api/audit` → `AuditReport`
- `GET /api/audit/last` → `AuditReport | null`

`AuditReport`:
```json
{"score": 87, "generated_at": 1761450000.0, "files_scanned": 30,
 "metrics": {"py_files": 20, "test_files": 12, "loc": 4100, "untested_modules": ["selfwire/x.py"]},
 "findings": [{"severity": "high|medium|low|info", "rule": "syntax-error", "path": "selfwire/x.py", "line": 12, "message": "..."}],
 "plan": [{"priority": 1, "title": "Fix syntax error in selfwire/x.py", "detail": "...", "paths": ["selfwire/x.py"]}]}
```

## Self-improvement loop

- `POST /api/improve` body `{goal: str, max_attempts?: int (default 3)}` → `{job_id}`
  Requires a configured LM (400 otherwise). Progress arrives as `improve` events;
  the final result is the job's `result`:

```json
{"status": "committed|rolled_back|no_change|failed", "commit_sha": "abc123"|null,
 "baseline": {"passed": 91, "total": 91},
 "attempts": [{"n": 1, "rationale": "...", "changes": [{"op": "write|replace|delete", "path": "..."}],
               "test": {"ok": false, "passed": 90, "failed": 1, "total": 91},
               "outcome": "rolled_back|committed|rejected", "reason": "..."}]}
```

## Jobs

`Job`: `{id, kind: "tests"|"improve", title, status: "queued"|"running"|"succeeded"|"failed"|"cancelled", group, created_at, started_at, finished_at, result, error}`
— a `tests` job's `result` is a `TestReport`; an `improve` job's is the improvement result above.
`tests` and `improve` jobs share the exclusive group `"workspace"`: starting one while another runs → `409`.

- `GET /api/jobs` → `{jobs: [Job]}` (newest first, max 50)
- `GET /api/jobs/{id}` → `Job`
- `POST /api/jobs/{id}/cancel` → `{ok: bool}`

## Skills

Markdown files under `skills/<name>/SKILL.md` with YAML-ish frontmatter
(`name`, `description`). The agent reads them into its context every turn.

- `GET /api/skills` → `{skills: [{name, description, path}]}`
- `GET /api/skills/{name}` → `{name, description, path, content}`
- `PUT /api/skills/{name}` body `{content}` → `{ok: true, name, path}`
- `DELETE /api/skills/{name}` → `{ok: true, name}`

## Chat

- `POST /api/chat` body `{message}` → `{reply: str, kind: "command"|"agent"|"help"|"error", steps: [..], data: any, message_id: str}`
  (`message_id` is the id of the assistant `ChatMessage` that the same reply also produces as an SSE `chat` event, for de-duplication)
- `GET /api/chat/history` → `{messages: [ChatMessage]}`

`ChatMessage`: `{id, role: "user"|"assistant"|"system", text, kind, ts, steps?: [...], data?: any}`

Slash commands (work with **no LM configured**):
`/help`, `/ls [prefix]`, `/cat <path>`, `/write <path>` + newline + content,
`/rm <path>`, `/mv <src> <dst>`, `/test [selector] [-k expr]`, `/audit`,
`/diff`, `/log`, `/commit <msg>`, `/rollback <sha>`, `/improve <goal>`,
`/skills`, `/skill <name>`, `/tools`, `/model <litellm-model-id>`.
Free text (no slash) goes to the SelfWire agent when an LM is configured.

## Agent introspection

- `GET /api/tools` → `{tools: {name: {source, version, call_count, error_count, added_at}}}`
- `GET /api/graph` → `{nodes: [{id, source, calls, x, y, z}], edges: [{source, target, weight}]}`

## Restart

- `POST /api/restart` → `{ok: true, restarting: true}` — re-execs the server
  process ~0.5s later so backend and dashboard edits take effect, after
  checking in a fresh interpreter that the new code imports (400 otherwise).
