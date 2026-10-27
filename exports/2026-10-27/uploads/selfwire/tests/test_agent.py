"""agent.py — the dual-brain Cognize signature (exactly 1 input field / 1
output field, three BaseModels stacked inside it) and the loop that acts on
its synthesized decision each turn, against a DummyLM so no network/API key
is needed."""

import dspy
import pytest
from dspy.utils.dummies import DummyLM

from selfwire.agent import (
    AnalyticalTrace,
    Cognize,
    DualCognitionFrame,
    IntuitiveTrace,
    SynthesizedAction,
)


def _frame(**synthesis_kwargs) -> dict:
    return DualCognitionFrame(
        left_brain=AnalyticalTrace(decomposition=["step"], constraints=[], candidate_tool=None, candidate_args={}, confidence=0.5),
        right_brain=IntuitiveTrace(analogous_past_tasks=[], associative_tool=None, associative_args={}, novelty_flag=False, confidence=0.5),
        synthesis=SynthesizedAction(**synthesis_kwargs),
    ).model_dump()


def _configure(answers):
    dspy.settings.configure(lm=DummyLM(answers))


# -- signature shape ---------------------------------------------------------
def test_signature_is_exactly_one_input_and_one_output_field():
    assert list(Cognize.input_fields.keys()) == ["task"]
    assert list(Cognize.output_fields.keys()) == ["cognition"]


def test_output_field_type_is_the_stacked_basemodel():
    field_type = Cognize.output_fields["cognition"].annotation
    assert field_type is DualCognitionFrame
    assert set(DualCognitionFrame.model_fields.keys()) == {"left_brain", "right_brain", "synthesis"}


# -- loop: respond immediately -------------------------------------------------
def test_respond_immediately(agent):
    _configure([{"cognition": _frame(action_type="respond", rationale="easy", final_answer="hello")}])
    pred = agent.run("say hello")
    assert pred.final_answer == "hello"
    assert pred.iterations == 1


# -- loop: full self-extension chain -------------------------------------------
def test_write_tool_then_call_it_then_respond(agent):
    answers = [
        {"cognition": _frame(
            action_type="write_tool", rationale="need it",
            new_tool_name="double", new_tool_code="def double(n: int) -> int:\n    return n * 2",
            new_tool_description="doubles a number",
        )},
        {"cognition": _frame(action_type="call_tool", rationale="use it", tool_name="double", tool_args={"n": 21})},
        {"cognition": _frame(action_type="respond", rationale="done", final_answer="42")},
    ]
    _configure(answers)
    pred = agent.run("double 21 using a tool you write")
    assert pred.final_answer == "42"
    assert pred.iterations == 3
    assert "double" in agent.registry.names()
    assert pred.steps[1]["observation"].startswith("OK:")


# -- loop: tool-call error is observed, not fatal -------------------------------
def test_call_tool_error_is_surfaced_as_observation_not_an_exception(agent):
    answers = [
        {"cognition": _frame(action_type="call_tool", rationale="try", tool_name="nonexistent", tool_args={})},
        {"cognition": _frame(action_type="respond", rationale="gave up", final_answer="couldn't do it")},
    ]
    _configure(answers)
    pred = agent.run("call a tool that doesn't exist")
    assert pred.steps[0]["observation"].startswith("ERROR:")
    assert pred.final_answer == "couldn't do it"


# -- loop: bounded by max_iters -------------------------------------------------
def test_loop_stops_at_max_iters_without_a_respond(agent):
    # every turn just calls a real tool and never responds
    def adder(a: int, b: int) -> int:
        return a + b

    agent.registry.register(adder, name="adder")
    answers = [{"cognition": _frame(action_type="call_tool", tool_name="adder", tool_args={"a": 1, "b": 1})}] * 10
    _configure(answers)
    pred = agent.run("keep calling forever")
    assert pred.iterations == agent.max_iters
    assert pred.final_answer is None


# -- loop: ask_user is a valid terminal action ----------------------------------
def test_ask_user_terminates_the_loop(agent):
    _configure([{"cognition": _frame(action_type="ask_user", rationale="need clarification on X")}])
    pred = agent.run("ambiguous task")
    assert pred.iterations == 1
    assert "need clarification" in pred.final_answer


# -- loop: add_mcp_server lever exercised end-to-end ----------------------------
def test_add_mcp_server_action_attaches_a_real_server(agent):
    import sys
    from pathlib import Path

    tiny = str(Path(__file__).resolve().parent / "fixtures" / "tiny_mcp_server.py")
    answers = [
        {"cognition": _frame(
            action_type="add_mcp_server", rationale="need multiply",
            mcp_server_name="tiny", mcp_server_command=sys.executable, mcp_server_args=[tiny],
        )},
        {"cognition": _frame(action_type="call_tool", rationale="use it", tool_name="tiny__multiply", tool_args={"a": 3, "b": 3})},
        {"cognition": _frame(action_type="respond", rationale="done", final_answer="9")},
    ]
    _configure(answers)
    pred = agent.run("multiply 3x3 via an mcp server you attach yourself")
    assert pred.final_answer == "9"
    # structured MCP result mode unwraps FastMCP's scalar {"result": 9} ->
    # a real int, so _execute's repr()-based observation shows 9, not '9'.
    assert pred.steps[1]["observation"] == "OK: 9"


# -- _execute: unknown action_type falls back to a clear error ------------------
def test_execute_unknown_action_type_reports_error(agent):
    bad_action = SynthesizedAction.model_construct(action_type="frobnicate", rationale="", tool_args={}, mcp_server_args=[])
    observation = agent._execute(bad_action, episode_id="e1")
    assert observation.startswith("ERROR: unknown action_type")


# -- side effects: telemetry + reports + graph persistence written each run ----
def test_run_writes_telemetry_and_context_report(agent):
    _configure([{"cognition": _frame(action_type="respond", rationale="ok", final_answer="done")}])
    pred = agent.run("do something small")
    run = agent.telemetry.read_run(pred.run_id)
    assert run["pre_task"] is not None
    assert run["post_task"]["result"]["final_answer"] == "done"
    from pathlib import Path

    assert Path(pred.report_path).exists()
