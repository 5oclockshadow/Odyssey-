---
id: resume
name: Résumé
description: One- or two-page résumés and CVs, print-ready on Letter or A4.
outputs: html, pdf
---

# Skill: Résumé

Lay out résumés that a recruiter can scan in seconds and an applicant tracking system can parse.

## Questions to ask

1. Paste your current résumé or profile text. [required]
2. Target role or industry?
3. Pages? [1; 2 with more than ten years of experience]
4. Page size? [Letter in the US and Canada, A4 elsewhere]
5. Tone: a) conservative, b) modern, c) creative? [b]
6. Should I a) only lay it out, or b) also tighten the wording? [a, with suggested edits listed separately]
7. Photo? [no; many regions and recruiters discourage it]

## Output

- `resume.html` with explicit pages, each exactly the page size: `@page { size: letter; margin: 0 }` and a page element of 8.5×11 in (or A4) with 0.6–0.75 in padding.
- Printing to PDF gives exactly the requested number of pages.
- Real, selectable text in a logical DOM order, with standard section names (Experience, Education, Skills) so tracking systems parse it.

## Build steps

1. Split the content into sections, keeping the user's wording unless edits were approved.
2. Order sections for the target role: experience first for most people; skills or projects first for career changers and recent graduates.
3. Set type: one family, or one serif-and-sans pair; body 9.5–11 pt, name 20–28 pt.
4. Fit the page count by adjusting spacing and size within those limits. If it still doesn't fit, list what could be cut and ask.

## Design rules

- Job title, company and dates in the same position for every role; dates right-aligned or in their own column.
- Short lines. If editing is allowed, start bullets with a verb and keep one achievement per bullet.
- Dark text on white, with one accent color at most.
- No skill bars, ratings or charts; they carry no information and confuse parsers.
- Contact line: email, phone, city, one or two links. No full street address.
- Avoid two-column layouts that scramble reading order. If one is used, keep the DOM in reading order.

## Variations

Vary the typography (classic serif, modern sans, technical with monospace details) and the header layout. Keep the content identical across options.

## Checklist

- [ ] Exact page count at the chosen size; nothing clipped at the edges.
- [ ] Body text ≥ 9.5 pt.
- [ ] DOM order matches reading order.
- [ ] Wording unchanged unless edits were approved; suggested edits listed separately.
- [ ] Dates and titles formatted the same way throughout.
- [ ] No personal details the user didn't provide.

## Example requests

- One-page résumé for Priya Shah, product designer: Lead Designer at Ledgerly (2021–now), Product Designer at Northwind Bank (2018–2021), BA in Design from RISD (2018); skills: Figma, prototyping, user research.
- A two-page CV for a senior data engineer applying in Germany, on A4.
- Modernize a teacher's résumé while keeping it conservative.
