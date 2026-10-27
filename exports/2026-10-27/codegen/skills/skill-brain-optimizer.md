---
name: skill-brain-optimizer
intro: The Skill Brain — skills are prompts a ReAct→metric→optimizer loop improves by reflecting on failed tests.
---

Skills are not static. Each skill is a versioned *prompt* that the engine
optimizes against real test metrics — the "skill brain".

## The loop (per skill, per build)
1. **skill prompt (vN)** feeds a **ReAct agent** that acts via tools
   (write_file, edit_file, render_and_test, finish).
2. A **metric** scores the build (test pass rate, correctness checks, lint,
   readability) → a number 0-100.
3. An **optimizer** reflects on *failed* checks and rewrites the skill prompt →
   **vN+1**, then builds again. Keep the best-scoring version; record every
   version with its score and the diff/rationale.
4. Stop when the metric plateaus at target or the budget is spent (pause-only).

## Skill brain state (persist + show)
- Per skill: current version, score history (sparkline), learned rules
  (bullet list the optimizer extracted), and the prompt-version log with diffs.
- Learned rules feed back into the next prompt and coactivate on the graph, so
  the Skills tab shows which rounds used each skill and its Hebbian weight.

## Implementation notes
- Use the single-OutputField structured contract (`app/structured.py`) for the
  ReAct agent's reasoning so steps are parseable.
- The optimizer is itself a structured call: inputs = (prompt vN, failed checks,
  diffs); output = (prompt vN+1, learned_rules[], rationale).
- Wire telemetry: each version + score is a graph node linked to the build run;
  dual-format log (README + JSON) per optimization pass.

## Done when
A skill measurably improves its own prompt over ≥3 versions on a real task,
with the version log, scores and learned rules visible in the Skill Brain panel.
