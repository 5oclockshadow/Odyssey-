"""storage.py — layered fallback (raptor -> raw -> file). No Redis server is
running in this sandbox, so these tests exercise the real file-backend
fallback path end to end, plus the error-injection / corrupt-read cases."""

import json

from selfwire.storage import RaptorRedisStore


def test_set_get_round_trip(store):
    r = store.set("k1", {"a": 1, "b": [1, 2, 3]})
    assert r.ok
    assert store.get("k1") == {"a": 1, "b": [1, 2, 3]}


def test_missing_key_returns_none(store):
    assert store.get("does-not-exist") is None


def test_delete(store):
    store.set("k2", {"x": True})
    assert store.get("k2") is not None
    result = store.delete("k2")
    assert result.ok
    assert store.get("k2") is None


def test_delete_missing_key_is_ok(store):
    result = store.delete("never-existed")
    assert result.ok  # deleting nothing is not an error


def test_keys_prefix_listing(store):
    store.set("episode/1", {"n": 1})
    store.set("episode/2", {"n": 2})
    store.set("other/1", {"n": 3})
    keys = store.keys("episode/")
    assert set(keys) == {"episode/1", "episode/2"}


def test_falls_back_to_file_when_no_redis_reachable(tmp_path):
    # nothing is listening on this port -> connect() must fail fast (bounded
    # by connect_timeout) and the store must still work via the file layer.
    s = RaptorRedisStore(
        url="redis://127.0.0.1:1/0", namespace="t", file_root=tmp_path, connect_timeout=0.2
    )
    status = s.backend_status()
    assert status["connected_to_redis"] is False
    result = s.set("k", {"v": 1})
    assert result.ok
    assert result.backend == "file"
    assert s.get("k") == {"v": 1}


def test_backend_status_reports_last_backend(store):
    store.set("k3", {"v": 1})
    status = store.backend_status()
    assert status["last_backend_used"] in ("raptor", "raw", "file")
    assert "checked_at" in status


def test_corrupt_file_entry_does_not_raise(store, tmp_path):
    # write garbage directly where the file-backend would look, then confirm
    # get() degrades to None instead of raising (error injection).
    p = store._file_path("broken")
    p.write_text("{not valid json", encoding="utf-8")
    assert store.get("broken") is None


def test_set_survives_non_json_serializable_via_default_str(store):
    class Weird:
        def __str__(self):
            return "weird-object"

    result = store.set("weird", {"obj": Weird()})
    assert result.ok
    assert store.get("weird")["obj"] == "weird-object"
