"""Sub-agents, signals and the dynamic display: no docker, no network, no model. pytest -q"""
import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient

import auth
import bus
import display
import fleet
import ledger
import parsers
import signals
import tools as T

TRENDS = ('<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>'
          '<item><title>solar storm</title><ht:approx_traffic>200K+</ht:approx_traffic><ht:news_item><ht:news_item_title>Aurora seen</ht:news_item_title></ht:news_item></item>'
          '<item><title>bare</title><link>http://x/b</link></item><item><link>http://no-title</link></item></channel></rss>')
RSS = "<rss><channel><item><title>A</title><link>http://a</link></item><item><title>B</title><link>http://b</link></item></channel></rss>"


class Box:
    def __init__(self, cs, labels, status="running"):
        self.cs, self.labels, self.status, self.out = cs, labels, status, []

    def remove(self, force=False):
        self.cs.items.remove(self)

    def stop(self):
        self.status = "exited"

    def start(self):
        self.status = "running"

    def logs(self, **kw):
        return "\n".join(self.out).encode()


class Cs:
    def __init__(self):
        self.items, self.envs = [], []

    def list(self, all=False, filters=None):
        k, _, v = (filters or {}).get("label", "=").partition("=")
        return [x for x in self.items if x.labels.get(k) == v and (all or x.status == "running")]

    def run(self, image, name, detach, labels, environment, **kw):
        self.items.append(Box(self, labels))
        self.envs.append(environment)


class Daemon:
    def __init__(self):
        self.containers, self.images = Cs(), type("I", (), {"get": lambda s, n: n})()


@pytest.fixture
def fx(tmp_path, monkeypatch):
    for m in (fleet, signals, display, ledger):
        monkeypatch.setattr(m, "STATE", tmp_path)
    ds = {"child": Daemon(), "sibling": Daemon()}
    monkeypatch.setattr(fleet, "docker_for", lambda w: ds[w])
    monkeypatch.setattr(fleet, "CFG", {"max": 4})
    monkeypatch.setattr(signals, "CFG", {"watch": {"feeds": ["http://seed.example/rss"], "trends": ["us"], "every_seconds": 900}})
    monkeypatch.setattr(fleet, "_since", {})
    return ds


class Store(bus.Store):
    def __init__(self):
        super().__init__("")


def test_parsers_read_trends_with_traffic_news_and_a_search_link():
    t = parsers.trends(TRENDS)
    assert [i["title"] for i in t] == ["solar storm", "bare"] and t[0]["traffic"] == "200K+" and t[0]["news"] == ["Aurora seen"]
    assert t[0]["link"].startswith("https://www.google.com/search?q=solar") and t[1]["link"] == "http://x/b"
    assert [i["link"] for i in parsers.rss(RSS)] == ["http://a", "http://b"]


def test_sources_seeded_added_validated_switched_off_and_removed(fx):
    ids = [s["id"] for s in signals.all_sources()]
    assert ids == ["yaml:0", "yaml:trends-US"]
    for bad in ({"kind": "rss", "url": "ftp://x"}, {"kind": "trends", "geo": "USA"}, {"kind": "atom", "url": "http://x"}):
        with pytest.raises(ValueError):
            signals.add(bad)
    s = signals.add({"kind": "trends", "geo": "ca", "every": 5}, "brain")
    assert s["url"].endswith("geo=CA") and s["every"] == 60 and s["by"] == "brain" and s["label"] == "Google Trends CA"
    with pytest.raises(ValueError):
        signals.add({"kind": "trends", "geo": "CA"})                                # already watched
    assert signals.update("yaml:0", {"enabled": False})["enabled"] is False
    with pytest.raises(ValueError):
        signals.update("yaml:0", {"label": "x"})                                    # seeds can only be switched
    with pytest.raises(ValueError):
        signals.remove("yaml:0")
    assert signals.update(s["id"], {"label": "Canada"})["label"] == "Canada" and signals.remove(s["id"])["id"] == s["id"]
    with pytest.raises(KeyError):
        signals.get(s["id"])


def test_pump_queues_each_item_once_and_records_status(fx, monkeypatch):
    class Resp:
        def __init__(self, text):
            self.text = text

    class Client:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, url): return Resp(TRENDS if "trending" in url else RSS)
    monkeypatch.setattr(signals.httpx, "AsyncClient", Client)
    got, store = [], Store()
    put = lambda k, t: got.append((k, t))
    assert asyncio.run(signals.pump(put, store)) == 4 and asyncio.run(signals.pump(put, store)) == 0
    assert any("Trending search" in t and "solar storm" in t and "Aurora seen" in t for _, t in got) and all(k == "ingest" for k, _ in got)
    st = signals.status()
    assert st["yaml:0"]["ok"] and st["yaml:trends-US"]["items"][0]["traffic"] == "200K+"
    signals.update("yaml:0", {"enabled": False})
    assert asyncio.run(signals.pump(put, store, force=True)) == 0                    # off means off


