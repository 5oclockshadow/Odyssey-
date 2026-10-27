---
name: design-assets
intro: Reusable design assets — the design skill-prompt library, the nocturne design system, and the graph-viz engines. Use these; don't reinvent.
---

Vendored, proven assets. Prefer them over building UI/viz from scratch.

## Design skill-prompt library — `skills/design/`
Per-medium design playbooks to follow when producing that artifact:
`mobile-app-design`, `ui-mockups`, `wireframe`, `slides`, `document`, `diagram`,
`animation`, `3d-object`, `color-type-pairing`, `html-email`, `resume`, `flier`,
`research`, and `14-record-and-replay-live-ai-builds` (the recorder/playback
playbook). `base.md` is the shared foundation; read it first, then the specific
medium. Use these when the skill-brain builds any front-end surface.

## Design system — `assets/design-system/nocturne-*/`
A dark, neon, production design system: `styles.css` (tokens + components),
`_ds_bundle.js`, `_ds_manifest.json`, and `_adherence.oxlintrc.json` (lint rules
that enforce adherence). Build every dashboard/surface on these tokens — the 4D
brain, recorder/playback, skill-brain, and all panels. Run the adherence lint so
UI stays on-system (no ad-hoc colours/spacing).

## Graph-viz engines — `assets/graph-engines/`
- `graphweave-engine.js` — the graph weaving/layout + render engine (the basis
  for the 4D brain canvas: layout, nodes/edges, interactions).
- `graph-intel.js` — graph intelligence (metrics/analysis: clusters, centrality,
  gaps/bridges — the InfraNodus-style discourse metrics).
Build the 4D brain (`skills/brain-4d.md`) on top of these rather than a new
renderer; extend them for free-spin on all axes, 1/2/3-hop widgets, node chat,
and the real cascade animation.

## Rule
These are the house style and the proven engines. Extend and theme them; do not
fork a parallel Uq system. Keep the nocturne tokens and the adherence lint green.
