#!/usr/bin/env python3
"""
Automated verification for git_valve.

Covers the success path (full two-way round trip through a shared bare remote),
boundary cases (no new messages, broadcast, seen-state persistence, immutable
unique filenames) and deliberate error injection (malformed message files,
running outside a repo).

Run:  python3 -m pytest test_git_valve.py -v
  or: python3 test_git_valve.py        (falls back to a built-in runner)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import git_valve as gv  # noqa: E402


def _git(args, cwd):
    subprocess.run(["git", *args], cwd=str(cwd), check=True,
                   capture_output=True, text=True)


def _init_clone(remote: Path, where: Path, name: str) -> Path:
    _git(["clone", str(remote), str(where)], where.parent)
    _git(["config", "user.email", f"{name}@test.local"], where)
    _git(["config", "user.name", name], where)
    return where


class ValveRoundTrip(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.remote = base / "remote.git"
        _git(["init", "--bare", "-b", "main", str(self.remote)], base)

        # Seed the remote with one commit so clones share a 'main' branch.
        seed = base / "seed"
        seed.mkdir()
        _git(["init", "-b", "main", str(seed)], base)
        _git(["config", "user.email", "seed@test.local"], seed)
        _git(["config", "user.name", "seed"], seed)
        (seed / "README.md").write_text("# shared repo\n")
        _git(["add", "."], seed)
        _git(["commit", "-m", "seed"], seed)
        _git(["remote", "add", "origin", str(self.remote)], seed)
        _git(["push", "-u", "origin", "main"], seed)

        self.cloud = _init_clone(self.remote, base / "cloud", "cloud")
        self.local = _init_clone(self.remote, base / "local", "local")

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_two_way_round_trip(self):
        # cloud initialises the channel
        gv.init_valve(self.cloud, "cloud")

        # local pulls, sees channel, sends a code-notice to cloud
        gv.pull(self.local, "main")
        m1 = gv.send(self.local, "local", "cloud",
                     "Pushed refactor", "see src/foo.py",
                     msg_type="code-notice", ref_commit="deadbeef",
                     ref_paths=["src/foo.py"])

        # cloud's inbox pulls and shows exactly that message
        incoming = gv.inbox(self.cloud, "cloud")
        self.assertEqual([m.id for m in incoming], [m1.id])
        self.assertEqual(incoming[0].type, "code-notice")
        self.assertEqual(incoming[0].refs["paths"], ["src/foo.py"])

        # cloud marks seen -> no longer delivered
        gv.mark_seen(self.cloud, "cloud", [m1.id])
        self.assertEqual(gv.inbox(self.cloud, "cloud"), [])

        # cloud replies; local receives the reply, cloud does not see its own
        m2 = gv.send(self.cloud, "cloud", "local",
                     "Applied, tweaked naming", "renamed foo->trends",
                     reply_to=m1.id)
        self.assertEqual(gv.inbox(self.cloud, "cloud"), [])
        reply = gv.inbox(self.local, "local")
        self.assertEqual([m.id for m in reply], [m2.id])
        self.assertEqual(reply[0].refs["in_reply_to"], m1.id)

    def test_sender_never_receives_own(self):
        gv.init_valve(self.cloud, "cloud")
        gv.send(self.cloud, "cloud", "local", "hi", "there")
        self.assertEqual(gv.inbox(self.cloud, "cloud"), [])

    def test_broadcast_reaches_everyone_but_sender(self):
        gv.init_valve(self.cloud, "cloud")
        gv.send(self.cloud, "cloud", gv.BROADCAST, "announce", "v1 live")
        got = gv.inbox(self.local, "local")
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0].recipient, gv.BROADCAST)

    def test_immutable_unique_filenames(self):
        gv.init_valve(self.cloud, "cloud")
        ids = set()
        for n in range(5):
            m = gv.send(self.cloud, "cloud", "local", f"s{n}", "b", push=False)
            ids.add(m.id)
        files = list(gv.messages_dir(self.cloud).glob("*.json"))
        self.assertEqual(len(ids), 5)
        self.assertEqual(len(files), 5)  # one file per message, none overwritten

    def test_commit_subject_encodes_conversation(self):
        gv.init_valve(self.cloud, "cloud")
        m = gv.send(self.cloud, "cloud", "local", "Topic line", "body", push=False)
        out = subprocess.run(
            ["git", "log", "-1", "--pretty=%s"], cwd=str(self.cloud),
            capture_output=True, text=True, check=True).stdout.strip()
        self.assertIn("valve(cloud→local): Topic line", out)
        self.assertIn(m.id, out)

    def test_malformed_message_is_skipped_not_fatal(self):
        gv.init_valve(self.cloud, "cloud")
        bad = gv.messages_dir(self.cloud) / "20200101T000000Z-x-bad.json"
        bad.write_text("{ this is not json")
        gv.send(self.cloud, "cloud", "local", "good", "ok", push=False)
        # read_all_messages must skip the bad file and still return the good one
        msgs = gv.read_all_messages(self.cloud)
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0].subject, "good")

    def test_protocol_mismatch_rejected(self):
        m = gv.Message(id="x", protocol=999, ts="t", sender="a",
                       recipient="b", type="message", subject="s", body="")
        with self.assertRaises(gv.ValveError):
            m.validate()

    def test_bad_type_rejected(self):
        m = gv.Message(id="x", protocol=gv.PROTOCOL_VERSION, ts="t", sender="a",
                       recipient="b", type="nope", subject="s", body="")
        with self.assertRaises(gv.ValveError):
            m.validate()

    def test_seen_state_persists_across_reload(self):
        gv.init_valve(self.cloud, "cloud")
        gv.pull(self.local, "main")
        m = gv.send(self.local, "local", "cloud", "persist", "body")
        gv.mark_seen(self.cloud, "cloud", [m.id])
        reloaded = gv.load_seen(self.cloud, "cloud")
        self.assertIn(m.id, reloaded)


class ValveErrorPaths(unittest.TestCase):
    def test_repo_root_outside_repo_raises(self):
        with tempfile.TemporaryDirectory() as d:
            cwd = os.getcwd()
            try:
                os.chdir(d)
                with self.assertRaises(gv.ValveError):
                    gv.repo_root(Path(d))
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main(verbosity=2)
