import asyncio
import json

import pytest

import rungs
from rungs import Context, GraphRung, NoRung, Router, passes


class FakeGraph:
    def slice(self, k, public=False):
        return json.dumps({"nodes": [{"id": "q-energy", "type": "question", "label": "Which energy forecasts in circulation are stale, and who still cites them?",
                                      "falsifier": "the IEA restates the 1,000 TWh figure for 2026"},
                                     {"id": "g-map", "type": "goal", "label": "Map where AI capability, money, compute and energy actually stand"}],
                           "edges": [{"id": "e1", "members": ["q-energy", "g-map"]}]})


class Stub:
    def __init__(self, name, reply=None, raises=False):
        self.name, self.reply, self.raises, self.calls = name, reply, raises, 0

    def answer(self, q, ctx):
        self.calls += 1
        if self.raises:
            raise RuntimeError("server down")
        return self.reply


def run(coro):
    return asyncio.run(coro)


def test_graph_rung_answers_a_lookup_from_the_published_slice_and_declines_the_rest():
    ctx = Context(FakeGraph())
    a = GraphRung().answer("What is q-energy?", ctx)
    assert a and "no model" in a and "Refuted if" in a and "Map where AI" in a
    assert GraphRung().answer("Write me a long essay on the future of energy markets in Europe over twenty years please", ctx) is None
    assert GraphRung().answer("What is q-nothing?", ctx) is None


def test_router_asks_the_cheapest_rung_first_and_stops_at_the_first_pass():
    cheap, mid, top = Stub("lstm", "x" * 10), Stub("8b", "A full answer from the mid rung about the graph."), Stub("30b", "top")
    r = Router([top, cheap, mid])
    assert [x.name for x in r.rungs] == ["lstm", "8b", "30b"]
    res = run(r.answer("anything", Context()))
    assert res["rung"] == "8b" and top.calls == 0
    assert [t["why"] for t in res["tried"]] == ["too short"]


def test_a_rung_that_errors_rests_and_a_decline_falls_through():
    down, ok = Stub("lstm", raises=True), Stub("30b", "A good long answer that the checks accept easily.")
    r = Router([down, ok], cooldown=60)
    res = run(r.answer("q", Context()))
    assert res["rung"] == "30b" and res["tried"][0]["why"].startswith("error")
    run(r.answer("q", Context()))
    assert down.calls == 1                      # resting: not asked again inside the cooldown
    r2 = Router([Stub("tiny", None), ok])
    assert run(r2.answer("q", Context()))["tried"] == [{"rung": "tiny", "why": "declined"}]


def test_no_rung_when_everything_declines():
    with pytest.raises(NoRung):
        run(Router([Stub("lstm", None), Stub("30b", "nope")]).answer("q", Context()))


def test_checks():
    assert passes("I don't know anything about that, sorry to say.", "q", Context()) == (False, "refused or did not know")
    assert passes("short", "q", Context()) == (False, "too short")
    ctx = Context(FakeGraph(), require_cite=True)
    assert passes("The question of stale forecasts is open and tracked.", "q", ctx) == (False, "cites no node id")
    assert passes("q-energy is open; its falsifier is the IEA restating the figure.", "q", ctx) == (True, "")


def test_servers_parse_and_unknown_rungs_are_refused():
    rs = rungs.parse_servers("lstm=http://lstm:8000#lstm-50m, 8b=http://small-fast:8000#qwen")
    assert [(r.name, r.url, r.model) for r in rs] == [("lstm", "http://lstm:8000", "lstm-50m"), ("8b", "http://small-fast:8000", "qwen")]
    with pytest.raises(ValueError):
        rungs.parse_servers("huge=http://x#m")
    with pytest.raises(ValueError):
        Router([Stub("huge", "x")])
    with pytest.raises(ValueError):
        rungs.parse_servers("lstm=nourl")


def test_the_serving_ladder_keeps_the_top_as_its_floor():
    honest = Stub("30b", "I don't know; the published graph is silent on that question.")
    res = run(Router([Stub("lstm", None), honest], floor=True).answer("q", Context()))
    assert res["rung"] == "30b" and res["unchecked"] == "refused or did not know" and res["tried"] == [{"rung": "lstm", "why": "declined"}]
    with pytest.raises(NoRung) as ex:                     # only the top is a floor: a short answer below it with the top down is no answer
        run(Router([Stub("lstm", "short"), Stub("30b", raises=True)], floor=True).answer("q", Context()))
    assert [t["rung"] for t in ex.value.tried] == ["lstm", "30b"]


def test_rung_top_names_the_configured_model_and_every_rung_has_a_price(monkeypatch):
    import apikeys
    assert set(apikeys.RUNG_PRICE) == set(rungs.LADDER)
    monkeypatch.setenv("RUNG_TOP", "8b")
    monkeypatch.delenv("RUNG_SERVERS", raising=False)
    r = rungs.from_env(object())
    assert [x.name for x in r.rungs] == ["graph", "8b"] and r.floor
    monkeypatch.setenv("RUNG_TOP", "off")
    assert [x.name for x in rungs.from_env(object()).rungs] == ["graph"]
