"""TESTER on a small repository: one graph, the checks, the graph choosing what to re-test, and a fix kept only when it is verified.
No model, no network, no docker. pytest -q"""
import importlib
import json
import os
import shutil
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import agent  # noqa: E402
import checks  # noqa: E402
import ingest  # noqa: E402
from brain import Brain  # noqa: E402

CFG = {"skip": [".git", "state"], "route_prefixes": ["owner", "public", "auth", "v1", "tester"], "suites": [{"id": "api", "dir": "apps/api"}],
       "pages": {"globs": ["**/*.dc.html"]}, "max_attempts": 1, "planned_routes": []}
SVC = 'from fastapi import FastAPI\napp = FastAPI()\n\n\n@app.get("/public/hello")\ndef hello():\n    """Say hello."""\n    return {"ok": True}\n\n\ndef add(a, b):\n    return a + b\n'


def repo(tmp: Path) -> Path:
    r = tmp / "repo"
    files = {
        "apps/api/svc.py": SVC,
        "apps/api/test_svc.py": "import svc\n\n\ndef test_add():\n    assert svc.add(1, 2) == 3\n",
        "apps/ui/app.js": "function boot() {\n  return fetch('/public/hello');\n}\n",
        "apps/ui/Home.dc.html": '<x-dc><div>{{ x }}</div></x-dc>\n<script src="app.js"></script>\n<script src="gone.js"></script>\n<script>fetch("/public/nothing")</script>\n',
        "docker-compose.yml": "services:\n  api:\n    build: apps/api\n    environment:\n      KEY: ${MISSING_KEY}\n      OK: ${HAS_DEFAULT:-x}\n",
        ".env.example": "OTHER=\n",
        "apps/engine/institute.yaml": "agent:\n  tools: [add]\n",
    }
    for rel, text in files.items():
        (r / rel).parent.mkdir(parents=True, exist_ok=True)
        (r / rel).write_text(text)
    return r


def rel_set(b):
    return {(e["relation"], tuple(e["members"])) for e in b.edges.values()}


def test_one_graph_holds_code_routes_tests_pages_services_tools_and_itself(tmp_path):
    r, b = repo(tmp_path), Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    ingest.selfmodel(b, CFG, agent.TOOL_INFO, checks.CHECKS)
    n = b.nodes
    assert n["file:apps/api/svc.py"]["kind"] == "python" and n["file:apps/ui/Home.dc.html"]["kind"] == "page" and n["file:docker-compose.yml"]["kind"] == "compose"
    for i in ("code:apps/api/svc.py::add", "route:apps/api/svc.py::GET /public/hello", "test:apps/api/test_svc.py::test_add", "service:api",
              "agent:tester", "tool:read_file", "check:pytest", "agent:sextant", "tool:engine.add", "data:tester/graph.json"):
        assert i in n, i
    for want in [("handles", ("route:apps/api/svc.py::GET /public/hello", "code:apps/api/svc.py::hello")),
                 ("imports", ("file:apps/api/test_svc.py", "file:apps/api/svc.py")),
                 ("tests", ("test:apps/api/test_svc.py::test_add", "code:apps/api/svc.py::add")),
                 ("loads", ("file:apps/ui/Home.dc.html", "file:apps/ui/app.js")),
                 ("calls", ("file:apps/ui/app.js", "route:apps/api/svc.py::GET /public/hello")),
                 ("uses", ("agent:tester", "tool:read_file")), ("runs", ("agent:tester", "check:pytest")),
                 ("remembers_in", ("agent:tester", "data:tester/graph.json"))]:
        assert want in rel_set(b), want
    b.flush()
    assert json.loads((tmp_path / "g.json").read_text())["nodes"]["agent:tester"]["core"] is True


