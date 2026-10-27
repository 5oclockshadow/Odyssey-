---
name: neuroplasticity
intro: Keep learning healthy — bounded Hebbian plasticity + a correct, converging Q-table, both observable.
---

The graph learns. Keep that learning stable, not runaway or dead.

## Hebbian (coactivation edges)
- Strengthen co-active edges by a learning rate; **decay** unused ones.
- Bug class to fix: weights saturating to a ceiling or vanishing to zero.
  Enforce: clamp weights to [wmin, wmax]; **renormalize per node neighbourhood**
  (so one hub can't swallow all weight); apply decay on every round, not only on
  use. Add tests: after many coactivations a weight stays in-bounds; an unused
  edge decays; total neighbourhood weight is conserved within tolerance.

## Q-table (model/action selection)
- Verify reward shaping (success, latency, cost → a bounded reward), the update
  rule (learning rate, discount), and **exploration decay** (epsilon shrinks over
  time; never 0 so it can recover). Fix greedy-collapse (stuck on one action) and
  never-exploits (epsilon too high). Add convergence tests: on a stationary
  reward the best action wins within N updates; a regime change is re-learned.

## Observability (required)
Expose weights/rewards/epsilon on the graph and a metrics panel (per-state Q
values, edge-weight histogram, exploration rate over time) so plasticity is
visible, not a black box. Wire to the 4D brain cascade so activation is seen.

## Done when
Plasticity tests pass, no saturation/collapse under stress, and the metrics
panel shows healthy, bounded, converging learning on live data.
