"""Self-repair. An error anywhere becomes an incident node; the graph locates it (code → file → line, the spans and logs of the same
trace, earlier patches at the same place); one repair round writes a diff; the sandbox tests it; then a pull request. The agent never
edits its own code: for an app it shipped, the app is rebuilt and relaunched; for the engine, a human merges."""
import asyncio
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx

import bus
import upgrades

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
INCIDENTS = STATE / "incidents.jsonl"
log = logging.getLogger("heal")
CFG: dict = {}
GRAPH = None
PUT = None
Q = None                                           # reflect.Q, set by main.setup()
DIFF = re.compile(r"```diff\n(.*?)```", re.S)
STRATEGIES = {
    "patch_minimal": "change the fewest lines that remove the cause",
    "add_test_first": "write the failing test first, then the smallest change that makes it pass",
    "widen_handling": "handle the failure where it is raised and surface it as a clear message instead of a crash",
}
OUTCOMES = {
    "pr_opened": "pull request opened", "patch_saved": "tested diff saved for the owner (no repository or token)", "relaunched": "app rebuilt and relaunched",
    "tests_failed": "tests failed in the sandbox", "no_patch": "no patch: the cause is outside the code", "sandbox_unavailable": "sandbox unavailable",
    "ship_failed": "rebuild failed", "patch_failed": "diff did not apply",
}


def now():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(inc: dict) -> str:
    return hashlib.sha1(f"{inc.get('code')}|{inc.get('type')}|{(inc.get('message') or '')[:80]}".encode()).hexdigest()[:10]


def _write(rec: dict):
    INCIDENTS.parent.mkdir(exist_ok=True)
    with INCIDENTS.open("a") as f:
        f.write(json.dumps(rec) + "\n")


def load() -> list[dict]:
    if not INCIDENTS.exists():
        return []
    out = []
    for line in INCIDENTS.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def latest() -> dict[str, dict]:
    """Last known state per incident id: the open line, then the outcome line, then any owner action, merged."""
    out = {}
    for r in load():
        cur = out.get(r["id"])
        out[r["id"]] = {**(cur or {}), **r, "first_ts": cur["first_ts"] if cur else r["ts"]}
    return out


def on_incident(inc: dict):
    """Any thread, any source (span, log, asyncio, process, app, site). Dedupes, writes the incident node and its edges, queues a repair round."""
    if GRAPH is None:
        return None
    fp = fingerprint(inc)
    if not bus.STORE.once(f"incident:{fp}", CFG.get("dedupe_seconds", 900)):
        return None
    iid = f"incident:{fp}"
    attempts = sum(1 for r in load() if r["id"] == iid and r.get("status") == "open") + 1
    inc = {k: v for k, v in inc.items() if v is not None}
    inc.update(id=iid, ts=now(), status="open", attempts=attempts)
    nodes = [{"id": iid, "type": "incident", "label": f"{inc.get('type', 'error')}: {inc.get('message', '')[:90]}", "tel": True,
              "ts": inc["ts"], "status": "open", "file": inc.get("file"), "line": inc.get("line"), "source": inc.get("source")}]
    edges = []
    if inc.get("code"):
        nodes.append({"id": inc["code"], "type": "code", "label": inc["code"].split(":", 1)[1], "file": inc.get("file"), "line": inc.get("line")})
        edges.append({"id": f"{iid}>code", "relation": "raised_by", "members": [iid, inc["code"]]})
    if inc.get("span"):
        edges.append({"id": f"{iid}>span", "relation": "raised_in", "members": [iid, inc["span"]]})
    GRAPH.observe(nodes, edges, w=0.9)
    _write(inc)
    queued = bool(PUT) and CFG.get("enabled", True) and attempts <= CFG.get("max_attempts", 3) and inc.get("source") != "site"   # the site bundle is not source
    if queued:
        PUT("repair", json.dumps(inc))
    print(f"[heal] {iid} {inc.get('type')} at {inc.get('code')} attempt {attempts} → {'repair queued' if queued else 'not queued'}", flush=True)   # print: this may run inside a log handler
    return inc


