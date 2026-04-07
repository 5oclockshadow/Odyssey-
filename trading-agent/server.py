"""
Odyssey Trading Server — Multi-Timeframe Confluence Strategy
Under 1250 LOC | Core logic: dynamic/static S/R, Fibonacci fractals,
CCI(2)/MACD/WPR/OSMA, Graph/RAPTOR, Hebbian table, DSPy agent integration.
"""

from __future__ import annotations

import asyncio
import json
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import networkx as nx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    import agents as trading_agents  # local module
    _AGENTS_AVAILABLE = True
except ImportError:
    _AGENTS_AVAILABLE = False

# ─── Configuration ─────────────────────────────────────────────────────────────

TIMEFRAMES: List[str] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]
SYMBOLS: List[str] = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSDT"]
EMA_PERIODS: List[int] = [8, 21, 55, 100, 200]
CCI_PERIODS: List[int] = [2, 14, 20, 50]       # CCI(2) is the primary signal
MACD_SETTINGS: List[Tuple] = [(12, 26, 9), (5, 35, 5), (3, 10, 16)]
WPR_PERIODS: List[int] = [14, 21, 34]
OSMA_SETTINGS: List[Tuple] = [(12, 26, 9), (5, 35, 5)]
FIB_LEVELS: List[float] = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
PIVOT_METHODS: List[str] = ["standard", "camarilla", "fibonacci"]
HEBBIAN_LR: float = 0.01
HEBBIAN_DECAY: float = 0.999
GRAPH_TOP_K: int = 10
BARS_DEFAULT: int = 500
FRACTAL_LOOKBACK: int = 2       # Williams fractal: n bars each side
LONGTERM_SR_LOOKBACK: int = 250  # bars for long-term S/R detection
SR_TOUCH_MIN: int = 3            # minimum touches for a level to be valid
CONFLUENCE_THRESHOLD: float = 0.55

# ─── Pydantic Models ───────────────────────────────────────────────────────────

class Bar(BaseModel):
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0

class SignalModel(BaseModel):
    symbol: str
    timeframe: str
    direction: int          # 1=long, -1=short, 0=flat
    strength: float         # 0–1 trend alignment
    confluence: float       # 0–1 overall score
    reasons: List[str] = []
    levels: Dict[str, float] = {}
    ts: float = Field(default_factory=time.time)

class TradeDecision(BaseModel):
    symbol: str
    action: str             # "buy" | "sell" | "hold"
    size: float = 1.0
    tp: Optional[float] = None
    sl: Optional[float] = None
    confidence: float = 0.0
    reasoning: str = ""
    ts: float = Field(default_factory=time.time)

class BatchRequest(BaseModel):
    symbols: Optional[List[str]] = None

class HebbianUpdateRequest(BaseModel):
    signal: Dict[str, Any]
    outcome: float  # positive = win, negative = loss

# ─── Indicator Library ─────────────────────────────────────────────────────────

def ema(series: np.ndarray, period: int) -> np.ndarray:
    """Exponential moving average (recursive, O(n))."""
    k = 2.0 / (period + 1.0)
    out = np.empty(len(series), dtype=float)
    out[0] = series[0]
    for i in range(1, len(series)):
        out[i] = series[i] * k + out[i - 1] * (1.0 - k)
    return out

def sma(series: np.ndarray, period: int) -> np.ndarray:
    return pd.Series(series).rolling(period, min_periods=1).mean().to_numpy()

def cci(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 2) -> np.ndarray:
    """Commodity Channel Index — CCI(2) provides hyper-sensitive momentum."""
    tp = (high + low + close) / 3.0
    ma = sma(tp, period)
    def _mad(x: np.ndarray) -> float:
        return float(np.mean(np.abs(x - x.mean()))) if len(x) else 1e-9
    mad = pd.Series(tp).rolling(period, min_periods=1).apply(_mad, raw=True).to_numpy()
    mad = np.where(mad < 1e-12, 1e-12, mad)
    return (tp - ma) / (0.015 * mad)

