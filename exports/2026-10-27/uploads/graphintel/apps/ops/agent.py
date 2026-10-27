"""The ops agent. Separate from SEXTANT: its one job is to report on the containers and the state of the stack and to help the operator
change code and containers. One input field, one output field. It reads freely and proposes changes; the operator's click is what runs them."""
import asyncio
import json
import os

import dspy

import ops

MISSION = """You are OPS, the monitoring agent for The Threshold Institute's stack. You are not SEXTANT and you do not research, publish or
reason about the company's graph. Your job: report accurately on the containers (host, agent docker, site docker), the engine's health, its
traces and incidents, and help the operator create, read, update and delete code and containers. Report in this order: what is wrong (with the
evidence: a log line, a span, an exit code), what is fine in one line, then what you suggest. Be brief. You never run a change yourself:
use propose() and the operator decides. Prefer the smallest change. Say plainly when you cannot tell."""


class Ops(dspy.Signature):
    intake: str = dspy.InputField(desc="the stack summary, then the operator's message")
    report: str = dspy.OutputField(desc="a short report: problems with evidence first, then suggestions")


def list_containers() -> str:
    """Every container on the host, the agent's docker and the site's docker: name, state, health, exit code, restarts, ports."""
    cs, errs = ops.containers()
    return json.dumps({"containers": [{k: c[k] for k in ("daemon", "name", "image", "state", "health", "exit", "restarts", "ports")} for c in cs], "unreachable": errs})


def container_logs(daemon: str, name: str, tail: int = 80) -> str:
    """The last `tail` log lines of one container, with timestamps."""
    try:
        return ops.logs(daemon, name, tail)[-6000:]
    except Exception as ex:
        return f"error: {getattr(ex, 'detail', ex)}"


def engine_health() -> str:
    """The engine's /health: model, queue depth, sandbox reachability, Redis, graph size."""
    import httpx
    try:
        return httpx.get(f"{ops.ENGINE}/health", timeout=5).text
    except Exception as ex:
        return f"engine unreachable: {ex}"


def read_file(path: str) -> str:
    """Read a text file in the repository (relative path)."""
    try:
        return ops.read(path)["content"][:12000]
    except Exception as ex:
        return f"error: {getattr(ex, 'detail', ex)}"


def list_files(path: str = "") -> str:
    """List a directory of the repository."""
    try:
        return "\n".join(("d " if e["dir"] else "f ") + e["path"] for e in ops.listing(path))
    except Exception as ex:
        return f"error: {getattr(ex, 'detail', ex)}"


def search_files(query: str) -> str:
    """Find the first matching line in each repository file containing `query`."""
    return json.dumps(ops.search(query))


def propose(kind: str, why: str, daemon: str = "", name: str = "", action: str = "", path: str = "", content: str = "") -> str:
    """Offer the operator a change. kind='container' with daemon (host|agent|web), name and action (start|stop|restart|pause|unpause|remove);
    or kind='edit' with path and the complete new `content` of the file. It appears as a card with a Run button; nothing happens until it is clicked."""
    if kind == "container" and (daemon not in ops.DAEMONS or action not in ops.ACTIONS or not name):
        return "refused: container proposals need daemon, name and a valid action"
    if kind == "edit":
        try:
            ops.safe(path)
        except Exception as ex:
            return f"refused: {getattr(ex, 'detail', ex)}"
    elif kind != "container":
        return "refused: kind is container or edit"
    box = ops.PROPOSALS.get()
    if box is None:
        return "refused: no operator is listening"
    box.append({"kind": kind, "why": why[:300], "daemon": daemon, "name": name, "action": action, "path": path, "content": content})
    return f"proposed; the operator will see a Run button ({len(box)} waiting)"


TOOLS = [list_containers, container_logs, engine_health, read_file, list_files, search_files, propose]
_agent = None


def agent():
    global _agent
    if _agent is None:
        Ops.__doc__ = MISSION
        dspy.configure(lm=dspy.LM(os.environ.get("OPS_MODEL", "anthropic/claude-haiku-4-5"), max_tokens=2000))
        _agent = dspy.ReAct(Ops, tools=[dspy.Tool(t) for t in TOOLS], max_iters=6)
    return _agent


async def ask(text: str, token: str | None = None) -> dict:
    st = await ops.state(token)
    brief = json.dumps({"containers": [f"{c['daemon']}/{c['name']} {c['state']} {c['health']}".strip() for c in st["containers"]], "unreachable": st["daemon_errors"],
                        "engine": st["engine"] if "error" not in st["engine"] else "unreachable"})
    box: list = []
    ops.PROPOSALS.set(box)
    try:
        pred = await asyncio.to_thread(lambda: agent()(intake=f"STACK\n{brief}\n\nOPERATOR\n{text}"))
        return {"report": pred.report, "proposals": box}
    except Exception as ex:
        return {"report": f"The ops agent could not answer: {str(ex)[:200]}. Check OPS_MODEL and the model key in .env.", "proposals": []}
