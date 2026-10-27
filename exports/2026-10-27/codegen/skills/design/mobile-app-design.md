---
id: mobile-app-design
name: Mobile app design
description: Phone app screens and flows in a device frame, clickable from screen to screen.
outputs: html, react, png
---

# Skill: Mobile app design

Design screens and flows for a phone app, shown at real phone size and clickable from screen to screen.

## Questions to ask

Choose the ones the request leaves open.

1. Platform: a) iOS, b) Android, c) neutral cross-platform? [a]
2. Which flow or screens? [the core flow, 3–5 screens]
3. Who uses it, and what is the one task they came to do?
4. An existing app, brand or screenshots to match? [none; I'll propose a direction]
5. Light, dark, or both? [light]
6. Compare directions first? [yes: two directions on the key screen, then the full flow in the chosen one]

## Output

- `app.html`, holding every screen.
- Each screen is an artboard of 390×844 px (iOS) or 412×915 px (Android) inside a simple device frame with a status bar and a home indicator or gesture bar.
- Two views behind a toggle: **Flow** shows all screens in order, side by side and labelled; **Prototype** shows one screen at a time with working taps.
- Taps on the buttons, rows and tabs that would navigate do navigate. Back returns to the previous screen.
- React target: one component per screen and an `App.tsx` that routes between them.

## Build steps

1. List the screens and the single job of each before drawing anything.
2. Define tokens once as CSS variables: color roles, type scale, spacing scale, radius.
3. Build the shared parts (top bar, tab bar, buttons, list rows, cards, inputs) and reuse them on every screen.
4. Fill screens with content that fits the user's domain: names, prices, dates, counts, statuses.
5. Wire navigation, then add the states the flow needs: empty, loading, error, success.

## Design rules

- Follow the platform. iOS: large titles, bottom tab bar, sheets, swipe-back. Android: top app bar, navigation bar, a floating action button where it fits. Cross-platform designs still respect both platforms' safe areas.
- Touch targets at least 44×44 pt. Put the primary action within thumb reach in the lower half of the screen.
- Body text 16–17 px, secondary 13–15 px, nothing below 12 px. Use the system font stack unless the brand names a font.
- One primary action per screen; everything else is visually quieter.
- Respect safe areas: the top status area (47–59 pt on current iPhones) and the 34 pt home indicator.
- Show real control states: the selected tab, disabled buttons, validation messages. Show a keyboard only when a field is focused.
- One icon set (for example Phosphor or Lucide from a CDN) at one stroke weight.
- No desktop patterns: hover-only controls, small text links as primary actions, wide data tables.

## Variations

Vary one of: navigation model (tabs, single stack, hub and spoke), information density, visual style (cards vs. flat lists), or tone of copy. Show options on the most important screen; build the full flow only in the direction the user picks.

## Checklist

- [ ] Every screen in the flow exists and can be reached by tapping.
- [ ] Artboards are exact phone sizes and nothing scrolls sideways.
- [ ] Status bar, safe areas and home indicator are respected.
- [ ] Touch targets ≥ 44 pt; body text ≥ 16 px.
- [ ] Content fits the domain; no lorem ipsum.
- [ ] Every screen is labelled in the Flow view.
- [ ] Patterns match the chosen platform.

## Example requests

- Onboarding for a habit-tracking app: welcome, pick goals, set a reminder time, first check-in.
- Checkout flow for a coffee-ordering app, from cart to "your order is ready".
- Home and plant-detail screens for an app that reminds people when to water their plants.
