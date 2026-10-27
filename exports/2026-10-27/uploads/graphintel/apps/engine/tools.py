"""Tools the one agent can call. Local tools live here; the MCP hub's tools (terminal, time, filesystem, GitHub, Slack, Wolfram, Apify,
the MCP market and the registry of its own servers) are attached at runtime. The agent reads its source; it never writes it."""
import json
import logging
import os
import re
import subprocess
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from pathlib import Path

import dspy
import httpx

import mindful
import publishing
import upgrades

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("THRESHOLD_ROOT") or HERE.parents[1])
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
BLOCKED = {".git", "state", "node_modules", "__pycache__"}
CFG: dict = {}
GRAPH = None
log = logging.getLogger("tools")


def web_search(query: str, k: int = 5) -> str:
    """Search the web. Returns up to k results as 'title — url' followed by a snippet. Use before any factual claim."""
    from ddgs import DDGS
    hits = DDGS().text(query, max_results=k)
    return "\n\n".join(f"{r['title']} — {r['href']}\n{r['body']}" for r in hits) or "no results"


def fetch_url(url: str, chars: int = 6000) -> str:
    """Fetch a web page and return its visible text, truncated to `chars`."""
    html = httpx.get(url, timeout=20, follow_redirects=True, headers={"user-agent": "threshold-institute/0.3"}).text
    text = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html, flags=re.I)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))[:chars]


def graph_query(term: str) -> str:
    """Find nodes, types and hyperedges in the Institute's graph whose id, label, type or relation contains `term`. Telemetry
    (spans, logs, incidents, patches, and every file and function of your own source) is in the same graph: 'incident',
    'code:tools', 'file:heal.py' or a trace id all work."""
    t = term.lower()
    nodes = [n for n in GRAPH.nodes.values() if t in n["id"].lower() or t in str(n.get("label", "")).lower() or t in str(n.get("type", "")).lower()]
    edges = [e for e in GRAPH.edges.values() if t in e["relation"].lower() or any(t in m.lower() for m in e["members"])]
    return json.dumps({"nodes": nodes[:20], "edges": edges[:20]})


def _inside(rel: str) -> Path:
    p = (ROOT / rel).resolve()
    if p != ROOT and ROOT not in p.parents:
        raise ValueError("outside the repository")
    if any(x in BLOCKED or x.startswith(".env") or x == "session.secret" for x in p.relative_to(ROOT).parts):
        raise ValueError("not readable")
    return p


def list_source(path: str = "apps/engine") -> str:
    """List the files under `path` in your own repository (read-only). Use it before read_source."""
    try:
        p = _inside(path)
        return "\n".join(sorted(str(f.relative_to(ROOT)) for f in p.rglob("*") if f.is_file() and not (BLOCKED & set(f.relative_to(ROOT).parts)))[:300]) or "empty"
    except ValueError as ex:
        return f"refused: {ex}"


def read_source(path: str, start: int = 1, end: int = 400) -> str:
    """Read one of your own source files with line numbers (lines start..end). You can read everything and edit nothing:
    to change your code or configuration, call plan_upgrade."""
    try:
        lines = _inside(path).read_text().splitlines()
    except (ValueError, OSError, UnicodeDecodeError) as ex:
        return f"refused: {ex}"
    return "\n".join(f"{i:5d}  {ln}" for i, ln in enumerate(lines[start - 1:end], start=start))[:20000]


def plan_upgrade(title: str, rationale: str, diff: str = "") -> str:
    """Propose a change to your own code or configuration. You cannot edit your source. The operator approves, the sandbox runs the
    whole test suite, and a pull request opens. `diff` is an optional unified diff against the repository root (paths like
    apps/engine/tools.py); without it the proposal is a plan and becomes an issue. Say what you observed that motivates it."""
    rec = upgrades.propose(title, rationale, diff)
    return f"proposed {rec['id']}; it waits for the operator"


def run_tests(path: str = ".") -> str:
    """Run pytest in `path` and return the tail of its output."""
    p = subprocess.run(["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", path], capture_output=True, text=True, timeout=600)
    return (p.stdout + p.stderr)[-3000:]


