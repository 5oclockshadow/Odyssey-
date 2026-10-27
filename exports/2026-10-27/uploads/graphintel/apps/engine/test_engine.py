"""No model, no network, no docker: the graph, the merge, the seed guarantee, the queue, the tools' gates, telemetry → graph,
incidents → located, auth, the registry, the Q-table, the owner's day and its fixture. pytest -q"""
import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pytest
from opentelemetry.sdk.trace import TracerProvider

import auth
import bus
import day
import feeds
import heal
import mindful
import oversight
import publishing
import selfmodel
import upgrades
import observe
import reflect
import round as R
import sandbox
import tools as T
from signature import EnergyReport, Hyperedge, Node, Round, TypeDef

HERE = Path(__file__).resolve().parent


def make_round(**kw) -> Round:
    base = dict(reasoning="", evidence=[], definitions=[], nodes=[], hyperedges=[], closure=[], actors=[], answer="", energy=EnergyReport(delta=0.0))
    base.update(kw)
    return Round(**base)


@pytest.fixture
def g(tmp_path):
    return R.Graph(path=tmp_path / "graph.json")


@pytest.fixture
def wired(g, tmp_path, monkeypatch):
    """Graph, heal and observe wired together on a temp state dir; incidents captured, repairs queued to a list."""
    queued, seen = [], []
    monkeypatch.setattr(heal, "INCIDENTS", tmp_path / "incidents.jsonl")
    monkeypatch.setattr(heal, "GRAPH", g)
    monkeypatch.setattr(heal, "PUT", lambda kind, text: queued.append((kind, json.loads(text))))
    monkeypatch.setattr(heal, "CFG", {"dedupe_seconds": 900})
    monkeypatch.setattr(heal, "Q", None)
    bus.STORE.mem.clear()
    monkeypatch.setattr(observe, "_GRAPH", g)
    monkeypatch.setattr(observe, "_ON_INCIDENT", lambda inc: seen.append(inc) or heal.on_incident(inc))
    provider = TracerProvider()
    provider.add_span_processor(observe.GraphSpanProcessor())
    return {"g": g, "queued": queued, "seen": seen, "tracer": provider.get_tracer("test")}


# — the graph —

def test_seed_is_core_and_never_removed(g):
    assert {"sextant", "operator", "institute"} <= set(g.nodes)
    for _ in range(50):
        g.merge(make_round())
    assert all(g.nodes[i]["w"] == 1.0 for i in ("sextant", "operator", "institute"))


def test_merge_adds_nodes_edges_and_types(g):
    g.merge(make_round(definitions=[TypeDef(name="venue", definition="a place where trades clear", nearest="organisation")],
                       nodes=[Node(id="binance", type="venue", label="Binance"), Node(id="btc_perp", type="instrument", label="BTC perp")],
                       hyperedges=[Hyperedge(id="lists", relation="lists", members=["binance", "btc_perp"])]))
    assert g.types["venue"].startswith("a place")
    assert g.nodes["binance"]["w"] == pytest.approx(0.2)
    assert g.edges["lists"]["members"] == ["binance", "btc_perp"]


def test_edge_with_unknown_member_is_dropped(g):
    g.merge(make_round(hyperedges=[Hyperedge(id="bad", relation="x", members=["sextant", "ghost"])]))
    assert "bad" not in g.edges


def test_hebbian_strengthen_then_decay(g):
    n = Node(id="a", type="thing", label="a")
    g.merge(make_round(nodes=[n])); g.merge(make_round(nodes=[n]))
    w2 = g.nodes["a"]["w"]
    assert w2 == pytest.approx(0.36)
    g.merge(make_round())
    assert g.nodes["a"]["w"] == pytest.approx(w2 * 0.99)


def test_closure_edges_are_flagged_inferred(g):
    g.merge(make_round(nodes=[Node(id="a", type="t", label="a"), Node(id="b", type="t", label="b")],
                       closure=[Hyperedge(id="ab", relation="reach", members=["a", "b"], inferred=True)]))
    assert g.edges["ab"]["inferred"] is True


def test_slice_contains_core_and_strongest_edges(g):
    nodes = [Node(id=f"n{i}", type="t", label=f"n{i}") for i in range(6)]
    edges = [Hyperedge(id=f"e{i}", relation="r", members=[f"n{i}", f"n{(i + 1) % 6}"]) for i in range(6)]
    g.merge(make_round(nodes=nodes, hyperedges=edges))
    g.merge(make_round(hyperedges=edges[:2]))
    s = json.loads(g.slice(k=2))
    assert {e["id"] for e in s["edges"]} == {"e0", "e1"}
    assert {"sextant", "operator", "institute"} <= {n["id"] for n in s["nodes"]}


def test_graph_persists_to_disk(tmp_path):
    p = tmp_path / "graph.json"
    R.Graph(path=p).merge(make_round(nodes=[Node(id="x", type="t", label="x")]))
    assert "x" in R.Graph(path=p).nodes


def test_telemetry_is_in_the_graph_but_not_in_the_slice(g):
    g.observe([{"id": "span:1", "type": "span", "label": "s", "tel": True}, {"id": "trace:1", "type": "trace", "label": "t", "tel": True}],
              [{"id": "e", "relation": "in_trace", "members": ["span:1", "trace:1"]}], w=0.99)
    assert g.edges["e"]["tel"] is True and json.loads(g.slice())["edges"] == []
    g.merge(make_round())
    assert g.nodes["span:1"]["w"] == 0.99                                       # the Hebbian pass leaves telemetry alone


def test_decay_prunes_spans_but_keeps_incidents_and_code(g):
    g.observe([{"id": "span:1", "type": "span", "label": "s", "tel": True}, {"id": "trace:1", "type": "trace", "label": "t", "tel": True},
               {"id": "incident:1", "type": "incident", "label": "i", "tel": True}, {"id": "code:x.f", "type": "code", "label": "x.f"}],
              [{"id": "span:1>trace", "relation": "in_trace", "members": ["span:1", "trace:1"]},
               {"id": "incident:1>code", "relation": "raised_by", "members": ["incident:1", "code:x.f"]}], w=0.08)
    assert g.decay_telemetry(rho=0.5, prune_below=0.05) == 2
    assert "span:1" not in g.nodes and "span:1>trace" not in g.edges
    assert {"incident:1", "code:x.f"} <= set(g.nodes) and "incident:1>code" in g.edges


