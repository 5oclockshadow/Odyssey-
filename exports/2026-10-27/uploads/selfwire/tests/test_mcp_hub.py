"""mcp_hub.py — attaching to a *real* external MCP server over stdio, not a
mock: tests/fixtures/tiny_mcp_server.py is spawned as an actual subprocess
and driven over the real MCP protocol."""

import sys
from pathlib import Path

import pytest

from selfwire.mcp_hub import McpHubError

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
TINY_MCP_SERVER = str(FIXTURES_DIR / "tiny_mcp_server.py")


def test_connect_stdio_registers_prefixed_tools(mcp_hub, registry):
    names = mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    assert set(names) == {"tiny__multiply", "tiny__shout"}
    assert set(registry.names()) == {"tiny__multiply", "tiny__shout"}
    for name in names:
        assert registry.get(name).source == "mcp:tiny"


def test_call_tool_through_registry_round_trips_a_real_subprocess(mcp_hub, registry):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    assert registry.call("tiny__multiply", episode_id="e1", a=6, b=7) == 42
    assert registry.call("tiny__shout", episode_id="e1", text="it works") == "IT WORKS!"


def test_call_tool_is_tracked_on_the_hebbian_graph(mcp_hub, registry, graph):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    registry.call("tiny__multiply", episode_id="e1", a=2, b=2)
    registry.call("tiny__shout", episode_id="e1", text="hi")
    assert graph.g.has_edge("tiny__multiply", "tiny__shout")


def test_connecting_twice_with_same_name_raises(mcp_hub):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    with pytest.raises(McpHubError):
        mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])


def test_disconnect_unregisters_tools(mcp_hub, registry):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    assert registry.names()
    assert mcp_hub.disconnect("tiny") is True
    assert registry.names() == []


def test_disconnect_unknown_server_returns_false(mcp_hub):
    assert mcp_hub.disconnect("never-connected") is False


def test_refresh_relists_tools(mcp_hub, registry):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    names = mcp_hub.refresh("tiny")
    assert set(names) == {"tiny__multiply", "tiny__shout"}


def test_refresh_unknown_server_raises(mcp_hub):
    with pytest.raises(McpHubError):
        mcp_hub.refresh("never-connected")


def test_connect_to_a_command_that_does_not_exist_raises(mcp_hub):
    with pytest.raises(Exception):
        mcp_hub.connect_stdio("bad", "/no/such/binary-xyz", [], timeout=5.0)
    # and must not have left a half-registered connection behind
    assert mcp_hub.connections() == []


def test_connections_lists_active_connections(mcp_hub):
    mcp_hub.connect_stdio("tiny", sys.executable, [TINY_MCP_SERVER])
    conns = mcp_hub.connections()
    assert len(conns) == 1
    assert conns[0]["name"] == "tiny"
    assert set(conns[0]["tools"]) == {"tiny__multiply", "tiny__shout"}
