# Routing — one egress, local-first (every entity obeys this)

**Problem being fixed:** the fleet has its own router (R720), but several apps also have
internal routers calling providers directly. That fragments cost, keys, and debugging.

**Rule:** the **fleet router is the single inference gateway.** Every app's internal
router becomes a thin client pointed at it; no app calls a cloud provider directly.

## The gateway
- Fleet router: `http://192.168.1.204:8776` (R720). OpenAI-compatible: `.../v1/chat/completions`.
- All services read `ROUTER_BASE_URL` (default `http://192.168.1.204:8776/v1`) and send every
  model call there with a single `ODYSSEY_KEY`. No `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` in apps.

## Cascade (configured once, at the fleet router)
1. **LOCAL first** — fleet GPUs: Thor/Jetson `.203`, R720 `.204` (vLLM / Ollama / DMR `dmr/<model>` :12434). Zero marginal cost.
2. **FREE cloud** — Groq, Gemini-flash, OpenRouter free, Cerebras — on 429/exhaust, spill to next.
3. **PAID cloud** — Anthropic / OpenAI / OpenRouter paid — only when local+free can't serve (ctx too big, quality-gated), under a daily spend cap; on cap → local-only + page.

## App internal routers
- `codegen app/router.py` (ModelRouter/RoutingDecision/DMR): keep the *selection logic* but set its
  provider base to `ROUTER_BASE_URL`; it picks role/health/ctx, the fleet router picks the tier.
- Institute / selfwire / broadcaster / tendergraph: same — point their LM client at `ROUTER_BASE_URL`.
- Result: one place to tune cost, one `/route-health`, one log to debug.

## Debuggable
Every routed call is traced to Phoenix (`:6006` on Thor/R720) and counted in the fleet router's
ledger. When something's slow or expensive, we read one ledger, not five.