def send(channel: str, text: str, title: str = "") -> str:
    """The actual post. Raises KeyError on a missing credential."""
    if channel == "x":
        import tweepy
        c = tweepy.Client(consumer_key=os.environ["X_API_KEY"], consumer_secret=os.environ["X_API_SECRET"],
                          access_token=os.environ["X_ACCESS_TOKEN"], access_token_secret=os.environ["X_ACCESS_SECRET"])
        return f"posted to x: {c.create_tweet(text=text[:280]).data['id']}"
    if channel == "reddit":
        import praw
        r = praw.Reddit(client_id=os.environ["REDDIT_CLIENT_ID"], client_secret=os.environ["REDDIT_CLIENT_SECRET"],
                        username=os.environ["REDDIT_USERNAME"], password=os.environ["REDDIT_PASSWORD"], user_agent="threshold-institute/0.3")
        sub = CFG.get("publish", {}).get("reddit_subreddit", "MachineLearning")
        return f"posted to r/{sub}: {r.subreddit(sub).submit(title or text[:120], selftext=text).id}"
    if channel == "linkedin":
        body = {"author": os.environ["LINKEDIN_AUTHOR_URN"], "lifecycleState": "PUBLISHED",
                "specificContent": {"com.linkedin.ugc.ShareContent": {"shareCommentary": {"text": text}, "shareMediaCategory": "NONE"}},
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}}
        r = httpx.post("https://api.linkedin.com/v2/ugcPosts", json=body, timeout=30,
                       headers={"Authorization": f"Bearer {os.environ['LINKEDIN_ACCESS_TOKEN']}", "X-Restli-Protocol-Version": "2.0.0"})
        return f"linkedin {r.status_code}: {r.headers.get('x-restli-id', r.text[:200])}"
    if channel == "slack":
        ch = os.environ.get("SLACK_CHANNEL") or CFG.get("publish", {}).get("slack_channel", "#general")
        r = httpx.post("https://slack.com/api/chat.postMessage", json={"channel": ch, "text": text}, timeout=30,
                       headers={"Authorization": f"Bearer {os.environ['SLACK_BOT_TOKEN']}"}).json()
        if not r.get("ok"):
            raise RuntimeError(f"slack: {r.get('error')}")
        return f"posted to slack {ch}: {r.get('ts')}"
    raise ValueError(f"unknown channel {channel}")


def publish(channel: str, text: str, title: str = "") -> str:
    """Post to 'x', 'linkedin', 'slack' or 'reddit'. Every post passes the mindful gate: daily caps, quiet hours, spacing, no duplicates,
    no banned claims, a disclosure that you are an agent. While publishing is disabled, or the gate says no, the post is drafted to the
    outbox and the operator decides. You never reply to, follow or message anyone."""
    pub, gate = CFG.get("publish", {}), mindful.check(channel, text)
    if pub.get("enabled") and gate["ok"]:
        out = send(channel, gate["text"], title)
        mindful.record(channel, text)
        return out
    out = STATE / pub.get("outbox", "outbox")
    out.mkdir(parents=True, exist_ok=True)
    f = out / f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{channel}.md"
    f.write_text((f"# {title}\n\n" if title else "") + text)
    return f"drafted to {f} ({'publishing disabled' if not pub.get('enabled') else '; '.join(gate['reasons'])})"


def sandbox_run(language: str, code: str, files_json: str = "{}", command: str = "", image: str = "") -> str:
    """Run code in the Institute's own docker-in-docker, with no network. `language`: python, node, typescript, go, rust, bash,
    ruby or c; for any other language pass `image` (a docker image) and `command`. `code` is the main file; `files_json` adds
    files as {path: content}; `command` overrides the default run command. Returns the exit code, stdout and stderr."""
    import sandbox
    if language not in sandbox.LANGS and not (image and command):
        return f"unknown language {language}; choose from {list(sandbox.LANGS)} or pass image= and command="
    if not sandbox.available("agent"):
        return "sandbox unavailable: the agent's docker daemon is not reachable"
    main = sandbox.LANGS[language]["file"] if language in sandbox.LANGS else "main"
    r = sandbox.run(language, {main: code, **json.loads(files_json or "{}")}, command or None, image=image or None)
    return f"exit {r['exit']}\n--- stdout\n{r['stdout'][-4000:]}\n--- stderr\n{r['stderr'][-2000:]}"


