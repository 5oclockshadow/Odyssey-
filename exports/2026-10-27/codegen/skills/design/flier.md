---
id: flier
name: Flier
description: Single-page fliers, posters and social graphics for print or sharing.
outputs: html, pdf, png
---

# Skill: Flier

Design one-page pieces that get a message across at a glance: event fliers, posters, handouts and social graphics.

## Questions to ask

1. What is being promoted, and what should people do (come, call, scan, sign up)?
2. The details: date, time, place, price, contact, link. [required]
3. Size? a) Letter or A4 portrait, b) 11×17 in poster, c) 1080×1080 social post, d) 1080×1920 story [a]
4. Printed at home, printed professionally, or shared digitally? [printed at home]
5. Images or a logo to include?
6. Mood: bold, elegant, playful or minimal? [bold]

## Output

- `flier.html`: one page element at the exact size, with `@page` set to match and margin 0.
- Printed at home: keep all content 0.375 in from the edges.
- Printed professionally: extend background color 0.125 in past the trim as bleed, and keep text 0.25 in inside the trim.
- Digital sizes: the root element has an explicit pixel width and height for PNG export.
- QR codes generated from the link with a pinned QR library, at least 1 in (or 300 px) square.

## Build steps

1. Rank the information: headline, then the key detail (when and where), then the call to action, then everything else.
2. Pick one big idea to carry the piece: a dominant image, a large type treatment, or a strong color field.
3. Size the headline to read from across a room: at least 72 pt on Letter or A4.
4. Group the details tightly and align everything to one grid.

## Design rules

- Headline and call to action readable from a distance.
- Three type sizes at most.
- Strong contrast for print; no thin type over busy images.
- Nothing important near the trim.
- Use the user's details exactly, and check dates, times and addresses against what they gave you.

## Variations

Vary the big idea: type-led, image-led, or color-field-led.

## Checklist

- [ ] Exact size; prints on one page with nothing clipped.
- [ ] Every detail is present and matches the user's text.
- [ ] The call to action and QR code are large enough, and the code points to the right link.
- [ ] Headline readable at a distance.
- [ ] Text inside the safe margin.

## Example requests

- A flier for a Saturday farmers market, 8am to 1pm at Riverside Park, free entry, live music.
- An 11×17 poster for a jazz night at a small bar on 14 March, doors 8pm, $10.
- A square social post announcing new evening classes at a yoga studio.
