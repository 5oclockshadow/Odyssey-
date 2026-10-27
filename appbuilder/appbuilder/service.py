"""Ability-Based App Builder (Skilld Studio) — FastAPI backend.

Implements the product's routes over the build engine + Tester, with the recorder
for live/replay and SOC 2 evidence per build.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import tester as T
from .engine import BuildEngine, criteria_for
from .models import Job, JobKind, JobResult, Project
from .recorder import Recorder
from .store import Store

STATE = Path(os.getenv("STUDIO_STATE", "/tmp/appbuilder"))
store = Store(STATE / "studio.db")
recorder = Recorder(STATE / "tape.jsonl")
engine = BuildEngine(store, recorder)
app = FastAPI(title="Ability-Based App Builder")
STARTED = time.time()


@app.get("/health")
async def health():
    return {"ok": True, "uptime_s": int(time.time() - STARTED), "service": "appbuilder"}


# -- projects ---------------------------------------------------------------- #
class ProjectIn(BaseModel):
    title: str = "Untitled"
    format: str = "ui-mockups"
    engine: str = "default"
    owner: str = ""


@app.post("/projects")
async def create_project(body: ProjectIn):
    p = Project(**body.model_dump())
    store.put_project(p)
    return p.model_dump()


@app.get("/projects")
async def list_projects():
    return [p.model_dump() for p in store.list_projects()]


@app.get("/projects/{pid}")
async def get_project(pid: str):
    p = store.get_project(pid)
    if not p:
        raise HTTPException(404, "no such project")
    return {**p.model_dump(), "builds": [b.model_dump() for b in store.list_builds(pid)],
            "skills": [s.model_dump() for s in store.skills_for(pid)]}


# -- builds ------------------------------------------------------------------ #
@app.post("/projects/{pid}/builds")
async def create_build(pid: str, max_rounds: int = 4):
    p = store.get_project(pid)
    if not p:
        raise HTTPException(404, "no such project")
    b = engine.run_build(pid, max_rounds=max_rounds, owner=p.owner or None)
    return b.model_dump()


@app.get("/builds/{bid}")
async def get_build(bid: str):
    b = store.get_build(bid)
    if not b:
        raise HTTPException(404, "no such build")
    return {**b.model_dump(), "checks": [c.model_dump() for c in store.checks_for(bid)]}


@app.get("/builds/{bid}/evidence")
async def build_evidence(bid: str):
    ev = store.evidence_for(bid)
    from . import soc2
    return {"ready": soc2.ready(ev), "evidence": [e.model_dump() for e in ev]}


@app.get("/builds/{bid}/recording")
async def build_recording(bid: str):
    recs = store.recordings_for(bid)
    return {"recordings": [r.model_dump() for r in recs]}


@app.get("/recordings/{rid}/replay")
async def replay(rid: str):
    r = store.get_recording(rid)
    if not r:
        raise HTTPException(404, "no such recording")
    return {"steps": [s.model_dump() for s in r.steps]}  # scrubbable, version-swapping


# -- skills & learned rules -------------------------------------------------- #
@app.get("/skills/{sid}")
async def get_skill(sid: str):
    s = store.get_skill(sid)
    if not s:
        raise HTTPException(404, "no such skill")
    return s.model_dump()


@app.post("/skills/{sid}/rules/{rid}/rollback")
async def rollback_rule(sid: str, rid: str):
    s = store.get_skill(sid)
    if not s:
        raise HTTPException(404, "no such skill")
    found = False
    for r in s.rules:
        if r.id == rid:
            r.active = False
            found = True
    if not found:
        raise HTTPException(404, "no such rule")
    store.put_skill(s)
    return s.model_dump()


# -- jobs (batch | academy) -------------------------------------------------- #
class JobIn(BaseModel):
    kind: str = "batch"
    templates: list[str] = Field(default_factory=lambda: ["ui-mockups", "slides"])
    rounds: int = 1                 # academy: how many builds per template


@app.post("/jobs")
async def create_job(body: JobIn):
    job = Job(kind=JobKind(body.kind))
    n = 130 if job.kind is JobKind.ACADEMY else max(1, body.rounds)
    for tmpl in body.templates:
        first = finals = 0
        for i in range(n):
            p = Project(title=f"{job.kind.value}:{tmpl}:{i}", format=tmpl, owner="batch")
            store.put_project(p)
            b = engine.run_build(p.id, owner="batch")
            if b.round == 0 and b.status.value == "passed":
                first += 1
            if b.status.value == "passed":
                finals += 1
        job.results.append(JobResult(template=tmpl, first_pass=round(first / n, 3),
                                     final_pass=round(finals / n, 3)))
    job.status = "done"
    store.put_job(job)
    recorder.record("job", {"id": job.id, "kind": job.kind.value,
                            "results": [r.model_dump() for r in job.results]})
    return job.model_dump()


@app.get("/jobs/{jid}")
async def get_job(jid: str):
    j = store.get_job(jid)
    if not j:
        raise HTTPException(404, "no such job")
    return j.model_dump()


@app.get("/reports/pass-rate")
async def pass_rate():
    return store.pass_rate()


# -- Tester ------------------------------------------------------------------ #
@app.post("/tester/audit")
async def tester_audit(build_id: str):
    return T.run_audit(store, build_id)


@app.post("/tester/chaos")
async def tester_chaos(build_id: str):
    return T.run_chaos(store, build_id)


class PatchIn(BaseModel):
    build_id: str
    reason: str
    target: str
    diff: str = ""


@app.post("/tester/propose-patch")
async def tester_propose(body: PatchIn):
    return T.propose_patch(store, body.build_id, body.reason, body.target, body.diff)


@app.post("/tester/approve")
async def tester_approve(patch_id: str, approved_by: str = ""):
    return T.approve_and_apply(store, patch_id, approved_by)


# -- recorder (live view + playback) ----------------------------------------- #
@app.get("/recorder/frames")
async def recorder_frames(since: int = 0, limit: int = 1000):
    return {"head": recorder.head(), "frames": recorder.frames(since, limit)}


@app.get("/recorder/stream")
async def recorder_stream():
    q = recorder.subscribe()

    async def gen():
        try:
            yield f"data: {json.dumps({'type': 'hello', 'head': recorder.head()})}\n\n"
            while True:
                frame = await q.get()
                yield f"data: {json.dumps(frame)}\n\n"
        finally:
            recorder.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