# — the loop and the Signature —

def test_queue_orders_chat_before_repairs_before_research():
    import main as M
    for k, t in (("research", "topic"), ("reexamine", "edge"), ("reflect", "now"), ("repair", "{}"), ("chat", "hello"), ("contact", "hi")):
        M.put(k, t)
    assert [M.queue.get_nowait()[2] for _ in range(6)] == ["chat", "contact", "repair", "reflect", "research", "reexamine"]


def test_round_output_schema_is_depth_two():
    assert list(Round.model_fields) == ["reasoning", "evidence", "definitions", "nodes", "hyperedges", "closure", "actors", "answer", "energy"]
    assert Hyperedge.model_fields["members"].metadata[0].min_length == 2


def test_agent_has_the_configured_tools():
    assert set(R.cfg["agent"]["tools"]) <= set(R.agent.tools)


def test_a_round_runs_off_the_event_loop_and_only_owners_write_the_graph(g, tmp_path, monkeypatch):
    import types
    seen = []

    def stub(intake):
        seen.append(intake)
        return types.SimpleNamespace(out=make_round(nodes=[Node(id="fresh", type="claim", label="A new claim")]), trajectory={"tool_name_0": "web_search"})
    monkeypatch.setattr(R, "agent", stub)
    monkeypatch.setattr(R, "predict", stub)
    monkeypatch.setattr(R, "graph", g)
    monkeypatch.setattr(R, "RECORD", tmp_path / "record.jsonl")
    asyncio.run(R.round("a visitor asks", "chat", public=True))
    assert "fresh" not in g.nodes and "a visitor" in seen[0] and "no tools here" in seen[0]
    asyncio.run(R.round("research this", "research"))
    assert "fresh" in g.nodes
    rows = [json.loads(x) for x in (tmp_path / "record.jsonl").read_text().splitlines()]
    assert [r["public"] for r in rows] == [True, False] and rows[1]["tools"] == ["web_search"] and rows[1]["kind"] == "research"


def test_serve_exposes_the_doors_and_signs_the_tools():
    import serve
    paths = {r.path for r in serve.app.routes}
    assert {"/round", "/graph", "/apps", "/event", "/health", "/public/graph", "/public/notes", "/public/questions", "/public/feed", "/public/counters", "/auth/login", "/auth/check",
            "/owner/day", "/owner/act", "/owner/graph", "/owner/record", "/owner/chat", "/owner/queue", "/owner/publish", "/owner/mindful", "/owner/hub", "/owner/sandbox", "/owner/ship"} <= paths
    assert "/record" not in paths
    assert all(getattr(getattr(serve.tools, n), "_signed", False) for n in ("web_search", "fetch_url", "graph_query", "ship_app"))
    assert getattr(serve.R.round, "_signed", False)


# — the tools' gates —

def test_publish_is_gated_to_outbox_when_disabled(tmp_path):
    T.CFG = {"publish": {"enabled": False, "outbox": str(tmp_path / "outbox")}}
    msg = T.publish("x", "hello world", title="t")
    drafts = list((tmp_path / "outbox").glob("*-x.md"))
    assert "drafted" in msg and len(drafts) == 1 and drafts[0].read_text().startswith("# t")


def test_graph_query_finds_seed(g):
    T.GRAPH = g
    out = json.loads(T.graph_query("sextant"))
    assert out["nodes"][0]["id"] == "sextant"


def test_ship_app_tool_refuses_bad_names_and_untested_apps():
    assert T.ship_app("Bad Name", "python", "{}").startswith("bad name")
    assert T.ship_app("lens", "python", json.dumps({"main.py": "print(1)"})).startswith("refused")
    assert T.sandbox_run("cobol", "x").startswith("unknown language")
    with pytest.raises(ValueError):
        sandbox.run("cobol", {"main": "x"})                                   # any other language needs image= and cmd=


# — everything becomes graph —

def test_span_becomes_node_and_error_becomes_incident(wired):
    g, tr = wired["g"], wired["tracer"]
    with pytest.raises(ZeroDivisionError):
        with tr.start_as_current_span("outer"):
            with tr.start_as_current_span("tools.fetch_url", attributes={"code.id": "code:tools.fetch_url", "code.filepath": str(HERE / "tools.py"), "code.lineno": 28}):
                1 / 0
    spans = {n["label"] for n in g.nodes.values() if n["type"] == "span" and not n.get("stub")}
    assert spans == {"outer", "tools.fetch_url"}
    relations = {e["relation"] for e in g.edges.values()}
    assert {"child_of", "in_trace", "span_of", "raised_by", "raised_in"} <= relations
    kind, inc = wired["queued"][0]
    assert kind == "repair" and inc["type"] == "ZeroDivisionError" and inc["code"] == "code:tools.fetch_url" and inc["line"] == 28
    assert g.nodes[inc["id"]]["type"] == "incident" and g.nodes["code:tools.fetch_url"]["type"] == "code"


def test_signed_function_is_a_code_node_with_file_and_line(wired):
    def helper(x):
        return x * 2
    f = observe.signed(helper)
    assert f(2) == 4 and f.__name__ == "helper" and f._signed
    cid = f"code:{helper.__module__}.{helper.__qualname__}"
    n = wired["g"].nodes[cid]
    assert n["type"] == "code" and n["file"].endswith("test_engine.py") and n["line"] > 0
    assert wired["g"].edges[f"{cid}>file"]["relation"] == "defined_in"


def test_log_lines_become_log_nodes_and_an_error_becomes_an_incident(wired):
    log, h = logging.getLogger("test.heal"), observe.GraphLogHandler()
    log.addHandler(h)
    log.propagate = False
    try:
        log.warning("slow fetch")
        try:
            {}["key"]
        except KeyError:
            log.error("lookup failed", exc_info=True)
    finally:
        log.removeHandler(h)
    g = wired["g"]
    assert sum(1 for n in g.nodes.values() if n["type"] == "log") == 2
    assert any(e["relation"] == "logged_by" for e in g.edges.values())
    kind, inc = wired["queued"][-1]
    assert inc["type"] == "KeyError" and inc["code"].startswith("code:test_engine.") and "KeyError" in inc["stack"]


def test_report_resolves_any_exception_to_its_code_node(wired):
    def inner():
        raise RuntimeError("boom")
    try:
        inner()
    except RuntimeError as ex:
        observe.report(ex, "asyncio")
    kind, inc = wired["queued"][-1]
    assert inc["source"] == "asyncio" and inc["code"] == "code:test_engine.inner" and inc["file"].endswith("test_engine.py")


