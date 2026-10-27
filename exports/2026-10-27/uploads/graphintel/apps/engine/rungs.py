"""The substrate ladder as code. A rung answers a question or declines; the Router asks the cheapest rung first and keeps the first
answer that passes the checks, then names the rung so the call is metered at that rung's price (apikeys.RUNG_PRICE). The ladder:
graph (no model: lookups answered from the published graph), then any OpenAI-compatible server named in RUNG_SERVERS
(name=url#model, comma-separated; names from LADDER), then the configured model at the top (RUNG_TOP names its rung). A rung that errors
rests for COOLDOWN seconds. Serving keeps the top as the floor: when nothing below passed, its answer stands, marked with what it failed.
The thesis in one module: a call costs what the smallest rung that passes costs."""
import asyncio
import json
import logging
import os
import re
import time
import urllib.request

LADDER = ("graph", "lstm", "tiny", "1-3b", "8b", "30b")
COOLDOWN = 60.0
REFUSALS = re.compile(r"\b(as an ai|i cannot help|i can't help|i do not know|i don't know|no information)\b", re.I)
LOOKUP = re.compile(r"^(what|which|who|where|when|define|describe|show|list|is|does|are|do)\b", re.I)
log = logging.getLogger("rungs")


class NoRung(Exception):
    """Every rung declined or failed; .tried says what each one said."""

    def __init__(self, tried):
        self.tried = list(tried)
        super().__init__("; ".join(f"{t['rung']}: {t['why']}" for t in self.tried) or "no rung available")


class Context:
    def __init__(self, graph=None, reading="plain", reader="", persona="", require_cite=False, k=60):
        self.graph, self.reading, self.reader, self.persona, self.require_cite, self.k = graph, reading, reader, persona, require_cite, k
        self._pub = None

    def public(self) -> dict:
        """The published slice, parsed once per call."""
        if self._pub is None:
            try:
                raw = self.graph.slice(self.k, public=True) if self.graph is not None else "{}"
                self._pub = json.loads(raw) if isinstance(raw, str) else dict(raw)
            except Exception:
                self._pub = {}
        return self._pub


def passes(answer, q: str, ctx: Context):
    if not isinstance(answer, str) or len(answer.strip()) < 20:
        return False, "too short"
    if REFUSALS.search(answer):
        return False, "refused or did not know"
    if ctx.require_cite:
        ids = {n.get("id") for n in ctx.public().get("nodes", []) if n.get("id")}
        if not any(i in answer for i in ids):
            return False, "cites no node id"
    return True, ""


class GraphRung:
    """No model. Answers a lookup that names a published node from the slice itself; declines anything else."""
    name = "graph"

    def match(self, q: str, pub: dict) -> list:
        ql, hits = q.lower(), []
        for n in pub.get("nodes", []):
            lab = str(n.get("label", "")).lower()
            if (n.get("id") and str(n["id"]).lower() in ql) or (len(lab) >= 12 and lab[:40] in ql):
                hits.append(n)
        return hits[:3]

    def answer(self, q: str, ctx: Context):
        pub = ctx.public()
        hits = self.match(q, pub)
        if not hits or not (LOOKUP.match(q.strip()) or len(q.split()) <= 14):
            return None
        by = {n.get("id"): n for n in pub.get("nodes", []) if n.get("id")}
        out = []
        for n in hits:
            line = f"{n.get('id')} ({n.get('type', 'node')}): {n.get('label', '')}"
            if n.get("falsifier"):
                line += f" Refuted if: {n['falsifier']}."
            near = []
            for e in pub.get("edges", []):
                mem = e.get("members") or []
                if n.get("id") in mem:
                    near += [by[m].get("label", m) for m in mem if m != n.get("id") and m in by]
            if near:
                line += " Linked to: " + "; ".join(dict.fromkeys(near[:6])) + "."
            out.append(line)
        return "From the published graph, no model. " + " ".join(out)


