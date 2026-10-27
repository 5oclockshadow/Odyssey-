"""Run the tests from a fresh checkout: the package sits one folder up."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
