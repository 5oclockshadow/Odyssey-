"""Tester seats: sign-in, the read-only brain and the element chat door. No network, no docker, no model. pytest -q"""
import types

import pytest
from fastapi.testclient import TestClient

import auth


@pytest.fixture
def seats(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "STATE", tmp_path)
    monkeypatch.setenv("SESSION_SECRET", "t")
    monkeypatch.setenv("TESTER_CODES", "tester01:basalt-7492, Tester02 : ember-5155")
    auth._attempts.clear()
    auth._buckets.clear()
    return tmp_path


def test_seats_come_from_the_environment_and_are_normalised(seats):
    assert auth.testers() == {"tester01": "basalt-7492", "tester02": "ember-5155"}
    assert auth.tester_ok("TESTER01", " Basalt-7492 ") and not auth.tester_ok("tester01", "ember-5155") and not auth.tester_ok("nobody", "x")
    assert auth.seat("tester.01 ") == "tester01"          # a dot would break the token format


def test_seats_fall_back_to_state_file(seats, monkeypatch):
    monkeypatch.delenv("TESTER_CODES")
    (seats / "testers.json").write_text('{"tester09": "lattice-3281"}')
    assert auth.testers() == {"tester09": "lattice-3281"}


def test_a_tester_session_is_never_an_owner_session_and_dies_with_its_seat(seats, monkeypatch):
    t = auth.issue(who="tester-tester01")
    assert auth.who(t) == "tester-tester01" and not auth.verify(t)
    assert auth.who(auth.issue()) == "owner" and auth.verify(auth.issue())
    assert auth.who(t[:-1] + ("0" if t[-1] != "0" else "1")) is None
    assert auth.who(auth.issue(hours=-1, who="tester-tester01")) is None
    monkeypatch.setenv("TESTER_CODES", "tester02:ember-5155")
    assert auth.who(t) is None


def test_tester_doors(seats, monkeypatch):
    import serve
    c = TestClient(serve.app)
    assert {"/tester/login", "/tester/brain", "/tester/ask"} <= {r.path for r in serve.app.routes}
    assert c.get("/tester/brain").status_code == 401 and c.post("/tester/ask", json={"text": "hi"}).status_code == 401
    assert c.post("/tester/login", json={"user": "tester01", "code": "wrong"}).status_code == 401
    assert c.post("/tester/login", json={"user": "tester01", "code": "basalt-7492", "role": "owner"}).status_code == 422
    r = c.post("/tester/login", json={"user": "tester01", "code": "basalt-7492"})
    assert r.status_code == 200 and r.json()["seat"] == "tester01"
    h = {"authorization": "Bearer " + r.json()["token"]}
    assert c.get("/owner/brain", headers=h).status_code == 401 and c.get("/owner/provenance", headers=h).status_code == 401
    b = c.get("/tester/brain?n=50", headers=h)
    assert b.status_code == 200 and b.json()["seat"] == "tester-tester01" and isinstance(b.json().get("agents"), list)
    seen = {}

    async def fake_round(text, kind):
        seen.update(text=text, kind=kind)
        return types.SimpleNamespace(answer="I am a claim.", energy=types.SimpleNamespace(model_dump=lambda: {"total": 0.1}), nodes=[], hyperedges=[], definitions=[])

    monkeypatch.setattr(serve.R, "round", fake_round)
    a = c.post("/tester/ask", json={"text": "What supports you?", "key": "n:c-1<script>"}, headers=h)
    assert a.status_code == 200 and a.json()["answer"] == "I am a claim." and a.json()["key"] == "n:c-1script"
    assert seen["kind"] == "chat" and seen["text"].startswith("[tester-tester01 asks brain element n:c-1script]")
    rows = (seats / "security.jsonl").read_text()
    assert "tester_login" in rows and "basalt" not in rows