class HttpRung:
    """Any OpenAI-compatible server (vLLM, llama.cpp, the small/fast container, an LSTM server). Uses the network; tests never build one."""

    def __init__(self, name: str, url: str, model: str, key: str = "", timeout: float = 30.0):
        if name not in LADDER:
            raise ValueError(f"rung name must be one of {LADDER}")
        self.name, self.url, self.model, self.key, self.timeout = name, url.rstrip("/"), model, key, timeout

    def answer(self, q: str, ctx: Context):
        system = (f"You answer for The Threshold Institute, as an agent, for {ctx.reader or 'a general reader'}. Use only the published graph "
                  "below; say plainly where it is silent. Published graph: " + json.dumps(ctx.public())[:6000])
        body = {"model": self.model, "temperature": 0, "max_tokens": 600,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": q}]}
        head = {"content-type": "application/json"}
        if self.key:
            head["authorization"] = "Bearer " + self.key
        req = urllib.request.Request(self.url + "/v1/chat/completions", data=json.dumps(body).encode(), headers=head)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())["choices"][0]["message"]["content"].strip()


class ModelRung:
    """The top of the ladder: a public round on the configured model through round.round."""

    def __init__(self, module, name="30b"):
        self.module, self.name = module, name

    async def answer(self, q: str, ctx: Context):
        r = await self.module.round(f"[reader: {ctx.reader}]\n{q}", "chat", public=True)
        return getattr(r, "answer", None)


class Router:
    def __init__(self, rungs, cooldown=COOLDOWN, floor=False):
        bad = [r.name for r in rungs if r.name not in LADDER]
        if bad:
            raise ValueError(f"unknown rungs {bad}; the ladder is {LADDER}")
        self.rungs = sorted(rungs, key=lambda r: LADDER.index(r.name))
        self.cooldown, self.rest, self.floor = cooldown, {}, floor

    def available(self):
        now = time.time()
        return [r for r in self.rungs if self.rest.get(r.name, 0) <= now]

    async def answer(self, q: str, ctx: Context) -> dict:
        """The cheapest answer that passes the checks. floor=True: the top of the ladder answers anyway when nothing below it passed, and
        `unchecked` says which check it failed (an honest 'the published graph is silent on this' from the top model is still the answer)."""
        tried, top = [], self.rungs[-1] if self.rungs else None
        for r in self.available():
            t0 = time.time()
            try:
                a = await r.answer(q, ctx) if asyncio.iscoroutinefunction(r.answer) else await asyncio.to_thread(r.answer, q, ctx)
            except Exception as ex:
                self.rest[r.name] = time.time() + self.cooldown
                log.warning("rung %s failed; resting %.0f s: %s", r.name, self.cooldown, ex)
                tried.append({"rung": r.name, "why": "error: " + str(ex)[:120]})
                continue
            if a is None:
                tried.append({"rung": r.name, "why": "declined"})
                continue
            ok, why = passes(a, q, ctx)
            ms = int((time.time() - t0) * 1000)
            if ok:
                return {"rung": r.name, "answer": a, "ms": ms, "tried": tried}
            if self.floor and r is top and isinstance(a, str) and a.strip():
                return {"rung": r.name, "answer": a, "ms": ms, "tried": tried, "unchecked": why}
            tried.append({"rung": r.name, "why": why})
        raise NoRung(tried)


def parse_servers(spec: str) -> list:
    """RUNG_SERVERS=lstm=http://lstm:8000#lstm-50m,8b=http://small-fast:8000#qwen2.5-7b-instruct"""
    out = []
    for part in [p.strip() for p in (spec or "").split(",") if p.strip()]:
        name, _, rest = part.partition("=")
        url, _, model = rest.partition("#")
        if not (name and url and model):
            raise ValueError(f"bad RUNG_SERVERS entry {part!r}; want name=url#model")
        out.append(HttpRung(name.strip(), url.strip(), model.strip(), os.environ.get("RUNG_KEY", "")))
    return out


def from_env(module, graph_rung=True) -> Router:
    """The serving ladder: the graph rung, RUNG_SERVERS, then the configured model as RUNG_TOP (a rung name; on = 30b; off = no model), the floor."""
    rungs = ([GraphRung()] if graph_rung else []) + parse_servers(os.environ.get("RUNG_SERVERS", ""))
    top = (os.environ.get("RUNG_TOP") or "on").strip()
    if top != "off":
        rungs.append(ModelRung(module, "30b" if top == "on" else top))
    return Router(rungs, floor=True)
