"""The simulated world, the repricing ledger and the /v1 door: no network, no docker, no model. pytest -q"""
import asyncio
import random
import time

import pytest
from fastapi.testclient import TestClient

import apikeys
import ledger
import reprice
import sim


@pytest.fixture
def st(tmp_path, monkeypatch):
    for m in (sim, reprice, apikeys, ledger):
        monkeypatch.setattr(m, "STATE", tmp_path)
    monkeypatch.setattr(apikeys, "DIR", tmp_path / "api")
    monkeypatch.delenv("THRESHOLD_ENV", raising=False)
    return tmp_path


GOOD = dict(asset="Copper", kind="commodity", unit="USD/t", confidence="medium", market=9800.0, as_of="2026-10-19", fair_low=8200.0, fair_high=10100.0,
            why="Data-centre wiring demand is priced as if the build-out never slows, while inventories are rising.",
            scenarios=[{"name": "small models suffice", "p": 0.3, "rerate_pct": -18}, {"name": "build-out continues", "p": 0.5, "rerate_pct": 4}, {"name": "credit event", "p": 0.2, "rerate_pct": -9}],
            drivers=[{"name": "inventories", "direction": -1, "weight": 0.6, "evidence": ["s1"]}, {"name": "grid demand", "direction": 1, "weight": 0.4, "evidence": ["s2"]}],
            sources=[{"id": "s1", "label": "LME stocks", "url": "https://x/1", "basis": "real", "as_of": "2026-10-19"}, {"id": "s2", "label": "IEA", "url": "https://x/2", "basis": "real"}],
            limits=["The split of copper demand between data centres and other uses is an estimate."])


# — the world —

def test_the_world_is_simulated_until_production_and_the_owner_can_override(st, monkeypatch):
    cfg = {"world": {"mode": "auto"}}
    assert sim.mode(cfg) == "sim"
    monkeypatch.setenv("THRESHOLD_ENV", "production")
    assert sim.mode(cfg) == "live"
    sim.set_mode("sim")
    assert sim.mode(cfg) == "sim" and sim.status({**cfg, "model": "m"})["setting"] == "sim"
    sim.set_mode("auto")
    assert sim.mode(cfg) == "live"
    with pytest.raises(ValueError):
        sim.set_mode("both")


def test_novelty_drops_repeats_and_reorderings_but_keeps_new_angles():
    seen = ["Data-centre electricity demand revised down 8% in the 2026 outlook"]
    assert not sim.novel("Data-centre electricity demand revised down 8% in the 2026 outlook", seen, 0.6)
    assert not sim.novel("Electricity demand for data-centre revised down by 8%, 2026 outlook", seen, 0.6)
    assert sim.novel("Copper cathode inventories at LME warehouses hit a five-year low", seen, 0.6)
    assert not sim.novel("", seen, 0.6)


def test_beats_favour_the_stale_and_thinly_supported_and_the_watcher_is_found():
    nodes = {"q1": {"id": "q1", "type": "question", "label": "one"}, "q2": {"id": "q2", "type": "question", "label": "two"}, "c1": {"id": "c1", "type": "claim", "label": "a claim"}}
    edges = {"e": {"id": "e", "relation": "bears_on", "members": ["c1", "q1"], "w": 3.0}}
    bs = sim.beats(nodes, edges, {"beats": {"q1": time.time()}})
    q1, q2 = (next(b for b in bs if b["id"] == i) for i in ("q1", "q2"))
    assert {b["id"] for b in bs} == {"q1", "q2"} and q1["support"] == 3.0 and q2["stale"] > q1["stale"]
    assert [sim.pick(bs, random.Random(i))["id"] for i in range(40)].count("q2") > 20
    assert sim.standing(nodes, edges, "q1") == "bears_on: a claim"
    agents = {"w": {"from_node": "q1", "enabled": True}, "x": {"from_node": "q2", "enabled": False}}
    assert sim.route("q1", agents) == "w" and sim.route("q2", agents) == "" and sim.route("q9", agents) == ""


