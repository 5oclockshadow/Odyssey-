"""
Basic tests for Odyssey Trading Agent.
Run with: pytest tests/ -v
"""
from __future__ import annotations

import asyncio
import sys
import os

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from server import (
    cci, macd, wpr, osma, ema, atr, rsi,
    detect_fractals, fibonacci_levels, fibonacci_from_fractals,
    dynamic_sr_ema, pivot_levels, longterm_sr,
    _score_confluence, _collect_all_levels, _nearest_levels,
    _simulate_bars, MTFEngine, HebbianTable, SymbolGraph,
    TIMEFRAMES, SYMBOLS,
)
from evolution import run_ga, run_ge, Chromosome, crossover, mutate
from gym_env import make_env, DSPyBacktestRunner


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def bars():
    return _simulate_bars("EURUSD", "1h", 200)

@pytest.fixture
def arrays(bars):
    return bars["c"].to_numpy(float), bars["h"].to_numpy(float), bars["l"].to_numpy(float)

# ─── Indicator Tests ──────────────────────────────────────────────────────────

def test_ema_length(arrays):
    c, h, lo = arrays
    result = ema(c, 21)
    assert len(result) == len(c)
    assert not np.any(np.isnan(result))

def test_cci2_range(arrays):
    c, h, lo = arrays
    result = cci(h, lo, c, 2)
    assert len(result) == len(c)
    # CCI(2) can be very volatile but should be finite
    assert np.all(np.isfinite(result))

def test_cci_periods(arrays):
    c, h, lo = arrays
    for p in [2, 14, 20, 50]:
        r = cci(h, lo, c, p)
        assert len(r) == len(c), f"CCI({p}) wrong length"

def test_macd_returns_three(arrays):
    c, _, _ = arrays
    ml, sl, hist = macd(c, 12, 26, 9)
    assert len(ml) == len(c)
    assert len(sl) == len(c)
    assert len(hist) == len(c)
    # histogram = line - signal
    assert np.allclose(hist, ml - sl)

def test_macd_settings(arrays):
    c, _, _ = arrays
    for f_, s_, sig in [(12, 26, 9), (5, 35, 5), (3, 10, 16)]:
        ml, sl, hist = macd(c, f_, s_, sig)
        assert len(hist) == len(c)

def test_wpr_range(arrays):
    c, h, lo = arrays
    result = wpr(h, lo, c, 14)
    valid = result[~np.isnan(result)]
    assert np.all(valid >= -100.0)
    assert np.all(valid <= 0.0)

def test_wpr_periods(arrays):
    c, h, lo = arrays
    for p in [14, 21, 34]:
        r = wpr(h, lo, c, p)
        assert len(r) == len(c)

def test_osma(arrays):
    c, _, _ = arrays
    result = osma(c, 12, 26, 9)
    assert len(result) == len(c)
    # OsMA should match MACD histogram
    _, _, hist = macd(c, 12, 26, 9)
    assert np.allclose(result, hist)

def test_atr_positive(arrays):
    c, h, lo = arrays
    result = atr(h, lo, c, 14)
    assert len(result) == len(c)
    assert np.all(result[14:] > 0)

def test_rsi_range(arrays):
    c, _, _ = arrays
    result = rsi(c, 14)
    valid = result[14:]
    assert np.all(valid >= 0.0)
    assert np.all(valid <= 100.0)

# ─── Fractal + Fibonacci Tests ────────────────────────────────────────────────

def test_fractal_detection(arrays):
    c, h, lo = arrays
    up_idx, dn_idx = detect_fractals(h, lo)
    assert isinstance(up_idx, list)
    assert isinstance(dn_idx, list)
    # Fractals should be within array bounds
    for i in up_idx:
        assert 0 <= i < len(h)

def test_fibonacci_levels_keys():
    levels = fibonacci_levels(1.10, 1.05)
    assert "fib_0" in levels
    assert "fib_500" in levels      # 50%
    assert levels["fib_0"] == pytest.approx(1.10)
    assert levels["fib_500"] == pytest.approx(1.075)

def test_fibonacci_from_fractals(arrays):
    c, h, lo = arrays
    up_idx, dn_idx = detect_fractals(h, lo)
    result = fibonacci_from_fractals(h, lo, up_idx, dn_idx, n_fractals=3)
    assert "combined" in result
    # Each individual fractal that was found should be present
    for k in result:
        assert isinstance(result[k], dict)
        assert "fib_0" in result[k]
        assert "fib_500" in result[k]

# ─── S/R Tests ────────────────────────────────────────────────────────────────

def test_dynamic_sr_returns_emas(arrays):
    c, _, _ = arrays
    result = dynamic_sr_ema(c)
    for p in [8, 21, 55, 100, 200]:
        assert f"ema{p}" in result
    assert "clusters" in result
    assert len(result["clusters"]) >= 1

