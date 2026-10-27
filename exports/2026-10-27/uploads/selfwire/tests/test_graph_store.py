"""graph_store.py — Hebbian co-activation weights, Q-table updates, and the
3D(+time) persistence round trip."""

import time

from selfwire.graph_store import ToolGraph
from selfwire.storage import RaptorRedisStore


def test_ensure_node_is_idempotent(graph):
    graph.ensure_node("tool_a")
    graph.ensure_node("tool_a")
    assert graph.g.number_of_nodes() == 1


def test_record_use_increments_call_count(graph):
    graph.record_use("ep1", "tool_a")
    graph.record_use("ep1", "tool_a")
    assert graph.g.nodes["tool_a"]["calls"] == 2


def test_hebbian_weight_strengthens_with_repeated_co_activation(graph):
    for _ in range(5):
        graph.record_use("ep1", "tool_a")
        graph.record_use("ep1", "tool_b")
    d = graph.g.get_edge_data("tool_a", "tool_b", key=0)
    assert d is not None
    assert 0.0 < d["weight"] <= 1.0
    # weight should have grown across repetitions, not just appeared once
    assert len(d["ticks"]) == 5


def test_hebbian_weight_does_not_link_a_tool_to_itself(graph):
    graph.record_use("ep1", "tool_a")
    graph.record_use("ep1", "tool_a")
    assert not graph.g.has_edge("tool_a", "tool_a")


def test_associative_recall_ranks_by_weight(graph):
    for _ in range(3):
        graph.record_use("ep1", "tool_a")
        graph.record_use("ep1", "tool_b")
    graph.record_use("ep2", "tool_a")
    graph.record_use("ep2", "tool_c")
    recalled = graph.associative_recall("tool_a", top_k=2)
    names = [n for n, _ in recalled]
    assert names[0] == "tool_b"  # stronger co-activation should rank first


def test_associative_recall_unknown_tool_returns_empty(graph):
    assert graph.associative_recall("nope") == []
    assert graph.associative_recall(None) == []


def test_q_update_moves_value_toward_reward(graph):
    v0 = graph.q_value("s0", "tool_a")
    assert v0 == 0.0
    v1 = graph.q_update("s0", "tool_a", reward=1.0, next_state="s1")
    assert v1 > v0
    v2 = graph.q_update("s0", "tool_a", reward=1.0, next_state="s1")
    assert v2 > v1  # continues to climb toward the reward


def test_q_update_negative_reward_pushes_value_down(graph):
    graph.q_update("s0", "tool_bad", reward=1.0, next_state="s1")
    before = graph.q_value("s0", "tool_bad")
    after = graph.q_update("s0", "tool_bad", reward=-1.0, next_state="s1")
    assert after < before


def test_q_suggest_prefers_higher_value_tool_when_not_exploring(graph, monkeypatch):
    graph.q_update("s0", "good", reward=1.0, next_state="s1")
    graph.q_update("s0", "bad", reward=-1.0, next_state="s1")
    monkeypatch.setattr("selfwire.graph_store.random.random", lambda: 0.99)  # force exploit, not explore
    assert graph.q_suggest("s0", ["good", "bad"]) == "good"


def test_q_suggest_empty_candidates_returns_none(graph):
    assert graph.q_suggest("s0", []) is None


def test_snapshot_includes_3d_layout_and_time_stamped_edges(graph):
    graph.record_use("ep1", "tool_a")
    graph.record_use("ep1", "tool_b")
    snap = graph.snapshot()
    node_ids = {n["id"] for n in snap.nodes}
    assert node_ids == {"tool_a", "tool_b"}
    for n in snap.nodes:
        assert {"x", "y", "z"}.issubset(n.keys())
    edge = snap.edges[0]
    assert "weight" in edge and "ticks" in edge
    assert all(isinstance(t, float) for t in edge["ticks"])


def test_save_and_reload_round_trip(tmp_path):
    store = RaptorRedisStore(namespace="t", file_root=tmp_path, connect_timeout=0.2)
    g1 = ToolGraph(store=store, key="persist_test")
    g1.record_use("ep1", "tool_a")
    g1.record_use("ep1", "tool_b")
    g1.q_update("s0", "tool_a", reward=1.0, next_state="s1")
    g1.save()

    g2 = ToolGraph(store=store, key="persist_test")
    assert set(g2.g.nodes()) == {"tool_a", "tool_b"}
    assert g2.g.has_edge("tool_a", "tool_b")
    assert g2.q_value("s0", "tool_a") == g1.q_value("s0", "tool_a")


def test_corrupt_persisted_graph_falls_back_to_empty(tmp_path):
    store = RaptorRedisStore(namespace="t", file_root=tmp_path, connect_timeout=0.2)
    # edges missing "target" raises KeyError while loading -> must be caught
    # and degrade to a clean, empty graph rather than propagate and crash
    # whatever is constructing this ToolGraph (error injection).
    store.set("broken_graph", {"nodes": [{"id": "x"}], "edges": [{"source": "x"}], "q_table": {}})
    g = ToolGraph(store=store, key="broken_graph")
    assert g.g.number_of_nodes() == 0
    assert g.q_table == {}
