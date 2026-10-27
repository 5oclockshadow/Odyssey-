# Skill: test everything — from SaaS surface to API tiers

TESTER's authoritative, complete test plan. You are one graph: files, functions, routes, pages, services, data, your own source and tools,
every check, finding, fix and lesson are nodes. This skill says **what must be true before the institute ships**, layer by layer, and how to
prove it. Read the evidence first (traceback, console error, assertion, status code, response body), then the code. Change as little as
possible. Never weaken, skip or delete a test to make it pass — if the test is right, fix the code. A decision only the owner can make (a
product choice, a secret, a paid service, a deletion) returns no edits and names what is needed in `needs_owner`.

A finding is `{key, check, title, detail, severity, file, line, points}`. Severity is `error` (fails at run time or ships something wrong) or
`warn` (works, should not). The key is stable across runs so a finding keeps its history until it is gone. A fix is kept only when the finding
is gone and nothing it touched got worse.

---

## Layer 0 — static and build (automated today)

Run on every file; the graph decides what to re-test when a file changes.

- `py` / `lint` — Python parses; pyflakes names-used-never-defined, broken format strings, misplaced returns are **errors**; shadows and unused are **warn**.
- `js` — every `.js`, `.mjs` and inline page script parses in Node.
- `templates` — Design Component tags balance; holes are dotted lookups only (an expression in a hole is a **warn**).
- `refs` — every file a page loads, a Dockerfile copies and a compose service builds from exists.
- `routes` — every path a page or script calls is a route some server answers (or is a documented `planned_route`).
- `compose` — every variable a service reads is listed in `.env.example`.
- `config` — every YAML and JSON parses.
- `secrets` — no keys, tokens or credentials committed in source (masked in the finding).

**Gate:** zero `error` findings across Layer 0 before any higher layer is trusted.

---

## Layer 1 — unit and integration (pytest)

`pytest -q` in `apps/engine`, `apps/mcp-hub`, `apps/ops`, `apps/tester`, in a throwaway state directory (`TESTER_LOOP=off`, `TESTER_LIVE=off`).

- Every suite green. A new feature lands with tests; a bug fix lands with the test that would have caught it.
- The SaaS core (`apps/engine/test_world.py`) is the reference for tier behavior — extend it, never relax it.
- Coverage of money paths is mandatory: `apikeys` (verify, record, spent, update, sheet), `reprice` (board, public split), `ledger`, `auth`.

**Gate:** all suites pass; no test is skipped or `xfail`ed to go green.

---

## Layer 2 — the page surface (browser QA)

Every `.dc.html` and app page opened in a real browser at **six widths** (360, 390, 768, 1024, 1440, 1920), each clicked through its tabs and
controls. A page fails on: console errors, uncaught exceptions, missing files (4xx/5xx subresources), horizontal scroll, blank render,
`NaN`/`undefined`/`{{…}}` left in the visible text, unnamed buttons, and controls with no accessible name.

- Run the full six-width sweep in a deep pass, not just the quick pair.
- Accessibility: focus-visible on every control, 4.5:1 text contrast (3:1 for headline-scale), hit targets ≥ 44px on mobile widths, keyboard reachable.
- No layout breaks at 360px (the hard floor) or 1920px.

**Gate:** zero page errors at every width; warns triaged.

---

## Layer 3 — authentication and sessions

The owner surface (`apps/engine/auth.py`, `/owner/*`) and the tester's own write surface.

| Case | Expectation |
| --- | --- |
| No credentials → owner route | `401` (or redirect to login), never data |
| Wrong password | `401`, constant-time compare, no user enumeration |
| Valid login | signed session cookie; `HttpOnly`, `SameSite`, `Secure` in production |
| Logout | cookie invalidated; the old cookie no longer authorizes |
| Expired / tampered cookie | `401`; signature verified before trust |
| Owner-only actions (`/run`, `/fixes/{id}/apply`, `/files/write`) | require the bearer token; absent or wrong → `401/403` |
| CSRF on state-changing POST | same-origin or token-checked |

**Gate:** every owner/tester mutation is unreachable without valid credentials; no secret in a response body or log line.

