#!/usr/bin/env python3
"""
demo.py — a runnable walkthrough of every self-extension lever:

  1. registry   — the mutable tool catalog
  2. exec_tool  — python `exec` writes a brand-new tool from source
  3. mcp_hub    — attaches a real external MCP server (tests/fixtures/tiny_mcp_server.py)
  4. own_server — the agent's own MCP server grows to mirror both

...driven by the dual-process (left_brain/right_brain/synthesis) signature
in agent.py, through the *real* agent loop (not a shortcut).

Runs two ways:
  * With OPENAI_API_KEY or ANTHROPIC_API_KEY set: configures a real dspy.LM
    and lets the agent actually reason for itself.
  * Without either: runs the same loop against a scripted DummyLM, so this
    is runnable with zero credentials and zero network access beyond the
    local MCP subprocess it spawns.

Usage:
    python demo.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import dspy

from selfwire.agent import (
    AnalyticalTrace,
    DualCognitionFrame,
    IntuitiveTrace,
    SynthesizedAction,
    bootstrap,
)
from selfwire.graph_viz import render_graph_html

TINY_MCP_SERVER = str(Path(__file__).resolve().parent / "tests" / "fixtures" / "tiny_mcp_server.py")


def _scripted_frame(**synthesis_kwargs) -> dict:
    return DualCognitionFrame(
        left_brain=AnalyticalTrace(
            decomposition=["scripted demo step"], constraints=[], candidate_tool=None,
            candidate_args={}, confidence=0.6,
        ),
        right_brain=IntuitiveTrace(
            analogous_past_tasks=[], associative_tool=None, associative_args={},
            novelty_flag=False, confidence=0.6,
        ),
        synthesis=SynthesizedAction(**synthesis_kwargs),
    ).model_dump()


def configure_lm() -> bool:
    """Returns True if a real LM got configured, False if we're falling
    back to the scripted DummyLM walkthrough."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        dspy.settings.configure(lm=dspy.LM("anthropic/claude-3-5-haiku-latest"))
        return True
    if os.environ.get("OPENAI_API_KEY"):
        dspy.settings.configure(lm=dspy.LM("openai/gpt-4o-mini"))
        return True
    return False


def run_scripted_demo(agent) -> None:
    from dspy.utils.dummies import DummyLM

    answers = [
        _wrap(_scripted_frame(
            action_type="write_tool", rationale="no existing tool doubles a number; write one",
            new_tool_name="double", new_tool_code="def double(n: int) -> int:\n    return n * 2",
            new_tool_description="doubles a number",
        )),
        _wrap(_scripted_frame(
            action_type="call_tool", rationale="use the tool just written",
            tool_name="double", tool_args={"n": 21},
        )),
        _wrap(_scripted_frame(
            action_type="add_mcp_server", rationale="also attach a real external MCP server for multiply/shout",
            mcp_server_name="tiny", mcp_server_command=sys.executable, mcp_server_args=[TINY_MCP_SERVER],
        )),
        _wrap(_scripted_frame(
            action_type="call_tool", rationale="use the newly attached server's tool",
            tool_name="tiny__multiply", tool_args={"a": 6, "b": 7},
        )),
        _wrap(_scripted_frame(
            action_type="respond", rationale="collected 42 twice, done",
            final_answer="double(21) = 42, and tiny__multiply(6, 7) = 42 too",
        )),
    ]
    dspy.settings.configure(lm=DummyLM(answers))
    pred = agent.run(
        "Demonstrate self-extension: write a tool that doubles a number, "
        "call it, then attach a real external MCP server and call one of "
        "its tools too."
    )
    _report(pred, agent)


def _wrap(cognition: dict) -> dict:
    return {"cognition": cognition}


def run_live_demo(agent) -> None:
    pred = agent.run(
        "You have four ways to grow your own capabilities: write a new tool "
        "with python exec, attach an external MCP server, and everything "
        "you acquire is also mirrored on your own MCP server. Demonstrate "
        "this by writing a small tool that doubles a number, calling it, "
        "then attaching the MCP server at "
        f"'{TINY_MCP_SERVER}' (run with the same python interpreter you're "
        "running under, no args needed beyond the script path) and calling "
        "one of its tools too. Then respond with a summary of what you did "
        "and the results."
    )
    _report(pred, agent)


def _report(pred, agent) -> None:
    print("\n=== result ===")
    print("final_answer:", pred.final_answer)
    print("iterations:", pred.iterations)
    print("run_id:", pred.run_id)
    print("context report:", pred.report_path)

    print("\n=== registry ===")
    for name, stats in agent.registry.stats().items():
        print(f"  {name:<20} source={stats['source']:<12} calls={stats['call_count']} errors={stats['error_count']}")

    print("\n=== tool graph ===")
    snap = agent.graph.snapshot()
    print(f"  {len(snap.nodes)} nodes, {len(snap.edges)} hebbian edges, {snap.q_table_size} q-table entries")

    graph_path = render_graph_html(agent.graph, title="SelfWire demo run — tool graph")
    print(f"\n=== neon graph viewer ===\n  {graph_path}")

    print(f"\n=== execution log ===\n  {agent.reporter.log_path}")
    print(f"\n=== telemetry ===\n  {agent.telemetry.log_dir}  (phoenix: {agent.telemetry.phoenix_status})")


def main() -> None:
    agent = bootstrap(max_iters=6)
    live = configure_lm()
    print(f"LM configured from environment: {live}")
    if live:
        run_live_demo(agent)
    else:
        print("No ANTHROPIC_API_KEY / OPENAI_API_KEY found — running the scripted DummyLM walkthrough instead.\n")
        run_scripted_demo(agent)


if __name__ == "__main__":
    main()
