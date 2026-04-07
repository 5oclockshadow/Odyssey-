# Product Requirements Document
## Odyssey Trading Agent — Multi-Timeframe Confluence System

**Version:** 1.0  
**Status:** Implementation Complete  
**Folder:** `trading-agent/`

---

## 1. Executive Summary

The Odyssey Trading Agent is an autonomous, prompt-driven trading system built on multi-timeframe confluence analysis. It integrates classical technical analysis (CCI, MACD, WPR, OsMA, Fibonacci, S/R), graph-based symbol reasoning (RAPTOR), associative learning (Hebbian), and a DSPy ReAct large-language-model agent into a single FastAPI server under 1,250 lines of code.

An optional Gymnasium environment and Genetic Algorithm/Grammatical Evolution layer enable autonomous strategy discovery and backtesting.

---

## 2. Goals and Non-Goals

### Goals
- Single-file FastAPI server (<1,250 LOC) containing all core trading logic
- Multi-timeframe confluence signal generation across 7 timeframes
- Dynamic S/R from EMA clusters; static S/R from pivot points and long-term price memory
- Fibonacci 0–50% of last 3 fractals (individually and combined)
- Technical indicators: CCI(2) as primary, MACD/WPR/OsMA with multiple parameter sets
- Graph-based symbol correlation with RAPTOR hierarchical reasoning
- Hebbian associative learning table for pattern reinforcement
- DSPy ReAct autonomous trade decision agent
- Lean GA + GE for strategy parameter search
- Gymnasium trading environment for backtest and RL

### Non-Goals
- Live order execution (broker API integration is a single-function swap)
- Portfolio optimisation beyond single-symbol position sizing
- Regulatory compliance / risk management framework

---

## 3. User Stories

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-01 | Trader | Get ranked trading signals for all symbols | I can prioritise my attention |
| US-02 | Trader | See why a signal was generated | I can trust and review the reasoning |
| US-03 | Quant | Analyse a single symbol across all 7 timeframes | I can understand full market structure |
| US-04 | Quant | View Fibonacci levels from the last 3 fractals | I can identify precise entry/exit zones |
| US-05 | Quant | See dynamic EMA S/R clusters | I understand current trend support/resistance |
| US-06 | Quant | See pivot levels (standard, Camarilla, Fibonacci) | I have reference levels for daily bias |
| US-07 | Developer | Rebuild symbol correlation graph | I can inspect cross-symbol relationships |
| US-08 | Developer | Inspect Hebbian learned patterns | I can understand what the system has learned |
| US-09 | ML Engineer | Provide trade outcomes to update Hebbian weights | The system learns from real trade results |
| US-10 | ML Engineer | Run GA optimisation on strategy parameters | I can discover optimal indicator thresholds |
| US-11 | ML Engineer | Run a full backtest in Gymnasium | I can evaluate strategy performance |
| US-12 | ML Engineer | Use DSPy agent for LLM-augmented decisions | I get natural-language reasoning with decisions |

---

## 4. Functional Requirements

### 4.1 Technical Indicators

| Indicator | Periods / Settings | Requirement |
|---|---|---|
| CCI | **2** (primary), 14, 20, 50 | CCI(2) drives confluence score; all periods computed per TF |
| MACD | (12,26,9), (5,35,5), (3,10,16) | Line, signal, and histogram for each setting |
| Williams %R | 14, 21, 34 | OB = >−20, OS = <−80 for confluence scoring |
| OsMA | (12,26,9), (5,35,5) | Histogram sign drives 10% of confluence score |
| EMA | 8, 21, 55, 100, 200 | Stack position used for trend bias; clusters form dynamic S/R |
| RSI | 14 | Reference indicator included in feature vector |
| ATR | 14 | Used for SL/TP sizing |

### 4.2 Support & Resistance

#### Dynamic (EMA-based)
- Compute EMA 8, 21, 55, 100, 200 on the close series
- EMAs within 0.1% of each other form a **zone** (stronger S/R)
- Report individual EMA values and cluster midpoints

