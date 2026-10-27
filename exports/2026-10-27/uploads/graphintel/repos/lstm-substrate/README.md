# anima/lstm-substrate

An LSTM that plugs into Bridago as a substrate, CPU only.

One of the hundred repos from one seeded brain at [The Threshold Institute](http://localhost/). Substrates · wave W0 · open.

## Finding

Fixed-size recurrent state loses at associative recall from context (Arora et al., Zoology, 2023), and recurrent networks need retrieval to match transformers at in-context retrieval. In the Anima design the structure lives in the graph and Bridago serves the few facts a query needs, so the recurrent model reads a short retrieved context instead of recalling from a long one. Its state is fixed per step, so a long seed costs once.

## Hypothesis

H3 and H4 in the plan. H3: by retrieval, the LSTM stays within 5 points of a tiny transformer on inferred reachability at ten times lower CPU cost per item; refuted if it trails by more than 5 points. H4: the LSTM fails unseeded and in context but passes by retrieval; refuted if in-context is about equal to retrieval, or retrieval about equal to unseeded.

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
from lstm_substrate import LSTMSubstrate

sub = LSTMSubstrate(hidden=32)
sub.fit(examples)            # (query, context, label) triples
sub.answer(query, context)   # True or False: the anima/anima-harness protocol
```

## Tests

`pytest -q` runs everything with no network and no model.

## Links

- The institute: http://localhost/
- The public graph: http://localhost/#/graph
- Research: `research/reports/Seeded Substrate Plan v4.dc.html`

## Licence

MIT. See LICENSE.
