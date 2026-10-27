---
name: dspy-structured-reasoning
intro: Reason in the single dspy.OutputField contract so every agentic step is parseable and coherent.
---

The harness is coherent around ONE structured output field (`app/structured.py`:
`StructuredThought`). Use it for every agentic reasoning step — chat, autonomy,
tester, skill-brain — so steps are machine-parseable and never disjoint.

## The contract (one JSON object)
reasoning · answer · tool (terminal|time|sequential_thinking|graph|null) ·
tool_input · confidence (0-1) · needs_more_steps.

## Usage
- `structured.think(task, context)` runs it through the router (role/health/DMR-
  aware via the ModelRouter) with graph context (rm = graph/redis/raptor).
- `parse_structured(text)` is robust: strips ```json fences, scans for the first
  balanced object, coerces/clamps confidence, never raises (low-confidence echo
  on total failure). Small DMR models (smollm2/phi4/qwen3) emit it in one shot.
- A ReAct loop = think → if tool, call it → feed observation back → think again,
  until needs_more_steps is false or a step budget is hit.
- Live "intention" surface (optional UI): show SURFACE INPUT → PREDICTED INTENT →
  MISSING CONSTRAINTS → EXECUTION PLAN as the structured fields fill in.

## Rule
Never parse model output ad hoc. Always go through `parse_structured`. Keep the
field spec identical across the DSPy path and the offline path so providers are
interchangeable.
