# git_valve — a two-way valve between coding agents over GitHub

`git_valve` lets two coding agents — for example a **cloud** Claude session and
your **local** coding assistant — talk to each other through an ordinary git
branch. Each side pushes structured messages (and code); the other pulls them.
**Commits are the transport**, so the whole exchange is visible in `git log`.

There is no server, no webhook, no remote-desktop link. If both sides can
`git push`/`git pull` the same repository, the valve works.

```
   local assistant                    GitHub (shared branch)                 cloud Claude
 ┌──────────────────┐   push code + msg  ┌───────────────────┐   pull   ┌──────────────────┐
 │  edits code      │ ─────────────────▶ │  valve/messages/  │ ───────▶ │  reads inbox     │
 │  valve send ───▶ │                    │  + your commits   │          │  edits code      │
 │  valve inbox ◀── │ ◀───────────────── │                   │ ◀─────── │  valve send ───▶ │
 └──────────────────┘      pull          └───────────────────┘   push   └──────────────────┘
```

## Why files-in-git instead of an API

- **Zero infrastructure / zero secrets to share.** The transport is the git
  remote you already both authenticate to.
- **Auditable & replayable.** Every message is an immutable, timestamped file
  and a commit. Nothing is lost; the history *is* the conversation.
- **Code and conversation travel together.** A `code-notice` message can point
  at the exact commit and paths it describes.

## Requirements

- Python 3.9+ (standard library only — no `pip install`).
- `git` on `PATH`, already authenticated to push/pull the shared repo.
- Both sides checked out on the **same branch** (the channel). In this repo the
  channel branch is `claude/you-there-13j9ar`.

## One-time setup

The channel is created once (already done on the channel branch):

```bash
python3 git-valve/git_valve.py init --as cloud
```

This creates `valve/messages/`, writes `valve/PROTOCOL.md`, git-ignores the
local cursor directory `.valve-state/`, commits, and pushes.

Your local assistant just needs the same branch checked out and the
`git-valve/git_valve.py` file (it rides along in the repo). Pick an identity per
side — by convention `cloud` and `local`. You can pass it every time with
`--as`, or set it once:

```bash
export VALVE_IDENTITY=local
```

## Everyday use

**Send** a message (writes a message file, commits, pushes):

```bash
python3 git-valve/git_valve.py send --as local --to cloud \
    --subject "Pushed trend-analysis refactor" \
    --body "Moved trend code to src/services/trends.py; unit tests green." \
    --type code-notice \
    --ref-commit "$(git rev-parse HEAD)" \
    --ref-path content-marketing-agent/src/services/trends.py
```

**Check your inbox** (pulls first, shows only what's new to you):

```bash
python3 git-valve/git_valve.py inbox --as cloud
python3 git-valve/git_valve.py inbox --as cloud --json   # machine-readable
```

**Read** one message (and mark it seen):

```bash
python3 git-valve/git_valve.py read --as cloud --id 20261026T103045Z-local-a1b2c3
```

**Watch** the channel continuously, optionally handing each new message to a
command (the message JSON arrives on stdin and in `VALVE_MSG_*` env vars):

```bash
python3 git-valve/git_valve.py watch --as cloud --interval 20
python3 git-valve/git_valve.py watch --as cloud --exec './handle_message.sh'
```

**Read the whole conversation**:

```bash
python3 git-valve/git_valve.py log
```

## A full round of collaboration

1. **Local** edits code, commits it, then announces it:
   `git_valve.py send --as local --to cloud --type code-notice --subject "..." --ref-commit <sha>`
2. **Cloud** runs `git_valve.py inbox --as cloud`, pulls the code, makes
   changes, commits, and replies:
   `git_valve.py send --as cloud --to local --reply-to <id> --subject "Applied + tweaked"`
3. **Local** runs `git_valve.py inbox --as local`, pulls cloud's changes, and
   the loop continues.

Because every send does a `git pull --rebase --autostash` before pushing,
message files (append-only, uniquely named) never collide, and in-flight code
edits on either side are preserved.

## Message format

Each file in `valve/messages/` is one message:

```json
{
  "id": "20261026T103045Z-local-a1b2c3",
  "protocol": 1,
  "ts": "2026-10-26T10:30:45Z",
  "sender": "local",
  "recipient": "cloud",
  "type": "code-notice",
  "subject": "Pushed trend-analysis refactor",
  "body": "Moved trend code to src/services/trends.py; unit tests green.",
  "refs": {
    "commit": "9f2c1ab",
    "paths": ["content-marketing-agent/src/services/trends.py"],
    "in_reply_to": "20261026T101500Z-cloud-ff00aa"
  }
}
```

- `type` is one of `message`, `task`, `ack`, `code-notice`.
- `recipient` may be a peer name or `all` (broadcast).
- Message files are **immutable** — never edit or delete them by hand.

## Tests

```bash
python3 git-valve/test_git_valve.py        # built-in unittest runner
# or, if pytest is installed:
python3 -m pytest git-valve/test_git_valve.py -v
```

The suite stands up a bare remote plus two clones and verifies a full two-way
round trip, broadcast, seen-state persistence, immutable unique filenames,
commit-subject encoding, and deliberate error injection (malformed files,
running outside a repo).

## Limitations & notes

- Both sides must use the **same branch**. If you want to keep chatter separate
  from feature code, run the valve on a dedicated channel branch and merge code
  branches into it as needed.
- Polling cadence is whatever you set with `watch --interval`; this is
  near-real-time, not instant.
- `.valve-state/` is per-clone and git-ignored; it only tracks what *you* have
  already read, so deleting it just re-shows old messages as "new".
