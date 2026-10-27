# Skill: style agent chat

## Use when
A site is open and the user wants it changed by words or by menu.

## Behaviour
- Parse the prompt locally first: palette names, fonts, structure and look names, corners (sharp, soft, round), density (compact, normal, airy), motion (still, gentle, lively), hex accents, "open N", "ship".
- If Claude is available, ask for a JSON patch with the same keys plus a one-sentence "say". Merge with the local parse; the local parse stands if the model fails.
- Apply the patch to the open spec only. Never silently touch other tiles.
- Reply in one sentence with what changed; if nothing parsed, list what can be changed.
- 50 suggestion prompts appear in the chat as clickable chips; they describe real businesses in today's economy.

## Rules
- Prompts to the model carry YOU MUST and YOU MUST NEVER lists: specific to the business, no placeholders, no invented facts, no generic hero with three cards, reply as JSON only.
- Menus (structure, look, motion, palette, font, corners) and chat edit the same spec, so either path is reversible by the other.

## Verify
Type "ink blue, serif, airy": palette, font and density change on the open tile only; the reply names the change.
