"""The paid and public API: /v1. One key per tenant (Authorization: Bearer anma_…), one persona per call (X-Persona), every call metered by the rung that answered it.
Reads come from the repricing board and the published graph with no model (rung graph); /v1/ask climbs the substrate ladder (rungs.py: the graph, any server in
RUNG_SERVERS, then the configured model) and is metered at the rung that answered. A persona is a policy, not a permission: it sets the reading level, how much of
a record is shown, the rate and what is refused, and nothing a persona asks for can reach an unpublished node."""
import time
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

import apikeys
import fleet
import ledger
import provenance
import publishing
import reprice
import round as R
import rungs
import sim

router = APIRouter(prefix="/v1", tags=["v1"])
DISCLAIMER = "Analysis, not advice. The Institute does not manage money. Every figure is a scenario-weighted estimate with its limits attached."
POLICY = {
    "civilian": {"reading": "plain", "detail": "basic", "rpm": 20, "note": DISCLAIMER},
    "student": {"reading": "plain", "detail": "basic", "rpm": 30, "note": DISCLAIMER},
    "child": {"reading": "child", "detail": "basic", "rpm": 10, "needs": "child_safe", "note": "Written for readers under 13. No prices, no investment talk."},
    "scholar": {"reading": "academic", "detail": "full", "rpm": 60, "note": DISCLAIMER},
    "journalist": {"reading": "plain", "detail": "full", "rpm": 60, "note": DISCLAIMER},
    "corporate": {"reading": "technical", "detail": "full", "rpm": 120, "note": DISCLAIMER},
    "government": {"reading": "technical", "detail": "full", "rpm": 120, "note": DISCLAIMER},
    "developer": {"reading": "technical", "detail": "full", "rpm": 240, "note": DISCLAIMER},
}
READER = {"child": "a child under thirteen: plain words, short sentences, a kind tone, no prices or investment talk; if the question is unsafe or about money advice, say a grown-up should help",
          "plain": "a general reader: plain words, define any term once", "academic": "a scholar: precise, cite node ids and sources, state uncertainty",
          "technical": "a professional: concise and quantitative, cite node ids"}
BASIC = ("id", "asset", "kind", "unit", "expected_rerate", "rerate_low", "rerate_high", "confidence", "basis", "as_of", "age_h")
_hits: dict[str, deque] = {}


def caller(request: Request) -> dict:
    h = request.headers.get("authorization", "")
    t = apikeys.verify(request.headers.get("x-api-key") or (h[7:] if h.lower().startswith("bearer ") else ""))
    if not t:
        raise HTTPException(401, "send your key as Authorization: Bearer anma_…")
    persona = (request.headers.get("x-persona") or "civilian").lower()
    pol = POLICY.get(persona)
    if not pol:
        raise HTTPException(400, f"X-Persona must be one of {sorted(POLICY)}")
    if pol.get("needs") and not t.get(pol["needs"]):
        raise HTTPException(403, "this persona needs the owner to approve the tenant for it")
    cap = float(t.get("cap_usd") or 0)
    if cap > 0 and apikeys.spent(t["id"]) >= cap:
        raise HTTPException(402, "monthly cap reached; raise it in your account")
    now, q = time.time(), _hits.setdefault(t["id"] + persona, deque())
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= pol["rpm"]:
        raise HTTPException(429, f"{pol['rpm']} calls a minute for {persona}")
    q.append(now)
    return {"tenant": t, "persona": persona, "policy": pol}


def _shape(r: dict, pol: dict) -> dict:
    row = reprice.public_row(r)
    if pol["detail"] == "basic":
        return {**{k: row.get(k) for k in BASIC}, "why": row["why"][:280], "limits": row["limits"][:1]}
    return row


@router.get("/reprice")
def reprice_board(kind: str = "", c: dict = Depends(caller)):
    if c["policy"]["reading"] == "child":
        return {"persona": "child", "items": [], "note": c["policy"]["note"]}
    rows = [r for r in reprice.board(public=True) if not kind or r["kind"] == kind]
    apikeys.record(c["tenant"]["id"], "graph")
    return {"persona": c["persona"], "disclaimer": DISCLAIMER, "items": [_shape(r, c["policy"]) for r in rows]}


@router.get("/reprice/{asset}")
def reprice_one(asset: str, c: dict = Depends(caller)):
    if c["policy"]["reading"] == "child":
        raise HTTPException(403, c["policy"]["note"])
    r = next((x for x in reprice.board(public=True) if x["asset"].lower() == asset.lower()), None)
    if not r:
        raise HTTPException(404, "no published repricing for that asset")
    apikeys.record(c["tenant"]["id"], "graph")
    return {**_shape(r, c["policy"]), "disclaimer": DISCLAIMER}


@router.get("/limits")
def limits(c: dict = Depends(caller)):
    apikeys.record(c["tenant"]["id"], "graph")
    return {"limits": reprice.public_limits()}


@router.get("/graph/node/{nid}")
def node(nid: str, hops: int = 1, c: dict = Depends(caller)):
    apikeys.record(c["tenant"]["id"], "graph")
    return publishing.hood(R.graph, nid, max(1, min(hops, 3 if c["policy"]["detail"] == "full" else 1)), public=True)


@router.get("/provenance")
def prov(c: dict = Depends(caller)):
    out = provenance.build(R.graph.nodes, R.graph.edges, fleet.list_(), ledger.board(200), public=True)
    out["world"] = {"mode": sim.mode(R.cfg)}
    apikeys.record(c["tenant"]["id"], "graph")
    return out


class Ask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str


_LADDER = None


def ladder() -> rungs.Router:
    """The substrate ladder, built once from the environment: the graph rung, RUNG_SERVERS, then the configured model on top."""
    global _LADDER
    if _LADDER is None:
        _LADDER = rungs.from_env(R)
    return _LADDER


def _public(tried: list) -> list:
    """What a tenant sees of the rungs below the one that answered: declined, a failed check, or unavailable; never a server's address or error."""
    return [{"rung": t["rung"], "why": "unavailable" if str(t.get("why", "")).startswith("error") else t.get("why", "")} for t in tried]


@router.post("/ask")
async def ask(a: Ask, c: dict = Depends(caller)):
    q = a.question.strip()
    if not q or len(q) > 1000:
        raise HTTPException(400, "question must be 1–1000 characters")
    pol = c["policy"]
    ctx = rungs.Context(R.graph, reading=pol["reading"], reader=READER[pol["reading"]], persona=c["persona"], require_cite=pol["reading"] == "academic")
    try:
        res = await ladder().answer(q, ctx)            # the cheapest rung that passes answers, and is the one metered
    except rungs.NoRung as ex:
        raise HTTPException(503, "no rung could answer: " + ("; ".join(f"{t['rung']}: {t['why']}" for t in _public(ex.tried)) or "none is available"))
    apikeys.record(c["tenant"]["id"], res["rung"])
    out = {"persona": c["persona"], "answer": res["answer"][:700 if pol["reading"] == "child" else 2400], "rung": res["rung"], "tried": _public(res["tried"]), "ms": res["ms"], "disclaimer": DISCLAIMER}
    if res.get("unchecked"):
        out["unchecked"] = res["unchecked"]           # the top rung's answer stood although it failed this check
    return out


@router.get("/usage")
def usage(c: dict = Depends(caller)):
    mine = next((t for t in apikeys.sheet()["tenants"] if t["id"] == c["tenant"]["id"]), None)
    return {"tenant": c["tenant"]["name"], "plan": c["tenant"]["plan"], "usage": mine}