def test_pump_records_a_failure_without_raising(fx, monkeypatch):
    class Client:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, url): raise RuntimeError("dns")
    monkeypatch.setattr(signals.httpx, "AsyncClient", Client)
    assert asyncio.run(signals.pump(lambda k, t: None, Store())) == 0
    assert signals.status()["yaml:0"]["ok"] is False and "dns" in signals.status()["yaml:0"]["err"]


def test_fleet_create_runs_in_the_right_daemon_with_resolved_sources(fx):
    a = fleet.create({"name": "scout-ca", "role": "Canada", "sources": ["yaml:trends-US", "nope"], "prompt": "p"}, "brain")
    b = fleet.create({"name": "watcher", "where": "sibling"}, "owner")
    assert a["by"] == "brain" and a["status"] == "started" and len(fx["child"].containers.items) == 1 and len(fx["sibling"].containers.items) == 1
    assert b["where"] == "sibling" and json.loads(fx["child"].containers.envs[0]["SUB_SOURCES"])[0]["kind"] == "trends"
    assert [json.loads(fx["child"].containers.envs[0]["SUB_SOURCES"])] and len(json.loads(fx["child"].containers.envs[0]["SUB_SOURCES"])) == 1     # unknown ids are dropped
    for bad in ({"name": "Bad Name"}, {"name": "scout-ca"}, {"name": "x1", "where": "moon"}, {"name": "x2", "parent": "ghost"}, {"name": "x3", "sources": "all"}):
        with pytest.raises(ValueError):
            fleet.create(bad)
    fleet.create({"name": "c"}); fleet.create({"name": "d"})
    with pytest.raises(ValueError, match="full"):
        fleet.create({"name": "e"})
    assert [h["actor"] for h in fleet.history(10)] == ["owner", "owner", "owner", "brain"]


def test_update_rebuilds_pause_resume_move_and_delete_cascades(fx):
    fleet.create({"name": "root"})
    fleet.create({"name": "kid", "parent": "root"})
    fleet.create({"name": "grandkid", "parent": "kid", "where": "sibling"})
    assert [(a["id"], a["depth"]) for a in fleet.list_()] == [("root", 0), ("kid", 1), ("grandkid", 2)]
    old = fx["child"].containers.items[0]
    fleet.update("root", {"prompt": "new job"}, "brain")
    assert len(fx["child"].containers.items) == 2 and old not in fx["child"].containers.items          # the old revision was replaced, not duplicated
    assert fleet.act("root", "pause")["status"] == "paused" and fx["child"].containers.items[-1].status in ("exited", "running")
    assert next(a for a in fleet.list_() if a["id"] == "root")["status"] == "paused"
    assert fleet.act("root", "resume")["status"] in ("started", "running") and next(a for a in fleet.list_() if a["id"] == "root")["status"] == "running"
    fleet.update("kid", {"where": "sibling"})
    assert not [x for x in fx["child"].containers.items if x.labels["sub"] == "kid"] and [x for x in fx["sibling"].containers.items if x.labels["sub"] == "kid"]
    with pytest.raises(ValueError):
        fleet.update("root", {"parent": "grandkid"})                                                     # no cycles
    with pytest.raises(ValueError):
        fleet.update("root", {"parent": "root"})
    with pytest.raises(ValueError):
        fleet.update("root", {"name": "other"})
    assert sorted(fleet.delete("root", "brain")) == ["grandkid", "kid", "root"]
    assert not fx["child"].containers.items and not fx["sibling"].containers.items and fleet.load() == {}
    with pytest.raises(KeyError):
        fleet.delete("root")


def test_reconcile_restarts_the_stopped_rebuilds_the_missing_and_removes_orphans(fx):
    fleet.create({"name": "one"}); fleet.create({"name": "two", "where": "sibling"})
    fx["child"].containers.items[0].status = "exited"
    fx["sibling"].containers.items.clear()
    fx["child"].containers.items.append(Box(fx["child"].containers, {"threshold": "subagent", "sub": "ghost", "rev": "1"}))
    out = fleet.reconcile()
    assert "removed ghost" in out and "restarted one" in out and "started two" in out
    assert [x.labels["sub"] for x in fx["child"].containers.items] == ["one"] and fx["child"].containers.items[0].status == "running" and len(fx["sibling"].containers.items) == 1


