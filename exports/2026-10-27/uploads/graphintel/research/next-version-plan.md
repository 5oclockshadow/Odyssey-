# Next version: the seeded small-model thesis

## Naming
Small/fast (5-digit port), Bridago, the self-agent and rex-graph-agent are one experiment. One name across repos, ports and the public site (to be chosen).

## Thesis
Intelligence lives in the graph seed + DSPy cognition layer, not the model weights. Once seeded, a low-param model (or an LSTM on CPU) matches a large model, because the graph carries the cognition and the model is only the inference substrate.

## Prior evidence
- dspy-router-test: small models fail deep schemas **unseeded**. This is the control arm.
- Report v3, Part 7 (seed, destroy, probe) and R0–R3 arms: the protocol to reuse.

## Hypothesis (falsifiable)
H-seed: on the dspy-router-test deep schemas, small models **seeded** with the graph + DSPy layer land within N points of a large model, unseeded small models do not.
Refuted if: seeded small models stay below the large model by more than N points, or the gain disappears when the seed is replaced with a shuffled graph of the same size.

## Arms
| arm | substrate | seed | cognition |
|---|---|---|---|
| L0 | large model | none | DSPy |
| S0 | small model | none | DSPy (= dspy-router-test) |
| S1 | small model | graph seed | DSPy |
| S1-shuf | small model | shuffled seed | DSPy |
| C1 | LSTM on CPU | graph seed | DSPy |

## Metrics
Schema pass rate at depth 1–6, inferred reachability, tokens, latency, CPU cost per round.

## Deliverables
1. One harness across the four codebases, one port map.
2. Results page on the public site (public graph = seed + results, private graph = live rounds, owner tier).
3. Report v4 section replacing Part 7 with measured numbers.
