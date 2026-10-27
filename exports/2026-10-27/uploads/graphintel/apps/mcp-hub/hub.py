"""The MCP hub: one MCP server in front of every other MCP server. The agent connects here and nowhere else.
Native tools: terminal_run (a throwaway container in the agent's docker), time_now. Proxy tools: servers_list, tools_list, tools_call.
Self-CRUD over its own server list: market_search, market_install, market_update, market_remove. Every change is audited."""
import asyncio
import json
import os
import re
import secrets
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

DATA = Path(os.environ.get("HUB_DATA", "/data"))
SEED = Path(__file__).with_name("servers.json")
ALLOWED_COMMANDS = {"npx", "uvx", "python", "python3", "node"}
RESERVED = {"slack", "github"}                       # social and repository servers are seeded with a deny list; the market may not shadow them
NAME = re.compile(r"[a-z0-9][a-z0-9_-]{1,40}")
ENV = re.compile(r"[A-Z][A-Z0-9_]{1,60}")
MAX_SERVERS = 30
CALL_TIMEOUT = 120
MARKET_URL = os.environ.get("MCP_REGISTRY_URL", "https://registry.modelcontextprotocol.io/v0/servers")
_tool_cache: dict[str, tuple[float, list]] = {}


def _paths():
    return DATA / "servers.json", DATA / "audit.jsonl"


def load() -> dict:
    reg_p, _ = _paths()
    DATA.mkdir(parents=True, exist_ok=True)
    if not reg_p.exists():
        shutil.copy(SEED, reg_p)
    return json.loads(reg_p.read_text())


def save(reg: dict):
    _paths()[0].write_text(json.dumps(reg, indent=1))
    _tool_cache.clear()


def audit(action: str, **kw):
    with _paths()[1].open("a") as f:
        f.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "action": action, **kw}) + "\n")


def validate(name: str, command: str, args: list, env_names: list, reg: dict | None = None, new: bool = True) -> str | None:
    """None when the server may be installed, otherwise why not. Secrets never come from the agent: it names variables the hub already holds."""
    reg = reg if reg is not None else load()
    if not NAME.fullmatch(name or ""):
        return "name: lowercase letters, digits, dash, underscore; 2 to 41 characters"
    if name in RESERVED and new:
        return f"{name} is reserved"
    if new and name in reg["servers"]:
        return f"{name} already exists; use market_update"
    if new and len(reg["servers"]) >= MAX_SERVERS:
        return f"at most {MAX_SERVERS} servers"
    if command not in ALLOWED_COMMANDS:
        return f"command must be one of {sorted(ALLOWED_COMMANDS)}"
    if not isinstance(args, list) or not all(isinstance(a, str) and len(a) < 300 for a in args) or len(args) > 20:
        return "args must be a list of up to 20 short strings"
    if any(a.startswith(("/", "..")) for a in args[1:2]) and command in ("python", "python3", "node"):
        return "run a package, not a path"
    if not all(ENV.fullmatch(e) for e in env_names):
        return "env names must look like API_KEY"
    return None


def visible(spec: dict, tool: str) -> bool:
    return tool not in spec.get("deny", [])


def parse_market(payload: dict, limit: int = 8) -> list[dict]:
    """The official registry returns {"servers": [...]}; an entry may be the server itself or wrapped under "server". Keep what an install needs."""
    out = []
    for item in (payload.get("servers") or [])[:limit]:
        s = item.get("server", item)
        pk = (s.get("packages") or [{}])[0]
        out.append({"name": s.get("name", ""), "description": (s.get("description") or "")[:200], "version": s.get("version", ""),
                    "package": pk.get("identifier") or pk.get("name", ""), "registry": pk.get("registryType") or pk.get("registry_type", ""),
                    "env": [e.get("name") for e in (pk.get("environmentVariables") or pk.get("environment_variables") or []) if e.get("name")],
                    "remote": ((s.get("remotes") or [{}])[0]).get("url", "")})
    return out


def suggest(entry: dict) -> dict:
    """npm packages run with npx, PyPI packages with uvx; anything else the agent must spell out itself."""
    if entry["registry"] == "npm":
        return {"command": "npx", "args": ["-y", entry["package"]]}
    if entry["registry"] in ("pypi", "python"):
        return {"command": "uvx", "args": [entry["package"]]}
    return {}


