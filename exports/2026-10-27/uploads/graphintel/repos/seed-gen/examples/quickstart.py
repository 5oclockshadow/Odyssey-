"""Generate a seed, print its counts and digest, write it to seed.json and show three facts its rules entail."""
import json
import time
from pathlib import Path

from seedgen import derive, digest, generate

t0 = time.perf_counter()
seed = generate(7, depth=3)
inferred = derive(seed)
Path("seed.json").write_text(json.dumps(seed, sort_keys=True, indent=1))
print(f"seed 7 · digest {digest(seed)}")
print(f"{len(seed['types'])} types · {len(seed['nodes'])} nodes · {len(seed['hyperedges'])} hyperedges · {len(seed['constraints'])} rules")
print(f"{len(inferred)} facts entailed and not stated, e.g.")
for rel, x, z in inferred[:3]:
    print(f"  {rel}({x}, {z})")
print(f"done in {time.perf_counter() - t0:.2f}s")
