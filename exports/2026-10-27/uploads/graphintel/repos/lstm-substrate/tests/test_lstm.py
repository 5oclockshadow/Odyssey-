import numpy as np

from lstm_substrate import LSTM, LSTMSubstrate


def test_gradients_match_finite_differences():
    net = LSTM(vocab=5, hidden=3, seed=1)
    seq, label = [0, 3, 1, 4, 2], 1.0
    _, g = net.loss_grad(seq, label)
    for name, P in net.p.items():
        for idx in np.ndindex(P.shape):
            old = P[idx]
            P[idx] = old + 1e-5
            up, _ = net.loss_grad(seq, label)
            P[idx] = old - 1e-5
            down, _ = net.loss_grad(seq, label)
            P[idx] = old
            num = (up - down) / 2e-5
            assert abs(num - g[name][idx]) <= 1e-6 + 1e-4 * abs(num), (name, idx)


def _contains(rng, n, length=6, token=3):
    seqs, labels = [], []
    for _ in range(n):
        s = [int(v) for v in rng.choice([0, 1, 2, 4, 5], size=length)]
        y = bool(rng.random() < 0.5)
        if y:
            s[int(rng.integers(length))] = token
        seqs.append(s)
        labels.append(1.0 if y else 0.0)
    return seqs, labels


def test_learns_whether_a_token_appears():
    rng = np.random.default_rng(0)
    train, test = _contains(rng, 160), _contains(rng, 80)
    sub = LSTMSubstrate(hidden=8, seed=0)
    loss = sub.fit_sequences(*train, epochs=15, lr=0.05, batch=8)
    assert loss[-1] < loss[0]
    hits = sum((float(sub.net.forward(s)[0]) > 0.5) == (y == 1.0) for s, y in zip(*test))
    assert hits / len(test[0]) >= 0.85


class Shown:
    def __init__(self, condition, facts=(), rules=(), text=None):
        self.condition, self.rules, self.text, self._facts = condition, list(rules), text, list(facts)

    def lookup(self, node):
        return [f for f in self._facts if f[1] == node]


def test_reads_the_facts_the_condition_shows_then_the_query():
    q = {"rel": "r0", "x": "a", "y": "c"}
    facts = [("r0", "a", "b"), ("r1", "b", "c"), ("r1", "z", "q")]
    sub = LSTMSubstrate(hops=2)
    assert sub.tokens(q, Shown("0", facts)) == ["<q>", "r0", "a", "c"]
    toks = sub.tokens(q, Shown("Q", facts, rules=[("r0", "r1", "d0")]))
    assert toks[:4] == ["<r>", "r0", "r1", "d0"] and toks[-4:] == ["<q>", "r0", "a", "c"]
    assert toks[4:8] == ["<f>", "r0", "a", "b"] and toks[8:12] == ["<f>", "r1", "b", "c"] and "z" not in toks
    text = '["r0", "a", "b"]\n["rule", "r0", "r1", "d0"]'
    assert sub.tokens(q, Shown("C", text=text)) == ["<r>", "r0", "r1", "d0", "<f>", "r0", "a", "b", "<q>", "r0", "a", "c"]


def test_answers_are_python_booleans_and_reproducible():
    q, ctx = {"rel": "r0", "x": "a", "y": "b"}, Shown("Q", [("r0", "a", "b")])
    ex = [(q, ctx, True), ({"rel": "r0", "x": "a", "y": "z"}, ctx, False)] * 8
    a, b = LSTMSubstrate(hidden=4, seed=3), LSTMSubstrate(hidden=4, seed=3)
    a.fit(ex, epochs=3)
    b.fit(ex, epochs=3)
    assert type(a.answer(q, ctx)) is bool
    assert a.score(q, ctx) == b.score(q, ctx)