async def with_session(spec: dict, fn):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    env = {k: os.environ[k] for k in spec.get("env", []) if os.environ.get(k)}
    params = StdioServerParameters(command=spec["command"], args=spec["args"], env=env or None)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            return await asyncio.wait_for(fn(s), CALL_TIMEOUT)


def _spec(name: str) -> dict:
    spec = load()["servers"].get(name)
    if not spec:
        raise ValueError(f"unknown server {name}")
    if not spec.get("enabled", True):
        raise ValueError(f"{name} is disabled")
    return spec


async def servers_list() -> str:
    """The servers behind this hub: name, whether enabled, where it came from, what it is for, and which secrets it still lacks."""
    return json.dumps([{"name": n, "enabled": s.get("enabled", True), "source": s.get("source", "seed"), "note": s.get("note", ""),
                        "missing_env": [e for e in s.get("env", []) if not os.environ.get(e)], "denied_tools": s.get("deny", [])} for n, s in load()["servers"].items()])


async def tools_list(server: str) -> str:
    """List the tools of one server behind the hub, with their descriptions and argument schemas. Cached for five minutes."""
    hit = _tool_cache.get(server)
    if hit and time.time() - hit[0] < 300:
        return json.dumps(hit[1])
    spec = _spec(server)
    res = await with_session(spec, lambda s: s.list_tools())
    tools = [{"name": t.name, "description": (t.description or "")[:300], "schema": t.inputSchema} for t in res.tools if visible(spec, t.name)]
    _tool_cache[server] = (time.time(), tools)
    return json.dumps(tools)


async def tools_call(server: str, tool: str, arguments_json: str = "{}") -> str:
    """Call one tool on one server behind the hub. `arguments_json` is the JSON object of arguments from tools_list."""
    spec = _spec(server)
    if not visible(spec, tool):
        audit("denied", server=server, tool=tool)
        return f"refused: {tool} on {server} is not available to you; use publish() for posts and plan_upgrade for code"
    res = await with_session(spec, lambda s: s.call_tool(tool, json.loads(arguments_json or "{}")))
    audit("call", server=server, tool=tool)
    return "\n".join(getattr(c, "text", str(c)) for c in res.content)[:20000]


