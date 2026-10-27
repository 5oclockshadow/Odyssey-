"""Load the whole repository into the brain: files, functions and classes, imports, routes, tests, pages and what they load and call, compose
services, Dockerfiles, configs and data. TESTER's own source and tools go in the same way, so it reads itself like everything else.
Re-reading a changed file keeps every node that still exists, with its weight and its edges; only what disappeared is forgotten."""
import ast
import json
import os
import posixpath
import re
from pathlib import Path

import yaml

VERSION = 1
KINDS = {".py": "python", ".js": "js", ".mjs": "js", ".html": "page", ".yaml": "config", ".yml": "config", ".toml": "config", ".conf": "config",
         ".json": "data", ".jsonl": "data", ".csv": "data", ".md": "doc", ".sh": "shell", ".css": "style"}
EXTERNAL_RX = re.compile(r"^(?:[a-z][a-z0-9+.\-]*:|//|#|/)", re.I)    # any scheme (http:, about:, data:, blob:…), protocol-relative, fragment or server-absolute
SRC_RX = re.compile(r"""<(?:script|img|iframe|source)\b[^>]*?\ssrc=["']([^"'{}<>]+)["']""", re.I)
HREF_RX = re.compile(r"""<link\b[^>]*?\shref=["']([^"'{}<>]+)["']""", re.I)
XIMP_RX = re.compile(r"""<x-import\b[^>]*?\sfrom=["']([^"'{}<>]+)["']""", re.I)
DCIMP_RX = re.compile(r"""<dc-import\b[^>]*?\sname=["']([^"'{}<>]+)["']""", re.I)
TITLE_RX = re.compile(r"<title>([^<]{1,140})</title>", re.I)
JSFN_RX = re.compile(r"^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^[ \t]*window\.([A-Za-z_$][\w$]*)\s*=", re.M)
DATA_RX = re.compile(r"^[\w\-./]{1,80}\.(?:jsonl?|ya?ml|csv|db|sqlite)$")
ENV_RX = re.compile(r"\$\{([A-Z0-9_]+)(:?[-?][^}]*)?\}")
HTTP = ("get", "post", "put", "delete", "patch")


def route_rx(prefixes):
    return re.compile(r"""['"`](/(?:%s)/[A-Za-z0-9_\-/{}.]*)""" % "|".join(map(re.escape, prefixes)))


def kind_of(rel: str):
    name = rel.rsplit("/", 1)[-1]
    if name.endswith(".dc.html"):
        return "page"
    if name == "Dockerfile" or name.startswith("Dockerfile."):
        return "docker"
    if name.startswith("docker-compose") and name.endswith((".yml", ".yaml")):
        return "compose"
    if name.startswith("requirements") and name.endswith(".txt"):
        return "deps"
    if name == ".env.example":
        return "env"
    return KINDS.get(posixpath.splitext(name)[1].lower())


def app_of(rel: str) -> str:
    parts = rel.split("/")
    if parts[0] == "apps" and len(parts) > 2:
        return "apps/" + parts[1]
    return parts[0] if len(parts) > 1 else "root"


def walk(root: Path, skip):
    """Every file TESTER reads: (relative path, path, kind, stat). Skipped folders are never entered."""
    skip = set(skip or [])
    for dirpath, dirnames, filenames in os.walk(root):
        rd = Path(dirpath).relative_to(root).as_posix()
        rd = "" if rd == "." else rd
        dirnames[:] = sorted(d for d in dirnames if d not in skip and f"{rd}/{d}".lstrip("/") not in skip)
        for f in sorted(filenames):
            rel = f"{rd}/{f}".lstrip("/")
            k = kind_of(rel)
            if not k or f in skip:
                continue
            p = Path(dirpath) / f
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_size <= 1_500_000:
                yield rel, p, k, st


def ingest(b, root, cfg: dict, only=None) -> dict:
    """Full read when only is None; otherwise only those paths (changed, new or deleted). Returns {changed, removed}."""
    root = Path(root)
    rrx = route_rx(cfg.get("route_prefixes") or ["owner", "public", "auth", "v1", "tester"])
    seen, changed = set(), []
    for rel, p, k, st in walk(root, cfg.get("skip")):
        seen.add(rel)
        if only is not None and rel not in only:
            continue
        fid = "file:" + rel
        cur = b.nodes.get(fid)
        if cur and cur.get("mtime") == st.st_mtime and cur.get("size") == st.st_size and cur.get("v") == VERSION:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        old = {i for i, n in list(b.nodes.items()) if n.get("src") == rel and i != fid}
        b.drop_edges(lambda e, rel=rel: e.get("src") == rel)
        app = app_of(rel)
        b.node(fid, "file", rel, kind=k, path=rel, app=app, lines=text.count("\n") + 1, size=st.st_size, mtime=st.st_mtime, v=VERSION, src=rel, refs={}, syntax="")
        b.node("app:" + app, "app", app)
        b.link("part_of", fid, "app:" + app, src=rel, w=0.4)
        made = PARSE.get(k, lambda *a: set())(b, rel, text, rrx) or set()
        b.drop_nodes(old - made)
        changed.append(rel)
    removed = []
    for n in [n for n in list(b.nodes.values()) if n["type"] == "file" and n["path"] not in seen and (only is None or n["path"] in only)]:
        rel = n["path"]
        b.drop_edges(lambda e, rel=rel: e.get("src") == rel)
        b.drop_nodes([i for i, x in list(b.nodes.items()) if x.get("src") == rel])
        removed.append(rel)
    if changed or removed:
        resolve(b)
    return {"changed": changed, "removed": removed}


