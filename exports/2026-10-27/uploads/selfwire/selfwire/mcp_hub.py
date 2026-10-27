"""
mcp_hub.py — lever #2: attach to *external* MCP servers and pull their tools
into the registry.

Each connection is a long-lived asyncio task holding an `AsyncExitStack`
(stdio transport + ClientSession), because the MCP client session has to stay
open for the lifetime of the connection. We run one dedicated background
event loop thread for the hub so a synchronous caller (the DSPy agent loop)
can attach/detach servers and call tools without itself being async.
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import dspy

from .registry import ToolRegistry, ToolRegistryError


class McpHubError(Exception):
    pass


@dataclass
class McpConnection:
    name: str
    command: str
    args: list[str]
    session: Any
    stack: AsyncExitStack
    tool_names: list[str] = field(default_factory=list)
    connected_at: float = field(default_factory=time.time)


class _Loop:
    """One background event loop thread the hub drives everything through."""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro, timeout: Optional[float] = 30.0):
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return fut.result(timeout=timeout)


class McpHub:
    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry
        self._connections: dict[str, McpConnection] = {}
        self._lock = threading.RLock()
        self._loop = _Loop()

    # -- async->sync bridging for MCP-derived tools ---------------------------
    def _wrap_sync(self, dspy_tool: dspy.Tool, exposed_name: str) -> dspy.Tool:
        """Rewrap an MCP-derived dspy.Tool so calling it *synchronously* is safe
        from any thread.

        `dspy.Tool.from_mcp_tool` wraps `session.call_tool(...)`, which is a
        coroutine bound to whatever event loop the `ClientSession` is running
        on — here, this hub's dedicated background loop (`self._loop`). If
        something calls that coroutine's result through dspy's own generic
        async-to-sync bridge (`Tool.__call__` -> `_run_async_in_sync`), that
        bridge runs the coroutine on the *calling* thread's loop instead —
        the session's read/write memory streams belong to a different loop,
        so the call hangs forever waiting on a stream nothing is servicing.
        This wrapper always hands the coroutine back to `self._loop.run(...)`
        (thread-safe by construction), regardless of which thread calls it,
        and returns a plain synchronous function — so from the outside this
        is just a normal tool.
        """
        original_func = dspy_tool.func

        def sync_fn(**kwargs):
            result = original_func(**kwargs)
            if asyncio.iscoroutine(result):
                result = self._loop.run(result)
            # FastMCP auto-generates an output schema for scalar returns by
            # wrapping them as {"result": <value>} (its "<ToolName>Output"
            # convention) — unwrap that one case so a tool declared as
            # `-> int` round-trips as an int, not a single-key dict. A tool
            # that genuinely returns an object keeps its real shape.
            if isinstance(result, dict) and set(result.keys()) == {"result"}:
                return result["result"]
            return result

        return dspy.Tool(
            sync_fn, name=exposed_name, desc=dspy_tool.desc,
            args=dspy_tool.args, arg_types=dspy_tool.arg_types, arg_desc=dspy_tool.arg_desc,
        )

    # -- lifecycle ----------------------------------------------------------
    def connect_stdio(
        self,
        server_name: str,
        command: str,
        args: Optional[list[str]] = None,
        env: Optional[dict[str, str]] = None,
        prefix_tools: bool = True,
        timeout: float = 30.0,
    ) -> list[str]:
        """Spawn/attach a stdio MCP server and register every tool it advertises.

        Returns the list of registered tool names.
        """
        with self._lock:
            if server_name in self._connections:
                raise McpHubError(f"already connected to an MCP server named '{server_name}'")

        async def _connect():
            params = StdioServerParameters(command=command, args=args or [], env=env)
            stack = AsyncExitStack()
            try:
                read, write = await stack.enter_async_context(stdio_client(params))
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                tools_result = await session.list_tools()
                registered = []
                for t in tools_result.tools:
                    dspy_tool = dspy.Tool.from_mcp_tool(session, t, result_mode="structured")
                    exposed_name = f"{server_name}__{t.name}" if prefix_tools else t.name
                    wrapped = self._wrap_sync(dspy_tool, exposed_name)
                    self.registry.register_dspy_tool(wrapped, source=f"mcp:{server_name}", overwrite=True)
                    registered.append(exposed_name)
                conn = McpConnection(
                    name=server_name, command=command, args=args or [], session=session,
                    stack=stack, tool_names=registered,
                )
                with self._lock:
                    self._connections[server_name] = conn
                return registered
            except Exception:
                # NOTE: deliberately try/except, not try/except/finally. A
                # `finally: await stack.aclose()` here would close the
                # stdio transport and session on the *success* path too,
                # tearing down the very connection we just opened before
                # returning it. Cleanup only belongs on the failure branch;
                # the open connection is closed later, on purpose, by
                # disconnect().
                await stack.aclose()
                raise

        return self._loop.run(_connect(), timeout=timeout)

    def disconnect(self, server_name: str, timeout: float = 15.0) -> bool:
        with self._lock:
            conn = self._connections.pop(server_name, None)
        if conn is None:
            return False
        for tool_name in conn.tool_names:
            self.registry.unregister(tool_name)

        async def _close():
            await conn.stack.aclose()

        try:
            self._loop.run(_close(), timeout=timeout)
        except Exception:
            pass  # best-effort teardown; tools are already unregistered
        return True

    def refresh(self, server_name: str, timeout: float = 30.0) -> list[str]:
        """Re-list tools on an already-connected server (it may have grown some).

        This does real network IO against a live subprocess (`list_tools()`
        over the stdio transport) and had no error handling at all until this
        pass — a hiccup mid-refresh (server briefly unresponsive, a tool with
        a schema that fails to convert) would previously raise a raw,
        undecorated exception straight out of the asyncio bridge. Now it's
        caught, given context, and re-raised as a McpHubError; the connection
        entry's tool list is only overwritten in `finally` once we know
        whether the refresh actually produced a usable list, so a failed
        refresh can't silently wipe out a working `tool_names` with an empty
        one.
        """
        with self._lock:
            conn = self._connections.get(server_name)
        if conn is None:
            raise McpHubError(f"not connected to '{server_name}'")

        async def _refresh():
            tools_result = await conn.session.list_tools()
            new_names = []
            for t in tools_result.tools:
                exposed_name = f"{server_name}__{t.name}"
                dspy_tool = dspy.Tool.from_mcp_tool(conn.session, t, result_mode="structured")
                wrapped = self._wrap_sync(dspy_tool, exposed_name)
                self.registry.register_dspy_tool(wrapped, source=f"mcp:{server_name}", overwrite=True)
                new_names.append(exposed_name)
            return new_names

        names: Optional[list[str]] = None
        try:
            names = self._loop.run(_refresh(), timeout=timeout)
            return names
        except Exception as e:
            raise McpHubError(f"refresh of '{server_name}' failed: {e}") from e
        finally:
            if names is not None:
                conn.tool_names = names

    def connections(self) -> list[dict]:
        with self._lock:
            return [
                {"name": c.name, "command": c.command, "args": c.args, "tools": c.tool_names, "connected_at": c.connected_at}
                for c in self._connections.values()
            ]

    def shutdown(self) -> None:
        for name in list(self._connections.keys()):
            self.disconnect(name)
