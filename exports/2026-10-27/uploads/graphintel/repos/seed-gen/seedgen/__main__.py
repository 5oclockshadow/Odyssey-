import argparse
import json
import sys

from .gen import derive, digest, generate


def main(argv=None):
    p = argparse.ArgumentParser(prog="seedgen", description="A typed hypergraph seed from one integer.")
    for name, default in (("seed", 0), ("depth", 3), ("types", 8), ("relations", 6), ("nodes", 60), ("edges", 90), ("rules", 4)):
        p.add_argument("--" + name, type=int, default=default)
    p.add_argument("--summary", action="store_true", help="print counts and the digest instead of the seed")
    a = p.parse_args(argv)
    s = generate(a.seed, a.depth, a.types, a.relations, a.nodes, a.edges, a.rules)
    if a.summary:
        print(json.dumps({"digest": digest(s), "types": len(s["types"]), "nodes": len(s["nodes"]), "hyperedges": len(s["hyperedges"]),
                          "rules": len(s["constraints"]), "derived_facts": len(derive(s))}))
    else:
        json.dump(s, sys.stdout, sort_keys=True, indent=1)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