def test_rereading_a_file_keeps_what_survives_and_forgets_what_is_gone(tmp_path):
    r, b = repo(tmp_path), Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    b.node("lesson:x", "lesson", "add must stay pure")
    assert b.link("about", "lesson:x", "code:apps/api/svc.py::add")
    b.nodes["code:apps/api/svc.py::add"]["w"] = 0.9
    p = r / "apps/api/svc.py"
    p.write_text(SVC.replace("return a + b", "return b + a"))
    os.utime(p, (1, 1))
    ingest.ingest(b, r, CFG, only={"apps/api/svc.py"})
    assert "about:lesson:x|code:apps/api/svc.py::add" in b.edges and b.nodes["code:apps/api/svc.py::add"]["w"] == 0.9
    p.write_text(SVC.split("\n\n\ndef add")[0] + "\n")
    os.utime(p, (2, 2))
    ingest.ingest(b, r, CFG, only={"apps/api/svc.py"})
    assert "code:apps/api/svc.py::add" not in b.nodes and "about:lesson:x|code:apps/api/svc.py::add" not in b.edges
    assert ("tests", ("test:apps/api/test_svc.py::test_add", "code:apps/api/svc.py::add")) not in rel_set(b)
    (r / "apps/ui/app.js").unlink()
    out = ingest.ingest(b, r, CFG)
    assert out["removed"] == ["apps/ui/app.js"] and "file:apps/ui/app.js" not in b.nodes and "code:apps/ui/app.js::boot" not in b.nodes


def test_the_checks_find_what_is_wrong_and_point_at_it(tmp_path):
    r = repo(tmp_path)
    (r / "apps/api/broken.py").write_text("def f(:\n    pass\n")
    (r / "apps/api/keys.py").write_text('KEY = "sk-ant-' + "a" * 30 + '"\n')
    b = Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    found, status = checks.run(checks.plan(b, CFG, names=checks.STATIC), b, r, CFG)
    titles = " | ".join(f["title"] for f in found)
    assert any(f["check"] == "py" and f["file"] == "apps/api/broken.py" and f["line"] == 1 for f in found), titles
    assert any(f["check"] == "refs" and "gone.js" in f["title"] for f in found), titles
    assert any(f["check"] == "refs" and "apps/api/Dockerfile" in f["title"] for f in found), titles
    assert any(f["check"] == "routes" and "/public/nothing" in f["title"] for f in found), titles
    assert "/public/hello" not in titles
    assert any(f["check"] == "compose" and "MISSING_KEY" in f["title"] for f in found) and "HAS_DEFAULT" not in titles
    sec = [f for f in found if f["check"] == "secrets"]
    assert sec and "a" * 10 not in json.dumps(sec)
    assert set(status) == set(checks.STATIC)
    again, _ = checks.run(checks.plan(b, CFG, names=checks.STATIC), b, r, CFG)
    assert {f["key"] for f in found} == {f["key"] for f in again}           # stable keys: a finding keeps its history until it is fixed


def test_no_false_alarms_on_schemes_data_blocks_or_dockerfiles_built_elsewhere(tmp_path):
    r = repo(tmp_path)
    (r / "apps/ui/Frame.dc.html").write_text('<x-dc><iframe src="about:blank"></iframe><img src="blob:x"></x-dc>\n<script type="__bundler/manifest">{"a": 1}</script>\n<script type="application/json">{"b": 2}</script>\n')
    (r / "agent").mkdir()
    (r / "agent/Dockerfile").write_text("FROM python:3.12\nCOPY repo /repo\n")
    b = Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    found, _ = checks.run(checks.plan(b, CFG, names=["refs", "templates"]), b, r, CFG)
    titles = " | ".join(f["title"] for f in found)
    assert "about:blank" not in titles and "blob:" not in titles and "agent/Dockerfile" not in titles, titles
    assert checks.script_kind(' type="__bundler/manifest"') is None and checks.script_kind(' type="application/json"') is None and checks.script_kind(' src="a.js"') is None
    assert checks.script_kind("") == "script" and checks.script_kind(' type="module"') == "module" and checks.script_kind(' type="text/x-dc" data-dc-script') == "script"
    g = checks.glob_match
    assert g("a.dc.html", "*.dc.html") and not g("apps/x/a.dc.html", "*.dc.html")
    assert g("marketing/a.dc.html", "marketing/**/*.dc.html") and g("marketing/s/t/a.dc.html", "marketing/**/*.dc.html")
    assert g("apps/ops/src/A B.dc.html", "apps/*/src/*.dc.html") and not g("apps/ops/src/x/A.dc.html", "apps/*/src/*.dc.html")


