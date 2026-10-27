"""Train the LSTM rung on retrieved lookups: three facts about a subject, then a query; is the query among them?
Prints held-out accuracy next to chance. It measures this substrate on a toy task; the grid runs in anima/anima-harness."""
import time

import numpy as np

from lstm_substrate import LSTMSubstrate

t0 = time.perf_counter()
rng = np.random.default_rng(0)
rels, nodes = [f"r{i}" for i in range(4)], [f"n{i}" for i in range(12)]


class Shown:
    condition, rules = "Q", []

    def __init__(self, facts):
        self.facts = facts

    def lookup(self, node):
        return [f for f in self.facts if f[1] == node]


def task():
    x = str(rng.choice(nodes))
    facts = [(str(rng.choice(rels)), x, str(rng.choice(nodes))) for _ in range(3)]
    if rng.random() < 0.5:
        r, _, y = facts[int(rng.integers(3))]
        return {"rel": r, "x": x, "y": y}, Shown(facts), True
    while True:
        q = {"rel": str(rng.choice(rels)), "x": x, "y": str(rng.choice(nodes))}
        if (q["rel"], x, q["y"]) not in facts:
            return q, Shown(facts), False


train, test = [task() for _ in range(400)], [task() for _ in range(200)]
sub = LSTMSubstrate(hidden=24, seed=0, hops=1)
loss = sub.fit(train, epochs=12, lr=0.02, batch=16)
acc = sum(sub.answer(q, c) == y for q, c, y in test) / len(test)
print(f"loss {loss[0]:.3f} -> {loss[-1]:.3f} over {len(loss)} epochs")
print(f"held-out accuracy {acc:.2f} on {len(test)} lookups (chance 0.50)")
print(f"done in {time.perf_counter() - t0:.2f}s")
