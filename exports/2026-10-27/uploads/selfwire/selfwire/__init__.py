"""
selfwire — barebones self-extension scaffold for a DSPy agent.

Gives an agent four raw levers over its own capability surface:

  1. registry     — the live catalog of callable tools (add/remove at runtime)
  2. mcp_hub       — attach to *external* MCP servers and pull their tools in
  3. own_server    — the agent's *own* FastMCP server, growable at runtime,
                     so other MCP clients (or the agent itself) can add tools
                     to it and call back into it
  4. exec_tool     — raw python `exec`, guarded, as a last-resort way to
                     synthesize a brand new tool from source on the fly

`agent.py` wires all four behind one dual-process DSPy signature (one input
field, one output field, three BaseModels stacked inside that output field:
left_brain / right_brain / synthesis) and a bounded reasoning loop that acts
on the synthesized decision each turn.
"""

# NOTE: `dspy` (>=3.x, installed: 3.4.0) installs a lazy-import stub for
# `anyio` as a side effect of plain `import dspy` (via dspy.utils.lazy_import,
# used by its streaming/async client code). If `mcp` (installed: 1.27.0) then
# does `import anyio.lowlevel` against that stub instead of a real module,
# anyio's own internal submodule loading races and raises:
#   ImportError: cannot import name 'checkpoint_if_cancelled' from partially
#   initialized module 'anyio.lowlevel' (most likely due to a circular import)
# This reproduces with a bare `import dspy; import mcp` in any script — it
# does not depend on import order inside this package, so it can't be fixed
# by just reordering our own imports (we tried; it only helps if *we* are the
# first thing imported in the process, which we can't guarantee). The fix:
# if dspy already installed the stub, discard it and force a real, complete
# `anyio` import before `mcp` ever touches it.
import sys as _sys

if "anyio" in _sys.modules:
    for _mod in [m for m in _sys.modules if m == "anyio" or m.startswith("anyio.")]:
        del _sys.modules[_mod]
import anyio.lowlevel as _anyio_lowlevel  # noqa: F401  - forces the real, full import
import mcp as _mcp  # noqa: F401

from .registry import ToolRegistry, ToolRecord
from .storage import RaptorRedisStore
from .graph_store import ToolGraph
from .mcp_hub import McpHub
from .own_server import OwnServer
from .exec_tool import ExecTool
from .telemetry import Telemetry
from .reporter import Reporter
from .agent import SelfWireAgent, Cognize, DualCognitionFrame, AnalyticalTrace, IntuitiveTrace, SynthesizedAction

__all__ = [
    "ToolRegistry",
    "ToolRecord",
    "RaptorRedisStore",
    "ToolGraph",
    "McpHub",
    "OwnServer",
    "ExecTool",
    "Telemetry",
    "Reporter",
    "SelfWireAgent",
    "Cognize",
    "DualCognitionFrame",
    "AnalyticalTrace",
    "IntuitiveTrace",
    "SynthesizedAction",
]

__version__ = "0.3.0"
