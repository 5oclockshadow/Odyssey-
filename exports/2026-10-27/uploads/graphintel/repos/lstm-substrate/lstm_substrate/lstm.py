"""A single-layer LSTM classifier in numpy: forward pass, backpropagation through time and Adam. float64, CPU, no framework."""
import numpy as np


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


class LSTM:
    """One-hot tokens in, one probability out: p(yes) = sigmoid(w . h_T + c)."""

    def __init__(self, vocab: int, hidden: int = 32, seed: int = 0):
        rng = np.random.default_rng(seed)
        s = 1.0 / np.sqrt(hidden)
        self.V, self.H = vocab, hidden
        self.p = {"Wx": rng.uniform(-s, s, (4 * hidden, vocab)), "Wh": rng.uniform(-s, s, (4 * hidden, hidden)),
                  "b": np.zeros(4 * hidden), "w": rng.uniform(-s, s, hidden), "c": np.zeros(1)}
        self.p["b"][hidden:2 * hidden] = 1.0          # the forget gate starts open: remember by default

    def forward(self, seq):
        H, p = self.H, self.p
        h, c, cache = np.zeros(H), np.zeros(H), []
        for t in seq:
            z = p["Wx"][:, t] + p["Wh"] @ h + p["b"]
            i, f, o, g = sigmoid(z[:H]), sigmoid(z[H:2 * H]), sigmoid(z[2 * H:3 * H]), np.tanh(z[3 * H:])
            c2 = f * c + i * g
            cache.append((t, h, c, i, f, o, g, c2))
            h, c = o * np.tanh(c2), c2
        return sigmoid(p["w"] @ h + p["c"][0]), h, cache

    def loss_grad(self, seq, label: float):
        """Binary cross-entropy and its gradient for every parameter."""
        H, p = self.H, self.p
        y, h, cache = self.forward(seq)
        loss = -(label * np.log(y + 1e-12) + (1.0 - label) * np.log(1.0 - y + 1e-12))
        dy = y - label
        g = {k: np.zeros_like(v) for k, v in p.items()}
        g["w"] += dy * h
        g["c"] += dy
        dh, dc = dy * p["w"], np.zeros(H)
        for t, h0, c0, i, f, o, gg, c2 in reversed(cache):
            tc = np.tanh(c2)
            do = dh * tc
            dc = dc + dh * o * (1.0 - tc ** 2)
            dz = np.concatenate([dc * gg * i * (1.0 - i), dc * c0 * f * (1.0 - f), do * o * (1.0 - o), dc * i * (1.0 - gg ** 2)])
            g["Wx"][:, t] += dz
            g["Wh"] += np.outer(dz, h0)
            g["b"] += dz
            dh, dc = p["Wh"].T @ dz, dc * f
        return float(loss), g


class Adam:
    def __init__(self, params: dict, lr: float = 0.01, b1: float = 0.9, b2: float = 0.999, eps: float = 1e-8):
        self.p, self.lr, self.b1, self.b2, self.eps, self.t = params, lr, b1, b2, eps, 0
        self.m = {k: np.zeros_like(v) for k, v in params.items()}
        self.v = {k: np.zeros_like(v) for k, v in params.items()}

    def step(self, grads: dict):
        self.t += 1
        for k, g in grads.items():
            self.m[k] = self.b1 * self.m[k] + (1 - self.b1) * g
            self.v[k] = self.b2 * self.v[k] + (1 - self.b2) * g * g
            mh, vh = self.m[k] / (1 - self.b1 ** self.t), self.v[k] / (1 - self.b2 ** self.t)
            self.p[k] -= self.lr * mh / (np.sqrt(vh) + self.eps)
