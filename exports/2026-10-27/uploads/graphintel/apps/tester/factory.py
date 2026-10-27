"""How TESTER packages the hundred repos, server-side: the same pack, bar and brief as apps/tester/repo-factory.js, so the Build Room
in a tab and the loop in the container agree on what a repo is, when it clears the bar and how an agent's reply becomes files. No network,
no docker: strings in, strings out. repos/registry.json `links` set the links every README carries; INSTITUTE_SITE / INSTITUTE_GRAPH override."""
import json
import os
import re

CONFIG = {"site": os.environ.get("INSTITUTE_SITE") or "http://localhost/", "graph": os.environ.get("INSTITUTE_GRAPH") or "http://localhost/#/graph", "year": 2026}
BAR = ("tests", "compose", "readme", "hygiene", "example", "links")
MIT = """MIT License

Copyright (c) {year} The Threshold Institute (working name)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""
CONFTEST = '"""Run the tests from a fresh checkout: the package sits one folder up."""\nimport sys\nfrom pathlib import Path\n\nsys.path.insert(0, str(Path(__file__).resolve().parents[1]))\n'
SMOKE_PY = 'import importlib\n\nimport pytest\n\n\n@pytest.mark.parametrize("name", __NAMES__)\ndef test_module_imports_standalone(name):\n    importlib.import_module("__MODULE__." + name)\n'
SMOKE_JS = ("import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\n\nfor (const name of __FILES__) {\n"
            "  test(name + ' parses', async () => {\n    const src = await readFile(new URL('../src/' + name, import.meta.url), 'utf8');\n    assert.doesNotThrow(() => new Function(src));\n  });\n}\n")
SERVE = ("import { createServer } from 'node:http';\nimport { readFile } from 'node:fs/promises';\nimport { extname, join, normalize } from 'node:path';\n\n"
         "const root = new URL('..', import.meta.url).pathname, types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };\n"
         "createServer(async (req, res) => {\n  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([.][.][/\\\\])+/, '');\n"
         "  try { const body = await readFile(join(root, path === '/' ? 'examples/quickstart.html' : path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html' }); res.end(body); }\n"
         "  catch { res.writeHead(404); res.end('not found'); }\n}).listen(8080, () => console.log('http://localhost:8080'));\n")
BAN_PY = re.compile(r"^\s*(import|from)\s+(requests|httpx|urllib3?|socket|aiohttp|anthropic|openai|websockets?)\b", re.M)
BAN_JS = re.compile(r"\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\(|from\s+['\"]node:(https?|net|dgram)['\"]")
MODEL = re.compile(r"dspy\.LM\(|anthropic\.|openai\.")
SECRETS = [re.compile(p) for p in (r"anma_[0-9a-f]{32}", r"\bsk-(ant-)?[A-Za-z0-9_-]{20,}", r"AKIA[0-9A-Z]{16}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"\bgh[pousr]_[A-Za-z0-9]{36}", r"\bxox[abprs]-[A-Za-z0-9-]{10,}")]
PLACEHOLDER = re.compile(r"\b(TODO|TBD|lorem|placeholder|coming soon)\b", re.I)
REPLY_FORMAT = ("Reply with each file you write or change as a block: a line `--- file: <path inside the repo>`, the whole file, then a line `--- end`. "
                "TESTER lays the blocks over its own copy and re-tests on the next round; nothing reaches the repository until the bar passes.")
FILE_RX = re.compile(r"^--- file: *(\S+)[ \t]*\n(.*?)^--- end[ \t]*$", re.M | re.S)
PATH_RX = re.compile(r"[A-Za-z0-9_.@+/-]+")


def configure(reg: dict) -> dict:
    """The links every README carries: INSTITUTE_SITE / INSTITUTE_GRAPH, else the registry's links, else what was set before."""
    links = (reg or {}).get("links") or {}
    CONFIG["site"] = os.environ.get("INSTITUTE_SITE") or links.get("site") or CONFIG["site"]
    CONFIG["graph"] = os.environ.get("INSTITUTE_GRAPH") or links.get("graph") or CONFIG["graph"]
    return CONFIG


def _safe(rel: str) -> bool:
    return bool(PATH_RX.fullmatch(rel)) and all(p and p not in (".", "..") and (not p.startswith(".") or (i == 0 and p == ".github")) for i, p in enumerate(rel.split("/")))


def take_files(text: str, cap: int = 40, max_bytes: int = 400_000) -> dict:
    """The files an agent wrote in its reply, {path: text}, from `--- file: <path>` … `--- end` blocks (REPLY_FORMAT). A block wrapped in one
    code fence is unwrapped; absolute paths, `..` and dotfiles other than .github/ are dropped. Same rules as RepoFactory.take."""
    out, total = {}, 0
    for m in FILE_RX.finditer(text or ""):
        rel, body = m.group(1).strip("`'\""), m.group(2)
        if not _safe(rel):
            continue
        lines = body.rstrip("\n").split("\n")
        if len(lines) >= 2 and lines[0].startswith("```") and lines[-1].strip() == "```":
            body = "\n".join(lines[1:-1]) + "\n"
        total += len(body.encode())
        if len(out) >= cap or total > max_bytes:
            break
        out[rel] = body
    return out