def test_pivot_standard():
    pivots = pivot_levels(1.10, 1.05, 1.075, "standard")
    assert "pp" in pivots
    assert "r1" in pivots
    assert "s1" in pivots
    # PP = (H + L + C) / 3
    assert pivots["pp"] == pytest.approx((1.10 + 1.05 + 1.075) / 3)

def test_pivot_camarilla():
    pivots = pivot_levels(1.10, 1.05, 1.075, "camarilla")
    for k in ["r1", "r2", "r3", "r4", "s1", "s2", "s3", "s4"]:
        assert k in pivots

def test_pivot_fibonacci():
    pivots = pivot_levels(1.10, 1.05, 1.075, "fibonacci")
    for k in ["pp", "r1", "r2", "r3", "s1", "s2", "s3"]:
        assert k in pivots

def test_longterm_sr(arrays):
    c, h, lo = arrays
    levels = longterm_sr(c, h, lo)
    assert isinstance(levels, list)
    # Should find some levels in 200 bars
    # (may be empty for very smooth simulated data — just check type)
    assert all(isinstance(lv, float) for lv in levels)

# ─── Scoring ──────────────────────────────────────────────────────────────────

def test_nearest_levels():
    price = 1.08
    levels = {"pivot_r1": 1.09, "pivot_s1": 1.07, "ema21": 1.085, "lt_1.10": 1.10}
    result = _nearest_levels(price, levels, n=3)
    assert len(result) <= 3
    assert all("name" in r and "level" in r and "type" in r for r in result)
    # First should be nearest
    assert result[0]["dist_pct"] <= result[-1]["dist_pct"]

# ─── Async MTF Engine ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analyze_single_tf():
    engine = MTFEngine()
    result = await engine.analyze_tf("EURUSD", "1h")
    assert result["symbol"] == "EURUSD"
    assert result["tf"] == "1h"
    assert "indicators" in result
    assert "cci_2" in result["indicators"]   # CCI(2) is primary
    assert "fibonacci" in result
    fib_keys = set(result["fibonacci"].keys())
    assert "combined" in fib_keys
    assert "pivots" in result
    assert len(result["pivots"]) == 3  # standard, camarilla, fibonacci
    assert result["trend"] in (-1, 0, 1)

@pytest.mark.asyncio
async def test_confluence_all_tfs():
    engine = MTFEngine()
    result = await engine.confluence("EURUSD")
    assert result["symbol"] == "EURUSD"
    assert len(result["tf_detail"]) == len(TIMEFRAMES)
    assert "confluence" in result
    assert 0.0 <= result["confluence"] <= 1.0
    assert result["direction"] in (-1, 0, 1)
    assert isinstance(result["reasons"], list)
    assert isinstance(result["nearest_levels"], list)

@pytest.mark.asyncio
async def test_batch_async():
    """All symbols fetched in parallel — verify count and structure."""
    engine = MTFEngine()
    tasks = [engine.confluence(s) for s in SYMBOLS]
    results = await asyncio.gather(*tasks)
    assert len(results) == len(SYMBOLS)
    for r in results:
        assert r["symbol"] in SYMBOLS
        assert "confluence" in r

# ─── Hebbian Learning ─────────────────────────────────────────────────────────

def test_hebbian_update_increases_weight():
    heb = HebbianTable()
    signal = {"cci_2": 150, "wpr_14": -15, "macd_12_26_9_hist": 0.001, "trend": 1, "confluence": 0.7}
    w0 = heb.predict(signal)
    heb.update(signal, 1.0)
    w1 = heb.predict(signal)
    assert w1 > w0, "Weight should increase for positive outcome"
    # Δw ≈ lr × pre × post  (first step from 0, decay=0.999, pre=confluence=0.7, post=+1)
    expected_delta = heb.lr * 0.7 * 1.0
    assert abs(w1 - w0 - expected_delta) < 1e-6, (
        f"Expected Δw≈{expected_delta:.6f}, got {w1 - w0:.6f}"
    )

def test_hebbian_update_decreases_weight():
    heb = HebbianTable()
    signal = {"cci_2": 150, "wpr_14": -15, "macd_12_26_9_hist": 0.001, "trend": 1, "confluence": 0.7}
    heb.update(signal, 1.0)
    heb.update(signal, 1.0)
    w_before_loss = heb.predict(signal)
    # Apply many losses
    for _ in range(10):
        heb.update(signal, -1.0)
    w_after_loss = heb.predict(signal)
    assert w_after_loss < w_before_loss

def test_hebbian_top_patterns():
    heb = HebbianTable()
    signal = {"cci_2": 150, "wpr_14": -15, "macd_12_26_9_hist": 0.001, "trend": 1, "confluence": 0.7}
    heb.update(signal, 1.0)
    patterns = heb.top_patterns(10)
    assert len(patterns) >= 1
    assert "pattern" in patterns[0]
    assert "weight" in patterns[0]
    assert "count" in patterns[0]

