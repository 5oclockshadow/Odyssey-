# Ability-Based App Builder (Skilld Studio) + Kiln — backend

Self-building, self-improving app builder. A build passes only when all checks
(e2e + format + SOC 2) pass; failures teach rules that the next round/build
applies (pass-rate rises). SOC 2 evidence per build; Tester audits, injects
chaos, and proposes patches that never apply without approval. Kiln = same
backend, best-of-four variant generation.

## Run
    python3 -m venv .venv && . .venv/bin/activate && pip install fastapi uvicorn pydantic
    python3 -m appbuilder        # :9906

Routes: /projects · /projects/:id/builds · /builds/:id(/evidence,/recording) ·
/recordings/:id/replay · /skills/:id(/rules/:rid/rollback) · /jobs (batch|academy)
· /reports/pass-rate · /tester/{audit,chaos,propose-patch,approve} · /recorder/stream
