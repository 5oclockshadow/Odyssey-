import os, tempfile
os.environ["WORK"] = tempfile.mkdtemp()
import pytest
import mcp_server as m


def call(name, **a):
    r = m.handle({"id": 1, "method": "tools/call", "params": {"name": name, "arguments": a}})["result"]
    return r.get("isError", False), r["content"][0]["text"]


def test_write_read_list_roundtrip():
    assert call("fs.write", path="site/index.html", content="hi")[0] is False
    assert call("fs.read", path="site/index.html") == (False, "hi")
    assert "index.html" in call("fs.list", path="site")[1]


@pytest.mark.parametrize("p", ["../etc/passwd", "/etc/passwd", "site/../../x"])
def test_paths_cannot_escape_work(p):
    assert call("fs.write", path=p, content="x")[0] and call("fs.read", path=p)[0]


@pytest.mark.parametrize("c", ["rm -rf /", "bash -c id", "docker exec x sh", "docker run --privileged x", "docker run -v /:/h x", "docker run --network host x", "docker", ""])
def test_terminal_refuses(c):
    assert call("terminal.run", cmd=c)[0]


def test_terminal_runs_allowed_command():
    err, out = call("terminal.run", cmd="ls")
    assert not err and out.startswith("exit 0")


def test_oversize_write_and_unknown_method():
    assert call("fs.write", path="big", content="x" * 200_001)[0]
    assert "error" in m.handle({"id": 2, "method": "nope"})


def test_tools_list_and_initialize():
    assert {t["name"] for t in m.handle({"id": 3, "method": "tools/list"})["result"]["tools"]} == set(m.TOOLS)
    assert m.handle({"id": 4, "method": "initialize"})["result"]["serverInfo"]["name"] == "studio-mcp"
