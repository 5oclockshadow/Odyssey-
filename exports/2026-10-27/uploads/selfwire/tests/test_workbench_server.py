import threading

import pytest
from fastapi.testclient import TestClient

from selfwire.workbench.server import create_app


@pytest.fixture
def client(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    wb.settings.update(model=None)
    with TestClient(create_app(wb, allowed_hosts=["testserver"])) as c:
        c.wb = wb
        yield c


def test_health_and_ui(client):
    health = client.get("/api/health").json()
    assert health["ok"] and health["lm_configured"] is False and health["python"].startswith("3.")
    page = client.get("/")
    assert page.status_code == 200 and "<html" in page.text.lower()
    assert page.headers["cache-control"] == "no-store"


def test_dashboard_edits_show_at_preview_until_restart(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    live = "selfwire/workbench/ui/index.html"
    wb.workspace.write(live, "<html><body>v1</body></html>")
    with TestClient(create_app(wb, allowed_hosts=["testserver"])) as c:
        c.put("/api/file", json={"path": live, "content": "<html><body>v2 edited live</body></html>"})
        page = c.get("/")
        assert "v1" in page.text, "the served dashboard is the startup snapshot"
        assert page.headers["x-frame-options"] == "DENY"
        preview = c.get("/preview")
        assert "v2 edited live" in preview.text
        assert "connect-src 'none'" in preview.headers["content-security-policy"], "preview JS cannot call the API"


def test_file_crud_and_errors(client):
    assert client.put("/api/file", json={"path": "pkg/a.py", "content": "A = 1\n"}).json() == {"ok": True, "path": "pkg/a.py", "size": 6}
    assert client.get("/api/file", params={"path": "pkg/a.py"}).json()["content"] == "A = 1\n"
    assert "pkg/a.py" in [f["path"] for f in client.get("/api/tree").json()["files"]]
    assert client.post("/api/file/move", json={"src": "pkg/a.py", "dst": "pkg/b.py"}).json()["dst"] == "pkg/b.py"
    assert client.delete("/api/file", params={"path": "pkg/b.py"}).json()["ok"]
    assert client.get("/api/file", params={"path": "pkg/b.py"}).status_code == 404
    traversal = client.get("/api/file", params={"path": "../../etc/passwd"})
    assert traversal.status_code == 400 and "escapes" in traversal.json()["detail"]
    protected = client.put("/api/file", json={"path": "selfwire/workbench/moat.py", "content": "x"})
    assert protected.status_code == 400 and "protected" in protected.json()["detail"]
    assert client.get("/api/tree").json()["protected"] == ["selfwire/workbench/moat.py"]


def test_git_endpoints(client):
    client.put("/api/file", json={"path": "x.txt", "content": "x"})
    assert client.get("/api/git/status").json()["dirty"]
    assert "x.txt" in client.get("/api/git/diff").json()["diff"]
    sha = client.post("/api/git/commit", json={"message": "add x"}).json()["sha"]
    log = client.get("/api/git/log", params={"limit": 5}).json()["commits"]
    assert log[0]["sha"] == sha and log[0]["message"] == "add x"
    assert client.post("/api/git/commit", json={"message": "again"}).status_code == 400
    head = client.post("/api/git/rollback", json={"sha": log[1]["sha"]}).json()["head"]
    assert head == log[1]["sha"] and client.get("/api/file", params={"path": "x.txt"}).status_code == 404
    assert client.post("/api/git/rollback", json={"sha": "nothex!"}).status_code == 400


def test_tests_job_audit_and_jobs(client):
    job_id = client.post("/api/tests/run", json={}).json()["job_id"]
    job = client.wb.jobs.wait(job_id, timeout=60)
    assert job.status == "succeeded"
    assert client.get(f"/api/jobs/{job_id}").json()["result"]["passed"] == 1
    assert client.get("/api/tests/last").json()["ok"] is True
    assert job_id in [j["id"] for j in client.get("/api/jobs").json()["jobs"]]
    assert client.get("/api/jobs/doesnotexist").status_code == 404
    assert client.post("/api/tests/run", json={"selector": "--collect-only"}).status_code == 400
    audit = client.post("/api/audit").json()
    assert audit["score"] == 100 and client.get("/api/audit/last").json()["score"] == 100


def test_skills_crud(client):
    body = "---\nname: demo\ndescription: a demo skill\n---\n\nDo the thing."
    assert client.put("/api/skills/demo", json={"content": body}).json()["path"] == "skills/demo/SKILL.md"
    assert client.get("/api/skills").json()["skills"] == [{"name": "demo", "description": "a demo skill", "path": "skills/demo/SKILL.md"}]
    assert "Do the thing" in client.get("/api/skills/demo").json()["content"]
    assert client.put("/api/skills/Bad Name", json={"content": "x"}).status_code == 400
    assert client.delete("/api/skills/demo").json()["ok"]
    assert client.get("/api/skills/demo").status_code == 404


def test_chat_settings_and_improve_without_model(client):
    reply = client.post("/api/chat", json={"message": "/ls"}).json()
    assert reply["kind"] == "command" and reply["message_id"]
    assert [m["role"] for m in client.get("/api/chat/history").json()["messages"]] == ["user", "assistant"]
    assert client.post("/api/improve", json={"goal": "x"}).status_code == 400
    saved = client.post("/api/settings", json={"model": "openai/gpt-4o-mini", "api_key": "sk-secret-123", "max_iters": 5}).json()
    assert saved == {"model": "openai/gpt-4o-mini", "has_key": True, "api_base": None, "max_iters": 5,
                     "allow_unsafe_levers": False}
    assert "sk-secret" not in client.get("/api/settings").text, "the API key is never echoed back"
    assert client.post("/api/settings", json={"max_iters": 999}).status_code == 400


def test_mutations_return_409_while_an_improvement_owns_the_tree(client):
    gate = threading.Event()
    job = client.wb.jobs.submit("improve", "holding", lambda ctx: gate.wait(10), group="workspace")
    try:
        assert client.put("/api/file", json={"path": "y.txt", "content": "y"}).status_code == 409
        assert client.post("/api/git/commit", json={"message": "m"}).status_code == 409
        assert client.post("/api/tests/run", json={}).status_code == 409
        assert client.post("/api/chat", json={"message": "/write z.txt\nz"}).json()["kind"] == "error"
        assert client.get("/api/file", params={"path": "calc/__init__.py"}).status_code == 200, "reads stay available"
    finally:
        gate.set()
        client.wb.jobs.wait(job.id)


def test_tools_graph_and_restart_guard(client):
    tools = client.get("/api/tools").json()["tools"]
    assert {"read_file", "write_file", "run_tests", "git_commit"} <= set(tools)
    graph = client.get("/api/graph").json()
    assert {"read_file", "run_tests"} <= {n["id"] for n in graph["nodes"]}
    assert client.post("/api/restart").status_code == 400  # not launched via the CLI


def test_token_auth(mini_repo, workbench_factory):
    wb = workbench_factory(mini_repo)
    with TestClient(create_app(wb, token="s3cret", allowed_hosts=["testserver"])) as c:
        assert c.get("/api/health").status_code == 401
        assert c.get("/api/health", headers={"X-Selfwire-Token": "wrong"}).status_code == 401
        assert c.get("/api/health", headers={"X-Selfwire-Token": "s3cret"}).status_code == 200
        assert c.get("/api/health", params={"token": "s3cret"}).status_code == 200
        assert c.get("/").status_code == 200, "the page itself loads; it carries the token from its URL"
