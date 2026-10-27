"""The Build Room's loop, server-side: TESTER × SEXTANT over repos/registry.json, hundreds of rounds unattended.
A repo has two copies: the committed one (repos/<id> in the repository) and TESTER's draft (state/build/repos/<id>: what TESTER packed,
what an agent wrote back, what TESTER fixed). Its files are the committed copy with the draft laid over it; its tests run on those in
state/build/run/<id>, never inside the repository.
Status: queued → packed (TESTER had the source) or briefed (research only; SEXTANT owes the code) → built (its files changed: written,
not verified) → passing or failing. A round: refresh (a repo whose files changed since its last test is built again) · plan (asked first,
then built, then failing every retry_every rounds, then queued; launch wave first, per_round at a time) · build · test (the bar, then
pytest or node --test) · route (to SEXTANT or TESTER's agent; `--- file:` blocks in a reply land in the draft and are verified next
round) · walk the site (qa.run_journeys at every width every e2e_every rounds, one width otherwise) · audit to improve · record.
Stops at the target, or when every repo passes and three site walks in a row are clean.
With TESTER_EDIT=on a passing repo's changed files are written into the repository and its draft is spent; the registry's statuses
follow every fifth round. SEXTANT: with SESSION_SECRET (shared through .env) TESTER signs a five-minute build token for the engine's
POST /builder/say, which opens that door and no other; else SEXTANT_TOKEN, an owner session, for POST /owner/say; else the outbox."""
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import factory

WIDTHS = [360, 768, 1440]
SKIP = {".git", "__pycache__", ".pytest_cache", "node_modules"}
BRIEF_ONLY = {"LICENSE", "docker-compose.yml", "Dockerfile", ".github/workflows/ci.yml", "README.md", "BRIEF.md"}


def _counts(out: str, passed: str, failed: str, errors: str) -> dict:
    n = lambda pat: int(m.group(1)) if (m := re.search(pat, out)) else 0
    return {"passed": n(passed), "failed": n(failed), "errors": n(errors) if errors else 0, "tail": "\n".join(out.strip().split("\n")[-28:])}


def build_token(secret: str, ttl: int = 300) -> str:
    """What the engine's auth.builder accepts: build.<exp>.<HMAC-SHA256 of 'build.<exp>' under SESSION_SECRET>, a few minutes long."""
    body = f"build.{int(time.time()) + ttl}"
    return body + "." + hmac.new(secret.encode(), body.encode(), "sha256").hexdigest()


def fingerprint(files: dict) -> str:
    h = hashlib.sha1()
    for k in sorted(files):
        h.update(k.encode() + b"\0" + str(files[k]).encode(errors="replace") + b"\0")
    return h.hexdigest()[:16]


def tests_in(files: dict, e: dict) -> list:
    rx = r"^tests/test_[^/]+\.py$" if e.get("lang") != "js" else r"^tests?/[^/]+\.test\.m?js$"
    return [p for p in files if re.match(rx, p)]


