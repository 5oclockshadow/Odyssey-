"""Tester server: MCP-style JSON-RPC endpoint plus session recording intake.

Scaffold. Chaos runner, SOC 2 auditor and patch gate are stubs until wired to a
real repository, Redis-RAPTOR and DSPy. Recordings are stored as JSON files.
Run with: uvicorn server:app --host 0.0.0.0 --port 8080
"""
import json, pathlib, time
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

TOOLS = {
    "run_chaos": {"description": "Run a chaos strategy (payload, fuzz, race, mem, audit) against a target.", "stub": True},
    "soc2_audit": {"description": "Score the codebase against SOC 2 Trust Services Criteria.", "stub": True},
    "propose_patch": {"description": "Draft a patch for a confirmed finding and re-run it before acceptance.", "stub": True},
}


async def rpc(request: Request):
    body = await request.json()
    method, rid = body.get("method"), body.get("id")
    if method == "tools/list":
        result = {"tools": [{"name": k, "description": v["description"]} for k, v in TOOLS.items()]}
    elif method == "tools/call":
        name = body.get("params", {}).get("name")
        if name not in TOOLS:
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown tool"}})
        result = {"content": [{"type": "text", "text": f"{name}: not wired to a repository yet"}]}
    else:
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown method"}})
    return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": result})


async def recordings(request: Request):
    body = await request.json()
    d = pathlib.Path("recordings")
    d.mkdir(exist_ok=True)
    p = d / f"session-{int(time.time())}.json"
    p.write_text(json.dumps(body, indent=2))
    return JSONResponse({"ok": True, "file": str(p), "events": len(body.get("events", []))})


async def health(_):
    return JSONResponse({"ok": True})


app = Starlette(routes=[
    Route("/mcp", rpc, methods=["POST"]),
    Route("/recordings", recordings, methods=["POST"]),
    Route("/health", health),
])
