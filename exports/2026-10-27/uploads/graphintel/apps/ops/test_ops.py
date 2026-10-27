"""No docker, no model: the cookie check, the workspace fence, the container actions and their protections, the ops agent's tools and proposals."""
import asyncio
import hashlib
import hmac
import time

import pytest
from fastapi import HTTPException

import agent
import ops


def token(secret="s", hours=1, who="owner"):
    exp = int(time.time() + 3600 * hours)
    body = f"{who}.{exp}"
    return f"{body}.{hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()}"


class Box:
    def __init__(self, name, state="running", health="", exit=0):
        self.name, self.id, self.calls = name, name.ljust(12, "0"), []
        self.attrs = {"State": {"Status": state, "Health": {"Status": health} if health else {}, "ExitCode": exit, "StartedAt": "t"}, "Config": {"Image": "img:1"},
                      "RestartCount": 2, "NetworkSettings": {"Ports": {"8000/tcp": [{"HostPort": "8000"}], "9/tcp": None}}}

    def logs(self, **kw):
        self.calls.append(("logs", kw))
        return b"2026-10-09T10:00:00Z line one\n"

    def __getattr__(self, n):
        if n in ops.ACTIONS:
            return lambda **kw: self.calls.append((n, kw))
        raise AttributeError(n)


class FakeClient:
    def __init__(self, boxes):
        self.boxes = {b.name: b for b in boxes}
        self.containers = self

    def list(self, all=False):
        return list(self.boxes.values())

    def get(self, name):
        if name not in self.boxes:
            raise KeyError(name)
        return self.boxes[name]


@pytest.fixture
def fleet(monkeypatch):
    f = {"host": FakeClient([Box("agent"), Box("ops"), Box("web", health="unhealthy")]), "agent": FakeClient([Box("phoenix"), Box("redis"), Box("crashy", "exited", exit=1)]),
         "web": FakeClient([Box("app-regime-lens")])}
    monkeypatch.setattr(ops, "CLIENTS", f)
    return f


@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setattr(ops, "WORKSPACE", tmp_path.resolve())
    (tmp_path / "apps/engine").mkdir(parents=True)
    (tmp_path / "apps/engine/a.py").write_text("x = 1\n")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git/config").write_text("secret")
    return tmp_path


def test_cookie_verification(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "s")
    assert ops.verify(token()) and not ops.verify(token(secret="other")) and not ops.verify(token(hours=-1)) and not ops.verify(token(who="guest")) and not ops.verify(None)
    monkeypatch.delenv("SESSION_SECRET")
    assert not ops.verify(token())                                         # no secret configured: nobody gets in


def test_the_workspace_is_a_fence(ws):
    for bad in ("../etc/passwd", "/etc/passwd", ".git/config", "apps/../../x"):
        with pytest.raises(HTTPException):
            ops.safe(bad)
    assert ops.read("apps/engine/a.py")["content"] == "x = 1\n"
    assert [e["name"] for e in ops.listing("")] == ["apps"] and ops.listing("apps/engine")[0]["path"] == "apps/engine/a.py"


def test_files_are_created_edited_found_and_deleted(ws):
    assert ops.write("apps/new/b.py", "y = 2\n")["bytes"] == 6
    assert ops.search("y = 2")[0] == {"path": "apps/new/b.py", "line": 1, "text": "y = 2"}
    assert ops.remove("apps/new")["ok"] and not (ws / "apps/new").exists()
    with pytest.raises(HTTPException):
        ops.remove("")
    (ws / "bin.dat").write_bytes(b"\xff\xfe\x00")
    with pytest.raises(HTTPException) as e:
        ops.read("bin.dat")
    assert e.value.status_code == 415


def test_containers_across_three_daemons(fleet):
    cs, errs = ops.containers()
    assert errs == {} and {(c["daemon"], c["name"]) for c in cs} >= {("host", "agent"), ("agent", "phoenix"), ("web", "app-regime-lens")}
    a = next(c for c in cs if c["name"] == "agent")
    assert a["ports"] == ["8000→8000"] and a["restarts"] == 2 and a["protected"] and not next(c for c in cs if c["name"] == "redis")["protected"]
    fleet["web"].list = lambda all=False: (_ for _ in ()).throw(RuntimeError("down"))
    assert "web" in ops.containers()[1]


def test_actions_and_protections(fleet):
    assert ops.act_container("agent", "redis", "restart")["ok"] and fleet["agent"].boxes["redis"].calls == [("restart", {})]
    ops.act_container("agent", "crashy", "remove")
    assert fleet["agent"].boxes["crashy"].calls == [("remove", {"force": True})]
    for name, action in (("agent", "stop"), ("ops", "remove"), ("web", "pause")):
        with pytest.raises(HTTPException) as e:
            ops.act_container("host", name, action)
        assert e.value.status_code == 403
    assert ops.act_container("host", "agent", "restart")["ok"]               # a restart is always allowed
    with pytest.raises(HTTPException):
        ops.act_container("host", "agent", "exec")
    with pytest.raises(HTTPException):
        ops.act_container("host", "ghost", "start")
    with pytest.raises(HTTPException):
        ops.client("elsewhere")


def test_state_counts_what_is_wrong(fleet, monkeypatch):
    async def fake(path, token=None):
        return {"ok": True} if path == "/health" else {"error": 401}
    monkeypatch.setattr(ops, "engine", fake)
    s = asyncio.run(ops.state("t"))
    assert s["summary"] == {"running": 7, "total": 8, "unhealthy": 2} or s["summary"]["unhealthy"] == 2
    assert s["engine"] == {"ok": True} and s["spans"] == {"error": 401}


def test_ops_agent_has_one_input_one_output_and_no_executing_tools():
    assert list(agent.Ops.input_fields) == ["intake"] and list(agent.Ops.output_fields) == ["report"]
    names = {t.__name__ for t in agent.TOOLS}
    assert names == {"list_containers", "container_logs", "engine_health", "read_file", "list_files", "search_files", "propose"}
    assert not ({"write", "act_container", "remove", "run"} & names)


def test_proposals_are_cards_not_actions(fleet, ws):
    box = []
    ops.PROPOSALS.set(box)
    assert "Run button" in agent.propose("container", "redis is at its memory cap", "agent", "redis", "restart")
    assert "Run button" in agent.propose("edit", "fix the typo", path="apps/engine/a.py", content="x = 2\n")
    assert agent.propose("container", "x", "agent", "redis", "explode").startswith("refused")
    assert agent.propose("edit", "x", path="../etc/passwd", content="").startswith("refused") and agent.propose("edit", "x", path=".git/config").startswith("refused")
    assert agent.propose("shell", "x").startswith("refused") and len(box) == 2
    assert fleet["agent"].boxes["redis"].calls == [] and ops.read("apps/engine/a.py")["content"] == "x = 1\n"        # nothing ran
    ops.PROPOSALS.set(None)
    assert "no operator" in agent.propose("container", "x", "agent", "redis", "restart")


def test_agent_tools_read_the_stack(fleet, ws):
    assert '"crashy"' in agent.list_containers() and "line one" in agent.container_logs("agent", "redis") and agent.container_logs("agent", "ghost").startswith("error")
    assert "x = 1" in agent.read_file("apps/engine/a.py") and "f apps/engine/a.py" in agent.list_files("apps/engine") and agent.read_file("../x").startswith("error")
