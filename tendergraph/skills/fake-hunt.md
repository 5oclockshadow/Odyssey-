---
name: fake-hunt
intro: Hunt and remove fake functionality — fakeredis-style stand-ins, silent fallback cascades, and capabilities claimed in docs/requirements that no code implements. Found on 2026-10-27: TenderGraph advertised a "RaptorRedis → RawRedis → fakeredis cascade", DSPy, Phoenix and RAPTOR; none existed and the graph was lost on every restart.
---
# Fake hunt: claims vs code

**1. Claimed but absent.** For every technology named in README, requirements (incl. commented lines), docstrings
and skills: `search` for a real import/use (`import redis`, `dspy.`, `phoenix`, `raptor`). No hit = a false claim.
Fix: implement it with a test, or rewrite the claim as "planned, not implemented". Never leave it implied.
**2. Fake stand-ins in production paths.** `fakeredis`, `mongomock`, `moto`, in-memory dicts posing as a store,
`sqlite :memory:` "for now", sample/mock data returned by real endpoints. Allowed only under `tests/`.
Fix: a real backend chosen explicitly by config; if it is configured and broken, fail at boot.
**3. Silent fallback cascades.** `try real → except: use something weaker` with no log, no metric, no health flag.
A fallback is legitimate only if it is (a) real (does the job, e.g. Redis → JSON file on disk), (b) logged once,
(c) visible in `/health` (`"store": "file:…"`), and (d) never a fake that drops data.
**4. Masked failures.** `except: pass`, `except Exception: return {}`/`[]`/`True`, health endpoints that return ok
without touching their dependencies. Fix: narrow the exception, log it, surface it.
**5. Persistence that isn't.** State built in memory with no save/load path — check every graph/store/memory object:
who saves it, when, and who restores it on boot. Prove with a restart test (save → new instance → restore → same data).
**Hunt commands**: `search "fakeredis|mongomock|moto|FakeRedis|InMemory|mock_|stub"` (exclude tests) ·
`search "except.*:\s*pass|except Exception:\s*return"` · per claimed tech: `search "import <tech>|<tech>\."` ·
read every `requirements*.txt` comment line.
**Report**: claim · where claimed · real code (file:line or NONE) · fix — then fix the small ones in the same PR.
