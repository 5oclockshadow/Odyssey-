"""TESTER's mind: one Signature, the slice of the brain nearest a finding, and ReAct tools that act on its own working copy. A fix is kept only
when the finding is gone and nothing it touched got worse. The brain keeps the fix, the lesson and the new weights either way, so the next
failure near the same code is reached faster: what TESTER learns is the graph."""
import difflib
import hashlib
import json
import os
import re
import time
from pathlib import Path

import dspy
from pydantic import BaseModel, Field

import checks as C
import ingest


class Edit(BaseModel):
    path: str = Field(description="repository-relative path of the file to change")
    find: str = Field(description="exact text that occurs exactly once in that file")
    replace: str = Field(description="the text that replaces it")


class Repair(BaseModel):
    diagnosis: str = Field(description="what is wrong and why, from the evidence")
    edits: list[Edit] = Field(default_factory=list, description="the smallest change that fixes it; empty when the owner must decide")
    needs_owner: str = Field(default="", description="the decision only the owner can make, if any")
    lesson: str = Field(default="", description="one sentence worth remembering about this code")
    confidence: float = Field(default=0.5, ge=0, le=1)


class Fix(dspy.Signature):
    """Replaced by tester.yaml's mission at startup."""
    intake: str = dspy.InputField(desc="the finding and its evidence, the code around it, earlier attempts, then the slice of your graph nearest it")
    out: Repair = dspy.OutputField()


class Ask(dspy.Signature):
    """You are TESTER, an agent that is one graph of the Institute's code, stack, checks, findings, fixes and lessons. Answer the owner from the
    slice given, cite node ids, and say plainly what the slice does not show."""
    intake: str = dspy.InputField(desc="the slice of your graph nearest the question, then the question")
    answer: str = dspy.OutputField()


CTX = {"brain": None, "work": None, "cfg": {}, "tried": {}}
MIND = None
ASK = None
MODEL = ""
TEXT = {".py", ".js", ".mjs", ".html", ".yaml", ".yml", ".json", ".md", ".txt", ".sh", ".css", ".toml", ".conf", ".example"}


def _safe(rel: str, root=None) -> Path:
    base = Path(root or CTX["work"]).resolve()
    p = (base / rel).resolve()
    if p != base and base not in p.parents:
        raise ValueError(f"{rel} is outside the repository")
    if ".git" in p.relative_to(base).parts:
        raise ValueError("TESTER does not touch .git")
    return p


# — tools: each is also a node in the graph, tied to the function below —

def graph_query(query: str, hops: int = 1) -> str:
    """Your own graph. Give a node id (file:<path>, code:<path>::<name>, test:<path>::<name>, route:..., service:<name>, finding:..., fix:..., lesson:..., tool:...) for it and its neighbours, or a few words to search labels, paths and docs."""
    b = CTX["brain"]
    if query in b.nodes:
        nodes, edges = b.around([query], hops=max(1, min(int(hops or 1), 2)), k=60)
        keep = ("id", "type", "label", "file", "line", "doc", "status")
        return json.dumps({"nodes": [{k: n.get(k) for k in keep if n.get(k) not in (None, "")} for n in nodes][:60], "edges": [[e["relation"]] + e["members"] for e in edges]})[:12000]
    hits = b.search(query, 15)
    return json.dumps([{k: b.nodes[i].get(k) for k in ("id", "type", "label", "file", "line") if b.nodes[i].get(k) not in (None, "")} for i in hits]) if hits else "no node matches"


def read_file(path: str, start: int = 1, end: int = 250) -> str:
    """Read lines start..end, numbered, of a file in your working copy of the repository."""
    try:
        lines = _safe(path).read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception as ex:
        return f"error: {ex}"
    s = max(1, int(start or 1))
    e = min(len(lines), int(end or s + 250), s + 400)
    return "\n".join(f"{i:>5}  {lines[i - 1]}" for i in range(s, e + 1)) or "(empty)"


