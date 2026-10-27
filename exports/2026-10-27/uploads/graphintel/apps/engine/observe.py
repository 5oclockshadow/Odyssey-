"""Everything the engine does becomes graph. Spans go to Phoenix and into the graph; every log line becomes a log node tied
to the code that wrote it; every signed function is a code node whose calls are spans; any error anywhere is an incident."""
import functools
import hashlib
import inspect
import logging
import os
import sys
import traceback
from pathlib import Path

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanProcessor
from opentelemetry.trace import StatusCode

HERE = Path(__file__).resolve().parent
CFG: dict = {}
_GRAPH = None
_ON_INCIDENT = None
_PROVIDER = None


def tracer():
    return trace.get_tracer("threshold")


def _sid(ctx):
    return f"span:{ctx.span_id:016x}"


def _stub(sid):
    return {"id": sid, "type": "span", "label": sid, "tel": True, "stub": True}


class GraphSpanProcessor(SpanProcessor):
    """Every finished span is a node; child_of, in_trace and span_of edges tie it to its parent, its trace and its code."""

    def on_start(self, span, parent_context=None):
        pass

    def on_end(self, span: ReadableSpan):
        if _GRAPH is None:
            return
        ctx, a = span.get_span_context(), dict(span.attributes or {})
        sid, tid, code = _sid(ctx), f"trace:{ctx.trace_id:032x}", a.get("code.id")
        ms = (span.end_time - span.start_time) / 1e6 if span.end_time and span.start_time else 0
        nodes = [{"id": tid, "type": "trace", "label": tid[:22], "tel": True},
                 {"id": sid, "type": "span", "label": span.name, "tel": True, "ts": (span.start_time or 0) / 1e9, "ms": round(ms, 1),
                  "status": span.status.status_code.name, "kind": a.get("round.kind") or a.get("openinference.span.kind")}]
        edges = [{"id": f"{sid}>trace", "relation": "in_trace", "members": [sid, tid]}]
        if span.parent:
            nodes.append(_stub(_sid(span.parent)))
            edges.append({"id": f"{sid}>parent", "relation": "child_of", "members": [sid, _sid(span.parent)]})
        if code:
            nodes.append({"id": code, "type": "code", "label": code.split(":", 1)[1], "file": a.get("code.filepath"), "line": a.get("code.lineno")})
            edges.append({"id": f"{sid}>code", "relation": "span_of", "members": [sid, code]})
        _GRAPH.observe(nodes, edges)
        if span.status.status_code == StatusCode.ERROR and _ON_INCIDENT:
            ev = next((e for e in reversed(list(span.events or [])) if e.name == "exception"), None)
            x = dict(ev.attributes) if ev else {}
            _ON_INCIDENT({"source": "span", "span": sid, "trace": tid, "code": code, "file": a.get("code.filepath"), "line": a.get("code.lineno"),
                          "type": x.get("exception.type", "error"), "message": x.get("exception.message", span.status.description or span.name),
                          "stack": x.get("exception.stacktrace", "")})

    def shutdown(self):
        pass

    def force_flush(self, timeout_millis=30000):
        return True


class GraphLogHandler(logging.Handler):
    """Every log record is a log node, logged_by the code node for module.function; ERROR becomes an incident."""

    QUIET = ("opentelemetry", "httpx", "httpcore", "urllib3", "docker", "LiteLLM", "litellm")

    def emit(self, record: logging.LogRecord):
        if _GRAPH is None or record.name.startswith(self.QUIET):
            return
        msg = record.getMessage()
        code = f"code:{record.module}.{record.funcName}"
        lid = f"log:{record.created:.3f}:{hashlib.sha1(msg.encode()).hexdigest()[:6]}"
        nodes = [{"id": lid, "type": "log", "label": msg[:120], "tel": True, "level": record.levelname, "ts": record.created},
                 {"id": code, "type": "code", "label": f"{record.module}.{record.funcName}", "file": record.pathname, "line": record.lineno}]
        edges = [{"id": f"{lid}>code", "relation": "logged_by", "members": [lid, code]}]
        ctx = trace.get_current_span().get_span_context()
        if ctx.is_valid:
            nodes.append(_stub(_sid(ctx)))
            edges.append({"id": f"{lid}>span", "relation": "in_span", "members": [lid, _sid(ctx)]})
        _GRAPH.observe(nodes, edges)
        if record.levelno >= logging.ERROR and _ON_INCIDENT:
            exc = record.exc_info
            _ON_INCIDENT({"source": "log", "code": code, "file": record.pathname, "line": record.lineno, "span": _sid(ctx) if ctx.is_valid else None,
                          "type": exc[0].__name__ if exc and exc[0] else "error", "message": msg,
                          "stack": "".join(traceback.format_exception(*exc)) if exc and exc[0] else ""})


