---
name: ai-discovery-research
intro: Standing mission — research the open-model + DSPy + grounding frontier and drive codegen toward Fable-comparable quality on OUR tasks, on fleet hardware or GPU rentals. Measured, honest, gated.
---

Codegen's job here is not to "become Fable." It is to close the gap to
Fable-comparable quality **on the specific tasks we actually run** (code
generation, structured reasoning, graph synthesis) using open-weight models we
can host on the fleet or rent, wrapped in DSPy optimization and graph grounding.
DSPy does not make a model smarter — it optimizes the program around the model.
So the mission is: pick the right model, optimize the pipeline hard against a
real metric, ground it with the graph, and MEASURE the remaining gap honestly.

## The honest frame (never oversell)
- "Fable-level general intelligence" on local hardware is **not** achievable and
  must never be claimed. What IS achievable is **frontier-comparable quality on
  a bounded, well-evaluated task**. Report it that way, always.
- Every improvement claim must come with a measured before/after on a golden
  set. No golden set → no claim. Build the eval first.

## Start here
Read `research/BRIEF-2026-10.md` first — the dated, cited grounding brief (best
open models, serving, DSPy optimizer state, GPU economics, the honest yes/no
verdict). Re-verify any number against its primary source before acting; refresh
the brief (new dated file) when it goes stale.

## Standing research loop (pause-only, non-blocking, model-routed)
Each cycle, pick ONE open question, research it live (web + papers), record
findings, and when it implies a change, file it as a change request with a
measurable hypothesis. Carry the prior HTML context report in first.

Research axes to keep current (re-check monthly, sources dated):
1. **Models** — best open-weight for code/reasoning (DeepSeek-V3/R1, Llama 3.3/4,
   Qwen2.5/Qwen3, Mistral): params, context, license, and measured scores on
   LiveCodeBench / SWE-bench / GPQA vs the frontier. Track the gap in points.
2. **Serving** — vLLM / SGLang / TGI throughput + latency; quantization
   (FP8 / AWQ / GPTQ / GGUF) VRAM-vs-quality. What runs a 70B vs a 405B vs a
   DeepSeek-V3 MoE on a 4090 / A100-80G / H100.
3. **DSPy optimizers** — MIPROv2, BootstrapFewShot, BootstrapFinetune, GEPA,
   SIMBA: what each does, when to use it, measured gains people report.
   BootstrapFinetune can tune local weights; GEPA does reflective prompt
   evolution. Confirm each still runs against our local vLLM/Ollama endpoints.
4. **Economics** — $/hr for 4090 / A100 / H100 on RunPod / Vast / Lambda, and
   $/1M-token for a self-served 70B vs a frontier API. Feed this to the router's
   cost model so the local-vs-rent-vs-cloud decision is data-driven.

## The gap-to-Fable scorecard (the deliverable that matters)
Maintain `research/gap-scorecard.json` + a human-readable `research/README.md`:
per task-type (codegen, structured-reasoning, graph-synth), record
`{ our_best_local, our_best_optimized, frontier_ref, gap_points, cost_ratio }`
measured on the golden set, dated, with the config that produced it. The whole
point is to make the gap a number that goes down over releases.

## The optimization ladder (apply in order, measure each rung)
1. Baseline: best open model via router, zero tuning → score it.
2. Prompt/program structure (single OutputField contract; see
   `dspy-structured-reasoning`) → re-score.
3. DSPy MIPROv2 / BootstrapFewShot on the golden set → re-score.
4. Graph grounding (RAPTOR + Hebbian recall + Q-rerank) → re-score.
5. GEPA / BootstrapFinetune if rungs 1–4 leave a gap worth the GPU cost → re-score.
Stop climbing when the gap is closed or the next rung costs more than it buys.

## Wiring (align with the rest of codegen)
- Route model calls through the existing ModelRouter (role/health/context/DMR +
  the cost model above). Cheap local for the bulk; rent a big GPU only for the
  final hard synthesis when the scorecard says it pays.
- Structured reasoning via the single-OutputField contract.
- The Tester peer verifies every proposed change (real checks + error injection);
  propose-patch, never-apply-without-approval.

## Outputs (mandatory, per project convention)
- Dual log: human-readable `research/README.md` execution log + structured
  `research/telemetry.json` (ISO-8601 timestamps, choices, weights) written
  pre-task (plan) and post-task (validation).
- Every outward/paid action (renting a GPU, pulling large weights) is gated:
  dry-run + notify-after, perms and caps from ENV.

## Definition of done per cycle
A measured delta on the scorecard (up or honestly flat), a recorded frame, a PR
with tests + README + evidence, and the gap number updated. Never report a
qualitative "improved" without the number behind it.