def search_code(pattern: str, path: str = "") -> str:
    """Regex search over your working copy, or one folder or file in it. Returns up to 60 'file:line: text' hits."""
    try:
        rx = re.compile(pattern)
        base = _safe(path) if path else Path(CTX["work"])
    except (re.error, ValueError) as ex:
        return f"error: {ex}"
    skip, hits, work = set(CTX["cfg"].get("skip") or []), [], Path(CTX["work"])
    files = [base] if base.is_file() else (p for p in base.rglob("*") if p.is_file() and not skip.intersection(p.relative_to(work).parts))
    for p in files:
        if p.suffix not in TEXT and not p.name.startswith("Dockerfile"):
            continue
        try:
            for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if rx.search(line):
                    hits.append(f"{p.relative_to(work).as_posix()}:{i}: {line.strip()[:200]}")
                    if len(hits) >= 60:
                        return "\n".join(hits)
        except OSError:
            continue
    return "\n".join(hits) or "no match"


def run_check(check: str, target: str = "") -> str:
    """Re-run one check in your working copy, with any edits you are trying: pytest (target: a suite id like engine, or a test like apps/engine/test_world.py::test_x), py or js (target: a file), page (target: a page path, opened in the browser), templates, refs, routes, compose, config, secrets."""
    cfg, work = CTX["cfg"], Path(CTX["work"])
    p = scope(check, target, cfg, CTX["brain"])
    if p is None:
        return "unknown check"
    sb = CTX["brain"].copy()
    if CTX["tried"]:
        ingest.ingest(sb, work, cfg, only=set(CTX["tried"]))
    found, _ = C.run(p, sb, work, cfg)
    if check in ("refs", "routes", "compose", "config") and target:
        found = [f for f in found if f["file"] == target] or found
    return "pass" if not found else "\n\n".join(f"{f['title']}\n{f['detail'][:1200]}" for f in found[:6])


def try_edit(path: str, find: str, replace: str) -> str:
    """Try an exact find-and-replace in your working copy, then test it with run_check. `find` must occur exactly once. Every try is undone before your final edits are verified."""
    try:
        p = _safe(path)
        text = p.read_text(encoding="utf-8")
    except Exception as ex:
        return f"error: {ex}"
    n = text.count(find)
    if n != 1:
        return f"error: find occurs {n} times in {path}"
    CTX["tried"].setdefault(path, text)
    p.write_text(text.replace(find, replace, 1), encoding="utf-8")
    return "applied in the working copy"


def undo_edits() -> str:
    """Put every file you tried an edit on back the way it was."""
    n = len(CTX["tried"])
    for rel, text in list(CTX["tried"].items()):
        _safe(rel).write_text(text, encoding="utf-8")
    CTX["tried"].clear()
    return f"restored {n} file(s)"


TOOLS = [graph_query, read_file, search_code, run_check, try_edit, undo_edits]
TOOL_INFO = [(f.__name__, "apps/tester/agent.py", (f.__doc__ or "").strip()) for f in TOOLS]


def configure(cfg: dict) -> bool:
    """Wire the model. With no key for it TESTER still loads, tests and records; it only stops fixing and answering."""
    global MIND, ASK, MODEL
    CTX["cfg"] = cfg
    MODEL = os.environ.get("TESTER_MODEL") or cfg.get("model", "")
    key = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}.get(MODEL.split("/")[0])
    if not MODEL or (key and not os.environ.get(key)):
        MIND = ASK = None
        return False
    dspy.configure(lm=dspy.LM(MODEL, max_tokens=8000))
    sig = Fix.with_instructions(cfg.get("mission", "")) if hasattr(Fix, "with_instructions") else Fix
    MIND = dspy.ReAct(sig, tools=TOOLS, max_iters=(cfg.get("agent") or {}).get("max_steps", 14))
    ASK = dspy.Predict(Ask)
    return True