def test_the_runtime_traps_found_in_this_repository_are_caught(tmp_path):
    r = repo(tmp_path)
    (r / "apps/ui/Bad.dc.html").write_text('<x-dc><div>x</div></x-dc>\n<script type="text/x-dc" data-dc-script>\nconst S = [[1], [2],, [3]];\nclass Component extends DCLogic { componentDidUpdate(_, prev) { if (prev.x) {} } }\n</script>\n')
    b = Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    found, _ = checks.run(checks.plan(b, CFG, names=["templates"]), b, r, CFG)
    titles = " | ".join(f["title"] for f in found)
    assert "componentDidUpdate reads a second parameter (prev)" in titles and "double comma" in titles, titles


def test_the_graph_decides_what_to_retest(tmp_path):
    r, b = repo(tmp_path), Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    p = checks.plan(b, CFG, changed=["apps/ui/app.js"])
    assert p["js"] == ["apps/ui/app.js"] and p["pages"] == ["apps/ui/Home.dc.html"] and not p["suites"] and "browser" in p["checks"]
    p = checks.plan(b, CFG, changed=["apps/api/svc.py"])
    assert p["py"] == ["apps/api/svc.py"] and [s["id"] for s in p["suites"]] == ["api"] and {"pytest", "routes"} <= p["checks"] and "browser" not in p["checks"]
    f = {"check": "browser", "file": "apps/ui/Home.dc.html"}
    assert checks.covers(checks.plan(b, CFG, changed=["apps/ui/app.js"]), f) and not checks.covers(p, f)


def broken(tmp_path):
    r = repo(tmp_path)
    (r / "apps/api/broken.py").write_text("def f(:\n    pass\n")
    work = tmp_path / "work"
    shutil.copytree(r, work)
    b = Brain(tmp_path / "g.json")
    ingest.ingest(b, r, CFG)
    ingest.selfmodel(b, CFG, agent.TOOL_INFO, checks.CHECKS)
    cfg = {**CFG, "suites": []}
    found, _ = checks.run(checks.plan(b, cfg, names=checks.STATIC), b, work, cfg)
    return r, work, b, cfg, next(x for x in found if x["check"] == "py"), {x["key"] for x in found}


def mind(monkeypatch, rep):
    monkeypatch.setattr(agent, "MIND", lambda intake: types.SimpleNamespace(out=rep))


def test_a_fix_is_kept_only_when_verified_and_the_brain_learns_from_it(tmp_path, monkeypatch):
    r, work, b, cfg, f, base = broken(tmp_path)
    mind(monkeypatch, agent.Repair(diagnosis="the parameter list is not closed", edits=[agent.Edit(path="apps/api/broken.py", find="def f(:", replace="def f():")],
                                   lesson="f takes no arguments", confidence=0.9))
    res = agent.attempt(f, b, work, cfg, base, tmp_path / "patches")
    assert res["ok"], res
    fx = b.nodes[res["fix"]]
    assert fx["status"] == "verified" and fx["files"] == ["apps/api/broken.py"] and (tmp_path / "patches" / fx["patch"]).exists()
    assert ("fixes", (res["fix"], "finding:" + f["key"])) in rel_set(b) and ("made", ("agent:tester", res["fix"])) in rel_set(b)
    assert any(e["relation"] == "learned" for e in b.edges.values()) and any(n["type"] == "lesson" for n in b.nodes.values())
    assert b.edges[f"points_at:finding:{f['key']}|file:apps/api/broken.py"]["w"] > 0.6        # Hebbian: the path to the fix got stronger
    assert (work / "apps/api/broken.py").read_text().startswith("def f(:")                     # the working copy is put back
    assert (r / "apps/api/broken.py").read_text().startswith("def f(:")                        # the repository is untouched until applied
    out = agent.apply_fix(res["fix"], b, r, tmp_path / "patches")
    assert out["applied"] and (r / "apps/api/broken.py").read_text().startswith("def f():") and b.nodes[res["fix"]]["status"] == "applied"
    with pytest.raises(ValueError):
        agent.apply_fix(res["fix"], b, r, tmp_path / "patches")


