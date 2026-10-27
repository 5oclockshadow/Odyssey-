"""The Build loop with no network, no model, no docker and no browser: a tiny registry, a fake test runner, a fake site walk and a fake SEXTANT."""
import hmac
import json
import threading
import time
from pathlib import Path

import checks
import factory
from build import Build, build_token

ENTRY = {"id": "oversight", "name": "anima/oversight", "dir": "repos/oversight", "what": "Oversee the overseers.", "from": "oversight.py", "cat": "Agent ops",
         "line": "open", "wave": 0, "lang": "python", "builder": "tester", "sources": ["apps/engine/oversight.py"], "research": [], "status": "queued"}
BRIEFED = {**ENTRY, "id": "seed-law-tiers", "name": "anima/seed-law-tiers", "dir": "repos/seed-law-tiers", "builder": "sextant", "sources": [], "research": ["apps/engine/institute.yaml"], "wave": 1}
SRC = {"apps/engine/oversight.py": "def rank(fires):\n    return sorted(fires)\n"}


def repo(tmp_path: Path, entries) -> Path:
    r = tmp_path / "repo"
    (r / "repos").mkdir(parents=True)
    (r / "repos" / "registry.json").write_text(json.dumps({"repos": entries}))
    (r / "apps" / "engine").mkdir(parents=True)
    (r / "apps" / "engine" / "oversight.py").write_text(SRC["apps/engine/oversight.py"])
    return r


def make(tmp_path, entries, edit=False, sextant=None):
    r = repo(tmp_path, entries)
    b = Build({"build": {"per_round": 3, "e2e_every": 10, "pause_seconds": 0}}, r, tmp_path / "work", tmp_path / "state", edit=edit,
              runner=lambda root: {"code": 0, "secs": 0.1, "passed": 3, "failed": 0, "errors": 0, "tail": "3 passed"},
              walker=lambda widths: [{"id": "every-route", "width": w, "ok": True, "ms": 900} for w in widths],
              sextant=sextant or (lambda text: None))                         # None: SEXTANT is not reachable, so messages wait in the outbox
    return b, r


def full_entry():
    return {**ENTRY, "id": "full", "name": "anima/full", "dir": "repos/full"}


def full_files(e):
    files = factory.pack(e, SRC)
    files["README.md"] = factory.readme(e, finding="F" * 80, hypothesis="H" * 80, use="call it")
    files["examples/quickstart.py"] = "print('hi')\n"
    return files


def blocks(files: dict) -> str:
    return "Here it is.\n" + "".join(f"--- file: {k}\n{v}--- end\n" for k, v in files.items())


def test_pack_from_source_then_bar_names_what_sextant_owes():
    files = factory.pack(ENTRY, SRC)
    assert {"oversight/oversight.py", "tests/test_smoke.py", "pyproject.toml", "LICENSE"} <= set(files)
    bad = {c["id"]: c["why"] for c in factory.bar(files, ENTRY) if not c["ok"]}
    assert set(bad) == {"readme", "example"} and "SEXTANT" in bad["readme"]


def test_bar_catches_network_secrets_and_unpinned():
    files = factory.pack(ENTRY, SRC)
    files["tests/test_net.py"] = "import requests\n"
    files["requirements.txt"] = "numpy\n"
    files["oversight/k.py"] = "KEY = 'anma_" + "0" * 32 + "'\n"
    bad = {c["id"]: c["why"] for c in factory.bar(files, ENTRY) if not c["ok"]}
    assert "network" in bad["tests"] and "key-shaped" in bad["hygiene"]
    del files["oversight/k.py"]
    assert "unpinned: numpy" in {c["id"]: c["why"] for c in factory.bar(files, ENTRY) if not c["ok"]}["hygiene"]


def test_a_complete_repo_clears_the_bar():
    e = full_entry()
    assert all(c["ok"] for c in factory.bar(full_files(e), e))


def test_research_only_repo_gets_a_brief_for_sextant():
    files = factory.pack(BRIEFED, {})
    assert "BRIEF.md" in files and "SEXTANT" in files["BRIEF.md"] and "seed_law_tiers" in files["BRIEF.md"]


