# System description

## Product
The Threshold Institute: a public site and an autonomous research agent (SEXTANT) that keeps a typed hypergraph, plus an owner-only agent space and an ops console. One owner. Visitors are anonymous.

## Components (docker compose)
- **web** (nginx): serves the site and pages, proxies `/api`, `/ops`, `/a/<port>`.
- **agent** (engine, FastAPI): the one DSPy Signature, the graph, loops, publishing, auth, mindful posting gate. Read-only root filesystem, source owned by root, writes only to `/state`.
- **ops** (FastAPI): container console and the OPS agent; serves the agent space. Mounts the host Docker socket and the repository.
- **agent-dind**: the agent's own Docker. Runs Phoenix, Redis, the MCP hub, and sandboxes (no network by default).
- **web-dind**: the site's Docker. Runs apps the agent ships.
- **init**: one-shot volume ownership fix.

## Data and classification
| Data | Class | Where |
| --- | --- | --- |
| Published nodes, notes, questions, reports | Public | `/state/graph.json` (flagged), served by `/public/*` |
| Unpublished graph, telemetry, code signatures, incidents | Confidential | `/state`, owner endpoints only |
| Visitor chat and contact text | Restricted (may contain personal data) | Round record in `/state`; not merged into the graph |
| Owner password / hash, SESSION_SECRET, HUB_TOKEN, REDIS_PASSWORD, API keys | Restricted | Environment only (`.env`, never committed) |
| Social and GitHub tokens | Restricted | Environment only |

## Trust boundaries
1. Internet → web (nginx). Anonymous.
2. web → engine public routes (`/round`, `/event`, `/public/*`, `/apps`). Rate limited per IP; chat has no tools and no graph write.
3. Owner session → engine `/owner/*` and ops. Signed cookie.
4. Engine → model provider, web search, GitHub, social APIs (outbound).
5. Engine → sandbox containers (no network by default).
6. ops → host Docker socket: **full host control**; the largest trust boundary.

## Roles
Owner (one human, approves publishing, upgrades, repairs, posts; merges pull requests). SEXTANT and OPS (software agents, no direct code edit). Visitor (anonymous). No other human has access.

## Scope decisions
- Security: in. Availability: in (health endpoint, restart policy, Docker healthchecks). Processing integrity: in (typed models, approval before publish, tests before any patch). Confidentiality: in (public/private split is the core design). Privacy: limited to visitor text; no accounts, no payments, no tracking beyond rate-limit IPs held in memory.
- Out of scope for v1: billing, multi-tenant accounts, customer data. Tenant isolation is therefore `n/a`; the equivalent control is public/private separation.