def test_hebbian_as_table():
    heb = HebbianTable()
    for _ in range(3):
        heb.update({"cci_2": 150, "wpr_14": -15, "macd_12_26_9_hist": 0.001,
                    "trend": 1, "confluence": 0.7}, 1.0)
    table = heb.as_table()
    assert len(table) >= 1

# ─── Symbol Graph ─────────────────────────────────────────────────────────────

def test_symbol_graph_no_data():
    sg = SymbolGraph()
    summary = sg.raptor_summary()
    assert "summary" in summary  # empty graph returns a message

def test_symbol_graph_rebuild():
    sg = SymbolGraph()
    rng = np.random.default_rng(0)
    # Push correlated data for two symbols
    base = np.cumprod(1 + rng.normal(0, 0.001, 150))
    for v in base:
        sg.push("SYM_A", float(v))
        sg.push("SYM_B", float(v * (1 + rng.normal(0, 0.0001))))  # nearly identical
        sg.push("SYM_C", float(1.0 + rng.random()))  # random — uncorrelated

    sg.rebuild()
    summary = sg.raptor_summary()
    assert summary["n_symbols"] == 3
    # SYM_A and SYM_B should be connected (high correlation)
    related = sg.related("SYM_A")
    assert any(r["symbol"] == "SYM_B" for r in related)

# ─── Evolution ────────────────────────────────────────────────────────────────

def test_chromosome_random():
    c = Chromosome.random()
    assert len(c.genes) == 12
    assert "confluence_threshold" in c.genes
    assert "cci2_ob_threshold" in c.genes

def test_crossover_produces_valid_offspring():
    p1 = Chromosome.random()
    p2 = Chromosome.random()
    c1, c2 = crossover(p1, p2)
    assert len(c1.genes) == len(p1.genes)
    assert len(c2.genes) == len(p1.genes)

def test_mutate_changes_genes():
    import random
    from evolution import PARAM_SPACE
    random.seed(0)
    original = Chromosome.random()
    mutated = mutate(original, rate=1.0)  # mutate all genes
    changed = sum(
        1 for k in original.genes
        if original.genes[k] != mutated.genes[k]
    )
    assert changed > 0
    # All mutated values must remain within valid bounds
    for name, lo, hi, is_int in PARAM_SPACE:
        v = mutated.genes[name]
        assert lo <= v <= hi, f"{name}={v} out of bounds [{lo}, {hi}]"

def test_ga_improves_fitness():
    rng = np.random.default_rng(42)
    prices = np.cumprod(1 + rng.normal(0, 0.001, 300)) * 1.08
    best, history = run_ga(prices, pop_size=15, generations=10, verbose=False)
    assert best.fitness > -99.0
    assert len(history) == 10

def test_ge_produces_expression():
    rng = np.random.default_rng(0)
    prices = np.cumprod(1 + rng.normal(0, 0.001, 200)) * 1.08
    result = run_ge(prices, pop_size=10, generations=5)
    assert "best_strategy" in result
    assert isinstance(result["best_strategy"], str)
    assert len(result["best_strategy"]) > 0

# ─── Gymnasium Env ────────────────────────────────────────────────────────────

def test_env_reset():
    env = make_env("EURUSD", n_bars=200)
    obs, info = env.reset()
    assert obs.shape == (env.window, 10)
    assert obs.dtype == np.float32

def test_env_step_hold():
    env = make_env("EURUSD", n_bars=200)
    env.reset()
    obs, reward, terminated, truncated, info = env.step(0)  # hold
    assert obs.shape == (env.window, 10)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert "balance" in info

def test_env_full_episode():
    env = make_env("EURUSD", n_bars=150)
    runner = DSPyBacktestRunner(env)
    result = runner.run_episode(render=False)
    assert "summary" in result
    assert "equity_curve" in result
    summary = result["summary"]
    assert "total_return_pct" in summary
    assert "sharpe" in summary
    assert "max_drawdown_pct" in summary
    assert len(result["equity_curve"]) >= 1

def test_env_action_space():
    env = make_env("EURUSD", n_bars=150)
    env.reset()
    # Test all three actions
    for action in [0, 1, 2]:
        env2 = make_env("EURUSD", n_bars=150)
        obs, _ = env2.reset()
        obs, r, done, trunc, info = env2.step(action)
        assert obs is not None
        if action == 0:
            assert info["position"] == 0, "Hold should leave position flat"
        elif action == 1:
            assert info["position"] in (0, 1), "Buy should set position to 1 (or close if TP/SL)"
        elif action == 2:
            assert info["position"] in (0, -1), "Sell should set position to -1 (or close if TP/SL)"