def test_take_files_keeps_safe_paths_and_unwraps_one_fence():
    got = factory.take_files("--- file: a/b.py\nx = 1\n--- end\n--- file: ../evil.py\nboom\n--- end\n--- file: /etc/passwd\nroot\n--- end\n"
                             "--- file: .env\nK=1\n--- end\n--- file: .github/workflows/ci.yml\nname: ci\n--- end\n--- file: `c.py`\n```python\ny = 2\n```\n--- end\n"
                             "and the format, quoted inline: a line `--- file: x` is not a block")
    assert got == {"a/b.py": "x = 1\n", ".github/workflows/ci.yml": "name: ci\n", "c.py": "y = 2\n"}


def test_plan_orders_asked_verify_retry_fresh_and_caps_the_round(tmp_path):
    b, _ = make(tmp_path, [ENTRY, BRIEFED, {**ENTRY, "id": "heal", "name": "anima/heal", "dir": "repos/heal", "wave": 2}])
    reg = b.repos()
    b.set_repo("heal", status="built")
    b.set_repo("oversight", status="failing", lastRound=1)
    assert [e["id"] for e in b.plan(reg, 2)] == ["heal", "seed-law-tiers"]          # a failing repo waits three rounds
    assert [e["id"] for e in b.plan(reg, 4)] == ["heal", "oversight", "seed-law-tiers"]
    b.asked = ["oversight"]
    assert [e["id"] for e in b.plan(reg, 2)][0] == "oversight"                       # Build now goes first


def test_a_round_packs_tests_briefs_walks_and_records(tmp_path):
    b, r = make(tmp_path, [ENTRY, BRIEFED])
    assert b.round_once(1)
    s = b.status()
    assert s["round"] == 1 and s["st"]["oversight"]["status"] == "failing" and s["st"]["seed-law-tiers"]["status"] == "briefed"
    assert "readme" in s["st"]["oversight"]["why"] and "tests" not in s["st"]["seed-law-tiers"]     # a brief waits for SEXTANT; it is not tested
    assert any(o["to"] == "SEXTANT" and "seed-law-tiers" in o["text"] and "--- file:" in o["text"] for o in s["outbox"])
    assert s["e2e"]["every-route"]["1440"]["ok"] and s["e2e"]["every-route"]["1440"]["ms"] == 900 and s["history"][-1]["e2eOk"] == 3
    assert s["history"][-1]["packed"] == 1
    assert (tmp_path / "state" / "build" / "repos" / "oversight" / "pyproject.toml").exists()
    assert not (r / "repos" / "oversight").exists()                                     # nothing reaches the repository without edit


def test_a_reply_with_file_blocks_is_drafted_then_verified(tmp_path):
    said = []
    b, r = make(tmp_path, [BRIEFED], sextant=lambda text: said.append(text) or "")     # reachable, nothing written yet
    assert b.round_once(1) and b.status()["st"]["seed-law-tiers"]["status"] == "briefed" and "--- file:" in said[0]
    m = factory.module(BRIEFED)
    files = {f"{m}/__init__.py": "X = 1\n", "tests/test_x.py": f"from {m} import X\n\n\ndef test_x():\n    assert X == 1\n",
             "examples/quickstart.py": "print('hi')\n", "README.md": factory.readme(BRIEFED, finding="F" * 80, hypothesis="H" * 80, use="call it")}
    assert b.reply("seed-law-tiers", blocks(files))["files"] == 4 and b.status()["st"]["seed-law-tiers"]["status"] == "built"
    assert b.round_once(2) and b.status()["st"]["seed-law-tiers"]["status"] == "passing"
    assert not (r / "repos" / "seed-law-tiers").exists()


def test_sextants_answer_lands_without_the_owner(tmp_path):
    m = factory.module(BRIEFED)
    files = {f"{m}/__init__.py": "X = 1\n", "tests/test_x.py": "def test_x():\n    assert True\n"}
    b, _ = make(tmp_path, [BRIEFED], sextant=lambda text: blocks(files) if "Build anima/seed-law-tiers" in text else "")
    b.round_once(1)
    s = b.status()
    assert s["st"]["seed-law-tiers"]["status"] == "built" and any(f["who"] == "SEXTANT" and "wrote 2 file(s)" in f["text"] for f in s["feed"])
    assert (b.area / "seed-law-tiers" / "tests" / "test_x.py").exists()


def test_a_full_repo_passes_and_is_written_when_editing(tmp_path):
    e = full_entry()
    b, r = make(tmp_path, [e], edit=True)
    b.put(b.area / "full", full_files(e))
    assert b.round_once(1)
    s = b.status()
    assert s["st"]["full"]["status"] == "passing" and (r / "repos" / "full" / "README.md").exists()
    assert s["history"][-1]["passing"] == 1 and s["clean"] == 1
    assert not (b.area / "full").exists()                                                # the draft is spent once it is in the repository
    b.refresh(b.repos())
    assert b.status()["st"]["full"]["status"] == "passing"                               # and that is not mistaken for a change


