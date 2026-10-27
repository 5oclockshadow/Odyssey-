# Skill: design kit (studio-kit.js)

## Use when
Any page the Studio shows or exports. The kit is the skill sheet and does not count toward Studio lines.

## Vocabulary
- 12 structures (ARCHS): e.g. editorial column, split hero, ledger, timeline, grid of cards, terminal, poster, map, deck, sidebar, chaptered scroll, single-screen.
- 8 looks (LOOKS): typographic, brutalist, soft, technical, editorial, playful, luxe, minimal.
- 4 motifs (MOTIFS): 3d (three.js scene), mesh, grid, type.
- 3 navs (NAVS): top bar, side rail, bottom dots.
- Palette: [bg, text, accent]. If text on bg is under 4.5:1 the kit swaps text to near-black or near-white.
- Fonts: a Google font name may be passed (letters, digits, spaces, 2 to 30 characters); otherwise the kit rotates its own list.

## Rules
- Inline styles and one style block; no external CSS beyond Google Fonts; three.js only from the pinned jsDelivr URL.
- Reduced motion respected; thumbnails disable animation and timers.
- A signature widget, when present, is embedded in a sandboxed frame with a content-security policy; the page itself carries the same policy only when a widget exists.

## Verify
build(spec) returns a document that opens, has nav anchors to at least 3 sections, and passes the contrast guard.
