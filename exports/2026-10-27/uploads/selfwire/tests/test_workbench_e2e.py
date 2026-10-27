"""
Real-process end-to-end: launch `python -m selfwire.workbench` exactly as a
user would, talk to it over HTTP, read its SSE stream, and restart it.
"""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

REPO = Path(__file__).resolve().parent.parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def launch(root: Path, *extra: str, token: bool = False) -> tuple[subprocess.Popen, str]:
    port = free_port()
    if not token and "--token" not in extra:
        extra = ("--no-token", *extra)
    env = {k: v for k, v in os.environ.items() if k != "SELFWIRE_WORKBENCH_TOKEN"}
    env["PYTHONPATH"] = str(REPO)
    proc = subprocess.Popen(
        [sys.executable, "-m", "selfwire.workbench", "--root", str(root), "--port", str(port), "--log-level", "warning", *extra],
        cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True,
    )
    return proc, f"http://127.0.0.1:{port}"


def wait_healthy(base: str, headers=None, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base}/api/health", headers=headers, timeout=2)
            if r.status_code == 200:
                return r.json()
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise AssertionError(f"server at {base} never became healthy")


def stop(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, 15)
        proc.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        os.killpg(proc.pid, 9)


@pytest.fixture
def server(mini_repo):
    proc, base = launch(mini_repo)
    try:
        wait_healthy(base)
        yield base
    finally:
        stop(proc)


def test_live_server_crud_and_sse(server):
    events = []
    with httpx.stream("GET", f"{server}/api/events", timeout=20) as stream:
        lines = stream.iter_lines()
        current = None
        for line in lines:
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and current:
                events.append((current, json.loads(line.split(":", 1)[1])))
                if current == "hello":
                    put = httpx.put(f"{server}/api/file", json={"path": "live.txt", "content": "hi"}, timeout=10)
                    assert put.status_code == 200
                if current == "file":
                    break
    assert events[0][0] == "hello"
    assert ("file", {"op": "write", "path": "live.txt"}) in events
    assert httpx.get(f"{server}/api/file", params={"path": "live.txt"}).json()["content"] == "hi"


def test_restart_reexecs_and_comes_back(server):
    before = httpx.get(f"{server}/api/health").json()
    assert httpx.post(f"{server}/api/restart", timeout=60).json() == {"ok": True, "restarting": True}
    time.sleep(1.0)
    after = wait_healthy(server)
    assert after["version"] == before["version"]


def test_token_required_when_set(mini_repo):
    proc, base = launch(mini_repo, "--token", "tok-123")
    try:
        wait_healthy(base, headers={"X-Selfwire-Token": "tok-123"})
        assert httpx.get(f"{base}/api/health").status_code == 401
    finally:
        stop(proc)


def test_refuses_public_bind_without_token(mini_repo):
    proc = subprocess.run(
        [sys.executable, "-m", "selfwire.workbench", "--root", str(mini_repo), "--host", "0.0.0.0",
         "--port", str(free_port()), "--no-token"],
        cwd=REPO, env={**os.environ, "PYTHONPATH": str(REPO), "SELFWIRE_WORKBENCH_TOKEN": ""},
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 2 and "refusing to bind" in proc.stderr


def test_a_token_is_generated_by_default_and_survives_restart(mini_repo):
    proc, base = launch(mini_repo, token=True)
    try:
        url_line = ""
        deadline = time.time() + 30
        while "open:" not in url_line and time.time() < deadline:
            url_line = proc.stdout.readline()
        token = url_line.split("?token=", 1)[1].strip()
        assert len(token) >= 24
        headers = {"X-Selfwire-Token": token}
        wait_healthy(base, headers=headers)
        assert httpx.get(f"{base}/api/health").status_code == 401
        assert httpx.post(f"{base}/api/restart", headers=headers, timeout=60).status_code == 200
        time.sleep(1.0)
        wait_healthy(base, headers=headers)  # same token after the re-exec
        assert httpx.get(f"{base}/api/health").status_code == 401
        cmdline = Path(f"/proc/{proc.pid}/cmdline").read_bytes().decode()
        assert token not in cmdline, "the token never appears in the process arguments"
    finally:
        stop(proc)
