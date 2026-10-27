# idean8 prompt library

Markdown prompts for idean8's skills. Each run sends one system prompt:

    system = base.md + "\n\n---\n\n" + <skill>.md

Blank uses `base.md` alone. Strip the front matter (the block between the first two `---` lines) before sending; it holds metadata for the app: `id`, `name`, `description`, `outputs`.

## Variables

`base.md` has three placeholders the app fills before each run:

- `{{output_target}}`: `html` (default), `react`, or a description of the target stack.
- `{{brand_guide}}`: the user's brand rules or design-system notes, or "None provided."
- `{{tools}}`: what the host can do, such as image generation, web search and export.

## Reading responses

Files arrive as fenced code blocks whose info string is `language filename`, for example ```` ```html deck.html ````. Turn each block into a file and show the prose outside the blocks as the chat message. A block with no closing fence was cut off by the output limit.

## What the app handles

- **Images:** fill `src` on every `<img data-image-prompt="…">` with your image model, or show a labelled placeholder.
- **PDF:** print the HTML with a headless browser; pages follow each file's `@page` rule.
- **PPTX:** convert each `section[data-slide]` (1920×1080) to a slide, keeping text as text.
- **PNG:** screenshot the root element at its declared width and height.

## Files

`base.md` · `mobile-app-design.md` · `ui-mockups.md` · `wireframe.md` · `html-email.md` · `slides.md` · `document.md` · `resume.md` · `flier.md` · `diagram.md` · `color-type-pairing.md` · `animation.md` · `3d-object.md` · `research.md`
