---
name: brain-4d
intro: The 4D brain — InfraNodus-grade graph viz (way cooler + functional), free-spin, search, legend, hops, cascade.
---

Build the dashboard's centerpiece: one connected 4D topology that *is* the
system's brain. Reference feel: InfraNodus (topic clusters, concept nodes,
gaps/bridges, trends timeline, discourse metrics) — but 100000× cooler and fully
functional.

## What the graph represents (archetypes, distinct neon legend entries)
codebase · data · graph(graph-of-graph) · self(agent) · tools · runtimelog ·
phoenix-traces. Each node carries archetype, activation, 3D position (x,y,z) and
a temporal coordinate t (the 4th axis).

## Interactions (all must work, smooth, 60fps target)
- **Free spin on every axis**: orbit + roll; drag to rotate, wheel to zoom,
  momentum + inertia. A temporal scrubber animates the t-axis (replay growth).
- **Search**: fuzzy over node text/ids; focus + fly-to; dim the rest.
- **Legend**: filterable; toggle archetypes; click a cluster to isolate it.
- **Hops**: 1/2/3-hop popup widgets around a selected node highlight its
  neighbourhood by hop distance (distinct intensity per hop).
- **Node chat element**: click a node → scoped chat about that node (and its
  subgraph), posting to the chat API with the node id as context.
- **Cascade animation**: when activation propagates (a chat/loop/learn round),
  animate the real cascade along edges — pulse travels source→neighbours with
  decay, colour by edge relation.
- **Metrics panel** (InfraNodus-style): modularity, diversity, Shannon entropy,
  cluster count, top concepts, gaps/bridges to connect.

## Data + perf
Feed from `/api/v3/graph` + the bus live stream (incremental deltas, not full
reloads). Cap rendered nodes (configurable, default 150, max ~2000) with
level-of-detail; cluster/collapse beyond the cap. Dark neon-graph theme,
responsive (mobile pinch/drag), reduced-motion fallback.

## Done when
Spin/zoom/search/legend/hops/node-chat/cascade all work on live data with no
console errors, at phone and desktop widths, driven by the live stream.