---

## Layer 4 — API tiers and personas (`/v1/*`)

The paid API gates every call through `caller` → `apikeys.verify` + persona policy. This is the heart of the SaaS and must be proved end to end.

**Key lifecycle**
- Missing / malformed key → `401` ("send your key as Authorization: Bearer anma_…").
- Valid key → `200`; key accepted as `x-api-key` **or** `Authorization: Bearer`.
- Rotated key: old secret → `401`, new secret → `200`.
- Suspended tenant (`active:false`) → `401` on every route.

**Persona policy** (`x-persona`)
- A persona the tenant is not approved for → `403` ("needs the owner to approve the tenant").
- `child` persona: `child_safe` tenant returns empty `items` + the note on board routes, `403` on per-asset detail; verify no adult content path is reachable, and the answer length cap (700) holds on `/ask`.
- Detail level by reading tier: `visitor`/`member` see the shaped public row; `pro`/`full` see shadows, controls and raw tables; `child` sees the note only. A field that belongs to a higher tier must never appear in a lower tier's response.
- Graph hops cap by tier: `full` → up to 3 hops, others → 1 (`/v1/graph/node/{id}`).

**Tier/authz matrix** — assert both status and shape for each cell:

| Endpoint | no key | valid · child | valid · visitor/member | valid · pro/full |
| --- | --- | --- | --- | --- |
| `GET /v1/reprice` | 401 | 200, `items:[]` + note | 200, shaped rows, no shadows | 200, rows **with** shadows/controls |
| `GET /v1/reprice/{asset}` | 401 | 403 | 200, no shadow fields | 200, full detail |
| `GET /v1/limits` | 401 | 200 | 200 | 200 |
| `GET /v1/graph/node/{id}` | 401 | 200, ≤1 hop | 200, ≤1 hop | 200, ≤3 hops |
| `GET /v1/provenance` | 401 | 200, public slice | 200, public slice | 200, public slice |
| `POST /v1/ask` | 401 | 200, ≤700 chars | 200, ≤2400 chars | 200, ≤2400 chars |
| `GET /v1/usage` | 401 | own tenant only | own tenant only | own tenant only |

**Planned routes** (documented, not built): `/v1/webhooks`, `/v1/reprice/export`, `/v1/graph/query`, `/v1/harness/run`, `/v1/seed`. A call is
accepted as planned; anything else a page calls that no server answers is a `routes` **error**. When a planned route ships, move it out of
`planned_routes` and add its matrix row the same change.

**Gate:** every matrix cell matches; no higher-tier field leaks to a lower tier; `404` (not `403`) for an unpublished asset so existence is not disclosed where it should not be.

---

## Layer 5 — plans, metering and spend caps

Money must be exact; nothing is invented.

- **Plans** `metered`, `team`, `scale` each resolve the right limits and price. An unknown plan is a finding, not a default.
- **Metering** — every billable call appends exactly one usage record with the rung that answered: board/detail/limits/graph/provenance → `graph`, `/ask` → `30b`. No double-count, no missed count. `apikeys.sheet()` rung totals and `spent()` reconcile to the recorded calls (reference: `rung_totals.graph.calls == 4`, `spent == 0.00004` in `test_world`).
- **Spend cap** — at or over `cap_usd` → `402` ("monthly cap reached"); raising the cap restores `200`; a `cap_usd:0` means no cap.
- **Rate limit** — per key+persona window (`_hits` deque); a burst past the window → `429`, and the limit resets after the window. Prove the limit, prove the reset.
- **Usage honesty** — `/v1/usage` returns the caller's own tenant only, never another's; the number shown equals the number metered.

**Gate:** recorded calls, `sheet()` totals and `spent()` agree to the cent; cap returns `402`; rate limit returns `429` and recovers.

---

## Layer 6 — multi-tenant isolation

