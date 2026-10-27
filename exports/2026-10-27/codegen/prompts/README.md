# Odyssey — Prompt Package

System/seed prompts for the empire, packaged to pull once and deploy on the fleet.

## Build topology (the "weird mix")
- **Jarvis** (copilot/orchestrator) sits on top; directs the Institute, faces you.
- **Institute** (Threshold Institute) is the brain/controller; it **tasks** codegen (decides what to build/fix) and owns the one graph.
- **Codegen** is the hands; it **ingests every codebase and writes/edits them** — including Jarvis and the Institute, and itself (self-ingest + self-rewrite).
- So: Institute *controls* codegen; codegen *codes* the Institute and Jarvis. Bootstrap is intentional — codegen self-hosts so it can improve the thing that improves everything.

```
Jarvis ─directs→ Institute ─tasks→ Codegen ─builds→ { Jarvis, Institute, sub-stacks, Codegen }
                       ↑__________ results / graph __________|
```

## Files
- `00-routing.md` — the one routing spec every entity obeys (local-first, single egress).
- `jarvis.md` · `institute.md` · `codegen.md` — the three mains.
- `substacks/` — broadcaster-operator / -curator / -authentic, advertising-programmatic, tendergraph-science, tester.
- `FEEDBACK.md` — how fleet results get back to Claude ASAP for debugging.

## Pull (one command)
```bash
git -C codegen-v3 pull origin claude/router-and-graph-rm   # if already cloned
# or fresh:
git clone https://github.com/5oclockshadow/codegen-v3 && cd codegen-v3 && git checkout claude/router-and-graph-rm
```
Everything is under `prompts/`. Deploy each prompt as the system prompt of its service (env `SYSTEM_PROMPT_FILE` or paste), set `ROUTER_BASE_URL`, run, and push results back (see `FEEDBACK.md`).

## Non-negotiables (all entities)
1. All model calls egress through the **fleet router** — never a provider directly.
2. Nothing writes code or sends outbound without passing its **gate** (tester / approval).
3. Every run emits a **README execution log + telemetry JSON** (ISO-8601) and pushes it, so Claude can pull and debug.
