"""Every check TESTER runs, and the plan that says which to run. A finding is {key, check, title, detail, severity, file, line, points}:
`points` are node ids in the brain, and the key is stable across runs so a finding keeps its history until it is fixed.
On a changed file the graph decides what to re-test: the file's own checks, the suites whose tests reach it, the pages that load it."""
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote

from ingest import match_route

CHECKS = ["py", "lint", "js", "templates", "refs", "routes", "compose", "config", "secrets", "pytest", "browser", "live"]
STATIC = ["py", "lint", "templates", "refs", "routes", "compose", "config", "secrets"]
LINT_ERRORS = {"UndefinedName", "UndefinedLocal", "UndefinedExport", "DuplicateArgument", "ReturnOutsideFunction", "YieldOutsideFunction", "ContinueOutsideLoop",
               "BreakOutsideLoop", "DefaultExceptNotLast", "TwoStarredExpressions", "TooManyExpressionsInStarredAssignment", "ForwardAnnotationSyntaxError",
               "PercentFormatInvalidFormat", "PercentFormatMixedPositionalAndNamed", "PercentFormatPositionalCountMismatch", "PercentFormatMissingArgument",
               "PercentFormatExpectedMapping", "PercentFormatExpectedSequence", "PercentFormatStarRequiresSequence", "StringDotFormatInvalidFormat",
               "StringDotFormatMissingArgument", "StringDotFormatMixingAutomatic", "IfTuple", "AssertTuple", "RaiseNotImplemented", "InvalidPrintSyntax"}
LINT_WARNINGS = {"RedefinedWhileUnused", "UnusedVariable", "ImportShadowedByLoopVar", "FStringMissingPlaceholders", "IsLiteral", "MultiValueRepeatedKeyLiteral",
                 "MultiValueRepeatedKeyVariable", "UnusedAnnotation"}
SECRET_RX = [("an Anthropic key", r"sk-ant-[A-Za-z0-9_\-]{20,}"), ("an OpenAI key", r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}"), ("an AWS key", r"\bAKIA[0-9A-Z]{16}\b"),
             ("a GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{30,}"), ("a Slack token", r"\bxox[baprs]-[A-Za-z0-9-]{10,}"), ("a private key", r"-----BEGIN [A-Z ]*PRIVATE KEY-----")]
HOLE_RX = re.compile(r"\{\{([^}]*[+*/!?()<>=|&%][^}]*)\}\}")
PAIRS = ["sc-if", "sc-for", "x-import", "dc-import", "helmet", "x-dc"]


def finding(check, title, detail="", file="", line=0, severity="error", points=(), ident=""):
    key = check + "-" + hashlib.sha1(f"{check}|{file}|{ident or title}".encode()).hexdigest()[:12]
    return {"key": key, "check": check, "title": str(title)[:240], "detail": str(detail)[:4000], "severity": severity, "file": file, "line": int(line or 0),
            "points": list(dict.fromkeys(list(points) + ([f"file:{file}"] if file else [])))}


def files_of(b, *kinds):
    with b._lock:
        return sorted(n["path"] for n in b.nodes.values() if n["type"] == "file" and n.get("kind") in kinds)


def locate(b, file, line):
    """The function, class or test a file:line falls in."""
    if not file or not line:
        return []
    with b._lock:
        best = None
        for n in b.nodes.values():
            if n["type"] in ("code", "test") and n.get("file") == file and n.get("line", 0) <= line:
                inside = n.get("end", n["line"]) >= line
                score = (inside, n["line"])
                if best is None or score > best[0]:
                    best = (score, n["id"])
        return [best[1]] if best and (best[0][0] or file.endswith((".js", ".mjs", ".html"))) else []


def glob_match(path: str, pattern: str) -> bool:
    """Path globs as people mean them: * and ? stay inside one folder, ** crosses any number of folders (none included)."""
    rx, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            rx, i = rx + "(?:.*/)?", i + 3
        elif pattern.startswith("**", i):
            rx, i = rx + ".*", i + 2
        elif pattern[i] == "*":
            rx, i = rx + "[^/]*", i + 1
        elif pattern[i] == "?":
            rx, i = rx + "[^/]", i + 1
        else:
            rx, i = rx + re.escape(pattern[i]), i + 1
    return re.fullmatch(rx, path) is not None


