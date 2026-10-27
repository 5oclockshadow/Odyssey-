"""The Tester: MCP-style tool server (JSON-RPC over HTTP) run under Uvicorn.

Autonomous cycle: scan -> fix on a branch -> run tests -> compile -> rescan.
A fix is committed only if tests pass, the build compiles, and the finding count drops.
Otherwise the branch is discarded and the repo returns to its original state.
Not yet wired: DSPy ReAct loop, `rm` retriever, Redis-RAPTOR ingest, chaos routines, self-improvement.
"""
import os
import re
import subprocess
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request

REPO_PATH = Path(os.getenv("REPO_PATH", "/workspace")).resolve()
APPROVER_TOKEN = os.getenv("TESTER_APPROVER_TOKEN", "")
SCAN_EXTS = {".py", ".js", ".ts", ".yml", ".yaml", ".env", ".toml"}
SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__"}

# (rule id, regex, SOC 2 criterion, severity)
RULES = [
    ("hardcoded-secret", re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"), "Confidentiality", "High"),
    ("tls-verify-off", re.compile(r"verify\s*=\s*False"), "Security", "High"),
    ("plaintext-http", re.compile(r"http://(?!localhost|127\.0\.0\.1)"), "Confidentiality", "Medium"),
    ("dynamic-exec", re.compile(r"\beval\(|\bexec\("), "Processing Integrity", "High"),
    ("unsafe-pickle", re.compile(r"pickle\.loads?\("), "Security", "High"),
    ("shell-true", re.compile(r"shell\s*=\s*True"), "Security", "High"),
    ("cookie-review", re.compile(r"set_cookie\("), "Confidentiality", "Low"),
]

# Rules with a mechanical, reviewable fix. Others need a human or the agent loop.
FIXERS = {
    "tls-verify-off": lambda line: line.replace("verify=False", "verify=True").replace("verify = False", "verify = True"),
    "shell-true": lambda line: line.replace("shell=True", "shell=False").replace("shell = True", "shell = False"),
}

app = FastAPI(title="The Tester")
STATE = {"runs": 0, "patches": {}, "audit_log": []}


def audit(event: str, detail: dict) -> None:
    STATE["audit_log"].append({"ts": time.time(), "event": event, "detail": detail})


def _safe_path(rel: str) -> Path:
    p = (REPO_PATH / rel).resolve()
    if p != REPO_PATH and REPO_PATH not in p.parents:
        raise ValueError("path escapes repo")
    return p


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=REPO_PATH, capture_output=True, text=True, timeout=120)


def _scan() -> list[dict]:
    findings = []
    for path in REPO_PATH.rglob("*"):
        if not path.is_file() or path.suffix not in SCAN_EXTS or SKIP_DIRS & set(path.parts):
            continue
        try:
            lines = path.read_text(errors="ignore").splitlines()
        except OSError:
            continue
        for no, line in enumerate(lines, 1):
            for rid, rx, tsc, sev in RULES:
                if rx.search(line):
                    findings.append({"rule": rid, "file": str(path.relative_to(REPO_PATH)), "line": no,
                                     "line_text": line, "criterion": tsc, "severity": sev})
    return findings


def _tests() -> tuple[bool, list[str]]:
    try:
        proc = subprocess.run(["python", "-m", "pytest", "-q", "--maxfail", "5"], cwd=REPO_PATH,
                              capture_output=True, text=True, timeout=300)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, [str(exc)]
    # Exit 0 only. "No tests collected" (5) is not a pass, so nothing auto-applies without tests.
    return proc.returncode == 0, proc.stdout.splitlines()[-10:]


def _compiles() -> bool:
    proc = subprocess.run(["python", "-m", "compileall", "-q", str(REPO_PATH)], capture_output=True, text=True, timeout=300)
    return proc.returncode == 0


# --- Tools -----------------------------------------------------------------

def tool_get_state(_args: dict) -> dict:
    return {"runs": STATE["runs"], "patches": list(STATE["patches"].values()), "audit_events": len(STATE["audit_log"])}


def tool_scan_code(_args: dict) -> dict:
    findings = _scan()
    audit("scan.run", {"count": len(findings)})
    return {"count": len(findings), "findings": findings[:200]}


def tool_run_tests(_args: dict) -> dict:
    ok, tail = _tests()
    STATE["runs"] += 1
    audit("tests.run", {"ok": ok})
    return {"status": "passed" if ok else "failed", "tail": tail}


def tool_build_check(_args: dict) -> dict:
    ok = _compiles()
    audit("build.check", {"ok": ok})
    return {"status": "ok" if ok else "failed"}


