"""
agent_base.py — `WorkbenchAgent`, the SelfWire dual-brain agent with a
context builder tuned for codebase work: tool lines show argument names and
types (so the model can fill `tool_args` correctly), and long observations —
a whole file, a full diff — are clipped so the transcript stays inside the
model's context window across many steps. The `write_tool` (exec) and
`add_mcp_server` actions are refused unless a human enables unsafe levers.
"""

from __future__ import annotations

from typing import Callable

from ..agent import SelfWireAgent, SynthesizedAction

MAX_OBSERVATION_CHARS = 3000
MAX_STEPS_IN_CONTEXT = 14


UNSAFE_ACTIONS = ("write_tool", "add_mcp_server")


class WorkbenchAgent(SelfWireAgent):
    # replaced by Workbench.agent() with a live read of the setting
    unsafe_levers_allowed: Callable[[], bool] = staticmethod(lambda: False)

    def _execute(self, action: SynthesizedAction, episode_id: str) -> str:
        if action.action_type in UNSAFE_ACTIONS and not self.unsafe_levers_allowed():
            return (f"ERROR: {action.action_type} is disabled in the workbench — it runs arbitrary code inside the "
                    "server, which would let a change bypass the test gate. Use the file tools and run_tests instead; "
                    "a human can enable it in Settings (allow unsafe levers).")
        return super()._execute(action, episode_id)

    def _build_context(self, original_task: str, steps: list[dict]) -> str:
        tool_lines = []
        for name in self.registry.names():
            record = self.registry.get(name)
            if record is None:
                continue
            args = ", ".join(f"{arg}: {schema.get('type', 'any')}" for arg, schema in (record.dspy_tool.args or {}).items())
            first_line = (record.description or "").strip().splitlines()[0] if record.description else ""
            tool_lines.append(f"  - {name}({args}): {first_line}")
        shown = steps[-MAX_STEPS_IN_CONTEXT:]
        step_lines = []
        if len(steps) > len(shown):
            step_lines.append(f"  ... {len(steps) - len(shown)} earlier step(s) omitted")
        for s in shown:
            obs = str(s.get("observation", ""))
            if len(obs) > MAX_OBSERVATION_CHARS:
                obs = obs[:MAX_OBSERVATION_CHARS] + f" ... [clipped {len(obs) - MAX_OBSERVATION_CHARS} chars]"
            step_lines.append(f"  [{s['iteration']}] action={s['action_type']} tool={s.get('tool_name')} -> {obs}")
        return (
            f"ORIGINAL TASK:\n{original_task}\n\n"
            "AVAILABLE TOOLS (name(args): purpose):\n" + ("\n".join(tool_lines) or "  (none)") + "\n\n"
            "STEPS SO FAR:\n" + ("\n".join(step_lines) or "  (no steps taken yet)") + "\n\n"
            "Decide the next single action. To use a tool: action_type=call_tool, tool_name, tool_args (a dict "
            "keyed by the argument names above). When the request is fully handled: action_type=respond with a "
            "concise final_answer stating what changed and the test result."
        )
