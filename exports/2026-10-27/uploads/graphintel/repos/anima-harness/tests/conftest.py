"""Run from a fresh checkout. In the institute's repos/ folder, seed-gen sits next door."""
import sys
from pathlib import Path

here = Path(__file__).resolve()
sys.path.insert(0, str(here.parents[1]))
try:
    import seedgen  # noqa: F401
except ImportError:
    sys.path.insert(0, str(here.parents[2] / "seed-gen"))
