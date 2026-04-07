"""
Odyssey Evolution — Lean Genetic Algorithm / Grammatical Evolution
for trading strategy parameter optimisation.

A chromosome encodes the indicator thresholds and confluence weights
that drive the MTFEngine's signal generation. The GA evolves these
parameters to maximise a fitness function (Sharpe ratio over a backtest
window). Designed to be launched from the DSPy agent or the CLI.
"""

from __future__ import annotations

import asyncio
import copy
import math
import random
import statistics
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

# ─── Chromosome ────────────────────────────────────────────────────────────────

# Parameter space: (name, min, max, is_int)
PARAM_SPACE: List[Tuple[str, float, float, bool]] = [
    ("cci2_ob_threshold",     50.0,  200.0, False),   # CCI(2) overbought
    ("cci2_os_threshold",   -200.0,  -50.0, False),   # CCI(2) oversold
    ("wpr_ob_threshold",    -40.0,  -10.0, False),    # WPR overbought
    ("wpr_os_threshold",    -90.0,  -60.0, False),    # WPR oversold
    ("macd_hist_min",          0.0,   0.01, False),   # MACD hist magnitude
    ("confluence_threshold",   0.40,  0.85, False),   # min confluence to trade
    ("ema_stack_frac",         0.50,  0.90, False),   # fraction for trend bias
    ("atr_sl_mult",            1.0,   3.0, False),    # ATR × mult = stop-loss
    ("atr_tp_mult",            2.0,   6.0, False),    # ATR × mult = take-profit
    ("fib_sr_weight",          0.0,   1.0, False),    # weight of fib S/R in score
    ("longterm_sr_touch_min",  2.0,   6.0, True),     # min touches for LT S/R
    ("fractal_lookback",       1.0,   5.0, True),     # bars each side for fractal
]

PARAM_NAMES = [p[0] for p in PARAM_SPACE]


@dataclass
class Chromosome:
    genes: Dict[str, float] = field(default_factory=dict)
    fitness: float = -math.inf

    @classmethod
    def random(cls) -> "Chromosome":
        genes = {}
        for name, lo, hi, is_int in PARAM_SPACE:
            v = random.uniform(lo, hi)
            genes[name] = int(round(v)) if is_int else round(v, 6)
        return cls(genes=genes)

    def clamp(self) -> None:
        for name, lo, hi, is_int in PARAM_SPACE:
            v = max(lo, min(hi, self.genes.get(name, (lo + hi) / 2)))
            self.genes[name] = int(round(v)) if is_int else round(v, 6)

    def to_dict(self) -> Dict[str, Any]:
        return {"genes": self.genes, "fitness": round(self.fitness, 6)}

# ─── Genetic Operators ────────────────────────────────────────────────────────

def crossover(parent_a: Chromosome, parent_b: Chromosome,
              alpha: float = 0.5) -> Tuple[Chromosome, Chromosome]:
    """Uniform blend crossover (BLX-α)."""
    c1_genes, c2_genes = {}, {}
    for name in PARAM_NAMES:
        a, b = parent_a.genes[name], parent_b.genes[name]
        lo, hi, is_int = [(p[1], p[2], p[3]) for p in PARAM_SPACE
                          if p[0] == name][0]
        d = abs(a - b)
        v1 = random.uniform(min(a, b) - alpha * d, max(a, b) + alpha * d)
        v2 = random.uniform(min(a, b) - alpha * d, max(a, b) + alpha * d)
        v1 = max(lo, min(hi, v1))
        v2 = max(lo, min(hi, v2))
        c1_genes[name] = int(round(v1)) if is_int else round(v1, 6)
        c2_genes[name] = int(round(v2)) if is_int else round(v2, 6)
    return Chromosome(genes=c1_genes), Chromosome(genes=c2_genes)


def mutate(chrom: Chromosome, rate: float = 0.15,
           sigma: float = 0.1) -> Chromosome:
    """Gaussian mutation at rate `rate`, stddev `sigma` × parameter range."""
    chrom = copy.deepcopy(chrom)
    for name, lo, hi, is_int in PARAM_SPACE:
        if random.random() < rate:
            rng = abs(hi - lo)
            delta = random.gauss(0, sigma * rng)
            v = chrom.genes[name] + delta
            v = max(lo, min(hi, v))
            chrom.genes[name] = int(round(v)) if is_int else round(v, 6)
    return chrom

# ─── Fitness Function ─────────────────────────────────────────────────────────

