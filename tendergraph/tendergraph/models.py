"""TenderGraph domain contracts — Check-&-Capture Pydantic models at every boundary.

Entities become nodes in the one 4D intelligence graph; relationships become edges.
Everything is typed and validated; ingestion never trusts a raw payload.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Archetype(str, Enum):
    """Node archetypes — the legend of the intelligence graph."""
    CITY = "city"
    GOVERNMENT = "government"       # municipal/provincial/federal body
    MILITARY = "military"
    COMPANY = "company"            # capex >= threshold
    TENDER = "tender"             # an open/closed procurement
    BID = "bid"                   # our prepared response / opportunity
    INFRASTRUCTURE = "infrastructure"  # sewer/roads/schools/utilities/transit
    BYLAW = "bylaw"
    VOTE = "vote"
    BUDGET = "budget"             # land tax, levies, forecasts
    EARNER = "earner"             # top reported earners / employers
    SENTIMENT = "sentiment"       # what the internet knows/thinks/shares (OSINT)
    FAILURE = "failure"           # where they are failing
    OPPORTUNITY = "opportunity"   # a way to win work, with or without a bid
    SOURCE = "source"             # a data source / connector


class Jurisdiction(str, Enum):
    MUNICIPAL = "municipal"
    PROVINCIAL = "provincial"
    FEDERAL = "federal"
    MILITARY = "military"
    PRIVATE = "private"


class TenderStatus(str, Enum):
    FORECAST = "forecast"      # anticipated, not yet posted
    OPEN = "open"
    CLOSING = "closing"
    CLOSED = "closed"
    AWARDED = "awarded"
    CANCELLED = "cancelled"


class Node(BaseModel):
    """A validated graph node. `id` is stable; `t` is the temporal (4th) axis."""
    id: str = Field(min_length=1)
    archetype: Archetype
    name: str = Field(min_length=1)
    text: str = ""                        # searchable summary
    t: str = Field(default_factory=_now)  # ISO 8601 event/as-of time
    attrs: dict[str, Any] = Field(default_factory=dict)
    sources: list[str] = Field(default_factory=list)  # source ids / urls (provenance)


class Tender(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    buyer: str = ""                       # issuing city/gov/company id
    jurisdiction: Jurisdiction = Jurisdiction.MUNICIPAL
    status: TenderStatus = TenderStatus.OPEN
    category: str = ""                    # roads, sewer, IT, defense, ...
    value_cad: float | None = None
    posted: str | None = None
    closes: str | None = None             # ISO 8601 deadline (temporal lane key)
    url: str = ""
    summary: str = ""
    source: str = ""

    @field_validator("value_cad", mode="before")
    @classmethod
    def _coerce_value(cls, v: Any) -> float | None:
        if v in (None, "", "N/A"):
            return None
        try:
            return float(str(v).replace("$", "").replace(",", ""))
        except (TypeError, ValueError):
            return None


class FitScore(BaseModel):
    """How well an opportunity fits us — explainable, never a bare number."""
    tender_id: str
    score: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)       # what we'd need to win
    win_path: str = ""                                   # "bid" | "unsolicited" | "partner" | "watch"

    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> float:
        try:
            return min(1.0, max(0.0, float(v)))
        except (TypeError, ValueError):
            return 0.0


class BidPackage(BaseModel):
    """A prepped response so the operator can act with or without a formal bid."""
    tender_id: str
    title: str
    status: str = "draft"                 # draft | ready | submitted | won | lost
    executive_summary: str = ""
    requirements: list[str] = Field(default_factory=list)
    our_evidence: list[str] = Field(default_factory=list)   # past work / capabilities mapped to reqs
    risks: list[str] = Field(default_factory=list)
    deadline: str | None = None
    checklist: dict[str, bool] = Field(default_factory=dict)
    generated_at: str = Field(default_factory=_now)