def scope(check, target, cfg, b=None):
    p = {"full": False, "checks": set(), "py": [], "js": [], "pages": [], "files": [], "suites": []}
    if check == "pytest":
        suites = C.suites_of(b if b is not None else CTX.get("brain"), cfg)       # tester.yaml's suites and every repo suite in the graph
        s = next((x for x in suites if x["id"] == target), None)
        if s is None and target:
            base = next((x for x in suites if target.split("::")[0].startswith(x["dir"].rstrip("/") + "/")), None)
            s = {**base, "tests": [target[len(base["dir"].rstrip("/")) + 1:]]} if base else None
        p["checks"], p["suites"] = {"pytest"}, ([s] if s else list(suites))
    elif check == "py":
        p["checks"], p["py"] = {"py"}, [target]
    elif check == "js":
        p["checks"] = {"js"}
        p["js" if target.endswith((".js", ".mjs")) else "pages"] = [target]
    elif check in ("page", "browser"):
        p["checks"], p["pages"] = {"browser", "templates"}, [target]
    elif check == "templates":
        p["checks"], p["pages"] = {"templates"}, [target]
    elif check in ("refs", "routes", "compose", "config"):
        p["checks"] = {check}
    elif check == "secrets":
        p["checks"], p["files"] = {"secrets"}, [target]
    else:
        return None
    return p


def recheck(f, touched, b, cfg) -> dict:
    """What verifying a fix re-runs: everything the graph says the touched files reach, plus the finding's own check on its own target."""
    p = C.plan(b, cfg, changed=sorted(touched))
    c, file = f["check"], f.get("file", "")
    if c != "live":
        p["checks"].add(c)
    add = lambda k, v: v and v not in p[k] and p[k].append(v)
    if c in ("py", "lint"):
        add("py", file)
    elif c == "js":
        add("js" if file.endswith((".js", ".mjs")) else "pages", file)
    elif c in ("browser", "templates"):
        add("pages", file)
    elif c == "secrets":
        add("files", file)
    elif c == "pytest":
        for s in cfg.get("suites") or []:
            if file.startswith(s["dir"].rstrip("/") + "/") and s not in p["suites"]:
                p["suites"].append(s)
    if p["pages"]:
        p["checks"].add("browser")
    if p["suites"]:
        p["checks"].add("pytest")
    p["checks"].discard("live")
    return p


def verify(f, rep: Repair, b, work, cfg, baseline) -> dict:
    """Apply the edits to the working copy, re-read those files into a scratch brain, re-run what they reach, then put the copy back."""
    if not rep.edits:
        return {"ok": False, "owner": rep.needs_owner, "why": "needs the owner" if rep.needs_owner else "no edits", "files": []}
    before = {}
    try:
        for e in rep.edits:
            p = _safe(e.path, work)
            if e.path not in before:
                before[e.path] = p.read_text(encoding="utf-8") if p.exists() else None
            text = p.read_text(encoding="utf-8") if p.exists() else ""
            if e.find:
                n = text.count(e.find)
                if n != 1:
                    raise ValueError(f"{e.path}: find occurs {n} times")
                text = text.replace(e.find, e.replace, 1)
            elif p.exists():
                raise ValueError(f"{e.path}: an empty find only creates a new file")
            else:
                text = e.replace
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")
        after = {r: _safe(r, work).read_text(encoding="utf-8") for r in before}
        sb = b.copy()
        ingest.ingest(sb, work, cfg, only=set(before))
        found, _ = C.run(recheck(f, set(before), sb, cfg), sb, work, cfg)
        still = any(x["key"] == f["key"] for x in found)
        new = [x for x in found if x["key"] not in baseline and x["severity"] == "error"]
        diff = "".join("".join(difflib.unified_diff((before[r] or "").splitlines(True), after[r].splitlines(True), f"a/{r}", f"b/{r}")) for r in before)
        why = "the finding is still there" if still else ("it broke something else: " + "; ".join(x["title"] for x in new[:4]) if new else "")
        return {"ok": not still and not new, "why": why, "new": [x["title"] for x in new][:8], "files": sorted(before), "before": before, "after": after, "diff": diff}
    except Exception as ex:
        return {"ok": False, "why": str(ex)[:300], "files": sorted(before)}
    finally:
        for r, text in before.items():
            p = _safe(r, work)
            if text is None:
                p.unlink(missing_ok=True)
            else:
                p.write_text(text, encoding="utf-8")