def test_docker_down_is_reported_not_raised(fx, monkeypatch):
    fleet.create({"name": "solo"})
    monkeypatch.setattr(fleet, "docker_for", lambda w: (_ for _ in ()).throw(ConnectionError("no daemon")))
    assert fleet.list_()[0]["status"] == "docker unreachable" and fleet.reconcile() == [] and fleet.harvest(lambda *a: None, Store()) == 0
    assert fleet.update("solo", {"role": "x"})["status"].startswith("docker unreachable")


def test_harvest_turns_worker_items_into_rounds_once_and_counts_errors(fx):
    fleet.create({"name": "w", "role": "energy", "prompt": "Look for grid news."})
    fx["child"].containers.items[0].out = [json.dumps({"sub": "w", "ts": 5, "kind": "item", "source": "s", "label": "Trends", "title": "heat wave", "link": "http://h", "traffic": "50K+", "news": []}),
                                           json.dumps({"sub": "w", "ts": 6, "kind": "error", "source": "s", "message": "x"}), "not json", json.dumps({"sub": "other", "kind": "item", "title": "t", "link": "l"})]
    got, store = [], Store()
    assert fleet.harvest(lambda k, t: got.append(t), store) == 1 and "[sub-agent w · energy] Look for grid news." in got[0] and "heat wave" in got[0]
    fleet._since.clear()
    assert fleet.harvest(lambda k, t: got.append(t), store) == 0
    a = fleet.load()["w"]
    assert a["items"] == 1 and a["errors"] == 2 and a["last_seen"] == 6


def test_display_has_defaults_validates_orders_and_resolves_rows(fx, monkeypatch):
    assert [w["id"] for w in display.load()] == ["w-trends", "w-signals", "w-fleet", "w-vitals"]
    w = display.upsert({"type": "note", "title": "Watch", "text": "Review at 9", "size": 9}, "brain")
    assert w["size"] == 3 and w["by"] == "brain" and display.load()[-1]["id"] == w["id"]
    display.upsert({"id": w["id"], "order": 0})
    assert display.load()[0]["id"] == w["id"]
    for bad in ({"type": "map"}, {"view": "radar"}):
        with pytest.raises(ValueError):
            display.upsert(bad)
    monkeypatch.setattr(signals, "trends_live", lambda geo: parsers.trends(TRENDS))
    fleet.create({"name": "f1", "role": "r"})
    data = {x["id"]: x["rows"] for x in display.data({"nodes": 7, "model": "m"})}
    assert data[w["id"]][0]["title"] == "Review at 9" and data["w-trends"][0]["value"] == 200000 and data["w-fleet"][0]["title"] == "f1"
    assert {r["title"] for r in data["w-vitals"]} == {"nodes", "model"}
    display.upsert({"id": "w-trends", "enabled": False})
    assert {x["id"]: x["rows"] for x in display.data({})}["w-trends"] == []
    assert display.remove(w["id"]) == w["id"] and display.upsert({"id": "w-trends", "enabled": True})["enabled"]


def test_the_brain_has_the_same_crud_through_its_tools(fx, monkeypatch):
    from round import cfg
    assert set(T.FLEET_TOOLS) <= set(cfg["agent"]["tools"]) and all(getattr(getattr(T, n), "_signed", True) for n in T.FLEET_TOOLS)
    assert json.loads(T.fleet_create("tool-made", "r", "p", '["yaml:0"]'))["by"] == "brain"
    assert T.fleet_create("tool-made", "r", "p").startswith("refused") and T.fleet_act("tool-made", "dance").startswith("refused")
    assert json.loads(T.fleet_update("tool-made", '{"role": "changed"}'))["role"] == "changed" and json.loads(T.fleet_list())[0]["id"] == "tool-made"
    s = json.loads(T.source_add("trends", "gb"))
    assert s["geo"] == "GB" and s["by"] == "brain" and T.source_add("rss", "not a url").startswith("refused")
    assert any(x["id"] == s["id"] for x in json.loads(T.source_list())) and json.loads(T.source_remove(s["id"]))["id"] == s["id"]
    assert json.loads(T.display_set('{"type": "fleet", "title": "Mine"}'))["by"] == "brain" and T.display_set('{"type": "x"}').startswith("refused")
    assert json.loads(T.fleet_delete("tool-made")) == ["tool-made"] and T.fleet_logs("tool-made").startswith("refused")


