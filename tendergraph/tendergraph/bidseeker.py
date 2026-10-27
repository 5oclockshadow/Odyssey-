"""BidSeeker — the self-maintaining, bid-seeking engine.

Each cycle (pause/halt-gated, non-blocking via osiiso):
  1. DISCOVER   tenders across the registry (THREAD lane — portal IO).
  2. INTELLIGE  write each tender + buyer into the graph (Agent = Graph) and
                coactivate with our capabilities (Hebbian).
  3. SCORE      fit for every open tender (PROCESS lane — CPU scoring), pick a
                win path (bid / unsolicited / partner / watch).
  4. PREP       a bid package for high-fit, soon-closing tenders so the operator
                can act WITH OR WITHOUT a formal bid.
  5. RECORD     a frame for the live view / playback.

Deterministic offline by default (keyword + value + deadline scoring); an LLM
hook (`score_fn`) can replace the scorer with model-routed structured reasoning.
"""
from __future__ import annotations

import functools
import logging
import time
from typing import Any, Callable

from .control import AutoControl
from .graph import Graph
from .models import BidPackage, FitScore, Tender
from .osiiso import Osiiso, cpu_bound
from .recorder import Recorder
from .registry import CAPEX_THRESHOLD_CAD
from .sources import discover_all

log = logging.getLogger("tendergraph.bidseeker")

# Our capabilities — what we can credibly win. Expand from real past work.
DEFAULT_CAPABILITIES = [
    "data platform", "analytics", "graph", "ai", "automation", "software",
    "modernization", "cloud", "integration", "open data", "logistics",
]


@cpu_bound
def _score_tender(tender_dict: dict, capabilities: list[str], now: float) -> dict:
    """Pure CPU scoring (runs on osiiso PROCESS lane). Explainable FitScore."""
    t = Tender(**tender_dict)
    text = f"{t.title} {t.summary} {t.category}".lower()
    hits = [c for c in capabilities if c in text]
    cap_score = min(1.0, len(hits) / 3.0)

    # Value: prefer meaningful but winnable size.
    v = t.value_cad or 0.0
    value_score = 0.3 if v == 0 else min(1.0, 0.4 + min(v, 100_000_000) / 100_000_000 * 0.6)

    # Deadline urgency (temporal): closer = more actionable now.
    urgency, days = 0.5, None
    if t.closes:
        try:
            closes = time.mktime(time.strptime(t.closes[:19], "%Y-%m-%dT%H:%M:%S"))
            days = (closes - now) / 86400.0
            urgency = 1.0 if 0 < days <= 30 else (0.7 if 0 < days <= 60 else (0.2 if days <= 0 else 0.5))
        except (ValueError, OverflowError):
            pass

    score = round(0.5 * cap_score + 0.25 * value_score + 0.25 * urgency, 3)
    reasons = [f"capability match: {', '.join(hits) or 'none'}",
               f"value ${v:,.0f}" if v else "value unknown",
               f"closes in {days:.0f}d" if days is not None else "no deadline"]
    gaps = [] if hits else ["no direct capability keyword — needs a partner or a stretch"]
    if score >= 0.6 and hits:
        win = "bid"
    elif score >= 0.45:
        win = "unsolicited" if not hits else "partner"
    else:
        win = "watch"
    return FitScore(tender_id=t.id, score=score, reasons=reasons, gaps=gaps, win_path=win).model_dump()