def macd(close: np.ndarray, fast: int = 12, slow: int = 26,
         signal_p: int = 9) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (macd_line, signal_line, histogram)."""
    fast_e = ema(close, fast)
    slow_e = ema(close, slow)
    macd_l = fast_e - slow_e
    sig_l = ema(macd_l, signal_p)
    return macd_l, sig_l, macd_l - sig_l

def wpr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 14) -> np.ndarray:
    """Williams %R (0 to -100)."""
    out = np.full(len(close), -50.0)
    for i in range(period - 1, len(close)):
        hh = high[i - period + 1: i + 1].max()
        ll = low[i - period + 1: i + 1].min()
        out[i] = -100.0 * (hh - close[i]) / (hh - ll) if hh != ll else -50.0
    return out

def osma(close: np.ndarray, fast: int = 12, slow: int = 26,
         signal_p: int = 9) -> np.ndarray:
    """OsMA = MACD histogram (MACD line minus signal line)."""
    _, _, hist = macd(close, fast, slow, signal_p)
    return hist

def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 14) -> np.ndarray:
    tr = np.maximum(high[1:] - low[1:],
         np.maximum(np.abs(high[1:] - close[:-1]),
                    np.abs(low[1:] - close[:-1])))
    tr = np.insert(tr, 0, tr[0])
    return pd.Series(tr).rolling(period, min_periods=1).mean().to_numpy()

def rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    delta = np.diff(close, prepend=close[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_gain = pd.Series(gain).ewm(com=period - 1, min_periods=period).mean().to_numpy()
    avg_loss = pd.Series(loss).ewm(com=period - 1, min_periods=period).mean().to_numpy()
    rs = np.where(avg_loss < 1e-12, 100.0, avg_gain / avg_loss)
    return 100.0 - 100.0 / (1.0 + rs)

# ─── Fractal Detection ─────────────────────────────────────────────────────────

def detect_fractals(high: np.ndarray, low: np.ndarray,
                    n: int = FRACTAL_LOOKBACK) -> Tuple[List[int], List[int]]:
    """Williams fractals: n bars each side must be lower/higher."""
    up_idx, dn_idx = [], []
    for i in range(n, len(high) - n):
        if all(high[i] >= high[i - j] and high[i] >= high[i + j]
               for j in range(1, n + 1)):
            up_idx.append(i)
        if all(low[i] <= low[i - j] and low[i] <= low[i + j]
               for j in range(1, n + 1)):
            dn_idx.append(i)
    return up_idx, dn_idx

def fibonacci_levels(price_high: float, price_low: float,
                     levels: Optional[List[float]] = None) -> Dict[str, float]:
    """Fibonacci retracement levels from high to low."""
    if levels is None:
        levels = [0.0, 0.236, 0.382, 0.5]  # 0-50% as specified
    rng = price_high - price_low
    return {f"fib_{int(lv * 1000)}": round(price_high - lv * rng, 6) for lv in levels}

def fibonacci_from_fractals(high: np.ndarray, low: np.ndarray,
                             up_idx: List[int], dn_idx: List[int],
                             n_fractals: int = 3) -> Dict[str, Any]:
    """
    Fibonacci 0-50% of last 3 fractals separately AND combined.
    Returns dict keys 'f1','f2','f3','combined'.
    """
    # Build alternate swing pivots (sorted by bar index)
    all_pivots = sorted(
        [(i, "H", float(high[i])) for i in up_idx[-n_fractals:]] +
        [(i, "L", float(low[i])) for i in dn_idx[-n_fractals:]],
        key=lambda x: x[0],
    )
    # Extract consecutive swing pairs
    pairs: List[Tuple[float, float]] = []
    for k in range(len(all_pivots) - 1):
        a, b = all_pivots[k], all_pivots[k + 1]
        h_val = max(a[2], b[2])
        l_val = min(a[2], b[2])
        if h_val > l_val:
            pairs.append((h_val, l_val))

    result: Dict[str, Any] = {}
    for idx, (h_val, l_val) in enumerate(pairs[-n_fractals:]):
        result[f"f{idx + 1}"] = fibonacci_levels(h_val, l_val)

    # Combined: overall range of all collected pivots
    if all_pivots:
        h_vals = [p[2] for p in all_pivots if p[1] == "H"]
        l_vals = [p[2] for p in all_pivots if p[1] == "L"]
        comb_h = max(h_vals) if h_vals else max(p[2] for p in all_pivots)
        comb_l = min(l_vals) if l_vals else min(p[2] for p in all_pivots)
        if comb_h > comb_l:
            result["combined"] = fibonacci_levels(comb_h, comb_l)
    return result

# ─── Support / Resistance ──────────────────────────────────────────────────────

def dynamic_sr_ema(close: np.ndarray,
                   periods: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Dynamic S/R from EMA confluence.
    EMAs within 0.1% of each other form a zone (stronger S/R).
    """
    if periods is None:
        periods = EMA_PERIODS
    ema_vals = {f"ema{p}": float(ema(close, p)[-1]) for p in periods}
    values = sorted(ema_vals.values())
    clusters: List[float] = []
    bucket: List[float] = [values[0]]
    for v in values[1:]:
        if abs(v - bucket[-1]) / max(bucket[-1], 1e-9) < 0.001:
            bucket.append(v)
        else:
            clusters.append(float(np.mean(bucket)))
            bucket = [v]
    clusters.append(float(np.mean(bucket)))
    return {**ema_vals, "clusters": clusters, "n_clusters": len(clusters)}

