# Odyssey Trading Agent

**Multi-timeframe confluence trading system** — DSPy autonomous agent, Graph/RAPTOR, Hebbian learning, Genetic Algorithm, and a Gymnasium backtest environment.

---

## Architecture

```
trading-agent/
├── server.py        ← FastAPI server (<1250 LOC) — ALL core trading logic
├── agents.py        ← DSPy ReAct agent + RAPTOR hierarchical reasoning
├── evolution.py     ← Lean GA + Grammatical Evolution for strategy search
├── gym_env.py       ← Gymnasium trading environment + DSPy backtest runner
├── requirements.txt ← Dependencies
├── README.md        ← This file
└── PRD.md           ← Product Requirements Document
```

---

## Features

### Core Server (`server.py`)

| Component | Detail |
|---|---|
| **Indicators** | CCI(2) primary signal, CCI(14/20/50), MACD (12-26-9, 5-35-5, 3-10-16), WPR (14/21/34), OsMA (matching MACD settings), RSI(14), ATR(14) |
| **Dynamic S/R** | EMA cluster zones: EMA 8/21/55/100/200 — EMAs within 0.1% form a confluence zone |
| **Static S/R** | Standard, Camarilla, and Fibonacci pivot levels + long-term S/R (3+ touches in 250 bars) |
| **Fibonacci** | Last 3 fractals individually (0%, 23.6%, 38.2%, 50%) **and** combined range |
| **Fractal Detection** | Williams fractals (2-bar lookback each side) |
| **MTF Engine** | Async parallel fetch of 7 timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d |
| **Confluence Score** | Weighted combination: EMA stack (35%) + CCI(2) (25%) + MACD hist (20%) + WPR (10%) + OsMA (10%) |
| **Graph / RAPTOR** | NetworkX correlation graph; greedy modularity communities; L1 cluster + L2 global RAPTOR summaries |
| **Hebbian Learning** | Associative table: Δw = lr × pre × post; discretised signal states; pattern inspection endpoint |
| **DSPy Integration** | Calls `agents.py` for LLM-powered decisions; falls back to rule-based when no LLM configured |

### DSPy Agents (`agents.py`)

- **`TradingReActAgent`** — ChainOfThought over `MarketSummarySignature` → `TradeDecisionSignature`
- **`RAPTORReasoner`** — L1 cluster + L2 global narrative from symbol graph
- Graceful fallback (no LLM required for rule-based operation)

### Genetic / Grammatical Evolution (`evolution.py`)

- **GA**: Evolves 12-parameter chromosome (CCI thresholds, confluence threshold, EMA fraction, ATR SL/TP multipliers)
- Operators: BLX-α crossover, Gaussian mutation, tournament selection, elitism
- Fitness: Sharpe ratio on simulated backtest
- **GE**: Grammatical Evolution stub — integer codon → strategy expression string via production grammar

### Gymnasium Environment (`gym_env.py`)

- 10-feature observation: CCI(2), MACD hist, WPR(14), OsMA, EMA8/21/55 relative, RSI(14), ATR%, log-return
- Discrete(3) action space: hold / buy / sell
- ATR-based TP/SL management
- `DSPyBacktestRunner.run_ga_optimised()` — run GA then backtest best chromosome

---

## Quick Start

```bash
# 1. Install dependencies
cd trading-agent
pip install -r requirements.txt

# 2. Start the server (simulation mode — no API keys needed)
python server.py
# → http://localhost:8000/docs  (Swagger UI)

# 3. Run GA optimisation demo
python evolution.py

# 4. Run Gymnasium backtest demo
python gym_env.py
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server status + config |
| `GET` | `/analyze/{symbol}` | Full 7-TF confluence analysis |
| `GET` | `/analyze/{symbol}/{timeframe}` | Single-TF analysis |
| `POST` | `/analyze/batch` | Parallel analysis for multiple symbols |
| `GET` | `/signals` | Ranked signals for all symbols (Hebbian-adjusted) |
| `GET` | `/decide/{symbol}` | DSPy autonomous trade decision |
| `POST` | `/graph/rebuild` | Rebuild symbol correlation graph |
| `GET` | `/graph/summary` | RAPTOR hierarchical graph summary |
| `GET` | `/graph/related/{symbol}` | Top correlated symbols |
| `GET` | `/hebbian/patterns` | Top Hebbian-learned patterns |
| `GET` | `/hebbian/table` | Full pattern weight table |
| `POST` | `/hebbian/update` | Feed trade outcome → update weights |
| `DELETE` | `/cache/{symbol}` | Invalidate bar cache for symbol |
| `DELETE` | `/cache` | Clear all caches |

### Example: Get signals

```bash
curl http://localhost:8000/signals
```

```json
{
  "count": 5,
  "signals": [
    {
      "symbol": "XAUUSD",
      "action": "buy",
      "direction": 1,
      "confluence": 0.71,
      "hebbian_weight": 0.12,
      "reasons": ["EMA stack bullish on 5/7 timeframes", "CCI(2) overbought on 4/7 TFs"],
      "nearest_levels": [...]
    }
  ]
}
```

### Example: Autonomous decision

```bash
curl http://localhost:8000/decide/EURUSD
```

```json
{
  "symbol": "EURUSD",
  "action": "hold",
  "reasoning": "Confluence 0.42 below threshold 0.55 — insufficient multi-TF alignment",
  "confidence": 0.42,
  "stop_loss_pct": 0.08,
  "take_profit_pct": 0.16
}
```

---

## Enabling DSPy LLM Decisions

1. Install `dspy-ai` and an LLM backend:
   ```bash
   pip install dspy-ai openai
   ```
2. Configure in your environment:
   ```bash
   export OPENAI_API_KEY=sk-...
   ```
3. In `agents.py`, configure DSPy before calling `decide()`:
   ```python
   import dspy
   dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))
   ```

Without LLM configuration the system operates in **rule-based mode** — all API endpoints remain fully functional.

---

## Replacing Simulated Data

`server.py::_simulate_bars()` is the single function to replace with a live data feed:

```python
# Example: yfinance
import yfinance as yf

def _simulate_bars(symbol: str, tf: str, n: int = 500) -> pd.DataFrame:
    ticker_map = {"EURUSD": "EURUSD=X", "XAUUSD": "GC=F", "BTCUSDT": "BTC-USD"}
    interval_map = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "1h", "1d": "1d"}
    ticker = ticker_map.get(symbol, symbol)
    df = yf.download(ticker, period="60d", interval=interval_map.get(tf, "1h"), auto_adjust=True)
    df.columns = [c.lower() for c in df.columns]
    return df[["open", "high", "low", "close", "volume"]].rename(
        columns={"open": "o", "high": "h", "low": "l", "close": "c", "volume": "v"}
    ).dropna().tail(n)
```

---

## Testing

```bash
pytest tests/ -v
```

Basic smoke tests are in `tests/test_server.py`.
