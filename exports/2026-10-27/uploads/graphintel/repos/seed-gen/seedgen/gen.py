"""Typed hypergraph seeds, reproducible from one integer.

A seed has five blocks: types (a tree of bounded depth), signatures (binary relations with a domain and a range type),
incidence (nodes and hyperedges), constraints (Horn rules that compose two relations into a derived one) and energy
(a weight on every hyperedge and rule). The generator draws from its own splitmix64 stream, so the same integer gives
the same seed, byte for byte, on any machine and in any language that implements the stream.
"""
import hashlib
import json

FORMAT = "anima.seed/1"
BLOCKS = ("types", "signatures", "incidence", "constraints", "energy")
MASK = (1 << 64) - 1


class Stream:
    """splitmix64. From 0 the first three outputs are 0xe220a8397b1dcdaf, 0x6e789e6aa1b965f4, 0x06c45d188009454f."""

    def __init__(self, seed: int):
        self.x = int(seed) & MASK

    def next(self) -> int:
        self.x = (self.x + 0x9E3779B97F4A7C15) & MASK
        z = self.x
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK
        return z ^ (z >> 31)

    def below(self, n: int) -> int:
        return self.next() % n

    def pick(self, seq):
        return seq[self.below(len(seq))]

    def unit(self) -> float:
        return (self.next() >> 11) / float(1 << 53)


def _types(s: Stream, n: int, depth: int) -> list:
    out = [{"id": "t0", "parent": None, "level": 0}]
    for i in range(1, n):
        parent = out[i - 1] if i <= depth else s.pick([t for t in out if t["level"] < depth])   # a spine first, so the tree reaches depth
        out.append({"id": f"t{i}", "parent": parent["id"], "level": parent["level"] + 1})
    return out


def _ancestors(types: list) -> dict:
    by = {t["id"]: t for t in types}
    up = {}
    for t in types:
        chain, p = [t["id"]], t["parent"]
        while p is not None:
            chain.append(p)
            p = by[p]["parent"]
        up[t["id"]] = chain
    return up


def members(seed: dict) -> dict:
    """Every type and the nodes that belong to it, directly or through a subtype."""
    up = _ancestors(seed["types"])
    out = {t["id"]: [] for t in seed["types"]}
    for n in seed["nodes"]:
        for t in up[n["type"]]:
            out[t].append(n["id"])
    return out


def generate(seed: int, depth: int = 3, types: int = 8, relations: int = 6, nodes: int = 60,
             edges: int = 90, rules: int = 4, nary: float = 0.25) -> dict:
    """One seed from one integer. Raises ValueError for parameters that cannot make a valid seed."""
    if depth < 1:
        raise ValueError("depth must be at least 1")
    if types < depth + 1:
        raise ValueError("types must be at least depth + 1 so the tree can reach that depth")
    if nodes < 4 or relations < 1 or edges < 1:
        raise ValueError("a seed needs at least 4 nodes, 1 relation and 1 edge")
    if not 0.0 <= nary < 1.0:
        raise ValueError("nary is the share of n-ary hyperedges, in [0, 1)")
    s = Stream(seed)
    ts = _types(s, types, depth)
    ns = [{"id": f"n{i}", "type": s.pick(ts)["id"]} for i in range(nodes)]
    mem, up = members({"types": ts, "nodes": ns}), _ancestors(ts)
    filled = [t["id"] for t in ts if mem[t["id"]]]
    rels = [{"id": f"r{i}", "kind": "base", "domain": s.pick(filled), "range": s.pick(filled), "height": 0} for i in range(relations)]
    hes, seen, tries = [], set(), 0
    want = max(1, round(edges * (1 - nary)))
    while len(hes) < want and tries < edges * 40:
        tries += 1
        r = s.pick(rels)
        x, y = s.pick(mem[r["domain"]]), s.pick(mem[r["range"]])
        if x != y and (r["id"], x, y) not in seen:
            seen.add((r["id"], x, y))
            hes.append({"id": f"e{len(hes)}", "rel": r["id"], "members": [x, y]})
    tries = 0
    while len(hes) < edges and tries < edges * 40:
        tries += 1
        group = sorted({s.pick(ns)["id"] for _ in range(3 + s.below(2))}, key=lambda v: int(v[1:]))
        if len(group) >= 3 and ("group", *group) not in seen:
            seen.add(("group", *group))
            hes.append({"id": f"e{len(hes)}", "rel": "group", "members": group})
    rs, tries = [], 0
    while len(rs) < rules and tries < rules * 60:
        tries += 1
        pool = [r for r in rels if r["height"] < depth]
        a, b = s.pick(pool), s.pick(pool)
        if a["range"] in up[b["domain"]] or b["domain"] in up[a["range"]]:      # the middle node can belong to both
            d = {"id": f"d{len(rs)}", "kind": "derived", "domain": a["domain"], "range": b["range"], "height": max(a["height"], b["height"]) + 1}
            rels.append(d)
            rs.append({"id": f"h{len(rs)}", "if": [a["id"], b["id"]], "then": d["id"]})
    energy = {"edges": {e["id"]: round(0.5 + 0.5 * s.unit(), 4) for e in hes}, "rules": {r["id"]: round(0.5 + 0.5 * s.unit(), 4) for r in rs}}
    return {"format": FORMAT, "seed": int(seed),
            "params": {"depth": depth, "types": types, "relations": relations, "nodes": nodes, "edges": edges, "rules": rules, "nary": nary},
            "types": ts, "signatures": rels, "nodes": ns, "hyperedges": hes, "constraints": rs, "energy": energy}


def facts(seed: dict) -> set:
    """The observed binary facts: (relation, x, y) for every two-member hyperedge."""
    return {(e["rel"], e["members"][0], e["members"][1]) for e in seed["hyperedges"] if len(e["members"]) == 2}


def derive(seed: dict) -> list:
    """Every fact the constraints entail and the seed does not state, by naive forward chaining to a fixpoint."""
    base = facts(seed)
    have = set(base)
    rules = [(r["if"][0], r["if"][1], r["then"]) for r in seed.get("constraints", [])]
    changed = True
    while changed:
        changed = False
        by_rel = {}
        for f in have:
            by_rel.setdefault(f[0], []).append(f)
        for a, b, c in rules:
            right = {}
            for _, y, z in by_rel.get(b, []):
                right.setdefault(y, []).append(z)
            for _, x, y in by_rel.get(a, []):
                for z in right.get(y, []):
                    if (c, x, z) not in have:
                        have.add((c, x, z))
                        changed = True
    return sorted(have - base)


def minimal(seed: dict) -> dict:
    """The minimal seed quality: incidence and types only (Plan v4, section 07)."""
    return {k: seed[k] for k in ("format", "seed", "params", "types", "nodes", "hyperedges")}


def canonical(seed: dict) -> str:
    return json.dumps(seed, sort_keys=True, separators=(",", ":"))


def digest(seed: dict) -> str:
    """A 16-hex fingerprint of the canonical JSON: equal digests, equal seeds."""
    return hashlib.sha256(canonical(seed).encode()).hexdigest()[:16]
