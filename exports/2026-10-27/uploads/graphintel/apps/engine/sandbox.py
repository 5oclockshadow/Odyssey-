"""Docker-in-Docker. Everything the agent writes or runs, in any language, runs inside the agent's own daemon (agent-dind);
everything it ships runs inside the site's (web-dind), behind the site at /a/<port>/. Phoenix lives in agent-dind too."""
import io
import json
import os
import re
import shutil
import tarfile
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
ROOT = Path(os.environ.get("THRESHOLD_ROOT") or HERE.parents[1])
HUB_IMAGE = "threshold/hub:latest"
QUEUE = STATE / "apps" / "queue"
CFG: dict = {}
REPAIR_IMAGE = "threshold/py:latest"
LANGS = {
    "python":     {"image": "python:3.12-slim",   "file": "main.py",     "run": "python main.py",      "test": "pip install -q pytest >/dev/null 2>&1; [ -f requirements.txt ] && pip install -q -r requirements.txt >/dev/null 2>&1; python -m pytest -q", "port": 8000, "tests": ("test_", "_test.py")},
    "node":       {"image": "node:22-alpine",     "file": "main.js",     "run": "node main.js",        "test": "[ -f package.json ] && npm install --silent >/dev/null 2>&1; node --test", "port": 3000, "tests": (".test.js", ".test.mjs")},
    "typescript": {"image": "node:22-alpine",     "file": "main.ts",     "run": "npx -y tsx main.ts",  "test": "npx -y tsx --test", "port": 3000, "tests": (".test.ts",)},
    "go":         {"image": "golang:1.23-alpine", "file": "main.go",     "run": "go run .",            "test": "[ -f go.mod ] || go mod init app >/dev/null 2>&1; go test ./...", "port": 8080, "tests": ("_test.go",)},
    "rust":       {"image": "rust:1.82-slim",     "file": "src/main.rs", "run": "cargo run --quiet",   "test": "cargo test --quiet", "port": 8080, "tests": ("tests/",)},
    "bash":       {"image": "bash:5",             "file": "main.sh",     "run": "bash main.sh",        "test": "bash test.sh", "port": 8080, "tests": ("test.sh",)},
    "ruby":       {"image": "ruby:3.3-slim",      "file": "main.rb",     "run": "ruby main.rb",        "test": "ruby test.rb", "port": 4567, "tests": ("test.rb", "_test.rb")},
    "c":          {"image": "gcc:14",             "file": "main.c",      "run": "gcc -O2 -o app main.c && ./app", "test": "gcc -o t test.c && ./t", "port": 8080, "tests": ("test.c",)},
}


def _host(which):
    return os.environ.get("AGENT_DOCKER_HOST" if which == "agent" else "WEB_DOCKER_HOST") or CFG.get(f"{which}_host")


def client(which="agent"):
    import docker
    host = _host(which)
    return docker.DockerClient(base_url=host, timeout=180) if host else docker.from_env(timeout=180)


def available(which="agent") -> bool:
    try:
        return bool(client(which).ping())
    except Exception:
        return False


def web_hostname() -> str:
    """Where web-dind's published ports are reachable from the engine (and from nginx, which uses the same name)."""
    h = _host("web") or "tcp://web-dind:2375"
    return h.split("://")[-1].split(":")[0]


def _tar(files: dict, prefix="") -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as t:
        for path, content in files.items():
            data = content.encode() if isinstance(content, str) else content
            info = tarfile.TarInfo(prefix + path)
            info.size, info.mode, info.mtime = len(data), 0o755 if path.endswith(".sh") else 0o644, int(time.time())
            t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def _untar(stream) -> dict[str, str]:
    data = b"".join(stream)
    out = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        for m in t.getmembers():
            if m.isfile():
                rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
                out[rel] = t.extractfile(m).read().decode(errors="replace")
    return out


def tree(root, only=None, skip=()) -> dict[str, str]:
    """Text files under root as {relative path: content}. `only` keeps path prefixes; `skip` drops any path part."""
    root, out = Path(root), {}
    for p in root.rglob("*"):
        rel = p.relative_to(root).as_posix()
        if not p.is_file() or any(s in p.parts for s in skip) or (only and not rel.startswith(tuple(only))):
            continue
        try:
            out[rel] = p.read_text()
        except (UnicodeDecodeError, OSError):
            pass
    return out


def _limits():
    return {"mem_limit": CFG.get("memory", "1g"), "nano_cpus": int(float(CFG.get("cpus", 1)) * 1e9)}


def _image(c, name):
    try:
        c.images.get(name)
    except Exception:
        c.images.pull(name)
    return name


