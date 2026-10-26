"""TenderGraph FastAPI service — own port, osiiso-scheduled bid-seeking loop."""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import time

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from .bidseeker import BidSeeker
from .osiiso import Scheduler
from .registry import seed_nodes

engine = BidSeeker()
STARTED = time.time()
INTERVAL_S = float(os.getenv("TENDER_INTERVAL_S", "900"))


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    for n in seed_nodes():  # Agent = Graph: seed the registry into the graph
        engine.graph.ensure(n["id"], n["text"], archetype=n["archetype"], **n.get("attrs", {}))
    sched = Scheduler(engine.osiiso, tick_s=1.0)
    sched.add("bid-cycle", engine.cycle, interval_s=INTERVAL_S, nature="async")
    sched.add("hebbian-decay", engine.graph.decay, interval_s=max(60.0, INTERVAL_S / 4), nature="thread")
    task = asyncio.create_task(sched.run_forever())
    engine.recorder.record("boot", {"interval_s": INTERVAL_S})
    try:
        yield
    finally:
        sched.stop()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await engine.osiiso.aclose()


app = FastAPI(title="TenderGraph", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True, "uptime_s": int(time.time() - STARTED), "service": "tendergraph"}


@app.get("/status")
async def status():
    return engine.status()


@app.post("/tick")
async def tick(force: bool = False):
    return await engine.cycle(force=force)


@app.post("/pause")
async def pause(reason: str = "manual"):
    engine.control.pause(reason)
    return engine.control.status()


@app.post("/resume")
async def resume():
    engine.control.resume()
    return engine.control.status()


@app.post("/halt")
async def halt():
    engine.control.halt()
    return engine.control.status()


@app.get("/tenders")
async def tenders(limit: int = 50):
    rows = [{"id": n, **{k: d.get(k) for k in ("text", "archetype")}, **d.get("attrs", {})}
            for n, d in engine.graph.g.nodes(data=True) if d.get("archetype") == "tender"]
    return {"count": len(rows), "tenders": rows[:limit]}


@app.get("/packages")
async def packages():
    return {"count": len(engine.packages),
            "packages": [p.model_dump() for p in engine.packages.values()]}


@app.get("/packages/{tender_id}")
async def package(tender_id: str):
    p = engine.packages.get(tender_id)
    return p.model_dump() if p else {"error": "no package for that tender"}


@app.get("/graph")
async def graph(query: str = "", k: int = 12):
    if query:
        return {"hits": engine.graph.recall(query, k=k)}
    return engine.graph.stats()


@app.get("/recorder/frames")
async def recorder_frames(since: int = 0, limit: int = 1000):
    return {"head": engine.recorder.head(), "frames": engine.recorder.frames(since, limit)}


@app.get("/recorder/stream")
async def recorder_stream():
    q = engine.recorder.subscribe()

    async def gen():
        try:
            yield f"data: {json.dumps({'type': 'hello', 'head': engine.recorder.head()})}\n\n"
            while True:
                frame = await q.get()
                yield f"data: {json.dumps(frame)}\n\n"
        finally:
            engine.recorder.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
