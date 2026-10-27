---
name: route-smoke-and-fix
intro: Make inference fast AND consistent. Measure every hop (model server direct, fleet router, codegen think), find the slow one, fix it, re-run until PASS. Never guess which hop is slow.
---
# Route smoke → fix → re-run until PASS

**Measure**: `POST /api/v3/route-smoke?runs=3` (or `python3 scripts/route_smoke.py --runs 3` on Thor).
Lane `route-smoke` re-runs it every 15 min, and a FAIL writes an `alert` event.
**PASS bar**: direct p50 ≤ 3 s · router adds ≤ 2 s over direct · codegen think p50 ≤ 20 s · every
hop max/p50 ≤ 3 (that's what consistent means).

**Read the result, then fix the hop that failed. One change per run.**
| Fail | Likely cause | Fix |
|---|---|---|
| direct slow, slots all busy | llama-server has 1 slot and the whole fleet queues on it | restart it with `--parallel 4 --cont-batching`, and keep `-c` = 4 × the per-request ctx you need |
| direct slow, slots free | prompt processing, big ctx, or a CPU fallback | check `-ngl 999` (all layers on GPU) and `--flash-attn`. Lower `-c` if it's oversized |
| router adds > 2 s | R720 hop, model swap, or router queue | route codegen direct (`DMR_BASE_URL` = local server, dmr/* first). Leave the router to other clients |
| codegen ≫ direct | graph context + JSON contract inflate the prompt | lower context k, cap `max_tokens`, check the `think` prompt size in tracing |
| spread > 3 | contention with other clients, or reload/cold start | more slots, keep the model resident, and give codegen its own route |
| all calls fail | wrong URL/model id, or the server is down | `curl <url>/models`, fix env, rerun thor-restart |

**Loop**: smoke, then ONE fix, then smoke. Stop at PASS or after 3 tries on the same cause, and report.
Report as `SMOKE: PASS|FAIL · direct p50/max · router p50/max · codegen p50/max · cause · fix applied`.
Changes to llama-server flags are host config. Propose the exact command to the user and don't restart
a fleet model server yourself (other services depend on it).
