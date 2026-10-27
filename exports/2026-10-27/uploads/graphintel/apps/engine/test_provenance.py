import provenance as P

N = {"q1": {"id": "q1", "type": "question", "label": "Q one", "pub": True}, "s1": {"id": "s1", "type": "paper", "label": "Paper", "pub": True},
     "c1": {"id": "c1", "type": "claim", "label": "secret", "pub": False}, "t1": {"id": "t1", "type": "span", "tel": True}}
E = {"e1": {"id": "e1", "relation": "supports", "members": ["s1", "q1"], "w": 0.4}, "e2": {"id": "e2", "relation": "bears_on", "members": ["c1", "q1"], "w": 0.2},
     "e3": {"id": "e3", "relation": "trace", "members": ["t1", "q1"], "tel": True}}
A = [{"id": "grid-watch", "role": "energy", "created": 2, "from_node": "q1"}, {"id": "ca-trends", "role": "trends", "created": 1, "from_node": "c1"}]
T = [{"id": "w1", "who": "sextant", "kind": "research", "title": "Research", "state": "done", "started": 100, "ts": 160, "energy": -0.04,
      "node_ids": ["q1", "s1", "c1", "t1", "ghost"], "origin": "sub:grid-watch", "note": "answer"},
     {"id": "w2", "who": "sub:grid-watch", "kind": "find", "title": "Found: x", "state": "done", "ts": 170, "node_ids": []},
     {"id": "w3", "who": "sub:nobody", "kind": "research", "title": "Other", "state": "ongoing", "started": 200, "ts": 200, "node_ids": ["c1"]},
     {"id": "w4", "who": "sextant", "kind": "lab", "title": "Queued", "state": "planned", "ts": 210, "node_ids": ["q1"]}]


def test_owner_view_links_agents_work_questions_and_sources():
    p = P.build(N, E, A, T)
    assert [a["id"] for a in p["agents"]] == ["sextant", "ca-trends", "grid-watch"] and [a["num"] for a in p["agents"]] == [0, 1, 2]
    w = {x["id"]: x for x in p["works"]}
    assert w["w1"]["agent"] == "sextant" and w["w1"]["origin"] == "grid-watch" and w["w1"]["dur"] == 60 and w["w1"]["nodes"] == ["q1", "s1", "c1"] and w["w1"]["note"] == "answer"
    assert w["w2"]["agent"] == "grid-watch" and w["w2"]["origin"] == ""
    assert w["w3"]["agent"] == "sextant" and w["w3"]["dur"] is None and w["w4"]["started"] is None and w["w4"]["dur"] is None
    assert {n["id"]: n["lane"] for n in p["nodes"]} == {"q1": "question", "s1": "source", "c1": "claim"}
    assert {(e["a"], e["b"], e["rel"]) for e in p["edges"]} == {("s1", "q1", "supports"), ("c1", "q1", "bears_on")}
    assert {n["id"]: n["refs"] for n in p["nodes"]} == {"q1": 2, "s1": 1, "c1": 2} and p["hidden"] == 0


def test_public_view_never_carries_a_private_node_an_agent_name_or_a_note():
    p = P.build(N, E, A, T, public=True)
    assert {n["id"] for n in p["nodes"]} == {"q1", "s1"} and p["hidden"] == 2
    assert [x["id"] for x in p["works"]] == ["w1", "w4"] and all("note" not in x for x in p["works"]) and p["works"][0]["nodes"] == ["q1", "s1"]
    assert [a["name"] for a in p["agents"]] == ["SEXTANT", "agent #1", "agent #2"]
    assert p["agents"][1]["from_node"] == "" and p["agents"][2]["from_node"] == "q1"
    assert all("c1" not in (e["a"], e["b"]) for e in p["edges"])


def test_lanes_and_the_cap():
    assert P.lane("hypothesis") == "question" and P.lane("paper") == "source" and P.lane("candidate") == "claim" and P.lane(None) == "claim"
    many = {f"n{i}": {"id": f"n{i}", "type": "claim", "label": str(i)} for i in range(50)}
    p = P.build(many, {}, [], [{"id": "w", "who": "sextant", "state": "done", "ts": 1, "node_ids": list(many)}], cap=10)
    assert len(p["nodes"]) == 10 and p["agents"] == [{"id": "sextant", "num": 0, "name": "SEXTANT", "role": "the brain", "status": "running", "where": "agent", "from_node": ""}]


def test_the_agent_brain_adds_its_tools_its_source_and_its_thoughts():
    n = dict(N, **{"file:tools.py": {"id": "file:tools.py", "type": "file", "label": "tools.py", "tel": True},
                   "code:tools.web_search": {"id": "code:tools.web_search", "type": "code", "label": "tools.web_search", "tel": True}})
    p = P.brain(n, E, A, T, ["web_search", "missing"], [{"id": "m1", "kind": "thought", "text": "Research — two sources agree", "ts": 5}])
    assert {x["id"]: x["lane"] for x in p["self"]["nodes"]} == {"file:tools.py": "module", "code:tools.web_search": "tool", "thought:m1": "thought"}
    assert {"a": "s:code:tools.web_search", "b": "s:file:tools.py", "rel": "defined_in"} in p["self"]["edges"]
    assert {"a": "s:thought:m1", "b": "w:w1", "rel": "about"} in p["self"]["edges"]
    assert all(x["id"] not in ("file:tools.py", "code:tools.web_search") for x in p["nodes"])
