import os

import pytest

from selfwire.workbench.workspace import GitError, PathRejected, Workspace, WorkspaceError


@pytest.fixture
def ws(mini_repo):
    events = []
    w = Workspace(mini_repo, protected=("calc/locked.py", "frozen"), emit=lambda t, d: events.append((t, d)))
    w.ensure_repo()
    w.events = events
    return w


@pytest.mark.parametrize("bad", ["../escape.py", "/etc/passwd", "a/../../x", ".git/config", ".env",
                                 "pkg/.venv/x.py", "", "  ", "a\x00b", "C:/windows", "node_modules/x.js", ".selfwire/x"])
def test_resolve_rejects_unsafe_paths(ws, bad):
    with pytest.raises(PathRejected):
        ws.resolve(bad)


def test_symlink_escaping_workspace_is_rejected(ws, tmp_path):
    outside = tmp_path / "outside.txt"
    outside.write_text("secret")
    os.symlink(outside, ws.root / "link.txt")
    with pytest.raises(PathRejected):
        ws.read("link.txt")


def test_crud_roundtrip_and_events(ws):
    info = ws.write("pkg/new.py", "x = 1\n")
    assert info.path == "pkg/new.py" and info.size == 6
    assert ws.read("pkg/new.py") == "x = 1\n"
    ws.replace_text("pkg/new.py", "x = 1", "x = 2")
    assert ws.read("pkg/new.py") == "x = 2\n"
    assert ws.move("pkg/new.py", "pkg/moved.py") == ("pkg/new.py", "pkg/moved.py")
    assert ws.delete("pkg/moved.py") == "pkg/moved.py"
    assert not ws.exists("pkg/moved.py")
    ops = [d["op"] for t, d in ws.events if t == "file"]
    assert ops == ["write", "write", "move", "delete"]
    assert ws.mutation_count == 4


def test_write_preserves_mode_and_leaves_no_temp_files(ws):
    path = ws.root / "run.sh"
    path.write_text("echo hi\n")
    path.chmod(0o755)
    ws.write("run.sh", "echo bye\n")
    assert path.stat().st_mode & 0o777 == 0o755
    assert not [p for p in ws.root.iterdir() if p.name.startswith(".sw-")]


def test_replace_requires_exactly_one_match(ws):
    ws.write("dup.txt", "a a")
    with pytest.raises(WorkspaceError, match="2 times"):
        ws.replace_text("dup.txt", "a", "b")
    with pytest.raises(WorkspaceError, match="not found"):
        ws.replace_text("dup.txt", "zzz", "b")


def test_protected_paths_are_read_only(ws):
    (ws.root / "calc" / "locked.py").write_text("LOCK = 1\n")
    assert ws.read("calc/locked.py") == "LOCK = 1\n"
    for op in (lambda: ws.write("calc/locked.py", "x"), lambda: ws.delete("calc/locked.py"),
               lambda: ws.write("frozen/inner.txt", "x"), lambda: ws.move("calc/__init__.py", "frozen/a.py")):
        with pytest.raises(PathRejected, match="protected"):
            op()


def test_move_refuses_to_overwrite(ws):
    with pytest.raises(WorkspaceError, match="already exists"):
        ws.move("calc/__init__.py", "tests/test_calc.py")


def test_binary_and_missing_files(ws):
    (ws.root / "blob.bin").write_bytes(b"\x00\x01\x02")
    with pytest.raises(WorkspaceError, match="binary"):
        ws.read("blob.bin")
    with pytest.raises(FileNotFoundError):
        ws.read("nope.py")


def test_ensure_repo_creates_initial_commit_and_local_excludes(ws):
    assert ws.is_git_repo()
    assert ws.log(5)[0].message == "workbench: initial snapshot"
    exclude = (ws.root / ".git" / "info" / "exclude").read_text()
    for pattern in (".selfwire/", ".venv/", ".env"):
        assert pattern in exclude


def test_list_files_hides_ignored_and_denied(ws):
    (ws.root / ".venv").mkdir()
    (ws.root / ".venv" / "lib.py").write_text("x")
    (ws.root / ".env").write_text("SECRET=1")
    ws.state_dir.joinpath("state.json").write_text("{}")
    paths = [f.path for f in ws.list_files()]
    assert paths == ["calc/__init__.py", "tests/test_calc.py"]


def test_checkpoint_commits_dirty_work_and_rollback_restores(ws):
    base = ws.checkpoint("clean")  # nothing dirty -> current HEAD
    assert base == ws.head()
    ws.write("calc/__init__.py", "broken(")
    ws.write("calc/extra.py", "y = 2\n")
    (ws.root / ".venv").mkdir()
    (ws.root / ".venv" / "keep.txt").write_text("keep")
    ws.state_dir.joinpath("keep.json").write_text("{}")
    ws.rollback(base)
    assert ws.read("calc/__init__.py").endswith("return a + b\n")
    assert not (ws.root / "calc" / "extra.py").exists()
    assert (ws.root / ".venv" / "keep.txt").exists(), "rollback must never touch the virtualenv"
    assert (ws.state_dir / "keep.json").exists(), "rollback must never touch workbench state"
    assert any(t == "git" and d["op"] == "rollback" for t, d in ws.events)

    ws.write("user_notes.md", "work in progress")
    saved = ws.checkpoint("before risky change")
    assert saved != base and not ws.is_dirty()
    ws.write("user_notes.md", "clobbered")
    ws.rollback(saved)
    assert ws.read("user_notes.md") == "work in progress", "checkpointed work survives a rollback"


def test_checkpoint_never_commits_venv_or_env_in_a_foreign_repo(ws):
    (ws.root / ".venv").mkdir()
    (ws.root / ".venv" / "pyvenv.cfg").write_text("home = /usr")
    (ws.root / ".env").write_text("TOKEN=secret")
    ws.write("calc/new.py", "z = 3\n")
    ws.checkpoint("foreign")
    tracked = ws._git("ls-files").split()
    assert "calc/new.py" in tracked
    assert not any(t.startswith(".venv") or t == ".env" for t in tracked)


def test_rollback_validates_sha(ws):
    for bad in ("not-a-sha", "--hard", "deadbeef" * 5):
        with pytest.raises(GitError):
            ws.rollback(bad)


def test_status_log_diff_and_commit(ws):
    ws.write("calc/__init__.py", "def add(a, b):\n    return b + a\n")
    ws.write("fresh.txt", "new\n")
    status = ws.status()
    assert status.dirty
    assert {c.path for c in status.changes} == {"calc/__init__.py", "fresh.txt"}
    diff = ws.diff()
    assert "return b + a" in diff and "fresh.txt" in diff
    sha = ws.commit("swap operands")
    assert ws.head() == sha and not ws.is_dirty()
    ws._git("tag", "v-test")
    top = ws.log(1)[0]
    assert top.message == "swap operands" and "v-test" in top.tags
    assert "swap operands" in ws.diff(sha)
    with pytest.raises(GitError, match="nothing to commit"):
        ws.commit("empty")
    with pytest.raises(GitError, match="message"):
        ws.commit("   ")
