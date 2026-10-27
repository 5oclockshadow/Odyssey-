# GitHub sources

This project is original work. One GitHub repo was read as a **behaviour reference** (not imported as code): its interaction model was reimplemented from scratch in the Keel graph, on Nocturne's own styling.

repo: satellitecomponent/Neurite
branch: main
role: reference only — no files copied; zoom/pan, node, edge and Zettelkasten behaviour reimplemented

## Last sync
date: 2026-10-21T13:37:31Z
commit: e62b270402b6
### Studied in this project
- `performZoom` / `onWheel` (js/interface/interface.js): zoom is continuous-exponential in scroll delta, cursor-anchored, unbounded → reimplemented faithfully (exp(-deltaY·speed), imperative accumulator, deep cap)
- Complex-space pan/zoom model → deep zoom + Mandelbrot detail that resolves with depth
- Node drag / scroll-to-scale / connect / Zettelkasten (`##` title, `[[ref]]`) → graph note, AI and link nodes
- Edge model → curved, typed graph edges

## Screen map
| Screen / area | Built from |
| --- | --- |
| Keel graph tab (nodes, linking, fractal zoom, Zettelkasten) | satellitecomponent/Neurite: js/mandelbrot/mandelbrot.js, js/nodes/nodeclass.js, js/nodes/nodeutilities.js, js/globals.js (behaviour reference only) |
| Everything else (agents, MCP, repos, research, terminal, host) | original |
