"""
exec_tool.py — lever #4: raw python `exec`, as the last-resort way to
synthesize a brand-new tool (or run a one-off snippet) when nothing in the
registry and no reachable MCP server covers what's needed.

Two entry points:

  * `define_tool(name, source_code, description)` — compiles source that
    defines exactly one top-level function `name`, wraps it, and registers
    it in the ToolRegistry as a normal callable tool (source="exec"). This
    is how the agent grows genuinely new tools at runtime.

  * `run_snippet(code, timeout)` — runs an arbitrary snippet to completion
    (or timeout) in a *separate process*, via `exec()` inside that child, and
    returns captured stdout/stderr/result. Used for one-off computation that
    doesn't need to become a permanent tool.

Honesty note: `_static_guard` is a best-effort static filter against a few
obviously dangerous patterns (shelling out, raw sockets, re-importing
`os`/`subprocess` under another name, etc.). It is **not** a security
sandbox — anyone who can reach this tool can still run arbitrary code as
this process's user (or, for `run_snippet`, as the child process's user).
The process isolation in `run_snippet` bounds *runtime and crashes*, not
*intent*. Treat both entry points as fully privileged and gate access to
them accordingly.
"""

from __future__ import annotations

import ast
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass
from typing import Any, Optional

from .registry import ToolRegistry, ToolRecord, ToolRegistryError

BANNED_SUBSTRINGS = (
    "os.system", "subprocess", "socket.", "ctypes", "__import__(\"os\")",
    "__import__('os')", "shutil.rmtree", "eval(", "exec(", "/etc/passwd",
)


class ExecToolError(Exception):
    pass


@dataclass
class SnippetResult:
    ok: bool
    stdout: str
    stderr: str
    duration_s: float
    returncode: int


def _static_guard(source_code: str, allow_unsafe: bool) -> None:
    if allow_unsafe:
        return
    lowered = source_code
    for token in BANNED_SUBSTRINGS:
        if token in lowered:
            raise ExecToolError(
                f"source contains a guarded pattern ({token!r}); pass allow_unsafe=True "
                "to define this tool anyway (this is a best-effort filter, not a sandbox)"
            )


def _extract_single_function(tree: ast.Module, expected_name: str) -> ast.FunctionDef:
    funcs = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if not funcs:
        raise ExecToolError("source_code must define exactly one top-level function")
    if len(funcs) > 1:
        raise ExecToolError(f"source_code defines {len(funcs)} top-level functions; expected exactly one")
    fn_node = funcs[0]
    if fn_node.name != expected_name:
        raise ExecToolError(f"top-level function is named '{fn_node.name}', expected '{expected_name}'")
    return fn_node


class ExecTool:
    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry

    # -- new permanent tool from source --------------------------------------
    def define_tool(
        self,
        name: str,
        source_code: str,
        description: str = "",
        allow_unsafe: bool = False,
        overwrite: bool = True,
    ) -> ToolRecord:
        source_code = textwrap.dedent(source_code).strip()
        try:
            tree = ast.parse(source_code, mode="exec")
        except SyntaxError as e:
            raise ExecToolError(f"source_code does not parse: {e}") from e

        _extract_single_function(tree, name)
        _static_guard(source_code, allow_unsafe=allow_unsafe)

        namespace: dict[str, Any] = {"__builtins__": __builtins__}
        try:
            exec(compile(tree, filename=f"<exec_tool:{name}>", mode="exec"), namespace)  # noqa: S102 - this *is* the exec lever
        except Exception as e:
            raise ExecToolError(f"source_code raised while being defined: {e}") from e

        fn = namespace.get(name)
        if fn is None or not callable(fn):
            raise ExecToolError(f"source_code did not produce a callable named '{name}'")

        try:
            record = self.registry.register(
                fn, name=name, description=description or (fn.__doc__ or "").strip(),
                source="exec", overwrite=overwrite,
            )
        except ToolRegistryError:
            raise
        return record

    # -- one-off snippet in an isolated child process ------------------------
    def run_snippet(self, code: str, timeout: float = 10.0) -> SnippetResult:
        wrapper = textwrap.dedent(
            f"""
            import sys, io, contextlib
            _src = {code!r}
            _out, _err = io.StringIO(), io.StringIO()
            try:
                with contextlib.redirect_stdout(_out), contextlib.redirect_stderr(_err):
                    exec(compile(_src, "<snippet>", "exec"), {{"__name__": "__snippet__"}})
                sys.stdout.write(_out.getvalue())
                sys.stderr.write(_err.getvalue())
                sys.exit(0)
            except Exception as e:
                sys.stdout.write(_out.getvalue())
                sys.stderr.write(_err.getvalue())
                sys.stderr.write(f"\\n{{type(e).__name__}}: {{e}}")
                sys.exit(1)
            """
        )
        start = time.time()
        result: Optional[SnippetResult] = None
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-c", wrapper],
                capture_output=True, text=True, timeout=timeout,
            )
            result = SnippetResult(
                ok=proc.returncode == 0, stdout=proc.stdout, stderr=proc.stderr,
                duration_s=0.0, returncode=proc.returncode,
            )
            return result
        except subprocess.TimeoutExpired as e:
            result = SnippetResult(
                ok=False, stdout=e.stdout or "", stderr=(e.stderr or "") + f"\ntimed out after {timeout}s",
                duration_s=0.0, returncode=-1,
            )
            return result
        except Exception as e:
            result = SnippetResult(ok=False, stdout="", stderr=str(e), duration_s=0.0, returncode=-1)
            return result
        finally:
            # Single source of truth for duration, patched in here instead
            # of duplicating `time.time() - start` at three return sites.
            # This works, and isn't a race, because of a specific Python
            # semantic: `return result` evaluates and captures the object
            # *reference* before `finally` runs, but the function doesn't
            # actually hand control back to the caller until after
            # `finally` completes — so mutating the same (dataclass, hence
            # mutable) object here is visible in what the caller receives.
            # (Verified: a `finally` that mutates an already-`return`ed
            # mutable object changes what the caller sees.)
            if result is not None:
                result.duration_s = time.time() - start
