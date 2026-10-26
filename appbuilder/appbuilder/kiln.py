"""Kiln engine — multi-variant generation (gen A/B/C/D) + pick-best.

Kiln is the same self-building/self-improving/SOC2/Tester backend as the Studio,
but its generation step fires several variant generators in parallel and keeps
the best — so a Kiln build typically satisfies more criteria per round (best of
four) and passes in fewer rounds. It plugs into the identical check / SOC 2 /
learning / recorder loop; only the generator differs.
"""
from __future__ import annotations

from typing import Iterable

# Four generators, each biased toward a different slice of the criteria, so the
# union across variants covers more than any single generator would.
GENERATORS = ("gen-a", "gen-b", "gen-c", "gen-d")


def _variant(gen: str, criteria: list[str], learned: set[str]) -> set[str]:
    """One variant's realized criteria: the base two + a generator-specific
    slice + everything the learned rules cover."""
    base = set(criteria[:2])
    # deterministic per-generator slice of the remaining criteria
    rest = criteria[2:]
    idx = GENERATORS.index(gen) if gen in GENERATORS else 0
    slice_ = set(rest[idx::len(GENERATORS)])  # a,b,c,d take strided subsets
    return base | slice_ | (learned & set(criteria))


def generate(criteria: list[str], learned: set[str]) -> dict:
    """Run all generators, keep the variant with the most realized criteria.
    Returns the picked artifact plus the per-variant coverage (for the UI)."""
    variants = {g: _variant(g, criteria, learned) for g in GENERATORS}
    best = max(variants, key=lambda g: len(variants[g]))
    return {"realized": variants[best], "picked": best,
            "variants": {g: sorted(v) for g, v in variants.items()}}
