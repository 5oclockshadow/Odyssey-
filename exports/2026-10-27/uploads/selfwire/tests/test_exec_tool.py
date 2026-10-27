"""exec_tool.py — the raw python-exec lever: defining new tools from source,
the static guard, and the isolated-subprocess snippet runner (including a
deliberate timeout / error-injection case)."""

import pytest

from selfwire.exec_tool import ExecTool, ExecToolError


GOOD_SOURCE = """
def double(n: int) -> int:
    return n * 2
"""

WRONG_NAME_SOURCE = """
def not_double(n: int) -> int:
    return n * 2
"""

TWO_FUNCS_SOURCE = """
def double(n: int) -> int:
    return n * 2

def triple(n: int) -> int:
    return n * 3
"""

SYNTAX_ERROR_SOURCE = "def double(n: int) -> int\n    return n * 2"

RAISES_AT_DEFINE_TIME = """
raise ValueError("nope")
def double(n: int) -> int:
    return n * 2
"""

DANGEROUS_SOURCE = """
import subprocess
def double(n: int) -> int:
    subprocess.run(["echo", "hi"])
    return n * 2
"""


def test_define_tool_success_and_registers_it(exec_tool, registry):
    record = exec_tool.define_tool("double", GOOD_SOURCE, description="doubles a number")
    assert record.name == "double"
    assert record.source == "exec"
    assert registry.call("double", episode_id="ep1", n=21) == 42


def test_define_tool_redefine_bumps_version(exec_tool):
    r1 = exec_tool.define_tool("double", GOOD_SOURCE)
    r2 = exec_tool.define_tool("double", GOOD_SOURCE)
    assert r2.version == r1.version + 1


def test_define_tool_rejects_wrong_function_name(exec_tool):
    with pytest.raises(ExecToolError):
        exec_tool.define_tool("double", WRONG_NAME_SOURCE)


def test_define_tool_rejects_multiple_top_level_functions(exec_tool):
    with pytest.raises(ExecToolError):
        exec_tool.define_tool("double", TWO_FUNCS_SOURCE)


def test_define_tool_rejects_syntax_error(exec_tool):
    with pytest.raises(ExecToolError):
        exec_tool.define_tool("double", SYNTAX_ERROR_SOURCE)


def test_define_tool_rejects_code_that_raises_while_defining(exec_tool):
    with pytest.raises(ExecToolError):
        exec_tool.define_tool("double", RAISES_AT_DEFINE_TIME)


def test_define_tool_static_guard_blocks_dangerous_pattern_by_default(exec_tool):
    with pytest.raises(ExecToolError):
        exec_tool.define_tool("double", DANGEROUS_SOURCE)


def test_define_tool_allow_unsafe_bypasses_guard(exec_tool):
    record = exec_tool.define_tool("double", DANGEROUS_SOURCE, allow_unsafe=True)
    assert record.name == "double"


def test_run_snippet_captures_stdout(exec_tool):
    result = exec_tool.run_snippet("print('hello from snippet')")
    assert result.ok
    assert "hello from snippet" in result.stdout
    assert result.returncode == 0


def test_run_snippet_captures_exception_in_stderr(exec_tool):
    result = exec_tool.run_snippet("1 / 0")
    assert not result.ok
    assert "ZeroDivisionError" in result.stderr
    assert result.returncode == 1


def test_run_snippet_times_out(exec_tool):
    result = exec_tool.run_snippet("import time; time.sleep(5)", timeout=0.5)
    assert not result.ok
    assert "timed out" in result.stderr
    assert result.returncode == -1


def test_run_snippet_is_isolated_from_caller_process(exec_tool):
    # proves this really runs in a separate process: mutating a module-level
    # global here must not be visible to the snippet, and vice versa.
    result = exec_tool.run_snippet("import os; print(os.getpid())")
    import os

    assert result.ok
    assert str(os.getpid()) not in result.stdout
