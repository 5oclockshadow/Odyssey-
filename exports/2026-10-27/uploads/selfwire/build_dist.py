#!/usr/bin/env python3
"""
build_dist.py — packages a timestamped distribution zip: the clean
production source (selfwire/), the Docker infrastructure (Dockerfile,
docker-compose.yml), and the rest of the deployment-ready project exactly as
it sits in the repo — tests, demo, docs, packaging metadata. Excludes
caches, local state, and anything git-ignored.

Usage:
    python build_dist.py            # writes dist/selfwire-<timestamp>.zip
    python build_dist.py --check    # build, then verify the zip re-imports cleanly
"""

from __future__ import annotations

import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent

INCLUDE_TOP_LEVEL = [
    "selfwire",
    "tests",
    "skills",
    "docs",
    "scripts",
    "demo.py",
    "build_dist.py",
    "README.md",
    "CHANGELOG.md",
    "requirements.txt",
    "pyproject.toml",
    "Dockerfile",
    "docker-compose.yml",
    ".env.example",
]

EXCLUDE_DIR_NAMES = {"__pycache__", ".pytest_cache", ".git", "runtime_state", "reports", "dist", ".venv", ".selfwire"}
EXCLUDE_SUFFIXES = {".pyc"}


def iter_files():
    for top in INCLUDE_TOP_LEVEL:
        path = ROOT / top
        if not path.exists():
            print(f"  (skipping missing {top})")
            continue
        if path.is_file():
            yield path
            continue
        for p in path.rglob("*"):
            if not p.is_file():
                continue
            if any(part in EXCLUDE_DIR_NAMES for part in p.relative_to(ROOT).parts):
                continue
            if p.suffix in EXCLUDE_SUFFIXES:
                continue
            yield p


def build() -> Path:
    dist_dir = ROOT / "dist"
    dist_dir.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    out_path = dist_dir / f"selfwire-{stamp}.zip"

    files = sorted(iter_files())
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, arcname=f.relative_to(ROOT))

    print(f"wrote {out_path} ({len(files)} files, {out_path.stat().st_size / 1024:.1f} KiB)")
    return out_path


def check(zip_path: Path) -> None:
    """Extracts to a temp dir and imports the package from there, to prove
    the zip is actually self-contained and not missing a file."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
        result = subprocess.run(
            [sys.executable, "-c", "import selfwire; print('selfwire', selfwire.__version__, 'imports cleanly')"],
            cwd=tmp, capture_output=True, text=True, timeout=60,
        )
        print(result.stdout.strip())
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            raise SystemExit(f"dist zip failed to import cleanly (exit {result.returncode})")


if __name__ == "__main__":
    path = build()
    if "--check" in sys.argv:
        check(path)
