# Skill: build a potential-client list

How SEXTANT and the owner build a qualified prospect list for the institute's paid surfaces (the `/v1` API, Signals, Tmpltz offers). The output
is a disciplined list where **every prospect is one record with the same fields**, every claim is sourced, and nothing is invented. Outreach is
owner-gated: the agent assembles and ranks; the owner approves who gets contacted.

## The one rule

A prospect you cannot source is a guess, not a lead. Every field that asserts a fact about a company or person carries a `source` (a URL you
fetched or a named public filing). A figure with no source is marked `est.` and never shown as fact. No scraping behind logins, no personal data
beyond business contact already public, and no outreach until the owner approves — the same provenance ethic as the rest of the institute.

## The record — one file per prospect

Each prospect is a file at `marketing/clients/<slug>.md` with this front-matter, then free notes. The eight W/H fields are mandatory; the rest
enrich. Keep every value short and sourced.

```yaml
---
name:        Acme Analytics            # the organization
slug:        acme-analytics
why:         Ships daily market calls with no sourcing; our cited re-rates are the gap they feel   # WHY them, in one line
what:        /v1 API, Scale tier — cited reprice board embedded in their product                   # WHAT we sell this one
when:        Q1 — their Series B (Jan, source below) funds a data budget; trigger = new data hire   # WHEN to move, and the trigger
how:         Warm intro via <mutual> → 10-min demo of the Explorer → trial key                      # HOW to approach
where:       FinTech · Toronto · found in Catalogue 5M row 12 and their careers page                # WHERE: sector, geo, and the source channel
how_much:    $499/mo Scale + metered overage; est. $9–14k ARR year one                              # HOW MUCH: plan, price, ARR est.
who:         Head of Research — <name>, <public business email/LinkedIn>                            # WHO: the buyer/contact, public only
fit:         4/5    # need × our offer match
intent:      3/5    # observable buying signals (hiring, RFPs, public complaints)
reach:       4/5    # can we actually get to the buyer
budget:      4/5    # can they pay the tier
score:       76     # computed, see Scoring
stage:       prospect   # prospect → qualified → contacted → trial → won → lost
next:        Owner approves intro; then send the funnel email variant for FinTech
sources:
  - {claim: "Series B Jan 2026", url: "https://..."}
  - {claim: "no sourcing on calls", url: "https://..."}
owner_gate:  true    # contact only after the owner says yes
---
Notes: anything that does not fit a field — objections, competitors they use today, the exact line of their product our Signals record beats.
```

**The eight required fields, defined**
- **Why** — the specific pain our offer removes, in one line. If you cannot name it, it is not a prospect.
- **What** — the one surface to sell them first (API tier / Signals / a Tmpltz offer). One, not a menu.
- **When** — the moment and the **trigger** that makes now better than later (funding, a hire, a rule change, a public complaint).
- **How** — the approach path (warm intro > referral > direct), and the first concrete step.
- **Where** — sector, geography, and the **source channel** you found them through (so the list is reproducible).
- **How much** — the plan, its price, and an ARR estimate marked `est.` until there is a signed figure.
- **Who** — the buyer and a public business contact only.
- **Score** — the computed rank (below).

## Where prospects come from (grounded, reproducible)

Start from what the institute already knows, not a cold web crawl:
- `research/reports/Catalogue 5M.dc.html` — 50 service offers across 16 sectors with market sizes; each row implies a buyer class.
- The `/v1` personas (`apps/engine/v1.py`) — scholar, journalist, corporate, government, developer: each is a segment with a different pitch.
- Tmpltz offers (`apps/site/src/Tmpltz.dc.html`) — findings turned into services; the firms those services target.
- Published Signals and the Landscape report — who cited, asked, or pushed back is a warm list.
Only then widen with public directories, filings and careers pages — each addition sourced.

## Scoring (so the list ranks itself)

`score = 20·fit + 15·intent + 10·reach + 5·budget` (each sub-score 0–5 → max 250, normalize to 100). Rank the list by score; work the top
decile first. A prospect with `intent ≤ 1` is parked, not deleted — the trigger may arrive. Re-score when a `when` trigger fires.

## The master list

`marketing/clients/_index.md` is a table generated from the per-prospect files: `name · sector · what · when · score · stage · next`. It is the
owner's one screen: sorted by score, filtered by stage. Never hand-edit a number here that disagrees with a prospect file — the files are the truth.

## Workflow

1. **Find** — pull candidates from the grounded sources above; one file per prospect, slug and sources first.
2. **Enrich** — fill the eight fields; every assertion sourced or marked `est.`.
3. **Qualify** — set fit/intent/reach/budget; compute score; set stage to `qualified` at score ≥ 60.
4. **Rank** — regenerate `_index.md`; the owner reviews the top of the list.
5. **Draft** — pick the surface (`what`) and the matching outreach (e.g. `marketing/funnel-email.html`, segment variant); never send yet.
6. **Owner gate** — the owner approves specific prospects; `owner_gate:false` only after that.
7. **Track** — advance `stage` on each real event; record the date and source; a `lost` keeps its reason.

## Guardrails

- Business contacts only, already public; honor opt-outs and the unsubscribe path in the funnel email (CASL/CAN-SPAM).
- No invented emails, revenues or headcounts — `est.` or a source, never a bare number.
- The agent proposes; the owner decides who is contacted and what is sent. Outreach that moves money or makes a claim about a named company is a `needs_owner` item.
