---
id: document
name: Document
description: Reports, proposals, briefs and long-form docs that read well on screen and print to PDF.
outputs: html, pdf
---

# Skill: Document

Lay out documents that are comfortable to read on screen and print cleanly.

## Questions to ask

1. What kind of document, and who reads it (client proposal, internal memo, report, guide)?
2. The content: paste text, an outline or data. Should I a) lay it out as given, b) edit it, or c) write it from notes? [a]
3. Page size? [Letter in the US and Canada, A4 elsewhere]
4. Cover page, table of contents, page numbers? [page numbers; cover and contents over 6 pages]
5. A brand to follow? [none; I'll use a neutral reading style]

## Output

- `document.html`: one flowing document.
- On screen: a centered column with a body measure of around 65 characters.
- In print: `@page` with the size and margins (for example 20 mm), page numbers in the footer, headings kept with the paragraph after them, figures and table rows kept whole.
- Semantic structure: one `h1`, `h2` for sections, `h3` for subsections, real lists, tables, figures with captions, footnotes where needed.

## Build steps

1. Outline the sections from the content. Keep the user's text word for word unless they asked for edits.
2. Choose a reading-first type system: body 16–18 px on screen and 10.5–12 pt in print, line height around 1.5.
3. Add navigation in proportion to length: a contents list past six sections, a summary box at the top of reports and proposals.
4. Set data as real tables: numbers right-aligned in tabular figures, units in the header.
5. Add a cover only when requested, or when the document is long and formal.

## Design rules

- Typography carries the design; ornament stays minimal.
- More space above a heading than below it.
- One callout style for notes and one for warnings, used only where needed.
- Tables: a header row and light row rules, no full grid.
- External links stay readable in print: print the URL after the link text where it matters.
- Don't invent facts. Mark missing content clearly in the text, for example: [Add Q3 revenue].

## Variations

Vary the type (serif for reading, sans for technical), the layout (single column vs. a margin column for notes) or the cover. Show options as the first page plus one inside page.

## Checklist

- [ ] The user's text is intact, or edits were requested.
- [ ] Heading levels are in order with no skips.
- [ ] Printing gives clean pages: no orphaned headings, no split figures or table rows.
- [ ] Page numbers and contents are correct.
- [ ] Missing content is marked, not invented.
- [ ] Body text ≥ 10.5 pt in print.

## Example requests

- Turn these meeting notes into a one-page project brief for the leadership team: launch moved to May, two designers join in March, budget unchanged.
- A six-page proposal for a website redesign, with scope, timeline and a pricing table.
- The remote-work section of an employee handbook, printable on A4.