def pages_for(b, cfg):
    globs = (cfg.get("pages") or {}).get("globs") or ["**/*.html"]
    return [p for p in files_of(b, "page") if any(glob_match(p, g) for g in globs)]


JS_TYPES = {"", "text/javascript", "application/javascript", "module", "text/x-dc"}


def script_kind(attrs: str):
    """'script', 'module', or None for a block that is not JavaScript (JSON, templates, bundler manifests, Babel)."""
    if re.search(r"\ssrc\s*=", attrs, re.I):
        return None
    m = re.search(r"""\btype\s*=\s*["']?([^"'\s>]+)""", attrs, re.I)
    t = m.group(1).lower() if m else ""
    return None if t not in JS_TYPES else "module" if t == "module" else "script"


def repo_suites(b) -> list:
    """The hundred repos' suites, from the graph: every repos/<id> with tests/test_*.py is one. Nothing to list by hand as repos are packaged."""
    with b._lock:
        ids = list(b.nodes)
    out = {}
    for i in ids:
        m = re.match(r"^file:(repos/[^/]+)/tests/test_[^/]+\.py$", i)
        if m and m.group(1) not in out:
            out[m.group(1)] = {"id": "repo-" + m.group(1)[len("repos/"):], "dir": m.group(1), "repo": True}
    return [out[k] for k in sorted(out)]


def suites_of(b, cfg) -> list:
    """tester.yaml's suites, then every repo suite the graph holds that the file does not already list."""
    listed = list(cfg.get("suites") or [])
    dirs = {s["dir"].rstrip("/") for s in listed}
    return listed + ([s for s in repo_suites(b) if s["dir"] not in dirs] if b is not None else [])


def plan(b, cfg, changed=None, names=None) -> dict:
    """What to run. A full plan covers everything; for changed files the graph picks the checks, suites and pages they reach."""
    suites = suites_of(b, cfg)
    if changed is None:
        return {"full": True, "checks": set(names or CHECKS), "py": None, "js": None, "pages": None, "files": None, "suites": suites}
    p = {"full": False, "checks": {"refs", "routes", "secrets"}, "py": [], "js": [], "pages": [], "files": list(changed), "suites": []}
    adj = b.adjacency()
    wanted = set(pages_for(b, cfg))

    def suite_of(rel):
        for s in suites:
            if rel.startswith(s["dir"].rstrip("/") + "/") and s not in p["suites"]:
                p["suites"].append(s)

    for rel in changed:
        n = b.nodes.get("file:" + rel) or {}
        k = n.get("kind")
        if k == "python":
            p["py"].append(rel)
            p["checks"] |= {"py", "lint"}
            suite_of(rel)
            for e in adj.get("file:" + rel, []):                     # tests elsewhere that import this file
                if e["relation"] == "tests" and e["members"][1] == "file:" + rel:
                    suite_of(e["members"][0].split(":", 1)[1].split("::")[0])
        elif k == "js":
            p["js"].append(rel)
            p["checks"] |= {"js"}
            for e in adj.get("file:" + rel, []):                     # the pages that load it
                if e["relation"] == "loads" and e["members"][1] == "file:" + rel:
                    pg = e["members"][0][5:]
                    if pg in wanted and pg not in p["pages"]:
                        p["pages"].append(pg)
        elif k == "page":
            p["checks"] |= {"js", "templates"}
            if rel in wanted and rel not in p["pages"]:
                p["pages"].append(rel)
        elif k in ("compose", "docker", "env"):
            p["checks"].add("compose")
        elif k in ("config", "data", "deps"):
            p["checks"].add("config")
            suite_of(rel)
    if p["pages"]:
        p["checks"].add("browser")
    if p["suites"]:
        p["checks"].add("pytest")
    if names:
        p["checks"] &= set(names)
    return p


def covers(p, f) -> bool:
    """Would this plan have found f again? If so and it did not, f is resolved."""
    c, file = f.get("check"), f.get("file", "")
    if c not in p["checks"]:
        return False
    if p.get("full") or c in ("refs", "routes", "compose", "config"):
        return True
    if c in ("py", "lint"):
        return file in p["py"]
    if c == "js":
        return file in p["js"] or file in p["pages"]
    if c in ("browser", "templates"):
        return file in p["pages"]
    if c == "pytest":
        return any(file.startswith(s["dir"].rstrip("/") + "/") for s in p["suites"])
    if c == "secrets":
        return file in (p["files"] or [])
    return False


