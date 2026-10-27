---
name: two-tier-self-audit
intro: The two-tier self-improving loop + round-numbered self-audit scorecard (Studio improves itself and builds Tier 2).
---

Operate as two tiers, continuously, pause-only:
- **Tier 1 (Studio = Codegen)** improves itself AND builds/maintains Tier 2.
- **Tier 2** is the shipped product (apps, engines) Studio produces.
The Tester drives and verifies both.

## Each round (numbered; never resets)
1. Measure the *live* state of both tiers — not cached claims.
2. Run correctness checks + a formatting review of the report itself.
3. File the next planned improvement as a change request; Tier 2 carries one out
   per round; Tier 1 re-audits.
4. Emit a round-numbered **self-audit scorecard** (see below) + recorder frame.

## The self-audit scorecard (HTML, dual-format w/ JSON)
Header: `Round N of M: K findings to fix`, generated timestamp, "every number
measured from the live state".
Tiles: Mission Quality, Studio Quality, Engines Shipped (x/y), Requests Done.
Tables:
- **Correctness checks**: result (PASS/FLAG) · check · detail. Include: every
  shipped engine validates against spec; no duplicate names; Tester passes all
  scored checks; change-request backlog under threshold; Tier-2 UI readable
  (contrast ≥4.5:1); quality improved over last 100 rounds.
- **Formatting review of this report**: every planned improvement has
  layer+category+description; descriptions fit one line (≤110 chars); plan
  covers the backlog; tables have headers + fixed column order.
- **Planned improvements**: round · layer · category · improvement · status
  (queued/executed).

## Discipline
Honest numbers only (a FLAG is not hidden). Outward actions gated (dry-run +
notify-after). The loop executes its own plan — it does not wait on a human
except at the approval queue for self-rewrites and outward actions.