def pivot_levels(prev_high: float, prev_low: float, prev_close: float,
                 method: str = "standard") -> Dict[str, float]:
    """Standard, Camarilla, and Fibonacci pivot levels."""
    rng = prev_high - prev_low
    if method == "standard":
        pp = (prev_high + prev_low + prev_close) / 3.0
        return dict(
            pp=pp,
            r1=round(2 * pp - prev_low, 6),  r2=round(pp + rng, 6),
            r3=round(prev_high + 2 * (pp - prev_low), 6),
            s1=round(2 * pp - prev_high, 6), s2=round(pp - rng, 6),
            s3=round(prev_low - 2 * (prev_high - pp), 6),
        )
    if method == "camarilla":
        return {
            "r4": round(prev_close + rng * 1.1 / 2, 6),
            "r3": round(prev_close + rng * 1.1 / 4, 6),
            "r2": round(prev_close + rng * 1.1 / 6, 6),
            "r1": round(prev_close + rng * 1.1 / 12, 6),
            "s1": round(prev_close - rng * 1.1 / 12, 6),
            "s2": round(prev_close - rng * 1.1 / 6, 6),
            "s3": round(prev_close - rng * 1.1 / 4, 6),
            "s4": round(prev_close - rng * 1.1 / 2, 6),
        }
    if method == "fibonacci":
        pp = (prev_high + prev_low + prev_close) / 3.0
        return {
            "pp": round(pp, 6),
            "r1": round(pp + 0.382 * rng, 6), "r2": round(pp + 0.618 * rng, 6),
            "r3": round(pp + rng, 6),
            "s1": round(pp - 0.382 * rng, 6), "s2": round(pp - 0.618 * rng, 6),
            "s3": round(pp - rng, 6),
        }
    return {}

def longterm_sr(close: np.ndarray, high: np.ndarray, low: np.ndarray,
                lookback: int = LONGTERM_SR_LOOKBACK,
                tolerance: float = 0.002) -> List[float]:
    """
    Static long-term S/R: price levels tested 3+ times (within 0.2% tolerance).
    Uses density-based approach over recent high/low extremes.
    """
    prices = np.concatenate([high[-lookback:], low[-lookback:]])
    step = float(close[-1]) * tolerance
    if step < 1e-9:
        return []
    buckets: Dict[float, int] = defaultdict(int)
    for p in prices:
        key = round(float(p) / step) * step
        buckets[key] += 1
    return sorted(float(lv) for lv, cnt in buckets.items() if cnt >= SR_TOUCH_MIN)

# ─── Scoring helpers ───────────────────────────────────────────────────────────

def _trend_bias(close: np.ndarray, dyn_sr: Dict[str, Any]) -> int:
    """Return 1 (bullish), -1 (bearish), or 0 from EMA stack alignment."""
    ema_vals = {k: v for k, v in dyn_sr.items()
                if k.startswith("ema") and isinstance(v, float)}
    if not ema_vals:
        return 0
    price = float(close[-1])
    above = sum(1 for v in ema_vals.values() if price > v)
    frac = above / len(ema_vals)
    return 1 if frac >= 0.6 else -1 if frac <= 0.3 else 0

def _collect_all_levels(tf_result: Dict[str, Any]) -> Dict[str, float]:
    """Flatten all S/R levels from one TF analysis result."""
    levels: Dict[str, float] = {}
    for method, data in tf_result.get("pivots", {}).items():
        for k, v in data.items():
            levels[f"{method}_{k}"] = float(v)
    for lt in tf_result.get("longterm_sr", []):
        levels[f"lt_{round(lt, 5)}"] = float(lt)
    for k, v in tf_result.get("dynamic_sr", {}).items():
        if isinstance(v, float):
            levels[f"dyn_{k}"] = v
    for grp, lvls in tf_result.get("fibonacci", {}).items():
        if isinstance(lvls, dict):
            for fk, fv in lvls.items():
                levels[f"fib_{grp}_{fk}"] = float(fv)
    return levels

def _nearest_levels(price: float, levels: Dict[str, float],
                    n: int = 6) -> List[Dict[str, Any]]:
    """Return n nearest S/R levels, labelled support or resistance."""
    tagged = []
    for name, level in levels.items():
        dist_pct = abs(price - level) / max(abs(price), 1e-9)
        tagged.append({
            "name": name,
            "level": round(level, 6),
            "type": "support" if level <= price else "resistance",
            "dist_pct": round(dist_pct * 100, 4),
        })
    tagged.sort(key=lambda x: x["dist_pct"])
    return tagged[:n]

