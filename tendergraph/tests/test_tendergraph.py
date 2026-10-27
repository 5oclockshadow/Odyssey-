import time
"""TenderGraph: osiiso lanes, graph plasticity, discovery, and the bid-seeking cycle."""
import asyncio

from tendergraph.bidseeker import BidSeeker, _score_tender, DEFAULT_CAPABILITIES
from tendergraph.graph import Graph
from tendergraph.models import FitScore, Tender, TenderStatus
from tendergraph.osiiso import Lane, Osiiso, cpu_bound
from tendergraph.recorder import Recorder
from tendergraph.sources import discover_all, sample_tenders


# -- osiiso ------------------------------------------------------------------ #
@cpu_bound
def _sq(x):  # module-level so the PROCESS lane can pickle it
    return x ** 2


async def test_osiiso_routes_by_nature():
    o = Osiiso()
    async def coro(x): return x + 1
    def blocking(x): return x * 2
    assert o.classify(coro) is Lane.ASYNC
    assert o.classify(blocking) is Lane.THREAD
    assert o.classify(_sq) is Lane.PROCESS
    assert await o.run(coro, 1) == 2
    assert await o.run(blocking, 3) == 6
    assert await o.run(_sq, 4) == 16
    await o.aclose()


async def test_osiiso_map_concurrent():
    o = Osiiso()
    def dbl(x): return x * 2
    out = await o.map(dbl, [1, 2, 3], nature="thread")
    assert sorted(out) == [2, 4, 6]
    await o.aclose()


async def test_osiiso_25_lanes_and_15_minimum_fanout():
    import threading
    o = Osiiso()
    assert o.lanes == 25 and o.min_lanes == 15 and o.snapshot()["lanes"] == 25
    peak, now, lock = [0], [0], threading.Lock()

    def slow(x):
        with lock:
            now[0] += 1
            peak[0] = max(peak[0], now[0])
        time.sleep(0.2)
        with lock:
            now[0] -= 1
        return x

    out = await o.map(slow, list(range(40)), nature="thread")
    assert sorted(out) == list(range(40)) and peak[0] == 25          # all 25 lanes used at once
    o.stats[Lane.ASYNC].inflight = 20                                 # most lanes busy elsewhere …
    peak[0] = 0
    await o.map(slow, list(range(30)), nature="thread")
    assert peak[0] >= 15                                              # … a thought still gets 15
    o.stats[Lane.ASYNC].inflight = 0
    await o.aclose()


# -- graph plasticity -------------------------------------------------------- #
def test_graph_recall_and_hebbian():
    g = Graph()
    g.ensure("tender:a", "sewer relining trenchless CIPP", archetype="tender")
    g.ensure("cap:sewer", "sewer", archetype="opportunity")
    g.coactivate(["tender:a", "cap:sewer"], lr=0.3)
    hits = [h["id"] for h in g.recall("sewer relining")]
    assert "tender:a" in hits


def test_graph_decay_bounds_plasticity():
    g = Graph()
    g.ensure("a", "x"); g.ensure("b", "y")
    g.coactivate(["a", "b"], lr=0.05)
    w0 = g.g["a"]["b"]["coactivates"]["w"]
    for _ in range(20):
        g.decay(rate=0.01)
    # the edge decays and is eventually pruned (no saturation / no orphan weight)
    assert not g.g.has_edge("a", "b", key="coactivates") or g.g["a"]["b"]["coactivates"]["w"] < w0


# -- sources ----------------------------------------------------------------- #
def test_sample_tenders_offline():
    t = sample_tenders("city:edmonton")
    assert t and all(isinstance(x, Tender) for x in t)
    assert any("sewer" in x.category or "roads" in x.category for x in t)


def test_discover_all_includes_edmonton_and_federal():
    ids = {t.id for t in discover_all()}
    assert "T-EDM-SEWER-002" in ids and "T-CAN-DEF-010" in ids


# -- scoring ----------------------------------------------------------------- #
def test_score_tender_is_explainable_and_clamped():
    import time
    raw = Tender(id="x", title="Municipal data platform modernization analytics graph ai",
                 category="IT", value_cad=18_000_000, closes="2099-01-01T00:00:00Z",
                 status=TenderStatus.OPEN).model_dump()
    fit = FitScore(**_score_tender(raw, DEFAULT_CAPABILITIES, time.time()))
    assert 0.0 <= fit.score <= 1.0
    assert fit.reasons and fit.win_path in ("bid", "unsolicited", "partner", "watch")


# -- the cycle --------------------------------------------------------------- #
def test_bidseeker_cycle_discovers_scores_and_preps(tmp_path):
    eng = BidSeeker(recorder=Recorder(tmp_path / "tape.jsonl"))
    eng.control.enable()  # auto on (manual, no env needed)
    res = asyncio.run(eng.cycle(force=True))
    assert res["discovered"] >= 4 and res["scored"] >= 4
    assert res["prepped"] >= 1                      # at least one high-fit package
    assert eng.packages                              # package objects exist
    # graph now holds tenders + fits (Agent = Graph)
    arche = eng.graph.stats()["archetypes"]
    assert arche.get("tender", 0) >= 4
    # recorded for playback
    assert any(f["kind"] == "cycle" for f in eng.recorder.frames())


def test_bidseeker_paused_skips(tmp_path):
    eng = BidSeeker(recorder=Recorder(tmp_path / "tape.jsonl"))
    eng.control.enable(); eng.control.pause("manual")
    assert "skipped" in asyncio.run(eng.cycle())