def frame_of(exc) -> dict:
    """The innermost frame of an exception that lies in the Institute's own code → its code node, file and line."""
    tb, hit = getattr(exc, "__traceback__", None), {}
    while tb is not None:
        f = tb.tb_frame
        if f.f_code.co_filename.startswith(str(HERE)):
            hit = {"code": f"code:{Path(f.f_code.co_filename).stem}.{f.f_code.co_name}", "file": f.f_code.co_filename, "line": tb.tb_lineno}
        tb = tb.tb_next
    return hit


def report(exc: BaseException, source="exception", **extra):
    """Turn any exception into an incident, from anywhere in the process."""
    if _ON_INCIDENT:
        _ON_INCIDENT({"source": source, "type": type(exc).__name__, "message": str(exc)[:500],
                      "stack": "".join(traceback.format_exception(exc)), **frame_of(exc), **extra})


def asyncio_handler(loop, context):
    exc = context.get("exception")
    if exc:
        report(exc, "asyncio")
    loop.default_exception_handler(context)


def _excepthook(t, v, tb):
    report(v, "process")
    sys.__excepthook__(t, v, tb)


def event(name: str, data: dict | None = None, actor: str = "institute") -> str | None:
    """Anything that happens anywhere (a site visitor passing the exam, an app registering a user) becomes an event node tied to an actor."""
    if _GRAPH is None:
        return None
    import json
    import time
    eid = f"event:{time.time():.3f}:{hashlib.sha1((name + json.dumps(data or {}, sort_keys=True)).encode()).hexdigest()[:6]}"
    _GRAPH.observe([{"id": eid, "type": "event", "label": name[:80], "tel": True, "ts": time.time(), "data": data or {}}],
                   [{"id": f"{eid}>actor", "relation": "happened_to", "members": [eid, actor]}])
    return eid


def _fingerprint(a, k):
    return hashlib.sha1(repr((a, k))[:2000].encode()).hexdigest()[:12]


def signed(fn):
    """Runtime code signature. Every call is a span carrying module, file and line; the function is a code node in the graph,
    defined_in its file; an exception inside it is an incident the graph can trace back to this exact place."""
    qual = f"{fn.__module__}.{fn.__qualname__}"
    cid = f"code:{qual}"
    try:
        file, line = inspect.getsourcefile(fn) or "", inspect.getsourcelines(fn)[1]
    except (OSError, TypeError):
        file, line = "", 0
    attrs = {"code.id": cid, "code.function": fn.__qualname__, "code.namespace": fn.__module__, "code.filepath": file, "code.lineno": line}

    def ensure():
        if _GRAPH is not None and cid not in _GRAPH.nodes:
            fid = f"file:{Path(file).name or '?'}"
            _GRAPH.observe([{"id": cid, "type": "code", "label": qual, "file": file, "line": line},
                            {"id": fid, "type": "file", "label": Path(file).name or "?", "path": file}],
                           [{"id": f"{cid}>file", "relation": "defined_in", "members": [cid, fid]}])

    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def aw(*a, **k):
            ensure()
            with tracer().start_as_current_span(qual, attributes={**attrs, "code.args": _fingerprint(a, k)}):
                return await fn(*a, **k)
        aw._signed = True
        return aw

    @functools.wraps(fn)
    def w(*a, **k):
        ensure()
        with tracer().start_as_current_span(qual, attributes={**attrs, "code.args": _fingerprint(a, k)}):
            return fn(*a, **k)
    w._signed = True
    return w


def sign_module(mod):
    """Sign every public function a module defines, in place, so the whole module carries runtime signatures."""
    for name, obj in list(vars(mod).items()):
        if inspect.isfunction(obj) and obj.__module__ == mod.__name__ and not getattr(obj, "_signed", False) and not name.startswith("_"):
            setattr(mod, name, signed(obj))
    return mod


def install(cfg: dict, graph, on_incident):
    """Wire the graph, Phoenix, DSPy instrumentation, the log handler and the process-level hooks. Call once at startup."""
    global CFG, _GRAPH, _ON_INCIDENT, _PROVIDER
    CFG, _GRAPH, _ON_INCIDENT = cfg.get("observe", {}), graph, on_incident
    _PROVIDER = TracerProvider(resource=Resource.create({"service.name": CFG.get("service", "threshold-engine")}))
    _PROVIDER.add_span_processor(GraphSpanProcessor())
    endpoint = os.environ.get("PHOENIX_ENDPOINT") or CFG.get("phoenix")
    if endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        _PROVIDER.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint.rstrip("/") + "/v1/traces")))
    trace.set_tracer_provider(_PROVIDER)
    try:
        from openinference.instrumentation.dspy import DSPyInstrumentor
        DSPyInstrumentor().instrument(tracer_provider=_PROVIDER)          # every LM call and every ReAct step, as spans
    except Exception as ex:                                                 # the instrumentation is optional; the graph is not
        logging.getLogger("observe").warning("dspy instrumentation unavailable: %s", ex)
    h = GraphLogHandler()
    h.setLevel(getattr(logging, str(CFG.get("log_level", "INFO")).upper(), logging.INFO))
    root = logging.getLogger()
    root.addHandler(h)
    root.setLevel(min(root.level or logging.INFO, h.level))
    sys.excepthook = _excepthook
    return _PROVIDER