async def market_search(query: str, limit: int = 8) -> str:
    """Search the MCP registry for servers. Returns name, description, package, and the environment variables it wants."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(MARKET_URL, params={"search": query, "limit": limit})
        r.raise_for_status()
    found = parse_market(r.json(), limit)
    return json.dumps([{**e, "suggested": suggest(e)} for e in found])


async def market_install(name: str, command: str, args_json: str, env_names_json: str = "[]", note: str = "") -> str:
    """Install an MCP server for yourself. command is npx, uvx, python or node; args_json is a JSON list; env_names_json lists variable
    NAMES the hub already holds (you cannot supply secret values). It is available at once through tools_list and tools_call."""
    reg, args, env = load(), json.loads(args_json), json.loads(env_names_json)
    if (why := validate(name, command, args, env, reg)):
        return f"refused: {why}"
    reg["servers"][name] = {"command": command, "args": args, "env": env, "enabled": True, "source": "market", "note": note[:200]}
    save(reg)
    audit("install", server=name, command=command, args=args)
    return f"installed {name}; missing env: {[e for e in env if not os.environ.get(e)] or 'none'}"


async def market_update(name: str, args_json: str = "", note: str = "", enabled: str = "") -> str:
    """Change a server: new args (market servers only), a note, or enabled = 'true' / 'false' (any server)."""
    reg = load()
    spec = reg["servers"].get(name)
    if not spec:
        return "refused: unknown server"
    if args_json:
        if spec.get("source") != "market":
            return "refused: seeded servers keep their arguments"
        args = json.loads(args_json)
        if (why := validate(name, spec["command"], args, spec.get("env", []), reg, new=False)):
            return f"refused: {why}"
        spec["args"] = args
    if note:
        spec["note"] = note[:200]
    if enabled in ("true", "false"):
        spec["enabled"] = enabled == "true"
    save(reg)
    audit("update", server=name, args=spec["args"], enabled=spec.get("enabled", True))
    return f"updated {name}"


async def market_remove(name: str) -> str:
    """Remove a server you installed. Seeded servers can be disabled with market_update but not removed."""
    reg = load()
    spec = reg["servers"].get(name)
    if not spec:
        return "refused: unknown server"
    if spec.get("source") != "market":
        return "refused: seeded servers can be disabled, not removed"
    del reg["servers"][name]
    save(reg)
    audit("remove", server=name)
    return f"removed {name}"


def _docker():
    import docker
    return docker.from_env(timeout=150)


async def terminal_run(command: str, network: bool = False, timeout: int = 60) -> str:
    """Run a shell command in a throwaway python:3.12 container in the agent's docker (bash, git, curl, compilers; any language you can install).
    /work persists between calls. No network unless network=true. 1 GB of memory, one CPU. Returns exit code, stdout and stderr."""
    def run() -> str:
        d = _docker()
        try:
            d.images.get("python:3.12")
        except Exception:
            d.images.pull("python:3.12")
        c = d.containers.create("python:3.12", command=["bash", "-lc", command], working_dir="/work", network_disabled=not network, mem_limit="1g", nano_cpus=10**9,
                                pids_limit=256, volumes={"terminal-work": {"bind": "/work", "mode": "rw"}}, labels={"threshold": "terminal"})
        try:
            c.start()
            try:
                code = c.wait(timeout=max(1, min(int(timeout), 600))).get("StatusCode", 1)
            except Exception:
                c.kill()
                code = 124
            out, err = c.logs(stdout=True, stderr=False).decode(errors="replace"), c.logs(stdout=False, stderr=True).decode(errors="replace")
        finally:
            c.remove(force=True)
        audit("terminal", command=command[:200], network=network)
        return f"exit {code}\n--- stdout\n{out[-6000:]}\n--- stderr\n{err[-3000:]}"
    return await asyncio.to_thread(run)


async def time_now(tz: str = "UTC") -> str:
    """The current date and time in an IANA timezone, e.g. Europe/London."""
    try:
        return datetime.now(ZoneInfo(tz)).isoformat(timespec="seconds")
    except Exception:
        return f"unknown timezone {tz}"


async def audit_tail(n: int = 40) -> str:
    """The last n audited hub actions, newest first: installs, updates, removals, denied calls, terminal commands."""
    p = _paths()[1]
    return json.dumps([json.loads(ln) for ln in (p.read_text().splitlines()[-max(1, min(int(n), 200)):] if p.exists() else [])][::-1])


TOOLS = [servers_list, tools_list, tools_call, market_search, market_install, market_update, market_remove, terminal_run, time_now, audit_tail]


class Bearer:
    """ASGI middleware: every request but /healthz carries Authorization: Bearer <HUB_TOKEN>. With no token set the hub refuses to serve."""

    def __init__(self, app, token: str | None):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] != "/healthz":
            sent = dict(scope["headers"]).get(b"authorization", b"").decode()
            if not self.token or not secrets.compare_digest(sent, f"Bearer {self.token}"):
                await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"text/plain")]})
                await send({"type": "http.response.body", "body": b"hub token required"})
                return
        await self.app(scope, receive, send)


def build():
    from mcp.server.fastmcp import FastMCP
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    mcp = FastMCP("threshold-hub", host="0.0.0.0", port=int(os.environ.get("PORT", "8765")), stateless_http=True)
    try:                                              # behind the docker network the Host header is a service name, not localhost
        from mcp.server.transport_security import TransportSecuritySettings
        mcp.settings.transport_security = TransportSecuritySettings(enable_dns_rebinding_protection=False)
    except ImportError:
        pass
    for fn in TOOLS:
        mcp.tool()(fn)
    app = mcp.streamable_http_app()
    app.router.routes.append(Route("/healthz", lambda r: PlainTextResponse("ok")))
    return Bearer(app, os.environ.get("HUB_TOKEN"))


if __name__ == "__main__":
    import uvicorn
    load()
    uvicorn.run(build(), host="0.0.0.0", port=int(os.environ.get("PORT", "8765")), log_level="info")