def evaluate_fitness(chrom: Chromosome,
                     price_data: np.ndarray,
                     risk_free: float = 0.0) -> float:
    """
    Simulate a simple strategy using chromosome parameters on price_data.
    Returns Sharpe ratio (annualised, daily bars assumed).

    Strategy: go long when 'confluence' (approximated here from price momentum)
    exceeds threshold, exit at TP/SL based on ATR multipliers.
    This is intentionally lightweight — plug in the full MTFEngine backtest
    from gym_env.py for production evaluation.
    """
    if len(price_data) < 50:
        return -math.inf

    thresh = chrom.genes["confluence_threshold"]
    atr_sl = chrom.genes["atr_sl_mult"]
    atr_tp = chrom.genes["atr_tp_mult"]
    cci_ob = chrom.genes["cci2_ob_threshold"]
    cci_os = chrom.genes["cci2_os_threshold"]

    # Compute lightweight proxies
    returns_arr = np.diff(np.log(price_data + 1e-9))
    # ATR proxy: rolling std of returns × price
    atr_proxy = np.array([
        np.std(returns_arr[max(0, i - 14):i + 1]) * price_data[i]
        for i in range(len(price_data))
    ])
    # CCI(2) proxy using raw price deviation
    tp_arr = price_data.copy()
    sma2 = np.array([
        np.mean(tp_arr[max(0, i - 2):i + 1]) for i in range(len(tp_arr))
    ])
    mad2 = np.array([
        np.mean(np.abs(tp_arr[max(0, i - 2):i + 1] -
                        np.mean(tp_arr[max(0, i - 2):i + 1]))) + 1e-9
        for i in range(len(tp_arr))
    ])
    cci2 = (tp_arr - sma2) / (0.015 * mad2)

    # Generate entry signals
    pnls: List[float] = []
    in_trade = False
    entry_price = 0.0
    direction = 0

    for i in range(5, len(price_data) - 1):
        if not in_trade:
            if cci2[i] > cci_ob:
                in_trade, entry_price, direction = True, price_data[i], 1
            elif cci2[i] < cci_os:
                in_trade, entry_price, direction = True, price_data[i], -1
        else:
            price = price_data[i]
            sl = atr_sl * atr_proxy[i]
            tp = atr_tp * atr_proxy[i]
            move = direction * (price - entry_price)
            if move <= -sl or move >= tp:
                pnls.append(move / entry_price)
                in_trade = False

    if not pnls or len(pnls) < 5:
        return -1.0

    mean_pnl = statistics.mean(pnls)
    std_pnl = statistics.stdev(pnls) if len(pnls) > 1 else 1e-9
    sharpe = (mean_pnl - risk_free) / max(std_pnl, 1e-9) * math.sqrt(252)
    return round(sharpe, 6)

# ─── Tournament Selection ─────────────────────────────────────────────────────

def tournament_select(population: List[Chromosome],
                      tournament_k: int = 3) -> Chromosome:
    competitors = random.sample(population, min(tournament_k, len(population)))
    return max(competitors, key=lambda c: c.fitness)

# ─── Main GA Loop ─────────────────────────────────────────────────────────────

def run_ga(
    price_data: np.ndarray,
    pop_size: int = 40,
    generations: int = 50,
    elite_n: int = 4,
    crossover_rate: float = 0.80,
    mutation_rate: float = 0.15,
    mutation_sigma: float = 0.08,
    verbose: bool = False,
    callback: Optional[Callable[[int, Chromosome], None]] = None,
) -> Tuple[Chromosome, List[float]]:
    """
    Full generational GA.
    Returns (best_chromosome, list_of_best_fitness_per_generation).
    """
    # Initialise population
    population = [Chromosome.random() for _ in range(pop_size)]

    # Evaluate
    for chrom in population:
        chrom.fitness = evaluate_fitness(chrom, price_data)

    best_history: List[float] = []

    for gen in range(generations):
        population.sort(key=lambda c: c.fitness, reverse=True)
        best = population[0]
        best_history.append(best.fitness)
        if callback:
            callback(gen, best)
        if verbose:
            print(f"Gen {gen:03d} | best_fitness={best.fitness:.4f} | "
                  f"action_threshold={best.genes['confluence_threshold']:.3f}")

        # Elitism
        new_pop: List[Chromosome] = population[:elite_n]

        # Fill rest via crossover + mutation
        while len(new_pop) < pop_size:
            if random.random() < crossover_rate:
                p1 = tournament_select(population)
                p2 = tournament_select(population)
                c1, c2 = crossover(p1, p2)
                new_pop.extend([c1, c2])
            else:
                parent = tournament_select(population)
                new_pop.append(copy.deepcopy(parent))

        new_pop = new_pop[:pop_size]

        # Mutate (skip elite)
        for chrom in new_pop[elite_n:]:
            mutate(chrom, rate=mutation_rate, sigma=mutation_sigma)
            chrom.clamp()

        # Evaluate new individuals
        for chrom in new_pop[elite_n:]:
            chrom.fitness = evaluate_fitness(chrom, price_data)

        population = new_pop

    population.sort(key=lambda c: c.fitness, reverse=True)
    return population[0], best_history

