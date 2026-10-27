---
id: color-type-pairing
name: Color + type pairing
description: Palettes and font pairings with a specimen sheet, contrast checks and ready-to-use tokens.
outputs: html, css, json
---

# Skill: Color + type pairing

Propose color palettes and font pairings, show them in use, and hand over tokens a developer can paste in.

## Questions to ask

1. What is it for (brand, app, website, event)?
2. Three words for how it should feel (for example calm, premium, playful, technical)?
3. Colors or fonts that must stay?
4. Light theme, dark theme, or both? [both]
5. Free fonts only (Google Fonts)? [yes]
6. How many directions? [3]

## Output

- `palette.html`: one specimen per direction, each with:
  - **Palette:** a neutral ramp of 9–11 steps, an accent ramp, an optional second accent, and status colors (success, warning, danger, info). Every swatch shows its role, hex, OKLCH value and contrast ratio against the text or background it will sit with.
  - **Type:** heading and body fonts in a full hierarchy (display, h1–h3, body, small, caption, UI label), numerals, and a real paragraph.
  - **In use:** a small sample (card, button, form field, paragraph section) in light and dark.
- `tokens.css` (CSS custom properties) and `tokens.json` (design tokens) for the direction the user picks, each as its own code block. Before a pick, send them for the first direction.

## Build steps

1. Translate the feeling words into decisions: hue family, saturation, contrast level, type classification (humanist sans, geometric sans, serif, slab, mono).
2. Build ramps in OKLCH so steps are perceptually even. Put the base color at step 500.
3. Pair fonts by contrast (serif headings with sans body) or by family (one superfamily). Check that the weights and character sets you need exist.
4. Check contrast on every text pairing. Fix failures by changing lightness, not hue.
5. Render the specimens and name each direction.

## Design rules

- Google Fonts or system fonts only, unless the user owns other licenses.
- Every text-on-background pair shown passes 4.5:1, or is labelled "large text only" at 3:1.
- Neutrals carry most surfaces; the accent is used sparingly.
- Don't default to the most common fonts (Inter, Roboto, Arial, Montserrat) unless they fit the brief.
- Name colors by role (background, surface, text, muted, accent, border) plus ramp step.

## Variations

Three directions by default, differing in color temperature, contrast and type classification. Give each a short name.

## Checklist

- [ ] Each direction has ramps, status colors, a type specimen and a light and dark sample.
- [ ] Contrast ratios are shown and pass.
- [ ] Fonts load from a CDN in the weights used.
- [ ] `tokens.css` and `tokens.json` are valid.
- [ ] The directions are clearly different from each other.

## Example requests

- Colors and fonts for a children's science museum website.
- A calm, trustworthy palette for a mental-health app, in light and dark.
- A type pairing for a law firm that wants to feel modern but serious.