def test_events_from_anywhere_land_in_the_graph(wired):
    eid = observe.event("exam_passed", {"score": 9}, "operator")
    n = wired["g"].nodes[eid]
    assert n["type"] == "event" and n["data"] == {"score": 9} and wired["g"].edges[f"{eid}>actor"]["members"] == [eid, "operator"]


# — self-repair —

def test_incidents_dedupe_and_cap_attempts(wired):
    inc = {"source": "span", "code": "code:tools.fetch_url", "type": "KeyError", "message": "'headers'", "file": str(HERE / "tools.py"), "line": 28}
    assert heal.on_incident(inc) and heal.on_incident(inc) is None             # same error, same place, same quarter hour: one incident
    assert len(wired["queued"]) == 1
    for _ in range(3):
        bus.STORE.mem.clear()
        heal.on_incident(inc)
    assert len(wired["queued"]) == 3                                             # max_attempts 3: the fourth is written but not queued
    assert heal.latest()[wired["queued"][0][1]["id"]]["attempts"] == 4


def test_locate_reads_the_source_around_the_line_and_the_trace(wired):
    tr = wired["tracer"]
    with pytest.raises(ValueError):
        with tr.start_as_current_span("round", attributes={"round.kind": "research"}):
            with tr.start_as_current_span("tools.graph_query", attributes={"code.id": "code:tools.graph_query", "code.filepath": str(HERE / "tools.py"), "code.lineno": 35}):
                raise ValueError("bad term")
    inc = wired["queued"][0][1]
    loc = heal.locate(inc)
    assert loc["file"].endswith("tools.py") and "def graph_query" in loc["source"]
    assert {n["label"] for n in loc["related"]} >= {"round", "tools.graph_query"}
    intake = heal.intake_for(inc, "add_test_first")
    assert "```diff" in intake and "ValueError" in intake and "failing test first" in intake


def test_extract_diff():
    assert heal.extract_diff("text\n```diff\n--- a/x\n+++ b/x\n@@\n-1\n+2\n```\nmore") == "--- a/x\n+++ b/x\n@@\n-1\n+2\n"
    assert heal.extract_diff("no patch: the key is missing") is None


def test_repair_without_a_diff_closes_the_incident_and_updates_q(wired, tmp_path):
    q = reflect.Q(path=tmp_path / "q.json")
    heal.Q = q
    inc = heal.on_incident({"source": "log", "code": "code:tools.web_search", "type": "ConnectError", "message": "rate limited"})
    res = asyncio.run(heal.repair({**inc, "strategy": "patch_minimal"}, "The cause is outside the code: the search endpoint rate-limited us.", sandbox))
    assert res["outcome"] == "no_patch" and res["status"] == "closed"
    assert heal.latest()[inc["id"]]["outcome"] == "no_patch" and wired["g"].nodes[inc["id"]]["status"] == "closed"
    assert q.value("repair:ConnectError", "patch_minimal") == pytest.approx(-0.06)


def test_owner_can_retry_and_mute(wired):
    inc = heal.on_incident({"source": "span", "code": "code:tools.fetch_url", "type": "TimeoutError", "message": "slow"})
    heal._write({"id": inc["id"], "ts": heal.now(), "status": "closed", "outcome": "tests_failed"})
    assert heal.act(inc["id"], "retry")["queued"] and wired["queued"][-1][1]["id"] == inc["id"]
    assert heal.act(inc["id"], "mute")["muted"] and heal.latest()[inc["id"]]["status"] == "muted"
    assert heal.act("incident:nope", "mute")["ok"] is False


# — owner login —

def test_auth_issues_verifies_and_expires(monkeypatch):
    monkeypatch.setenv("OWNER_PASSWORD", "open sesame")
    monkeypatch.setenv("SESSION_SECRET", "s3")
    monkeypatch.delenv("OWNER_PASSWORD_HASH", raising=False)
    auth.CFG = {"session_hours": 1}
    assert auth.password_ok("open sesame") and not auth.password_ok("sesame")
    t = auth.issue()
    assert auth.verify(t) and auth.max_age() == 3600
    assert not auth.verify(t[:-1] + ("0" if t[-1] != "0" else "1"))
    assert not auth.verify(auth.issue(hours=-1)) and not auth.verify(None) and not auth.verify("owner.1.2.3")
    monkeypatch.setenv("SESSION_SECRET", "other")
    assert not auth.verify(t)


def test_auth_hash_mode_and_throttle(monkeypatch):
    monkeypatch.delenv("OWNER_PASSWORD", raising=False)
    monkeypatch.setenv("OWNER_PASSWORD_HASH", hashlib.sha256(b"pw").hexdigest())
    assert auth.password_ok("pw") and not auth.password_ok("pw2")
    auth._attempts.clear()
    for _ in range(5):
        auth.throttle("1.2.3.4")
    with pytest.raises(Exception):
        auth.throttle("1.2.3.4")


# — the sandbox, without docker —

def test_registry_allocates_ports_in_range(monkeypatch, tmp_path):
    monkeypatch.setenv("APPS_REGISTRY", str(tmp_path / "apps.json"))
    sandbox.CFG = {"ports": [8100, 8102]}
    reg = sandbox.registry()
    assert reg["apps"] == {} and sandbox.allocate(reg) == 8100
    reg["apps"] = {"a": {"port": 8100}, "b": {"port": 8101}}
    sandbox.save_registry(reg)
    assert sandbox.allocate(sandbox.registry()) == 8102
    reg["apps"]["c"] = {"port": 8102}
    with pytest.raises(StopIteration):
        sandbox.allocate(reg)
    assert sandbox.web_hostname() == "web-dind"


def test_dockerfile_for_every_language():
    for lang, spec in sandbox.LANGS.items():
        d = sandbox.dockerfile_for(lang, {}, spec["port"])
        assert d.startswith(f"FROM {spec['image']}") and f"EXPOSE {spec['port']}" in d and "CMD" in d
    assert "target/release/lens" in sandbox.dockerfile_for("rust", {"Cargo.toml": '[package]\nname = "lens"\n'}, 8080)