def run(language: str, files: dict, cmd: str | None = None, timeout: int = 120, image: str | None = None, network: bool | None = None) -> dict:
    """Run files in a fresh container in agent-dind and return exit code, stdout, stderr. No network unless asked.
    `language` is one of LANGS, or any label when `image` and `cmd` are given: that is how every other language runs."""
    spec, c = LANGS.get(language) or {"image": image, "run": cmd}, client("agent")
    if not (spec.get("image") and (cmd or spec.get("run"))):
        raise ValueError(f"unknown language {language}: pass image= and cmd=")
    img = image or spec["image"]
    if not _has(c, img):
        img = ensure_images() if img == REPAIR_IMAGE else _image(c, img)
    net_off = not (CFG.get("network", False) if network is None else network)
    cont = c.containers.create(img, command=["sh", "-lc", cmd or spec["run"]], working_dir="/work", network_disabled=net_off,
                               labels={"threshold": "sandbox"}, **_limits())
    try:
        cont.put_archive("/", _tar(files, prefix="work/"))
        cont.start()
        try:
            res = cont.wait(timeout=timeout)
        except Exception:
            cont.kill()
            res = {"StatusCode": 124}
        out = cont.logs(stdout=True, stderr=False).decode(errors="replace")
        err = cont.logs(stdout=False, stderr=True).decode(errors="replace")
    finally:
        cont.remove(force=True)
    return {"exit": res.get("StatusCode", 1), "stdout": out[-20000:], "stderr": err[-20000:]}


def apply_diff(files: dict, diff: str) -> dict | None:
    """Apply a unified diff to a file tree inside the repair image (it has git) and return the patched tree, or None."""
    c = client("agent")
    img = REPAIR_IMAGE if _has(c, REPAIR_IMAGE) else _image(c, "python:3.12")
    cont = c.containers.create(img, command=["sh", "-lc", "git apply --whitespace=nowarn fix.diff && rm fix.diff"], working_dir="/work", network_disabled=True, **_limits())
    try:
        cont.put_archive("/", _tar({**files, "fix.diff": diff}, prefix="work/"))
        cont.start()
        if cont.wait(timeout=60).get("StatusCode") != 0:
            return None
        stream, _ = cont.get_archive("/work")
        return _untar(stream)
    finally:
        cont.remove(force=True)


def _has(c, name) -> bool:
    try:
        c.images.get(name)
        return True
    except Exception:
        return False


def has_tests(language: str, files: dict) -> bool:
    return any(any(p.startswith(m) or p.endswith(m) or m in p for m in LANGS[language]["tests"]) for p in files)


def dockerfile_for(language: str, files: dict, port: int) -> str:
    spec, serve = LANGS[language], LANGS[language]["run"]
    lines = [f"FROM {spec['image']}", "WORKDIR /app", "COPY . ."]
    if language == "python":
        lines.append("RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi")
    elif language in ("node", "typescript"):
        lines.append("RUN if [ -f package.json ]; then npm install --omit=dev; fi")
    elif language == "go":
        lines += ["RUN if [ ! -f go.mod ]; then go mod init app; fi", "RUN go build -o /app/server ."]
        serve = "/app/server"
    elif language == "rust":
        lines.append("RUN cargo build --release")
        serve = "./target/release/" + next((ln.split('"')[1] for ln in files.get("Cargo.toml", "").splitlines() if ln.strip().startswith("name")), "app")
    elif language == "c":
        lines.append("RUN gcc -O2 -o server main.c")
        serve = "./server"
    lines += [f"ENV PORT={port}", f"EXPOSE {port}", f'CMD ["sh", "-lc", "{serve}"]']
    return "\n".join(lines) + "\n"


def build(name: str, language: str, files: dict, port: int) -> str:
    """Build the app image inside agent-dind."""
    tag = f"threshold/app-{name}:{int(time.time())}"
    ctx = {**files}
    ctx.setdefault("Dockerfile", dockerfile_for(language, files, port))
    client("agent").images.build(fileobj=io.BytesIO(_tar(ctx)), custom_context=True, tag=tag, rm=True)
    return tag


def transfer(tag: str):
    """Images do not cross daemons; save from agent-dind, load into web-dind."""
    client("web").images.load(b"".join(client("agent").images.get(tag).save()))


def registry_path() -> Path:
    return Path(os.environ.get("APPS_REGISTRY") or CFG.get("registry") or HERE / "../web/dist/apps/apps.json").resolve()


def registry() -> dict:
    p = registry_path()
    reg = json.loads(p.read_text()) if p.exists() else {}
    reg.setdefault("apps", {})
    reg.setdefault("ports", list(CFG.get("ports", [8100, 8199])))
    return reg