#### Static — Pivot Points
- **Standard**: PP, R1–R3, S1–S3
- **Camarilla**: R1–R4, S1–S4 (1.1/n multipliers)
- **Fibonacci**: PP, R1–R3, S1–S3 (0.382, 0.618, 1.0 multipliers)
- Computed from the previous completed period's H/L/C

#### Static — Long-Term S/R
- Scan last 250 bars of highs and lows
- Bucket prices by 0.2% tolerance
- Levels with ≥3 touches are valid S/R

### 4.3 Fibonacci Analysis

- Detect Williams fractals (2-bar lookback)
- Identify last 3 swing highs and lows
- For **each** of the last 3 fractal pairs: compute 0%, 23.6%, 38.2%, 50% retracement
- For the **combined** range (all 3 fractals): compute 0%, 23.6%, 38.2%, 50%
- All levels surfaced via `/analyze/{symbol}` and `/analyze/{symbol}/{tf}`

### 4.4 Multi-Timeframe Confluence Engine

- Timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d
- All timeframes fetched **in parallel** via `asyncio.gather`
- Confluence score formula:
  ```
  score = 0.35 × EMA_alignment
        + 0.25 × CCI2_alignment
        + 0.20 × MACD_hist_alignment
        + 0.10 × WPR_alignment
        + 0.10 × OsMA_alignment
  ```
- Direction = majority vote across TF trend biases
- Threshold ≥ 0.55 required to generate a non-hold signal

### 4.5 Graph / RAPTOR

- Build NetworkX undirected graph; nodes = symbols, edges = Pearson correlation ≥ 0.25 on log-returns
- Rebuild on demand (`POST /graph/rebuild`)
- RAPTOR hierarchy:
  - **L0**: raw node return data
  - **L1**: greedy modularity communities → DSPy cluster summaries
  - **L2**: global market view from L1 summaries
- Top-K correlated pairs (K=10) surfaced in summary

### 4.6 Hebbian Learning Table

- Key = discretised signal state: `cci:{ob|os|n}|wpr:{ob|os|n}|macd:{+|-}|trend:{1|0|-1}`
- Update rule: `w_new = decay × w_old + lr × pre × post`
  - `pre` = normalised confluence score (0–1)
  - `post` = sign of trade outcome
  - `lr` = 0.01, `decay` = 0.999
- Prediction = lookup weight for current signal state
- Final signal confidence = `confluence × (1 + 0.25 × hebbian_weight)`
- Full table inspectable via `GET /hebbian/table`

### 4.7 DSPy Autonomous Agent

- Signatures: `MarketSummarySignature`, `TradeDecisionSignature`, `RAPTORClusterSignature`, `RAPTORGlobalSignature`
- Module: `ChainOfThought` for both summarisation and decision
- Outputs: `action` ∈ {buy, sell, hold}, `reasoning`, `confidence`, `stop_loss_pct`, `take_profit_pct`
- Graceful fallback to rule-based decisions when LLM not configured

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | `/signals` response < 2s for 5 symbols × 7 TFs = 35 analyses (async parallel) |
| **Code size** | `server.py` ≤ 1,250 lines of code |
| **Reliability** | No crash on missing DSPy/Gymnasium packages (graceful fallback) |
| **Portability** | Python 3.10+; all dependencies in `requirements.txt` |
| **Extensibility** | Single function `_simulate_bars()` to replace with live data feed |
| **Observability** | All indicator values returned in API responses; Hebbian table inspectable |

---

## 6. Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      FastAPI Server                       │
│  /signals ─────► MTFEngine.confluence() ──► all TFs      │
│  /decide  ─────► DSPy ReAct Agent ────────► TradeDecision│
│  /graph   ─────► SymbolGraph (RAPTOR) ────► L1/L2 summary│
│  /hebbian ─────► HebbianTable ─────────────► pattern table│
└──────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   MTFEngine              agents.py
   ├── cci(2,14,20,50)    ├── TradingReActAgent (DSPy CoT)
   ├── macd(3 settings)   ├── RAPTORReasoner
   ├── wpr(14,21,34)      └── Fallback rule engine
   ├── osma(2 settings)
   ├── dynamic_sr_ema()           ┌─────────────┐
   ├── pivot_levels(3 methods) ◄──┤ evolution.py│
   ├── longterm_sr()              │ GA + GE     │
   └── fibonacci_from_fractals()  └─────────────┘
                                         │
                                  gym_env.py
                                  ├── TradingEnv (Gymnasium)
                                  └── DSPyBacktestRunner