def test_tar_roundtrip_and_tree(tmp_path):
    (tmp_path / "a" / "state").mkdir(parents=True)
    (tmp_path / "a" / "x.py").write_text("print(1)")
    (tmp_path / "a" / "state" / "g.json").write_text("{}")
    t = sandbox.tree(tmp_path, only=("a",), skip=("state",))
    assert t == {"a/x.py": "print(1)"}
    assert sandbox._untar([sandbox._tar(t, prefix="work/")]) == {"a/x.py": "print(1)"}


def test_has_tests_per_language():
    assert sandbox.has_tests("python", {"main.py": "", "test_main.py": ""}) and not sandbox.has_tests("python", {"main.py": ""})
    assert sandbox.has_tests("node", {"main.js": "", "main.test.js": ""}) and sandbox.has_tests("go", {"main.go": "", "main_test.go": ""})


# — reflection —

def test_q_table_learns_and_chooses(tmp_path):
    q = reflect.Q(path=tmp_path / "q.json", alpha=0.5, epsilon=0.0)
    q.update("repair:KeyError", "widen_handling", 1.0)
    q.update("repair:KeyError", "patch_minimal", -1.0)
    assert q.value("repair:KeyError", "widen_handling") == 0.5
    assert q.choose("repair:KeyError", heal.STRATEGIES) == "widen_handling" and q.policy("repair:KeyError") == "widen_handling"
    assert q.policy("ship:go") is None and reflect.Q(path=tmp_path / "q.json").top(1)[0]["n"] == 1
    assert reflect.plan_topics(R.cfg, q) == R.cfg["research"]["topics"]       # nothing learned yet: the configured order


# — the owner's day —

@pytest.fixture
def day_state(tmp_path, monkeypatch, g):
    monkeypatch.setattr(day, "STATE", tmp_path)
    monkeypatch.setattr(reflect, "STATE", tmp_path)
    monkeypatch.setattr(heal, "INCIDENTS", tmp_path / "incidents.jsonl")
    monkeypatch.setattr(heal, "GRAPH", g)
    monkeypatch.setenv("APPS_REGISTRY", str(tmp_path / "apps.json"))
    day.CFG = {"timezone": "UTC"}
    monkeypatch.setattr(upgrades, "DIR", tmp_path / "upgrades")
    outbox = tmp_path / "outbox"
    outbox.mkdir()
    return tmp_path, {**R.cfg, "publish": {**R.cfg["publish"], "outbox": str(outbox)}}, outbox


def test_day_compiles_the_record_incidents_drafts_and_apps(day_state, g):
    tmp, cfg, outbox = day_state
    now = datetime(2026, 10, 2, 9, 14, tzinfo=timezone.utc)
    rec = [{"ts": "2026-10-01T23:10:00+00:00", "kind": "research", "intake": "Research this topic and return what the Institute should know, as graph deltas with sources: stablecoins", "tools": ["web_search"], "answer": "a", "energy": {"delta": -0.07}, "minted": ["rail"]},
           {"ts": "2026-10-02T08:20:00+00:00", "kind": "chat", "intake": "what moved overnight?", "tools": [], "answer": "b", "energy": {"delta": 0.0}, "minted": []}]
    (tmp / "record.jsonl").write_text("\n".join(json.dumps(r) for r in rec) + "\n")
    iid = "incident:ab12cd34ef"
    heal._write({"id": iid, "ts": "2026-10-02T03:12:08+00:00", "status": "open", "attempts": 1, "source": "span", "code": "code:tools.fetch_url", "type": "KeyError", "message": "'headers'", "file": str(HERE / "tools.py"), "line": 28})
    heal._write({"id": iid, "ts": "2026-10-02T03:17:15+00:00", "status": "waiting", "outcome": "pr_opened", "pr": "https://github.com/x/y/pull/14", "tests": "17 passed in 41.2s", "strategy": "widen_handling"})
    (outbox / "20261002T055500-x.md").write_text("# Settlement rails\n\nbody")
    (outbox / "README.md").write_text("not a draft")
    (tmp / "apps.json").write_text(json.dumps({"apps": {"regime-lens": {"name": "regime-lens", "language": "python", "port": 8101, "healthy": True, "published": "2026-10-02T03:40:00+0000", "url": "/a/8101/"}}}))
    d = day.compile(g, cfg, pending=9, now=now)
    assert set(d) == set(day.KEYS) and d["phase"] == "inbox" and d["date"] == "Friday 2 October 2026"
    assert [p["state"] for p in d["phases"]] == ["done", "done", "current", "ahead", "ahead", "ahead", "ahead", "ahead"]
    assert [x["kind"] for x in d["stream"]] == ["research", "incident", "app", "post", "chat"]
    assert [x["phase"] for x in d["stream"]] == ["night", "night", "night", "night", "brief"]
    assert d["night"] == {"from": "22:00", "to": "06:00", "rounds": 1, "by_kind": {"research": 1}, "delta": -0.07, "fixed": 1, "shipped": 1, "drafted": 1}
    assert [x["id"] for x in d["needs_you"]] == [iid, "post:20261002T055500-x.md"]
    inc = d["stream"][1]
    assert inc["actions"][0]["id"] == "approve" and inc["steps"][-1]["d"].startswith("pull request opened") and inc["steps"][1]["d"] == "tools.py:28 · widen_handling"
    assert d["vitals"]["incidents_open"] == 1 and d["vitals"]["apps_live"] == 1 and d["vitals"]["pending"] == 9 and d["vitals"]["series"] == [0.0]
    assert "x at 13:00" in d["phases"][6]["planned"]                              # Friday cadence from marketing/schedule.yaml
    assert d["research_today"] == [{"topic": "stablecoins", "delta": -0.07}]


def test_act_post_approve_needs_credentials_and_decline_files_the_draft(day_state):
    tmp, cfg, outbox = day_state
    (outbox / "20261002T090200-x.md").write_text("# T\n\nbody")
    assert "missing credential" in day.act_post("20261002T090200-x.md", "approve", cfg)["error"]
    assert day.act_post("20261002T090200-x.md", "decline", cfg)["ok"] and (outbox / "declined" / "20261002T090200-x.md").exists()
    assert day.act_post("../evil.md", "decline", cfg)["ok"] is False
    assert reflect.Q().value("publish:x", "draft") == pytest.approx(-0.3)