def run(p, b, work, cfg) -> tuple:
    """Run a plan in the working copy. Returns (findings, status by check)."""
    work = Path(work)
    found, status = [], {}
    pick = lambda key, *kinds: p[key] if p.get(key) is not None else files_of(b, *kinds)
    pages = p["pages"] if p.get("pages") is not None else pages_for(b, cfg)
    jobs = [("py", lambda: py_syntax(work, pick("py", "python"))),
            ("lint", lambda: lint(work, pick("py", "python"))),
            ("js", lambda: js_syntax(work, pick("js", "js"), p["pages"] if p.get("pages") is not None else files_of(b, "page"))),
            ("templates", lambda: templates(work, p["pages"] if p.get("pages") is not None else files_of(b, "page"))),
            ("refs", lambda: refs(b, work)),
            ("routes", lambda: routes(b, cfg)),
            ("compose", lambda: compose(b, work)),
            ("config", lambda: config(b)),
            ("secrets", lambda: secrets(work, p["files"] if p.get("files") is not None else files_of(b, "python", "js", "page", "config", "data", "env", "shell", "docker", "compose", "doc"))),
            ("pytest", lambda: pytest_suites(b, work, p["suites"])),
            ("browser", lambda: browser(b, work, cfg, pages)),
            ("live", lambda: live(b, cfg))]
    for name, fn in jobs:
        if name not in p["checks"]:
            continue
        t = time.time()
        try:
            out = fn()
        except Exception as ex:                                     # a broken check is itself a finding, never a crash
            out = [finding(name, f"The {name} check could not run: {ex}", repr(ex), severity="warn", ident="crash")]
        for f in out:
            f["points"] = list(dict.fromkeys(f["points"] + locate(b, f["file"], f["line"])))
        found += out
        status[name] = {"findings": len(out), "seconds": round(time.time() - t, 1)}
    return found, status


# — the checks —

class _Flakes:
    def __init__(self):
        self.msgs = []

    def unexpectedError(self, filename, msg):
        self.msgs.append(("UnexpectedError", 0, str(msg)))

    def syntaxError(self, filename, msg, lineno, offset, text):
        pass                                                         # the py check owns syntax errors

    def flake(self, m):
        self.msgs.append((type(m).__name__, m.lineno, m.message % m.message_args))


def lint(work, files):
    """pyflakes on every Python file: names used but never defined, broken format strings, misplaced returns are errors (they fail at
    run time, often on a path no test takes); shadowed definitions and unused variables are warnings. Unused imports are left alone."""
    try:
        from pyflakes import api
    except ImportError:
        return [finding("lint", "pyflakes is not installed here, so Python is not linted", severity="warn", ident="no-pyflakes")]
    out = []
    for rel in files:
        try:
            src = (work / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        r = _Flakes()
        api.check(src, rel, r)
        for kind, line, msg in r.msgs:
            sev = "error" if kind in LINT_ERRORS else "warn" if kind in LINT_WARNINGS else None
            if sev:
                text = src.splitlines()[line - 1].strip() if 0 < line <= src.count("\n") + 1 else ""
                out.append(finding("lint", f"{rel}:{line}: {msg}", f"{kind} at {rel}:{line}\n{text}", rel, line, severity=sev, ident=f"{kind}:{msg}"))
    return out


def py_syntax(work, files):
    out = []
    for rel in files:
        try:
            compile((work / rel).read_text(encoding="utf-8", errors="replace"), rel, "exec")
        except SyntaxError as e:
            out.append(finding("py", f"Python syntax error in {rel}: {e.msg}", f"{rel}:{e.lineno}: {e.msg}\n{(e.text or '').rstrip()}", rel, e.lineno, ident=e.msg))
        except (OSError, ValueError):
            continue
    return out


def _node_err(stderr):
    m = re.search(r":(\d+)\s*\n", stderr)
    msg = next((ln for ln in stderr.splitlines() if "Error" in ln), stderr.strip().splitlines()[-1] if stderr.strip() else "syntax error")
    return msg.strip(), int(m.group(1)) if m else 0


def js_syntax(work, js_files, page_files):
    node = shutil.which("node")
    if not node:
        return [finding("js", "Node is not installed here, so JavaScript is not checked", severity="warn", ident="no-node")]
    out = []
    for rel in js_files:
        r = subprocess.run([node, "--check", str(work / rel)], capture_output=True, text=True, timeout=30)
        if r.returncode:
            msg, line = _node_err(r.stderr)
            out.append(finding("js", f"JavaScript syntax error in {rel}: {msg}", r.stderr[-2000:], rel, line, ident=msg))
    with tempfile.TemporaryDirectory() as tmp:
        for rel in page_files:
            try:
                text = (work / rel).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for i, m in enumerate(re.finditer(r"<script\b([^>]*)>(.*?)</script>", text, re.S | re.I)):
                attrs, body = m.group(1), m.group(2)
                kind = script_kind(attrs)
                if kind is None or not body.strip():
                    continue
                f = Path(tmp) / f"s{i}.{'mjs' if kind == 'module' else 'js'}"
                f.write_text(body)
                r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True, timeout=30)
                if r.returncode:
                    msg, ln = _node_err(r.stderr)
                    line = text.count("\n", 0, m.start(2)) + ln
                    out.append(finding("js", f"Script syntax error in {rel}: {msg}", r.stderr[-2000:].replace(str(f), rel), rel, line, ident=f"{i}:{msg}"))
    return out


