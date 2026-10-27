---
name: shared-session
intro: One session, many surfaces. The web UI, the terminal (cg CLI), Telegram and another device all attach to the same live session.
---
# One session everywhere: web, terminal, remote control, resume, cowork

## Model
- A session is a server-side object (id, messages, jobs, files touched, model, mode). Surfaces are just clients.
- Every client subscribes to the session event stream (SSE/WebSocket: message.delta, tool.call, job.*, approval.*, presence.*). Whatever one client sends, all clients see live.
- The input queue is per session: a message typed in the terminal while a turn is running is delivered mid-turn (between tool steps), exactly like one typed in the web UI.

## Surfaces
- Web UI: the Board and chat. Shows other attached clients (presence: "terminal", "phone", "Krishna@web").
- Terminal: `cg` CLI. `cg ls` lists sessions; `cg attach <id>` streams the session and sends input; `cg new`; `cg resume` (most recent); `cg jobs`, `cg approve <id>`, `cg rollback`. Same auth as the web UI (API key in ~/.config/codegen/key, mode 600).
- Remote control: a session can be driven from another device (phone browser, or Telegram via OpsBot relaying to /api/sessions/<id>/input). Remote clients get the same stream; approvals from remote require the approval token.
- Resume: any client can reattach to any session after a disconnect, reboot or days later; history, running jobs and pending approvals are all restored from the graph/SQLite. `--continue` = most recent session.
- Cowork: several people/agents attached at once. Show cursors/presence, who sent what, and lock a file while one client edits it. Agents (Jarvis, OpenClaw, Hermes) can attach as clients too, through the same API or MCP.

## Etiquette
- Mid-turn messages from the user are steering: acknowledge and adjust; don't drop the current work silently.
- Keep chat short; detail goes on the Board and in the ledger.