def module(e: dict) -> str:
    return re.sub(r"[^a-z0-9]+", "_", e["id"])


def licence() -> str:
    return MIT.format(year=CONFIG["year"])


def readme(e: dict, finding: str = "", hypothesis: str = "", use: str = "", local: str = "") -> str:
    js = e.get("lang") == "js"
    L = [f"# {e['name']}", "", e["what"], "", f"One of the hundred repos from one seeded brain at [The Threshold Institute]({CONFIG['site']}). {e['cat']} · wave W{e['wave']} · {e['line']}.", "",
         "## Finding", "", finding, "", "## Hypothesis", "", hypothesis, "", "## Quickstart", "", "```", "docker compose up", "```", "", "Without docker:", "", "```",
         local or ("node --test && node examples/serve.mjs" if js else "pip install -r requirements.txt -e . && python examples/quickstart.py"), "```", ""]
    if use:
        L += ["## Use", "", use, ""]
    L += ["## Tests", "", ("`node --test`" if js else "`pytest -q`") + " runs everything with no network and no model.", "",
          "## Links", "", f"- The institute: {CONFIG['site']}", f"- The public graph: {CONFIG['graph']}"]
    L += [f"- Packaged from `{p}` in the institute repository" for p in e.get("sources", [])]
    L += [f"- Research: `{p}`" for p in e.get("research", [])]
    L += ["", "## Licence", "", "MIT. See LICENSE.", ""]
    return "\n".join(L)


def compose(e: dict) -> str:
    return 'services:\n  quickstart:\n    build: .\n    ports: ["8080:8080"]\n' if e.get("lang") == "js" else "services:\n  quickstart:\n    build: .\n    command: python examples/quickstart.py\n"


def dockerfile(e: dict, git: bool = False) -> str:
    if e.get("lang") == "js":
        return 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nEXPOSE 8080\nCMD ["node", "examples/serve.mjs"]\n'
    apt = "RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*\n" if git else ""
    return "FROM python:3.12-slim\n" + apt + 'WORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir --no-deps .\nCMD ["python", "examples/quickstart.py"]\n'


def ci(e: dict) -> str:
    head = "name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n"
    if e.get("lang") == "js":
        return head + '      - uses: actions/setup-node@v4\n        with: { node-version: "22" }\n      - run: node --test\n'
    return head + ('      - uses: actions/setup-python@v5\n        with: { python-version: "3.12" }\n      - run: pip install -r requirements.txt -r requirements-dev.txt && pip install --no-deps -e .\n'
                   '      - run: pytest -q\n      - run: timeout 60 python examples/quickstart.py\n')


def pyproject(e: dict, deps: list, scripts: dict | None = None) -> str:
    L = ["[build-system]", 'requires = ["setuptools==75.6.0"]', 'build-backend = "setuptools.build_meta"', "", "[project]", f'name = "anima-{e["id"]}"', 'version = "0.1.0"',
         "description = " + json.dumps(e["what"]), 'readme = "README.md"', 'license = { text = "MIT" }', 'requires-python = ">=3.10"',
         "dependencies = [" + ", ".join(json.dumps(d) for d in deps) + "]", ""]
    if scripts:
        L += ["[project.scripts]"] + [f"{k} = {json.dumps(v)}" for k, v in scripts.items()] + [""]
    L += ["[tool.setuptools]", f'packages = ["{module(e)}"]', ""]
    return "\n".join(L)


def brief(e: dict) -> str:
    m, js = module(e), e.get("lang") == "js"
    research = f" ({', '.join(e['research'])})" if e.get("research") else ""
    return "\n".join([f"# Brief for SEXTANT: {e['name']}", "", f"**What:** {e['what']}", "", f"**From:** {e['from']}{research}", "",
                      f"**Line · wave · category:** {e['line']} · W{e['wave']} · {e['cat']}", "", "Write, in this folder:", "",
                      "1. The code: " + ("an ES module in `src/`" if js else f"a standalone Python package `{m}/`") + " that does what the line above says, importing nothing from the institute engine.",
                      "2. `tests/` that run with no network and no model, and pass.",
                      f"3. `examples/quickstart.{'html' if js else 'py'}` that runs in under 60 seconds and shows the finding.",
                      "4. `## Finding` and `## Hypothesis` in README.md from the research it comes from, with the falsifier.", "",
                      "TESTER runs the bar after every write and sends back what fails. The repo ships when all six checks pass and the owner approves.", ""])


