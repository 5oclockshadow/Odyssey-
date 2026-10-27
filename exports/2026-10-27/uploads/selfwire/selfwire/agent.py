"""
agent.py — the dual-process reasoning core, and the loop that acts on it.

Signature shape, exactly as specified: **one** dspy.Signature, **one**
InputField, **one** OutputField. The output field's type is a single
Pydantic BaseModel (`DualCognitionFrame`) with three BaseModels stacked
inside it, linearly:

    left_brain -> right_brain -> synthesis

  * `left_brain`  (AnalyticalTrace)  — sequential/logical/verifiable mode:
    decomposes the task, lists constraints, and proposes a tool by
    elimination. This is the trace that feeds the Q-table (tabular
    reinforcement over (state, tool) pairs in graph_store.py).

  * `right_brain` (IntuitiveTrace)   — associative/pattern-based mode: recalls
    analogous past steps and proposes a tool by association. This is the
    trace that feeds, and is fed by, the Hebbian co-activation graph in
    graph_store.py (`ToolGraph.associative_recall`).

  * `synthesis`   (SynthesizedAction) — the single actionable decision that
    reconciles the two: which action to actually take this turn.

This is engineered as a dual-process (System 1 / System 2 -style) reasoning
pattern — a real, inspectable mechanism. Whether running two reasoning modes
side by side and reconciling them amounts to anything like human
consciousness is a philosophical question this code doesn't take a position
on; it just implements the mechanism as specified.

The loop itself is hand-rolled (not `dspy.ReAct`) precisely so the single
1-in/1-out signature above is the *whole* program: one `dspy.Predict(Cognize)`
call per turn, fed a running transcript packed into that one input field, and
executed against whichever of the four self-extension levers `synthesis`
names.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Literal, Optional

import dspy
from pydantic import BaseModel, Field

from .exec_tool import ExecTool, ExecToolError
from .graph_store import ToolGraph
from .mcp_hub import McpHub, McpHubError
from .own_server import OwnServer
from .registry import ToolRegistry, ToolRegistryError
from .reporter import Reporter
from .telemetry import Telemetry


# ---------------------------------------------------------------------------
# left brain: sequential / logical / verifiable
# ---------------------------------------------------------------------------
class AnalyticalTrace(BaseModel):
    """Left-brain: step-by-step decomposition and rule-based tool selection."""

    decomposition: list[str] = Field(default_factory=list, description="Ordered sub-steps derived from the task.")
    constraints: list[str] = Field(default_factory=list, description="Explicit constraints/requirements detected in the task.")
    candidate_tool: Optional[str] = Field(default=None, description="Tool chosen by logical elimination, if any.")
    candidate_args: dict[str, Any] = Field(default_factory=dict, description="Arguments for candidate_tool.")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# right brain: associative / pattern-based
# ---------------------------------------------------------------------------
class IntuitiveTrace(BaseModel):
    """Right-brain: associative recall and pattern-based tool selection."""

    analogous_past_tasks: list[str] = Field(default_factory=list, description="Free-text analogies to prior steps/tasks.")
    associative_tool: Optional[str] = Field(default=None, description="Tool suggested by pattern-matching, if any.")
    associative_args: dict[str, Any] = Field(default_factory=dict, description="Arguments for associative_tool.")
    novelty_flag: bool = Field(default=False, description="True if nothing existing fits and a new tool should be synthesized.")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# corpus callosum: the single actionable decision
# ---------------------------------------------------------------------------
class SynthesizedAction(BaseModel):
    """Reconciles left_brain and right_brain into one actionable decision."""

    action_type: Literal["call_tool", "write_tool", "add_mcp_server", "respond", "ask_user"] = "respond"
    rationale: str = Field(default="", description="Short explanation reconciling the two traces.")

    # call_tool
    tool_name: Optional[str] = None
    tool_args: dict[str, Any] = Field(default_factory=dict)

    # write_tool (exec lever)
    new_tool_name: Optional[str] = None
    new_tool_code: Optional[str] = None
    new_tool_description: Optional[str] = None

    # add_mcp_server (mcp_hub lever)
    mcp_server_name: Optional[str] = None
    mcp_server_command: Optional[str] = None
    mcp_server_args: list[str] = Field(default_factory=list)

    # respond
    final_answer: Optional[str] = None


class DualCognitionFrame(BaseModel):
    """BaseModels stacked linearly inside one OutputField: left -> right -> synthesis."""

    left_brain: AnalyticalTrace
    right_brain: IntuitiveTrace
    synthesis: SynthesizedAction


class Cognize(dspy.Signature):
    """Reason about the task using two parallel modes of inference — a
    sequential/logical left-brain trace and an associative/pattern-based
    right-brain trace — then reconcile them into one synthesized action.
    Return all three as one stacked object."""

    task: str = dspy.InputField(
        desc="The original task plus a running transcript of steps taken so far and the tools currently available."
    )
    cognition: DualCognitionFrame = dspy.OutputField(
        desc="left_brain analytical trace, right_brain intuitive trace, and the synthesized action, stacked in one object."
    )


def _state_key(step_index: int, last_tool: Optional[str], novelty: bool) -> str:
    """Short, hashable state summary for the Q-table."""
    return f"i={step_index}|last={last_tool or '-'}|novel={int(novelty)}"


class SelfWireAgent(dspy.Module):
    def __init__(
        self,
        registry: ToolRegistry,
        mcp_hub: McpHub,
        own_server: OwnServer,
        exec_tool: ExecTool,
        graph: ToolGraph,
        telemetry: Telemetry,
        reporter: Reporter,
        max_iters: int = 6,
    ) -> None:
        super().__init__()
        self.registry = registry
        self.mcp_hub = mcp_hub
        self.own_server = own_server
        self.exec_tool = exec_tool
        self.graph = graph
        self.telemetry = telemetry
        self.reporter = reporter
        self.max_iters = max_iters
        self.cognize = dspy.Predict(Cognize)

    # -- helpers ------------------------------------------------------------
    def _build_context(self, original_task: str, steps: list[dict]) -> str:
        tool_lines = "\n".join(f"  - {n}: {self.registry.get(n).description}" for n in self.registry.names()) or "  (none yet)"
        step_lines = []
        for s in steps:
            step_lines.append(
                f"  [{s['iteration']}] action={s['action_type']} tool={s.get('tool_name')} -> {s.get('observation')}"
            )
        steps_block = "\n".join(step_lines) or "  (no steps taken yet)"
        return (
            f"ORIGINAL TASK:\n{original_task}\n\n"
            f"AVAILABLE TOOLS:\n{tool_lines}\n\n"
            f"STEPS SO FAR:\n{steps_block}\n\n"
            "Decide the next single action. If the task is already answered, use action_type=respond."
        )

    def _execute(self, action: SynthesizedAction, episode_id: str) -> str:
        if action.action_type == "call_tool":
            if not action.tool_name:
                return "ERROR: call_tool with no tool_name"
            if action.tool_name not in self.registry:
                return f"ERROR: no such tool '{action.tool_name}'"
            try:
                result = self.registry.call(action.tool_name, episode_id=episode_id, **action.tool_args)
                return f"OK: {result!r}"
            except Exception as e:
                return f"ERROR: {e}"

        if action.action_type == "write_tool":
            if not (action.new_tool_name and action.new_tool_code):
                return "ERROR: write_tool requires new_tool_name and new_tool_code"
            try:
                record = self.exec_tool.define_tool(
                    name=action.new_tool_name,
                    source_code=action.new_tool_code,
                    description=action.new_tool_description or "",
                )
                self.own_server.sync_tool(record.name)
                return f"OK: defined tool '{record.name}' (v{record.version})"
            except ExecToolError as e:
                return f"ERROR: {e}"

        if action.action_type == "add_mcp_server":
            if not (action.mcp_server_name and action.mcp_server_command):
                return "ERROR: add_mcp_server requires mcp_server_name and mcp_server_command"
            try:
                names = self.mcp_hub.connect_stdio(
                    action.mcp_server_name, action.mcp_server_command, action.mcp_server_args
                )
                return f"OK: attached '{action.mcp_server_name}', registered tools: {names}"
            except McpHubError as e:
                return f"ERROR: {e}"

        if action.action_type == "respond":
            return f"RESPOND: {action.final_answer or ''}"

        if action.action_type == "ask_user":
            return f"ASK_USER: {action.rationale}"

        return f"ERROR: unknown action_type '{action.action_type}'"

    # -- shared bookkeeping, used by both the sync and async loop bodies ------
    # (kept out of forward()/aforward() themselves so the two stay identical
    # in everything except *how* they get a `frame` and *how* they execute
    # an action — sync call vs. `.acall()`, direct `_execute` vs. offloaded
    # onto a worker thread.)
    def _pre_task(self, task: str) -> str:
        run_id = self.telemetry.new_run_id()
        prior_context = self.reporter.read_latest_context_report()
        self.telemetry.pre_task(
            run_id=run_id,
            task=task,
            strategic_choices={
                "max_iters": self.max_iters,
                "tools_available_at_start": self.registry.names(),
                "prior_context_ingested": bool(prior_context),
            },
        )
        return run_id

    def _score_step(
        self, frame: DualCognitionFrame, i: int, last_tool: Optional[str], observation: str
    ) -> Optional[str]:
        state = _state_key(i, last_tool, frame.right_brain.novelty_flag)
        reward = 1.0 if observation.startswith("OK") else (-1.0 if observation.startswith("ERROR") else 0.0)
        next_state = _state_key(i + 1, frame.synthesis.tool_name or last_tool, frame.right_brain.novelty_flag)
        if frame.synthesis.tool_name:
            self.graph.q_update(state, frame.synthesis.tool_name, reward, next_state)
            return frame.synthesis.tool_name
        return last_tool

    @staticmethod
    def _record_step(i: int, frame: DualCognitionFrame, observation: str) -> dict:
        return {
            "iteration": i,
            "action_type": frame.synthesis.action_type,
            "tool_name": frame.synthesis.tool_name,
            "left_brain": frame.left_brain.model_dump(),
            "right_brain": frame.right_brain.model_dump(),
            "rationale": frame.synthesis.rationale,
            "observation": observation,
        }

    def _finalize(self, task: str, run_id: str, steps: list[dict], final_answer: Optional[str]) -> dspy.Prediction:
        self.graph.save()
        result = {"final_answer": final_answer, "iterations": len(steps), "run_id": run_id}
        self.telemetry.post_task(
            run_id=run_id,
            task=task,
            state_transitions=steps,
            analytical_weights={"q_table_size": len(self.graph.q_table)},
            result=result,
        )
        self.reporter.append_log(
            f"run {run_id}", f"task: {task[:200]}\niterations: {len(steps)}\nfinal_answer: {final_answer}"
        )
        report_path = self.reporter.write_context_report(
            run_id=run_id,
            summary=f"{len(steps)} iteration(s), final_answer={final_answer!r}",
            state={"tools": list(self.registry.stats().values()), "graph": self.graph.snapshot().__dict__, "steps": steps},
        )
        return dspy.Prediction(
            final_answer=final_answer, iterations=len(steps), steps=steps, run_id=run_id, report_path=str(report_path)
        )

    @staticmethod
    def _lm_context(lm: Optional[dspy.LM]):
        # dspy.context(**{}) is a valid, inert no-op scope, so this is a
        # single code path regardless of whether an override was given —
        # no branching between "a context manager" and "no context manager"
        # at every call site.
        return dspy.context(**({"lm": lm} if lm is not None else {}))

    # -- main loop (sync) -------------------------------------------------------
    def forward(self, task: str, *, lm: Optional[dspy.LM] = None) -> dspy.Prediction:
        """`lm`, when given, scopes the LM for *this run only* via
        `dspy.context(lm=lm)` rather than requiring a prior global
        `dspy.settings.configure(lm=...)` — so one process can run the agent
        against different models/configs concurrently without them
        clobbering each other's global settings."""
        run_id = self._pre_task(task)
        episode_id = run_id
        steps: list[dict] = []
        final_answer: Optional[str] = None
        last_tool: Optional[str] = None

        with self._lm_context(lm):
            for i in range(self.max_iters):
                context = self._build_context(task, steps)
                pred = self.cognize(task=context)
                frame: DualCognitionFrame = pred.cognition

                observation = self._execute(frame.synthesis, episode_id=episode_id)
                last_tool = self._score_step(frame, i, last_tool, observation)
                steps.append(self._record_step(i, frame, observation))

                if frame.synthesis.action_type in ("respond", "ask_user"):
                    final_answer = frame.synthesis.final_answer or frame.synthesis.rationale
                    break

        return self._finalize(task, run_id, steps, final_answer)

    def run(self, task: str, *, lm: Optional[dspy.LM] = None) -> dspy.Prediction:
        # go through dspy.Module.__call__ (not .forward directly) so dspy's
        # own call bookkeeping (trace recording, callbacks) runs normally.
        return self(task, lm=lm)

    # -- main loop (async) --------------------------------------------------------
    async def aforward(self, task: str, *, lm: Optional[dspy.LM] = None) -> dspy.Prediction:
        """Async twin of `forward()` — genuine async DSPy end to end, not a
        thread-wrapped sync call:

          * the reasoning step calls `self.cognize.acall(...)`, which is
            `dspy.Predict.aforward` doing a real `await adapter.acall(...)`
            against the LM client (verified against the installed dspy: it
            is not a sync call bridged onto a thread).
          * action execution still goes through the same synchronous
            `_execute()` that `forward()` uses — it already knows how to
            safely reach an MCP tool's session on mcp_hub's dedicated event
            loop thread (see mcp_hub.McpHub._wrap_sync) — but is offloaded
            via `asyncio.to_thread` so a slow tool call (a subprocess, a
            network round trip, disk IO in exec_tool/reporter/telemetry)
            can't block *this* coroutine's event loop while it runs.

        Concurrency note, stated plainly rather than glossed over: this
        makes a single in-flight run non-blocking for its caller's event
        loop. It does not make ToolGraph/ToolRegistry safe against two
        `aforward()` calls (or an `aforward()` and a `forward()`) running
        concurrently *against the same agent instance* — registry has its
        own lock, but ToolGraph's in-memory mutations do not. Run
        concurrent tasks against separate `bootstrap()`-ed agents, not one
        shared instance, until/unless that's added.
        """
        run_id = await asyncio.to_thread(self._pre_task, task)
        episode_id = run_id
        steps: list[dict] = []
        final_answer: Optional[str] = None
        last_tool: Optional[str] = None

        with self._lm_context(lm):
            for i in range(self.max_iters):
                context = self._build_context(task, steps)
                pred = await self.cognize.acall(task=context)
                frame: DualCognitionFrame = pred.cognition

                observation = await asyncio.to_thread(self._execute, frame.synthesis, episode_id)
                last_tool = self._score_step(frame, i, last_tool, observation)
                steps.append(self._record_step(i, frame, observation))

                if frame.synthesis.action_type in ("respond", "ask_user"):
                    final_answer = frame.synthesis.final_answer or frame.synthesis.rationale
                    break

        return await asyncio.to_thread(self._finalize, task, run_id, steps, final_answer)

    async def arun(self, task: str, *, lm: Optional[dspy.LM] = None) -> dspy.Prediction:
        # goes through dspy.Module.acall (not aforward directly) for the
        # same reason run() goes through __call__: dspy's own async call
        # bookkeeping (caller_modules tracking, usage tracking) runs normally.
        return await self.acall(task, lm=lm)


def bootstrap(max_iters: int = 6) -> SelfWireAgent:
    """Wire every component together with shared state, for demos/tests."""
    graph = ToolGraph()
    registry = ToolRegistry(graph=graph)
    mcp_hub = McpHub(registry)
    exec_tool = ExecTool(registry)
    own_server = OwnServer(registry, exec_tool=exec_tool)
    telemetry = Telemetry()
    reporter = Reporter()
    return SelfWireAgent(
        registry=registry, mcp_hub=mcp_hub, own_server=own_server, exec_tool=exec_tool,
        graph=graph, telemetry=telemetry, reporter=reporter, max_iters=max_iters,
    )
