"""
chat.py — the conversation surface of the workbench.

Messages starting with "/" are commands that work with no language model at
all (file CRUD, tests, audit, git, skills). Anything else goes to the
SelfWire agent — the dual-brain loop with the workbench toolkit registered as
tools — once a model is configured. Every message (user, assistant, and
system notices such as "test job finished") is published as a `chat` event,
so every open dashboard sees the same conversation.
"""

from __future__ import annotations

import shlex
import threading
import time
import uuid
from collections import deque
from typing import TYPE_CHECKING, Any, Callable, Literal, Optional

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .core import Workbench
    from .jobs import Job

MAX_CAT_CHARS = 20_000
MAX_DIFF_CHARS = 20_000

HELP = """Commands (no model needed):
  /ls [prefix]                 list files
  /cat <path>                  show a file
  /write <path>                first line; the full new content goes on the following lines
  /rm <path>                   delete a file
  /mv <src> <dst>              move / rename
  /test [selector] [-k expr]   run tests (live output in the Tests panel)
  /audit                       score, findings, improvement plan
  /diff  /log                  uncommitted diff, recent commits
  /commit <message>            commit everything
  /rollback <sha>              hard-reset to a commit
  /improve <goal>              test-gated self-improvement (needs a model)
  /skills  /skill <name>       list / show skills
  /tools                       the agent's registered tools
  /model <litellm-id>          e.g. anthropic/claude-sonnet-4-5 (key goes in Settings)
Plain messages go to the agent once a model is configured."""

NO_LM = (
    "No language model is configured yet, so I can only run commands. "
    "Set one with `/model <litellm-id>` (and the API key in Settings), or type `/help`."
)


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant", "system"]
    text: str
    kind: str = "text"
    ts: float
    steps: Optional[list] = None
    data: Any = None


class ChatReply(BaseModel):
    reply: str
    kind: Literal["command", "agent", "help", "error"]
    steps: list = Field(default_factory=list)
    data: Any = None
    message_id: str = ""


def _fence(body: str, lang: str = "") -> str:
    return f"```{lang}\n{body.rstrip()}\n```"