def test_owner_api_is_login_only_and_does_full_crud(fx, monkeypatch):
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t"); monkeypatch.setenv("OWNER_PASSWORD", "pw")
    monkeypatch.setattr(signals, "trends_live", lambda geo: [])
    c = TestClient(serve.app)
    paths = {r.path for r in serve.app.routes}
    assert {"/owner/fleet", "/owner/fleet/{id}", "/owner/fleet/{id}/{action}", "/owner/fleet/{id}/logs", "/owner/sources", "/owner/sources/{id}/run", "/owner/trends", "/owner/display", "/owner/display/{id}"} <= paths
    for m, p in (("get", "/owner/fleet"), ("post", "/owner/fleet"), ("get", "/owner/sources"), ("get", "/owner/display"), ("delete", "/owner/fleet/x")):
        assert getattr(c, m)(p).status_code == 401
    h = {"authorization": f"Bearer {auth.issue()}"}
    assert c.post("/owner/fleet", headers=h, json={"name": "api-made", "role": "r"}).json()["by"] == "owner"
    assert c.post("/owner/fleet", headers=h, json={"name": "api-made"}).status_code == 400 and c.post("/owner/fleet", headers=h, json={"nme": "x"}).status_code == 422
    assert c.put("/owner/fleet/api-made", headers=h, json={"prompt": "p2"}).json()["prompt"] == "p2" and c.put("/owner/fleet/ghost", headers=h, json={}).status_code == 404
    assert c.post("/owner/fleet/api-made/pause", headers=h).json()["status"] == "paused" and c.post("/owner/fleet/api-made/dance", headers=h).status_code == 400
    assert c.get("/owner/fleet", headers=h).json()["agents"][0]["id"] == "api-made"
    sid = c.post("/owner/sources", headers=h, json={"kind": "trends", "geo": "FR"}).json()["id"]
    assert len(c.get("/owner/sources", headers=h).json()["sources"]) == 3 and c.delete(f"/owner/sources/{sid}", headers=h).status_code == 200
    assert c.post("/owner/display", headers=h, json={"type": "note", "text": "hi", "title": "t"}).json()["by"] == "owner"
    assert {w["id"] for w in c.get("/owner/display", headers=h).json()["widgets"]} >= {"w-trends", "w-fleet"}
    assert c.delete("/owner/fleet/api-made", headers=h).json() == {"removed": ["api-made"]}


# — the ledger: what everyone is doing, and what they say —

def test_board_collapses_a_task_to_its_latest_state(fx):
    import ledger
    t = ledger.plan("sextant", "Research data-centre demand", kind="research")
    ledger.start("sextant", "Research data-centre demand", kind="research", pid=t["id"])
    ledger.finish(t["id"], "two sources agree", energy=-0.04)
    b = ledger.board()
    assert len(b) == 1 and b[0]["state"] == "done" and b[0]["note"] == "two sources agree" and b[0]["energy"] == -0.04 and b[0]["started"]
    ledger.plan("sub:grid", "Watch the IEA feed", kind="find")
    assert ledger.counts() == {"planned": 1, "ongoing": 0, "done": 1, "failed": 0}
    assert ledger.finish(t["id"], "x", state="nonsense")["state"] == "done"


def test_titles_read_like_work_not_prompts():
    import ledger
    assert ledger.title_for("research", "Research this topic and return what the Institute should know, as graph deltas with sources: phone compute") == "Research: phone compute"
    assert ledger.title_for("reexamine", "Re-examine edge s:compute: investigates over ['a']") == "Re-examine an edge: s:compute"
    assert ledger.title_for("ingest", "[sub-agent grid · energy] look\nTrending search: heat dome").startswith("Read an item: Trending search")
    assert ledger.title_for("reflect", "owner") == "Nightly reflection" and ledger.title_for("staff", "long prompt") == "Decide whether the research needs a new post"


def test_stream_is_capped_and_typed(fx):
    import ledger
    ledger.say("sub:grid", "sextant", "report", "found a 2026 outlook")
    ledger.say("sextant", "sub:grid", "assign", "find a second source")
    ledger.say("owner", "sextant", "whatever", "hello")
    m = ledger.stream()
    assert [x["kind"] for x in m] == ["report", "assign", "msg"] and m[0]["from"] == "sub:grid"
    for i in range(20):
        ledger.say("sextant", "sextant", "thought", "x" * 2000)
    assert len(ledger.stream(5)) == 5 and len(ledger.stream()[0]["text"]) <= 1200