def test_fixture_matches_the_day_shape():
    f = json.loads((HERE / "fixtures" / "day.json").read_text())
    assert set(f) == set(day.KEYS)
    assert all({"id", "at", "title", "state", "count", "planned"} <= set(p) for p in f["phases"])
    assert all({"id", "ts", "t", "phase", "kind", "title", "detail", "tags", "steps", "actions", "status"} <= set(x) for x in f["stream"])
    assert all(x["status"] == "waiting" for x in f["needs_you"]) and f["stream"] == sorted(f["stream"], key=lambda x: x["ts"])
    assert sum(1 for p in f["phases"] if p["state"] == "current") == 1


def test_add_topic_keeps_the_yaml_comments(tmp_path, monkeypatch):
    monkeypatch.setattr(day, "STATE", tmp_path)
    p = tmp_path / "institute.yaml"
    p.write_text("research:\n  every_seconds: 60   # keep me\n  topics:\n    - one\n    - two\n\npublish:\n  enabled: false\n")
    cfg = {"research": {"topics": ["one", "two"]}}
    out = day.add_topic('robots: permits "by city"', cfg, path=p)
    assert out["ok"] and cfg["research"]["topics"][-1] == "robots: permits 'by city'"
    import yaml
    text = p.read_text()
    assert "# keep me" in text and yaml.safe_load(text)["research"]["topics"] == ["one", "two", "robots: permits 'by city'"]
    assert day.add_topic("   ", cfg, path=p)["ok"] is False


def test_topics_in_the_real_yaml_are_strings():
    assert all(isinstance(t, str) for t in R.cfg["research"]["topics"])


def test_trace_stats_aggregate_spans_by_code_path(wired):
    tr = wired["tracer"]
    for _ in range(3):
        with tr.start_as_current_span("tools.graph_query"):
            pass
    with pytest.raises(ValueError):
        with tr.start_as_current_span("tools.graph_query"):
            raise ValueError("x")
    rows = reflect.trace_stats(wired["g"])
    assert rows[0]["name"] == "tools.graph_query" and rows[0]["calls"] == 4 and rows[0]["errors"] == 1 and rows[0]["ms"] >= 0


def test_site_errors_are_incidents_but_never_repaired(wired):
    inc = heal.on_incident({"source": "site", "code": "code:site.apps", "type": "site_error", "message": "TypeError: x is undefined"})
    assert inc and inc["id"] in wired["g"].nodes and wired["queued"] == []


def test_public_doors_are_rate_limited():
    auth._buckets.clear()
    for _ in range(3):
        auth.ratelimit("round:1.1.1.1", 3, 60)
    with pytest.raises(Exception):
        auth.ratelimit("round:1.1.1.1", 3, 60)
    auth.ratelimit("round:2.2.2.2", 3, 60)


# — one in, one out; the seed; autonomy —

def test_the_signature_has_exactly_one_input_and_one_output_field():
    from signature import Act
    assert list(Act.input_fields) == ["intake"] and list(Act.output_fields) == ["out"]


def test_seed_goals_questions_and_core_edges_survive_every_round(g):
    kinds = [n["type"] for n in g.nodes.values() if n.get("core")]
    assert kinds.count("goal") == 8 and kinds.count("question") == 9 and "constraint" in kinds
    assert g.edges["s:goals"]["core"] and len(g.edges["s:goals"]["members"]) == 9
    for _ in range(20):
        g.merge(make_round())
    assert g.edges["s:goals"]["w"] == 1.0 and all(g.nodes[i]["w"] == 1.0 for i in ("g-map", "q-grader", "charter"))


def test_drive_intake_names_goals_questions_and_weak_edges():
    import main as M
    text = M.drive_intake()
    assert "GOALS" in text and "OPEN QUESTIONS" in text and "WEAKEST EDGES" in text and "edit none" not in text and R.cfg["autonomy"]["drive"][:20] in text


def test_mission_says_read_everything_edit_nothing():
    m = R.cfg["mission"]
    assert "edit none of it" in m and "plan_upgrade" in m and {"read_source", "plan_upgrade", "list_source"} <= set(R.cfg["agent"]["tools"])


# — shared state, mindful posting —

def test_store_dedupes_counts_and_remembers_pending():
    s = bus.Store("")
    assert s.once("a", 60) and not s.once("a", 60) and s.once("b", 60)
    assert s.hit("k", 60) == 1 and s.hit("k", 60) == 2 and s.count("k") == 2 and s.count("none") == 0
    s.pend("p1", {"kind": "research", "text": "x"})
    assert s.pending() == {"p1": {"kind": "research", "text": "x"}}
    s.done("p1")
    assert s.pending() == {}


def test_mindful_gate(monkeypatch):
    monkeypatch.setattr(mindful, "STORE", bus.Store(""))
    mindful.CFG = {"timezone": "UTC", "mindful": {"per_day": {"x": 1, "linkedin": 1}, "quiet_hours": "22:00-07:00", "min_gap_minutes": 90, "max_chars": {"x": 40}}}
    noon, night = (datetime(2026, 10, 2, h, 0, tzinfo=timezone.utc) for h in (12, 23))
    assert mindful.check("x", "one number", noon)["ok"]
    assert any("quiet hours" in r for r in mindful.check("x", "one number", night)["reasons"])
    assert any("limit 40" in r for r in mindful.check("x", "x" * 41, noon)["reasons"])
    assert any("not allowed" in r for r in mindful.check("linkedin", "Guaranteed returns for everyone", noon)["reasons"])
    assert mindful.DISCLOSURE in mindful.check("linkedin", "a note", noon)["text"] and mindful.DISCLOSURE not in mindful.check("x", "a note", noon)["text"]
    mindful.record("x", "one number", noon)
    why = " ".join(mindful.check("x", "one number", noon)["reasons"])
    assert "daily cap" in why and "within the last 90 minutes" in why and "already posted" in why


def test_publish_drafts_when_the_gate_says_no(tmp_path, monkeypatch):
    monkeypatch.setattr(mindful, "STORE", bus.Store(""))
    mindful.CFG = {"timezone": "UTC", "mindful": {"banned": ["moon"]}}
    T.CFG = {"publish": {"enabled": True, "outbox": str(tmp_path / "outbox")}}
    assert "drafted" in T.publish("slack", "to the moon") and len(list((tmp_path / "outbox").glob("*-slack.md"))) == 1


# — reading the source, proposing upgrades —

