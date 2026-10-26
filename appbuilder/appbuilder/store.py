"""SQLite persistence for the Studio — one file in STATE_DIR. Typed in/out via models."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from .models import (Build, Check, Evidence, Job, PatchProposal, Project,
                     Recording, Rule, Skill, Step)

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS builds(id TEXT PRIMARY KEY, project_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checks(id TEXT PRIMARY KEY, build_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recordings(id TEXT PRIMARY KEY, build_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, project_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, build_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patches(id TEXT PRIMARY KEY, build_id TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_builds_proj ON builds(project_id);
CREATE INDEX IF NOT EXISTS ix_checks_build ON checks(build_id);
CREATE INDEX IF NOT EXISTS ix_ev_build ON evidence(build_id);
CREATE INDEX IF NOT EXISTS ix_patch_build ON patches(build_id);
"""


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._c = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._c.row_factory = sqlite3.Row
        self._c.execute("PRAGMA journal_mode=WAL")
        self._c.executescript(SCHEMA)

    def _put(self, table: str, row_id: str, obj: Any, **cols):
        with self._lock:
            keys = ["id", "data", *cols.keys()]
            vals = [row_id, obj.model_dump_json(), *cols.values()]
            ph = ",".join("?" * len(keys))
            self._c.execute(f"INSERT OR REPLACE INTO {table}({','.join(keys)}) VALUES({ph})", vals)

    def _get(self, table: str, row_id: str, model):
        with self._lock:
            r = self._c.execute(f"SELECT data FROM {table} WHERE id=?", (row_id,)).fetchone()
            return model.model_validate_json(r["data"]) if r else None

    def _list(self, table: str, model, where: str = "", args: tuple = ()):
        with self._lock:
            sql = f"SELECT data FROM {table} {('WHERE ' + where) if where else ''}"
            return [model.model_validate_json(r["data"]) for r in self._c.execute(sql, args).fetchall()]

    # projects
    def put_project(self, p: Project): self._put("projects", p.id, p)
    def get_project(self, pid: str) -> Project | None: return self._get("projects", pid, Project)
    def list_projects(self) -> list[Project]: return self._list("projects", Project)

    # builds
    def put_build(self, b: Build): self._put("builds", b.id, b, project_id=b.project_id)
    def get_build(self, bid: str) -> Build | None: return self._get("builds", bid, Build)
    def list_builds(self, project_id: str | None = None) -> list[Build]:
        return self._list("builds", Build, *(("project_id=?", (project_id,)) if project_id else ()))

    # checks
    def put_check(self, c: Check): self._put("checks", c.id, c, build_id=c.build_id)
    def checks_for(self, build_id: str) -> list[Check]:
        return self._list("checks", Check, "build_id=?", (build_id,))

    # recordings
    def put_recording(self, r: Recording): self._put("recordings", r.id, r, build_id=r.build_id)
    def get_recording(self, rid: str) -> Recording | None: return self._get("recordings", rid, Recording)
    def recordings_for(self, build_id: str) -> list[Recording]:
        return self._list("recordings", Recording, "build_id=?", (build_id,))

    # skills
    def put_skill(self, s: Skill): self._put("skills", s.id, s, project_id=s.project_id)
    def get_skill(self, sid: str) -> Skill | None: return self._get("skills", sid, Skill)
    def skills_for(self, project_id: str) -> list[Skill]:
        return self._list("skills", Skill, "project_id=?", (project_id,))

    # evidence
    def put_evidence(self, e: Evidence): self._put("evidence", e.id, e, build_id=e.build_id)
    def evidence_for(self, build_id: str) -> list[Evidence]:
        return self._list("evidence", Evidence, "build_id=?", (build_id,))

    # jobs
    def put_job(self, j: Job): self._put("jobs", j.id, j)
    def get_job(self, jid: str) -> Job | None: return self._get("jobs", jid, Job)
    def list_jobs(self) -> list[Job]: return self._list("jobs", Job)

    # patches
    def put_patch(self, p: PatchProposal): self._put("patches", p.id, p, build_id=p.build_id)
    def get_patch(self, pid: str) -> PatchProposal | None: return self._get("patches", pid, PatchProposal)
    def patches_for(self, build_id: str) -> list[PatchProposal]:
        return self._list("patches", PatchProposal, "build_id=?", (build_id,))

    def pass_rate(self) -> dict:
        with self._lock:
            builds = self.list_builds()
            total = len(builds)
            passed = sum(1 for b in builds if b.status.value == "passed")
            return {"builds": total, "passed": passed,
                    "pass_rate": round(passed / total, 3) if total else 0.0}