def test_a_fix_that_does_not_work_is_rejected_and_remembered(tmp_path, monkeypatch):
    r, work, b, cfg, f, base = broken(tmp_path)
    mind(monkeypatch, agent.Repair(diagnosis="a guess", edits=[agent.Edit(path="apps/api/broken.py", find="pass", replace="return 1")]))
    res = agent.attempt(f, b, work, cfg, base, tmp_path / "patches")
    assert not res["ok"] and "still" in res["why"] and b.nodes[res["fix"]]["status"] == "rejected"
    assert ("tried", (res["fix"], "finding:" + f["key"])) in rel_set(b)
    with pytest.raises(ValueError):
        agent.apply_fix(res["fix"], b, r, tmp_path / "patches")
    mind(monkeypatch, agent.Repair(diagnosis="x", edits=[agent.Edit(path="../outside.py", find="", replace="print(1)")]))
    res = agent.attempt(f, b, work, cfg, base, tmp_path / "patches")
    assert not res["ok"] and "outside" in res["why"] and not (tmp_path / "outside.py").exists()
    mind(monkeypatch, agent.Repair(diagnosis="needs a key", needs_owner="Put the API key in .env"))
    res = agent.attempt(f, b, work, cfg, base, tmp_path / "patches")
    assert b.nodes[res["fix"]]["status"] == "needs_owner"


def door(tmp_path, monkeypatch):
    r = repo(tmp_path)
    for k, v in {"TESTER_STATE": str(tmp_path / "state"), "TESTER_REPO": str(r), "TESTER_LOOP": "off", "TESTER_TOKEN": "t", "TESTER_LIVE": "off"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("TESTER_MODEL", raising=False)
    import serve
    serve = importlib.reload(serve)
    ingest.ingest(serve.brain, r, serve.cfg)
    ingest.selfmodel(serve.brain, serve.cfg, agent.TOOL_INFO, checks.CHECKS)
    return serve


def test_the_door_routes_answer_without_a_server(tmp_path, monkeypatch):
    serve = door(tmp_path, monkeypatch)
    from fastapi import HTTPException
    h = serve.health()
    assert h["ok"] and h["fixing"] is False and h["graph"]["by_type"]["agent"] >= 1
    g = serve.graph(focus="", hops=2, limit=900, format="connectome")
    assert {"agent", "tool", "module"} <= {n["lane"] for n in g["nodes"]} and g["edges"]
    assert serve.node("agent:tester")["node"]["label"] == "TESTER"
    with pytest.raises(HTTPException) as e:
        serve.post_run(serve.RunIn(checks=["nope"]), True)
    assert e.value.status_code == 400
    assert serve.post_run(serve.RunIn(checks=["py"]), True)["queued"]
    with pytest.raises(HTTPException) as e:
        serve.post_fix("none", True)
    assert e.value.status_code == 404


@pytest.mark.skipif(sys.platform == "emscripten", reason="the HTTP test client needs threads")
def test_the_door(tmp_path, monkeypatch):
    serve = door(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    h = {"authorization": "Bearer t"}
    with TestClient(serve.app) as c:
        health = c.get("/health").json()
        assert health["ok"] and health["fixing"] is False and health["graph"]["by_type"]["agent"] >= 1
        g = c.get("/graph").json()
        assert {"agent", "tool", "module"} <= {n["lane"] for n in g["nodes"]} and g["edges"]
        assert c.get("/node/agent:tester").json()["node"]["label"] == "TESTER"
        assert c.post("/run", json={}).status_code == 401
        assert c.post("/run", json={"checks": ["nope"]}, headers=h).status_code == 400
        assert c.post("/run", json={"admin": True}, headers=h).status_code == 422
        assert c.post("/run", json={"checks": ["py"]}, headers=h).status_code == 202
        assert c.post("/fix/none", headers=h).status_code == 404
        assert c.post("/fixes/fix:none/apply", headers=h).status_code == 404
        assert "No model" in c.post("/ask", json={"text": "which tools"}, headers=h).json()["answer"]