def test_a_turn_keeps_only_novel_items_and_never_repeats_across_turns(st):
    calls = []

    async def gen(cfg, **kw):
        calls.append(kw)
        return [{"kind": "paper", "title": "GPU rental prices fall 12% in a quarter", "source": "Example Review", "summary": "Rates fell.", "stance": "supports"},
                {"kind": "feed", "title": "Hyperscaler pauses two data-centre leases", "source": "Example Wire", "summary": "Two leases.", "stance": "contradicts"}]

    cfg, nodes = {"model": "m", "world": {"novelty": 0.6, "wildcard_every": 0}}, {"q1": {"id": "q1", "type": "question", "label": "one"}}
    first = asyncio.run(sim.turn(cfg, nodes, {}, {}, gen=gen))
    assert len(first) == 2 and all(i["beat"] == "q1" and i["agent"] == "" for i in first)
    assert asyncio.run(sim.turn(cfg, nodes, {}, {}, gen=gen)) == [] and len(calls) == 3
    assert "different angle" in calls[2]["already"] and "GPU rental prices fall" in calls[1]["already"]
    s = sim.status(cfg)
    assert (s["turns"], s["items"], s["rejected"], s["seen"]) == (2, 2, 4, 2)


def test_the_intake_marks_the_item_simulated_and_titles_cleanly():
    it = {"kind": "paper", "title": "Rates fall", "source": "Example Review", "summary": "s", "stance": "supports", "beat": "q1", "agent": "grid"}
    t = sim.intake(it, {"id": "q1", "label": "one"}, {"role": "energy", "prompt": "watch"})
    assert t.startswith("[sub-agent grid · energy] watch") and "SIMULATED WORLD ITEM" in t and "sim:" in t
    assert ledger.title_for("ingest", t) == "Read an item: Rates fall"
    assert ledger.title_for("reprice", "REPRICE: Copper\nMETHOD") == "Reprice: Copper" and ledger.title_for("reprice", "LIMITS round") == "Work down the limitations"


def test_the_signature_asks_for_typed_items():
    assert {"items"} <= set(sim.WorldTurn.output_fields) and {"clock", "beat", "already", "stance"} <= set(sim.WorldTurn.input_fields)


# — the repricing ledger —

def test_a_record_is_computed_stored_and_shown_with_its_history(st):
    r = reprice.record(GOOD)
    assert r["expected_rerate"] == -5.2 and r["rerate_low"] == -18 and r["rerate_high"] == 4 and r["basis"] == "real" and r["publishable"] and r["net_drivers"] == -0.2
    reprice.record({**GOOD, "market": 9900.0})
    b = reprice.board()
    assert len(b) == 1 and len(b[0]["history"]) == 2 and b[0]["pub"] is False and reprice.board(public=True) == []


@pytest.mark.parametrize("patch,msg", [
    ({"scenarios": [{"name": "a", "p": 0.5, "rerate_pct": -10}, {"name": "b", "p": 0.2, "rerate_pct": 5}]}, "sum"),
    ({"scenarios": [{"name": "a", "p": 0.5, "rerate_pct": -10}, {"name": "b", "p": 0.5, "rerate_pct": -4}]}, "both directions"),
    ({"drivers": [{"name": "a", "direction": 1, "weight": 0.5, "evidence": ["nope"]}, {"name": "b", "direction": -1, "weight": 0.5, "evidence": ["s1"]}]}, "cite source ids"),
    ({"fair_low": 10000.0, "fair_high": 12000.0}, "falls outside"),
    ({"limits": []}, "cannot see"),
    ({"confidence": "high"}, "three real sources"),
    ({"why": "too short"}, "what moves the price"),
    ({"fair_low": None, "fair_high": None}, "fair_low and fair_high"),
    ({"kind": "stock"}, "kind must be"),
    ({"sources": GOOD["sources"][:1]}, "two sources"),
])
def test_a_record_is_refused_until_it_is_fair_sourced_and_consistent(st, patch, msg):
    with pytest.raises(ValueError, match=msg):
        reprice.record({**GOOD, **patch})


def test_a_one_sided_view_needs_a_reason_and_nothing_simulated_is_ever_published(st):
    one = {"scenarios": [{"name": "a", "p": 0.6, "rerate_pct": -10}, {"name": "b", "p": 0.4, "rerate_pct": -4}], "fair_low": 8800.0, "fair_high": 9600.0}
    assert reprice.record({**GOOD, **one, "one_sided_reason": "every plausible path lowers it: supply is contracted through 2028"})["expected_rerate"] == -7.6
    sims = reprice.record({**GOOD, "asset": "Gallium", "sources": [{**s, "basis": "simulated"} for s in GOOD["sources"]]})
    assert sims["basis"] == "simulated" and not sims["publishable"]
    with pytest.raises(ValueError, match="simulated"):
        reprice.set_pub(sims["id"], True)
    real = next(r for r in reprice.board() if r["asset"] == "Copper")
    assert reprice.set_pub(real["id"], True)["pub"] and [r["asset"] for r in reprice.board(public=True)] == ["Copper"]
    assert "by" not in reprice.public_row(real) and "publishable" not in reprice.public_row(real)
    reprice.set_pub(real["id"], False)
    assert reprice.board(public=True) == []
    with pytest.raises(KeyError):
        reprice.set_pub("px-missing", True)