class Build:
    def __init__(self, cfg: dict, repo, work, state, edit: bool = False, ask_tester=None, runner=None, walker=None, sextant=None):
        cfg = cfg or {}
        self.cfg, self.e2e = cfg.get("build") or {}, cfg.get("e2e") or {}
        self.repo, self.work, self.state, self.edit = Path(repo), Path(work), Path(state) / "build", edit
        self.ask_tester, self.runner, self.walker = ask_tester, runner or self.pytest, walker or self.journeys
        self.sextant = sextant or self.post_sextant
        self.lock, self.busy, self.stop_flag, self.thread = threading.RLock(), threading.Lock(), False, None
        self.area, self.runs = self.state / "repos", self.state / "run"
        self.area.mkdir(parents=True, exist_ok=True)
        self.asked: list = []
        self.s = self._load()

    # — state —
    def _load(self) -> dict:
        p = self.state / "status.json"
        try:
            d = json.loads(p.read_text()) if p.exists() else {}
        except ValueError:
            d = {}
        self.was_running = bool(d.get("running") or d.get("resume"))
        d.setdefault("round", 0)
        d.setdefault("phase", "idle")
        d.setdefault("clean", 0)
        d["running"], d["resume"], d["plan"], d["sel"] = False, False, d.get("plan", []), d.get("sel", "")
        for k in ("st", "e2e"):
            d.setdefault(k, {})
        for k in ("history", "feed", "proposals", "outbox"):
            d.setdefault(k, [])
        d["target"] = int(os.environ.get("BUILD_ROUNDS") or d.get("target") or self.cfg.get("rounds", 500))
        return d

    def save(self):
        with self.lock:
            tmp = self.state / "status.json.tmp"
            tmp.write_text(json.dumps(self.s, sort_keys=True))
            tmp.replace(self.state / "status.json")

    def status(self) -> dict:
        with self.lock:
            s = json.loads(json.dumps(self.s))
            asked = list(self.asked)
        s["feed"], s["history"] = s["feed"][-150:], s["history"][-500:]
        s.update(mode="Container", edit=self.edit, asked=asked, config={"site": factory.CONFIG["site"], "graph": factory.CONFIG["graph"]})
        return s

    def say(self, who, to, text, kind="info"):
        with self.lock:
            self.s["feed"] = (self.s["feed"] + [{"t": time.time() * 1000, "who": who, "to": to, "text": str(text)[:700], "kind": kind}])[-300:]

    def set_repo(self, rid, **patch):
        with self.lock:
            self.s["st"][rid] = {**self.s["st"].get(rid, {}), **patch}

    def st(self, rid) -> dict:
        with self.lock:
            return dict(self.s["st"].get(rid, {}))

    # — the registry —
    def registry(self) -> dict:
        """repos/registry.json, the repository's copy first. Its links are what every README must carry (INSTITUTE_SITE overrides)."""
        for root in (self.repo, self.work):
            p = root / "repos" / "registry.json"
            if p.exists():
                d = json.loads(p.read_text())
                factory.configure(d)
                return d
        raise FileNotFoundError("repos/registry.json")

    def repos(self) -> list:
        reg = self.registry()["repos"]
        with self.lock:
            for r in reg:
                v = self.s["st"].setdefault(r["id"], {"status": r.get("status", "queued")})
                if v.get("status") == "testing":
                    v["status"] = "built"                       # stopped mid-test: verify it again
        return reg

    def entry(self, rid: str):
        return next((e for e in self.repos() if e["id"] == rid), None)

    # — one repo's files: the committed copy with TESTER's draft laid over it —
    def read(self, rel: str):
        for root in (self.repo, self.work):
            p = root / rel
            if p.is_file():
                return p.read_text(errors="replace")
        return None

    @staticmethod
    def tree(root) -> dict:
        out = {}
        if root is None or not Path(root).is_dir():
            return out
        root = Path(root)
        for p in sorted(root.rglob("*")):
            rel = p.relative_to(root)
            if SKIP & set(rel.parts):
                continue
            try:
                if p.is_file() and p.stat().st_size <= 2_000_000:
                    out[rel.as_posix()] = p.read_text(errors="replace")
            except OSError:
                pass
        return out

    def committed(self, e: dict):
        return next((root / e["dir"] for root in (self.repo, self.work) if (root / e["dir"]).is_dir()), None)

    def files_of(self, e: dict) -> dict:
        """The committed copy with TESTER's draft laid over it; empty when neither exists."""
        return {**self.tree(self.committed(e)), **self.tree(self.area / e["id"])}

    @staticmethod
    def write(root, files: dict):
        for rel, text in files.items():
            p = Path(root) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)

    def put(self, root, files: dict):
        """files become the whole of root."""
        shutil.rmtree(root, ignore_errors=True)
        self.write(root, files)

    def draft(self, e: dict, files: dict):
        """Lay files over TESTER's draft of e; the rest of the draft stays."""
        self.write(self.area / e["id"], files)

    def build(self, e: dict) -> dict:
        """The repo's files. A repo with none yet is packed from its sources, or, research only, from its brief."""
        files = self.files_of(e)
        if files:
            return files
        src = {p: self.read(p) for p in e.get("sources", [])}
        files = factory.pack(e, {k: v for k, v in src.items() if v is not None})
        self.put(self.area / e["id"], files)
        if "BRIEF.md" not in files:
            self.set_repo(e["id"], status="packed", nfiles=len(files))
            self.say("TESTER", "", f"packed {e['name']} from {', '.join(e['sources'])} · {len(files)} files", "ok")
        return files

    def brief(self, e: dict, files: dict):
        self.set_repo(e["id"], status="briefed", nfiles=len(files), fp=fingerprint(files))
        self.say("TESTER", "→ SEXTANT", f"{e['name']} exists only as research ({e.get('from', '')}). Brief: {e['what']}")
        self.to_sextant(e["id"] + ":brief", f"Build {e['name']} in {e['dir']}/.\n\n" + files["BRIEF.md"], e)

    def step(self, e: dict, i: int):
        """One repo: build it, then test and route it, or wait for SEXTANT while it is still only a brief."""
        with self.lock:
            self.s.update(phase="build", sel=e["id"])
        files = self.build(e)
        self.set_repo(e["id"], lastRound=i)
        status = self.st(e["id"]).get("status", "queued")
        if "BRIEF.md" in files and set(files) <= BRIEF_ONLY and status in ("queued", "briefed"):
            if status != "briefed":
                self.brief(e, files)
            return None
        with self.lock:
            self.s["phase"] = "test"
        r = self.test(e, files)
        if r["status"] == "failing":
            self.route(e, r)
        return r

    def pytest(self, root: Path) -> dict:
        env = dict(os.environ)
        sib = [str(p) for base in (self.repo / "repos", self.work / "repos", self.area) for p in sorted(base.glob("*")) if p.is_dir()]
        env["PYTHONPATH"] = os.pathsep.join([str(root)] + sib + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else []))
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        t0 = time.time()
        try:
            r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], cwd=root, env=env, capture_output=True, text=True, timeout=int(self.cfg.get("test_timeout", 300)))
            out, code = (r.stdout + r.stderr)[-6000:], r.returncode
        except subprocess.TimeoutExpired:
            out, code = "timed out", 124
        return {"code": code, "secs": round(time.time() - t0, 2), **_counts(out, r"(\d+) passed", r"(\d+) failed", r"(\d+) errors?")}

    def node_test(self, root: Path) -> dict:
        if not shutil.which("node"):
            return {"code": 0, "secs": 0, "passed": 0, "failed": 0, "errors": 0, "tail": "node is not installed here; static checks only", "skipped": True}
        t0 = time.time()
        try:
            r = subprocess.run(["node", "--test"], cwd=root, capture_output=True, text=True, timeout=int(self.cfg.get("test_timeout", 300)))
            out, code = (r.stdout + r.stderr)[-6000:], r.returncode
        except subprocess.TimeoutExpired:
            out, code = "timed out", 124
        return {"code": code, "secs": round(time.time() - t0, 2), **_counts(out, r"# pass (\d+)", r"# fail (\d+)", "")}

    def test(self, e: dict, files: dict) -> dict:
        self.set_repo(e["id"], status="testing")
        rd = files.get("README.md", "")
        if rd and (factory.CONFIG["site"] not in rd or factory.CONFIG["graph"] not in rd):     # the one fix TESTER makes by itself, in its draft
            new = re.sub(r"- The institute: \S+", lambda m: f"- The institute: {factory.CONFIG['site']}", rd)
            new = re.sub(r"- The public graph: \S+", lambda m: f"- The public graph: {factory.CONFIG['graph']}", new)
            if new != rd:
                files["README.md"] = rd = new
                self.draft(e, {"README.md": new})
                self.say("TESTER", "", f"{e['name']}: pointed the README links at {factory.CONFIG['site']}", "ok")
        bar = factory.bar(files, e)
        tests = None
        if tests_in(files, e):
            run = self.runs / e["id"]
            self.put(run, files)
            try:
                tests = self.runner(run) if e.get("lang") != "js" else self.node_test(run)
            finally:
                shutil.rmtree(run, ignore_errors=True)
        bar_ok = all(c["ok"] for c in bar)
        test_ok = tests is None or bool(tests.get("skipped")) or (tests["passed"] > 0 and not tests["failed"] and not tests["errors"] and tests["code"] == 0)
        if not bar_ok:
            why = " · ".join(f"{c['id']}: {c['why']}" for c in bar if not c["ok"])
        elif test_ok:
            why = ""
        else:
            why = f"{tests['failed']} failing test(s)" if tests["failed"] else "tests errored" if tests["errors"] or tests["code"] else "no test passed"
        status = "passing" if bar_ok and test_ok else "failing"
        prev = self.st(e["id"])
        self.set_repo(e["id"], status=status, bar=bar, tests=tests, why=why, at=time.time() * 1000, attempts=prev.get("attempts", 0) + 1 if status == "failing" else 0,
                      nfiles=len(files), fp=fingerprint(files), finding=len(factory.section(rd, "Finding")), hasUse=bool(re.search(r"^## Use", rd, re.M)))
        ran = f" · {tests['passed']} tests in {tests['secs']} s" if tests and not tests.get("skipped") else ""
        self.say("TESTER", "", f"{e['name']} " + ("passes the bar" + ran if status == "passing" else f"fails · {why}"), "ok" if status == "passing" else "bad")
        if status == "passing" and self.edit:
            self.publish(e, files)
        return {"status": status, "why": why, "bar": bar, "tests": tests}

    def publish(self, e: dict, files: dict):
        """A passing repo into the repository (TESTER_EDIT=on): only the files that differ, never the brief. Then the draft is spent."""
        dest = self.repo / e["dir"]
        old = self.tree(dest)
        changed = {k: v for k, v in files.items() if k != "BRIEF.md" and old.get(k) != v}
        if changed:
            self.write(dest, changed)
            self.say("TESTER", "", f"wrote {len(changed)} file(s) into {e['dir']}/ in the repository", "ok")
        shutil.rmtree(self.area / e["id"], ignore_errors=True)
        self.set_repo(e["id"], fp=fingerprint(self.files_of(e)))

    def route(self, e: dict, r: dict):
        fails = [c["id"] for c in r["bar"] if not c["ok"]]
        sextant = e.get("builder") == "sextant" or "readme" in fails or "example" in fails
        key = f"{e['id']}:{'sextant' if sextant else 'tester'}:{r['why']}"
        if self.st(e["id"]).get("routed") == key:
            return
        self.set_repo(e["id"], routed=key)
        where = ", ".join(e.get("research", []) + e.get("sources", [])) or e.get("from", "")
        have = ", ".join(sorted(self.files_of(e))[:30])
        if sextant:
            self.to_sextant(key, f"{e['name']} ({e['dir']}/) fails the bar: {r['why']}. Write what is missing from {where}. Its files now: {have}.", e)
        else:
            tail = ("\n" + r["tests"]["tail"][-900:]) if r.get("tests") else ""
            self.to_tester(key, f"{e['name']} ({e['dir']}/) fails: {r['why']}{tail}\nIts files now: {have}.\nMake it standalone with the smallest change; never weaken a test.", e)

    # — the two agents —
    def post_sextant(self, text: str):
        """SEXTANT's answer, or None when no door is open: a build token (SESSION_SECRET) for POST /builder/say, else an owner session
        (SEXTANT_TOKEN, twelve hours long) for POST /owner/say."""
        url = (os.environ.get("SEXTANT_URL") or "http://agent:8000").rstrip("/")
        secret, owner = os.environ.get("SESSION_SECRET", ""), os.environ.get("SEXTANT_TOKEN", "")
        if secret:
            path, tok, body = "/builder/say", build_token(secret), {"text": text[:6000]}
        elif owner:
            path, tok, body = "/owner/say", owner, {"text": text[:4000], "to": "sextant"}
        else:
            return None
        req = urllib.request.Request(url + path, data=json.dumps(body).encode(), headers={"content-type": "application/json", "authorization": "Bearer " + tok})
        with urllib.request.urlopen(req, timeout=float(os.environ.get("SEXTANT_TIMEOUT") or 120)) as r:
            j = json.loads(r.read() or b"{}")
        return str((j.get("answer") or j.get("reply") or "") if isinstance(j, dict) else "")

    def to_sextant(self, key: str, text: str, e: dict | None = None):
        msg = text + "\n\n" + factory.REPLY_FORMAT if e else text
        try:
            ans = self.sextant(msg)
        except Exception as ex:
            self.say("SYS", "", f"SEXTANT did not answer: {str(ex)[:120]}; kept in the outbox", "bad")
            ans = None
        if ans is None:
            self.outbox(key, "SEXTANT", msg)
            return
        self.say("TESTER", "→ SEXTANT", msg)
        if ans:
            self.say("SEXTANT", "→ TESTER", ans)
            if e:
                self.take(e, ans, "SEXTANT")

    def to_tester(self, key: str, text: str, e: dict | None = None):
        msg, ans = (text + "\n\n" + factory.REPLY_FORMAT if e else text), None
        if self.ask_tester:
            try:
                ans = self.ask_tester(msg[:3500])
            except Exception as ex:
                self.say("SYS", "", f"TESTER's agent did not answer: {str(ex)[:120]}", "bad")
        if ans is None:
            self.outbox(key, "TESTER", msg)
            return
        self.say("TESTER", "thinks", ans)
        if e and ans:
            self.take(e, ans, "TESTER")

    def take(self, e: dict, text: str, who: str) -> int:
        """`--- file:` blocks in a reply land in TESTER's draft of e; the repo is built again and verified next round."""
        files = factory.take_files(text)
        if not files:
            return 0
        self.draft(e, files)
        self.set_repo(e["id"], status="built", nfiles=len(self.files_of(e)))
        names = list(files)
        self.say(who, "→ TESTER", f"wrote {len(names)} file(s) for {e['name']}: {', '.join(names[:6])}{' …' if len(names) > 6 else ''}; TESTER verifies them next round", "ok")
        return len(names)

    def reply(self, rid: str, text: str, who: str = "OWNER") -> dict:
        """A reply pasted in the Build Room, from SEXTANT's terminal or from Claude: the same as an answer the loop received itself."""
        e = self.entry(rid)
        if not e:
            return {"ok": False, "files": 0, "why": "no such repo"}
        n = self.take(e, text, who)
        self.save()
        return {"ok": bool(n), "files": n, "why": "" if n else "no --- file: blocks in the reply"}

    def outbox(self, key: str, to: str, text: str):
        with self.lock:
            self.s["outbox"] = ([o for o in self.s["outbox"] if o["id"] != key] + [{"id": key, "to": to, "text": text, "t": time.time() * 1000}])[-100:]
            with (self.state / "outbox.jsonl").open("a", encoding="utf-8") as f:
                f.write(json.dumps({"id": key, "to": to, "text": text, "t": time.time()}) + "\n")

    # — the site —
    def spec(self):
        rel = self.e2e.get("spec") or "apps/tester/e2e/journeys.json"
        return next((root for root in (self.repo, self.work) if (root / rel).exists()), None), rel

    def site(self) -> str:
        root, rel = self.spec()
        try:
            return json.loads((root / rel).read_text()).get("site", "the site") if root else "the site"
        except (OSError, ValueError):
            return "the site"

    def journeys(self, widths: list) -> list:
        import qa
        root, rel = self.spec()
        if root is None:
            return []
        env = {k: v for k, v in os.environ.items() if k.startswith("E2E_")}
        return qa.run_journeys(root, root / rel, widths, env)

    def walk(self, widths: list) -> dict:
        try:
            rows = self.walker(widths)
        except Exception as ex:
            self.say("SYS", "", f"the site walk did not run: {str(ex)[:160]}", "bad")
            return {"ok": 0, "bad": 0, "skipped": True}
        ok = bad = 0
        site = self.site()
        for r in rows:
            with self.lock:
                self.s["e2e"].setdefault(r["id"], {})[str(r["width"])] = {"ok": bool(r.get("ok")), "skipped": r.get("skipped", ""), "why": r.get("why", ""),
                                                                          "ms": int(r.get("ms") or 0), "at": time.time() * 1000}
            if r.get("skipped"):
                continue
            if r.get("ok"):
                ok += 1
            else:
                bad += 1
                self.say("TESTER", "", f"journey {r['id']} @ {r['width']} px failed · {r.get('why', '')}", "bad")
                self.to_tester(f"e2e:{r['id']}:{r['width']}:{r.get('why', '')}", f"The site ({site}) fails journey {r['id']} at {r['width']} px: {r.get('why', '')}")
        self.say("TESTER", "", f"journeys at {', '.join(map(str, widths))} px: {ok} passed, {bad} failed", "bad" if bad else "ok")
        return {"ok": ok, "bad": bad, "skipped": ok + bad == 0}         # a walk where nothing ran is not a clean walk

    # — the round —
    def audit(self, reg: list) -> list:
        """What to improve in what already passes. A proposal stays open while its condition holds and closes when it clears."""
        out = []
        for e in reg:
            v = self.st(e["id"])
            if v.get("status") != "passing":
                continue
            t = v.get("tests") or {}
            if t and not t.get("skipped") and t.get("passed", 0) < 6:
                out.append({"id": e["id"] + ":tests", "who": "SEXTANT", "repo": e["id"], "text": f"{e['name']} has {t['passed']} tests; add cases for its edge conditions."})
            if v.get("finding", 0) < 240:
                out.append({"id": e["id"] + ":finding", "who": "SEXTANT", "repo": e["id"], "text": f"{e['name']}: the Finding is {v.get('finding', 0)} characters; name the source and the number it rests on."})
            if not v.get("hasUse"):
                out.append({"id": e["id"] + ":use", "who": "SEXTANT", "repo": e["id"], "text": f"{e['name']} has no Use section; show the three calls a reader needs."})
        with self.lock:
            walks = json.loads(json.dumps(self.s["e2e"]))
        for jid, by_w in walks.items():
            for w, r in by_w.items():
                if r.get("ok") and r.get("ms", 0) > 25000:
                    out.append({"id": f"e2e:{jid}:{w}:slow", "who": "TESTER", "text": f"Journey {jid} takes {round(r['ms'] / 1000)} s at {w} px; find the slow step."})
        return out

    def refresh(self, reg: list):
        """A repo whose files changed since TESTER last looked (an agent, Claude or the owner wrote to it) is built again: verify it."""
        for e in reg:
            v = self.st(e["id"])
            if v.get("status") not in ("briefed", "packed", "failing", "passing") or not v.get("fp"):
                continue
            files = self.files_of(e)
            if files and fingerprint(files) != v["fp"]:
                self.set_repo(e["id"], status="built")
                self.say("TESTER", "", f"{e['name']}: its files changed since the last test; verifying", "info")

    def plan(self, reg: list, i: int) -> list:
        k, st = int(self.cfg.get("per_round", 3)), lambda e: self.s["st"].get(e["id"], {})
        every = int(self.cfg.get("retry_every", 3))
        order = sorted(reg, key=lambda e: (e.get("wave", 9), reg.index(e)))
        with self.lock:
            asked = [e for rid in self.asked for e in reg if e["id"] == rid]
        verify = [e for e in order if st(e).get("status") == "built"]
        retry = [e for e in order if st(e).get("status") == "failing" and i - st(e).get("lastRound", 0) >= every]
        fresh = [e for e in order if st(e).get("status", "queued") == "queued"]
        seen, work = set(), []
        for e in asked + verify + retry + fresh:
            if e["id"] not in seen:
                seen.add(e["id"])
                work.append(e)
        return work[:max(k, len(asked))]

    def round_once(self, i: int) -> bool:
        reg = self.repos()
        self.refresh(reg)
        work = self.plan(reg, i)
        every = int(self.cfg.get("e2e_every", 10))
        all_w = [int(w) for w in (self.e2e.get("widths") or WIDTHS)]
        widths = all_w if i == 1 or i % every == 0 else [all_w[i % len(all_w)]]
        verbs = {"failing": "re-test ", "built": "verify ", "briefed": "build "}
        verb = lambda e: (("brief SEXTANT on " if e.get("builder") == "sextant" or not e.get("sources") else "pack ")
                          if self.st(e["id"]).get("status", "queued") == "queued" else verbs.get(self.st(e["id"]).get("status"), "test "))
        plan = [verb(e) + e["name"] for e in work] + [f"walk the site at {', '.join(map(str, widths))} px", "audit what passes, for what to improve"]
        with self.lock:
            self.s.update(phase="plan", plan=plan)
            done = {e["id"] for e in work}
            self.asked = [r for r in self.asked if r not in done]
        self.say("PLAN", f"round {i}", " · ".join(plan))
        for e in work:
            if self.stop_flag:
                return False
            self.step(e, i)
            self.save()
        if self.stop_flag:
            return False
        with self.lock:
            self.s["phase"] = "e2e"
        ee = self.walk(widths)
        with self.lock:
            self.s["phase"] = "audit"
            known = {p["id"] for p in self.s["proposals"]}
        by = {e["id"]: e for e in reg}
        current = self.audit(reg)
        fresh = [p for p in current if p["id"] not in known]
        for p in fresh:
            (self.to_sextant if p["who"] == "SEXTANT" else self.to_tester)(p["id"], p["text"], by.get(p.get("repo")))
        if fresh:
            self.say("TESTER", "", f"audit to improve: {len(fresh)} new proposal(s)")
        vals = [self.st(e["id"]) for e in reg]
        n = lambda k: sum(1 for v in vals if v.get("status") == k)
        h = {"i": i, "t": time.time() * 1000, "passing": n("passing"), "failing": n("failing"), "built": n("built"), "packed": n("packed") + n("briefed"),
             "e2eOk": ee.get("ok", 0), "e2eBad": ee.get("bad", 0)}
        open_ids = {p["id"] for p in current}
        with self.lock:
            self.s["round"] = i
            self.s["history"] = (self.s["history"] + [h])[-500:]
            self.s["proposals"] = ([p for p in self.s["proposals"] if p["id"] in open_ids] + fresh)[-100:]
            all_pass = bool(reg) and n("passing") == len(reg)
            self.s["clean"] = self.s["clean"] + 1 if all_pass and not ee.get("bad") and not ee.get("skipped") else 0
        with (self.state / "rounds.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(h) + "\n")
        if self.edit and i % 5 == 0:
            self.write_registry()
        self.save()
        return True

    def write_registry(self):
        d = self.registry()
        d["generated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for r in d["repos"]:
            s = self.st(r["id"]).get("status")
            if s and s != "testing":
                r["status"] = s
        (self.repo / "repos" / "registry.json").write_text(json.dumps(d, indent=1))
        self.say("TESTER", "", "wrote repo statuses to repos/registry.json", "ok")

    # — the loop —
    def run(self, target=None):
        target = int(target or self.s["target"])
        with self.lock:
            self.s.update(target=target, running=True, resume=False)
        self.stop_flag = False
        self.save()
        self.say("OWNER", "→ TESTER", f"run to round {target}: plan, build, test till pass, walk the site, audit to improve, repeat", "you")
        i = self.s["round"]
        while i < target and not self.stop_flag:
            i += 1
            try:
                with self.busy:
                    self.round_once(i)
            except Exception as ex:
                self.say("SYS", "", f"round {i} stopped on an error: {str(ex)[:200]}", "bad")
                with self.lock:
                    self.s["round"] = i
                self.save()
            if self.s.get("clean", 0) >= 3:
                self.say("TESTER", "", "every repo passes and three site walks in a row are clean; stopping early", "ok")
                break
            time.sleep(float(self.cfg.get("pause_seconds", 1)))
        with self.lock:
            self.s.update(running=False, phase="paused" if self.stop_flag else "done")
        self.save()

    def start(self, target=None) -> dict:
        if self.thread and self.thread.is_alive():
            return {"ok": False, "why": "already running"}
        self.thread = threading.Thread(target=self.run, args=(target,), daemon=True, name="build-loop")
        self.thread.start()
        return {"ok": True}

    def stop(self, resume: bool = False) -> dict:
        """Pause after the current step. resume=True (the container stopping) marks the run to start again at the next boot."""
        self.stop_flag = True
        if resume and self.thread and self.thread.is_alive():
            with self.lock:
                self.s["resume"] = True
            self.save()
        return {"ok": True}

    def one(self, rid: str) -> dict:
        """Build and test one repo now: at the head of the next round while the loop runs, else on its own thread."""
        e = self.entry(rid)
        if not e:
            return {"ok": False, "why": "no such repo"}
        if self.thread and self.thread.is_alive():
            with self.lock:
                if rid not in self.asked:
                    self.asked.append(rid)
            self.say("OWNER", "→ TESTER", f"build and test {e['name']} at the head of the next round", "you")
            return {"ok": True, "queued": True}
        threading.Thread(target=self._one, args=(e,), daemon=True, name="build-one").start()
        return {"ok": True, "queued": False}

    def _one(self, e: dict):
        with self.busy:
            self.say("OWNER", "→ TESTER", f"build and test {e['name']} now", "you")
            try:
                self.step(e, self.s["round"])
            except Exception as ex:
                self.say("SYS", "", f"{e['name']}: {str(ex)[:200]}", "bad")
            with self.lock:
                self.s["phase"] = "idle"
            self.save()

    def reset(self) -> dict:
        """Rounds, statuses, walks and messages cleared; TESTER's drafts are kept, so nothing an agent wrote is lost."""
        if (self.thread and self.thread.is_alive()) or self.busy.locked():
            return {"ok": False, "why": "pause the loop first"}
        with self.lock:
            (self.state / "status.json").unlink(missing_ok=True)
            (self.state / "rounds.jsonl").unlink(missing_ok=True)
            self.s, self.asked = self._load(), []
        self.say("OWNER", "→ TESTER", "reset: rounds, statuses, walks and messages cleared; drafts in state/build/repos are kept", "you")
        self.save()
        return {"ok": True}
