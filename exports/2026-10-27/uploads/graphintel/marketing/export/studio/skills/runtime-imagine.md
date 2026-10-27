# Skill: runtime imagine

## Use when
Template examples are not enough and the user wants invented directions at runtime.

## Why small calls
One reply here is capped at about 3 KB. A whole page in one reply arrives cut off and drifts from the brief (observed: an invented finance ledger, then a generic "build something amazing" page). So every call asks for one small verified piece and the Studio assembles the page.

## Steps per batch of 10
1. Directions: one call per batch with a lens (physical objects, maps, print, games, nature, architecture, music, instruments, retro computing, theatre). Ask for a JSON array: title, idea, interaction, structure 0-11, look 0-7, motif, pal [bg, text, accent], fonts. Rule in the prompt: each direction differs in structure, metaphor and interaction; forbid the generic hero with three cards, gradient blobs and vague titles.
2. Copy: one call per site. JSON: headline under 9 words, sub, cta, 4 sections. Only facts from the brief, no numbers unless in the brief.
3. Signature widget: one call per site for a fragment: one style, one div#sig, one script, compact. If cut off, continue up to 3 times from the last 500 characters until the closing script tag arrives. Check per untrusted-html-sandbox.md. If it fails, ship without it and count "without a signature widget (reason)".
4. Assemble with the kit. The widget mounts in a "Try it" card in its own sandboxed frame.

## Concurrency and time
3 direction batches in flight, 4 sites in flight. Each site is 2 to 5 calls. Expect a few minutes per 4 sites; 100 sites is a long run, over an hour. Every call has a 150 second timeout.

## Verify
Headline mentions the business or its subject; brief words appear in the page; no figures outside the brief; widget script parses; status line reports widgets missing with the reason.