def test_the_agent_reads_its_source_and_nothing_else(tmp_path, monkeypatch):
    for p, t in {"apps/engine/a.py": "x = 1\ny = 2\n", ".env": "KEY=1", "state/session.secret": "s", "apps/engine/state/q.json": "{}"}.items():
        (tmp_path / p).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / p).write_text(t)
    monkeypatch.setattr(T, "ROOT", tmp_path)
    assert "     2  y = 2" in T.read_source("apps/engine/a.py") and "a.py" in T.list_source("apps/engine") and "q.json" not in T.list_source("apps/engine")
    for bad in (".env", "state/session.secret", "../etc/passwd", "apps/engine/state/q.json"):
        assert T.read_source(bad).startswith("refused")
    assert T.list_source("state").startswith("refused")
    assert not hasattr(T, "write_source") and "write_file" not in R.cfg["agent"]["tools"]


def test_plan_upgrade_waits_for_the_operator(tmp_path, monkeypatch):
    monkeypatch.setattr(upgrades, "DIR", tmp_path / "upgrades")
    monkeypatch.setattr(upgrades, "STATE", tmp_path)
    monkeypatch.delenv("GITHUB_PERSONAL_ACCESS_TOKEN", raising=False)
    upgrades.CFG = {}
    assert "waits for the operator" in T.plan_upgrade("Cache fetch_url", "64 calls, 842 ms mean", "--- a/x\n+++ b/x\n")
    rec = upgrades.load()[0]
    assert rec["status"] == "proposed" and rec["id"].startswith("upgrade:") and rec["diff"]
    class NoSandbox:
        @staticmethod
        def available(which="agent"):
            return False
    assert upgrades.act(rec["key"], "approve", NoSandbox)["error"] == "sandbox unavailable"
    assert upgrades.deliver("upgrade/x", "t", "b", {"patched": {}, "changed": []}, "x", "d") == (None, "patch_saved") and (tmp_path / "patches" / "x.diff").read_text() == "d"
    plan = upgrades.propose("Add a venue type", "the graph keeps minting it")
    assert upgrades.act(plan["key"], "approve", NoSandbox)["status"] == "approved" and upgrades.act(plan["key"], "approve", NoSandbox)["ok"] is False
    assert upgrades.act(rec["key"], "decline", NoSandbox)["ok"] and upgrades.get(rec["key"])["status"] == "declined" and upgrades.act("../x", "approve", NoSandbox)["ok"] is False


def test_proposals_appear_in_the_owners_day_as_waiting(day_state, g):
    tmp, cfg, outbox = day_state
    upgrades.DIR.mkdir(parents=True, exist_ok=True)
    rec = upgrades.propose("Cache fetch_url", "64 calls at 842 ms", "diff")
    d = day.compile(g, cfg, now=datetime.now(timezone.utc))
    item = next(x for x in d["stream"] if x["kind"] == "upgrade")
    assert item["id"] == rec["id"] and item["status"] == "waiting" and item["actions"][0]["label"] == "Test and open PR" and item in d["needs_you"] and d["upgrades"][0]["diff"] is True


def test_the_graph_knows_its_own_source(tmp_path, g):
    (tmp_path / "m.py").write_text('def f():\n    """doc"""\n\n\nclass C:\n    pass\n')
    assert selfmodel.load(g, tmp_path) == 3
    assert {"file:m.py", "code:m.f", "code:m.C"} <= set(g.nodes) and g.nodes["code:m.f"]["doc"] == "doc" and g.edges["code:m.C>file"]["members"] == ["code:m.C", "file:m.py"]


def test_feeds_parse_rss_rdf_and_atom():
    rss = "<rss><channel><item><title>A</title><link>http://a</link></item></channel></rss>"
    rdf = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><item><title>C</title><link>http://c</link></item></rdf:RDF>'
    atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>B</title><link href="http://b"/></entry><entry><title>no link</title></entry></feed>'
    assert [i["link"] for i in feeds.parse(rss) + feeds.parse(rdf) + feeds.parse(atom)] == ["http://a", "http://c", "http://b"]


# — the public site sees only what is published —

def test_seed_labels_survive_their_commas():
    nodes = R.cfg["seed"]["nodes"]
    assert nodes[0]["label"] == "SEXTANT, the agent" and all(set(n) <= {"id", "type", "label", "falsifier", "pub"} and n["label"].strip() for n in nodes)
    assert sum(1 for n in nodes if n["type"] == "question" and n.get("falsifier")) == 6


@pytest.fixture
def pubg(g, tmp_path, monkeypatch):
    monkeypatch.setattr(publishing, "DIR", tmp_path / "publish")
    monkeypatch.setattr(publishing, "RECORD", tmp_path / "record.jsonl")
    g.merge(make_round(nodes=[Node(id="usdc", type="coin", label="USDC"), Node(id="visa", type="org", label="Visa"), Node(id="secret", type="deal", label="Pension pilot")],
                       hyperedges=[Hyperedge(id="e0", relation="links", members=["institute", "usdc"]), Hyperedge(id="e1", relation="settles_on", members=["usdc", "visa"]),
                                   Hyperedge(id="e2", relation="pilots", members=["visa", "secret"])]))
    return g


def test_unpublished_things_are_grey_shapes_with_nothing_inside(pubg):
    h = publishing.hood(pubg, "institute", 3, public=True)
    greys = [n for n in h["nodes"] if n["grey"]]
    assert {n["id"] for n in h["nodes"] if not n["grey"]} == {"institute"} and len(greys) == 3
    assert all(set(n) == {"id", "grey", "hop", "w"} and n["id"].startswith("g:") for n in greys)
    text = json.dumps(h)
    assert not any(w in text for w in ("USDC", "Visa", "Pension", "settles_on", "pilots", "coin"))
    assert {e["hop"] if "hop" in e else 0 for e in h["edges"]} == {0} and all(e["grey"] for e in h["edges"] if e["id"].startswith("g:"))
    assert publishing.hood(pubg, "secret", 2, public=True)["focus"] == "institute"            # a grey node cannot be focused from outside
    assert publishing.hood(pubg, "secret", 1, public=False)["focus"] == "secret"              # the agent's own view is whole
    assert {n["label"] for n in publishing.hood(pubg, "institute", 3, public=False)["nodes"]} >= {"USDC", "Visa", "Pension pilot"}