def test_actors_pair_the_fleet_with_what_it_is_doing(fx):
    import ledger
    fleet.create({"name": "grid-watch", "role": "energy"})
    ledger.start("sub:grid-watch", "Found: new outlook", kind="find")
    a = ledger.actors(fleet.list_())
    assert [x["id"] for x in a] == ["sextant", "grid-watch"] and a[0]["status"] == "idle" and a[0]["now"] is None
    assert a[1]["now"]["title"] == "Found: new outlook" and a[1]["role"] == "energy"


# — staffed by the very research it studies —

def test_unstaffed_lists_the_research_nothing_watches_weakest_first(fx, monkeypatch):
    import main as M
    import round as R
    open_ = M.unstaffed()
    ids = [n["id"] for n in open_]
    assert "q-phone" in ids and all(n["type"] in ("question", "hypothesis", "goal") for n in open_)
    assert [n["support"] for n in open_] == sorted(n["support"] for n in open_)
    fleet.create({"name": "phone-watch", "from_node": "q-phone", "why": "payouts change weekly"}, "brain")
    assert fleet.staffed() == {"q-phone"} and "q-phone" not in [n["id"] for n in M.unstaffed()]


def test_the_agent_is_shown_its_own_questions_sources_and_fleet(fx):
    import main as M
    fleet.create({"name": "grid-watch", "role": "energy", "from_node": "q-energy", "why": "forecasts go stale"}, "brain")
    t = M.staffing_intake()
    assert "Staffing round" in t and "create at most one sub-agent" in t.lower()
    assert "UNWATCHED, WEAKEST SUPPORT FIRST" in t and "q-phone" in t and "falsifier:" in t
    assert "SOURCES YOU CAN GIVE IT" in t and "yaml:trends-US" in t
    assert "YOUR FLEET (1 of 4" in t and "grid-watch: energy — watches q-energy" in t and "q-energy" not in t.split("UNWATCHED")[1].split("SOURCES")[0]


def test_creating_from_research_records_the_provenance_and_the_graph_edge(fx, g, monkeypatch):
    import round as R
    monkeypatch.setattr(T, "GRAPH", g)
    out = json.loads(T.fleet_create("phone-payout", "phone compute watcher", "Send payout and battery figures; skip press releases.", '["yaml:0"]', "q-phone", "the payout per device changes weekly"))
    assert out["from_node"] == "q-phone" and out["why"].startswith("the payout") and out["by"] == "brain"
    assert g.edges["sub:phone-payout>staffs"]["members"] == ["sub:phone-payout", "q-phone"] and g.nodes["sub:phone-payout"]["why"]
    assert json.loads(T.fleet_list())[0]["from_node"] == "q-phone"
    T.fleet_create("no-node", "r", "p", "[]", "ghost-id")                                   # an unknown node: the post is still made, with no staffs edge
    assert "sub:no-node>staffs" not in g.edges and g.edges["sub:no-node>by"]


def test_the_staffing_loop_queues_a_round_and_never_creates_anything_itself(fx, monkeypatch):
    import main as M
    import round as R
    queued = []
    monkeypatch.setattr(M, "put", lambda kind, text, prio=None, who="sextant": queued.append((kind, text)))
    monkeypatch.setattr(M.R.cfg, "get", R.cfg.get)
    async def once():
        if M.unstaffed() and len(fleet.load()) < fleet.CFG.get("max", 12):
            M.put("staff", M.staffing_intake())
    asyncio.run(once())
    assert len(queued) == 1 and queued[0][0] == "staff" and fleet.load() == {}                # the agent decides; the loop only asks
    assert M.PRIO["staff"] > M.PRIO["chat"] and "staff" in M.PRIO
    for i in range(4):
        fleet.create({"name": f"f{i}"})
    queued.clear()
    asyncio.run(once())
    assert queued == []                                                                        # a full fleet is not asked to hire


def test_staffing_config_tells_the_agent_to_hire_and_to_retire():
    import round as R
    c = R.cfg["staffing"]
    assert c["enabled"] and c["every_seconds"] >= 600
    assert "fleet_create" in c["intake"] and "fleet_delete" in c["intake"] and "from_node" in c["intake"] and "source_add" in c["intake"]


