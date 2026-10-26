#!/usr/bin/env python3
"""
git_valve — a two-way communication valve over GitHub.

Two coding agents (for example a cloud Claude session and a local coding
assistant) exchange structured messages, tasks and code-change notices by
reading and writing append-only JSON files that travel through an ordinary
git branch. Commits are the transport: every message produces a commit whose
subject line summarises the exchange, so `git log` alone reads as a
conversation.

Design notes
------------
* Single file, Python standard library only (3.9+). The only external
  dependency is `git` on PATH, so the valve drops onto any machine that can
  already push to the shared repository with no `pip install`.
* Each message is written to ``valve/messages/<id>.json`` with a unique,
  timestamped identifier that is never reused — the message log is the
  immutable historical lineage of the channel.
* "Seen" state is tracked locally under ``.valve-state/`` (git-ignored) so the
  channel history stays clean and the same message is never re-delivered.
* Concurrency between two writers on one branch is handled by
  ``git pull --rebase --autostash`` plus bounded exponential-backoff retries
  on push; message files are append-only and distinctly named, so they rebase
  without conflict even while code changes are in flight.

CLI
---
    python3 git_valve.py init        --as cloud
    python3 git_valve.py send        --as cloud --to local --subject S --body B
    python3 git_valve.py inbox       --as cloud
    python3 git_valve.py read        --as cloud --id <message-id>
    python3 git_valve.py watch       --as cloud --interval 15 [--exec CMD]
    python3 git_valve.py log
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

PROTOCOL_VERSION: int = 1
VALVE_DIR: str = "valve"
MESSAGES_SUBDIR: str = "messages"
STATE_DIR: str = ".valve-state"
VALID_TYPES: Tuple[str, ...] = ("message", "task", "ack", "code-notice")
BROADCAST: str = "all"


class ValveError(Exception):
    """Raised for any recoverable valve-level failure (git, I/O, validation)."""


# --------------------------------------------------------------------------- #
# Git plumbing
# --------------------------------------------------------------------------- #
def run_git(args: Sequence[str], cwd: Path, check: bool = False) -> Tuple[int, str, str]:
    """Run a git subcommand, returning (returncode, stdout, stderr).

    Never raises on a non-zero git exit unless ``check`` is True; callers that
    care inspect the return code. Raises ValveError only when git itself could
    not be launched.
    """
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError as exc:
        raise ValveError("git executable not found on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise ValveError(f"git {' '.join(args)} timed out") from exc
    if check and proc.returncode != 0:
        raise ValveError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def repo_root(start: Optional[Path] = None) -> Path:
    """Return the top-level directory of the git repository containing ``start``."""
    cwd = start or Path.cwd()
    rc, out, err = run_git(["rev-parse", "--show-toplevel"], cwd)
    if rc != 0:
        raise ValveError(f"not inside a git repository: {err or out}")
    return Path(out)


def current_branch(root: Path) -> str:
    """Return the current branch name, or raise if detached/unknown."""
    rc, out, _ = run_git(["rev-parse", "--abbrev-ref", "HEAD"], root)
    if rc != 0 or not out or out == "HEAD":
        raise ValveError("could not determine current branch (detached HEAD?)")
    return out


def has_remote(root: Path, remote: str = "origin") -> bool:
    rc, out, _ = run_git(["remote"], root)
    return rc == 0 and remote in out.split()


def pull(root: Path, branch: str, remote: str = "origin") -> None:
    """Integrate remote changes using rebase + autostash (keeps local edits)."""
    if not has_remote(root, remote):
        return
    rc, _, err = run_git(
        ["pull", "--rebase", "--autostash", remote, branch], root
    )
    if rc != 0:
        raise ValveError(f"pull failed: {err}")


def push_with_retry(
    root: Path, branch: str, remote: str = "origin", retries: int = 4
) -> None:
    """Push the branch, retrying with exponential backoff and rebasing on reject."""
    last_err = ""
    delay = 2.0
    for attempt in range(retries + 1):
        rc, _, err = run_git(["push", "-u", remote, branch], root)
        if rc == 0:
            return
        last_err = err
        # Non-fast-forward or transient failure: integrate and retry.
        if has_remote(root, remote):
            run_git(["pull", "--rebase", "--autostash", remote, branch], root)
        if attempt < retries:
            time.sleep(delay)
            delay = min(delay * 2, 16.0)
    raise ValveError(f"push failed after {retries + 1} attempts: {last_err}")


# --------------------------------------------------------------------------- #
# Message model
# --------------------------------------------------------------------------- #
@dataclass
class Message:
    """A single valve message. Serialised one-per-file as JSON."""

    id: str
    protocol: int
    ts: str
    sender: str
    recipient: str
    type: str
    subject: str
    body: str
    refs: Dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        if self.protocol != PROTOCOL_VERSION:
            raise ValveError(
                f"unsupported protocol {self.protocol} (expected {PROTOCOL_VERSION})"
            )
        for name in ("id", "ts", "sender", "recipient", "subject"):
            if not isinstance(getattr(self, name), str) or not getattr(self, name):
                raise ValveError(f"message field '{name}' must be a non-empty string")
        if self.type not in VALID_TYPES:
            raise ValveError(f"message type '{self.type}' not in {VALID_TYPES}")
        if not isinstance(self.refs, dict):
            raise ValveError("message 'refs' must be an object")

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, ensure_ascii=False, sort_keys=True)

    @classmethod
    def from_file(cls, path: Path) -> "Message":
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValveError(f"cannot read message {path.name}: {exc}") from exc
        known = {f: raw.get(f) for f in (
            "id", "protocol", "ts", "sender", "recipient", "type", "subject", "body"
        )}
        known["refs"] = raw.get("refs", {}) or {}
        known["body"] = known.get("body") or ""
        try:
            msg = cls(**known)  # type: ignore[arg-type]
        except TypeError as exc:
            raise ValveError(f"malformed message {path.name}: {exc}") from exc
        msg.validate()
        return msg


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_id(sender: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{sender}-{secrets.token_hex(3)}"


# --------------------------------------------------------------------------- #
# Paths & state
# --------------------------------------------------------------------------- #
def messages_dir(root: Path) -> Path:
    return root / VALVE_DIR / MESSAGES_SUBDIR


def state_file(root: Path, identity: str) -> Path:
    return root / STATE_DIR / f"{identity}.json"


def load_seen(root: Path, identity: str) -> set:
    path = state_file(root, identity)
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return set(data.get("seen", []))
    except (OSError, json.JSONDecodeError):
        return set()


def save_seen(root: Path, identity: str, seen: set) -> None:
    path = state_file(root, identity)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(
            json.dumps({"identity": identity, "seen": sorted(seen)}, indent=2),
            encoding="utf-8",
        )
        tmp.replace(path)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def read_all_messages(root: Path) -> List[Message]:
    mdir = messages_dir(root)
    if not mdir.exists():
        return []
    out: List[Message] = []
    for path in sorted(mdir.glob("*.json")):
        try:
            out.append(Message.from_file(path))
        except ValveError as exc:
            print(f"warning: skipping {path.name}: {exc}", file=sys.stderr)
    out.sort(key=lambda m: (m.ts, m.id))
    return out


# --------------------------------------------------------------------------- #
# Operations
# --------------------------------------------------------------------------- #
def init_valve(root: Path, identity: str) -> None:
    """Create the valve directory, protocol doc, gitignore entry and commit."""
    mdir = messages_dir(root)
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / ".gitkeep").touch()

    gitignore = root / ".gitignore"
    line = f"{STATE_DIR}/"
    existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    if line not in existing.splitlines():
        with gitignore.open("a", encoding="utf-8") as fh:
            if existing and not existing.endswith("\n"):
                fh.write("\n")
            fh.write(f"# git_valve local cursor state\n{line}\n")

    proto = root / VALVE_DIR / "PROTOCOL.md"
    proto.write_text(_protocol_doc(), encoding="utf-8")

    branch = current_branch(root)
    run_git(["add", "--", str(mdir / ".gitkeep"), str(proto), ".gitignore"], root)
    rc, _, err = run_git(
        ["commit", "-m", f"valve: initialise channel (by {identity})",
         "--", str(mdir / ".gitkeep"), str(proto), ".gitignore"],
        root,
    )
    if rc != 0 and "nothing to commit" not in err.lower():
        raise ValveError(f"init commit failed: {err}")
    push_with_retry(root, branch)


def send(
    root: Path,
    identity: str,
    recipient: str,
    subject: str,
    body: str,
    msg_type: str = "message",
    reply_to: Optional[str] = None,
    ref_commit: Optional[str] = None,
    ref_paths: Optional[List[str]] = None,
    push: bool = True,
) -> Message:
    """Write, commit and (by default) push one message to the channel."""
    refs: Dict[str, Any] = {}
    if reply_to:
        refs["in_reply_to"] = reply_to
    if ref_commit:
        refs["commit"] = ref_commit
    if ref_paths:
        refs["paths"] = ref_paths

    msg = Message(
        id=_new_id(identity),
        protocol=PROTOCOL_VERSION,
        ts=_now_iso(),
        sender=identity,
        recipient=recipient,
        type=msg_type,
        subject=subject,
        body=body,
        refs=refs,
    )
    msg.validate()

    mdir = messages_dir(root)
    mdir.mkdir(parents=True, exist_ok=True)
    path = mdir / f"{msg.id}.json"
    if path.exists():
        raise ValveError(f"message id collision: {msg.id}")
    path.write_text(msg.to_json() + "\n", encoding="utf-8")

    rel = str(path.relative_to(root))
    commit_subject = f"valve({identity}→{recipient}): {subject} [{msg.id}]"
    run_git(["add", "--", rel], root, check=True)
    rc, _, err = run_git(["commit", "-m", commit_subject, "--", rel], root)
    if rc != 0:
        raise ValveError(f"commit failed: {err}")

    # A sender always considers its own message seen.
    seen = load_seen(root, identity)
    seen.add(msg.id)
    save_seen(root, identity, seen)

    if push:
        branch = current_branch(root)
        push_with_retry(root, branch)
    return msg


def inbox(root: Path, identity: str, do_pull: bool = True) -> List[Message]:
    """Return unseen messages addressed to ``identity`` (or broadcast)."""
    if do_pull:
        try:
            branch = current_branch(root)
            pull(root, branch)
        except ValveError as exc:
            print(f"warning: pull skipped: {exc}", file=sys.stderr)
    seen = load_seen(root, identity)
    result = [
        m for m in read_all_messages(root)
        if m.sender != identity
        and m.recipient in (identity, BROADCAST)
        and m.id not in seen
    ]
    return result


def mark_seen(root: Path, identity: str, ids: Sequence[str]) -> None:
    seen = load_seen(root, identity)
    seen.update(ids)
    save_seen(root, identity, seen)


def find_message(root: Path, msg_id: str) -> Optional[Message]:
    for m in read_all_messages(root):
        if m.id == msg_id:
            return m
    return None


def render_log(root: Path) -> str:
    lines: List[str] = []
    for m in read_all_messages(root):
        reply = f"  (reply to {m.refs['in_reply_to']})" if m.refs.get("in_reply_to") else ""
        lines.append(f"[{m.ts}] {m.sender} → {m.recipient}  <{m.type}>{reply}")
        lines.append(f"    {m.subject}")
        if m.body:
            for bl in m.body.splitlines():
                lines.append(f"      {bl}")
        if m.refs.get("commit"):
            lines.append(f"    commit: {m.refs['commit']}")
        if m.refs.get("paths"):
            lines.append(f"    paths : {', '.join(m.refs['paths'])}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n" if lines else "(channel empty)\n"


def watch(
    root: Path,
    identity: str,
    interval: int = 15,
    exec_cmd: Optional[str] = None,
    once: bool = False,
) -> List[Message]:
    """Poll the channel; print (and optionally hand off) each new message."""
    delivered: List[Message] = []
    try:
        while True:
            try:
                new = inbox(root, identity, do_pull=True)
            except ValveError as exc:
                print(f"warning: poll failed: {exc}", file=sys.stderr)
                new = []
            for m in new:
                print(f"\n▶ [{m.ts}] {m.sender} → {m.recipient} <{m.type}>: {m.subject}")
                if m.body:
                    print(m.body)
                if exec_cmd:
                    _dispatch(root, m, exec_cmd)
                delivered.append(m)
            if new:
                mark_seen(root, identity, [m.id for m in new])
            if once:
                break
            time.sleep(max(1, interval))
    except KeyboardInterrupt:
        print("\nvalve watch stopped.")
    return delivered


def _dispatch(root: Path, msg: Message, exec_cmd: str) -> None:
    """Run a handler command for one message, passing it via env + stdin."""
    env = dict(os.environ)
    env.update({
        "VALVE_MSG_ID": msg.id,
        "VALVE_MSG_SENDER": msg.sender,
        "VALVE_MSG_RECIPIENT": msg.recipient,
        "VALVE_MSG_TYPE": msg.type,
        "VALVE_MSG_SUBJECT": msg.subject,
        "VALVE_MSG_JSON": msg.to_json(),
    })
    try:
        subprocess.run(
            exec_cmd, shell=True, cwd=str(root), env=env,
            input=msg.to_json(), text=True, timeout=600,
        )
    except subprocess.TimeoutExpired:
        print(f"warning: handler timed out for {msg.id}", file=sys.stderr)
    except OSError as exc:
        print(f"warning: handler failed for {msg.id}: {exc}", file=sys.stderr)


def _protocol_doc() -> str:
    return (
        "# git_valve channel\n\n"
        "This directory is a two-way message bus between coding agents, carried\n"
        "over this git branch. Each file in `messages/` is one immutable,\n"
        "append-only message. Do not edit or delete message files by hand.\n\n"
        f"- Protocol version: {PROTOCOL_VERSION}\n"
        "- Peers (by convention): `cloud`, `local`\n"
        "- Message types: " + ", ".join(VALID_TYPES) + "\n\n"
        "Send a message:\n\n"
        "    python3 git_valve.py send --as local --to cloud \\\n"
        "        --subject \"Pushed trend-analysis refactor\" \\\n"
        "        --body \"See src/services/trends.py; tests passing.\" \\\n"
        "        --type code-notice --ref-commit $(git rev-parse HEAD)\n\n"
        "Read what the other side sent you:\n\n"
        "    python3 git_valve.py inbox --as cloud\n"
        "    python3 git_valve.py watch --as cloud --interval 20\n"
    )


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _identity(args: argparse.Namespace) -> str:
    ident = args.identity or os.getenv("VALVE_IDENTITY")
    if not ident:
        raise ValveError("identity required: pass --as <name> or set VALVE_IDENTITY")
    return ident


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="git_valve",
        description="Two-way communication valve between coding agents over GitHub.",
    )
    p.add_argument("--as", dest="identity", help="this peer's identity (e.g. cloud, local)")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="initialise the valve channel and commit it")

    s = sub.add_parser("send", help="send a message to the other peer")
    s.add_argument("--to", required=True, help="recipient identity (or 'all')")
    s.add_argument("--subject", required=True)
    s.add_argument("--body", default="")
    s.add_argument("--type", default="message", choices=VALID_TYPES)
    s.add_argument("--reply-to", dest="reply_to")
    s.add_argument("--ref-commit", dest="ref_commit")
    s.add_argument("--ref-path", dest="ref_paths", action="append")
    s.add_argument("--no-push", dest="no_push", action="store_true",
                   help="commit locally but do not push")

    i = sub.add_parser("inbox", help="list unseen messages for this peer")
    i.add_argument("--no-pull", dest="no_pull", action="store_true")
    i.add_argument("--json", dest="as_json", action="store_true")
    i.add_argument("--mark", action="store_true", help="mark listed messages as seen")

    r = sub.add_parser("read", help="print one message and mark it seen")
    r.add_argument("--id", required=True)
    r.add_argument("--no-mark", dest="no_mark", action="store_true")

    w = sub.add_parser("watch", help="poll the channel continuously")
    w.add_argument("--interval", type=int, default=15)
    w.add_argument("--exec", dest="exec_cmd", help="handler command per message")
    w.add_argument("--once", action="store_true", help="poll a single time and exit")

    sub.add_parser("log", help="render the whole channel as a conversation")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        root = repo_root()
        if args.command == "init":
            init_valve(root, _identity(args))
            print("valve initialised and pushed.")
        elif args.command == "send":
            msg = send(
                root, _identity(args), args.to, args.subject, args.body,
                msg_type=args.type, reply_to=args.reply_to,
                ref_commit=args.ref_commit, ref_paths=args.ref_paths,
                push=not args.no_push,
            )
            print(f"sent {msg.id} ({'committed' if args.no_push else 'pushed'}).")
        elif args.command == "inbox":
            msgs = inbox(root, _identity(args), do_pull=not args.no_pull)
            if args.as_json:
                print(json.dumps([asdict(m) for m in msgs], indent=2))
            elif not msgs:
                print("(no new messages)")
            else:
                for m in msgs:
                    print(f"{m.id}  [{m.ts}] {m.sender}→{m.recipient} <{m.type}>: {m.subject}")
            if args.mark and msgs:
                mark_seen(root, _identity(args), [m.id for m in msgs])
        elif args.command == "read":
            msg = find_message(root, args.id)
            if msg is None:
                print(f"message {args.id} not found", file=sys.stderr)
                return 2
            print(msg.to_json())
            if not args.no_mark:
                mark_seen(root, _identity(args), [msg.id])
        elif args.command == "watch":
            watch(root, _identity(args), interval=args.interval,
                  exec_cmd=args.exec_cmd, once=args.once)
        elif args.command == "log":
            sys.stdout.write(render_log(root))
        else:  # pragma: no cover - argparse enforces choices
            parser.error(f"unknown command {args.command}")
        return 0
    except ValveError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