def tool_apply_fix(args: dict) -> dict:
    """Apply one exact-match replacement on a branch. Keep it only if tests, build and scan all pass."""
    pid = f"P-{uuid.uuid4().hex[:6]}"
    file, old, new = args.get("file", ""), args.get("old", ""), args.get("new", "")
    summary = args.get("summary", "")
    try:
        target = _safe_path(file)
    except ValueError as exc:
        return {"id": pid, "status": "rejected", "reason": str(exc)}
    if not old or not target.is_file():
        return {"id": pid, "status": "rejected", "reason": "missing target"}
    text = target.read_text()
    if text.count(old) != 1:
        return {"id": pid, "status": "rejected", "reason": "old text must match exactly once"}
    if _git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return {"id": pid, "status": "rejected", "reason": "repo is not a git work tree"}
    base = _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    branch = f"tester/{pid.lower()}"
    if _git("checkout", "-b", branch).returncode != 0:
        return {"id": pid, "status": "rejected", "reason": "could not create branch"}

    before = len(_scan())
    target.write_text(text.replace(old, new, 1))
    tests_ok, tail = _tests()
    build_ok = _compiles()
    after = len(_scan())

    if tests_ok and build_ok and after < before:
        _git("add", file)
        _git("-c", "user.name=the-tester", "-c", "user.email=tester@localhost", "commit", "-m", f"tester: {summary}")
        _git("checkout", base)
        status, reason = "applied", f"findings {before} -> {after}"
    else:
        _git("checkout", "--", file)
        _git("checkout", base)
        _git("branch", "-D", branch)
        status = "rejected"
        reason = f"tests={'ok' if tests_ok else 'fail'} build={'ok' if build_ok else 'fail'} findings {before} -> {after}"

    patch = {"id": pid, "file": file, "summary": summary, "status": status, "reason": reason, "branch": branch, "tests_tail": tail}
    STATE["patches"][pid] = patch
    audit("patch." + status, {"id": pid, "file": file, "reason": reason})
    return patch


def tool_cycle(_args: dict) -> dict:
    """One autonomous pass: scan, then attempt each mechanical fix, at most 10 per cycle."""
    results = []
    for f in _scan()[:10]:
        fixer = FIXERS.get(f["rule"])
        if fixer is None:
            results.append({"rule": f["rule"], "file": f["file"], "status": "needs_review"})
            continue
        new_line = fixer(f["line_text"])
        if new_line == f["line_text"]:
            continue
        results.append(tool_apply_fix({"file": f["file"], "old": f["line_text"], "new": new_line,
                                       "summary": f"{f['rule']} in {f['file']}:{f['line']}"}))
    audit("cycle.run", {"attempts": len(results)})
    return {"results": results}


def tool_propose_patch(args: dict) -> dict:
    pid = f"P-{uuid.uuid4().hex[:6]}"
    try:
        _safe_path(args.get("file", ""))
    except ValueError as exc:
        return {"status": "rejected", "reason": str(exc)}
    patch = {"id": pid, "file": args.get("file", ""), "summary": args.get("summary", ""), "status": "proposed"}
    STATE["patches"][pid] = patch
    audit("patch.proposed", {"id": pid})
    return patch


TOOLS = {
    "get_state": tool_get_state,
    "scan_code": tool_scan_code,
    "run_tests": tool_run_tests,
    "build_check": tool_build_check,
    "apply_fix": tool_apply_fix,
    "cycle": tool_cycle,
    "propose_patch": tool_propose_patch,
}

TOOL_LIST = [
    {"name": "get_state", "description": "Runs, patches, audit event count", "inputSchema": {"type": "object"}},
    {"name": "scan_code", "description": "Static SOC 2 scan of the repo", "inputSchema": {"type": "object"}},
    {"name": "run_tests", "description": "Run pytest in the repo", "inputSchema": {"type": "object"}},
    {"name": "build_check", "description": "Compile-check all Python in the repo", "inputSchema": {"type": "object"}},
    {"name": "apply_fix", "description": "Exact-match replacement on a branch; kept only if tests, build and findings all pass",
     "inputSchema": {"type": "object", "properties": {"file": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}, "summary": {"type": "string"}}}},
    {"name": "cycle", "description": "Scan and attempt mechanical fixes", "inputSchema": {"type": "object"}},
    {"name": "propose_patch", "description": "Record a proposed patch for review (not applied)", "inputSchema": {"type": "object"}},
]


# --- Protocol ----------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/mcp")
async def mcp(request: Request):
    msg = await request.json()
    method, rid, params = msg.get("method"), msg.get("id"), msg.get("params", {})
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOL_LIST}}
    if method == "tools/call":
        fn = TOOLS.get(params.get("name"))
        if fn is None:
            return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown tool"}}
        return {"jsonrpc": "2.0", "id": rid, "result": fn(params.get("arguments", {}))}
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown method"}}


@app.post("/api/patches/{pid}/approve")
def approve(pid: str, x_approver_token: str = Header(default="")):
    # Manual proposals only. Auto-applied fixes are already committed on their branch.
    if not APPROVER_TOKEN or x_approver_token != APPROVER_TOKEN:
        raise HTTPException(status_code=403, detail="approver token required")
    patch = STATE["patches"].get(pid)
    if patch is None:
        raise HTTPException(status_code=404, detail="unknown patch")
    patch["status"] = "approved"
    audit("patch.approved", {"id": pid})
    return patch