def _score_confluence(symbol: str, tf_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate multi-timeframe analyses into a single confluence score."""
    n = len(tf_results)
    trends = [r.get("trend", 0) for r in tf_results]
    bull_tf = sum(1 for t in trends if t == 1)
    bear_tf = sum(1 for t in trends if t == -1)

    # CCI(2) overbought/oversold alignment
    cci2_up = sum(1 for r in tf_results
                  if r["indicators"].get("cci_2", 0) > 100)
    cci2_dn = sum(1 for r in tf_results
                  if r["indicators"].get("cci_2", 0) < -100)

    # MACD histogram sign alignment
    macd_up = sum(1 for r in tf_results
                  if r["indicators"].get("macd_12_26_9_hist", 0) > 0)
    macd_dn = sum(1 for r in tf_results
                  if r["indicators"].get("macd_12_26_9_hist", 0) < 0)

    # WPR(14) alignment
    wpr_up = sum(1 for r in tf_results
                 if r["indicators"].get("wpr_14", -50) > -30)
    wpr_dn = sum(1 for r in tf_results
                 if r["indicators"].get("wpr_14", -50) < -70)

    # OsMA sign alignment
    osma_up = sum(1 for r in tf_results
                  if r["indicators"].get("osma_12_26_9", 0) > 0)
    osma_dn = sum(1 for r in tf_results
                  if r["indicators"].get("osma_12_26_9", 0) < 0)

    direction = 1 if bull_tf > bear_tf else -1 if bear_tf > bull_tf else 0

    def _score_dir(up_count: int, dn_count: int) -> float:
        if direction == 1:
            return up_count / n
        if direction == -1:
            return dn_count / n
        return 0.0

    ema_score = abs(bull_tf - bear_tf) / n
    confluence = (
        ema_score * 0.35
        + _score_dir(cci2_up, cci2_dn) * 0.25
        + _score_dir(macd_up, macd_dn) * 0.20
        + _score_dir(wpr_up, wpr_dn) * 0.10
        + _score_dir(osma_up, osma_dn) * 0.10
    )

    reasons: List[str] = []
    if bull_tf > n // 2:
        reasons.append(f"EMA stack bullish on {bull_tf}/{n} timeframes")
    if bear_tf > n // 2:
        reasons.append(f"EMA stack bearish on {bear_tf}/{n} timeframes")
    if cci2_up > n // 2:
        reasons.append(f"CCI(2) overbought (>100) on {cci2_up}/{n} TFs — strong upward momentum")
    if cci2_dn > n // 2:
        reasons.append(f"CCI(2) oversold (<-100) on {cci2_dn}/{n} TFs — strong downward momentum")
    if macd_up > n // 2:
        reasons.append(f"MACD histogram positive on {macd_up}/{n} TFs")
    if macd_dn > n // 2:
        reasons.append(f"MACD histogram negative on {macd_dn}/{n} TFs")
    if wpr_up > n // 2:
        reasons.append(f"WPR(14) bullish zone on {wpr_up}/{n} TFs")
    if wpr_dn > n // 2:
        reasons.append(f"WPR(14) bearish zone on {wpr_dn}/{n} TFs")
    if osma_up > n // 2:
        reasons.append(f"OsMA positive on {osma_up}/{n} TFs")
    if osma_dn > n // 2:
        reasons.append(f"OsMA negative on {osma_dn}/{n} TFs")

    # Nearest levels from the slowest TF (daily)
    daily = next((r for r in reversed(tf_results) if r.get("tf") == "1d"),
                 tf_results[-1])
    price = daily.get("close", 0.0)
    all_levels = _collect_all_levels(daily)
    nearest = _nearest_levels(price, all_levels)

    return {
        "symbol": symbol,
        "direction": direction,
        "strength": round(ema_score, 4),
        "confluence": round(min(confluence, 1.0), 4),
        "reasons": reasons,
        "nearest_levels": nearest,
        "tf_detail": tf_results,
    }

# ─── Multi-Timeframe Engine ────────────────────────────────────────────────────

class MTFEngine:
    """
    Async multi-timeframe confluence engine.
    Fetches all timeframes in parallel, computes indicators and S/R,
    then aggregates into a single confluence verdict.
    """

    def __init__(self) -> None:
        self._cache: Dict[str, Dict[str, pd.DataFrame]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def fetch_bars(self, symbol: str, tf: str,
                         n: int = BARS_DEFAULT) -> pd.DataFrame:
        """Fetch bars (live or simulated). Replace body with broker API call."""
        async with self._lock:
            cached = self._cache.get(symbol, {}).get(tf)
            if cached is not None:
                return cached

        df = await asyncio.get_event_loop().run_in_executor(
            None, _simulate_bars, symbol, tf, n
        )
        async with self._lock:
            self._cache.setdefault(symbol, {})[tf] = df
        return df

    def invalidate(self, symbol: Optional[str] = None) -> None:
        """Clear cache (call after live bar update)."""
        if symbol:
            self._cache.pop(symbol, None)
        else:
            self._cache.clear()

    async def analyze_tf(self, symbol: str, tf: str) -> Dict[str, Any]:
        """Full indicator + S/R analysis for one symbol/timeframe."""
        df = await self.fetch_bars(symbol, tf)
        c = df["c"].to_numpy(dtype=float)
        h = df["h"].to_numpy(dtype=float)
        lo = df["l"].to_numpy(dtype=float)

        ind: Dict[str, float] = {}

        # ── CCI (multiple periods, CCI-2 is primary) ──────────────────────────
        for p in CCI_PERIODS:
            ind[f"cci_{p}"] = round(float(cci(h, lo, c, p)[-1]), 4)

        # ── MACD variants ─────────────────────────────────────────────────────
        for f_, s_, sig in MACD_SETTINGS:
            ml, sl_, hist = macd(c, f_, s_, sig)
            base = f"macd_{f_}_{s_}_{sig}"
            ind[base] = round(float(ml[-1]), 6)
            ind[f"{base}_sig"] = round(float(sl_[-1]), 6)
            ind[f"{base}_hist"] = round(float(hist[-1]), 6)

        # ── Williams %R variants ───────────────────────────────────────────────
        for p in WPR_PERIODS:
            ind[f"wpr_{p}"] = round(float(wpr(h, lo, c, p)[-1]), 4)

        # ── OsMA variants ─────────────────────────────────────────────────────
        for f_, s_, sig in OSMA_SETTINGS:
            ind[f"osma_{f_}_{s_}_{sig}"] = round(float(osma(c, f_, s_, sig)[-1]), 6)

        # ── RSI (reference) ───────────────────────────────────────────────────
        ind["rsi_14"] = round(float(rsi(c, 14)[-1]), 2)

        # ── ATR (volatility context) ──────────────────────────────────────────
        ind["atr_14"] = round(float(atr(h, lo, c, 14)[-1]), 6)

        # ── Dynamic S/R (EMA-based) ───────────────────────────────────────────
        dyn = dynamic_sr_ema(c)

        # ── Static Pivots (all three methods) ─────────────────────────────────
        pivots: Dict[str, Dict] = {}
        for method in PIVOT_METHODS:
            pivots[method] = pivot_levels(
                float(h[-2]), float(lo[-2]), float(c[-2]), method
            )

        # ── Long-term S/R ─────────────────────────────────────────────────────
        lt_sr = longterm_sr(c, h, lo)

        # ── Fibonacci from last 3 fractals ────────────────────────────────────
        up_idx, dn_idx = detect_fractals(h, lo)
        fib_data = fibonacci_from_fractals(h, lo, up_idx, dn_idx, n_fractals=3)

        return {
            "symbol": symbol,
            "tf": tf,
            "close": round(float(c[-1]), 6),
            "high": round(float(h[-1]), 6),
            "low": round(float(lo[-1]), 6),
            "indicators": ind,
            "dynamic_sr": dyn,
            "pivots": pivots,
            "longterm_sr": lt_sr,
            "fibonacci": fib_data,
            "fractal_up": [int(i) for i in up_idx[-5:]],
            "fractal_dn": [int(i) for i in dn_idx[-5:]],
            "trend": _trend_bias(c, dyn),
        }

    async def confluence(self, symbol: str) -> Dict[str, Any]:
        """Pull all timeframes in parallel and compute confluence score."""
        tasks = [self.analyze_tf(symbol, tf) for tf in TIMEFRAMES]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return _score_confluence(symbol, list(results))

# ─── Data Simulator (replace with live broker feed) ───────────────────────────

def _simulate_bars(symbol: str, tf: str, n: int = BARS_DEFAULT) -> pd.DataFrame:
    """
    Synthetic OHLCV generator seeded by (symbol, tf).
    Replace this function with an actual broker/exchange API call.
    """
    seed = abs(hash(f"{symbol}{tf}")) % (2 ** 31)
    rng = np.random.default_rng(seed)
    base = {"EURUSD": 1.082, "GBPUSD": 1.272, "USDJPY": 150.5,
            "XAUUSD": 2395.0, "BTCUSDT": 64800.0}.get(symbol, 100.0)
    vol = {"EURUSD": 0.0006, "GBPUSD": 0.0008, "USDJPY": 0.06,
           "XAUUSD": 2.5, "BTCUSDT": 420.0}.get(symbol, 0.001)
    # Geometric random walk with mild trend
    drift = rng.choice([-1, 0, 1]) * vol * 0.1
    returns = rng.normal(drift, vol, n)
    closes = base * np.cumprod(1.0 + returns / base)
    spread = np.abs(rng.normal(0, vol * 0.5, n))
    highs = closes + spread
    lows = closes - spread
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    volumes = rng.integers(500, 15_000, n).astype(float)
    return pd.DataFrame({"o": opens, "h": highs, "l": lows,
                          "c": closes, "v": volumes})

# ─── Symbol Graph / RAPTOR ────────────────────────────────────────────────────

class SymbolGraph:
    """
    Correlation-based symbol relationship graph with RAPTOR-style hierarchy.
    L0: raw price returns per node.
    L1: community cluster summaries.
    L2: global market summary and top correlated pairs.
    """

    def __init__(self) -> None:
        self.G: nx.Graph = nx.Graph()
        self._returns: Dict[str, deque] = defaultdict(lambda: deque(maxlen=300))

    def push(self, symbol: str, close: float) -> None:
        self._returns[symbol].append(close)

    def rebuild(self) -> None:
        """Rebuild edges from pairwise Pearson correlations of log-returns."""
        self.G.clear()
        symbols = [s for s, h in self._returns.items() if len(h) >= 50]
        ret_map: Dict[str, np.ndarray] = {}
        for s in symbols:
            arr = np.array(self._returns[s], dtype=float)
            ret_map[s] = np.diff(np.log(arr + 1e-9))
            self.G.add_node(s)

        for i, sa in enumerate(symbols):
            for sb in symbols[i + 1:]:
                ra, rb = ret_map[sa], ret_map[sb]
                n = min(len(ra), len(rb))
                if n < 20:
                    continue
                corr = float(np.corrcoef(ra[-n:], rb[-n:])[0, 1])
                if not math.isnan(corr) and abs(corr) >= 0.25:
                    self.G.add_edge(sa, sb, weight=round(corr, 4))

    def raptor_summary(self) -> Dict[str, Any]:
        """
        RAPTOR hierarchical summary:
        Greedy modularity communities → cluster summaries → global view.
        """
        if self.G.number_of_nodes() == 0:
            return {"summary": "No symbol data yet — push prices and call rebuild."}

        communities = list(
            nx.algorithms.community.greedy_modularity_communities(self.G)
        )

        # L1: per-cluster summary
        l1: Dict[str, Any] = {}
        for idx, comm in enumerate(communities):
            comm_list = sorted(comm)
            sub = self.G.subgraph(comm_list)
            edge_weights = [abs(d["weight"]) for _, _, d in sub.edges(data=True)]
            avg_corr = float(np.mean(edge_weights)) if edge_weights else 0.0
            leader = max(comm_list, key=lambda s: self.G.degree(s), default=None)
            l1[f"cluster_{idx}"] = {
                "symbols": comm_list,
                "size": len(comm_list),
                "avg_intra_correlation": round(avg_corr, 4),
                "leader_symbol": leader,
            }

        # L2: global summary
        top_pairs = sorted(
            self.G.edges(data=True),
            key=lambda e: abs(e[2]["weight"]),
            reverse=True,
        )[:GRAPH_TOP_K]

        return {
            "n_symbols": self.G.number_of_nodes(),
            "n_edges": self.G.number_of_edges(),
            "n_clusters": len(communities),
            "top_correlated_pairs": [
                {"pair": f"{e[0]}-{e[1]}", "correlation": e[2]["weight"]}
                for e in top_pairs
            ],
            "l1_clusters": l1,
        }

    def related(self, symbol: str, k: int = 5) -> List[Dict[str, Any]]:
        """Top k correlated neighbours sorted by |correlation|."""
        if symbol not in self.G:
            return []
        nbrs = sorted(
            self.G[symbol].items(),
            key=lambda x: abs(x[1]["weight"]),
            reverse=True,
        )
        return [{"symbol": nb, "correlation": d["weight"]} for nb, d in nbrs[:k]]

# ─── Hebbian Learning Table ────────────────────────────────────────────────────

class HebbianTable:
    """
    Associative memory table mapping discretised signal states to action weights.
    Δw = lr × pre_activation × post_outcome   (classical Hebbian rule)
    pre  = normalised confluence score
    post = trade outcome sign (±1)

    Useful for reinforcing patterns that historically preceded profitable trades.
    """

    def __init__(self, lr: float = HEBBIAN_LR, decay: float = HEBBIAN_DECAY) -> None:
        self.weights: Dict[str, float] = defaultdict(float)
        self.counts: Dict[str, int] = defaultdict(int)
        self.lr = lr
        self.decay = decay

    def _encode(self, signal: Dict[str, Any]) -> str:
        """Discretise continuous indicator values into a symbolic key."""
        c2 = signal.get("cci_2", 0)
        w14 = signal.get("wpr_14", -50)
        mh = signal.get("macd_12_26_9_hist", 0)
        trend = signal.get("trend", 0)
        cci_s = "ob" if c2 > 100 else ("os" if c2 < -100 else "n")
        wpr_s = "ob" if w14 > -20 else ("os" if w14 < -80 else "n")
        macd_s = "+" if mh > 0 else "-"
        return f"cci:{cci_s}|wpr:{wpr_s}|macd:{macd_s}|trend:{trend}"

    def update(self, signal: Dict[str, Any], outcome: float) -> None:
        """Hebbian weight update: strengthen pattern if outcome was positive."""
        key = self._encode(signal)
        pre = min(abs(signal.get("confluence", 0.5)), 1.0)
        post = float(np.sign(outcome)) if outcome != 0 else 0.0
        self.weights[key] = (
            self.decay * self.weights[key] + self.lr * pre * post
        )
        self.counts[key] += 1

    def predict(self, signal: Dict[str, Any]) -> float:
        """Return learned weight for current signal state."""
        return round(self.weights.get(self._encode(signal), 0.0), 6)

    def top_patterns(self, n: int = 20) -> List[Dict[str, Any]]:
        """Top n patterns by |weight|, useful for insight into learned rules."""
        ranked = sorted(self.weights.items(),
                        key=lambda x: abs(x[1]), reverse=True)[:n]
        return [
            {"pattern": k, "weight": round(v, 6), "count": self.counts[k]}
            for k, v in ranked
        ]

    def as_table(self) -> List[Dict[str, Any]]:
        """Full pattern table for UI/inspection."""
        return [
            {"pattern": k, "weight": round(v, 6), "count": self.counts[k]}
            for k, v in sorted(self.weights.items(), key=lambda x: x[0])
        ]

# ─── Application State ─────────────────────────────────────────────────────────

engine = MTFEngine()
sym_graph = SymbolGraph()
hebbian = HebbianTable()

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Odyssey Trading Server",
    version="1.0.0",
    description=(
        "Multi-timeframe confluence trading server with dynamic/static S/R, "
        "Fibonacci fractals, CCI(2)/MACD/WPR/OsMA, Graph/RAPTOR, "
        "Hebbian learning, and DSPy autonomous agent."
    ),
)

# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "symbols": SYMBOLS,
        "timeframes": TIMEFRAMES,
        "agents_available": _AGENTS_AVAILABLE,
        "ts": time.time(),
    }

# ── Single symbol analysis ─────────────────────────────────────────────────────

@app.get("/analyze/{symbol}", tags=["Analysis"])
async def analyze_symbol(symbol: str) -> Dict[str, Any]:
    """Full multi-timeframe confluence analysis for one symbol."""
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise HTTPException(404, f"Unknown symbol '{symbol}'. Available: {SYMBOLS}")
    result = await engine.confluence(symbol)
    # Feed latest close into graph
    for tf_r in result["tf_detail"]:
        sym_graph.push(symbol, tf_r["close"])
    return result

@app.get("/analyze/{symbol}/{timeframe}", tags=["Analysis"])
async def analyze_single_tf(symbol: str, timeframe: str) -> Dict[str, Any]:
    """Single-timeframe indicator + S/R snapshot."""
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise HTTPException(404, f"Unknown symbol '{symbol}'")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(404, f"Unknown timeframe '{timeframe}'. Available: {TIMEFRAMES}")
    return await engine.analyze_tf(symbol, timeframe)

# ── Batch analysis ─────────────────────────────────────────────────────────────

@app.post("/analyze/batch", tags=["Analysis"])
async def analyze_batch(body: BatchRequest) -> Dict[str, Any]:
    """Async parallel confluence analysis for multiple (or all) symbols."""
    syms = [s.upper() for s in (body.symbols or SYMBOLS)]
    valid = [s for s in syms if s in SYMBOLS]
    if not valid:
        raise HTTPException(400, "No valid symbols supplied.")
    tasks = [engine.confluence(s) for s in valid]
    results = await asyncio.gather(*tasks)
    for result in results:
        for tf_r in result["tf_detail"]:
            sym_graph.push(result["symbol"], tf_r["close"])
    return {"count": len(results), "results": list(results)}

# ── Trading signals (all symbols, Hebbian-adjusted) ────────────────────────────

@app.get("/signals", tags=["Signals"])
async def all_signals() -> Dict[str, Any]:
    """
    Generate confluence-ranked trading signals for all symbols.
    Confluence score is adjusted by the Hebbian learned weight for the pattern.
    """
    tasks = [engine.confluence(s) for s in SYMBOLS]
    raw = await asyncio.gather(*tasks)
    signals: List[Dict[str, Any]] = []
    for r in raw:
        daily_ind = r["tf_detail"][-1]["indicators"]  # 1d indicators
        heb_signal = {
            "cci_2": daily_ind.get("cci_2", 0),
            "wpr_14": daily_ind.get("wpr_14", -50),
            "macd_12_26_9_hist": daily_ind.get("macd_12_26_9_hist", 0),
            "trend": r.get("direction", 0),
            "confluence": r.get("confluence", 0.0),
        }
        heb_w = hebbian.predict(heb_signal)
        adj = round(min(r["confluence"] * (1.0 + 0.25 * heb_w), 1.0), 4)
        action = (
            "buy" if r["direction"] == 1 and adj >= CONFLUENCE_THRESHOLD
            else "sell" if r["direction"] == -1 and adj >= CONFLUENCE_THRESHOLD
            else "hold"
        )
        signals.append({
            "symbol": r["symbol"],
            "action": action,
            "direction": r["direction"],
            "confluence": adj,
            "hebbian_weight": heb_w,
            "reasons": r["reasons"],
            "nearest_levels": r["nearest_levels"],
        })
    signals.sort(key=lambda x: x["confluence"], reverse=True)
    return {"count": len(signals), "signals": signals}

# ── DSPy autonomous decision ───────────────────────────────────────────────────

@app.get("/decide/{symbol}", tags=["Agent"])
async def autonomous_decide(symbol: str) -> Dict[str, Any]:
    """
    Route to DSPy ReAct trading agent for autonomous decision.
    Falls back to rule-based decision if DSPy agents module unavailable.
    """
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise HTTPException(404, f"Unknown symbol '{symbol}'")
    confluence_data = await engine.confluence(symbol)

    if _AGENTS_AVAILABLE:
        try:
            decision = await asyncio.get_event_loop().run_in_executor(
                None, trading_agents.decide, confluence_data
            )
            return decision
        except Exception as exc:
            pass  # fall through to rule-based

    # Rule-based fallback
    c = confluence_data["confluence"]
    d = confluence_data["direction"]
    heb_signal = {
        "cci_2": confluence_data["tf_detail"][-1]["indicators"].get("cci_2", 0),
        "wpr_14": confluence_data["tf_detail"][-1]["indicators"].get("wpr_14", -50),
        "macd_12_26_9_hist": confluence_data["tf_detail"][-1]["indicators"]
                             .get("macd_12_26_9_hist", 0),
        "trend": d,
        "confluence": c,
    }
    hw = hebbian.predict(heb_signal)
    adj_conf = min(c * (1 + 0.25 * hw), 1.0)
    action = (
        "buy" if d == 1 and adj_conf >= CONFLUENCE_THRESHOLD
        else "sell" if d == -1 and adj_conf >= CONFLUENCE_THRESHOLD
        else "hold"
    )
    price = confluence_data["tf_detail"][-1]["close"]
    atr_val = confluence_data["tf_detail"][-1]["indicators"].get("atr_14", price * 0.001)
    tp = round(price + d * 3 * atr_val, 6) if action != "hold" else None
    sl = round(price - d * 1.5 * atr_val, 6) if action != "hold" else None
    return TradeDecision(
        symbol=symbol, action=action, size=1.0,
        tp=tp, sl=sl, confidence=round(adj_conf, 4),
        reasoning="; ".join(confluence_data["reasons"]) or "Insufficient confluence",
    ).model_dump()

# ── Graph / RAPTOR routes ──────────────────────────────────────────────────────

@app.post("/graph/rebuild", tags=["Graph"])
async def graph_rebuild(bg: BackgroundTasks) -> Dict[str, Any]:
    """
    Rebuild symbol correlation graph.
    Fetches 1h bars for all symbols and pushes 200 closes into the graph,
    then recomputes edges and returns RAPTOR summary.
    """
    async def _do_rebuild() -> None:
        for sym in SYMBOLS:
            df = await engine.fetch_bars(sym, "1h", 300)
            for close in df["c"].to_numpy()[-200:]:
                sym_graph.push(sym, float(close))
        sym_graph.rebuild()

    await _do_rebuild()
    return sym_graph.raptor_summary()

@app.get("/graph/summary", tags=["Graph"])
async def graph_summary() -> Dict[str, Any]:
    return sym_graph.raptor_summary()

@app.get("/graph/related/{symbol}", tags=["Graph"])
async def graph_related(symbol: str, k: int = 5) -> Dict[str, Any]:
    symbol = symbol.upper()
    return {"symbol": symbol, "related": sym_graph.related(symbol, k)}

# ── Hebbian routes ─────────────────────────────────────────────────────────────

@app.get("/hebbian/patterns", tags=["Hebbian"])
async def hebbian_patterns(n: int = 20) -> Dict[str, Any]:
    """Top n Hebbian patterns by learned |weight|."""
    return {"patterns": hebbian.top_patterns(n)}

@app.get("/hebbian/table", tags=["Hebbian"])
async def hebbian_table() -> Dict[str, Any]:
    """Full Hebbian pattern table."""
    return {"table": hebbian.as_table()}

@app.post("/hebbian/update", tags=["Hebbian"])
async def hebbian_update_route(body: HebbianUpdateRequest) -> Dict[str, Any]:
    """Provide trade outcome feedback to update Hebbian weights."""
    hebbian.update(body.signal, body.outcome)
    return {
        "encoded_key": hebbian._encode(body.signal),
        "new_weight": hebbian.predict(body.signal),
    }

# ── Cache management ───────────────────────────────────────────────────────────

@app.delete("/cache/{symbol}", tags=["System"])
async def invalidate_cache(symbol: str) -> Dict[str, str]:
    engine.invalidate(symbol.upper())
    return {"status": "invalidated", "symbol": symbol.upper()}

@app.delete("/cache", tags=["System"])
async def invalidate_all_cache() -> Dict[str, str]:
    engine.invalidate()
    return {"status": "all cache cleared"}

# ─── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
