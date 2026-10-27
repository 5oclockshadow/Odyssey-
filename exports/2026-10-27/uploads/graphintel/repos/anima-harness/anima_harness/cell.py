"""One cell of the Anima grid, one results row.

A cell is a substrate rung, a seed condition, a seed quality, a schema depth, a generator seed and a task count.
Conditions (Seeded Substrate Plan v4, section 07): "0" unseeded, the task only; "C" the seed serialized into the context;
"Q" the seed in the graph, answered through lookups; "X" Q over a shuffled seed, the control. Qualities: "minimal"
(types and incidence), "generated" (all five blocks), "curated" (a reviewed seed passed in). Ground truth always comes
from the full seed; the condition and the quality only change what the substrate is shown.
"""
import json
import time
from dataclasses import asdict, dataclass

from seedgen import Stream, derive, digest, facts, generate, members, minimal

VERSION = "0.1.0"
CONDITIONS = ("0", "C", "Q", "X")
QUALITIES = ("minimal", "generated", "curated")


@dataclass(frozen=True)
class Cell:
    rung: str
    condition: str = "Q"
    quality: str = "generated"
    depth: int = 3
    seed: int = 0
    n: int = 200

    def __post_init__(self):
        if self.condition not in CONDITIONS:
            raise ValueError(f"condition must be one of {CONDITIONS}")
        if self.quality not in QUALITIES:
            raise ValueError(f"quality must be one of {QUALITIES}")
        if self.n < 8:
            raise ValueError("a cell needs at least 8 tasks")


def shuffle(seed: dict, stream: Stream) -> dict:
    """The X control: same nodes, edges and degrees, endpoints permuted, so the structure is gone and the volume is not.
    Fisher-Yates over every member slot; anima/seed-shuffle is the type-preserving version."""
    slots = [m for e in seed["hyperedges"] for m in e["members"]]
    for i in range(len(slots) - 1, 0, -1):
        j = stream.below(i + 1)
        slots[i], slots[j] = slots[j], slots[i]
    out, k, hes = dict(seed), 0, []
    for e in seed["hyperedges"]:
        hes.append({**e, "members": slots[k:k + len(e["members"])]})
        k += len(e["members"])
    out["hyperedges"] = hes
    return out


def make_tasks(seed: dict, n: int, stream: Stream) -> list:
    """Half observed, half inferred; each true task is paired with a false one. Some false ones break a signature:
    answering yes to those is a constraint violation."""
    mem = members(seed)
    base, inferred = sorted(facts(seed)), derive(seed)
    known = set(base) | set(inferred)
    node_ids = [x["id"] for x in seed["nodes"]]

    def negative(rels, kind):
        for _ in range(200):
            r = stream.pick(rels)
            typed = stream.below(10) != 0
            if typed:
                x, y = stream.pick(mem[r["domain"]]), stream.pick(mem[r["range"]])
            else:
                x, y = stream.pick(node_ids), stream.pick(node_ids)
                if x in mem[r["domain"]] and y in mem[r["range"]]:
                    continue
            if (r["id"], x, y) not in known:
                return {"kind": kind, "rel": r["id"], "x": x, "y": y, "expect": False, "breaks_signature": not typed}
        return None

    tasks = []
    for kind, pool, want in (("observed", base, "base"), ("inferred", inferred, "derived")):
        rels = [r for r in seed["signatures"] if r["kind"] == want]
        if not pool or not rels:
            continue
        for _ in range(n // 4):
            rel, x, y = stream.pick(pool)
            tasks.append({"kind": kind, "rel": rel, "x": x, "y": y, "expect": True, "breaks_signature": False})
            t = negative(rels, kind)
            if t:
                tasks.append(t)
    return tasks


class Context:
    """What a substrate is shown. "0": nothing. "C": text, the seed serialized one JSON array per line.
    "Q" and "X": lookup(node) and rules, the way Bridago serves a graph; served counts the tokens it handed out."""

    def __init__(self, condition: str, seed: dict | None):
        self.condition, self.text, self.rules, self.served, self._by = condition, None, [], 0, {}
        if seed is None or condition == "0":
            return
        rules = [(r["if"][0], r["if"][1], r["then"]) for r in seed.get("constraints", [])]
        if condition == "C":
            lines = [json.dumps([e["rel"], *e["members"]]) for e in seed["hyperedges"] if len(e["members"]) == 2]
            self.text = "\n".join(lines + [json.dumps(["rule", *r]) for r in rules])
            return
        for e in seed["hyperedges"]:
            if len(e["members"]) == 2:
                self._by.setdefault(e["members"][0], []).append((e["rel"], e["members"][0], e["members"][1]))
        self.rules = rules

    def lookup(self, node: str) -> list:
        """The binary facts whose subject is node."""
        out = list(self._by.get(node, []))
        self.served += 3 * len(out)
        return out


def run_cell(cell: Cell, substrate, seed: dict | None = None) -> dict:
    """Run every task of the cell through substrate.answer(query, context) and return the row."""
    if cell.quality == "curated":
        if seed is None:
            raise ValueError("a curated cell needs the reviewed seed passed in")
        full = seed
    else:
        full = generate(cell.seed, depth=cell.depth)
    tasks = make_tasks(full, cell.n, Stream(cell.seed ^ 0xA11CE))
    shown = minimal(full) if cell.quality == "minimal" else full
    if cell.condition == "X":
        shown = shuffle(shown, Stream(cell.seed ^ 0x5EED))
    ctx = Context(cell.condition, shown)
    text_tokens = len(ctx.text.split()) if ctx.text else 0
    score = {"observed": [0, 0], "inferred": [0, 0]}
    valid = violations = tokens = 0
    t0 = time.process_time()
    for q in tasks:
        before = ctx.served
        a = substrate.answer({"rel": q["rel"], "x": q["x"], "y": q["y"]}, ctx)
        tokens += 4 + text_tokens + ctx.served - before
        ok = isinstance(a, bool)
        valid += ok
        score[q["kind"]][0] += ok and a == q["expect"]
        score[q["kind"]][1] += 1
        violations += ok and a and q["breaks_signature"]
    cpu_ms = (time.process_time() - t0) * 1000
    total = sum(v[1] for v in score.values())

    def acc(k):
        return round(score[k][0] / score[k][1], 4) if score[k][1] else None

    return {"cell": asdict(cell), "harness": VERSION, "seed_digest": digest(full), "tasks": total,
            "observed": acc("observed"), "inferred": acc("inferred"),
            "accuracy": round(sum(v[0] for v in score.values()) / total, 4) if total else None,
            "schema_validity": round(valid / total, 4) if total else None, "violations": int(violations),
            "tokens": tokens, "cpu_ms": round(cpu_ms, 2), "ts": time.time()}


def write_row(row: dict, path) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, sort_keys=True) + "\n")


def read_rows(path) -> list:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
