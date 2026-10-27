"""
selfwire.workbench — a local dashboard where you chat with the SelfWire
agent while it creates, reads, updates, and deletes files in its own
codebase, runs its tests, audits itself, and improves itself behind a test
gate (the "moat": every change is checkpointed in git and kept only if the
full suite stays green and no test disappears; otherwise it is rolled back).

Run it:  python -m selfwire.workbench --root /path/to/repo
"""

from .core import Workbench
from .moat import MoatPolicy, Verdict
from .server import create_app

__all__ = ["Workbench", "MoatPolicy", "Verdict", "create_app"]