def ship_app(name: str, language: str, files_json: str, port: int = 0) -> str:
    """Ship an app to the Institute's site. `files_json` is {path: content} and must include a test file (tests run first and must pass).
    The app must serve HTTP on `port` (0 = the language default; read $PORT). `name` is lowercase letters, digits and dashes. Tests run
    and the image builds in the agent's docker; the app runs in the site's docker and appears at /a/<port>/ and under Apps."""
    import sandbox
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", name):
        return "bad name: lowercase letters, digits and dashes, 2–41 characters"
    if language not in sandbox.LANGS:
        return f"unknown language {language}; choose from {list(sandbox.LANGS)}"
    files = json.loads(files_json)
    if not sandbox.has_tests(language, files):
        return f"refused: ship a test file too ({', '.join(sandbox.LANGS[language]['tests'])})"
    if not (sandbox.available("agent") and sandbox.available("web")):
        return "sandbox unavailable: the agent's or the site's docker daemon is not reachable"
    return json.dumps(sandbox.ship(name, language, files, port or None))


def propose_publish(title: str, node_ids: str, edge_ids: str, note: str, sources: str) -> str:
    """Propose what the public site may show. Nothing you know is public until the operator approves a batch. `node_ids` and `edge_ids` are JSON lists of
    ids from the graph, `note` is a short markdown note the batch rests on, `sources` a JSON list of URLs. Propose only claims with sources; say how thin the support is."""
    rec = publishing.propose(title, json.loads(node_ids or "[]"), json.loads(edge_ids or "[]"), note, json.loads(sources or "[]"))
    return f"proposed {rec['id']}; it waits for the operator"


def _j(f, *a, **k) -> str:
    try:
        return json.dumps(f(*a, **k), default=str)
    except (ValueError, KeyError, TypeError) as ex:
        return f"refused: {ex}"


def fleet_list() -> str:
    """List your sub-agents: name, role, where (child = inside your own docker, sibling = in the site's docker), parent, sources, status, items found."""
    import fleet
    return _j(fleet.list_)


def fleet_create(name: str, role: str, prompt: str, sources: str = "[]", from_node: str = "", why: str = "", where: str = "child", parent: str = "", every: int = 900) -> str:
    """Create a sub-agent: a small container with one narrow job. `sources` is a JSON list of source ids (see source_list); `prompt` is what it should
    look for; every item it finds becomes a round for you. `from_node` is the id of the question, goal or hypothesis in the graph this post exists to
    serve, and `why` one sentence on what it will settle — give both, so the Institute can show which research staffed it. Keep the fleet small."""
    import fleet
    out = _j(fleet.create, {"name": name, "role": role, "prompt": prompt, "sources": json.loads(sources or "[]"), "where": where, "parent": parent, "every": every, "from_node": from_node, "why": why}, "brain")
    if not out.startswith("refused") and GRAPH is not None:
        GRAPH.observe([{"id": f"sub:{name}", "type": "subagent", "label": f"{name}: {role or 'worker'}", "tel": True, "from_node": from_node, "why": why}],
                      ([{"id": f"sub:{name}>staffs", "relation": "staffs", "members": [f"sub:{name}", from_node]}] if from_node in GRAPH.nodes else [])
                      + [{"id": f"sub:{name}>by", "relation": "works_for", "members": [f"sub:{name}", "sextant"]}], w=0.8)
    return out


def fleet_update(name: str, patch_json: str) -> str:
    """Change a sub-agent. `patch_json` may set role, prompt, sources (list), every (seconds), where, parent, enabled."""
    import fleet
    return _j(fleet.update, name, json.loads(patch_json), "brain")


def fleet_act(name: str, action: str) -> str:
    """pause, resume or restart a sub-agent."""
    import fleet
    return _j(fleet.act, name, action, "brain")


def fleet_delete(name: str) -> str:
    """Remove a sub-agent and its children, and their containers."""
    import fleet
    return _j(fleet.delete, name, "brain")


def fleet_logs(name: str) -> str:
    """The last lines a sub-agent's worker printed."""
    import fleet
    return _j(fleet.logs, name)


def source_list() -> str:
    """List signal sources (RSS/Atom feeds and Google Trends by country) with their last fetch status."""
    import signals
    st = signals.status()
    return _j(lambda: [{**{k: s[k] for k in ("id", "kind", "label", "url", "geo", "every", "enabled")}, "ok": st.get(s["id"], {}).get("ok"), "new": st.get(s["id"], {}).get("new")} for s in signals.all_sources()])


def source_add(kind: str, target: str, label: str = "", every: int = 900) -> str:
    """Start watching a source. kind 'rss': `target` is the feed url. kind 'trends': `target` is a two-letter country code, e.g. 'CA'."""
    import signals
    return _j(signals.add, {"kind": kind, "url" if kind == "rss" else "geo": target, "label": label, "every": every}, "brain")