class ChatService:
    def __init__(self, wb: "Workbench", history_limit: int = 500) -> None:
        self.wb = wb
        self._lock = threading.Lock()
        self._messages: deque[ChatMessage] = deque(maxlen=history_limit)

    # -- history -----------------------------------------------------------------
    def _add(self, role: str, text: str, kind: str = "text", steps: Optional[list] = None, data: Any = None) -> ChatMessage:
        msg = ChatMessage(id=uuid.uuid4().hex[:12], role=role, text=text, kind=kind, ts=time.time(), steps=steps, data=data)
        with self._lock:
            self._messages.append(msg)
        self.wb.bus.publish("chat", msg.model_dump(mode="json"))
        return msg

    def history(self) -> list[ChatMessage]:
        with self._lock:
            return list(self._messages)

    def notify(self, text: str, data: Any = None) -> ChatMessage:
        return self._add("system", text, kind="notice", data=data)

    def notify_job(self, job: "Job") -> None:
        if job.kind == "tests" and isinstance(job.result, dict):
            r = job.result
            verdict = "PASSED" if r.get("ok") else "FAILED"
            text = (f"Test job {job.id} {verdict}: {r.get('passed', 0)}/{r.get('total', 0)} passed, "
                    f"{r.get('failed', 0)} failed, {r.get('errors', 0)} errors in {r.get('duration', 0):.1f}s")
            failures = r.get("failures") or []
            if failures:
                text += "\n" + "\n".join(f"  - {f.get('nodeid')}: {str(f.get('message', ''))[:160]}" for f in failures[:5])
        elif job.kind == "improve" and isinstance(job.result, dict):
            r = job.result
            sha = r.get("commit_sha")
            text = f"Improvement job {job.id} finished: {r.get('status')}" + (f" — committed {sha[:10]}" if sha else "")
            for a in r.get("attempts", []):
                text += f"\n  attempt {a.get('n')}: {a.get('outcome')} — {str(a.get('reason', ''))[:200]}"
        else:
            text = f"{job.kind} job {job.id} {job.status}" + (f": {job.error}" if job.error else "")
        self.notify(text, data={"job_id": job.id, "status": job.status})

    # -- entry point ---------------------------------------------------------------
    def handle(self, text: str) -> ChatReply:
        text = (text or "").strip()
        if not text:
            raise ValueError("message is empty")
        self._add("user", text)
        try:
            if text.startswith("/"):
                reply = self._command(text)
            elif self.wb.settings.configured():
                reply = self._agent_turn(text)
            else:
                reply = ChatReply(reply=NO_LM, kind="help")
        except Exception as e:  # every failure becomes a visible chat reply, never a dropped message
            reply = ChatReply(reply=f"{type(e).__name__}: {e}", kind="error")
        msg = self._add("assistant", reply.reply, kind=reply.kind, steps=reply.steps or None, data=reply.data)
        reply.message_id = msg.id
        return reply

    # -- commands --------------------------------------------------------------------
    def _guard(self) -> None:
        if self.wb.improve_running():
            raise RuntimeError("an improvement job owns the workspace right now; wait for it or cancel it in Jobs")

    def _command(self, text: str) -> ChatReply:
        first, _, body = text.partition("\n")
        cmd, _, rest = first.strip().partition(" ")
        handler = self._handlers().get(cmd.lower())
        if handler is None:
            raise ValueError(f"unknown command {cmd.lower()!r}; type /help")
        return handler(rest.strip(), body)

    def _handlers(self) -> dict[str, Callable[[str, str], ChatReply]]:
        return {
            "/help": self._cmd_help, "/?": self._cmd_help, "/ls": self._cmd_ls, "/cat": self._cmd_cat,
            "/write": self._cmd_write, "/rm": self._cmd_rm, "/mv": self._cmd_mv, "/test": self._cmd_test,
            "/audit": self._cmd_audit, "/diff": self._cmd_diff, "/log": self._cmd_log, "/commit": self._cmd_commit,
            "/rollback": self._cmd_rollback, "/improve": self._cmd_improve, "/skills": self._cmd_skills,
            "/skill": self._cmd_skill, "/tools": self._cmd_tools, "/model": self._cmd_model,
        }

    @staticmethod
    def _require(rest: str, usage: str) -> str:
        if not rest:
            raise ValueError(f"usage: {usage}")
        return rest

    def _cmd_help(self, rest: str, body: str) -> ChatReply:
        return ChatReply(reply=HELP, kind="help")

    def _cmd_ls(self, rest: str, body: str) -> ChatReply:
        files = [f for f in self.wb.workspace.list_files() if f.path.startswith(rest)]
        listing = "\n".join(f"{f.path}  ({f.size} B)" for f in files[:400])
        more = f"\n... and {len(files) - 400} more" if len(files) > 400 else ""
        return ChatReply(reply=f"{len(files)} file(s)\n" + _fence(listing + more or "(none)"), kind="command",
                         data={"count": len(files)})

    def _cmd_cat(self, rest: str, body: str) -> ChatReply:
        path = self._require(rest, "/cat <path>")
        content = self.wb.workspace.read(path)
        clipped = content[:MAX_CAT_CHARS]
        note = f"\n[truncated: {len(content)} chars]" if len(content) > len(clipped) else ""
        return ChatReply(reply=f"{self.wb.workspace.normalize(path)}\n" + _fence(clipped) + note, kind="command")

    def _cmd_write(self, rest: str, body: str) -> ChatReply:
        path = self._require(rest, "/write <path>, then the full content on the following lines")
        self._guard()
        info = self.wb.workspace.write(path, body)
        return ChatReply(reply=f"wrote {info.path} ({info.size} bytes)", kind="command", data=info.model_dump())

    def _cmd_rm(self, rest: str, body: str) -> ChatReply:
        path = self._require(rest, "/rm <path>")
        self._guard()
        return ChatReply(reply=f"deleted {self.wb.workspace.delete(path)}", kind="command")

    def _cmd_mv(self, rest: str, body: str) -> ChatReply:
        args = shlex.split(rest)
        if len(args) != 2:
            raise ValueError("usage: /mv <src> <dst>")
        self._guard()
        a, b = self.wb.workspace.move(args[0], args[1])
        return ChatReply(reply=f"moved {a} -> {b}", kind="command")

    def _cmd_test(self, rest: str, body: str) -> ChatReply:
        selector, keyword = self._parse_test_args(rest)
        job = self.wb.start_tests_job(selector, keyword)
        return ChatReply(reply=f"Started test job {job.id} ({job.title}); live output is in the Tests panel.",
                         kind="command", data={"job_id": job.id})

    def _cmd_audit(self, rest: str, body: str) -> ChatReply:
        audit = self.wb.run_audit()
        lines = [f"Audit score {audit.score}/100 — {audit.files_scanned} files, {audit.counts()}"]
        lines += [f"  [{f.severity}] {f.rule} {f.path or ''}{':' + str(f.line) if f.line else ''} — {f.message}"
                  for f in audit.findings[:12]]
        if audit.plan:
            lines.append("Plan:")
            lines += [f"  {p.priority}. {p.title}" for p in audit.plan]
        return ChatReply(reply="\n".join(lines), kind="command", data={"score": audit.score})

    def _cmd_diff(self, rest: str, body: str) -> ChatReply:
        diff = self.wb.workspace.diff()
        if not diff.strip():
            return ChatReply(reply="No uncommitted changes.", kind="command")
        note = f"\n[truncated: {len(diff)} chars]" if len(diff) > MAX_DIFF_CHARS else ""
        return ChatReply(reply=_fence(diff[:MAX_DIFF_CHARS], "diff") + note, kind="command")

    def _cmd_log(self, rest: str, body: str) -> ChatReply:
        commits = self.wb.workspace.log(15)
        lines = [f"{c.short}  {c.date[:19]}  {c.message}" + (f"  [{', '.join(c.tags)}]" if c.tags else "") for c in commits]
        return ChatReply(reply=_fence("\n".join(lines) or "(no commits)"), kind="command")

    def _cmd_commit(self, rest: str, body: str) -> ChatReply:
        message = self._require(rest, "/commit <message>")
        self._guard()
        sha = self.wb.workspace.commit(message)
        return ChatReply(reply=f"committed {sha[:10]}", kind="command", data={"sha": sha})

    def _cmd_rollback(self, rest: str, body: str) -> ChatReply:
        ref = self._require(rest, "/rollback <sha>")
        self._guard()
        sha = self.wb.workspace.rollback(ref)
        return ChatReply(reply=f"rolled back to {sha[:10]}", kind="command", data={"sha": sha})

    def _cmd_improve(self, rest: str, body: str) -> ChatReply:
        goal = self._require((rest + ("\n" + body if body else "")).strip(), "/improve <goal>")
        job = self.wb.start_improve_job(goal, 3)
        return ChatReply(reply=f"Started improvement job {job.id}. Each attempt is kept only if the moat accepts it.",
                         kind="command", data={"job_id": job.id})

    def _cmd_skills(self, rest: str, body: str) -> ChatReply:
        listing = "\n".join(f"{s.name}: {s.description}" for s in self.wb.skills.list()) or "(none)"
        return ChatReply(reply=_fence(listing), kind="command")

    def _cmd_skill(self, rest: str, body: str) -> ChatReply:
        skill = self.wb.skills.get(self._require(rest, "/skill <name>"))
        return ChatReply(reply=_fence(skill.content or "", "markdown"), kind="command")

    def _cmd_tools(self, rest: str, body: str) -> ChatReply:
        stats = self.wb.agent().registry.stats()
        listing = "\n".join(f"{n}  [{s['source']}] calls={s['call_count']} errors={s['error_count']}"
                            for n, s in sorted(stats.items()))
        return ChatReply(reply=_fence(listing), kind="command", data={"count": len(stats)})

    def _cmd_model(self, rest: str, body: str) -> ChatReply:
        if not rest:
            current = self.wb.settings.public()
            return ChatReply(reply=f"model: {current['model'] or '(none)'}; key: {'yes' if current['has_key'] else 'no'}",
                             kind="command", data=current)
        current = self.wb.settings.update(model=rest)
        key = "yes" if current["has_key"] else "no — add it in Settings"
        return ChatReply(reply=f"model set to {current['model']} (key: {key})", kind="command", data=current)

    @staticmethod
    def _parse_test_args(rest: str) -> tuple[Optional[str], Optional[str]]:
        tokens = shlex.split(rest)
        selector: Optional[str] = None
        keyword: Optional[str] = None
        i = 0
        while i < len(tokens):
            if tokens[i] == "-k":
                if i + 1 >= len(tokens):
                    raise ValueError("usage: /test [selector] [-k expression]")
                keyword = tokens[i + 1]
                i += 2
                continue
            selector = tokens[i]
            i += 1
        return selector, keyword

    # -- agent -------------------------------------------------------------------------
    def _agent_turn(self, text: str) -> ChatReply:
        with self._lock:
            earlier = list(self._messages)[:-1][-10:]
        convo = "\n".join(f"{m.role}: {m.text[:600]}" for m in earlier) or "(start of conversation)"
        task = (
            "You are SelfWire, working inside your own codebase through the workbench tools "
            "(read/write files, run tests, audit, git, skills). Read files before editing them, "
            "run the full test suite after edits, and only commit when it is green.\n\n"
            f"{self.wb.skills.context_block()}\n\nRECENT CONVERSATION:\n{convo}\n\nUSER REQUEST:\n{text}"
        )
        pred = self.wb.agent_turn(task)
        steps = [
            {
                "iteration": s.get("iteration"), "action_type": s.get("action_type"), "tool_name": s.get("tool_name"),
                "rationale": s.get("rationale"), "observation": str(s.get("observation", ""))[:4000],
            }
            for s in (pred.steps or [])
        ]
        answer = pred.final_answer or f"(stopped after {pred.iterations} step(s) without a final answer; see the steps)"
        return ChatReply(reply=answer, kind="agent", steps=steps,
                         data={"run_id": pred.run_id, "iterations": pred.iterations})
