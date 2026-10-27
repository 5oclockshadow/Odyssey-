"""No docker, no network, no MCP child processes: the registry CRUD, its guards, the market parser, the deny lists, the bearer gate."""
import asyncio
import json

import pytest

import hub


@pytest.fixture(autouse=True)
def data(tmp_path, monkeypatch):
    monkeypatch.setattr(hub, "DATA", tmp_path)
    hub._tool_cache.clear()
    return tmp_path


def run(coro):
    return asyncio.run(coro)


def test_first_start_seeds_the_registry_from_servers_json(data):
    reg = hub.load()
    assert {"filesystem", "github", "slack", "wolframalpha", "apify"} <= set(reg["servers"]) and (data / "servers.json").exists()
    assert all(s["source"] == "seed" for s in reg["servers"].values())


def test_install_update_remove_roundtrip_and_audit(data):
    assert "installed" in run(hub.market_install("arxiv", "uvx", '["arxiv-mcp-server"]', '["ARXIV_KEY"]', "papers"))
    spec = hub.load()["servers"]["arxiv"]
    assert spec["source"] == "market" and spec["env"] == ["ARXIV_KEY"]
    assert "updated" in run(hub.market_update("arxiv", args_json='["arxiv-mcp-server", "--fast"]', enabled="false"))
    spec = hub.load()["servers"]["arxiv"]
    assert spec["args"][-1] == "--fast" and spec["enabled"] is False
    assert "removed" in run(hub.market_remove("arxiv")) and "arxiv" not in hub.load()["servers"]
    actions = [json.loads(ln)["action"] for ln in (data / "audit.jsonl").read_text().splitlines()]
    assert actions == ["install", "update", "remove"]
    assert [r["action"] for r in json.loads(run(hub.audit_tail(2)))] == ["remove", "update"]


def test_the_guards():
    assert hub.validate("Bad Name", "npx", [], []) and hub.validate("x", "npx", [], []) and hub.validate("ok-name", "bash", [], [])
    assert "reserved" in hub.validate("slack", "npx", ["-y", "x"], [])
    assert hub.validate("ok-name", "npx", ["-y", "x"], ["lower"]) and hub.validate("ok-name", "npx", ["-y", "x"], ["API_KEY"]) is None
    assert run(hub.market_install("ok-name", "sh", "[]")).startswith("refused")
    assert run(hub.market_install("filesystem", "npx", '["-y","x"]')).startswith("refused")      # already there
    assert run(hub.market_remove("github")).startswith("refused")                                  # seeds can be disabled, not removed
    assert run(hub.market_update("github", args_json='["-y","evil"]')).startswith("refused")
    assert "updated" in run(hub.market_update("github", enabled="false"))
    with pytest.raises(ValueError):
        hub._spec("github")                                                                        # disabled servers do not run


def test_server_count_is_capped():
    reg = hub.load()
    for i in range(hub.MAX_SERVERS):
        reg["servers"][f"s{i:02d}"] = {"command": "npx", "args": [], "env": []}
    assert "at most" in hub.validate("one-more", "npx", ["-y", "x"], [], reg)


def test_deny_lists_hide_and_refuse_social_and_repository_writes(data):
    assert hub.visible(hub.load()["servers"]["slack"], "slack_list_channels")
    assert not hub.visible(hub.load()["servers"]["slack"], "slack_post_message")
    assert not hub.visible(hub.load()["servers"]["github"], "push_files")
    assert run(hub.tools_call("slack", "slack_post_message", "{}")).startswith("refused")
    assert "denied" in (data / "audit.jsonl").read_text()


def test_servers_list_reports_missing_secrets(monkeypatch):
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.setenv("GITHUB_PERSONAL_ACCESS_TOKEN", "x")
    rows = {r["name"]: r for r in json.loads(run(hub.servers_list()))}
    assert rows["apify"]["missing_env"] == ["APIFY_TOKEN"] and rows["github"]["missing_env"] == [] and "push_files" in rows["github"]["denied_tools"]


def test_market_payload_shapes_are_parsed():
    flat = {"servers": [{"name": "io.x/arxiv", "description": "papers", "version": "1.0", "packages": [{"registryType": "pypi", "identifier": "arxiv-mcp-server",
            "environmentVariables": [{"name": "ARXIV_KEY"}]}]}]}
    wrapped = {"servers": [{"server": {"name": "io.x/docs", "packages": [{"registry_type": "npm", "identifier": "@x/docs"}], "remotes": [{"url": "https://m.example/mcp"}]}}]}
    a, b = hub.parse_market(flat)[0], hub.parse_market(wrapped)[0]
    assert a["env"] == ["ARXIV_KEY"] and hub.suggest(a) == {"command": "uvx", "args": ["arxiv-mcp-server"]}
    assert hub.suggest(b) == {"command": "npx", "args": ["-y", "@x/docs"]} and b["remote"] == "https://m.example/mcp"
    assert hub.parse_market({}) == [] and hub.suggest({"registry": "oci", "package": "x"}) == {}


def test_time_now():
    assert "T" in run(hub.time_now("Europe/London")) and run(hub.time_now("Nowhere/Land")).startswith("unknown")


def test_bearer_gate():
    seen = []

    async def app(scope, receive, send):
        seen.append(scope["path"])
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    def call(gate, path, auth=None):
        out = []

        async def send(m):
            out.append(m)
        scope = {"type": "http", "path": path, "headers": [(b"authorization", auth.encode())] if auth else []}
        asyncio.run(gate(scope, None, send))
        return out[0]["status"]

    g = hub.Bearer(app, "s3cret")
    assert call(g, "/mcp") == 401 and call(g, "/mcp", "Bearer wrong") == 401 and call(g, "/mcp", "Bearer s3cret") == 200 and call(g, "/healthz") == 200
    assert call(hub.Bearer(app, None), "/mcp", "Bearer ") == 401              # no token configured: nothing is served