class BidSeeker:
    __test__ = False

    def __init__(self, graph: Graph | None = None, recorder: Recorder | None = None,
                 osiiso: Osiiso | None = None, capabilities: list[str] | None = None,
                 score_fn: Callable | None = None):
        self.graph = graph or Graph()
        self.recorder = recorder or Recorder("/tmp/tendergraph/tape.jsonl")
        self.osiiso = osiiso or Osiiso()
        self.control = AutoControl("TENDER")
        self.capabilities = capabilities or list(DEFAULT_CAPABILITIES)
        self.score_fn = score_fn            # optional LLM/model-routed scorer
        self.packages: dict[str, BidPackage] = {}
        self.last_result: dict | None = None

    def _ingest(self, tenders: list[Tender]):
        for t in tenders:
            tid = f"tender:{t.id}"
            self.graph.ensure(tid, f"{t.title}. {t.summary} [{t.category}] ${t.value_cad or 0:,.0f}",
                              archetype="tender", buyer=t.buyer, closes=t.closes, category=t.category)
            self.graph.ensure(f"buyer:{t.buyer}", t.buyer, archetype="government")
            self.graph.link(f"buyer:{t.buyer}", tid, "issues", 0.3)
            # Hebbian: coactivate the tender with the capabilities it matches.
            text = f"{t.title} {t.summary} {t.category}".lower()
            matched = [f"cap:{c}" for c in self.capabilities if c in text]
            for cid in matched:
                self.graph.ensure(cid, cid.split(":", 1)[1], archetype="opportunity")
            self.graph.coactivate([tid] + matched, lr=0.15)

    def _prep_package(self, t: Tender, fit: FitScore) -> BidPackage:
        reqs = [t.summary] if t.summary else []
        evidence = [f"capability: {c}" for c in self.capabilities
                    if c in f"{t.title} {t.summary} {t.category}".lower()]
        pkg = BidPackage(
            tender_id=t.id, title=t.title, status="draft", deadline=t.closes,
            executive_summary=f"Fit {fit.score:.0%} via {fit.win_path}. {t.title} for {t.buyer}.",
            requirements=reqs, our_evidence=evidence, risks=fit.gaps,
            checklist={"requirements_mapped": bool(evidence), "deadline_known": bool(t.closes),
                       "win_path_chosen": True, "evidence_attached": bool(evidence)},
        )
        self.graph.ensure(f"bid:{t.id}", f"Bid package for {t.title} ({fit.win_path})", archetype="bid")
        self.graph.link(f"bid:{t.id}", f"tender:{t.id}", "responds_to", 0.5)
        return pkg

    async def cycle(self, force: bool = False) -> dict:
        why = self.control.blocked()
        if why and not force:
            self.recorder.record("skip", {"why": why})
            return {"skipped": why}

        tenders = await self.osiiso.run(discover_all, nature="thread")
        self._ingest(tenders)
        self.recorder.record("discover", {"count": len(tenders)})

        now = time.time()
        if self.score_fn:
            fits = [FitScore(**(await self.score_fn(t))) for t in tenders]
        else:
            # Bind capabilities + now so the CPU scorer takes just the item
            # (picklable: a module-level fn with simple bound args).
            scorer = functools.partial(_score_tender, capabilities=self.capabilities, now=now)
            scored = await self.osiiso.map(scorer, [t.model_dump() for t in tenders],
                                           nature="process")
            fits = [FitScore(**s) for s in scored if isinstance(s, dict)]

        by_id = {t.id: t for t in tenders}
        prepped = 0
        for fit in sorted(fits, key=lambda f: -f.score):
            self.graph.ensure(f"fit:{fit.tender_id}",
                              f"fit {fit.score} {fit.win_path}: {'; '.join(fit.reasons)}",
                              archetype="opportunity")
            self.graph.link(f"fit:{fit.tender_id}", f"tender:{fit.tender_id}", "assesses", 0.3)
            t = by_id.get(fit.tender_id)
            if t and fit.score >= 0.55 and fit.win_path in ("bid", "unsolicited", "partner"):
                self.packages[t.id] = self._prep_package(t, fit)
                prepped += 1

        result = {"discovered": len(tenders), "scored": len(fits), "prepped": prepped,
                  "top": [{"id": f.tender_id, "score": f.score, "win": f.win_path}
                          for f in sorted(fits, key=lambda f: -f.score)[:5]]}
        self.last_result = result
        self.recorder.record("cycle", result)
        self.graph.decay()  # keep plasticity bounded each cycle
        return result

    def status(self) -> dict:
        return {"version": __import__("tendergraph").__version__,
                "control": self.control.status(), "graph": self.graph.stats(),
                "osiiso": self.osiiso.snapshot(), "packages": len(self.packages),
                "capex_threshold_cad": CAPEX_THRESHOLD_CAD, "last_result": self.last_result,
                "tape_head": self.recorder.head()}