def test_approve_reveals_a_batch_and_retract_hides_it(pubg):
    rec = publishing.propose("Settlement rails", ["usdc", "visa"], ["e1"], "note", ["http://s"])
    assert "USDC" not in json.dumps(publishing.hood(pubg, "institute", 3)) and publishing.notes() == []
    assert publishing.act(rec["key"], "approve", pubg)["ok"] and pubg.nodes["usdc"]["pub"] and pubg.edges["e1"]["pub"]
    shown = json.dumps(publishing.hood(pubg, "institute", 3))
    assert "USDC" in shown and "Visa" in shown and "settles_on" in shown and "Pension" not in shown and "pilots" not in shown
    assert publishing.notes()[0]["title"] == "Settlement rails" and publishing.act(rec["key"], "approve", pubg)["ok"] is False
    assert json.loads(publishing.public_slice(pubg))["nodes"][0]["label"] and "Pension" not in publishing.public_slice(pubg)
    assert publishing.act(rec["key"], "retract", pubg)["ok"] and not pubg.nodes["usdc"].get("pub") and "USDC" not in json.dumps(publishing.hood(pubg, "institute", 3)) and publishing.notes() == []
    assert pubg.nodes["institute"]["pub"] and publishing.act("nope", "approve", pubg)["ok"] is False


def test_overlapping_batches_keep_what_another_still_covers(pubg):
    a, b = publishing.publish_now("A", ["usdc", "visa"], "", pubg), publishing.publish_now("B", ["visa"], "", pubg)
    assert a["ok"] and b["ok"] and pubg.edges["e1"]["pub"] and publishing.act(a["key"], "retract", pubg)["ok"]
    assert pubg.nodes["visa"]["pub"] and not pubg.nodes["usdc"].get("pub") and not pubg.edges["e1"].get("pub")


def test_questions_feed_and_counters_are_public_safe(pubg, tmp_path):
    qs = publishing.questions(pubg)
    assert len(qs) == 9 and all(q["falsifier"] and q["support"] >= 1 for q in qs)
    now = datetime.now(timezone.utc).isoformat()
    (tmp_path / "record.jsonl").write_text("\n".join(json.dumps(r) for r in [
        {"ts": now, "kind": "research", "intake": "Research this topic and return what the Institute should know, as graph deltas with sources: stablecoins", "answer": "PRIVATE"},
        {"ts": now, "kind": "ingest", "intake": "New item from http://x/rss: A paper \u2014 https://a.org/p. Fetch it, decide", "answer": "PRIVATE"},
        {"ts": now, "kind": "reexamine", "intake": "Re-examine edge secret-edge: x", "answer": "PRIVATE"},
        {"ts": now, "kind": "chat", "intake": "hello"}, {"ts": now, "kind": "research", "public": True, "intake": "x"}]) + "\n")
    f = publishing.feed()
    assert [x["title"] for x in f] == ["Re-examined a claim", "Read: A paper", "stablecoins"] and f[1]["link"] == "https://a.org/p" and "PRIVATE" not in json.dumps(f) and "secret-edge" not in json.dumps(f)
    c = publishing.counters(pubg)
    assert c["rounds_today"] == 4 and c["nodes"] >= 3 and "label" not in json.dumps(c)


def test_public_endpoints_leak_nothing_and_owner_ones_need_the_cookie():
    from fastapi.testclient import TestClient
    import serve
    c = TestClient(serve.app)
    r = c.get("/public/graph?focus=g-map&hops=3")
    assert r.status_code == 200 and r.json()["focus"] == "institute" and "Map where" not in r.text and "charter" not in r.text
    assert c.get("/graph").status_code == 200 and "Map where" not in c.get("/graph").text and c.get("/record").status_code == 404
    for path in ("/owner/graph", "/owner/record", "/owner/publish", "/owner/mindful", "/owner/hub"):
        assert c.get(path).status_code == 401
    assert c.post("/round", json={"text": "x", "kind": "research"}).status_code == 400 and c.post("/owner/chat", json={"text": "x"}).status_code == 401


def test_mindful_state_counts_the_day(monkeypatch):
    monkeypatch.setattr(mindful, "STORE", bus.Store(""))
    mindful.CFG = {"timezone": "UTC", "mindful": {"per_day": {"x": 2}, "quiet_hours": "22:00-07:00"}}
    noon = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
    assert mindful.state(noon)["channels"]["x"] == {"used": 0, "cap": 2, "waiting_gap": False} and not mindful.state(noon)["quiet_now"]
    mindful.record("x", "a", noon)
    assert mindful.state(noon)["channels"]["x"]["used"] == 1 and mindful.state(noon)["channels"]["x"]["waiting_gap"] is True


# — SOC 2 hardening: controls CC6.1, CC6.6, CC7.2, C1.2 —

def test_scrypt_hash_roundtrip_and_legacy_hash(monkeypatch):
    import hashlib
    h = auth.hash_password("correct horse")
    assert h.startswith("scrypt$") and "correct horse" not in h and h != auth.hash_password("correct horse")   # salted
    monkeypatch.delenv("OWNER_PASSWORD", raising=False)
    monkeypatch.setenv("OWNER_PASSWORD_HASH", h)
    assert auth.password_ok("correct horse") and not auth.password_ok("wrong") and not auth.password_ok("")
    monkeypatch.setenv("OWNER_PASSWORD_HASH", "scrypt$zz$zz")                       # malformed hash refuses, never raises
    assert not auth.password_ok("correct horse")
    monkeypatch.setenv("OWNER_PASSWORD_HASH", hashlib.sha256(b"old").hexdigest())
    assert auth.password_ok("old")


def test_security_log_has_actor_outcome_and_no_secrets(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "STATE", tmp_path)
    auth.audit("login", "fail", ip="203.0.113.9", password="hunter2", token="abc", target="x")
    row = json.loads((tmp_path / "security.jsonl").read_text().splitlines()[0])
    assert row["event"] == "login" and row["outcome"] == "fail" and row["actor"] == "owner" and row["ip"] == "203.0.113.9" and row["ts"].endswith("Z")
    assert "hunter2" not in json.dumps(row) and "abc" not in json.dumps(row) and row["target"] == "x"


def test_security_log_failure_does_not_crash_the_request(tmp_path, monkeypatch):
    blocker = tmp_path / "file"
    blocker.write_text("x")
    monkeypatch.setattr(auth, "STATE", blocker)                                     # cannot mkdir under a file
    auth.audit("login", "fail")                                                     # logs an error, raises nothing