def save_registry(reg: dict):
    p = registry_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(reg, indent=1))


def allocate(reg: dict) -> int:
    used = {a["port"] for a in reg["apps"].values()}
    lo, hi = reg["ports"]
    return next(p for p in range(lo, hi + 1) if p not in used)


def wait_healthy(port: int, tries: int = 20) -> bool:
    for _ in range(tries):
        try:
            if httpx.get(f"http://{web_hostname()}:{port}/", timeout=3).status_code < 500:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def publish(name: str, tag: str, port: int, language: str) -> dict:
    """Run the image in web-dind on a stable host port, health-check it, write the registry the site reads."""
    reg = registry()
    host_port = reg["apps"].get(name, {}).get("port") or allocate(reg)
    w = client("web")
    for old in w.containers.list(all=True, filters={"name": f"^app-{name}$"}):
        old.remove(force=True)
    w.containers.run(tag, name=f"app-{name}", detach=True, ports={f"{port}/tcp": host_port}, restart_policy={"Name": "always"},
                     labels={"threshold": "app", "app": name}, environment={"PORT": str(port)}, **_limits())
    entry = {"name": name, "language": language, "port": host_port, "image": tag, "published": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
             "healthy": wait_healthy(host_port), "url": f"/a/{host_port}/", "restarts": reg["apps"].get(name, {}).get("restarts", 0)}
    reg["apps"][name] = entry
    save_registry(reg)
    return entry


def ship(name: str, language: str, files: dict, port: int | None = None) -> dict:
    """Tests in agent-dind → build → move the image to web-dind → run → health → registry. The source is kept so a crash can be traced to it."""
    spec = LANGS[language]
    port = int(port or spec["port"])
    appdir = STATE / "apps" / name
    if appdir.exists():
        shutil.rmtree(appdir)
    for p, content in files.items():
        (appdir / p).parent.mkdir(parents=True, exist_ok=True)
        (appdir / p).write_text(content)
    (appdir / "ship.json").write_text(json.dumps({"name": name, "language": language, "port": port}))
    if has_tests(language, files):
        t = run(language, files, spec["test"], timeout=600, network=True)
        if t["exit"] != 0:
            return {"name": name, "ok": False, "stage": "tests", "output": (t["stdout"] + t["stderr"])[-3000:]}
        output = t["stdout"][-1500:]
    else:
        output = "no tests shipped"
    tag = build(name, language, files, port)
    transfer(tag)
    entry = publish(name, tag, port, language)
    return {"name": name, "ok": entry["healthy"], "stage": "live" if entry["healthy"] else "unhealthy", "output": output, **entry}


def app_meta(name: str) -> dict | None:
    p = STATE / "apps" / name / "ship.json"
    return json.loads(p.read_text()) if p.exists() else None


_since: dict[str, int] = {}
LOG_ERROR = re.compile(r"error|exception|traceback|fatal|panic", re.I)


def reconcile() -> list[dict]:
    """Every five minutes: ship what is queued under state/apps/queue/<name>/, restart what stopped, re-check health, rewrite the registry."""
    events = []
    for q in sorted(QUEUE.glob("*/ship.json")):
        meta = json.loads(q.read_text())
        files = {p.relative_to(q.parent).as_posix(): p.read_text() for p in q.parent.rglob("*") if p.is_file() and p.name != "ship.json"}
        r = ship(meta["name"], meta["language"], files, meta.get("port"))
        events.append({"event": "shipped" if r["ok"] else "ship_failed", **r})
        shutil.rmtree(q.parent)
    if not available("web"):
        return events
    w, reg = client("web"), registry()
    for name, a in reg["apps"].items():
        cs = w.containers.list(all=True, filters={"name": f"^app-{name}$"})
        if not cs:
            a["healthy"] = False
            events.append({"event": "missing", "name": name})
            continue
        c = cs[0]
        if c.status != "running":
            logs = c.logs(tail=80).decode(errors="replace")
            c.restart()
            a["restarts"] = a.get("restarts", 0) + 1
            events.append({"event": "crashed", "name": name, "logs": logs, "restarts": a["restarts"], "language": a["language"]})
        else:                                                            # the app's own log lines reach the graph too
            now = int(time.time())
            for line in c.logs(since=_since.get(name, now - 300), tail=200).decode(errors="replace").splitlines():
                if LOG_ERROR.search(line):
                    events.append({"event": "app_log", "name": name, "line": line.strip()[:200]})
            _since[name] = now
        a["healthy"] = wait_healthy(a["port"], tries=5)
    save_registry(reg)
    return events


