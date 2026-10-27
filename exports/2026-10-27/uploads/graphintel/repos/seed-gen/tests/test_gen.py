import pytest

from seedgen import Stream, derive, digest, facts, generate, members, minimal


def test_stream_matches_reference_splitmix64():
    s = Stream(0)
    assert [s.next() for _ in range(3)] == [0xE220A8397B1DCDAF, 0x6E789E6AA1B965F4, 0x06C45D188009454F]


def test_same_integer_same_seed():
    assert generate(7) == generate(7)
    assert digest(generate(7)) == digest(generate(7))


def test_different_integers_differ():
    assert digest(generate(7)) != digest(generate(8))


@pytest.mark.parametrize("depth", [1, 2, 3, 6])
def test_type_tree_is_acyclic_and_reaches_depth(depth):
    s = generate(3, depth=depth, types=depth + 4)
    by = {t["id"]: t for t in s["types"]}
    for t in s["types"]:
        assert t["level"] == 0 if t["parent"] is None else by[t["parent"]]["level"] == t["level"] - 1
    assert max(t["level"] for t in s["types"]) == depth


def test_binary_edges_respect_signatures():
    s = generate(11)
    mem, sig = members(s), {r["id"]: r for r in s["signatures"]}
    for e in s["hyperedges"]:
        if e["rel"] == "group":
            assert len(set(e["members"])) >= 3
            continue
        x, y = e["members"]
        assert x != y and x in mem[sig[e["rel"]]["domain"]] and y in mem[sig[e["rel"]]["range"]]


def test_sizes():
    s = generate(5, nodes=80, edges=120)
    assert len(s["nodes"]) == 80
    assert 0.8 * 120 <= len(s["hyperedges"]) <= 120
    assert len({e["id"] for e in s["hyperedges"]}) == len(s["hyperedges"])


def test_rules_compose_typed_relations_within_depth():
    s = generate(9, depth=3, rules=6)
    sig = {r["id"]: r for r in s["signatures"]}
    for r in s["constraints"]:
        a, b, c = sig[r["if"][0]], sig[r["if"][1]], sig[r["then"]]
        assert c["kind"] == "derived" and c["domain"] == a["domain"] and c["range"] == b["range"]
        assert c["height"] == max(a["height"], b["height"]) + 1 <= 3


def test_derive_reaches_a_fixpoint_of_well_typed_facts():
    s = generate(9, depth=3, rules=6)
    mem, sig = members(s), {r["id"]: r for r in s["signatures"]}
    out = derive(s)
    assert out == derive(s) and not set(out) & facts(s)
    for rel, x, z in out:
        assert sig[rel]["kind"] == "derived" and x in mem[sig[rel]["domain"]] and z in mem[sig[rel]["range"]]


def test_derive_on_a_hand_built_chain():
    s = {"hyperedges": [{"id": "e0", "rel": "r0", "members": ["a", "b"]}, {"id": "e1", "rel": "r1", "members": ["b", "c"]}],
         "constraints": [{"id": "h0", "if": ["r0", "r1"], "then": "d0"}, {"id": "h1", "if": ["d0", "r0"], "then": "d1"}]}
    assert derive(s) == [("d0", "a", "c")]


def test_some_small_seed_entails_facts():
    assert any(derive(generate(i)) for i in range(20))


def test_minimal_keeps_incidence_and_types_only():
    assert set(minimal(generate(2))) == {"format", "seed", "params", "types", "nodes", "hyperedges"}


@pytest.mark.parametrize("kw", [{"depth": 0}, {"depth": 4, "types": 4}, {"nodes": 2}, {"nary": 1.0}])
def test_rejects_parameters_that_cannot_make_a_seed(kw):
    with pytest.raises(ValueError):
        generate(1, **kw)
