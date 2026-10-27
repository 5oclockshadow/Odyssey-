import json

import pytest

from anima_harness import Cell, Context, h0, h4, h5, make_tasks, read_rows, run_cell, shuffle, write_row
from anima_harness.substrates import Coin, Floor, Graph
from seedgen import Stream, derive, generate

S = next(i for i in range(200) if len(derive(generate(i))) >= 10)    # a seed whose rules entail something


def test_tasks_are_balanced_and_reproducible():
    s = generate(S)
    a, b = make_tasks(s, 120, Stream(1)), make_tasks(s, 120, Stream(1))
    assert a == b
    true = sum(t["expect"] for t in a)
    assert abs(true - (len(a) - true)) <= len(a) * 0.1
    assert {t["kind"] for t in a} == {"observed", "inferred"}


@pytest.mark.parametrize("cond", ["Q", "C"])
def test_graph_rung_is_exact_by_retrieval_and_in_context(cond):
    row = run_cell(Cell("graph", cond, seed=S, n=120), Graph())
    assert row["observed"] == 1.0 and row["inferred"] == 1.0
    assert row["schema_validity"] == 1.0 and row["violations"] == 0


def test_unseeded_graph_rung_scores_the_false_share():
    row = run_cell(Cell("graph", "0", seed=S, n=120), Graph())
    floor = run_cell(Cell("floor", "Q", seed=S, n=120), Floor())
    assert row["accuracy"] == floor["accuracy"] and 0.4 <= row["accuracy"] <= 0.6


def test_shuffled_seed_loses_the_structure():
    q = run_cell(Cell("graph", "Q", seed=S, n=120), Graph())
    x = run_cell(Cell("graph", "X", seed=S, n=120), Graph())
    assert x["accuracy"] < q["accuracy"] - 0.1


def test_minimal_quality_cannot_infer():
    row = run_cell(Cell("graph", "Q", "minimal", seed=S, n=120), Graph())
    assert row["observed"] == 1.0 and row["inferred"] < 1.0


def test_shuffle_keeps_degrees():
    s = generate(S)
    t = shuffle(s, Stream(9))
    deg = lambda g: sorted(m for e in g["hyperedges"] for m in e["members"])
    assert deg(s) == deg(t) and t["hyperedges"] != s["hyperedges"]


def test_answers_that_are_not_booleans_count_against_validity():
    class Mumble:
        name = "mumble"

        def answer(self, q, ctx):
            return "maybe"

    row = run_cell(Cell("mumble", "Q", seed=S, n=40), Mumble())
    assert row["schema_validity"] == 0.0 and row["accuracy"] == 0.0


def test_context_by_condition():
    s = generate(S)
    assert Context("0", s).text is None and Context("0", s).lookup("n0") == []
    assert Context("C", s).text and Context("C", s).lookup("n0") == []
    x = next(e["members"][0] for e in s["hyperedges"] if len(e["members"]) == 2)
    q = Context("Q", s)
    assert q.lookup(x) and q.served > 0


def test_rows_round_trip_as_jsonl(tmp_path):
    p = tmp_path / "results.jsonl"
    row = run_cell(Cell("coin", "Q", seed=S, n=40), Coin())
    write_row(row, p)
    write_row(row, p)
    assert read_rows(p) == [json.loads(json.dumps(row, sort_keys=True))] * 2


def test_curated_needs_a_seed_and_cells_check_their_condition():
    with pytest.raises(ValueError):
        run_cell(Cell("graph", "Q", "curated", seed=S, n=40), Graph())
    with pytest.raises(ValueError):
        Cell("graph", "Z")


def _row(rung, cond, acc, quality="curated"):
    return {"cell": {"rung": rung, "condition": cond, "quality": quality}, "accuracy": acc}


def test_verdicts_read_rows():
    rows = [_row("30b", "Q", 0.90), _row("8b", "Q", 0.88), _row("lstm", "Q", 0.86)]
    assert h0(rows)["verdict"] == "holds"
    assert h0(rows + [_row("tiny", "Q", 0.80)])["verdict"] == "refuted"
    assert h0([])["verdict"] == "no data"
    lstm = [_row("lstm", "Q", 0.86), _row("lstm", "C", 0.55), _row("lstm", "0", 0.50)]
    assert h4(lstm)["verdict"] == "holds"
    assert h5([_row("lstm", "Q", 0.86), _row("lstm", "X", 0.52), _row("lstm", "0", 0.50)])["verdict"] == "holds"
    assert h5([_row("lstm", "Q", 0.86), _row("lstm", "X", 0.80), _row("lstm", "0", 0.50)])["verdict"] == "refuted"