def changed_lines(old, new) -> list:
    if new is None:
        return []
    sm = difflib.SequenceMatcher(a=(old or "").splitlines(), b=new.splitlines(), autojunk=False)
    return sorted({j + 1 for op, _, _, j1, j2 in sm.get_opcodes() if op != "equal" for j in range(j1, max(j2, j1 + 1))})


def record(f, rep: Repair, res, b, patches) -> str:
    """The fix, its lesson and the weights go into the graph; a verified fix also leaves a patch the owner can read and apply."""
    now, fid = time.time(), "finding:" + f["key"]
    fx = "fix:" + hashlib.sha1(f"{f['key']}|{now}".encode()).hexdigest()[:10]
    status = "verified" if res["ok"] else ("needs_owner" if rep.needs_owner and not rep.edits else "rejected")
    files = res.get("files", [])
    b.node(fx, "fix", f"{status}: {rep.diagnosis[:120]}", finding=f["key"], status=status, diagnosis=rep.diagnosis[:2000], why=res.get("why", ""),
           needs_owner=rep.needs_owner[:1000], lesson=rep.lesson[:500], confidence=rep.confidence, files=files,
           touches_tests=any(Path(r).name.startswith("test_") for r in files), ts=now)
    b.link("fixes" if res["ok"] else "tried", fx, fid, w=0.8 if res["ok"] else 0.3)
    b.link("made", "agent:tester", fx, w=0.6)
    changed = []
    for rel in files:
        if b.link("changes", fx, f"file:{rel}", w=0.6):
            changed.append(f"file:{rel}")
        for ln in changed_lines(res.get("before", {}).get(rel), res.get("after", {}).get(rel)):
            for cid in C.locate(b, rel, ln):
                if cid not in changed:
                    b.link("changes", fx, cid, w=0.6)
                    changed.append(cid)
    if rep.lesson:
        lid = "lesson:" + hashlib.sha1(rep.lesson.encode()).hexdigest()[:10]
        b.node(lid, "lesson", rep.lesson[:300], ts=now, verified=bool(res["ok"]))
        b.link("learned", fx, lid, w=0.6)
        for x in changed or [p for p in f["points"] if p in b.nodes]:
            b.link("about", lid, x, w=0.6)
    pts = {p for p in f["points"] if p in b.nodes}
    if res["ok"]:
        for c in changed:
            b.link("points_at", fid, c, w=0.6)                 # the finding now knows where it was fixed
    near, ids, adj = set(changed) | pts, set(changed), b.adjacency()
    for x in near | {fid}:
        for e in adj.get(x, []):
            if sum(m in near or m == fid for m in e["members"]) >= 2:
                ids.add(e["id"])
    (b.reinforce if res["ok"] else b.weaken)(sorted(ids))
    if res.get("diff"):
        patches = Path(patches)
        patches.mkdir(parents=True, exist_ok=True)
        name = fx.replace(":", "-")
        (patches / f"{name}.diff").write_text(res["diff"])
        (patches / f"{name}.json").write_text(json.dumps({"finding": f["key"], "before": res["before"], "after": res["after"]}))
        b.nodes[fx]["patch"] = f"{name}.diff"
    return fx


