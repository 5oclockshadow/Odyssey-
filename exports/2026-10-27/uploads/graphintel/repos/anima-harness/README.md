# anima/anima-harness

The full Anima experiment: one cell, one row.

One of the hundred repos from one seeded brain at [The Threshold Institute](http://localhost/). Harness · eval · wave W0 · open.

## Finding

The plan is a grid: substrate rung × seed condition (unseeded, in context, by retrieval, shuffled) × seed quality × schema depth, with one results row per cell. Cells are only comparable if each runs the same tasks the same way, so the harness owns task generation, what each condition shows the substrate, and scoring: observed and inferred reachability, schema validity, constraint violations, tokens and CPU time.

## Hypothesis

H0, the headline: seeded by retrieval with a curated seed, every rung from 30B down to an LSTM stays within 5 points of the 30B model. Refuted if any rung falls more than 5 points below it. The harness computes the H0, H4 and H5 verdicts from rows. Its stub rungs only bound the grid (graph is the ceiling, floor is chance); results come from model rungs.

## Quickstart

```
docker compose up
```

Without docker:

```
pip install -r requirements.txt -e . && python examples/quickstart.py
```

## Use

```python
from anima_harness import Cell, run_cell, write_row
from anima_harness.substrates import Graph

row = run_cell(Cell("graph", condition="Q", depth=3, seed=4, n=200), Graph())
write_row(row, "results.jsonl")
```

One cell from the shell: `python -m anima_harness --rung graph --condition X --depth 2`. A model rung over any OpenAI-compatible server: `--rung http:8b@http://small-fast:8000#<model>`.

## Tests

`pytest -q` runs everything with no network and no model.

## Links

- The institute: http://localhost/
- The public graph: http://localhost/#/graph
- Research: `research/reports/Seeded Substrate Plan v4.dc.html`

## Licence

MIT. See LICENSE.
