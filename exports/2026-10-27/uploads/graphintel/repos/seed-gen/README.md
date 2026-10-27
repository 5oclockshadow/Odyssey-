# anima/seed-gen

Generate hypergraph seeds at any size and depth, reproducible from one integer.

One of the hundred repos from one seeded brain at [The Threshold Institute](http://localhost/). Seed · Rex · wave W0 · open.

## Finding

Every claim in the Seeded Substrate Plan compares a seeded run with an unseeded or shuffled one, and that comparison only means something if the seed can be rebuilt exactly. Phase P2 of the plan names the generator, the shuffle control and retrieval as the first things to build and test. This generator draws from its own splitmix64 stream, so one integer gives the same seed, byte for byte, anywhere.

## Hypothesis

H7 in the plan: seed quality, from minimal to curated, moves accuracy more than substrate size does from 30B to an LSTM. Refuted if the size effect is larger than the seed-quality effect. This repo makes the minimal and generated qualities reproducible from one integer; a curated seed is a generated one reviewed by hand.

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
from seedgen import derive, digest, generate

seed = generate(7, depth=3)   # same integer, same seed, on any machine
digest(seed)                  # 16-hex fingerprint of the canonical JSON
derive(seed)                  # every fact the Horn rules entail and the seed does not state
```

`seedgen --seed 7 --depth 3 --summary` prints the counts and the digest.

## Tests

`pytest -q` runs everything with no network and no model.

## Links

- The institute: http://localhost/
- The public graph: http://localhost/#/graph
- Research: `research/reports/Seeded Substrate Plan v4.dc.html`

## Licence

MIT. See LICENSE.