def source_update(id: str, patch_json: str) -> str:
    """Change or switch off a source: patch_json may set label, every, enabled, limit, tags (url or geo for your own sources)."""
    import signals
    return _j(signals.update, id, json.loads(patch_json), "brain")


def source_remove(id: str) -> str:
    """Stop watching one of your own sources (seeded ones can only be switched off)."""
    import signals
    return _j(signals.remove, id)


def display_set(spec_json: str) -> str:
    """Create or change a widget on the owner's dynamic display. Fields: id (to change one), type (signals, trends, fleet, vitals, note), title, source
    (a source id), geo, text, size 1-3, view (list, tiles, bars), limit, enabled, order. This is how you decide what the owner sees first."""
    import display
    return _j(display.upsert, json.loads(spec_json), "brain")


def display_remove(id: str) -> str:
    """Remove a widget from the owner's display."""
    import display
    return _j(display.remove, id)


def lab_list() -> str:
    """The Institute's labs: their phases, exit tests, candidate counts and what each lab honestly cannot do. Read this before proposing anything."""
    import labs
    return _j(lambda: [{k: l[k] for k in ("id", "title", "question", "brief", "honest", "target", "phases", "counts")} for l in labs.status()])


def lab_candidates(lab: str) -> str:
    """The candidates in one lab, newest and furthest along first, with their phase, state and last run report."""
    import labs
    return _j(lambda: labs.status(lab)[0]["candidates"] if labs.status(lab) else [])


def lab_propose(lab: str, id: str, label: str, payload_json: str, evidence: str) -> str:
    """Enter a candidate at phase 1. `payload_json` is what the lab's cell needs: chem-stability wants {"smiles": "...", optionally
    "max_energy_per_heavy_atom"}; btc-graph wants {"height": 870000, "claim": "..."}. `evidence` says why you expect it to pass and how you
    know it is not already known. Proposing does not prove anything: nothing advances until a real run passes the phase's exit test."""
    import labs
    return _j(labs.propose, lab, id, label, json.loads(payload_json or "{}"), evidence, "brain")


async def lab_run(lab: str, id: str) -> str:
    """Run the candidate's current phase as real code in the sandbox and file the result. The phase's own exit test decides whether it advances;
    you cannot advance a candidate by asserting that it passed. Returns the run report and the candidate's new phase."""
    import asyncio
    import labs
    import sandbox
    st = labs.status(lab)
    if not st:
        return f"refused: no lab {lab}"
    c = next((x for x in st[0]["candidates"] if x["id"] == id), None)
    if not c:
        return f"refused: no candidate {id} in {lab}"
    try:
        spec = labs.cell(lab, c["phase"], c["payload"])
    except ValueError as ex:
        return f"refused: {ex}"
    if not sandbox.available("agent"):
        return "sandbox unavailable: the agent's docker daemon is not reachable"
    out = await asyncio.to_thread(sandbox.run, spec["language"], spec["files"], spec["command"] or None, 900, None, spec["network"])
    return _j(labs.record, lab, id, c["phase"], out, "brain")


def lab_record(lab: str, id: str, text: str) -> str:
    """Add evidence a cell cannot produce: a laboratory's report, a reviewer's objection, a database search showing the candidate is already known.
    This records the evidence; it does not advance the candidate."""
    import labs
    return _j(labs.note, lab, id, text, "brain")


def lab_close(lab: str, id: str, why: str) -> str:
    """Close a candidate: already known, unsafe, cannot be made, or not worth the bench time. Say which."""
    import labs
    return _j(labs.close, lab, id, why, "brain")


def reprice_list() -> str:
    """The repricing board: the latest fair-value record for each asset or commodity (market, scenario-weighted re-rate, confidence, basis), what is most overdue, and the
    limitations you hold. Read this before repricing anything."""
    import reprice
    keep = ("asset", "kind", "unit", "market", "as_of", "fair_low", "fair_high", "expected_rerate", "rerate_low", "rerate_high", "confidence", "basis", "age_h")
    return json.dumps({"board": [{k: e[k] for k in keep} for e in reprice.board()], "due": reprice.due(CFG, 3), "limits": [l for l in reprice.limits() if l["status"] != "lifted"]}, default=str)


