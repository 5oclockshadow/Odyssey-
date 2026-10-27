"""The Tester: MCP-style tool server (Uvicorn).

Scaffold only. Not run or tested. The DSPy, Redis-RAPTOR and sandbox adapters
are stubs marked TODO; wire them to the real libraries before use.
"""
import os
import json
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

TARGET_MODE = os.getenv("TESTER_TARGET_MODE", "sandbox")  # sandbox | staging | local
REPO_ROOT = Path(os.getenv("TESTER_REPO", "/work/repo")).resolve()
PROPOSALS = Path(os.getenv("TESTER_PROPOSALS", "/work/proposals"))
PROPOSALS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="The Tester")
TOOLS = {}


def tool(name, description):
    def wrap(fn):
        TOOLS[name] = {"description": description, "fn": fn}
        return fn
    return wrap


class Call(BaseModel):
    args: dict = {}


@app.get("/health")
def health():
    return {"ok": True, "mode": TARGET_MODE, "repo": str(REPO_ROOT)}


@app.get("/mcp/tools")
def list_tools():
    return [{"name": n, "description": t["description"]} for n, t in TOOLS.items()]


@app.post("/mcp/tools/{name}")
def call_tool(name: str, call: Call):
    if name not in TOOLS:
        raise HTTPException(404, f"unknown tool {name}")
    return TOOLS[name]["fn"](**call.args)


@tool("search_code", "Search repository source for a literal string. Stub: plain grep until the rm retriever is wired.")
def search_code(query: str, path: str = "."):
    base = (REPO_ROOT / path).resolve()
    if REPO_ROOT not in base.parents and base != REPO_ROOT:
        raise HTTPException(400, "path escapes repo")
    hits = []
    for p in base.rglob("*.py"):
        try:
            for i, line in enumerate(p.read_text(errors="ignore").splitlines(), 1):
                if query in line:
                    hits.append({"file": str(p.relative_to(REPO_ROOT)), "line": i, "text": line.strip()})
        except OSError:
            continue
        if len(hits) >= 200:
            break
    return {"hits": hits}


@tool("run_test", "Run one test id. Refuses unless sandbox mode is on, so chaos never hits staging or production by default.")
def run_test(id: str, sandbox: bool = True):
    if TARGET_MODE != "sandbox" or not sandbox:
        raise HTTPException(403, "chaos runs only in sandbox mode")
    # TODO: execute inside a throwaway container against a copy of REPO_ROOT.
    return {"id": id, "status": "not_implemented", "run": str(uuid.uuid4())}


@tool("propose_patch", "Write a patch proposal file for a human PR. Never edits the main checkout.")
def propose_patch(file: str, rationale: str, diff: str):
    pid = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    record = {"id": pid, "file": file, "rationale": rationale, "diff": diff, "status": "proposed"}
    (PROPOSALS / f"{pid}.json").write_text(json.dumps(record, indent=2))
    return record


@tool("ingest_recording", "Ingest a .testrec.json session into Redis-RAPTOR. Stub until the Redis client is wired.")
def ingest_recording(path: str):
    # TODO: parse events, index them with redis-py, add to the RAPTOR graph.
    return {"path": path, "status": "not_implemented"}
