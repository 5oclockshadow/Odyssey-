"""
Odyssey Trading Agents — DSPy ReAct + RAPTOR + Autonomous Decision Pipeline.
Uses DSPy Signatures and the ReAct module to reason over multi-timeframe
confluence data and produce explainable trade decisions.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

# ── DSPy (graceful degradation if not installed) ───────────────────────────────
try:
    import dspy
    _DSPY = True
except ImportError:
    _DSPY = False

# ─── DSPy Signatures ──────────────────────────────────────────────────────────

if _DSPY:
    class MarketSummarySignature(dspy.Signature):
        """Summarise raw multi-timeframe market data into a concise narrative."""
        raw_data: str = dspy.InputField(desc="JSON multi-timeframe analysis")
        summary: str = dspy.OutputField(
            desc="Concise narrative: trend, key S/R levels, indicator alignment"
        )

    class TradeDecisionSignature(dspy.Signature):
        """
        Given a market summary and Hebbian learned weight, decide on a trade.
        Consider: trend direction, confluence score, nearest S/R levels,
        indicator alignment (CCI-2, MACD, WPR, OsMA), risk-reward.
        """
        market_summary: str = dspy.InputField(desc="Concise market narrative")
        hebbian_weight: float = dspy.InputField(
            desc="Learned pattern weight (-1 to +1). Positive = historically profitable."
        )
        confluence_score: float = dspy.InputField(desc="0-1 confluence score")
        action: str = dspy.OutputField(desc="One of: buy, sell, hold")
        reasoning: str = dspy.OutputField(
            desc="Step-by-step reasoning for the decision"
        )
        confidence: float = dspy.OutputField(desc="0-1 confidence in decision")
        stop_loss_pct: float = dspy.OutputField(
            desc="Suggested stop-loss as % of price (e.g. 0.5)"
        )
        take_profit_pct: float = dspy.OutputField(
            desc="Suggested take-profit as % of price (e.g. 1.5)"
        )

    class RAPTORClusterSignature(dspy.Signature):
        """Summarise a cluster of correlated symbols into a market-sector narrative."""
        cluster_data: str = dspy.InputField(desc="JSON cluster info with correlations")
        cluster_summary: str = dspy.OutputField(
            desc="Sector/group narrative: what these symbols have in common"
        )

    class RAPTORGlobalSignature(dspy.Signature):
        """Synthesise all cluster summaries into a global market view."""
        cluster_summaries: str = dspy.InputField(
            desc="JSON list of cluster narratives"
        )
        global_view: str = dspy.OutputField(
            desc="Global macro market view: risk-on/off, dominant trend, key themes"
        )

# ─── RAPTOR Module ─────────────────────────────────────────────────────────────

class RAPTORReasoner:
    """
    Recursive Abstractive Processing for Tree-Organized Retrieval (RAPTOR).
    L0: Raw symbol data.
    L1: DSPy cluster summaries (symbol communities).
    L2: DSPy global market view from cluster summaries.
    """

    def __init__(self) -> None:
        if _DSPY:
            self._cluster_mod = dspy.ChainOfThought(RAPTORClusterSignature)
            self._global_mod = dspy.ChainOfThought(RAPTORGlobalSignature)

    def summarise_cluster(self, cluster_data: Dict[str, Any]) -> str:
        if not _DSPY:
            return _fallback_cluster_summary(cluster_data)
        try:
            result = self._cluster_mod(cluster_data=json.dumps(cluster_data))
            return result.cluster_summary
        except Exception:
            return _fallback_cluster_summary(cluster_data)

    def global_view(self, cluster_summaries: List[str]) -> str:
        if not _DSPY:
            return _fallback_global_view(cluster_summaries)
        try:
            result = self._global_mod(
                cluster_summaries=json.dumps(cluster_summaries)
            )
            return result.global_view
        except Exception:
            return _fallback_global_view(cluster_summaries)

    def reason(self, graph_summary: Dict[str, Any]) -> Dict[str, str]:
        """Full RAPTOR pass: produce L1 cluster + L2 global summaries."""
        l1: Dict[str, str] = {}
        for cname, cdata in graph_summary.get("l1_clusters", {}).items():
            l1[cname] = self.summarise_cluster(cdata)
        global_narrative = self.global_view(list(l1.values()))
        return {"l1_cluster_summaries": l1, "l2_global_view": global_narrative}

# ─── Trading Agent ─────────────────────────────────────────────────────────────

class TradingReActAgent:
    """
    DSPy ReAct trading agent.
    Tools available to the agent:
      - summarise_market: chain-of-thought market summary
      - decide_trade: final action decision with reasoning
    Autonomous: calls both tools in sequence then returns a TradeDecision dict.
    """

    def __init__(self) -> None:
        if _DSPY:
            self._summarise = dspy.ChainOfThought(MarketSummarySignature)
            self._decide = dspy.ChainOfThought(TradeDecisionSignature)

    def _summarise_market(self, confluence_data: Dict[str, Any]) -> str:
        if not _DSPY:
            return _fallback_summarise(confluence_data)
        # Trim tf_detail to reduce token count
        slim = {k: v for k, v in confluence_data.items() if k != "tf_detail"}
        slim["indicator_snapshot"] = confluence_data["tf_detail"][-1]["indicators"]
        slim["nearest_levels"] = confluence_data.get("nearest_levels", [])
        try:
            result = self._summarise(raw_data=json.dumps(slim, default=str))
            return result.summary
        except Exception:
            return _fallback_summarise(confluence_data)

    def run(self, confluence_data: Dict[str, Any],
            hebbian_weight: float = 0.0) -> Dict[str, Any]:
        """
        Autonomous decision pipeline:
        1. Summarise market context (RAPTOR L0→L1).
        2. Decide trade action with reasoning.
        3. Return structured TradeDecision dict.
        """
        summary = self._summarise_market(confluence_data)

        if not _DSPY:
            return _rule_based_decision(confluence_data, hebbian_weight)

        try:
            dec = self._decide(
                market_summary=summary,
                hebbian_weight=hebbian_weight,
                confluence_score=confluence_data.get("confluence", 0.0),
            )
            return {
                "symbol": confluence_data["symbol"],
                "action": str(dec.action).lower(),
                "reasoning": str(dec.reasoning),
                "confidence": _safe_float(dec.confidence, 0.0),
                "stop_loss_pct": _safe_float(dec.stop_loss_pct, 0.5),
                "take_profit_pct": _safe_float(dec.take_profit_pct, 1.5),
                "market_summary": summary,
                "hebbian_weight": hebbian_weight,
                "confluence": confluence_data.get("confluence", 0.0),
            }
        except Exception:
            return _rule_based_decision(confluence_data, hebbian_weight)

# ─── Module-level convenience function (called by server.py) ──────────────────

_agent = TradingReActAgent()
_raptor = RAPTORReasoner()


def decide(confluence_data: Dict[str, Any],
           hebbian_weight: float = 0.0) -> Dict[str, Any]:
    """Entry point called by server.py /decide/{symbol}."""
    return _agent.run(confluence_data, hebbian_weight)


def raptor_reason(graph_summary: Dict[str, Any]) -> Dict[str, str]:
    """Entry point for RAPTOR reasoning over symbol graph summary."""
    return _raptor.reason(graph_summary)

# ─── Fallback (no LLM) ─────────────────────────────────────────────────────────

def _safe_float(val: Any, default: float) -> float:
    try:
        return round(float(val), 4)
    except (TypeError, ValueError):
        return default


def _fallback_summarise(data: Dict[str, Any]) -> str:
    d = data.get("direction", 0)
    c = data.get("confluence", 0.0)
    reasons = "; ".join(data.get("reasons", []))
    dir_str = "BULLISH" if d == 1 else "BEARISH" if d == -1 else "NEUTRAL"
    return (
        f"{data.get('symbol','?')} — {dir_str} | confluence={c:.2f} | "
        f"reasons: {reasons or 'insufficient data'}"
    )


def _fallback_cluster_summary(cluster: Dict[str, Any]) -> str:
    syms = ", ".join(cluster.get("symbols", []))
    corr = cluster.get("avg_intra_correlation", 0.0)
    return f"Cluster [{syms}] avg_corr={corr:.3f}"


def _fallback_global_view(summaries: List[str]) -> str:
    return "Global view: " + " | ".join(summaries[:3])


def _rule_based_decision(data: Dict[str, Any],
                         hw: float = 0.0) -> Dict[str, Any]:
    """Simple rule-based fallback when DSPy LLM is unavailable."""
    conf = min(data.get("confluence", 0.0) * (1 + 0.25 * hw), 1.0)
    d = data.get("direction", 0)
    threshold = 0.55
    action = (
        "buy" if d == 1 and conf >= threshold
        else "sell" if d == -1 and conf >= threshold
        else "hold"
    )
    price = data["tf_detail"][-1]["close"] if data.get("tf_detail") else 1.0
    atr_v = (data["tf_detail"][-1]["indicators"].get("atr_14", price * 0.001)
             if data.get("tf_detail") else price * 0.001)
    sl_pct = round(1.5 * atr_v / max(price, 1e-9) * 100, 4)
    tp_pct = round(3.0 * atr_v / max(price, 1e-9) * 100, 4)
    return {
        "symbol": data.get("symbol", ""),
        "action": action,
        "reasoning": "; ".join(data.get("reasons", [])) or "Insufficient confluence",
        "confidence": round(conf, 4),
        "stop_loss_pct": sl_pct,
        "take_profit_pct": tp_pct,
        "market_summary": _fallback_summarise(data),
        "hebbian_weight": hw,
        "confluence": round(conf, 4),
    }