def render(f, b, work, earlier) -> str:
    out = [f"FINDING {f['key']} · {f['check']} · {f['severity']}", f["title"], "", "EVIDENCE", f["detail"][:3500]]
    if f.get("file"):
        out += ["", f"WHERE {f['file']}:{f['line'] or ''}"]
        try:
            src = (Path(work) / f["file"]).read_text(encoding="utf-8", errors="replace").splitlines()
            s = max(1, (f["line"] or 1) - 30)
            out += [f"{i:>5}  {src[i - 1]}" for i in range(s, min(len(src), s + 80) + 1)]
        except OSError:
            pass
    if earlier:
        out += ["", "EARLIER ATTEMPTS ON THIS FINDING"] + [f"- {x.get('status')}: {x.get('diagnosis', '')[:300]} ({x.get('why', '')[:200]})" for x in earlier[-4:]]
    out += ["", "YOUR GRAPH NEAR IT", b.slice(["finding:" + f["key"]] + list(f["points"]), hops=2, k=70)]
    return "\n".join(out)


def attempt(f, b, work, cfg, baseline, patches) -> dict:
    """One finding: up to max_attempts repairs, each verified in the working copy. Returns the last result with its fix id."""
    work = Path(work)
    CTX.update(brain=b, work=work, cfg=cfg, tried={})
    fid = "finding:" + f["key"]
    b.node(fid, "finding", f["title"], check=f["check"], detail=f["detail"], severity=f["severity"], file=f.get("file", ""), line=f.get("line", 0),
           status=(b.nodes.get(fid) or {}).get("status", "open"))
    for p in f["points"]:
        b.link("points_at", fid, p, w=0.6)
    earlier = [dict(b.nodes[e["members"][0]]) for e in b.adjacency().get(fid, []) if e["relation"] in ("fixes", "tried") and e["members"][0] in b.nodes]
    res = {"ok": False, "why": "no model is configured"}
    if MIND is None:
        return res
    for _ in range(max(1, int(cfg.get("max_attempts", 2)))):
        try:
            pred = MIND(intake=render(f, b, work, earlier))
            rep = pred.out if isinstance(pred.out, Repair) else Repair.model_validate(pred.out)
        except Exception as ex:
            res = {"ok": False, "why": f"the model failed: {ex}"[:300]}
            break
        finally:
            undo_edits()
        res = verify(f, rep, b, work, cfg, baseline)
        res["fix"] = record(f, rep, res, b, patches)
        earlier.append(dict(b.nodes[res["fix"]]))
        if res["ok"] or rep.needs_owner:
            break
    return res


def apply_fix(fx: str, b, repo, patches) -> dict:
    """Write a verified fix into the repository, only if every file is still exactly as it was when the fix was made."""
    n = b.nodes.get(fx)
    if not n or n["type"] != "fix":
        raise KeyError("no such fix")
    if n.get("status") != "verified":
        raise ValueError(f"only a verified fix can be applied; this one is {n.get('status')}")
    data = json.loads((Path(patches) / (fx.replace(":", "-") + ".json")).read_text())
    for rel, old in data["before"].items():
        p = _safe(rel, repo)
        if (p.read_text(encoding="utf-8") if p.exists() else None) != old:
            raise ValueError(f"{rel} changed since the fix was made; the next run makes a fresh one")
    for rel, new in data["after"].items():
        p = _safe(rel, repo)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(new, encoding="utf-8")
    b.node(fx, "fix", n["label"].replace("verified:", "applied:", 1), status="applied", applied=time.time())
    for rel in data["after"]:
        b.link("applied_to", fx, f"file:{rel}", w=0.7)
    return {"applied": True, "files": sorted(data["after"])}


def ask(b, text: str) -> str:
    ids = b.search(text, 10)
    if ASK is None:
        return "No model is configured. Nearest in the graph: " + (", ".join(ids) or "nothing matched")
    return str(ASK(intake=b.slice(ids or ["agent:tester"], hops=1, k=60) + "\n\nQUESTION\n" + text).answer)
