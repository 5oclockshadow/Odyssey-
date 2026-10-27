"""agent.py — the async twin of the main loop (`aforward`/`arun`).

These exercise genuine async DSPy (`dspy.Predict.acall` -> a real
`await adapter.acall(...)` against the LM, not a sync call wrapped in a
thread) and the per-call `dspy.context(lm=...)` scoping, including against
a *real* MCP subprocess reached through `asyncio.to_thread` from inside an
already-running event loop — the exact scenario that would deadlock if tool
execution tried to bridge the MCP session's coroutine onto the wrong loop.
"""

import sys
from pathlib import Path

import dspy
from dspy.utils.dummies import DummyLM

from selfwire.agent import (
    AnalyticalTrace,
    DualCognitionFrame,
    IntuitiveTrace,
    SynthesizedAction,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
TINY_MCP_SERVER = str(FIXTURES_DIR / "tiny_mcp_server.py")


def _frame(**synthesis_kwargs) -> dict:
    return DualCognitionFrame(
        left_brain=AnalyticalTrace(decomposition=[], constraints=[], candidate_tool=None, candidate_args={}, confidence=0.4),
        right_brain=IntuitiveTrace(analogous_past_tasks=[], associative_tool=None, associative_args={}, novelty_flag=False, confidence=0.4),
        synthesis=SynthesizedAction(**synthesis_kwargs),
    ).model_dump()


async def test_arun_respond_immediately_uses_scoped_lm_only(agent):
    # deliberately no dspy.settings.configure(lm=...) anywhere -- the only
    # LM this run can possibly see is the one passed as lm=, proving the
    # dspy.context(lm=...) scoping in agent.py is what's actually driving it.
    scoped_lm = DummyLM([{"cognition": _frame(action_type="respond", rationale="hi", final_answer="async hello")}])
    pred = await agent.arun("say hello, async", lm=scoped_lm)
    assert pred.final_answer == "async hello"
    assert pred.iterations == 1


async def test_aforward_write_tool_then_call_it_then_respond(agent):
    answers = [
        {"cognition": _frame(
            action_type="write_tool", rationale="need it",
            new_tool_name="triple", new_tool_code="def triple(n: int) -> int:\n    return n * 3",
            new_tool_description="triples a number",
        )},
        {"cognition": _frame(action_type="call_tool", rationale="use it", tool_name="triple", tool_args={"n": 14})},
        {"cognition": _frame(action_type="respond", rationale="done", final_answer="42")},
    ]
    pred = await agent.arun("triple 14 using a tool you write, async", lm=DummyLM(answers))
    assert pred.final_answer == "42"
    assert pred.iterations == 3
    assert "triple" in agent.registry.names()


async def test_aforward_reaches_a_real_mcp_server_via_to_thread(agent):
    # the scenario that would deadlock if tool execution ran the MCP
    # session's coroutine on the wrong event loop: we are already inside a
    # running loop (this test itself), and the tool call is offloaded via
    # asyncio.to_thread, which must still land on mcp_hub's own dedicated
    # loop thread, not this one.
    answers = [
        {"cognition": _frame(
            action_type="add_mcp_server", rationale="need multiply",
            mcp_server_name="tiny", mcp_server_command=sys.executable, mcp_server_args=[TINY_MCP_SERVER],
        )},
        {"cognition": _frame(action_type="call_tool", rationale="use it", tool_name="tiny__multiply", tool_args={"a": 6, "b": 7})},
        {"cognition": _frame(action_type="respond", rationale="done", final_answer="42")},
    ]
    pred = await agent.arun("multiply via a real mcp server, async", lm=DummyLM(answers))
    assert pred.final_answer == "42"
    assert pred.steps[1]["observation"] == "OK: 42"  # structured mode -> real int, not a string


async def test_aforward_bounded_by_max_iters(agent):
    def adder(a: int, b: int) -> int:
        return a + b

    agent.registry.register(adder, name="adder")
    answers = [{"cognition": _frame(action_type="call_tool", tool_name="adder", tool_args={"a": 1, "b": 1})}] * 10
    pred = await agent.arun("keep calling forever, async", lm=DummyLM(answers))
    assert pred.iterations == agent.max_iters
    assert pred.final_answer is None


async def test_aforward_and_forward_produce_the_same_shape_of_result(agent):
    # not a claim that they're numerically identical (different DummyLM
    # instances/RNG draws) -- just that the async path returns the same
    # Prediction shape the sync path does.
    sync_lm = DummyLM([{"cognition": _frame(action_type="respond", rationale="ok", final_answer="sync")}])
    sync_pred = agent.run("sync path", lm=sync_lm)

    async_lm = DummyLM([{"cognition": _frame(action_type="respond", rationale="ok", final_answer="async")}])
    async_pred = await agent.arun("async path", lm=async_lm)

    for field in ("final_answer", "iterations", "steps", "run_id", "report_path"):
        assert hasattr(sync_pred, field) and hasattr(async_pred, field)
    assert sync_pred.final_answer == "sync"
    assert async_pred.final_answer == "async"
    assert Path(sync_pred.report_path).exists()
    assert Path(async_pred.report_path).exists()