# ─── Async wrapper (called from DSPy agent) ────────────────────────────────────

async def run_ga_async(
    price_data: np.ndarray,
    pop_size: int = 40,
    generations: int = 50,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Non-blocking GA runner for use inside async FastAPI routes."""
    loop = asyncio.get_event_loop()
    best, history = await loop.run_in_executor(
        None,
        lambda: run_ga(price_data, pop_size, generations, **kwargs),
    )
    return {"best_genes": best.genes, "best_fitness": best.fitness,
            "history": history}

# ─── Grammatical Evolution Stub ───────────────────────────────────────────────

# GE maps integer codons to production rules, producing a strategy grammar.
# Here we define a minimal grammar and codon decoder for experimentation.

GE_GRAMMAR: Dict[str, List[str]] = {
    "<strategy>": ["<entry> AND <filter>"],
    "<entry>":    ["CCI2>OB", "CCI2<OS", "MACD_HIST>0", "MACD_HIST<0",
                   "WPR>OB", "WPR<OS"],
    "<filter>":   ["EMA_BULL", "EMA_BEAR", "ATR_EXPAND", "RSI_MID",
                   "CONFLUENCE>0.6", "CONFLUENCE>0.5"],
}


def ge_decode(codons: List[int]) -> str:
    """
    Decode an integer codon list into a strategy expression string using
    the GE_GRAMMAR. Wraps around codons if grammar depth requires more.
    """
    symbol = "<strategy>"
    idx = 0
    max_depth = 20
    for _ in range(max_depth):
        if symbol not in GE_GRAMMAR:
            break
        choices = GE_GRAMMAR[symbol]
        chosen = choices[codons[idx % len(codons)] % len(choices)]
        idx += 1
        # Expand first non-terminal in chosen string
        parts = chosen.split()
        expanded = []
        for part in parts:
            if part in GE_GRAMMAR:
                sub_choices = GE_GRAMMAR[part]
                expanded.append(sub_choices[codons[idx % len(codons)] % len(sub_choices)])
                idx += 1
            else:
                expanded.append(part)
        symbol = " ".join(expanded)
        if "<" not in symbol:
            break
    return symbol


def run_ge(price_data: np.ndarray, codon_length: int = 20,
           pop_size: int = 30, generations: int = 30) -> Dict[str, Any]:
    """
    Minimal Grammatical Evolution runner.
    Each individual is a list of integers (codons); decoded to a strategy string;
    fitness is evaluated via a heuristic based on the decoded rule.
    """
    def random_codons() -> List[int]:
        return [random.randint(0, 255) for _ in range(codon_length)]

    def fitness_ge(codons: List[int]) -> float:
        expr = ge_decode(codons)
        # Simple heuristic: longer unique expression → higher base score
        # In production, parse `expr` and run actual backtest
        tokens = set(expr.split())
        diversity = len(tokens) / max(len(expr.split()), 1)
        return diversity + random.gauss(0, 0.05)  # placeholder backtest

    population_codons = [random_codons() for _ in range(pop_size)]
    best_codons = max(population_codons, key=fitness_ge)
    best_fitness = fitness_ge(best_codons)

    for _ in range(generations):
        # Simple (µ+λ) evolution
        offspring = []
        for codons in population_codons:
            child = codons[:]
            for i in range(len(child)):
                if random.random() < 0.1:
                    child[i] = random.randint(0, 255)
            offspring.append(child)
        population_codons = sorted(
            population_codons + offspring, key=fitness_ge, reverse=True
        )[:pop_size]
        candidate = population_codons[0]
        if fitness_ge(candidate) > best_fitness:
            best_codons = candidate
            best_fitness = fitness_ge(candidate)

    return {
        "best_strategy": ge_decode(best_codons),
        "best_codons": best_codons,
        "best_fitness": round(best_fitness, 6),
    }

# ─── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("=== Odyssey GA Demo ===")
    rng = np.random.default_rng(42)
    prices = np.cumprod(1 + rng.normal(0, 0.001, 600)) * 1.08
    best, hist = run_ga(prices, pop_size=30, generations=20, verbose=True)
    print(f"\nBest genes: {best.genes}")
    print(f"Best Sharpe: {best.fitness:.4f}")

    print("\n=== Grammatical Evolution Demo ===")
    ge_result = run_ge(prices, pop_size=20, generations=15)
    print(f"Best strategy expression: {ge_result['best_strategy']}")
