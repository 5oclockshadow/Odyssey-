"""
own_server.py — lever #3: the agent's own MCP server.

Two things live here:

  1. A FastMCP server that mirrors the registry: every tool the agent
     acquires (native, from another MCP server, or self-written via exec)
     is also exposed *outward* here, so any other MCP client (Claude
     Desktop, another agent, `mcp inspect`) can call back into this agent's
     capability surface.
  2. A small set of *meta-tools* registered on that same server —
     `add_python_tool`, `attach_mcp_server`, `remove_tool` — which let a
     caller (including the agent's own exec/DSPy loop) grow this server and
     the registry from the outside, over the MCP protocol itself, not just
     from in-process Python calls.

Runs over stdio by default; `run_http()` is available for streamable-HTTP
when the deployment needs a network-reachable server (see docker-compose.yml).
"""

from __future__ import annotations

import threading
import traceback
import warnings
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from .registry import ToolRegistry, ToolRegistryError
from .exec_tool import ExecTool, ExecToolError


class OwnServer:
    def __init__(self, registry: ToolRegistry, exec_tool: Optional[ExecTool] = None, name: str = "selfwire-agent") -> None:
        self.registry = registry
        self.exec_tool = exec_tool or ExecTool(registry)
        # mcp.server.fastmcp.Settings has a pydantic-settings field
        # ("lifespan") with an unresolved forward reference at class
        # definition time; harmless (we don't use that field), but noisy.
        # Scoped narrowly to this one construction so we don't mask real
        # warnings elsewhere.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message=r"Field 'lifespan' has an incomplete definition.*")
            self.mcp = FastMCP(name)
        self._server_thread: Optional[threading.Thread] = None
        self._register_meta_tools()

    # -- keep FastMCP's own tool list synced with the registry -----------------
    def sync_tool(self, name: str) -> None:
        """Mirror one registry tool onto this MCP server (idempotent)."""
        record = self.registry.get(name)
        if record is None:
            return
        try:
            self.mcp.remove_tool(name)
        except Exception:
            pass
        self.mcp.add_tool(record.fn, name=record.name, description=record.description)

    def sync_all(self) -> list[str]:
        synced = []
        for record in self.registry.list():
            self.sync_tool(record.name)
            synced.append(record.name)
        return synced

    def unsync_tool(self, name: str) -> None:
        try:
            self.mcp.remove_tool(name)
        except Exception:
            pass

    # -- meta-tools: self-extension exposed *as MCP tools* ----------------------
    def _register_meta_tools(self) -> None:
        registry = self.registry
        exec_tool = self.exec_tool
        own = self

        def add_python_tool(name: str, source_code: str, description: str = "") -> dict:
            """Compile `source_code` (must define exactly one top-level function
            named `name`), register it as a new callable tool, and expose it on
            this server. This is the exec-based self-extension path, reachable
            over MCP."""
            try:
                record = exec_tool.define_tool(name=name, source_code=source_code, description=description)
                own.sync_tool(record.name)
                return {"ok": True, "tool": record.name, "version": record.version}
            except (ExecToolError, ToolRegistryError) as e:
                return {"ok": False, "error": str(e)}
            except Exception as e:
                return {"ok": False, "error": f"unexpected: {e}", "trace": traceback.format_exc(limit=3)}

        def remove_tool(name: str) -> dict:
            """Remove a tool from the registry and from this server."""
            existed = registry.unregister(name)
            own.unsync_tool(name)
            return {"ok": True, "removed": existed}

        def list_tools_meta() -> dict:
            """List every tool currently available to the agent, with basic stats."""
            return {"tools": registry.stats()}

        self.mcp.add_tool(add_python_tool, name="add_python_tool", description=add_python_tool.__doc__)
        self.mcp.add_tool(remove_tool, name="remove_tool", description=remove_tool.__doc__)
        self.mcp.add_tool(list_tools_meta, name="list_tools", description=list_tools_meta.__doc__)

    # -- running -------------------------------------------------------------
    def run_stdio_blocking(self) -> None:
        """Blocking call — run this in its own process/thread."""
        self.mcp.run(transport="stdio")

    def run_http_blocking(self, host: str = "0.0.0.0", port: int = 8800) -> None:
        self.mcp.settings.host = host
        self.mcp.settings.port = port
        self.mcp.run(transport="streamable-http")

    def start_background(self, transport: str = "stdio", **kwargs) -> threading.Thread:
        target = self.run_stdio_blocking if transport == "stdio" else lambda: self.run_http_blocking(**kwargs)
        t = threading.Thread(target=target, daemon=True)
        t.start()
        self._server_thread = t
        return t
