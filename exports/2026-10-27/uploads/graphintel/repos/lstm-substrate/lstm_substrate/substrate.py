"""The LSTM rung: reads what the condition shows, then the query, and answers yes or no.

Under Q and X it asks the context for the facts within hops of the query's subject, the way Bridago serves a lookup,
plus the rules; under C it reads the whole serialized seed; unseeded it reads the query alone. The harness protocol is
one method: answer(query, context) -> bool.
"""
import json

import numpy as np

from .lstm import LSTM, Adam

SPECIALS = ("<pad>", "<unk>", "<f>", "<r>", "<q>")


class LSTMSubstrate:
    name = "lstm"

    def __init__(self, hidden: int = 32, seed: int = 0, hops: int = 2, max_facts: int = 32):
        self.hidden, self.seed, self.hops, self.max_facts = hidden, seed, hops, max_facts
        self.vocab = {t: i for i, t in enumerate(SPECIALS)}
        self.net = None

    def tokens(self, q: dict, ctx=None) -> list:
        facts, rules = [], []
        if ctx is not None and getattr(ctx, "condition", "0") != "0":
            text = getattr(ctx, "text", None)
            if text:
                for line in text.splitlines():
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    if row[0] == "rule":
                        rules.append(tuple(row[1:]))
                    else:
                        facts.append(tuple(row))
            else:
                frontier, seen = [q["x"]], set()
                for _ in range(self.hops):
                    nxt = []
                    for node in frontier:
                        if node not in seen:
                            seen.add(node)
                            for f in ctx.lookup(node):
                                facts.append(tuple(f))
                                nxt.append(f[2])
                    frontier = nxt
                facts = facts[: self.max_facts]
                rules = [tuple(r) for r in getattr(ctx, "rules", [])]
        out = []
        for r in rules:
            out += ["<r>", *r]
        for f in facts:
            out += ["<f>", *f]
        return out + ["<q>", q["rel"], q["x"], q["y"]]

    def ids(self, toks: list, grow: bool = False) -> list:
        out = []
        for t in toks:
            if grow and t not in self.vocab:
                self.vocab[t] = len(self.vocab)
            out.append(self.vocab.get(t, 1))
        return out

    def fit(self, examples, epochs: int = 10, lr: float = 0.01, batch: int = 16) -> list:
        """examples: (query, context, label) triples. Returns the mean loss of each epoch."""
        seqs = [self.ids(self.tokens(q, c), grow=True) for q, c, _ in examples]
        return self.fit_sequences(seqs, [1.0 if y else 0.0 for _, _, y in examples], epochs, lr, batch)

    def fit_sequences(self, seqs, labels, epochs: int = 10, lr: float = 0.01, batch: int = 16) -> list:
        vocab = max(len(self.vocab), 1 + max(max(s) for s in seqs if s))
        if self.net is None or self.net.V < vocab:
            self.net = LSTM(vocab, self.hidden, self.seed)
        opt, rng, history = Adam(self.net.p, lr), np.random.default_rng(self.seed), []
        for _ in range(epochs):
            order, total = rng.permutation(len(seqs)), 0.0
            for k in range(0, len(order), batch):
                chunk, grads = order[k:k + batch], None
                for j in chunk:
                    loss, g = self.net.loss_grad(seqs[j], labels[j])
                    total += loss
                    grads = g if grads is None else {n: grads[n] + g[n] for n in g}
                opt.step({n: np.clip(v / len(chunk), -5.0, 5.0) for n, v in grads.items()})
            history.append(total / len(seqs))
        return history

    def score(self, q: dict, ctx=None) -> float:
        if self.net is None:
            raise RuntimeError("fit the substrate before asking it")
        return float(self.net.forward(self.ids(self.tokens(q, ctx)))[0])

    def answer(self, q: dict, ctx=None) -> bool:
        return bool(self.score(q, ctx) > 0.5)
