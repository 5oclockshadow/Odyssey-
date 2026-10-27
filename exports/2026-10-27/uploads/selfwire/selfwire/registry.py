"""
registry.py — the live, mutable catalog of tools the agent can call.

This is the one object every self-extension path (mcp_hub, own_server,
exec_tool) mutates. The DSPy agent reads `registry.as_dspy_tools()` fresh on
every reasoning turn, so adding or removing a tool here takes effect on the
agent's very next step — this *is* "you are allowed to modify the dspy
program": the program's tool surface is data, not a hardcoded list.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import dspy

from .graph_store import ToolGraph


@dataclass
class ToolRecord:
    name: str
    fn: Callable
    dspy_tool: dspy.Tool
    source: str  # "native" | "mcp:<server>" | "exec" | "own_server"
    description: str
    added_at: float = field(default_factory=time.time)
    version: int = 1
    call_count: int = 0
    error_count: int = 0


class ToolRegistryError(Exception):
    pass


class ToolRegistry:
    def __init__(self, graph: Optional[ToolGraph] = None) -> None:
        self._tools: dict[str, ToolRecord] = {}
        self._lock = threading.RLock()
        self.graph = graph or ToolGraph()

    # -- mutation -------------------------------------------------------------
    def register(
        self,
        fn: Callable,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        source: str = "native",
        overwrite: bool = False,
    ) -> ToolRecord:
        tool_name = name or getattr(fn, "__name__", None)
        if not tool_name:
            raise ToolRegistryError("tool needs an explicit name (function has none)")
        with self._lock:
            if tool_name in self._tools and not overwrite:
                raise ToolRegistryError(
                    f"tool '{tool_name}' already registered; pass overwrite=True to replace it"
                )
            version = self._tools[tool_name].version + 1 if tool_name in self._tools else 1
            desc = description or (fn.__doc__ or f"tool '{tool_name}'").strip()
            dspy_tool = dspy.Tool(fn, name=tool_name, desc=desc)
            record = ToolRecord(
                name=tool_name, fn=fn, dspy_tool=dspy_tool, source=source, description=desc, version=version
            )
            self._tools[tool_name] = record
            self.graph.ensure_node(tool_name, source=source)
            return record

    def register_dspy_tool(self, dspy_tool: dspy.Tool, *, source: str = "mcp", overwrite: bool = False) -> ToolRecord:
        """For tools that arrive already wrapped (e.g. dspy.Tool.from_mcp_tool)."""
        tool_name = dspy_tool.name
        with self._lock:
            if tool_name in self._tools and not overwrite:
                raise ToolRegistryError(
                    f"tool '{tool_name}' already registered; pass overwrite=True to replace it"
                )
            version = self._tools[tool_name].version + 1 if tool_name in self._tools else 1
            record = ToolRecord(
                name=tool_name,
                fn=dspy_tool.func,
                dspy_tool=dspy_tool,
                source=source,
                description=dspy_tool.desc or "",
                version=version,
            )
            self._tools[tool_name] = record
            self.graph.ensure_node(tool_name, source=source)
            return record

    def unregister(self, name: str) -> bool:
        with self._lock:
            return self._tools.pop(name, None) is not None

    # -- read -------------------------------------------------------------------
    def get(self, name: str) -> Optional[ToolRecord]:
        return self._tools.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def names(self) -> list[str]:
        return sorted(self._tools.keys())

    def list(self) -> list[ToolRecord]:
        return list(self._tools.values())

    def as_dspy_tools(self) -> list[dspy.Tool]:
        with self._lock:
            return [r.dspy_tool for r in self._tools.values()]

    # -- invocation (tracked) ----------------------------------------------------
    def call(self, name: str, episode_id: str = "default", **kwargs) -> Any:
        """Synchronous call path used by the (synchronous) agent loop.

        Goes through `record.dspy_tool(**kwargs)` rather than `record.fn`
        directly: tools that came from mcp_hub wrap an *async* `call_tool`
        under the hood (MCP sessions are async-only), so `record.fn` there is
        a coroutine function — calling it directly would just hand back an
        un-awaited coroutine instead of a result. `dspy.Tool.__call__`
        already knows how to bridge a coroutine result back to a sync call;
        we scope `allow_tool_async_sync_conversion` to just this call via
        `dspy.context` rather than flipping it globally.
        """
        record = self.get(name)
        if record is None:
            raise ToolRegistryError(f"no such tool: '{name}'")
        try:
            with dspy.context(allow_tool_async_sync_conversion=True):
                result = record.dspy_tool(**kwargs)
            record.call_count += 1
            self.graph.record_use(episode_id, name, source=record.source)
            return result
        except Exception:
            record.error_count += 1
            self.graph.record_use(episode_id, name, source=record.source)
            raise

    def stats(self) -> dict:
        return {
            r.name: {
                "source": r.source,
                "version": r.version,
                "call_count": r.call_count,
                "error_count": r.error_count,
                "added_at": r.added_at,
            }
            for r in self._tools.values()
        }