def parse_python(b, rel, text, rrx):
    fid, made, refs = "file:" + rel, set(), {"imports": [], "data": []}
    try:
        tree = ast.parse(text)
    except SyntaxError as e:
        b.nodes[fid]["syntax"] = f"{e.msg} (line {e.lineno})"
        return made
    prefix = ""
    for x in ast.walk(tree):
        if isinstance(x, ast.Call) and (getattr(x.func, "id", None) or getattr(x.func, "attr", None)) == "APIRouter":
            for kw in x.keywords:
                if kw.arg == "prefix" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    prefix = kw.value.value
        elif isinstance(x, ast.Constant) and isinstance(x.value, str) and DATA_RX.match(x.value):
            refs["data"].append(x.value)
    test_file = rel.rsplit("/", 1)[-1].startswith("test_")
    for n in tree.body:
        if isinstance(n, ast.Import):
            refs["imports"] += [a.name.split(".")[0] for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            if n.level and not n.module:
                refs["imports"] += [a.name for a in n.names]
            elif n.module:
                refs["imports"].append(n.module.split(".")[0])
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            is_test = test_file and n.name.startswith("test_") and not isinstance(n, ast.ClassDef)
            nid = ("test:" if is_test else "code:") + f"{rel}::{n.name}"
            attrs = dict(file=rel, line=n.lineno, end=getattr(n, "end_lineno", None) or n.lineno, doc=(ast.get_docstring(n) or "")[:240], src=rel)
            if is_test:
                attrs["uses"] = sorted({f"{x.value.id}.{x.attr}" for x in ast.walk(n) if isinstance(x, ast.Attribute) and isinstance(x.value, ast.Name)})[:120]
            b.node(nid, "test" if is_test else "code", n.name, **attrs)
            made.add(nid)
            b.link("defined_in", nid, fid, src=rel, w=0.7)
            for d in getattr(n, "decorator_list", []):
                if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in HTTP and d.args and isinstance(d.args[0], ast.Constant) and isinstance(d.args[0].value, str):
                    path = (prefix if getattr(d.func.value, "id", "") == "router" else "") + d.args[0].value
                    m = d.func.attr.upper()
                    rid = f"route:{rel}::{m} {path}"
                    b.node(rid, "route", f"{m} {path}", method=m, path=path, file=rel, line=n.lineno, src=rel)
                    made.add(rid)
                    b.link("handles", rid, nid, src=rel, w=0.8)
    b.nodes[fid]["refs"] = {k: sorted(set(v)) for k, v in refs.items()}
    return made


def parse_js(b, rel, text, rrx):
    fid, made = "file:" + rel, set()
    for m in JSFN_RX.finditer(text):
        nid = f"code:{rel}::{m.group(1) or m.group(2)}"
        if nid in made:
            continue
        line = text.count("\n", 0, m.start()) + 1
        b.node(nid, "code", m.group(1) or m.group(2), file=rel, line=line, end=line, src=rel)
        made.add(nid)
        b.link("defined_in", nid, fid, src=rel, w=0.6)
    b.nodes[fid]["refs"] = {"calls": sorted(set(rrx.findall(text)))}
    return made


def parse_page(b, rel, text, rrx):
    fid, d, loads = "file:" + rel, posixpath.dirname(rel), []
    for rx in (SRC_RX, HREF_RX, XIMP_RX):
        for u in rx.findall(text):
            u = u.split("?")[0].split("#")[0].strip()
            if u and not EXTERNAL_RX.match(u):
                loads.append(posixpath.normpath(posixpath.join(d, u)))
    loads += [posixpath.normpath(posixpath.join(d, name + ".dc.html")) for name in DCIMP_RX.findall(text)]
    t = TITLE_RX.search(text)
    b.nodes[fid].update(title=t.group(1).strip() if t else "", dc="<x-dc>" in text)
    b.nodes[fid]["refs"] = {"loads": sorted(set(loads)), "calls": sorted(set(rrx.findall(text)))}
    return set()


def parse_compose(b, rel, text, rrx):
    fid, made, d = "file:" + rel, set(), posixpath.dirname(rel)
    try:
        doc = yaml.safe_load(text) or {}
    except yaml.YAMLError as e:
        b.nodes[fid]["syntax"] = str(e).splitlines()[0][:300]
        return made
    svcs = doc.get("services") if isinstance(doc, dict) else None
    builds = []
    for name, s in (svcs or {}).items():
        if not isinstance(s, dict):
            continue
        sid = "service:" + name
        b.node(sid, "service", name, image=s.get("image", ""), file=rel, src=rel)
        made.add(sid)
        b.link("defined_in", sid, fid, src=rel, w=0.6)
        bd = s.get("build")
        if bd:
            ctx = bd if isinstance(bd, str) else bd.get("context", ".")
            df = "Dockerfile" if isinstance(bd, str) else bd.get("dockerfile", "Dockerfile")
            builds.append({"service": name, "context": posixpath.normpath(posixpath.join(d, ctx)), "dockerfile": posixpath.normpath(posixpath.join(d, ctx, df))})
        for v in s.get("volumes") or []:
            src = (v if isinstance(v, str) else (v or {}).get("source", "")).split(":")[0]
            if src and not src.startswith((".", "/", "~", "$")):
                vid = "data:volume:" + src
                b.node(vid, "data", "volume " + src, src=rel)
                made.add(vid)
                b.link("mounts", sid, vid, src=rel, w=0.5)
    for name, s in (svcs or {}).items():
        deps = (s or {}).get("depends_on") or {} if isinstance(s, dict) else {}
        for dep in (deps if isinstance(deps, list) else list(deps)):
            b.link("depends_on", "service:" + name, "service:" + dep, src=rel, w=0.5)
    b.nodes[fid]["refs"] = {"builds": builds, "env": sorted({m.group(1) for m in ENV_RX.finditer(text) if not m.group(2)})}
    return made


def parse_docker(b, rel, text, rrx):
    copies = []
    for line in re.findall(r"^\s*(?:COPY|ADD)\s+(.+)$", text, re.M | re.I):
        line = line.strip()
        if "--from=" in line:
            continue
        try:
            toks = json.loads(line) if line.startswith("[") else line.split()
        except ValueError:
            toks = line.split()
        toks = [t for t in toks if not t.startswith("--")]
        copies += toks[:-1]
    b.nodes["file:" + rel]["refs"] = {"copies": copies}
    return set()


def parse_config(b, rel, text, rrx):
    made = set()
    if not rel.endswith((".yaml", ".yml")):
        return made
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as e:
        b.nodes["file:" + rel]["syntax"] = str(e).splitlines()[0][:300]
        return made
    tools = doc.get("agent", {}).get("tools") if isinstance(doc, dict) and isinstance(doc.get("agent"), dict) else None
    if isinstance(tools, list):                                   # the engine's agent and its tools are part of the same graph
        b.node("agent:sextant", "agent", "SEXTANT", doc="The engine's agent: one Signature, one graph, the loops.")
        for t in (t for t in tools if isinstance(t, str)):
            tid = "tool:engine." + t
            b.node(tid, "tool", t, owner="SEXTANT", src=rel)
            made.add(tid)
            b.link("uses", "agent:sextant", tid, src=rel, w=0.6)
        b.nodes["file:" + rel]["refs"] = {"tools": [t for t in tools if isinstance(t, str)]}
    return made


def parse_data(b, rel, text, rrx):
    fid = "file:" + rel
    try:
        if rel.endswith(".json"):
            json.loads(text)
        elif rel.endswith(".jsonl"):
            for i, line in enumerate(text.splitlines()[:2000]):
                if line.strip():
                    try:
                        json.loads(line)
                    except ValueError as e:
                        raise ValueError(f"line {i + 1}: {e}")
    except ValueError as e:
        b.nodes[fid]["syntax"] = str(e)[:300]
    return set()


def parse_env(b, rel, text, rrx):
    b.nodes["file:" + rel]["keys"] = sorted({ln.split("=", 1)[0].strip() for ln in text.splitlines() if "=" in ln and not ln.lstrip().startswith("#")})
    return set()


def parse_deps(b, rel, text, rrx):
    b.nodes["file:" + rel]["packages"] = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
    return set()


PARSE = {"python": parse_python, "js": parse_js, "page": parse_page, "compose": parse_compose, "docker": parse_docker, "config": parse_config,
         "data": parse_data, "env": parse_env, "deps": parse_deps}


def match_route(u: str, routes) -> list:
    """The test the engine's suite uses for 'every path a page calls is a real route', on the graph instead of the app."""
    us = re.sub(r"\{[^}]+\}", "*", u).rstrip("/").split("/")
    out = []
    for _, path, rid in routes:
        rs = re.sub(r"\{[^}]+\}", "*", path).split("/")
        if len(rs) in (len(us), len(us) + 1) and all(a in ("*", c) for a, c in zip(rs, us)):
            out.append(rid)
    return out


def resolve(b):
    """Second pass, once every file is known: imports, loads, calls to routes, data, builds, tests to the code they test, tools to their code."""
    with b._lock:
        files = {n["path"]: n for n in b.nodes.values() if n["type"] == "file"}
        routes = [(n["method"], n["path"], i) for i, n in b.nodes.items() if n["type"] == "route"]
        tests = [dict(n) for n in b.nodes.values() if n["type"] == "test"]
        etools = [i for i in b.nodes if i.startswith("tool:engine.")]
        code_by_label = {}
        for i, n in b.nodes.items():
            if n["type"] == "code" and str(n.get("file", "")).startswith("apps/engine/"):
                code_by_label.setdefault(n["label"], i)
    sib = lambda d, m: posixpath.join(d, m + ".py") if d else m + ".py"
    for rel, n in files.items():
        refs, fid, d = n.get("refs") or {}, "file:" + rel, posixpath.dirname(rel)
        for m in refs.get("imports", []):
            if sib(d, m) in files and sib(d, m) != rel:
                b.link("imports", fid, "file:" + sib(d, m), src=rel, w=0.6)
        for t in refs.get("loads", []):
            if t in files:
                b.link("loads", fid, "file:" + t, src=rel, w=0.6)
        for r in refs.get("calls", []):
            for rid in match_route(r, routes):
                b.link("calls", fid, rid, src=rel, w=0.6)
        for x in refs.get("data", []):
            did = "data:" + posixpath.basename(x)
            if did not in b.nodes:
                b.node(did, "data", posixpath.basename(x))
            b.link("uses", fid, did, src=rel, w=0.4)
        for bd in refs.get("builds", []):
            if bd["dockerfile"] in files:
                b.link("builds", "service:" + bd["service"], "file:" + bd["dockerfile"], src=rel, w=0.6)
            ctx_app = "app:" + app_of(bd["context"] + "/x")
            if ctx_app in b.nodes:
                b.link("runs", "service:" + bd["service"], ctx_app, src=rel, w=0.5)
        if refs.get("tools"):
            for tid in etools:
                cid = code_by_label.get(tid[len("tool:engine."):])
                if cid:
                    b.link("implemented_by", tid, cid, src=rel, w=0.7)
    for t in tests:
        tf = t["file"]
        d, imported = posixpath.dirname(tf), (files.get(tf, {}).get("refs") or {}).get("imports", [])
        for m in imported:
            if sib(d, m) in files:
                b.link("tests", t["id"], "file:" + sib(d, m), src=tf, w=0.5)
        for u in t.get("uses", []):
            mod, _, attr = u.partition(".")
            if mod in imported and f"code:{sib(d, mod)}::{attr}" in b.nodes:
                b.link("tests", t["id"], f"code:{sib(d, mod)}::{attr}", src=tf, w=0.6)


def selfmodel(b, cfg: dict, tools, checks=()):
    """TESTER's own node. It is this graph: its tools are tied to the functions that do them, its source is a part of the repository it reads,
    its memory is the file this graph is saved in, and the checks it runs are nodes it can reason about."""
    b.node("agent:tester", "agent", "TESTER", core=True, w=1.0, doc="One agent that is one graph: its agent, brain, self, data, code and tools are the nodes of this graph.")
    b.node("data:tester/graph.json", "data", "graph.json · TESTER's brain, this graph", core=True, w=1.0)
    b.link("remembers_in", "agent:tester", "data:tester/graph.json", w=1.0, core=True)
    for target, rel in (("app:apps/tester", "is"), ("service:tester", "runs_as"), ("agent:sextant", "tests")):
        if target in b.nodes:
            b.link(rel, "agent:tester", target, w=1.0, core=True)
    for name, file, doc in tools:
        tid = "tool:" + name
        b.node(tid, "tool", name, doc=(doc or "")[:240], owner="TESTER", core=True, w=0.9)
        b.link("uses", "agent:tester", tid, w=0.9, core=True)
        if f"code:{file}::{name}" in b.nodes:
            b.link("implemented_by", tid, f"code:{file}::{name}", w=0.9, core=True)
    for c in checks:
        b.node("check:" + c, "check", c, core=True, w=0.8)
        b.link("runs", "agent:tester", "check:" + c, w=0.8, core=True)