def test_a_repo_whose_files_change_is_verified_again(tmp_path):
    e = full_entry()
    b, r = make(tmp_path, [e])
    b.put(r / e["dir"], full_files(e))                                                   # committed, as Claude or the owner would write it
    assert b.round_once(1) and b.status()["st"]["full"]["status"] == "passing"
    (r / e["dir"] / "examples" / "quickstart.py").write_text("print('changed')\n")
    b.refresh(b.repos())
    assert b.status()["st"]["full"]["status"] == "built" and [x["id"] for x in b.plan(b.repos(), 2)] == ["full"]


def test_readme_links_follow_the_configured_domain(tmp_path, monkeypatch):
    monkeypatch.setitem(factory.CONFIG, "site", "https://threshold.example/")
    monkeypatch.setitem(factory.CONFIG, "graph", "https://threshold.example/#/graph")
    e = full_entry()
    b, _ = make(tmp_path, [e])
    files = full_files(e)
    files["README.md"] = files["README.md"].replace("https://threshold.example/", "http://localhost/")
    b.put(b.area / "full", files)
    assert b.test(e, dict(files))["status"] == "passing"
    assert "https://threshold.example/#/graph" in (b.area / "full" / "README.md").read_text()


def test_the_registry_sets_the_links(tmp_path, monkeypatch):
    monkeypatch.delenv("INSTITUTE_SITE", raising=False)
    monkeypatch.setitem(factory.CONFIG, "site", "http://localhost/")
    b, r = make(tmp_path, [ENTRY])
    (r / "repos" / "registry.json").write_text(json.dumps({"links": {"site": "https://threshold.example/"}, "repos": [ENTRY]}))
    b.repos()
    assert factory.CONFIG["site"] == "https://threshold.example/" and b.status()["config"]["site"] == "https://threshold.example/"


def test_proposals_close_when_their_condition_clears(tmp_path):
    e = full_entry()
    b, _ = make(tmp_path, [e])
    b.put(b.area / "full", full_files(e))
    b.round_once(1)
    assert "full:tests" in {p["id"] for p in b.status()["proposals"]}                   # three tests: add cases
    b.set_repo("full", tests={"passed": 9, "failed": 0, "errors": 0, "code": 0})
    b.set_repo("full", status="passing")
    b.round_once(2)
    assert "full:tests" not in {p["id"] for p in b.status()["proposals"]}


def test_reset_keeps_drafts_and_briefs_again(tmp_path):
    b, _ = make(tmp_path, [BRIEFED])
    b.round_once(1)
    assert b.reset()["ok"] and b.status()["round"] == 0 and (b.area / "seed-law-tiers" / "BRIEF.md").exists()
    b.round_once(1)
    assert b.status()["st"]["seed-law-tiers"]["status"] == "briefed"


def test_a_run_the_container_stopped_in_resumes(tmp_path):
    b, r = make(tmp_path, [BRIEFED])
    b.thread = threading.Thread(target=lambda: time.sleep(0.2))
    b.thread.start()
    b.stop(resume=True)
    b.thread.join()
    b2 = Build({}, r, tmp_path / "work", tmp_path / "state")
    assert b2.was_running and not b2.s["running"]


def test_build_token_has_the_engines_shape():
    who, exp, sig = build_token("s", ttl=60).split(".")
    assert who == "build" and int(exp) > time.time() and sig == hmac.new(b"s", f"build.{exp}".encode(), "sha256").hexdigest()


def test_repo_suites_come_from_the_graph():
    class B:
        _lock = threading.RLock()
        nodes = {"file:repos/seed-gen/tests/test_seed.py": {}, "file:repos/seed-gen/seedgen/core.py": {}, "file:repos/x/README.md": {}, "file:apps/engine/test_engine.py": {}}
    assert checks.repo_suites(B()) == [{"id": "repo-seed-gen", "dir": "repos/seed-gen", "repo": True}]
    listed = [{"id": "engine", "dir": "apps/engine"}, {"id": "repo-seed-gen", "dir": "repos/seed-gen"}]
    assert [s["id"] for s in checks.suites_of(B(), {"suites": listed})] == ["engine", "repo-seed-gen"]
