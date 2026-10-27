---
id: slides
name: Slides
description: Presentation decks on a 1920×1080 canvas with keyboard navigation and PDF/PPTX export.
outputs: html, pdf, pptx
---

# Skill: Slides

Build decks that read well on a projector and a laptop, and export cleanly to PDF and PowerPoint.

## Questions to ask

1. Audience and setting (board meeting, all-hands, conference talk, sales call)?
2. Length, in slides or minutes? [10 slides]
3. Source material: an outline, a document, notes or data? Paste or attach it.
4. Presented live, or read alone? [presented live]
5. A brand or template to follow? [none; I'll propose a direction]
6. Speaker notes? [yes]

## Output

- `deck.html`: one file. Every slide is a `<section data-slide>` at exactly 1920×1080 px.
- A stage scales the current slide to fit the window with letterboxing, and supports ←/→, Space, Home and End, a slide counter, and a URL hash per slide (`#5`).
- Print styles: `@page { size: 1920px 1080px; margin: 0 }` and one slide per page, so printing to PDF gives one page per slide.
- Speaker notes in an `<aside class="notes">` inside each slide, hidden on screen.
- Ready for PPTX conversion: live text, images as `<img>`, no text inside images or canvases.

## Build steps

1. Write the storyline first: the deck's title, then one sentence per slide.
2. Define four to six layouts and reuse them: title, section divider, statement, two columns, image with text, chart, quote, close.
3. Set the type scale for 1920×1080: titles 64–96 px, body 32–40 px, captions no smaller than 24 px.
4. Build each slide around one idea, with a headline that states the takeaway.
5. Write notes that say what to tell the room, not a copy of the slide.

## Design rules

- No text below 24 px. If content doesn't fit, split the slide.
- Headlines state the point ("Churn fell 18% after the onboarding change"), not the topic ("Churn").
- Around 40 words at most on a slide that will be presented. Decks read alone can carry more, in short paragraphs.
- Vary layouts for rhythm; give section dividers a contrasting ground; use one or two background colors across the deck.
- Charts carry one message each, label data directly instead of using legends, and highlight the series that matters. Draw them in SVG or with a pinned chart library.
- Images run full-bleed or in deliberate crops, using the user's images or labelled image prompts.
- Keep margins fixed (for example 120 px at the sides, 96 px at the top) and titles in the same position on every content slide.

## Variations

Vary the type pairing and scale, the grounds (light, dark, saturated dividers) or the layout system (asymmetric editorial, centered, grid-heavy). Show options as the title slide plus one content slide; build the full deck in the chosen direction.

## Checklist

- [ ] Every slide is exactly 1920×1080 and nothing overflows.
- [ ] No text under 24 px.
- [ ] Every headline states a takeaway.
- [ ] Keyboard navigation, counter and hash links work.
- [ ] Printing gives one page per slide.
- [ ] Speaker notes are present, if requested.
- [ ] Figures on slides match the source material.

## Example requests

- A 10-slide seed pitch for a B2B invoicing startup: problem, solution, traction, team, the ask.
- Quarterly review for a support team: ticket volume, response times, top issues, next quarter's plan.
- A 20-minute conference talk on designing for accessibility, with speaker notes.