def templates(work, pages):
    out = []
    for rel in pages:
        try:
            text = (work / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "<x-dc>" not in text:
            continue
        tpl = re.sub(r"<script\b.*?</script>", "", text, flags=re.S | re.I)
        for tag in PAIRS:
            o, c = len(re.findall(rf"<{tag}[\s>]", tpl)), len(re.findall(rf"</{tag}>", tpl))
            if o != c:
                out.append(finding("templates", f"{rel}: {o} <{tag}> but {c} </{tag}>", "Every Design Component tag needs its explicit close tag.", rel, ident=tag))
        for m in re.finditer(r"componentDidUpdate\(\s*[\w$]*\s*,\s*([\w$]+)", text):
            out.append(finding("templates", f"{rel}: componentDidUpdate reads a second parameter ({m.group(1)}), which the Design Component runtime never passes",
                               "The runtime calls componentDidUpdate(prevProps) only, so the second parameter is undefined and reading it throws. Keep previous values on this instead.",
                               rel, text.count("\n", 0, m.start()) + 1, ident="didupdate"))
        for m in list(re.finditer(r"\]\s*,\s*,\s*\[", text))[:2]:
            out.append(finding("templates", f"{rel}: a double comma leaves a hole in an array", "findIndex and map see the hole as undefined; forEach skips it.", rel,
                               text.count("\n", 0, m.start()) + 1, ident="hole"))
        for m in list(HOLE_RX.finditer(tpl))[:3]:
            out.append(finding("templates", f"{rel}: a template hole holds an expression: {{{{{m.group(1).strip()[:60]}}}}}", "Holes are dotted lookups only; compute the value in renderVals().",
                               rel, text.count("\n", 0, text.find(m.group(0))) + 1, severity="warn", ident=m.group(1).strip()))
    return out


def refs(b, work):
    """Every file a page loads, a Dockerfile copies and a compose service builds from exists."""
    out = []
    with b._lock:
        files = [dict(n) for n in b.nodes.values() if n["type"] == "file"]
    ctx = {}
    for n in files:
        for bd in (n.get("refs") or {}).get("builds", []):
            ctx[bd["dockerfile"]] = bd["context"]
    for n in files:
        r, rel = n.get("refs") or {}, n["path"]
        for t in r.get("loads", []):
            if not (work / t).exists():
                out.append(finding("refs", f"{rel} loads {t}, which does not exist", f"{rel} references {t}", rel, ident=t))
        if r.get("copies") is not None and rel in ctx:                # a Dockerfile no compose service builds has a context only its builder knows
            base = ctx[rel]
            for s in r["copies"]:
                if (work / base / s).exists() or (any(ch in s for ch in "*?[") and any((work / base).glob(s))):
                    continue
                out.append(finding("refs", f"{rel} copies {s}, which is not in its build context ({base})", f"COPY {s} with context {base}", rel, ident=s))
        for bd in r.get("builds", []):
            if not (work / bd["dockerfile"]).exists():
                out.append(finding("refs", f"service {bd['service']} builds from {bd['dockerfile']}, which does not exist", f"{rel}: build {bd['context']}", rel,
                                   points=[f"service:{bd['service']}"], ident=bd["dockerfile"]))
    return out


def routes(b, cfg):
    """Every path a page or script calls is a route some server answers (the engine suite's check, for every app)."""
    planned = set(cfg.get("planned_routes") or [])
    with b._lock:
        rs = [(n["method"], n["path"], i) for i, n in b.nodes.items() if n["type"] == "route"]
        callers = [(n["path"], (n.get("refs") or {}).get("calls", [])) for n in b.nodes.values() if n["type"] == "file" and n.get("kind") in ("page", "js")]
    out = []
    for rel, calls in callers:
        for c in calls:
            if c.rstrip("/") not in planned and not match_route(c, rs):
                out.append(finding("routes", f"{rel} calls {c}, which no server answers", f"{rel} → {c}", rel, ident=c))
    return out


def compose(b, work):
    out = []
    with b._lock:
        env = next((n.get("keys", []) for n in b.nodes.values() if n["type"] == "file" and n.get("kind") == "env"), None)
        comps = [dict(n) for n in b.nodes.values() if n["type"] == "file" and n.get("kind") == "compose"]
    for n in comps:
        if n.get("syntax"):
            out.append(finding("compose", f"{n['path']} does not parse: {n['syntax']}", n["syntax"], n["path"], ident="parse"))
        for v in (n.get("refs") or {}).get("env", []):
            if env is not None and v not in env:
                out.append(finding("compose", f"{n['path']} needs ${{{v}}}, which .env.example does not list", f"{v} has no default in {n['path']} and is missing from .env.example", n["path"], ident=v))
    return out


def config(b):
    with b._lock:
        bad = [dict(n) for n in b.nodes.values() if n["type"] == "file" and n.get("kind") in ("config", "data", "page", "js") and n.get("syntax")]
    return [finding("config", f"{n['path']} does not parse: {n['syntax']}", n["syntax"], n["path"], ident="parse") for n in bad]


def secrets(work, files):
    out = []
    for rel in files:
        if rel.endswith(".env.example"):
            continue
        try:
            text = (work / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for what, rx in SECRET_RX:
            for m in re.finditer(rx, text):
                s = m.group(0)
                line = text.count("\n", 0, m.start()) + 1
                out.append(finding("secrets", f"{rel}:{line} looks like {what}", f"{s[:6]}…{'*' * 8} (masked). Rotate it, then remove it from the file and its history.", rel, line, ident=f"{what}:{line}"))
    return out


def pytest_suites(b, work, suites):
    out = []
    for s in suites:
        d = work / s["dir"]
        if not (d.exists() and (any(d.glob("test_*.py")) or any(d.glob("tests/test_*.py")))):
            continue
        tmp = Path(tempfile.mkdtemp(prefix="tester-"))
        xml = tmp / "junit.xml"
        env = {**os.environ, "THRESHOLD_STATE": str(tmp / "state"), "TESTER_STATE": str(tmp / "tstate"), "TESTER_LOOP": "off", "TESTER_LIVE": "off", "PYTHONDONTWRITEBYTECODE": "1"}
        if s.get("repo") or s["dir"].startswith("repos/"):          # a repo imports its siblings (anima-harness → seedgen), as build.py runs it
            sib = [str(p) for p in sorted((work / "repos").glob("*")) if p.is_dir()]
            env["PYTHONPATH"] = os.pathsep.join([str(d)] + sib + ([os.environ["PYTHONPATH"]] if os.environ.get("PYTHONPATH") else []))
        cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--tb=short", "-o", "junit_family=xunit1", f"--junitxml={xml}"] + list(s.get("tests") or [])
        try:
            r = subprocess.run(cmd, cwd=d, env=env, capture_output=True, text=True, timeout=s.get("timeout", 900))
            log = (r.stdout or "") + (r.stderr or "")
        except subprocess.TimeoutExpired:
            out.append(finding("pytest", f"{s['id']}: the tests did not finish in {s.get('timeout', 900)}s", "", s["dir"] + "/", ident="timeout"))
            shutil.rmtree(tmp, ignore_errors=True)
            continue
        if not xml.exists():
            out.append(finding("pytest", f"{s['id']}: pytest could not start", log[-3000:], s["dir"] + "/", ident="no-junit"))
        else:
            out += parse_junit(b, xml, s, work)
        shutil.rmtree(tmp, ignore_errors=True)
    return out


def parse_junit(b, xml, s, work):
    out, base = [], s["dir"].rstrip("/")
    for tc in ET.parse(xml).getroot().iter("testcase"):
        bad = tc.find("failure")
        bad = bad if bad is not None else tc.find("error")
        if bad is None:
            continue
        file = tc.get("file") or (tc.get("classname", "").replace(".", "/") + ".py")
        rel, name = posixpath.normpath(f"{base}/{file}"), tc.get("name", "?")
        text = ((bad.get("message") or "") + "\n" + (bad.text or "")).strip()
        pts = [f"test:{rel}::{name.split('[')[0]}"]
        for fp, ln in re.findall(r"^([\w./\-]+\.py):(\d+):", text, re.M):
            fr = Path(fp).resolve().relative_to(Path(work).resolve()).as_posix() if Path(fp).is_absolute() and str(Path(fp).resolve()).startswith(str(Path(work).resolve())) else posixpath.normpath(f"{base}/{fp}")
            pts += [f"file:{fr}"] + locate(b, fr, int(ln))
        line = int(tc.get("line")) + 1 if (tc.get("line") or "").isdigit() else 0
        out.append(finding("pytest", f"{rel}::{name} failed", text, rel, line, points=pts, ident=name))
    return out


def browser(b, work, cfg, pages):
    if not pages:
        return []
    try:
        import qa
    except ImportError:
        return [finding("browser", "Playwright is not installed here, so pages are not opened in a browser", severity="warn", ident="no-playwright")]
    pc = cfg.get("pages") or {}
    res = qa.run_pages(Path(work), pages, pc.get("widths", [390, 1440]), pc.get("settle_ms", 3000), pc.get("ignore_requests", []))
    return group_browser(res)


def group_browser(res, check="browser"):
    groups = {}
    for r in res:
        for msg in r["fail"]:
            norm = re.sub(r"\d+", "#", msg)[:160]
            g = groups.setdefault((r["page"], norm), {"msg": msg, "widths": []})
            g["widths"].append(r["width"])
    out = []
    for (page, norm), g in groups.items():
        pts, line = [], 0
        m = re.search(r"https?://[^/\s]+/((?:[\w.%\-]+/)*[\w.%\-]+\.(?:m?js|html)):(\d+)", g["msg"])
        if m:
            pts.append("file:" + unquote(m.group(1)))
            line = int(m.group(2))
        rel = page if not page.startswith("http") else ""
        out.append(finding(check, f"{page}: {g['msg']}", f"{g['msg']}\nat widths {sorted(set(g['widths']))}", rel, line if rel and pts and pts[0] == f"file:{rel}" else 0, points=pts, ident=norm))
    return out


def live(b, cfg):
    lc = cfg.get("live") or {}
    if os.environ.get("TESTER_LIVE", "on") == "off" or not lc:
        return []
    import httpx
    out = []
    for h in lc.get("http", []):
        try:
            r = httpx.get(h["url"], timeout=8)
            bad = f"HTTP {r.status_code}" if r.status_code >= 400 else ""
        except Exception as ex:
            bad = f"unreachable: {ex}"
        if bad:
            out.append(finding("live", f"{h['id']} is not answering at {h['url']} ({bad})", bad, points=[f"service:{h.get('service', h['id'])}"], ident=h["id"]))
    if lc.get("openapi"):
        try:
            spec = httpx.get(lc["openapi"], timeout=8).json()
            base = re.match(r"^(https?://[^/]+)", lc["openapi"]).group(1)
            with b._lock:
                rid = {f"{n['method']} {n['path']}": i for i, n in b.nodes.items() if n["type"] == "route"}
            for path, ops in (spec.get("paths") or {}).items():
                if "get" in ops and "{" not in path and path.startswith("/public"):
                    try:
                        code = httpx.get(base + path, timeout=10).status_code
                    except Exception as ex:
                        code = str(ex)
                    if not isinstance(code, int) or code >= 500:
                        out.append(finding("live", f"GET {path} answers {code} on the running engine", f"{base}{path} → {code}", points=[rid[f"GET {path}"]] if f"GET {path}" in rid else [], ident=path))
        except Exception as ex:
            out.append(finding("live", f"the engine's route list could not be read: {ex}", severity="warn", ident="openapi"))
    if lc.get("pages"):
        try:
            import qa
            pc = cfg.get("pages") or {}
            out += group_browser(qa.run_urls([(u, u) for u in lc["pages"]], pc.get("widths", [390, 1440]), pc.get("settle_ms", 3000), []), check="live")
        except ImportError:
            pass
    return out
