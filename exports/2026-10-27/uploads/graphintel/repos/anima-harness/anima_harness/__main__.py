import argparse
import json

from .cell import Cell, run_cell, write_row
from .substrates import RUNGS


def main(argv=None):
    p = argparse.ArgumentParser(prog="anima-harness", description="Run one cell of the Anima grid and append its row.")
    p.add_argument("--rung", default="graph", help="graph, floor, coin, or http:<name>@<base_url>#<model>")
    p.add_argument("--condition", default="Q", choices=["0", "C", "Q", "X"])
    p.add_argument("--quality", default="generated", choices=["minimal", "generated", "curated"])
    p.add_argument("--depth", type=int, default=3)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--n", type=int, default=200)
    p.add_argument("--seed-file", help="the reviewed seed, for --quality curated")
    p.add_argument("--out", default="results.jsonl")
    a = p.parse_args(argv)
    if a.rung.startswith("http:"):
        from .remote import OpenAICompatible
        name, _, rest = a.rung[5:].partition("@")
        base, _, model = rest.partition("#")
        sub = OpenAICompatible(name, base, model)
    else:
        sub = RUNGS[a.rung]()
    seed = None
    if a.seed_file:
        with open(a.seed_file, encoding="utf-8") as f:
            seed = json.load(f)
    row = run_cell(Cell(sub.name, a.condition, a.quality, a.depth, a.seed, a.n), sub, seed)
    write_row(row, a.out)
    print(json.dumps(row, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
