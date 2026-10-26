"""Source connectors — read-only, gated ingestion of tenders & intelligence.

A connector turns a place's portal into validated `Tender` / `Node` objects.
Live fetching is gated (dry-run first, rate-limited, allow/deny list) and happens
on osiiso's THREAD/ASYNC lanes so it never blocks. Until a live connector is
wired for a portal, `sample_tenders()` yields deterministic offline fixtures so
the discover→score→prep loop runs and is testable with zero network.

Implementing a live connector (agent task): subclass `Connector`, implement
`fetch()` to return `list[Tender]`, respect `self.enabled` + rate limits, and
register it in `CONNECTORS`.
"""
from __future__ import annotations

import logging
from typing import Any

from .models import Tender, TenderStatus, Jurisdiction
from .registry import Place, all_places

log = logging.getLogger("tendergraph.sources")


class Connector:
    """Base connector. Live fetch is OFF unless explicitly enabled (gated)."""

    def __init__(self, place: Place, enabled: bool = False):
        self.place = place
        self.enabled = enabled

    def fetch(self) -> list[Tender]:  # pragma: no cover - overridden by live connectors
        """Return current tenders for this place. Blocking IO is fine — osiiso
        runs this on a worker thread."""
        raise NotImplementedError("live connector not implemented; using sample fixtures")

    def __repr__(self) -> str:
        return f"<Connector {self.place.id} enabled={self.enabled}>"


CONNECTORS: dict[str, type[Connector]] = {}


def register(place_id: str):
    def deco(cls: type[Connector]) -> type[Connector]:
        CONNECTORS[place_id] = cls
        return cls
    return deco


# --------------------------------------------------------------------------- #
# Deterministic offline fixtures — so the engine runs/tests without network.
# A live connector replaces these for its place.
# --------------------------------------------------------------------------- #
_SAMPLE: dict[str, list[dict]] = {
    "city:edmonton": [
        {"id": "T-EDM-ROADS-001", "title": "Arterial roadway rehabilitation — Yellowhead corridor",
         "category": "roads", "value_cad": 48_000_000, "closes": "2026-12-01T17:00:00Z",
         "summary": "Reconstruction and resurfacing of arterial segments; traffic staging required."},
        {"id": "T-EDM-SEWER-002", "title": "Sanitary trunk sewer relining — SE basin",
         "category": "sewer", "value_cad": 72_500_000, "closes": "2026-11-20T17:00:00Z",
         "summary": "Trenchless CIPP relining of aging sanitary trunk; condition assessment included."},
        {"id": "T-EDM-IT-003", "title": "Municipal data platform modernization",
         "category": "IT", "value_cad": 18_000_000, "closes": "2026-11-10T17:00:00Z",
         "summary": "Open-data + analytics platform; cloud + on-prem; graph/AI components welcome."},
    ],
    "gov:canada": [
        {"id": "T-CAN-DEF-010", "title": "Defence logistics analytics modernization",
         "category": "defense", "value_cad": 240_000_000, "closes": "2026-12-15T17:00:00Z",
         "summary": "Predictive logistics + readiness analytics across the CAF supply chain."},
    ],
}


def sample_tenders(place_id: str) -> list[Tender]:
    out: list[Tender] = []
    for raw in _SAMPLE.get(place_id, []):
        out.append(Tender(buyer=place_id, status=TenderStatus.OPEN,
                          jurisdiction=Jurisdiction.FEDERAL if place_id.startswith("gov") else Jurisdiction.MUNICIPAL,
                          source=f"sample:{place_id}", **raw))
    return out


def discover_for(place: Place) -> list[Tender]:
    """Use the live connector when enabled; otherwise the offline fixtures."""
    cls = CONNECTORS.get(place.id)
    if cls:
        conn = cls(place)
        if conn.enabled:
            try:
                return conn.fetch()
            except Exception as exc:
                log.warning("connector %s failed, falling back to sample: %s", place.id, exc)
    return sample_tenders(place.id)


def discover_all() -> list[Tender]:
    out: list[Tender] = []
    for p in all_places():
        out.extend(discover_for(p))
    return out