def test_limits_are_seeded_once_and_worked_down_with_evidence(st):
    cfg = {"reprice": {"limits": [{"text": "No live equity quotes are reachable from the engine", "area": "access", "severity": 3, "lifts_by": "a permitted quote source", "owner_needed": "a quote key"}]}}
    reprice.seed(cfg)
    reprice.seed(cfg)
    (first,) = reprice.limits()
    assert first["status"] == "open" and first["severity"] == 3 and first["owner_needed"] == "a quote key"
    w = reprice.note_limit({**first, "plan": "add a quote feed with source_add", "status": "working"})
    assert w["status"] == "working" and len(w["history"]) == 1
    with pytest.raises(ValueError, match="how it was lifted"):
        reprice.note_limit({**w, "status": "lifted", "plan": ""})
    assert reprice.note_limit({**w, "status": "lifted", "plan": "source stooq-quotes returned NVDA on 2026-10-20"})["status"] == "lifted"
    new = reprice.note_limit({"text": "GPU lease terms are not public for enterprise buyers", "area": "coverage", "severity": 2})
    assert new["id"] == "lim-2" and [l["id"] for l in reprice.limits()] == ["lim-2", "lim-1"]
    with pytest.raises(ValueError):
        reprice.note_limit({"text": "short"})
    assert "owner_needed" not in reprice.public_limits()[0]


def test_due_lists_never_priced_assets_before_the_stalest(st):
    cfg = {"reprice": {"watchlist": [{"asset": "Copper", "kind": "commodity"}, {"asset": "Uranium", "kind": "commodity"}]}}
    assert [a["asset"] for a in reprice.due(cfg, 2)] == ["Copper", "Uranium"]
    reprice.record(GOOD)
    assert [a["asset"] for a in reprice.due(cfg, 2)] == ["Uranium", "Copper"]


# — the /v1 door —

def test_v1_meters_by_rung_shapes_by_persona_and_keeps_the_unpublished_out(st, monkeypatch):
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    t = apikeys.create("acme", "metered", 5.0)
    h = {"authorization": f"Bearer {t['secret_shown_once']}"}
    reprice.set_pub(reprice.record(GOOD)["id"], True)
    reprice.record({**GOOD, "asset": "Secret"})
    c = TestClient(serve.app)
    assert c.get("/v1/reprice").status_code == 401 and c.get("/v1/reprice", headers={"authorization": "Bearer anma_wrong"}).status_code == 401
    civ = c.get("/v1/reprice", headers=h).json()
    assert [i["asset"] for i in civ["items"]] == ["Copper"] and "scenarios" not in civ["items"][0] and "not advice" in civ["disclaimer"]
    sch = c.get("/v1/reprice", headers={**h, "x-persona": "scholar"}).json()
    assert sch["items"][0]["scenarios"] and sch["items"][0]["sources"] and "by" not in sch["items"][0]
    assert c.get("/v1/reprice", headers={**h, "x-persona": "child"}).status_code == 403
    apikeys.update(t["id"], {"child_safe": True})
    kid = c.get("/v1/reprice", headers={**h, "x-persona": "child"}).json()
    assert kid["items"] == [] and "under 13" in kid["note"] and c.get("/v1/reprice/copper", headers={**h, "x-persona": "child"}).status_code == 403
    assert c.get("/v1/reprice", headers={**h, "x-persona": "nobody"}).status_code == 400
    assert c.get("/v1/reprice/copper", headers=h).json()["asset"] == "Copper" and c.get("/v1/reprice/secret", headers=h).status_code == 404
    assert c.get("/v1/limits", headers=h).status_code == 200
    s = apikeys.sheet()
    assert s["rung_totals"]["graph"]["calls"] == 4 and s["cpu_share"] == 1.0 and apikeys.spent(t["id"]) == 0.00004
    apikeys.update(t["id"], {"active": False})
    assert c.get("/v1/reprice", headers=h).status_code == 401


def test_v1_spend_cap_returns_402_and_lifts_when_the_cap_is_raised(st, monkeypatch):
    """Layer 5: at or over cap_usd the door returns 402; raising the cap restores 200. Money gates on real metered spend."""
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    t = apikeys.create("thrifty", "metered", 0.00001)          # one graph call ($0.00001) reaches the cap
    h = {"authorization": f"Bearer {t['secret_shown_once']}"}
    reprice.set_pub(reprice.record(GOOD)["id"], True)
    c = TestClient(serve.app)
    assert c.get("/v1/reprice", headers=h).status_code == 200  # spent 0 < cap, records 0.00001
    assert c.get("/v1/reprice", headers=h).status_code == 402  # spent 0.00001 >= cap
    apikeys.update(t["id"], {"cap_usd": 1.0})
    assert c.get("/v1/reprice", headers=h).status_code == 200
    assert apikeys.spent(t["id"]) == 0.00002                   # only the 200s metered; the 402 never ran


