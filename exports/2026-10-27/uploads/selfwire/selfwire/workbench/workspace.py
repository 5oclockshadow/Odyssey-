"""
workspace.py — sandboxed create/read/update/delete over the served repo, plus
the git primitives the moat is built on: checkpoint, commit, rollback.

Every path that reaches the filesystem goes through `resolve()`, which
rejects absolute paths, `..` segments, NUL bytes, off-limits directories
(`.git`, `.venv`, caches, `node_modules`), `.env`, and anything whose real
path (after following symlinks) lands outside the workspace root. Writes and
deletes additionally refuse `protected` paths — by default the moat policy
module itself, so the agent cannot switch off its own test gate.

Every git command runs with `core.hooksPath=/dev/null`: a hook planted in
.git/hooks (for example by test code the agent wrote) never executes from
the workbench. `git_meta_snapshot()`/`git_meta_restore()` let the caller
detect and undo test-time tampering with .git/hooks, .git/info and
.git/config. Path checks are case-insensitive, so `.GIT/` or `CONFTEST.PY`
cannot slip past them on case-insensitive filesystems.

Writes are atomic (temp file + `os.replace`), so a crash or a concurrent
reader never sees a half-written file. Every mutation bumps
`mutation_count`; the commit gate compares it against the count recorded
when the last test run started, to know whether those test results still
describe the code on disk.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

from pydantic import BaseModel

DENY_PARTS = frozenset(
    {".git", ".venv", "venv", "__pycache__", ".pytest_cache", "node_modules", ".mypy_cache", ".ruff_cache", ".selfwire"}
)
DENY_NAMES = frozenset({".env"})
# written to .git/info/exclude (local, never committed) so that checkpoints
# and commits in *any* served repo can never sweep these up with `add -A`,
# and `clean` during rollback leaves them alone
LOCAL_EXCLUDES = (".selfwire/", ".venv/", "venv/", "node_modules/", "__pycache__/", ".pytest_cache/", ".env")
STATE_DIRNAME = ".selfwire"
DEFAULT_PROTECTED: tuple[str, ...] = ("selfwire/workbench/moat.py",)
MAX_FILE_BYTES = 2_000_000
MAX_DIFF_UNTRACKED = 50
_SHA_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")
_GIT_IDENTITY = ("-c", "user.name=SelfWire Workbench", "-c", "user.email=workbench@selfwire.local")


class WorkspaceError(Exception):
    pass


class PathRejected(WorkspaceError):
    pass


class GitError(WorkspaceError):
    pass


class FileInfo(BaseModel):
    path: str
    size: int
    mtime: float


class GitChange(BaseModel):
    status: str
    path: str


class GitStatus(BaseModel):
    branch: Optional[str]
    head: Optional[str]
    dirty: bool
    changes: list[GitChange]


class GitCommit(BaseModel):
    sha: str
    short: str
    message: str
    author: str
    date: str
    tags: list[str]


EmitFn = Callable[[str, dict], Any]


class Workspace:
    def __init__(
        self,
        root: str | Path,
        *,
        protected: Iterable[str] = DEFAULT_PROTECTED,
        emit: Optional[EmitFn] = None,
        git_timeout: float = 60.0,
    ) -> None:
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise WorkspaceError(f"workspace root is not a directory: {self.root}")
        self.protected: tuple[str, ...] = tuple(p.strip().strip("/") for p in protected if p and p.strip().strip("/"))
        self.emit = emit
        self.git_timeout = git_timeout
        self._lock = threading.RLock()
        self.mutation_count = 0
        self._identity: Optional[tuple[str, ...]] = None

    # -- path safety ---------------------------------------------------------
    def resolve(self, rel: str) -> Path:
        if not isinstance(rel, str) or not rel.strip():
            raise PathRejected("empty path")
        if "\x00" in rel:
            raise PathRejected("NUL byte in path")
        norm = rel.replace("\\", "/").strip()
        if norm.startswith("/") or re.match(r"^[A-Za-z]:", norm):
            raise PathRejected(f"absolute paths are not allowed: {rel!r}")
        parts = [p for p in norm.split("/") if p not in ("", ".")]
        if not parts:
            raise PathRejected(f"path names the workspace root itself: {rel!r}")
        if ".." in parts:
            raise PathRejected(f"path escapes the workspace: {rel!r}")
        for part in parts:
            folded = part.casefold()
            if folded in DENY_PARTS or folded in DENY_NAMES:
                raise PathRejected(f"path is off-limits: {rel!r} (contains {part!r})")
        candidate = self.root.joinpath(*parts)
        real = Path(os.path.realpath(candidate))
        if real != self.root and self.root not in real.parents:
            raise PathRejected(f"path resolves outside the workspace (symlink?): {rel!r}")
        return candidate

    def normalize(self, rel: str) -> str:
        return self.resolve(rel).relative_to(self.root).as_posix()

    def _matches_protected(self, norm: str) -> bool:
        folded = norm.casefold()
        return any(folded == p.casefold() or folded.startswith(p.casefold() + "/") for p in self.protected)

    def is_protected(self, rel: str) -> bool:
        return self._matches_protected(self.normalize(rel))

    def _writable(self, rel: str) -> tuple[Path, str]:
        path = self.resolve(rel)
        norm = path.relative_to(self.root).as_posix()
        if self._matches_protected(norm):
            raise PathRejected(f"protected path is read-only from the workbench: {norm}")
        return path, norm

    def _mutated(self, event_type: str, data: dict) -> None:
        self.mutation_count += 1
        self._emit(event_type, data)

    def _emit(self, event_type: str, data: dict) -> None:
        if self.emit is None:
            return
        try:
            self.emit(event_type, data)
        except Exception:
            # observers must never break a file operation
            return

    # -- read ------------------------------------------------------------------
    def list_files(self) -> list[FileInfo]:
        if self.is_git_repo():
            out = self._git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
            rels = [r for r in out.split("\0") if r]
        else:
            rels = []
            for dirpath, dirnames, filenames in os.walk(self.root):
                dirnames[:] = [d for d in dirnames if d not in DENY_PARTS]
                for name in filenames:
                    rels.append(Path(os.path.relpath(os.path.join(dirpath, name), self.root)).as_posix())
        infos: list[FileInfo] = []
        for rel in sorted(set(rels)):
            if any(part.casefold() in DENY_PARTS or part.casefold() in DENY_NAMES for part in rel.split("/")):
                continue
            path = self.root / rel
            try:
                if not path.is_file():
                    continue
                st = path.stat()
            except OSError:
                # tracked in the index but deleted on disk, or vanished mid-scan
                continue
            infos.append(FileInfo(path=rel, size=st.st_size, mtime=st.st_mtime))
        return infos

    def exists(self, rel: str) -> bool:
        return self.resolve(rel).is_file()

    def stat(self, rel: str) -> FileInfo:
        path = self.resolve(rel)
        if not path.is_file():
            raise FileNotFoundError(f"no such file: {rel}")
        st = path.stat()
        return FileInfo(path=path.relative_to(self.root).as_posix(), size=st.st_size, mtime=st.st_mtime)

    def read(self, rel: str) -> str:
        path = self.resolve(rel)
        if not path.is_file():
            raise FileNotFoundError(f"no such file: {rel}")
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            raise WorkspaceError(f"file too large to open as text ({size} bytes > {MAX_FILE_BYTES})")
        data = path.read_bytes()
        if b"\x00" in data[:8192]:
            raise WorkspaceError(f"binary file, not editable as text: {rel}")
        return data.decode("utf-8", errors="replace")

    # -- write -------------------------------------------------------------------
    def write(self, rel: str, content: str) -> FileInfo:
        if not isinstance(content, str):
            raise WorkspaceError("content must be a string")
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            raise WorkspaceError(f"content too large ({len(encoded)} bytes > {MAX_FILE_BYTES})")
        with self._lock:
            path, norm = self._writable(rel)
            if path.is_dir():
                raise WorkspaceError(f"path is a directory: {norm}")
            path.parent.mkdir(parents=True, exist_ok=True)
            mode = (path.stat().st_mode & 0o777) if path.exists() else 0o644
            fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".sw-", suffix=".tmp")
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(encoded)
                os.chmod(tmp, mode)
                os.replace(tmp, path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except FileNotFoundError:
                    pass
                raise
            self._mutated("file", {"op": "write", "path": norm})
            return self.stat(norm)

    def replace_text(self, rel: str, old: str, new: str) -> FileInfo:
        if not old:
            raise WorkspaceError("replace needs a non-empty `old` string")
        content = self.read(rel)
        count = content.count(old)
        if count == 0:
            raise WorkspaceError(f"`old` text not found in {rel}")
        if count > 1:
            raise WorkspaceError(f"`old` text matches {count} times in {rel}; include more surrounding context")
        return self.write(rel, content.replace(old, new, 1))

    def delete(self, rel: str) -> str:
        with self._lock:
            path, norm = self._writable(rel)
            if not path.is_file():
                raise FileNotFoundError(f"no such file: {rel}")
            path.unlink()
            self._mutated("file", {"op": "delete", "path": norm})
            return norm

    def move(self, src: str, dst: str) -> tuple[str, str]:
        with self._lock:
            src_path, src_norm = self._writable(src)
            dst_path, dst_norm = self._writable(dst)
            if not src_path.is_file():
                raise FileNotFoundError(f"no such file: {src}")
            if dst_path.exists():
                raise WorkspaceError(f"destination already exists: {dst_norm}")
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src_path, dst_path)
            self._mutated("file", {"op": "move", "path": src_norm, "dst": dst_norm})
            return src_norm, dst_norm

    # -- git ---------------------------------------------------------------------
    def _git(self, *args: str, check: bool = True, timeout: Optional[float] = None) -> str:
        cmd = ["git", "-c", "core.quotepath=off", "-c", "core.hooksPath=/dev/null", *args]
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        try:
            proc = subprocess.run(
                cmd, cwd=self.root, capture_output=True, text=True,
                timeout=timeout or self.git_timeout, env=env, errors="replace",
            )
        except FileNotFoundError as e:
            raise GitError("git is not installed") from e
        except subprocess.TimeoutExpired as e:
            raise GitError(f"git {args[0]} timed out") from e
        if check and proc.returncode != 0:
            detail = (proc.stderr or proc.stdout).strip()[:800]
            raise GitError(f"git {args[0]} failed: {detail}")
        return proc.stdout

    def _ident(self) -> tuple[str, ...]:
        if self._identity is None:
            email = self._git("config", "user.email", check=False).strip()
            self._identity = () if email else _GIT_IDENTITY
        return self._identity

    def is_git_repo(self) -> bool:
        try:
            top = self._git("rev-parse", "--show-toplevel").strip()
        except GitError:
            return False
        return Path(top).resolve() == self.root

    def ensure_repo(self) -> None:
        with self._lock:
            fresh = not self.is_git_repo()
            if fresh:
                self._git("init", "-q")
            self.ensure_local_excludes(LOCAL_EXCLUDES)
            if fresh:
                self._git("add", "-A")
                self._git(*self._ident(), "commit", "-q", "--allow-empty", "-m", "workbench: initial snapshot")

    def ensure_local_excludes(self, patterns: Iterable[str]) -> None:
        exclude = self.root / ".git" / "info" / "exclude"
        exclude.parent.mkdir(parents=True, exist_ok=True)
        existing = exclude.read_text(encoding="utf-8").splitlines() if exclude.exists() else []
        missing = [p for p in patterns if p not in existing]
        if missing:
            with exclude.open("a", encoding="utf-8") as fh:
                if existing and existing[-1].strip():
                    fh.write("\n")
                fh.write("# added by selfwire workbench\n" + "\n".join(missing) + "\n")

    @property
    def state_dir(self) -> Path:
        path = self.root / STATE_DIRNAME
        path.mkdir(parents=True, exist_ok=True)
        return path

    def head(self) -> Optional[str]:
        try:
            return self._git("rev-parse", "HEAD").strip()
        except GitError:
            return None

    def branch(self) -> Optional[str]:
        try:
            return self._git("rev-parse", "--abbrev-ref", "HEAD").strip()
        except GitError:
            return None

    def status(self) -> GitStatus:
        out = self._git("status", "--porcelain=v1", "-z", "--untracked-files=all")
        entries = out.split("\0")
        changes: list[GitChange] = []
        i = 0
        while i < len(entries):
            entry = entries[i]
            i += 1
            if len(entry) < 4:
                continue
            code, path = entry[:2], entry[3:]
            if code[0] in "RC":
                i += 1  # the next NUL-separated field is the rename source
            changes.append(GitChange(status=code.strip() or code, path=path))
        return GitStatus(branch=self.branch(), head=self.head(), dirty=bool(changes), changes=changes)

    def is_dirty(self) -> bool:
        return bool(self._git("status", "--porcelain=v1", "--untracked-files=all").strip())

    def log(self, limit: int = 30) -> list[GitCommit]:
        limit = max(1, min(int(limit), 500))
        fmt = "%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%D%x1e"
        out = self._git("log", f"-n{limit}", f"--format={fmt}", check=False)
        commits: list[GitCommit] = []
        for record in out.split("\x1e"):
            record = record.strip("\n")
            if not record:
                continue
            fields = record.split("\x1f")
            if len(fields) < 6:
                continue
            sha, short, subject, author, date, refs = fields[:6]
            tags = [r.strip()[5:] for r in refs.split(",") if r.strip().startswith("tag: ")]
            commits.append(GitCommit(sha=sha, short=short, message=subject, author=author, date=date, tags=tags))
        return commits

    def _verify_commit(self, ref: str) -> str:
        if not isinstance(ref, str) or not _SHA_RE.match(ref.strip()):
            raise GitError(f"not a commit sha: {ref!r}")
        return self._git("rev-parse", "--verify", "--quiet", f"{ref.strip()}^{{commit}}").strip()

    def diff(self, ref: Optional[str] = None, max_chars: int = 400_000) -> str:
        if ref:
            full = self._verify_commit(ref)
            text = self._git("show", "--stat", "--patch", "--format=commit %H%nAuthor: %an%nDate:   %aI%n%n    %s%n%n%b", full)
            return text[:max_chars]
        head = self.head()
        parts = [self._git("diff", "HEAD") if head else self._git("diff", "--cached")]
        untracked = self._git("ls-files", "-z", "--others", "--exclude-standard").split("\0")
        for rel in [u for u in untracked if u][:MAX_DIFF_UNTRACKED]:
            path = self.root / rel
            try:
                if path.stat().st_size > 200_000:
                    parts.append(f"new file (untracked, too large to inline): {rel}\n")
                    continue
            except OSError:
                continue
            parts.append(self._git("diff", "--no-index", "--", "/dev/null", rel, check=False))
        return "".join(parts)[:max_chars]

    def commit(self, message: str, *, allow_empty: bool = False) -> str:
        message = (message or "").strip()
        if not message:
            raise GitError("commit message is required")
        with self._lock:
            self._git("add", "-A")
            staged = subprocess.run(
                ["git", "-c", "core.hooksPath=/dev/null", "diff", "--cached", "--quiet"],
                cwd=self.root, capture_output=True, timeout=self.git_timeout,
            ).returncode != 0
            if not staged and not allow_empty:
                raise GitError("nothing to commit")
            self._git(*self._ident(), "commit", "-q", "--allow-empty", "-m", message)
            sha = self.head() or ""
            self._emit("git", {"op": "commit", "sha": sha, "message": message.splitlines()[0]})
            return sha

    def checkpoint(self, label: str) -> str:
        """Commit any uncommitted work (so a later rollback can never destroy
        it) and return the resulting HEAD — the point to roll back to."""
        with self._lock:
            if self.is_dirty():
                message = f"workbench: checkpoint - {label}"
                self._git("add", "-A")
                self._git(*self._ident(), "commit", "-q", "-m", message)
                sha = self.head() or ""
                self._emit("git", {"op": "checkpoint", "sha": sha, "message": message})
                return sha
            sha = self.head()
            if sha is None:
                raise GitError("repository has no commits to checkpoint against")
            return sha

    def rollback(self, ref: str) -> str:
        """Hard-reset tracked files to `ref` and delete untracked files that
        are not git-ignored. Ignored state (.venv, runtime_state, reports,
        .env) is never touched."""
        with self._lock:
            full = self._verify_commit(ref)
            self._git("reset", "--hard", "-q", full)
            excludes: list[str] = []
            for name in sorted(DENY_PARTS | DENY_NAMES):
                excludes += ["-e", name]
            self._git("clean", "-fd", "-q", *excludes)
            self.mutation_count += 1
            self._emit("git", {"op": "rollback", "sha": full, "message": f"rolled back to {full[:10]}"})
            return full

    def unwind_checkpoint(self, original_head: str) -> None:
        """Undo a checkpoint commit without touching the files: HEAD and the
        index go back to `original_head`, the working tree keeps the
        checkpointed (previously uncommitted) content. Used when an
        improvement run ends without committing, so work that was never
        tested does not stay committed under a checkpoint label."""
        with self._lock:
            full = self._verify_commit(original_head)
            if self.head() == full:
                return
            self._git("reset", "-q", "--mixed", full)
            self._emit("git", {"op": "checkpoint", "sha": full,
                               "message": "restored uncommitted work after an improvement that did not commit"})

    # -- tamper tripwire -----------------------------------------------------------
    def _git_meta_files(self) -> list[Path]:
        git_dir = self.root / ".git"
        files = [git_dir / "config"]
        for sub in ("hooks", "info"):
            folder = git_dir / sub
            if folder.is_dir():
                files += [p for p in folder.rglob("*") if p.is_file()]
        return files

    def git_meta_snapshot(self) -> dict[str, bytes]:
        """Bytes of .git/config and every file under .git/hooks and
        .git/info — the places where code planted by a test run would
        execute later or change what git does."""
        snap: dict[str, bytes] = {}
        for path in self._git_meta_files():
            try:
                snap[str(path)] = path.read_bytes()
            except OSError:
                continue
        return snap

    def git_meta_restore(self, snapshot: dict[str, bytes]) -> list[str]:
        """Put .git metadata back exactly as `snapshot` had it. Returns the
        repo-relative paths that had been changed, added, or removed."""
        changed: list[str] = []
        current = {str(p) for p in self._git_meta_files()}
        for path_str in sorted(current - set(snapshot)):
            try:
                Path(path_str).unlink()
            except OSError:
                pass
            changed.append(os.path.relpath(path_str, self.root))
        for path_str, data in snapshot.items():
            path = Path(path_str)
            try:
                if path.is_file() and path.read_bytes() == data:
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            except OSError:
                pass
            changed.append(os.path.relpath(path_str, self.root))
        return changed
