"""The plan's hypotheses as functions over results rows. They grade rows; they never make them."""


def _acc(rows, **match):
    xs = [r["accuracy"] for r in rows if r.get("accuracy") is not None and all(r["cell"].get(k) == v for k, v in match.items())]
    return sum(xs) / len(xs) if xs else None


def h0(rows, top="30b", tol=0.05):
    """Seeded by retrieval with a curated seed, every rung stays within tol of the top rung. Refuted if any falls further."""
    ref = _acc(rows, rung=top, condition="Q", quality="curated")
    if ref is None:
        return {"id": "H0", "verdict": "no data", "detail": f"no Q, curated rows for {top}"}
    gaps = {}
    for rung in sorted({r["cell"]["rung"] for r in rows} - {top}):
        a = _acc(rows, rung=rung, condition="Q", quality="curated")
        if a is not None:
            gaps[rung] = round(ref - a, 4)
    if not gaps:
        return {"id": "H0", "verdict": "no data", "detail": "only the top rung has rows"}
    worst = max(gaps, key=gaps.get)
    return {"id": "H0", "verdict": "refuted" if gaps[worst] > tol else "holds", "gaps": gaps, "worst": worst}


def h4(rows, rung="lstm", tol=0.05):
    """The LSTM signature: fails unseeded and in context, passes by retrieval. Refuted if C is about Q, or Q about unseeded."""
    q, c, z = (_acc(rows, rung=rung, condition=k) for k in ("Q", "C", "0"))
    if None in (q, c, z):
        return {"id": "H4", "verdict": "no data"}
    refuted = abs(c - q) <= tol or abs(q - z) <= tol
    return {"id": "H4", "verdict": "refuted" if refuted else "holds", "Q": round(q, 4), "C": round(c, 4), "0": round(z, 4)}


def h5(rows, rung=None, keep=0.20):
    """The shuffled seed removes at least 80% of the gain. Refuted if X keeps more than 20% of the Q minus unseeded gain."""
    m = {} if rung is None else {"rung": rung}
    q, x, z = (_acc(rows, condition=k, **m) for k in ("Q", "X", "0"))
    if None in (q, x, z):
        return {"id": "H5", "verdict": "no data"}
    if q - z <= 0:
        return {"id": "H5", "verdict": "no gain to keep", "gain": round(q - z, 4)}
    kept = (x - z) / (q - z)
    return {"id": "H5", "verdict": "refuted" if kept > keep else "holds", "kept": round(kept, 4)}