def locate(inc: dict) -> dict:
    """Walk the graph from the incident: the code node, the source around its line, the spans and logs of the same trace,
    the patches that touched this code before."""
    code = inc.get("code")
    cn = GRAPH.nodes.get(code) if code else None
    out = {"code": cn, "file": inc.get("file") or (cn or {}).get("file"), "line": int(inc.get("line") or (cn or {}).get("line") or 0), "source": "", "related": [], "history": []}
    if out["file"] and Path(out["file"]).exists():
        lines = Path(out["file"]).read_text().splitlines()
        lo, hi = max(0, out["line"] - 40), min(len(lines), out["line"] + 40)
        out["source"] = "\n".join(f"{i + 1:5d}  {ln}" for i, ln in enumerate(lines[lo:hi], start=lo))
    trace_id = next((m for e in GRAPH.edges.values() if e["relation"] == "in_trace" and inc.get("span") in e["members"] for m in e["members"] if m.startswith("trace:")), None)
    if trace_id:
        spans = {m for e in GRAPH.edges.values() if e["relation"] == "in_trace" and trace_id in e["members"] for m in e["members"] if m.startswith("span:")}
        logs = [m for e in GRAPH.edges.values() if e["relation"] == "in_span" and e["members"][1] in spans for m in e["members"][:1]]
        out["related"] = sorted((GRAPH.nodes[s] for s in spans if s in GRAPH.nodes), key=lambda n: n.get("ts", 0))[-20:] + [GRAPH.nodes[x] for x in logs if x in GRAPH.nodes][-20:]
    out["history"] = [n for n in GRAPH.nodes.values() if n.get("type") == "patch" and code and n.get("code") == code][-3:]
    return out


def intake_for(inc: dict, strategy: str = "patch_minimal") -> str:
    loc = locate(inc)
    target = "a shipped app (paths relative to the app root)" if inc.get("source") == "app" else "the Institute's own engine (paths relative to the repository root, e.g. apps/engine/tools.py)"
    return (f"An incident occurred in {target}. Find the cause and write the fix as ONE unified diff inside a ```diff fenced block in `answer`. "
            f"Strategy: {strategy} — {STRATEGIES.get(strategy, '')}. Add or adjust a test that would have caught it. "
            f"You cannot edit the engine yourself: the diff is tested in the sandbox and becomes a pull request. "
            f"If the cause is outside the code (missing key, network, upstream), say so plainly and return no diff.\n\n"
            f"INCIDENT\n{json.dumps({k: inc.get(k) for k in ('id', 'type', 'message', 'code', 'file', 'line', 'source', 'attempts')})}\n\n"
            f"STACK\n{(inc.get('stack') or '')[-3000:]}\n\nSOURCE {loc['file']}:{loc['line']}\n{loc['source']}\n\n"
            f"RELATED SPANS AND LOGS\n{json.dumps(loc['related'])[:4000]}\n\nEARLIER PATCHES HERE\n{json.dumps(loc['history'])[:1500]}")


def extract_diff(answer: str) -> str | None:
    m = DIFF.search(answer or "")
    return m.group(1) if m else None


_gh = upgrades._gh


