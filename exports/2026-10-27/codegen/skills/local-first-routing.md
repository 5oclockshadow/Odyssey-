---
name: local-first-routing
intro: How a model gets picked, why calls were slow (400–900 s on pin/thor via R720), and the rules that keep inference local, fast and failing over. Read before touching router.py, structured.py, loops.py or llm.py.
---
# Local-first routing (learned 2026-10-27)

**One candidate set, everywhere.** `router._default_candidates()` = DMR models first (same box,
no hop), then `default_model`, then `pins`. Every caller uses it: think, chat, dual_loop. The
dual_loop bug: it built `default + pins` itself and never saw DMR. Never build a private model list.

**The fit must count the whole request.** `required_tokens = tokens(system + user + graph
context) + max_tokens`. Counting only `max_tokens` sent long asks to models whose window they overflow.

**Windows are config, not code.** Use `MODEL_WINDOWS="dmr/ai/qwen3=32768,pin/thor=32768"` (longest
prefix wins) and set it to what the server really serves (`-c` / `n_ctx`), not the model card.

**Fail over, don't fail.** `think` tries up to 3 healthy, fitting routes. Empty text is a failure. A
single dead route used to return a conf-0.1 non-answer.

**Every attempt teaches.** Call `brain.learn(..., state=<kind>)` on success AND failure, or the
Q-table for that state never moves (think never learned before).

**DMR is on only when** `DMR_BASE_URL` is set and `DMR_MODELS` lists ids that DMR's own
`/models` returns (e.g. `ai/qwen3`). The route is `dmr/<id>`.

**Read the truth from `/api/v3/route-health`**: `candidates` (order, window, available), `dmr`
(on/off + models), `routes` (EWMA ms, circuit state). `routes: []` just means no call yet.

## Smells
- Loops taking 600+ s and judge "no fenced code block" means the model is too slow or the output was truncated. Prefer DMR or smaller asks.
- All Q-values negative for a state: routes are failing for a reason the judge names. Fix that cause and don't add more models.
