---
name: dspy-signatures-and-optimization
intro: How DSPy is used for real here (Codegen think + Gopher) and how to optimize a signature — design rules, the adapter trick that keeps our routing, deterministic metrics, compile/save/load.
---
# DSPy: signatures, programs, optimization

**Signatures**: docstring = the instructions (short, imperative, the failure modes you saw); every field has a `desc`;
outputs typed (`list[str]`, `float`) so the adapter parses them. One job per signature (ChunkNote ≠ FileInsight).
**Programs**: `dspy.Predict` for one-shot fields, `dspy.ChainOfThought` when reasoning helps, `dspy.ReAct(sig, tools)`
for tool use — tools are typed functions with docstrings that return text and never raise.
**Keep our routing**: Codegen `think` renders messages with `dspy.ChatAdapter().format(StructuredSignature, demos, inputs)`,
sends them through llm.complete (local-first + failover + circuit breaker), and parses with `ChatAdapter().parse` →
the JSON contract. Demos compiled by an optimizer live in `STATE_DIR/think_compiled.json`. Toggle: CODEGEN_DSPY_THINK.
**Optimize**: golden set = tasks whose answer a deterministic check can prove (hashes, VALID/INVALID, PASS/FAIL,
exact ids). Metric = fact present AND a tool/skill was used (no guessing). Start with `BootstrapFewShot(metric,
max_bootstrapped_demos=4)`; move to `MIPROv2(auto="light")` once the golden set has 20+ items. Always report
before/after on the same set; save with `program.save(path)`, load before every run; a load failure runs uncompiled.
**Research loop**: add 3-5 golden items for every new failure seen in production, re-optimize, keep only lifts.
