---
id: diagram
name: Diagram
description: Flowcharts, architecture diagrams, org charts and timelines as clean, editable SVG.
outputs: html, svg, png
---

# Skill: Diagram

Turn processes, systems and structures into diagrams that are quick to read and easy to edit.

## Questions to ask

1. Kind: a) flowchart, b) system architecture, c) sequence, d) org chart, e) timeline, f) journey map, g) other?
2. The content: steps, parts and how they connect. Paste notes or a list.
3. Where will it be used (doc, slide, wiki, poster)? It decides the size. [1600×900]
4. Level of detail? [high level, fits one screen]
5. Brand colors? [none; neutral with one accent]

## Output

- `diagram.html`: an inline SVG at a fixed size that scales to fit the window. Labels are live `<text>`, not paths.
- A download button that saves the SVG as `diagram.svg`; the root has an explicit size for PNG export.
- Short node labels (two to six words); longer detail goes in numbered notes under the diagram.
- For diagrams with more than about 15 nodes, also send the structure as Mermaid in a second block (`diagram.mmd`) so it can be edited elsewhere.

## Build steps

1. Model the content as nodes and edges. Choose the direction: left to right for processes, top to bottom for hierarchies.
2. Place nodes on a grid with explicit coordinates, aligned on their centers and evenly spaced.
3. Route connectors with right angles or gentle curves, avoid crossings, and put arrowheads on every directed edge.
4. Group related nodes into labelled regions (swimlanes, systems, phases).
5. Add a title, and a legend if shape or color carries meaning.

## Design rules

- Each shape and color means one thing and is used consistently (for example rectangles for steps, diamonds for decisions). Three or four categories at most.
- Text never overlaps lines or other text, and is at least 14 px at the output size.
- Connectors meet node edges, not centers. Label an edge only when the relationship isn't obvious.
- More space between groups than within them.
- A neutral base with one accent for the main path.

## Variations

Vary the orientation, the grouping (by phase vs. by actor), or the level of detail.

## Checklist

- [ ] Every node and relationship from the source appears.
- [ ] No avoidable crossings and no overlaps.
- [ ] The direction of flow is obvious.
- [ ] A legend explains any encoding.
- [ ] Readable at the target size.

## Example requests

- Flowchart of a customer refund process, from request to payout, with approval steps.
- Architecture diagram: web app, API, Postgres, Redis cache, background workers and file storage.
- A timeline of a company's milestones from 2019 to 2026.
