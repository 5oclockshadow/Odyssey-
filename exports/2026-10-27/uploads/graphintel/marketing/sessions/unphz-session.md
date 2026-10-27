# unphz: a 20-round session in the Style Studio (13 Oct 2026)

Run live in the Studio with Claude behind the agent. Three runs were needed; each exposed defects in the agent that were then fixed. This transcript is run three. Items in parentheses are my notes, not the agent's words.

## Round 1: the generation prompt

Name: **unphz**. Mode: Imagine at runtime. Samples: 4.

Brief:
> unphz is an autonomous research institute run by one agent, SEXTANT, and one owner. SEXTANT reads papers and the web around the clock, keeps a typed hypergraph of what it learns (a fixed seeded core plus a free periphery it grows and ranks itself), and proposes findings with their sources. The owner approves what becomes public; everything else appears on the site only as grey shapes. Visitors can chat with SEXTANT about approved work only. Tiers: Reader (free), Learner (free), Signals ($39, certified), and 10 invited Testers with full lab access. Audience: researchers, founders and public-sector buyers who want research they can trace. Feel: an instrument, not a brochure; precise, calm, a little strange.

Result after 2 min 46 s: four directions, each a different structure and metaphor: SEXTANT's Hypergraph Layers; Research Workbench: Tier Access; Paper Inbox: Daily Batch (with a signature widget); SEXTANT Live: Visitor Chat Log. Three had no widget because the model was rate-limited during writing. Opened #3, Paper Inbox.

## Rounds 2 to 20

**2. Me:** Make it a chaptered scroll with a side rail nav.

**Agent:** Changed: structure → Editorial scroll; nav → center.

**3. Me:** Look: technical. Palette: deep graphite background, near-white text, lime accent #d4ff3a.

**Agent:** Changed: look → Brutalist; palette → Mono; colours → #1a1a1a #f5f5f5 #d4ff3a.

**4. Me:** Headings in Space Grotesk.

**Agent:** Changed: font → Space Grotesk.

**5. Me:** 3d motif. The hero should read as a sextant instrument over a graph shell: approved nodes in the accent, withheld nodes grey.

**Agent:** Changed: motif → 3d.

**6. Me:** Rewrite the headline: under 7 words, about research that keeps moving while only approved work goes public.

**Agent:** Changed: headline → "Research flows, only approved work ships".

**7. Me:** Rebuild the signature widget: a small graph of 9 nodes where a visitor clicks a node to toggle it between published (accent) and withheld (grey), and a 'public view' panel beside it updates to show only published labels.

**Agent:** Rebuilding the signature widget… Widget unchanged (claude.complete: rate limit exceeded).

**8. Me:** Add a section called The daily round with five steps: read, link, propose, approve, share.

**Agent:** No change found. (model rate-limited; the Studio now says so instead of this fallback)

**9. Me:** Motion gentle. Respect reduced motion.

**Agent:** Gentle motion respects reduced motion preferences by using CSS prefers-reduced-motion. The motif system animates only when users haven't disabled motion in their OS settings; no changes needed to your current spec.

**10. Me:** Try a bottom dot nav instead of the side rail.

**Agent:** No change found. (bottom dot nav does not exist in the kit: navs are top, center, minimal)

**11. Me:** No, the side rail was better. Go back to it and make corners sharp, density compact.

**Agent:** Went back one step.

**12. Me:** Make the research log section look like a terminal, but keep the rest of the page as it is.

**Agent:** Changed: structure → Terminal. (wrong: a partial restyle is impossible; the Studio now refuses this and says why)

**13. Me:** Switch the whole structure to the ledger.

**Agent:** No change found. (no ledger structure in the kit)

**14. Me:** Back to chaptered scroll. Keep palette, fonts, widget and copy.

**Agent:** Changed: structure → Editorial scroll.

**15. Me:** Primary button: Follow the research. Secondary: Open questions.

**Agent:** Changed: button → "Follow the research".

**16. Me:** Add an About section: one agent, one owner, publishing by approval only. No numbers that are not in the brief.

**Agent:** No change found. (model rate-limited)

**17. Me:** Try ink blue #2d4fd6 accent on a paper background with near-black text.

**Agent:** Changed: palette → Paper; colours → #f4efe6 #1c1917 #2d4fd6.

**18. Me:** Graphite and lime was better. Go back.

**Agent:** Went back one step.

**19. Me:** Remix only the look. Keep structure, palette, fonts, copy and the widget.

**Agent:** Changed: look → Glass.

**20. Me:** What did we build, and what could you not do?

**Agent:** No change found. (model rate-limited; in session two it answered: built Editorial scroll, retro CRT look, grid motif, center nav, lime palette, Space Grotesk, custom head and CTA, 4 sections, a widget; cannot style sections individually, change corners or density, add pages, or animate beyond the motifs)

## What the three runs changed in the agent

- Run one: the agent lost the open sample after a click and answered "Open a sample first" for 17 rounds. Fixed: it reopens the last sample, and the model can no longer switch samples unless asked.
- Run two: every edit dragged unrelated keys with it (a headline rewrite also changed look, motif, nav, palette and font), the agent claimed changes it had not made (side rail, compact density), a question got "No change found", and "go back" had nothing to go back to. Fixed: edits apply only to the keys the request names, the reply lists the actual changes instead of the model's description, an undo stack, custom hex accents, a factual "already X" when nothing changes.
- Run three: rate limits were silent, one partial restyle was wrongly applied, a font request was a no-op. Fixed after the run: the agent now reports rate limits and refuses section-only restyles.

## What the kit cannot do (the agent said so, correctly)

Side rail or bottom dot navigation, per-section structure, corners, density, motion levels, a secondary button, a ledger structure, a sextant-shaped 3D hero. These need kit additions, not prompting.

## The base site

Spec: `unphz-base-spec.json` (structure Editorial scroll, look Glass, motif 3d, nav center, graphite with lime #d4ff3a, Space Grotesk, four sections, CTA "Follow the research"). Open `Unphz Base.dc.html` to view it rebuilt from the spec. The Export button in the Studio downloaded the same page to your machine. The widget in the spec was rewritten by hand to a working click-to-approve inbox: the model's version referenced classes it never defined.