def test_owner_sees_the_board_the_stream_and_the_mind(fx, monkeypatch):
    import ledger
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    monkeypatch.setattr(signals, "trends_live", lambda geo: [])
    c, h = TestClient(serve.app), {"authorization": f"Bearer {auth.issue()}"}
    assert {"/owner/board", "/owner/stream", "/owner/say", "/owner/mind"} <= {r.path for r in serve.app.routes}
    for p in ("/owner/board", "/owner/stream", "/owner/mind"):
        assert c.get(p).status_code == 401
    fleet.create({"name": "grid-watch", "role": "energy", "from_node": "q-energy", "why": "forecasts go stale"}, "brain")
    ledger.start("sub:grid-watch", "Found: new outlook", kind="find")
    ledger.say("sub:grid-watch", "sextant", "report", "a 2026 outlook revises demand down")
    b = c.get("/owner/board", headers=h).json()
    assert b["counts"]["ongoing"] == 1 and b["actors"][1]["now"]["title"] == "Found: new outlook" and b["tasks"][0]["who"] == "sub:grid-watch"
    assert c.get("/owner/stream", headers=h).json()["messages"][-1]["kind"] == "report"
    m = c.get("/owner/mind", headers=h).json()
    assert m["counts"]["nodes"] and len(m["questions"]) >= 9 and all(q["falsifier"] for q in m["questions"] if q["core"])
    assert m["goals"] and m["weakest"] and m["hood"]["focus"] == "institute" and isinstance(m["types"], dict)
    assert c.post("/owner/say", headers=h, json={"text": "", "to": "sextant"}).status_code == 400
    assert c.post("/owner/say", headers=h, json={"text": "watch the hydro filings", "to": "sub:grid-watch"}).json()["answer"].startswith("Passed to grid-watch")
    assert fleet.load()["grid-watch"]["prompt"] == "watch the hydro filings" and ledger.stream()[-1]["kind"] == "assign"


def test_a_build_token_opens_the_builder_door_and_no_other(fx, monkeypatch):
    import hmac
    import time
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    sign = lambda body: body + "." + hmac.new(b"t", body.encode(), "sha256").hexdigest()
    c, h = TestClient(serve.app), {"authorization": "Bearer " + sign(f"build.{int(time.time()) + 300}")}
    assert "/builder/say" in {r.path for r in serve.app.routes}
    assert c.get("/owner/board", headers=h).status_code == 401 and c.post("/owner/say", headers=h, json={"text": "hi"}).status_code == 401
    assert c.post("/builder/say", json={"text": "hi"}).status_code == 401
    assert c.post("/builder/say", headers=h, json={"text": ""}).status_code == 400                     # through the door; the text is checked
    long = {"authorization": "Bearer " + sign(f"build.{int(time.time()) + 86400}")}                  # a day-long build token is refused
    assert c.post("/builder/say", headers=long, json={"text": ""}).status_code == 401
    assert c.post("/builder/say", headers={"authorization": f"Bearer {auth.issue()}"}, json={"text": ""}).status_code == 400


# — the labs: phases, gates and what a run is allowed to prove —

@pytest.fixture
def labfx(fx, tmp_path, monkeypatch, g):
    import labs
    monkeypatch.setattr(labs, "STATE", tmp_path)
    monkeypatch.setattr(labs, "GRAPH", g)
    monkeypatch.setattr(labs, "CFG", {"labs": {
        "demo": {"title": "Demo", "question": "q-chem", "target": 10, "max_candidates": 3, "brief": "b", "honest": "h", "phases": [
            {"name": "1 · screen", "exit_test": "t", "language": "python", "cell": "P = $PAYLOAD\nprint('{\"pass\": true}')", "network": True, "command": "python main.py"},
            {"name": "2 · bench", "exit_test": "a real lab reports", "fail_closes": True},
            {"name": "3 · production", "exit_test": "a route exists"}]}}})
    return labs


def test_every_lab_states_its_phases_exit_tests_and_what_it_cannot_do():
    import round as R
    assert set(R.cfg["labs"]) >= {"chem-stability", "btc-graph", "law-review"}
    for name, spec in R.cfg["labs"].items():
        assert spec["brief"].strip() and spec["honest"].strip() and spec["phases"]
        assert all(p.get("exit_test") for p in spec["phases"])
        assert any(p.get("cell") for p in spec["phases"]), name
        for p in spec["phases"]:
            if p.get("cell"):
                assert "$PAYLOAD" in p["cell"] and '"pass"' in p["cell"] and p.get("command")
    q = {n["id"] for n in R.cfg["seed"]["nodes"]}
    assert {"q-chem", "q-btc", "q-seizure"} <= q and all(R.cfg["labs"][l]["question"] in q for l in R.cfg["labs"])


