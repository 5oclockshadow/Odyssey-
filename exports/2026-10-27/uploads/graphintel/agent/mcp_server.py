"""Tiny MCP server (JSON-RPC 2.0 over HTTP POST): filesystem + terminal tools, confined to /work. Run: python mcp_server.py"""
import json, os, shlex, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(os.environ.get("WORK", "/work")).resolve()
TOKEN = os.environ.get("MCP_TOKEN", "")
DOCKER = {"build", "run", "ps", "stop", "rm", "logs", "images"}
BANNED = ("--privileged", "-v", "--volume", "--mount", "--network", "--pid", "--cap-add", "--device", "--user", "-u")
OK_CMDS = {"docker", "ls", "cat", "curl"}


def safe(p):
    q = (ROOT / str(p)).resolve()
    if q != ROOT and ROOT not in q.parents:
        raise ValueError("path outside /work")
    return q


def fs_list(path="."):
    return "\n".join(sorted(f"{'d' if c.is_dir() else '-'} {c.name}" for c in safe(path).iterdir()))


def fs_read(path):
    return safe(path).read_text()[:100_000]


def fs_write(path, content):
    if len(content) > 200_000:
        raise ValueError("file too large")
    q = safe(path)
    q.parent.mkdir(parents=True, exist_ok=True)
    q.write_text(content)
    return f"wrote {len(content)} bytes to {path}"


def terminal_run(cmd):
    a = shlex.split(cmd)
    if not a or a[0] not in OK_CMDS:
        raise ValueError(f"command not allowed: {a[:1]}")
    if a[0] == "docker" and (len(a) < 2 or a[1] not in DOCKER):
        raise ValueError("docker subcommand not allowed")
    if any(x in BANNED or x.startswith(("--privileged", "--mount", "--volume", "--network", "-v")) for x in a[1:]):
        raise ValueError("flag not allowed")
    r = subprocess.run(a, cwd=ROOT, capture_output=True, text=True, timeout=120)
    return f"exit {r.returncode}\n{(r.stdout + r.stderr)[-4000:]}"


S = lambda *keys: {"type": "object", "properties": {k: {"type": "string"} for k in keys}, "required": list(keys)}
TOOLS = {
    "fs.list": (fs_list, "List a directory under /work", {"type": "object", "properties": {"path": {"type": "string"}}}),
    "fs.read": (fs_read, "Read a text file under /work", S("path")),
    "fs.write": (fs_write, "Write a text file under /work", S("path", "content")),
    "terminal.run": (terminal_run, "Run docker (build/run/ps/stop/rm/logs/images), ls, cat or curl in /work", S("cmd")),
}


def handle(msg):
    m, i, p = msg.get("method"), msg.get("id"), msg.get("params") or {}
    if m == "initialize":
        return {"jsonrpc": "2.0", "id": i, "result": {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}, "serverInfo": {"name": "studio-mcp", "version": "1"}}}
    if m == "tools/list":
        return {"jsonrpc": "2.0", "id": i, "result": {"tools": [{"name": n, "description": d, "inputSchema": s} for n, (_, d, s) in TOOLS.items()]}}
    if m == "tools/call":
        try:
            fn = TOOLS[p["name"]][0]
            return {"jsonrpc": "2.0", "id": i, "result": {"content": [{"type": "text", "text": fn(**(p.get("arguments") or {}))}]}}
        except Exception as e:  # tool errors are results, not transport errors
            return {"jsonrpc": "2.0", "id": i, "result": {"isError": True, "content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}]}}
    return {"jsonrpc": "2.0", "id": i, "error": {"code": -32601, "message": f"unknown method {m}"}}


class H(BaseHTTPRequestHandler):
    def _send(self, code, body=b""):
        self.send_response(code)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "content-type, x-token"), ("Content-Type", "application/json")):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204)

    def do_POST(self):
        if not TOKEN or self.headers.get("x-token") != TOKEN:
            return self._send(401, b'{"error":"bad or missing token"}')
        try:
            n = int(self.headers.get("content-length", 0))
            msg = json.loads(self.rfile.read(min(n, 500_000)))
        except (ValueError, json.JSONDecodeError):
            return self._send(400, b'{"error":"bad json"}')
        self._send(200, json.dumps(handle(msg)).encode())


if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    ThreadingHTTPServer(("0.0.0.0", 8765), H).serve_forever()
