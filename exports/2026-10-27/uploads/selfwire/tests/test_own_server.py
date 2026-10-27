"""own_server.py — the agent's own growable MCP server: registry <-> FastMCP
mirroring, and the meta-tools (add_python_tool / remove_tool / list_tools)
that let self-extension happen *over MCP itself*, not just via in-process
Python calls."""

import asyncio
import json

import pytest


def _run(coro):
    return asyncio.run(coro)


def _call(own_server, name, args):
    """FastMCP's in-process `call_tool()` returns content blocks (a list of
    TextContent), not the structured dict directly — that structured form
    only comes back through a real ClientSession round trip (covered in
    test_mcp_hub.py). Here we just parse the JSON text block, which is what
    every real MCP client does too."""
    result = _run(own_server.mcp.call_tool(name, args))
    if isinstance(result, dict):
        return result
    return json.loads(result[0].text)


def test_meta_tools_are_registered_on_construction(own_server):
    tools = _run(own_server.mcp.list_tools())
    names = {t.name for t in tools}
    assert {"add_python_tool", "remove_tool", "list_tools"}.issubset(names)


def test_add_python_tool_meta_tool_defines_and_syncs(own_server, registry):
    payload = _call(
        own_server,
        "add_python_tool",
        {
            "name": "square",
            "source_code": "def square(n: int) -> int:\n    return n * n",
            "description": "squares a number",
        },
    )
    assert payload["ok"] is True
    assert payload["tool"] == "square"
    assert "square" in registry.names()
    # and it must actually be callable on the mirrored FastMCP server too
    server_tools = {t.name for t in _run(own_server.mcp.list_tools())}
    assert "square" in server_tools


def test_add_python_tool_meta_tool_rejects_dangerous_source(own_server):
    payload = _call(
        own_server,
        "add_python_tool",
        {"name": "bad", "source_code": "import subprocess\ndef bad():\n    subprocess.run(['ls'])"},
    )
    assert payload["ok"] is False
    assert "error" in payload


def test_remove_tool_meta_tool(own_server, registry):
    def plain():
        return 1

    registry.register(plain, name="plain")
    own_server.sync_tool("plain")
    payload = _call(own_server, "remove_tool", {"name": "plain"})
    assert payload["ok"] is True
    assert "plain" not in registry.names()


def test_list_tools_meta_tool_reports_registry_stats(own_server, registry):
    def plain():
        return 1

    registry.register(plain, name="plain")
    payload = _call(own_server, "list_tools", {})
    assert "plain" in payload["tools"]


def test_sync_all_mirrors_every_registry_tool(own_server, registry):
    def a():
        return 1

    def b():
        return 2

    registry.register(a, name="a")
    registry.register(b, name="b")
    synced = own_server.sync_all()
    assert set(synced) == {"a", "b"}
    server_tools = {t.name for t in _run(own_server.mcp.list_tools())}
    assert {"a", "b"}.issubset(server_tools)
