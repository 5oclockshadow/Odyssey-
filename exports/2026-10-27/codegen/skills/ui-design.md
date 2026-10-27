---
name: ui-design
intro: How to make UI work look great and stay consistent: tokens only, designed states, both themes, real data, variants judged by a critic, and small changes with big effects.
---
# UI design (from the Institute Map and Bridge Plan, section 3, 2026-10-26)

Source: ~/artifacts/2026-10-26-institute-map/index.html (https://claude.ai/artifact/JRyph6Qrc5MnTp7hKyUBGd), section 3.

## Rules
1. **Tokens only.** Colours, type, spacing, radii and shadows come from `ui/tokens.css` (Nocturne by default). No raw hex or px where a token exists. The lint (`_ds/nocturne/_adherence.oxlintrc.json`) and the token-adherence check enforce it; a patch that fails them cannot go live.
2. **Hierarchy first.** One type scale, one spacing grid, one accent. Outlined primary buttons (Nocturne direction). Left-aligned, asymmetric layouts.
3. **States are designed.** Every interactive element has hover, pressed, focus-visible, empty, loading and error states. A missing state is a defect.
4. **Responsive and themed.** Works at 390 px with no sideways scroll; dark and light are both checked (screenshots at 390 and 1440 in both themes).
5. **Real data only.** Every number links to its source row. No mock values, no placeholder numbers, no invented charts.
6. **Show, then ask.** When the direction is open, produce 2–3 variants along one named axis (e.g. density, emphasis). A critic judges the screenshots; only variants scoring **≥ 8/10** reach Krishna.
7. **Small tweak, big effect.** Prefer changing a token, a shared component or an ai-slot prompt over editing a single screen. One change should improve every screen that uses it.

## How a UI change ships
- Every UI change is a patch: diff + before/after screenshots at 390 and 1440 px + critic score + test result, recorded in the graph.
- Approve or roll back from the UI, chat or `cg`. Nothing goes live without approval.
- Agent-written UI code runs in a sandboxed iframe or shadow root with a strict CSP; libraries only from the pinned import map; no secrets in the browser.