def test_v1_rate_limit_returns_429_and_resets_after_the_window(st, monkeypatch):
    """Layer 5: a persona's per-minute rate is enforced and recovers once the window passes."""
    import types

    import serve
    import v1
    now = [1000.0]
    monkeypatch.setattr(v1, "time", types.SimpleNamespace(time=lambda: now[0]))
    monkeypatch.setenv("SESSION_SECRET", "t")
    t = apikeys.create("burst", "metered", 0.0)                # cap 0 = no spend cap, isolate the rate limit
    h = {"authorization": f"Bearer {t['secret_shown_once']}"}
    reprice.set_pub(reprice.record(GOOD)["id"], True)
    c = TestClient(serve.app)
    rpm = v1.POLICY["civilian"]["rpm"]
    for _ in range(rpm):
        assert c.get("/v1/reprice", headers=h).status_code == 200
    assert c.get("/v1/reprice", headers=h).status_code == 429  # one past the window's allowance
    now[0] += 61                                               # the minute passes
    assert c.get("/v1/reprice", headers=h).status_code == 200


def test_v1_usage_is_scoped_to_the_calling_tenant(st, monkeypatch):
    """Layer 6: a key reads only its own tenant's usage; no cross-tenant leakage, and no key is anonymous."""
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    a = apikeys.create("acme", "metered", 0.0)
    b = apikeys.create("globex", "team", 0.0)
    ha = {"authorization": f"Bearer {a['secret_shown_once']}"}
    hb = {"authorization": f"Bearer {b['secret_shown_once']}"}
    c = TestClient(serve.app)
    ua = c.get("/v1/usage", headers=ha).json()
    ub = c.get("/v1/usage", headers=hb).json()
    assert ua["tenant"] == "acme" and ua["usage"]["id"] == a["id"] and ua["plan"] == "metered"
    assert ub["tenant"] == "globex" and ub["usage"]["id"] == b["id"]
    assert ua["usage"]["id"] != ub["usage"]["id"]              # neither sees the other
    assert c.get("/v1/usage").status_code == 401               # no key, no usage


def test_v1_accepts_the_key_as_x_api_key_and_guards_every_read(st, monkeypatch):
    """Layer 4: the key is honoured as x-api-key or Authorization: Bearer; every read needs one."""
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    t = apikeys.create("acme", "metered", 0.0)
    reprice.set_pub(reprice.record(GOOD)["id"], True)
    c = TestClient(serve.app)
    assert c.get("/v1/reprice", headers={"x-api-key": t["secret_shown_once"]}).status_code == 200
    assert c.get("/v1/limits").status_code == 401 and c.get("/v1/reprice/copper").status_code == 401


# — the contract between the pages and the engine —

def test_the_owner_apps_route_exists_and_needs_the_session(st, monkeypatch):
    import auth
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    c = TestClient(serve.app)
    assert c.get("/owner/apps").status_code == 401
    r = c.get("/owner/apps", headers={"authorization": f"Bearer {auth.issue()}"})
    assert r.status_code == 200 and "apps" in r.json()


def test_every_path_the_pages_call_is_a_real_route():
    import pathlib
    import re
    import serve
    src = pathlib.Path(__file__).resolve().parents[1] / "ops" / "src"
    if not src.exists():
        pytest.skip("the pages are not in this container")
    routes = [re.sub(r"\{[^}]+\}", "*", r.path).split("/") for r in serve.app.routes if hasattr(r, "path")]
    used = set()
    for p in src.iterdir():
        if p.suffix in (".html", ".js"):
            for m in re.finditer(r"['\"`](/(?:owner|public|auth|v1|tester)/[A-Za-z0-9_\-/{}.]*)", p.read_text()):
                used.add(re.sub(r"\{[^}]+\}", "*", m.group(1)).rstrip("/"))
    hit = lambda u: any(len(r) in (len(u.split("/")), len(u.split("/")) + 1) and all(a in ("*", b) for a, b in zip(r, u.split("/"))) for r in routes)
    planned = {"/v1/webhooks", "/v1/reprice/export"}          # shown in the API atlas as not built yet
    assert [u for u in sorted(used) if not hit(u) and u not in planned] == []