async def repair(inc: dict, answer: str, sandbox) -> dict:
    """After the repair round: test the diff in the sandbox, then a pull request (engine) or a rebuild and relaunch (a shipped app)."""
    iid, diff = inc["id"], extract_diff(answer)
    res = {"id": iid, "ts": now(), "diff": diff or "", "tests": "", "pr": None, "strategy": inc.get("strategy", "patch_minimal")}
    if not diff:
        return _finish(inc, res, "no_patch", -0.2, answer)
    if not sandbox.available("agent"):
        return _finish(inc, res, "sandbox_unavailable", 0.0, answer)
    if inc.get("source") == "app":
        name = inc["code"].split(":", 1)[1]
        appdir = sandbox.STATE / "apps" / name
        meta = json.loads((appdir / "ship.json").read_text())
        patched = await asyncio.to_thread(sandbox.apply_diff, sandbox.tree(appdir, skip=("ship.json",)), diff)
        if patched is None:
            return _finish(inc, res, "patch_failed", -0.5, answer)
        r = await asyncio.to_thread(sandbox.ship, name, meta["language"], patched, meta.get("port"))
        res["tests"] = (r.get("output") or "")[-1500:]
        return _finish(inc, res, "relaunched" if r.get("ok") else "ship_failed", 1.0 if r.get("ok") else -1.0, answer, patch=r.get("ok"))
    v = await asyncio.to_thread(upgrades.verify, diff, sandbox)
    res["tests"] = v["out"][-1500:]
    if not v["ok"]:
        return _finish(inc, res, "tests_failed" if v["applied"] else "patch_failed", -1.0 if v["applied"] else -0.5, answer)
    key = iid.split(":")[1]
    title = f"fix: {inc.get('type')} in {str(inc.get('code', '?')).split(':', 1)[-1]}"
    body = (f"Opened by SEXTANT for incident `{iid}`.\n\n**Where:** `{inc.get('file')}:{inc.get('line')}`\n"
            f"**Error:** {(inc.get('message') or '')[:300]}\n\n**Sandbox tests**\n```\n{res['tests'][-800:]}\n```")
    res["pr"], outcome = await asyncio.to_thread(upgrades.deliver, f"fix/{key}", title, body, v, key, diff)
    return _finish(inc, res, outcome, 1.0, answer, patch=True)


def _finish(inc, res, outcome, reward, answer, patch=False):
    res["outcome"] = outcome
    res["status"] = "waiting" if outcome in ("pr_opened", "patch_saved") else "closed"
    res["summary"] = (answer or "")[:400]
    if patch:
        pid = f"patch:{inc['id'].split(':')[1]}"
        GRAPH.observe([{"id": pid, "type": "patch", "label": f"fix: {inc.get('type')} in {str(inc.get('code', '?')).split(':', 1)[-1]}", "code": inc.get("code"), "tel": True, "ts": res["ts"], "outcome": outcome}],
                      [{"id": f"{inc['id']}>fixed", "relation": "fixed_by", "members": [inc["id"], pid]}], w=0.9)
    if inc["id"] in GRAPH.nodes:
        GRAPH.nodes[inc["id"]].update(status=res["status"], outcome=outcome)
        GRAPH.dirty = True
    if Q is not None:
        Q.update(f"repair:{inc.get('type', 'error')}", res["strategy"], reward)
    _write(res)
    log.info("%s → %s", inc["id"], outcome)
    return res


def act(iid: str, action: str) -> dict:
    """Owner actions on an incident: approve (review + squash-merge the PR), decline (close it), retry (another repair round), mute."""
    rec = latest().get(iid)
    if not rec:
        return {"ok": False, "error": "unknown incident"}
    repo, token = CFG.get("repo"), os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    if action in ("approve", "decline") and rec.get("pr") and repo and token:
        base = f"https://api.github.com/repos/{repo}/pulls/{rec['pr'].rstrip('/').split('/')[-1]}"
        if action == "approve":
            httpx.post(f"{base}/reviews", json={"event": "APPROVE", "body": "Approved from the terminal."}, headers=_gh(token), timeout=30)
            r = httpx.put(f"{base}/merge", json={"merge_method": "squash"}, headers=_gh(token), timeout=30)
            out = {"ok": r.status_code == 200, "merged": r.status_code == 200, "detail": r.text[:200] if r.status_code != 200 else ""}
        else:
            r = httpx.patch(base, json={"state": "closed"}, headers=_gh(token), timeout=30)
            out = {"ok": r.status_code == 200, "closed": r.status_code == 200}
    elif action == "retry" and PUT:
        PUT("repair", json.dumps({**rec, "status": "open"}))
        out = {"ok": True, "queued": True}
    elif action == "mute":
        out = {"ok": True, "muted": True}
    elif action == "decline":
        out = {"ok": True, "closed": True}
    else:
        out = {"ok": False, "error": f"cannot {action} this incident"}
    if out.get("ok"):
        _write({"id": iid, "ts": now(), "status": "muted" if action == "mute" else ("open" if action == "retry" else "closed"), "owner": action})
        if iid in GRAPH.nodes:
            GRAPH.nodes[iid]["status"] = "closed" if action != "retry" else "open"
            GRAPH.dirty = True
    return out
