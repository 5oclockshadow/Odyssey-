"""The scope registry — who/what TenderGraph watches, and where their data lives.

Seeded with Edmonton + major Canadian cities and the real procurement / open-data
portals to ingest, plus provincial/federal/military buyers and the capex company
scope. Expand programmatically (the engine adds entities it discovers). Source
URLs are read-only ingestion targets; actual fetching is gated + rate-limited.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Companies in scope: known entities with capital expenditure at/above this.
CAPEX_THRESHOLD_CAD: float = 50_000_000.0


@dataclass
class Place:
    id: str
    name: str
    kind: str                    # city | province | federal | military
    province: str = ""
    procurement_urls: list[str] = field(default_factory=list)
    opendata_urls: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=lambda: [
        "roads", "sewer", "water", "transit", "schools", "utilities",
        "bylaws", "budget", "land_tax", "voting", "failures", "sentiment",
    ])


# -- Municipal (start: Edmonton, then the rest) ------------------------------ #
CITIES: list[Place] = [
    Place("city:edmonton", "Edmonton", "city", "AB",
          procurement_urls=["https://www.bidsandtenders.ca/", "https://purchasing.alberta.ca/"],
          opendata_urls=["https://data.edmonton.ca/"]),
    Place("city:calgary", "Calgary", "city", "AB",
          procurement_urls=["https://procurement.calgary.ca/", "https://purchasing.alberta.ca/"],
          opendata_urls=["https://data.calgary.ca/"]),
    Place("city:toronto", "Toronto", "city", "ON",
          procurement_urls=["https://www.toronto.ca/business-economy/doing-business-with-the-city/"],
          opendata_urls=["https://open.toronto.ca/"]),
    Place("city:vancouver", "Vancouver", "city", "BC",
          procurement_urls=["https://vancouver.ca/doing-business/open-bids.aspx", "https://www.bcbid.gov.bc.ca/"],
          opendata_urls=["https://opendata.vancouver.ca/"]),
    Place("city:ottawa", "Ottawa", "city", "ON",
          procurement_urls=["https://ottawa.bidsandtenders.ca/"],
          opendata_urls=["https://open.ottawa.ca/"]),
    Place("city:winnipeg", "Winnipeg", "city", "MB",
          procurement_urls=["https://winnipeg.ca/matmgt/bidopp.asp"],
          opendata_urls=["https://data.winnipeg.ca/"]),
    Place("city:montreal", "Montreal", "city", "QC",
          procurement_urls=["https://www.seao.ca/"],
          opendata_urls=["https://donnees.montreal.ca/"]),
]

# -- Provincial / Federal / Military buyers ---------------------------------- #
GOV: list[Place] = [
    Place("gov:ab", "Alberta (Provincial)", "province", "AB",
          procurement_urls=["https://purchasing.alberta.ca/"]),
    Place("gov:canada", "Government of Canada", "federal",
          procurement_urls=["https://canadabuys.canada.ca/en", "https://www.merx.com/"]),
    Place("gov:dnd", "Department of National Defence / CAF", "military",
          procurement_urls=["https://canadabuys.canada.ca/en", "https://www.merx.com/"]),
]


def all_places() -> list[Place]:
    return CITIES + GOV


def place(pid: str) -> Place | None:
    return next((p for p in all_places() if p.id == pid), None)


# Seed node texts so the graph has substance before live ingest fills it in.
def seed_nodes() -> list[dict]:
    out: list[dict] = []
    for p in all_places():
        out.append({
            "id": p.id, "archetype": "city" if p.kind == "city" else ("military" if p.kind == "military" else "government"),
            "name": p.name,
            "text": f"{p.name} ({p.kind}, {p.province or 'CA'}). Watched topics: {', '.join(p.topics)}.",
            "attrs": {"kind": p.kind, "province": p.province,
                      "procurement_urls": p.procurement_urls, "opendata_urls": p.opendata_urls},
        })
        for u in p.procurement_urls + p.opendata_urls:
            out.append({"id": f"source:{u}", "archetype": "source", "name": u,
                        "text": f"Data source for {p.name}: {u}", "attrs": {"place": p.id, "url": u}})
    return out