def test_the_honest_note_refuses_the_impossible_parts():
    import round as R
    btc = R.cfg["labs"]["btc-graph"]["honest"].lower()
    assert "will not mine" in btc and "cannot be searched" in btc and "disclosure" in btc
    chem = R.cfg["labs"]["chem-stability"]["honest"].lower()
    assert "screen, not a proof" in chem and "statement about a file" in chem
    assert "not legal advice" in R.cfg["labs"]["law-review"]["honest"].lower()


def test_a_candidate_enters_at_phase_one_and_is_recorded_in_the_graph(labfx, g):
    c = labfx.propose("demo", "mol-1", "a molecule", {"smiles": "CCO"}, "expected to clear the screen", "brain")
    assert c["phase"] == 0 and c["state"] == "open" and c["by"] == "brain"
    assert g.nodes["cand:demo:mol-1"]["lab"] == "demo" and g.edges["cand:demo:mol-1>tests"]["members"] == ["cand:demo:mol-1", "q-chem"]
    for bad, err in ((("demo", "Bad Id", "l", {}, "e"), "id:"), (("demo", "mol-1", "l", {}, "e"), "exists")):
        with pytest.raises(ValueError, match=err):
            labfx.propose(*bad)
    with pytest.raises(KeyError):
        labfx.propose("nope", "x1", "l", {}, "e")
    labfx.propose("demo", "mol-2", "b", {}, "e"); labfx.propose("demo", "mol-3", "c", {}, "e")
    with pytest.raises(ValueError, match="cap"):
        labfx.propose("demo", "mol-4", "d", {}, "e")


def test_only_a_passing_run_advances_a_candidate(labfx, g):
    labfx.propose("demo", "mol-1", "a molecule", {"smiles": "CCO"}, "e")
    bad = labfx.record("demo", "mol-1", 0, {"exit": 0, "stdout": '{"pass": false, "why": "no embedding"}'})
    assert bad["pass"] is False and bad["candidate"]["phase"] == 0 and bad["report"]["why"] == "no embedding"
    nonsense = labfx.record("demo", "mol-1", 0, {"exit": 0, "stdout": "it worked great, trust me"})
    assert nonsense["pass"] is False and nonsense["candidate"]["phase"] == 0                      # prose is not a pass
    crashed = labfx.record("demo", "mol-1", 0, {"exit": 1, "stdout": '{"pass": true}'})
    assert crashed["pass"] is False and crashed["candidate"]["phase"] == 0                        # a crash is not a pass either
    ok = labfx.record("demo", "mol-1", 0, {"exit": 0, "stdout": 'noise\n{"pass": true, "energy_per_heavy_atom": 3.1}'})
    assert ok["pass"] and ok["candidate"]["phase"] == 1 and ok["candidate"]["passed"] == [0] and g.nodes["cand:demo:mol-1"]["phase"] == 1
    assert labfx.record("demo", "mol-1", 1, {"exit": 0, "stdout": '{"pass": false}'})["candidate"]["state"] == "failed"
    with pytest.raises(KeyError):
        labfx.record("demo", "ghost", 0, {"exit": 0, "stdout": "{}"})


def test_the_last_phase_proves_the_candidate_and_notes_are_not_runs(labfx):
    labfx.propose("demo", "mol-1", "m", {}, "e")
    for n in range(3):
        labfx.record("demo", "mol-1", n, {"exit": 0, "stdout": '{"pass": true}'})
    st = labfx.status("demo")[0]
    assert st["candidates"][0]["state"] == "proved" and st["counts"]["proved"] == 1 and st["counts"]["runs"] == 3
    labfx.propose("demo", "mol-2", "m2", {}, "e")
    labfx.note("demo", "mol-2", "Dalhousie reports synthesis, NMR attached", "brain")
    assert "Dalhousie" in labfx.load("demo")["candidates"]["mol-2"]["evidence"] and labfx.load("demo")["candidates"]["mol-2"]["phase"] == 0
    assert labfx.close("demo", "mol-2", "already in the literature")["state"] == "closed"


def test_a_manual_phase_has_no_cell_to_run_and_the_queue_knows_it(labfx):
    labfx.propose("demo", "mol-1", "m", {"smiles": "CCO"}, "e")
    spec = labfx.cell("demo", 0, {"smiles": "CCO"})
    assert spec["language"] == "python" and spec["network"] and '{"smiles": "CCO"}' in spec["files"]["main.py"]
    assert [c["id"] for c in labfx.queue("demo")] == ["mol-1"]
    labfx.record("demo", "mol-1", 0, {"exit": 0, "stdout": '{"pass": true}'})
    assert labfx.queue("demo") == []                                                              # phase 2 is a bench, not a cell
    with pytest.raises(ValueError, match="not a computational phase"):
        labfx.cell("demo", 1, {})
    assert labfx.status("demo")[0]["phases"][1]["manual"] is True


