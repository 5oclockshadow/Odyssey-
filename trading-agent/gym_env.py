"""
Odyssey Gymnasium Trading Environment.

Custom Gymnasium environment that wraps OHLCV price data + all computed
indicators into an RL/agent-compatible interface.  The DSPy ReAct agent
can call this environment autonomously to build its own backtest, or
the GA/GE in evolution.py can use it as a fitness evaluator.

Observation space: flattened indicator vector (normalised)
Action space:      Discrete(3) — 0=hold, 1=buy, 2=sell
Reward:            Δ equity / initial_equity  (risk-adjusted PnL step)

Usage:
    env = TradingEnv(prices_df)          # pandas DataFrame with o/h/l/c/v
    obs, info = env.reset()
    while not done:
        action = agent.act(obs)
        obs, reward, terminated, truncated, info = env.step(action)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import gymnasium as gym
    from gymnasium import spaces
    _GYM = True
except ImportError:
    try:
        import gym                         # type: ignore[no-redef]
        from gym import spaces             # type: ignore[assignment]
        _GYM = True
    except ImportError:
        _GYM = False

# ─── Indicator helpers (duplicated for self-contained env) ────────────────────

def _ema(s: np.ndarray, p: int) -> np.ndarray:
    k = 2.0 / (p + 1.0)
    out = np.empty(len(s))
    out[0] = s[0]
    for i in range(1, len(s)):
        out[i] = s[i] * k + out[i - 1] * (1.0 - k)
    return out

def _cci2(h: np.ndarray, l: np.ndarray, c: np.ndarray) -> np.ndarray:
    tp = (h + l + c) / 3.0
    ma = pd.Series(tp).rolling(2, min_periods=1).mean().to_numpy()
    mad = pd.Series(tp).rolling(2, min_periods=1) \
              .apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True).to_numpy()
    mad = np.where(mad < 1e-12, 1e-12, mad)
    return (tp - ma) / (0.015 * mad)

def _macd_hist(c: np.ndarray, f: int = 12, s: int = 26, sig: int = 9) -> np.ndarray:
    return _ema(c, f) - _ema(c, s) - _ema(_ema(c, f) - _ema(c, s), sig)

def _wpr14(h: np.ndarray, l: np.ndarray, c: np.ndarray) -> np.ndarray:
    out = np.full(len(c), -50.0)
    for i in range(13, len(c)):
        hh, ll = h[i - 13:i + 1].max(), l[i - 13:i + 1].min()
        out[i] = -100.0 * (hh - c[i]) / (hh - ll) if hh != ll else -50.0
    return out

def _atr14(h: np.ndarray, l: np.ndarray, c: np.ndarray) -> np.ndarray:
    tr = np.maximum(h[1:] - l[1:],
         np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))
    tr = np.insert(tr, 0, tr[0])
    return pd.Series(tr).rolling(14, min_periods=1).mean().to_numpy()

def _rsi14(c: np.ndarray) -> np.ndarray:
    delta = np.diff(c, prepend=c[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    ag = pd.Series(gain).ewm(com=13, min_periods=14).mean().to_numpy()
    al = pd.Series(loss).ewm(com=13, min_periods=14).mean().to_numpy()
    rs = np.where(al < 1e-12, 100.0, ag / al)
    return 100.0 - 100.0 / (1.0 + rs)

def _build_features(df: pd.DataFrame) -> np.ndarray:
    """
    Build normalised feature matrix from OHLCV dataframe.
    Rows = bars, Columns = [cci2, macd_hist, wpr14, osma, ema8_rel,
                             ema21_rel, ema55_rel, rsi14, atr_pct,
                             log_return]
    Values are clipped and normalised to roughly [-1, 1].
    """
    c = df["c"].to_numpy(float)
    h = df["h"].to_numpy(float)
    lo = df["l"].to_numpy(float)

    cci2_ = np.clip(_cci2(h, lo, c) / 200.0, -3, 3)
    mh    = np.clip(_macd_hist(c) / (np.std(c) + 1e-9), -3, 3)
    wpr_  = (_wpr14(h, lo, c) + 50.0) / 50.0          # [−1, 1]
    osma_ = np.clip(_macd_hist(c, 5, 35, 5) / (np.std(c) + 1e-9), -3, 3)
    e8    = (_ema(c, 8) - c) / (c + 1e-9)
    e21   = (_ema(c, 21) - c) / (c + 1e-9)
    e55   = (_ema(c, 55) - c) / (c + 1e-9)
    rsi_  = (_rsi14(c) - 50.0) / 50.0                 # [−1, 1]
    atr_  = _atr14(h, lo, c) / (c + 1e-9)
    lr    = np.diff(np.log(c + 1e-9), prepend=0.0)

    feats = np.column_stack([cci2_, mh, wpr_, osma_, e8, e21, e55, rsi_, atr_, lr])
    return feats.astype(np.float32)

# ─── Gymnasium Environment ────────────────────────────────────────────────────

N_FEATURES = 10   # must match _build_features output columns
N_ACTIONS = 3     # 0=hold, 1=buy, 2=sell


class TradingEnv:
    """
    Gymnasium-compatible trading environment.
    Compatible with both `gymnasium` and legacy `gym` packages.
    Falls back to a pure-Python interface if neither is installed.
    """

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        df: pd.DataFrame,
        window: int = 20,
        max_position: float = 1.0,
        transaction_cost: float = 0.0002,
        atr_sl_mult: float = 1.5,
        atr_tp_mult: float = 3.0,
        initial_balance: float = 10_000.0,
    ) -> None:
        """
        Args:
            df:               OHLCV DataFrame with columns o/h/l/c/v.
            window:           Look-back window fed as observation.
            max_position:     Max fraction of balance per trade.
            transaction_cost: Round-trip cost fraction (e.g. 0.0002 = 2 pip).
            atr_sl_mult:      Stop-loss = ATR × mult.
            atr_tp_mult:      Take-profit = ATR × mult.
            initial_balance:  Starting equity.
        """
        assert len(df) > window + 50, "DataFrame too short"
        self.df = df.reset_index(drop=True)
        self.features = _build_features(df)
        self.window = window
        self.max_pos = max_position
        self.tc = transaction_cost
        self.sl_mult = atr_sl_mult
        self.tp_mult = atr_tp_mult
        self.initial_balance = initial_balance

        if _GYM:
            obs_shape = (window, N_FEATURES)
            self.observation_space = spaces.Box(
                low=-4.0, high=4.0, shape=obs_shape, dtype=np.float32
            )
            self.action_space = spaces.Discrete(N_ACTIONS)

        # Runtime state
        self._step = 0
        self._balance = initial_balance
        self._position = 0      # 1=long, -1=short, 0=flat
        self._entry_price = 0.0
        self._entry_step = 0
        self._equity_curve: List[float] = []

    # ── Gym API ───────────────────────────────────────────────────────────────

    def reset(self, *, seed: Optional[int] = None,
              options: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        if seed is not None:
            np.random.seed(seed)
        self._step = self.window
        self._balance = self.initial_balance
        self._position = 0
        self._entry_price = 0.0
        self._equity_curve = [self.initial_balance]
        return self._obs(), {}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """
        Execute one step.
        Returns: (obs, reward, terminated, truncated, info)
        """
        assert 0 <= action < N_ACTIONS, f"Invalid action {action}"
        c = float(self.df["c"].iloc[self._step])
        atr_v = float(
            _atr14(
                self.df["h"].to_numpy(float),
                self.df["l"].to_numpy(float),
                self.df["c"].to_numpy(float),
            )[self._step]
        )
        reward = 0.0
        info: Dict[str, Any] = {}

        # ── Exit existing position if TP/SL hit ───────────────────────────────
        if self._position != 0:
            sl = self._entry_price - self._position * self.sl_mult * atr_v
            tp = self._entry_price + self._position * self.tp_mult * atr_v
            if (self._position == 1 and (c <= sl or c >= tp)) or \
               (self._position == -1 and (c >= sl or c <= tp)):
                pnl = self._position * (c - self._entry_price) / self._entry_price
                pnl -= self.tc
                self._balance *= (1.0 + pnl * self.max_pos)
                reward += pnl
                info["closed_trade"] = {"pnl": round(pnl, 6)}
                self._position = 0

        # ── Enter new position ────────────────────────────────────────────────
        if self._position == 0:
            if action == 1:   # buy
                self._position = 1
                self._entry_price = c
                self._entry_step = self._step
                self._balance -= self.tc * self.max_pos * self._balance
            elif action == 2:  # sell
                self._position = -1
                self._entry_price = c
                self._entry_step = self._step
                self._balance -= self.tc * self.max_pos * self._balance

        self._equity_curve.append(self._balance)
        self._step += 1
        terminated = self._step >= len(self.df) - 1
        truncated = self._balance <= self.initial_balance * 0.2  # blown up

        info.update({
            "balance": round(self._balance, 4),
            "position": self._position,
            "step": self._step,
        })
        return self._obs(), float(reward), terminated, truncated, info

    def _obs(self) -> np.ndarray:
        """Return window of normalised features ending at current step."""
        start = max(0, self._step - self.window)
        window_feats = self.features[start: self._step]
        if len(window_feats) < self.window:
            pad = np.zeros((self.window - len(window_feats), N_FEATURES),
                           dtype=np.float32)
            window_feats = np.vstack([pad, window_feats])
        return window_feats.astype(np.float32)

    def render(self) -> None:
        print(
            f"Step {self._step:4d} | balance={self._balance:,.2f} | "
            f"pos={'LONG' if self._position == 1 else 'SHORT' if self._position == -1 else 'FLAT'}"
        )

    # ── Backtest summary ──────────────────────────────────────────────────────

    def summary(self) -> Dict[str, float]:
        """Return performance metrics after an episode."""
        if len(self._equity_curve) < 2:
            return {}
        equity = np.array(self._equity_curve)
        rets = np.diff(equity) / equity[:-1]
        total_return = (equity[-1] - equity[0]) / equity[0]
        std = float(np.std(rets)) if len(rets) > 1 else 1e-9
        sharpe = float(np.mean(rets)) / std * math.sqrt(252) if std > 0 else 0.0
        # Max drawdown
        peak = np.maximum.accumulate(equity)
        dd = (peak - equity) / (peak + 1e-9)
        return {
            "total_return_pct": round(total_return * 100, 4),
            "sharpe": round(sharpe, 4),
            "max_drawdown_pct": round(float(dd.max()) * 100, 4),
            "final_balance": round(float(equity[-1]), 4),
            "n_steps": self._step,
        }

# ─── DSPy ReAct Backtest Runner ───────────────────────────────────────────────

class DSPyBacktestRunner:
    """
    Wraps TradingEnv and the DSPy trading agent to autonomously run a
    complete backtest episode.  The agent sees the observation vector and
    requests the action from its ReAct chain.
    """

    def __init__(self, env: TradingEnv) -> None:
        self.env = env

    def run_episode(self, agent_fn: Any = None,
                    render: bool = False) -> Dict[str, Any]:
        """
        Run one full episode.

        agent_fn: callable(obs: np.ndarray) -> int  (action index)
                  If None, uses a random policy.
        Returns:  summary dict + equity curve.
        """
        obs, _ = self.env.reset()
        done = False
        total_reward = 0.0
        steps = 0

        while not done:
            if agent_fn is not None:
                action = agent_fn(obs)
            else:
                # Random baseline policy
                action = int(np.random.choice([0, 1, 2], p=[0.6, 0.2, 0.2]))

            obs, reward, terminated, truncated, info = self.env.step(action)
            total_reward += reward
            steps += 1
            done = terminated or truncated
            if render:
                self.env.render()

        summary = self.env.summary()
        summary["total_episode_reward"] = round(total_reward, 6)
        summary["episode_steps"] = steps
        return {
            "summary": summary,
            "equity_curve": [round(v, 4) for v in self.env._equity_curve],
        }

    def run_ga_optimised(self, generations: int = 30,
                         pop_size: int = 30) -> Dict[str, Any]:
        """
        Run GA optimisation then backtest best chromosome.
        Returns GA result + backtest summary.
        """
        from evolution import run_ga, Chromosome  # local import

        prices = self.env.df["c"].to_numpy(float)
        best_chrom, history = run_ga(prices, pop_size=pop_size,
                                     generations=generations, verbose=False)

        # Build agent from best chromosome parameters
        thresh = best_chrom.genes["confluence_threshold"]
        cci_ob = best_chrom.genes["cci2_ob_threshold"]
        cci_os = best_chrom.genes["cci2_os_threshold"]

        def chrom_agent(obs: np.ndarray) -> int:
            # obs shape: (window, N_FEATURES)
            cci2_val = float(obs[-1, 0]) * 200.0  # un-normalise
            if cci2_val > cci_ob:
                return 1  # buy
            if cci2_val < cci_os:
                return 2  # sell
            return 0       # hold

        result = self.run_episode(agent_fn=chrom_agent)
        result["ga_best_genes"] = best_chrom.genes
        result["ga_fitness_history"] = history
        return result

# ─── Convenience factory ──────────────────────────────────────────────────────

def make_env(symbol: str = "EURUSD", n_bars: int = 600,
             **kwargs: Any) -> TradingEnv:
    """
    Create a TradingEnv from simulated bars.
    Swap _simulate_bars for a live data feed in production.
    """
    import importlib
    try:
        server_mod = importlib.import_module("server")
        df = server_mod._simulate_bars(symbol, "1h", n_bars)
    except Exception:
        # Fallback: pure random walk
        rng = np.random.default_rng(abs(hash(symbol)) % (2 ** 31))
        closes = np.cumprod(1 + rng.normal(0, 0.001, n_bars)) * 1.08
        spread = np.abs(rng.normal(0, 0.0005, n_bars))
        df = pd.DataFrame({
            "o": np.roll(closes, 1), "h": closes + spread,
            "l": closes - spread, "c": closes,
            "v": rng.integers(500, 10_000, n_bars).astype(float),
        })
    return TradingEnv(df, **kwargs)

# ─── CLI demo ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== Odyssey Gym Environment Demo ===")
    env = make_env("EURUSD", n_bars=400)
    runner = DSPyBacktestRunner(env)
    result = runner.run_episode(render=False)
    print("Random policy backtest:")
    for k, v in result["summary"].items():
        print(f"  {k}: {v}")

    print("\nRunning GA-optimised backtest (30 gen, pop=20)…")
    env2 = make_env("EURUSD", n_bars=400)
    runner2 = DSPyBacktestRunner(env2)
    ga_result = runner2.run_ga_optimised(generations=30, pop_size=20)
    print("GA-optimised backtest:")
    for k, v in ga_result["summary"].items():
        print(f"  {k}: {v}")
    print(f"Best Sharpe from GA: {ga_result['ga_fitness_history'][-1]:.4f}")