- Tenant A's key never reads, meters against, or appears in Tenant B's usage, graph slice or provenance.
- `/v1/usage` and any per-tenant view are scoped by the verified key, not by a client-supplied id.
- No IDOR: `/v1/reprice/{asset}` and `/v1/graph/node/{id}` respect publication and tier for the caller, not the path.
- Owner/admin data (fleet internals, unpublished nodes, other tenants' keys) never cross into a `public=True` slice.

**Gate:** a crafted request with another tenant's id or an unpublished node id returns only what the caller's own tier permits.

---

## Layer 7 — data, provenance and the published split

- Public endpoints read the **published slice only** and write nothing to the graph.
- Every claim the API returns is cited (provenance edges present); an uncited claim is a finding.
- `pub:true` vs private: a private goal, question, shadow or raw table never appears in a visitor/member response.
- The ledger is append-only and signed; a round with no citations is held, not published (`mindful` gate).
- Site tiers (Visitor, Member, Pro, Owner) mirror the API detail levels — Pro adds shadow scores and raw tables; prove parity between site and API gating.

**Gate:** no private field in a public response; every published figure traces to a source.

---

## Layer 8 — billing (provider TBD)

Billing provider is not chosen yet (`billing.provider: to_be_decided`), so test the contract, not a vendor.

- Webhook handler (`/v1/webhooks`, planned): verifies signature, is idempotent (same event id twice → one effect), rejects replay.
- Plan change takes effect on the next metered call; proration/credits are recorded in the ledger, not invented.
- A failed payment suspends the tenant (`active:false`) → `401`; a cleared balance restores it.
- No card data, secret or webhook signing key in source, logs or responses.

**Gate:** contract tests pass against a stub; `needs_owner` names the provider decision and keys before this layer can go live.

---

## Layer 9 — security

- Authz matrix (Layer 4) enforced on every route; default-deny for anything unlisted.
- Input bounds: `/v1/ask` rejects empty and > 1000 chars; all string inputs length-capped; no injection into shell, path or the graph.
- Headers: CORS scoped (not `*` in production for credentialed routes), no stack traces in 5xx bodies, security headers present.
- `secrets` scan clean; `.env.example` lists every variable, with no real values.
- Rate-limit and cap cannot be bypassed by changing persona, header case, or key placement.

**Gate:** zero `secrets` findings; no route authorizes by client-supplied identity; errors leak nothing.

---

## Layer 10 — live stack and resilience

Over the compose network (`TESTER_LIVE=on`):

- `engine /health`, `web /`, `ops /docs` answer; every public engine GET route without parameters answers below `500` (from `openapi.json`).
- Served apps run behind nginx at `/a/<port>/`; a crash triggers trace → fix → test → rebuild → relaunch, and the loop is proven to recover.
- Sandbox isolation: a built app cannot reach another tenant's data or the owner surface.
- Degradation: with no model key, the API still serves reads and meters; it only stops the agent fixing. With no engine, pages fall back to their in-browser sample, never a blank or a crash.

**Gate:** all live endpoints green; the crash-recovery loop completes once end to end.

---

## Running it

- **Quick** — `run all`: tests, audit, js, browser at the quick widths. The working check during edits.
- **Deep pass** — tests + audit + js + browser at all six widths, every page, over its own code and every institute page, repeated. The pre-ship sweep.
- **Three clean passes** — run until three consecutive passes have zero `error` findings. Instability (a failure that comes and goes) is itself a finding.
- **Live** — add the running stack (Layer 10); off in CI without the network.
- Findings come back as FAIL lines in this skill's words: `check severity where: title`. Fixes are exact find-and-replace on one file; `find` occurs once.

## Launch readiness — the gate

Ship only when all hold, in order:

1. Layers 0–2 (static, pytest, every page at six widths): zero `error` findings.
2. Layers 3–7 (auth, tiers, metering, isolation, provenance): every matrix cell matches; money reconciles to the cent; no cross-tier or cross-tenant leak.
3. Layer 9 (security): secrets clean, authz default-deny, errors leak nothing.
4. Layer 10 (live + resilience): endpoints green, crash loop recovers.
5. Three clean passes in a row.
6. Layer 8 (billing) and any `needs_owner` item: explicitly signed off by the owner, or scoped out of this release in writing.

Anything short of all six is **not ready**. Say so plainly, name the blocking findings by severity and blast radius, and route the fixes.