def pack(e: dict, src: dict) -> dict:
    """A registry entry and the sources it names, in: a repo's files, out. With no source here, a BRIEF.md for SEXTANT instead."""
    files = {"LICENSE": licence(), "docker-compose.yml": compose(e), "Dockerfile": dockerfile(e), ".github/workflows/ci.yml": ci(e), "README.md": readme(e)}
    have = [p for p in e.get("sources", []) if src.get(p) is not None]
    if not have:
        files["BRIEF.md"] = brief(e)
        return files
    m = module(e)
    if e.get("lang") == "js":
        files["package.json"] = json.dumps({"name": "@anima/" + e["id"], "version": "0.1.0", "description": e["what"], "license": "MIT", "type": "module", "scripts": {"test": "node --test"}}, indent=2) + "\n"
        js = []
        for p in have:
            b = p.rsplit("/", 1)[-1]
            files["src/" + b] = src[p]
            if re.search(r"\.m?js$", b):
                js.append(b)
        files["examples/serve.mjs"] = SERVE
        if js:
            files["tests/smoke.test.mjs"] = SMOKE_JS.replace("__FILES__", json.dumps(js))
        return files
    files["requirements.txt"] = "# pinned runtime dependencies; TESTER adds what the packaged source imports\n"
    files["requirements-dev.txt"] = "pytest==8.3.3\n"
    files["pyproject.toml"] = pyproject(e, [])
    names = []
    for p in have:
        b = p.rsplit("/", 1)[-1]
        if b.endswith(".py"):
            files[f"{m}/{b}"] = src[p]
            names.append(b[:-3])
        else:
            files[f"{m}/data/{b}"] = src[p]
    files[f"{m}/__init__.py"] = '"""' + e["name"] + ": " + e["what"].replace('"', "'") + '"""\n__version__ = "0.1.0"\n'
    files["tests/conftest.py"] = CONFTEST
    files["tests/test_smoke.py"] = SMOKE_PY.replace("__NAMES__", json.dumps(names)).replace("__MODULE__", m)
    return files


def section(md: str, h: str) -> str:
    lines = (md or "").split("\n")
    if f"## {h}" not in lines:
        return ""
    out = []
    for line in lines[lines.index(f"## {h}") + 1:]:
        if line.startswith("## "):
            break
        out.append(line)
    return "\n".join(out).strip()


def bar(files: dict, e: dict) -> list:
    """The six checks every repo clears before it ships. Each row: id, ok, why (empty when ok)."""
    py, names = e.get("lang") != "js", list(files)
    tests = [n for n in names if (re.match(r"^tests/test_[^/]+\.py$", n) if py else re.match(r"^tests?/[^/]+\.test\.m?js$", n))]
    net = [n for n in tests if (BAN_PY if py else BAN_JS).search(files[n]) or MODEL.search(files[n])]
    ci_txt = files.get(".github/workflows/ci.yml", "")
    runs = ("pytest" in ci_txt) if py else ("node --test" in ci_txt)
    out = [{"id": "tests", "ok": bool(tests) and not net and runs,
            "why": "no tests yet" if not tests else net[0] + " reaches the network or a model" if net else "no CI workflow" if not ci_txt else "CI does not run the tests"}]
    comp = files.get("docker-compose.yml", "")
    svc = len([l for l in comp.split("services:")[-1].split("\n") if re.match(r"^  [A-Za-z0-9_.-]+:\s*$", l)]) if "services:" in comp else 0
    out.append({"id": "compose", "ok": svc == 1 and "Dockerfile" in files, "why": "no docker-compose.yml" if not comp else f"{svc} services; one line should start one" if svc != 1 else "no Dockerfile"})
    rd = files.get("README.md", "")
    fi, hy = section(rd, "Finding"), section(rd, "Hypothesis")
    out.append({"id": "readme", "ok": len(fi) >= 60 and len(hy) >= 60 and not PLACEHOLDER.search(fi + hy),
                "why": "no README" if not rd else "Finding not written yet (SEXTANT)" if len(fi) < 60 else "Hypothesis not written yet (SEXTANT)" if len(hy) < 60 else "placeholder text in Finding or Hypothesis"})
    secret = next((n for n in names if any(s.search(files[n]) for s in SECRETS)), None)
    req = [l for l in (re.sub(r"#.*", "", l).strip() for l in files.get("requirements.txt", "").split("\n")) if l]
    unpinned = [l for l in req if not re.search(r"==\d|@\s*git\+\S+@v?[\w.-]+$", l)]
    try:
        pkg = json.loads(files["package.json"]) if "package.json" in files else {}
    except ValueError:
        pkg = {"bad": True}
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    loose = [k for k, v in deps.items() if not re.match(r"^\d+\.\d+\.\d+$", str(v))]
    out.append({"id": "hygiene", "ok": "LICENSE" in files and not secret and not unpinned and not loose and not pkg.get("bad"),
                "why": "no LICENSE" if "LICENSE" not in files else f"a key-shaped string in {secret}" if secret else f"unpinned: {unpinned[0]}" if unpinned else f"unpinned: {loose[0]}" if loose else "package.json does not parse"})
    out.append({"id": "example", "ok": any(re.match(r"^examples/quickstart\.(py|m?js|html)$", n) for n in names), "why": "no examples/quickstart yet"})
    out.append({"id": "links", "ok": CONFIG["site"] in rd and CONFIG["graph"] in rd, "why": "README does not link the site and the public graph"})
    for c in out:
        if c["ok"]:
            c["why"] = ""
    return out