```

---

## 7. Data Flow

```
1. Client ──► POST /analyze/batch  {symbols: ["EURUSD", "XAUUSD"]}
2. Server ──► asyncio.gather([confluence(s) for s in symbols])
3. MTFEngine ──► asyncio.gather([analyze_tf(s, tf) for tf in TIMEFRAMES])
4. analyze_tf() ──► _simulate_bars() | broker_api()
                ──► compute all indicators
                ──► dynamic_sr_ema(), pivot_levels(), longterm_sr()
                ──► detect_fractals() + fibonacci_from_fractals()
                ──► return TF result dict
5. _score_confluence() ──► weighted vote → direction + score + reasons
6. HebbianTable.predict() ──► adjust final confluence
7. Response ──► ranked signals JSON
```

---

## 8. Strategy Logic Summary

### Entry Conditions (all must be met)
1. Confluence score ≥ 0.55 after Hebbian adjustment
2. Direction = majority vote (≥4/7 timeframes aligned)
3. Price near a Fibonacci or Pivot level (within 1% ATR)

### Exit Conditions
- Stop-loss: entry ± (1.5 × ATR14)
- Take-profit: entry ± (3.0 × ATR14)
- These multipliers are evolved by the GA

### Risk Management
- Default position size: 1.0 (override via DSPy agent)
- Maximum drawdown circuit-breaker: 80% balance loss in Gymnasium env

---

## 9. GA / GE Optimisation

### Genetic Algorithm
- **Chromosome**: 12 parameters (CCI thresholds, WPR thresholds, confluence threshold, EMA fraction, ATR SL/TP multipliers, Fibonacci/SR weights)
- **Fitness**: Sharpe ratio on in-sample price data
- **Operators**: BLX-α crossover (α=0.5), Gaussian mutation (σ=8% of range), tournament selection (k=3), elitism (n=4)
- **Default**: 40 population, 50 generations

### Grammatical Evolution
- **Grammar**: `<strategy> → <entry> AND <filter>`
- **Codons**: 8-bit integers mapped to grammar production rules
- **Purpose**: Discover novel strategy expressions beyond fixed parameter tuning

---

## 10. Roadmap

| Priority | Feature |
|---|---|
| P1 | Live broker API integration (OANDA, Interactive Brokers, Binance) |
| P1 | DSPy LLM configuration with persistent memory |
| P2 | WebSocket streaming for real-time signal push |
| P2 | Walk-forward GA optimisation with out-of-sample validation |
| P3 | Multi-symbol portfolio management and correlation-adjusted sizing |
| P3 | Stable Baselines3 PPO/SAC training in Gymnasium env |
| P4 | Web dashboard (Plotly/Streamlit) with live graph and signal visualisation |

---

## 11. Acceptance Criteria

- [ ] `python server.py` starts without errors; Swagger UI reachable at `:8000/docs`
- [ ] `GET /signals` returns ranked signals for all 5 symbols with confluence scores
- [ ] `GET /analyze/EURUSD` returns indicators for all 7 timeframes including CCI(2)
- [ ] `GET /analyze/EURUSD/1h` returns fibonacci levels for last 3 fractals (f1, f2, f3, combined)
- [ ] `POST /graph/rebuild` returns RAPTOR summary with cluster data
- [ ] `GET /hebbian/table` returns the full pattern weight table
- [ ] `python evolution.py` runs GA and prints best Sharpe ratio
- [ ] `python gym_env.py` runs random + GA-optimised backtest and prints summary
- [ ] All files pass `flake8` with max-line-length=100
- [ ] `server.py` line count ≤ 1,250

---

*Odyssey Trading Agent — built for autonomous, explainable, multi-timeframe confluence trading.*
