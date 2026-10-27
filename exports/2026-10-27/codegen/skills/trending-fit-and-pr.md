---
name: trending-fit-and-pr
intro: Find high-fit trending GitHub repos, star them (notify after), and ship expert PRs (tests+README+PRD+roadmap).
---

## Trending-GitHub fit engine
- Pull trending repos (read-only API). Score **fit** against the operator's
  profile: languages, topics, stars/history, and the graph's current interests
  (recall over the brain). Rank; keep a transparent fit score + reasons.
- **Star the high-fit repos on the operator's account**, then **notify after the
  fact** with a digest (what was starred, why, fit score). GATED: DRY-RUN first,
  respect rate limits + an allow/deny list; never silent, never before the
  operator enables the gate.
- From the fits, generate the **50 most impactful jobs** (clear title, rationale,
  impact estimate). Each becomes a real PR.

## Expert PR authoring (every change)
A PR is done to an expert standard or not at all:
- **Branch** correctly scoped (`feat/…`, `fix/…`), one concern per PR.
- **Real test suite**: success + edge + error-injection; all green in CI.
- **README** update for the change; a **PRD** section (what/why/scope).
- **Body**: summary, rationale, test evidence, **merge roadmap** + **post-merge**
  steps, risk/rollback. Mirror any repo PR template.
- Re-request review after pushing; resolve threads; keep CI green.

## Post-merge
Tag a release, regenerate the HTML context report, run the Tester's full cycle
against merged main, open the next job's branch. Propose venue direction
(see docs/PRD-self-build.md §5) when a batch of jobs completes.

## Rule
Outward actions (starring, opening PRs) are always gated + notify-after. Quality
and maintainer trust over volume.
