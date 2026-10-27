"""anima/anima-harness: one cell of the Anima grid, one results row."""
from .cell import CONDITIONS, QUALITIES, Cell, Context, make_tasks, read_rows, run_cell, shuffle, write_row
from .verdicts import h0, h4, h5

__all__ = ["CONDITIONS", "QUALITIES", "Cell", "Context", "make_tasks", "read_rows", "run_cell", "shuffle", "write_row", "h0", "h4", "h5"]
__version__ = "0.1.0"
