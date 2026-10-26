---
name: studio-mandate
intro: Ability-Based App Builder (Skilld Studio) + Kiln — self-building, self-improving, SOC2, Tester-verified backend.
---
Build apps across 14 formats. A build PASSES only when every check (e2e + format
+ soc2) passes; otherwise it runs another fix round applying rules LEARNED from
failed checks, so pass-rate rises (academy = 130-round curriculum). Every step is
recorded (replay, version-swapping). SOC 2 evidence per build (CC6.1/6.6/7.2/7.4/
8.1/4.1); a build isn't ready until criteria are met. The Tester runs audit +
chaos (verifies controls catch an unapproved apply) and proposes patches that
NEVER apply without approval (CC8.1). Kiln = the same backend with best-of-four
variant generation. Reuses the framework's control + recorder + osiiso.
Non-negotiables: typed boundaries, no mocks, tests incl. error injection, dual
telemetry, continuous-optimization (reduce LOC, speed, smooth UX).
