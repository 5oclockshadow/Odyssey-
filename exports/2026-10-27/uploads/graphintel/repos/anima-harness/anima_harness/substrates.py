"""Stub rungs that bound the grid without a model. graph answers exactly from what the condition shows: the ceiling.
floor always says no, which scores the share of false tasks. coin is a fair coin. Model rungs live in remote.py."""
import json

from seedgen import Stream


class Graph:
    name = "graph"

    def __init__(self):
        self._parsed = (None, None)

    def _from_text(self, text):
        if self._parsed[0] is not text:
            by, rules = {}, []
            for line in text.splitlines():
                row = json.loads(line) if line else None
                if row and row[0] == "rule":
                    rules.append(tuple(row[1:]))
                elif row:
                    by.setdefault(row[1], []).append(tuple(row))
            self._parsed = (text, (by, rules))
        return self._parsed[1]

    def answer(self, q, ctx):
        if ctx.condition == "0":
            return False
        if ctx.text is not None:
            by, rules = self._from_text(ctx.text)
            lookup = lambda node: by.get(node, [])
        else:
            lookup, rules = ctx.lookup, ctx.rules
        made = {c: (a, b) for a, b, c in rules}
        memo = {}

        def reach(rel, x):
            if (rel, x) in memo:
                return memo[(rel, x)]
            memo[(rel, x)] = set()                       # a cycle in hand-written rules cannot recurse forever
            if rel in made:
                a, b = made[rel]
                out = {z for y in reach(a, x) for z in reach(b, y)}
            else:
                out = {y for r, _, y in lookup(x) if r == rel}
            memo[(rel, x)] = out
            return out

        return q["y"] in reach(q["rel"], q["x"])


class Floor:
    name = "floor"

    def answer(self, q, ctx):
        return False


class Coin:
    name = "coin"

    def __init__(self, seed: int = 0):
        self.s = Stream(seed)

    def answer(self, q, ctx):
        return self.s.below(2) == 1


RUNGS = {"graph": Graph, "floor": Floor, "coin": Coin}