def act(name: str, action: str) -> dict:
    """Owner actions on an app: relaunch, remove."""
    reg = registry()
    if name not in reg["apps"]:
        return {"ok": False, "error": "unknown app"}
    w = client("web")
    cs = w.containers.list(all=True, filters={"name": f"^app-{name}$"})
    if action == "relaunch":
        for c in cs:
            c.restart()
        reg["apps"][name]["healthy"] = wait_healthy(reg["apps"][name]["port"])
        save_registry(reg)
        return {"ok": True, "healthy": reg["apps"][name]["healthy"]}
    if action == "remove":
        for c in cs:
            c.remove(force=True)
        del reg["apps"][name]
        save_registry(reg)
        return {"ok": True, "removed": name}
    return {"ok": False, "error": f"cannot {action} an app"}


def _svc(name: str) -> dict:
    s = CFG.get("services", {}).get(name, {})
    return {"mem_limit": s.get("memory", "512m"), "nano_cpus": int(float(s.get("cpus", 0.5)) * 1e9)}


def ensure_hub_image(c) -> str:
    """Build the MCP hub inside agent-dind from apps/mcp-hub, with a read-only copy of the repository baked in at /repo for the filesystem server."""
    if _has(c, HUB_IMAGE):
        return HUB_IMAGE
    ctx = tree(ROOT / "apps/mcp-hub")
    ctx.update({f"repo/{p}": t for p, t in tree(ROOT, only=("apps/engine", "apps/mcp-hub", "marketing", ".github", "README.md", "CHANGELOG.md", "docker-compose.yml"),
                                                 skip=("state", "__pycache__", ".pytest_cache", "fixtures")).items()})
    c.images.build(fileobj=io.BytesIO(_tar(ctx)), custom_context=True, tag=HUB_IMAGE, rm=True)
    return HUB_IMAGE


def ensure_services() -> list[str]:
    """Phoenix, Redis and the MCP hub run inside agent-dind, so the agent's docker holds everything the agent depends on. Each is published
    on the dind host: the engine reaches them at agent-dind:6006, :6379 and :8765. Returns the names started this call."""
    c, started = client("agent"), []

    def up(name, image, **kw):
        if c.containers.list(filters={"name": f"^{name}$"}):
            return
        for old in c.containers.list(all=True, filters={"name": f"^{name}$"}):
            old.remove(force=True)
        c.containers.run(image, name=name, detach=True, restart_policy={"Name": "always"}, **kw)
        started.append(name)

    up("phoenix", "arizephoenix/phoenix:latest", ports={"6006/tcp": 6006, "4317/tcp": 4317}, volumes={"phoenix-data": {"bind": "/mnt/data", "mode": "rw"}},
       environment={"PHOENIX_WORKING_DIR": "/mnt/data"}, **_svc("phoenix"))
    pw = os.environ.get("REDIS_PASSWORD", "")
    up("redis", "redis:7-alpine", ports={"6379/tcp": 6379}, volumes={"redis-data": {"bind": "/data", "mode": "rw"}},
       command=["redis-server", "--appendonly", "yes", "--maxmemory", "200mb", "--maxmemory-policy", "allkeys-lru"] + (["--requirepass", pw] if pw else []), **_svc("redis"))
    keys = ("HUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "SLACK_BOT_TOKEN", "SLACK_TEAM_ID", "WOLFRAM_API_KEY", "APIFY_TOKEN", "MCP_REGISTRY_URL")
    if not c.containers.list(filters={"name": "^mcp-hub$"}):
        ensure_hub_image(c)
    up("mcp-hub", HUB_IMAGE, ports={"8765/tcp": 8765},
       volumes={"/var/run/docker.sock": {"bind": "/var/run/docker.sock", "mode": "rw"}, "hub-data": {"bind": "/data", "mode": "rw"}},
       environment={k: os.environ[k] for k in keys if os.environ.get(k)}, **_svc("hub"))
    return started


def ensure_images():
    """The repair image: python with git and the engine's requirements already installed, so a repair run tests in seconds."""
    c = client("agent")
    if _has(c, REPAIR_IMAGE):
        return REPAIR_IMAGE
    ctx = {"Dockerfile": "FROM python:3.12\nCOPY requirements.txt /tmp/requirements.txt\nRUN pip install --no-cache-dir -r /tmp/requirements.txt\n",
           "requirements.txt": (HERE / "requirements.txt").read_text()}
    c.images.build(fileobj=io.BytesIO(_tar(ctx)), custom_context=True, tag=REPAIR_IMAGE, rm=True)
    return REPAIR_IMAGE
