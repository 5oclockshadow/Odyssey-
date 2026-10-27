"""The small grid with the stub rungs: graph (the ceiling) and floor (always no) across the four conditions, depths 1 to 3.
Stub rungs check the plumbing and say nothing about the thesis. Model rungs plug in through anima_harness.remote and
anima/lstm-substrate."""
import time

from anima_harness import Cell, h5, run_cell
from anima_harness.substrates import Floor, Graph

t0 = time.perf_counter()
rows = []
fmt = lambda v: "-" if v is None else f"{v:.2f}"
print(f"{'rung':6} {'cond':4} {'depth':>5} {'observed':>9} {'inferred':>9} {'accuracy':>9} {'tokens':>7}")
for depth in (1, 2, 3):
    for cond in ("0", "C", "Q", "X"):
        for sub in (Graph(), Floor()):
            r = run_cell(Cell(sub.name, cond, depth=depth, seed=4, n=80), sub)
            rows.append(r)
            print(f"{sub.name:6} {cond:4} {depth:5} {fmt(r['observed']):>9} {fmt(r['inferred']):>9} {fmt(r['accuracy']):>9} {r['tokens']:7}")
print("H5 on the graph rung:", h5(rows, rung="graph"))
print(f"done in {time.perf_counter() - t0:.2f}s")