def test_login_is_audited_throttled_and_never_logs_the_password(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import serve
    monkeypatch.setattr(auth, "STATE", tmp_path)
    monkeypatch.setenv("OWNER_PASSWORD", "right")
    auth._attempts.clear()
    c = TestClient(serve.app)
    assert c.post("/auth/login", json={"password": "wrong-guess-1"}).status_code == 401
    assert c.post("/auth/login", json={"password": "right"}).status_code == 200
    for _ in range(6):
        last = c.post("/auth/login", json={"password": "wrong-guess-2"}).status_code
    assert last == 429
    log = (tmp_path / "security.jsonl").read_text()
    assert '"outcome": "fail"' in log and '"outcome": "success"' in log and '"outcome": "locked_out"' in log
    assert "wrong-guess" not in log and "right" not in log.replace("outcome", "")
    auth._attempts.clear()


def test_unknown_fields_are_refused_at_the_door():
    import serve
    from pydantic import ValidationError
    for model, bad in ((serve.Intake, {"text": "x", "admin": True}), (serve.Login, {"password": "x", "role": "owner"}), (serve.Action, {"id": "a", "action": "b", "force": 1})):
        with pytest.raises(ValidationError):
            model(**bad)


def test_owner_routes_refuse_forged_expired_and_missing_sessions(monkeypatch):
    from fastapi.testclient import TestClient
    import serve
    c = TestClient(serve.app)
    good = auth.issue()
    assert c.get("/owner/graph", headers={"authorization": f"Bearer {good}"}).status_code == 200
    forged = good[:-4] + ("0000" if not good.endswith("0000") else "1111")
    for h in ({}, {"authorization": f"Bearer {forged}"}, {"authorization": f"Bearer {auth.issue(hours=-1)}"}, {"authorization": "Bearer owner.9999999999.deadbeef"}):
        assert c.get("/owner/graph", headers=h).status_code == 401
        assert c.post("/owner/publish", headers=h, json={"title": "t", "node_ids": ["institute"], "now": True}).status_code == 401


def test_opaque_ids_are_keyed_stable_and_not_a_constant(tmp_path, monkeypatch):
    import publishing
    monkeypatch.setattr(auth, "STATE", tmp_path)
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    a, b = publishing.opaque("x"), publishing.opaque("y")
    assert a != b and a == publishing.opaque("x") and a.startswith("g:") and len(a) == 14
    monkeypatch.setenv("SESSION_SECRET", "another")
    assert publishing.opaque("x") != a                                              # depends on the secret


def test_public_graph_withholds_private_labels_in_every_field(g):
    import publishing
    g.nodes["secret-claim"] = {"id": "secret-claim", "type": "claim", "label": "UNPUBLISHED-LABEL-7"}
    g.edges["e-secret"] = {"id": "e-secret", "relation": "SECRET-REL-9", "members": ["institute", "secret-claim"], "w": 0.9}
    blob = json.dumps(publishing.hood(g, "secret-claim", 3, public=True)) + publishing.public_slice(g)
    assert "UNPUBLISHED-LABEL-7" not in blob and "secret-claim" not in blob and "SECRET-REL-9" not in blob


def test_retention_drops_old_rows_keeps_new_and_unreadable(tmp_path):
    import time
    p = tmp_path / "record.jsonl"
    p.write_text("\n".join([json.dumps({"ts": time.time() - 200 * 86400, "kind": "chat"}), json.dumps({"ts": "2020-01-01T00:00:00+00:00"}),
                            json.dumps({"ts": time.time(), "kind": "chat"}), "not json", json.dumps({"kind": "no-ts"})]) + "\n")
    assert auth.purge(p, 90) == 2
    assert len(p.read_text().splitlines()) == 3
    assert auth.purge(tmp_path / "missing.jsonl", 90) == 0


# — oversee the overseers —

def _rec(kind, h, now, **kw):
    return {"kind": kind, "ts": (now - __import__("datetime").timedelta(hours=h)).isoformat(), **kw}


def test_watchers_flag_silent_and_noisy_roles():
    now = datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc)
    rec = [_rec("ingest", 30, now)] + [_rec("research", h, now, error="boom") for h in (1, 2, 3)] + [_rec("reexamine", 2, now)]
    w = {x["role"]: x for x in oversight.watchers(rec, now)}
    assert w["scout"]["state"] == "silent" and w["theorist"]["state"] == "noisy" and w["critic"]["state"] == "ok" and w["sextant"]["state"] == "idle"
    assert w["theorist"]["fail"] == 1.0 and w["theorist"]["rounds_24h"] == 3


def test_triage_ranks_batches_and_budgets():
    now = datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc)
    waiting = [{"id": f"post:{i}", "kind": "post", "title": "draft", "ts": (now.replace(hour=1)).isoformat()} for i in range(3)]
    d = {"needs_you": waiting + [{"id": "upgrade:u1", "kind": "upgrade", "title": "Cache", "ts": now.isoformat()}],
         "incidents": [{"id": "incident:x", "title": "KeyError in round", "status": "repairing"}], "apps": [{"name": "lens", "healthy": False, "restarts": 4}]}
    reg = [{"role": "substrate", "holder": "30B", "shadow": "LSTM", "holder_score": 0.81, "shadow_score": 0.83}]
    out = oversight.triage(d, [], now, reg, {"cap": 100, "used": 95}, budget=3)
    assert out["total"] == 4 + 1 + 1 + 1 + 1 + len([w for w in out["watchers"] if w["state"] == "silent"])
    assert [f["kind"] for f in out["look_now"]][:2] == ["spend", "incident"] and len(out["look_now"]) == 3
    assert all("why_later" in f for f in out["later"])
    assert {"kind": "post", "n": 3, "ids": ["post:0", "post:1", "post:2"], "actions": ["approve", "decline"]} in out["batches"]
    assert any(f["kind"] == "shadow" for f in out["look_now"] + out["later"])


def test_score_is_clamped():
    assert oversight.score("spend", 500, 9) == 100 and oversight.score("post", 0) == 30 and oversight.score("unknown", 0) == 40


def test_calm_when_nothing_burns():
    now = datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc)
    rec = [_rec(k, 1, now) for k in ("ingest", "research", "reexamine", "repair", "post")]
    out = oversight.triage({"needs_you": [], "incidents": [], "apps": []}, rec, now)
    assert out["calm"] and out["look_now"] == [] and out["minutes"] == 0
