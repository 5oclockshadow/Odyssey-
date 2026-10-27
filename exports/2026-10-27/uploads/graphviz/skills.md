# skills.md — what this agent can do

The graph IS the agent. It reads its own insights and acts through bare tools; the tester gates every change on held-out dev recall.

## Skills
- **Code lookup** (research, native) — Search real repos (Karpathy et al.) for reference implementations and cite the file.
- **Systems architect** (research, native) — Design the DSPy signature, nested Pydantic output models, ingestion and retrieval stack.
- **Decompose** (research, native) — Break a goal into probes and sub-questions before answering.
- **Grounded citation** (research, native) — Tie every claim to graph nodes; never invent vocabulary.
- **Reflect** (research, native) — Mine insights and questions the user did not think to ask.
- **Tool use (MCP)** (research, native) — Reach for the right MCP server for the task at hand.
- **Write tests** (tester, native) — Turn requirements into gated checks and run them against held-out probes.
- **Self-critique** (tester, native) — Reject its own patches on any held-out regression, and say why.
- **Ship UI features** (research) — Design, test and ship new console features on its own as discoveries land.
- **Manage its own abilities** (research, native) — Run one coherent capability lifecycle: discover, gate, ship, use and persist its own layouts, lenses and retrieval strategies. An ability it “has” is one that is live in the pool.
- **Execute & benchmark** (tester, wished-for) — Actually run the exported DSPy program against a live LM and measure, not just estimate.
- **Cross-session memory** (research, wished-for) — Remember accepted patches and dead ends across sessions via the Memory MCP.

## Abilities — the capability lifecycle
Every ability the agent gains runs one coherent lifecycle, with a single source of truth: an ability it “has” is one that is **live** — a shipped capability whose layout/lens is usable or whose retrieval strategy is in the competing pool.

1. **Discover** — an insight or metric trips a capability’s `why()` (e.g. ≥8 hyperedges ⇒ RAPTOR will help).
2. **Gate** — the tester checks it: the discovery is real, it is not already shipped, it serves a requirement, it renders.
3. **Ship** — on pass it goes live: a layout/lens unlocks, or a retrieval strategy joins the arena pool and competes on held-out dev recall.
4. **Use** — `use_ability(id)` grants (ships if latent) AND applies in one step; on-canvas chips use what is already shipped.
5. **Persist** — shipped abilities are written to memory and restored next session, like the learned graph.

Kinds: **layout** archetypes (force, radial, chord, helix, layers, grid, sphere, tree, radial tree, 3D strata, arc diagram, community galaxy, + LLM-invented), **view** projections (graph 3D, adjacency matrix, mind map), **lens** overlays (fragility, links, analogy, hub halos, bridge finder, path tracer, evolution trail), **strategy** retrievers (BM25 baseline; RAPTOR & Hybrid ship on discovery, then compete).

## Tools the agent calls
- `probe(question)` — Run a retrieval probe and read what lights up.
- `inspect(node)` — List a node’s neighbours and centrality.
- `add_edge(a, b, relation)` — Propose + test a new edge; keep it only if dev holds.
- `prune_edge(a, b)` — Propose + test removing an edge.
- `lookup_code(topic)` — Search Karpathy’s repos for a reference implementation.
- `architect()` — Regenerate the DSPy signature + Pydantic models + config from the graph.
- `ship_feature(id)` — Ship a latent UI capability to the console.
- `use_ability(id)` — Grant (ship if latent) AND use one ability in a single step — layout, lens or retrieval strategy.
- `list_abilities()` — List what the agent can do now vs what is still latent.
- `set_layout(name)` — Switch the live view archetype; ships that layout ability first if it is still latent.
- `set_lens(name, on)` — Turn an analysis lens on (ships it first if latent); on:false turns it off.
- `set_view(name)` — Switch the projection: graph (3D), matrix (adjacency) or markmap (mind map); ships that view first if latent.
- `find_path(a, b)` — Shortest path between two concepts, hop by hop; lights it with the path tracer.
- `suggest_links(node)` — Score likely-missing links for a concept (Adamic–Adar over shared neighbours).
- `add_repo(repo)` — Add a GitHub repo (owner/name, URL, or a bare name to search) to the research queue; it is pulled first and persists across sessions.
- `remove_repo(repo)` — Remove a repo from the research queue.
- `list_repos()` — List the research queue and ingest progress.
- `shake()` — Stress-test robustness by dropping edges.
- `compile()` — Search spreading parameters against the benchmark.
- `connect_mcp(id)` — Connect an MCP server (github, vector, bm25, arxiv, duckdb).

## MCP servers
- Memory MCP [connected] — Persistent knowledge-graph memory (store, recall, link)
- Sequential-Thinking MCP [connected] — Multi-step structured reasoning (think, branch, revise)
- Filesystem MCP [connected] — Read/write project files & exports (read, write, ls)
- GitHub MCP [connected] — Code & repo lookup (search_code, read_file, list_repos)
- Vector MCP [latent] — HNSW kNN over node embeddings (embed, query, upsert)
- BM25 MCP [latent] — Lexical search over definitions (index, search)
- arXiv MCP [latent] — Search research papers by topic (search, get_paper)
- DuckDB MCP [latent] — SQL over the graph as tables (query)

## Loop
ReAct: read insights → pick a tool → observe → repeat.

## One tool registry
Agents, chat, the command palette and every on-screen action call the same tools through `core.runTool`, so every call lands in the ReAct trace. An imperative chat message (“add gitnexus repo”, “show the matrix view”, “path from DSPy to GraphRAG”) routes to a tool; a question is answered from the graph with citations.