def reprice_record(asset: str, kind: str, unit: str, why: str, scenarios: str, drivers: str, sources: str, limits: str, confidence: str = "low", market: float = -1, as_of: str = "",
                   fair_low: float = -1, fair_high: float = -1, one_sided_reason: str = "") -> str:
    """Record a fair repricing of one asset or commodity. kind: commodity, equity, credit, rental, power, crypto. `scenarios` is a JSON list of {name, p, rerate_pct, note}: p sum to 1,
    rerate_pct is the move in percent against the sourced market price, and they must span both directions (one raises it, one lowers it) unless you give one_sided_reason.
    `drivers` is a JSON list of {name, direction (1 or -1), weight 0-1, evidence: [source ids]}. `sources` is a JSON list of {id, label, url, basis (real only if you fetched it yourself,
    simulated if it came from a simulated world item), as_of}. `limits` is a JSON list of what you could not see. market, fair_low, fair_high: -1 when you have no sourced price (give
    as_of YYYY-MM-DD when you do); the scenario-weighted re-rate must fall inside your fair range. It refuses a record that is one-sided, unsourced or inconsistent: fix it, never loosen it."""
    import reprice
    n = lambda v: None if float(v) < 0 else float(v)
    return _j(reprice.record, {"asset": asset, "kind": kind, "unit": unit, "why": why, "scenarios": json.loads(scenarios or "[]"), "drivers": json.loads(drivers or "[]"),
                               "sources": json.loads(sources or "[]"), "limits": json.loads(limits or "[]"), "confidence": confidence, "market": n(market), "as_of": as_of,
                               "fair_low": n(fair_low), "fair_high": n(fair_high), "one_sided_reason": one_sided_reason}, "sextant")


def limit_note(text: str, area: str = "data", severity: int = 2, lifts_by: str = "", plan: str = "", owner_needed: str = "", status: str = "open", id: str = "") -> str:
    """Open, update or lift a limitation: something the Institute cannot yet see, measure or do. area: data, method, model, coverage, access. severity 1-3. lifts_by: what would remove it.
    plan: the next real step you are taking. owner_needed: exactly what only the operator can provide. status: open, working, lifted; lifting needs the evidence in plan. Pass id to change an existing one."""
    import reprice
    return _j(reprice.note_limit, {"text": text, "area": area, "severity": severity, "lifts_by": lifts_by, "plan": plan, "owner_needed": owner_needed, "status": status, "id": id}, "sextant")


REPRICE_TOOLS = ["reprice_list", "reprice_record", "limit_note"]
LAB_TOOLS = ["lab_list", "lab_candidates", "lab_propose", "lab_run", "lab_record", "lab_close"]
FLEET_TOOLS = ["fleet_list", "fleet_create", "fleet_update", "fleet_act", "fleet_delete", "fleet_logs", "source_list", "source_add", "source_update", "source_remove", "display_set", "display_remove"]
LOCAL = ["web_search", "fetch_url", "graph_query", "list_source", "read_source", "plan_upgrade", "propose_publish", "run_tests", "publish", "sandbox_run", "ship_app"] + FLEET_TOOLS + LAB_TOOLS + REPRICE_TOOLS


def local_tools(cfg: dict, graph) -> list:
    global CFG, GRAPH
    CFG, GRAPH = cfg, graph
    return [dspy.Tool(globals()[n]) for n in cfg["agent"]["tools"] if n in LOCAL]        # globals(): the signed versions, once signed


def _hub():
    """Where the hub is and how to knock: (url, headers), or (None, {}) when it is not configured."""
    url = os.environ.get("HUB_URL") or CFG.get("mcp", {}).get("hub", {}).get("url")
    return url, ({"Authorization": f"Bearer {os.environ['HUB_TOKEN']}"} if os.environ.get("HUB_TOKEN") else {})


async def hub_call(name: str, arguments: dict | None = None) -> str:
    """One tool call on the MCP hub from the owner's side (the agent space), through its own short session."""
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    url, headers = _hub()
    async with streamablehttp_client(url, headers=headers) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await s.call_tool(name, arguments or {})
    return "\n".join(getattr(c, "text", str(c)) for c in res.content)


async def mcp_tools(cfg: dict, stack: AsyncExitStack) -> list:
    """Connect the MCP hub, the one server in front of every other server, and return its tools. Unreachable → no tools, retried by main."""
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    url, headers = _hub()
    if not url:
        return []
    try:
        read, write, _ = await stack.enter_async_context(streamablehttp_client(url, headers=headers))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        tools = [dspy.Tool.from_mcp_tool(session, t) for t in (await session.list_tools()).tools]
        log.info("mcp hub attached: %s", [t.name for t in tools])
        return tools
    except Exception as ex:
        log.warning("mcp hub not reachable at %s: %s", url, ex)
        return []
