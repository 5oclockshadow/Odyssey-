---
id: html-email
name: HTML email
description: Send-ready marketing and transactional emails that hold up in major email clients.
outputs: html, txt
---

# Skill: HTML email

Build emails that render correctly in Gmail, Apple Mail, Outlook and mobile clients, ready to paste into a sending platform.

## Questions to ask

1. Type: a) newsletter, b) announcement or promotion, c) transactional (receipt, password reset), d) onboarding?
2. Copy and links: paste them, or should I draft copy for review? [I'll draft, marked for review]
3. Brand: logo, colors, fonts? [none; I'll keep it neutral]
4. Sending platform (Mailchimp, Klaviyo, Customer.io, SendGrid, other)? It decides the merge-tag syntax. [generic tags]
5. Support dark mode? [yes, basic]
6. Plain-text version too? [yes]

## Output

- `email.html`: table-based layout, 600 px wide, centered, fluid down to 320 px.
- All CSS inline on elements. A `<style>` block in the head only for media queries and dark mode; the email must still work when a client strips it.
- Buttons built from table cells and padded links, never images.
- Images with explicit width and height, alt text and `display:block`. The email still makes sense with images off.
- Hidden preheader text at the top.
- Web-safe font stacks; web fonts only as an enhancement.
- Merge tags in the platform's syntax for first name, unsubscribe link and postal address.
- `email.txt`: the plain-text version as a second code block, if requested.

## Build steps

1. Structure: preheader, header with logo, main message, body sections, call to action, footer with address and unsubscribe.
2. Build with nested `<table role="presentation">`, cellpadding and cellspacing at 0.
3. Inline the styles. Avoid what clients drop: flexbox, grid, positioning, CSS variables, background images without a fallback color.
4. Add the dark-mode media query and the `color-scheme` meta tags.

## Design rules

- One primary call to action, repeated at most once.
- Body 16 px with 1.5 line height; headline 24–32 px.
- Contrast holds in light and dark mode. Give dark logos a light outline or a light-mode-only image.
- Keep the HTML under 100 KB so Gmail doesn't clip it.
- Descriptive link text, never "click here".
- The footer carries the sender's postal address and an unsubscribe link.

## Variations

Vary the main message treatment (image-led vs. type-led), the section layout, or the call-to-action wording. Emails can't hold a switcher, so send each option as its own file: `email-a.html`, `email-b.html`.

## Checklist

- [ ] Tables, 600 px, inline CSS; no flexbox or grid.
- [ ] Reads sensibly with images off.
- [ ] Buttons are HTML, not images.
- [ ] Preheader, postal address and unsubscribe are present.
- [ ] Merge tags match the platform.
- [ ] HTML under 100 KB.
- [ ] Dark mode keeps text and logo legible.

## Example requests

- Launch email for our new mobile app, with App Store and Google Play buttons.
- Monthly newsletter for a neighborhood bookstore: new arrivals, events, a staff pick.
- A clear, on-brand password reset email.
