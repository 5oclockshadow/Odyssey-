---
name: pc-reader-graph
intro: The reader lane maps Krishna's whole PC (read-only) into the graph — one insight per source/HTML file, read chunk by chunk by a small fast model, consolidated by RAPTOR. How it works, how to steer it, how to check it.
---
# PC reader → personal graph intelligence

**What**: gopher/reader.py crawls `/` (mounted read-only at /host), skips system/vendor/binary trees, and ranks files:
graph-intelligence words in the path (graph, raptor, dspy, hebbian, connectome, cortex, keel, rex, tendergraph,
institute, three, d3, neo4j, agent, codegen, jarvis, anima…) first, HTML next, then newest. Each file is chunked
(3.5k chars, 300 overlap, ≤12 chunks spread over big files) → DSPy `ChunkNote` per chunk with the small model →
`FileInsight` (title, summary, tags, relevance 0-1) → `POST codegen /api/v3/pc/insight` → node `pc:<path>` linked to
`tag:*` nodes and coactivated (Hebbian). RAPTOR consolidates as the graph grows; Redis persists.
**Model**: GOPHER_READER_MODEL (default the fleet's small qwen3:4b) — speed and volume over depth; the 30B coder is
for answers, not bulk reading. Batch/tick: GOPHER_READER_BATCH (4 files) every GOPHER_READER_TICK_S (20 s).
**Steer**: `/api/reader/pause|resume|crawl|tick`; status `/api/reader` (read/sent/failed, queue, top files);
codegen side `GET /api/v3/pc/stats` (files, tags, most relevant). Incremental: unchanged files are not re-read.
**Never**: write to the host, follow symlinks out of roots, read secrets dirs (.ssh, .gnupg are skipped as dot-dirs).