def test_the_agent_is_shown_each_labs_queue_and_its_limits(labfx, monkeypatch):
    import main as M
    monkeypatch.setattr(M.R.cfg, "get", lambda k, d=None: {"labs_loop": {"intake": "Lab round. Decide what moves a lab forward."}}.get(k, M.R.cfg.get(k, d)) if k == "labs_loop" else M.R.cfg.get(k, d))
    labfx.propose("demo", "mol-1", "a molecule", {"smiles": "CCO"}, "e")
    t = M.labs_intake()
    assert "LAB demo" in t and "WHAT THIS LAB CANNOT DO" in t and "exit test: t" in t
    assert "UNRUN, RUN THESE FIRST" in t and "mol-1 at phase 1" in t and "a bench reports this" in t and "programme target 10" in t


def test_lab_tools_are_wired_and_refuse_cleanly(labfx, monkeypatch):
    import round as R
    assert set(T.LAB_TOOLS) <= set(R.cfg["agent"]["tools"])
    assert json.loads(T.lab_propose("demo", "mol-1", "m", '{"smiles": "CCO"}', "e"))["phase"] == 0
    assert T.lab_propose("demo", "mol-1", "m", "{}", "e").startswith("refused")
    assert T.lab_propose("nope", "m2", "m", "{}", "e").startswith("refused")
    assert json.loads(T.lab_candidates("demo"))[0]["id"] == "mol-1"
    assert "chem-stability" in T.lab_list() and "cannot" in T.lab_list().lower()
    assert json.loads(T.lab_close("demo", "mol-1", "already known"))["state"] == "closed"
    assert T.lab_record("demo", "ghost", "x").startswith("refused")


def test_lab_run_refuses_without_docker_and_never_fakes_a_pass(labfx, monkeypatch):
    import sandbox
    monkeypatch.setattr(sandbox, "available", lambda which="agent": False)
    labfx.propose("demo", "mol-1", "m", {"smiles": "CCO"}, "e")
    assert "sandbox unavailable" in asyncio.run(T.lab_run("demo", "mol-1"))
    assert labfx.load("demo")["candidates"]["mol-1"]["phase"] == 0
    assert asyncio.run(T.lab_run("demo", "ghost")).startswith("refused") and asyncio.run(T.lab_run("nope", "x")).startswith("refused")
    monkeypatch.setattr(sandbox, "available", lambda which="agent": True)
    monkeypatch.setattr(sandbox, "run", lambda *a, **k: {"exit": 0, "stdout": '{"pass": true, "energy_per_heavy_atom": 2.9}', "stderr": ""})
    assert json.loads(asyncio.run(T.lab_run("demo", "mol-1")))["candidate"]["phase"] == 1


def test_owner_sees_the_labs_and_can_run_or_close_a_candidate(labfx, monkeypatch):
    import sandbox
    import serve
    monkeypatch.setenv("SESSION_SECRET", "t")
    monkeypatch.setattr(signals, "trends_live", lambda geo: [])
    monkeypatch.setattr(sandbox, "available", lambda which="agent": True)
    monkeypatch.setattr(sandbox, "run", lambda *a, **k: {"exit": 0, "stdout": '{"pass": true}', "stderr": ""})
    c, h = TestClient(serve.app), {"authorization": f"Bearer {auth.issue()}"}
    assert {"/owner/labs", "/owner/labs/{lab}/{id}/run", "/owner/labs/{lab}/{id}/close"} <= {r.path for r in serve.app.routes}
    assert c.get("/owner/labs").status_code == 401
    labfx.propose("demo", "mol-1", "a molecule", {"smiles": "CCO"}, "e")
    L = c.get("/owner/labs", headers=h).json()["labs"]
    assert L[0]["id"] == "demo" and L[0]["honest"] and L[0]["phases"][0]["at"] == 1 and L[0]["candidates"][0]["id"] == "mol-1"
    assert c.post("/owner/labs/demo/mol-1/run", headers=h).json()["candidate"]["phase"] == 1
    assert c.post("/owner/labs/demo/ghost/run", headers=h).status_code == 400
    assert c.post("/owner/labs/demo/mol-1/close?why=already+known", headers=h).json()["state"] == "closed"
