---
id: ui-mockups
name: UI mockups
description: High-fidelity desktop and web screens with working interactions.
outputs: html, react, png
---

# Skill: UI mockups

Design high-fidelity screens for web and desktop products: dashboards, settings, editors, marketing pages and multi-step flows.

## Questions to ask

1. Which product, and which screens or flow?
2. Who is the main user, and what is their most important task here?
3. An existing product, design system or screenshots to match? [none; I'll propose a direction]
4. Target width? [1440 px desktop, responsive down to 768 px]
5. Static, or clickable? [clickable for the core interactions]
6. How many directions? [2]

## Output

- `mockup.html`: the full screen at the target width, responsive below it.
- Content that fits the domain: realistic names, numbers that add up, dates in sequence.
- Working interactions: navigation between the key views; hover, pressed, focus and disabled states; menus, dialogs and drawers that open and close; validation on any forms.
- With more than one direction: a small A/B switcher pinned to a corner, with a one-line rationale per option.
- React target: one component per region (`Sidebar.tsx`, `Header.tsx`, `OrdersTable.tsx`) and an `App.tsx` that composes them.

## Build steps

1. Name the primary task and rank the information on the screen by how much it serves that task.
2. Set tokens: color roles (background, surface, text, muted text, border, accent, success, warning, danger), type scale, spacing scale, radius, elevation.
3. Lay out the frame with CSS grid: navigation, header, content regions.
4. Build each component with all of its states.
5. Fill with realistic data, including edge cases: long names, missing values, zero states.

## Design rules

- Match density to the user. Expert tools can be dense; consumer flows need room.
- Align to a grid and use one spacing scale.
- Tables: left-align text, right-align numbers, tabular figures, a sticky header on long tables.
- Charts: label series directly, no 3D, no more than five or six colors.
- One primary button per view. Destructive actions look different and ask for confirmation.
- Forms: labels above fields, helper text where needed, inline validation with specific messages.
- Show the states that matter: empty, loading (skeletons), error, success.
- No decorative stat tiles, badges or charts that don't serve the task.

## Variations

Vary layout (sidebar vs. top navigation, master-detail vs. cards), density, or visual style. Keep the content identical across options so they can be compared.

## Checklist

- [ ] The primary task is obvious within five seconds.
- [ ] Interactive elements have hover, pressed, focus and disabled states.
- [ ] Data is realistic and consistent (totals match their rows).
- [ ] No overlap or horizontal scroll at 1440, 1024 and 768 px.
- [ ] Text contrast ≥ 4.5:1.
- [ ] The direction switcher works, if there is one.

## Example requests

- Analytics dashboard for a podcast host: downloads over time, listener countries, top episodes.
- Settings for a team chat app: profile, notifications, members and billing.
- Landing page for a budgeting app made for freelancers.
