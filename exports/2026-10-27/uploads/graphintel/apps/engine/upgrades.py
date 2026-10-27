"""Planned upgrades. The agent reads its own source and proposes changes; it never writes them (the code is read-only to it, on
disk and by permission). A proposal is a file under state/upgrades/. Approving one tests the diff in the sandbox, then opens a
pull request through the GitHub API; a plan without a diff becomes an issue. Merging and redeploying stay with the owner."""
import base64
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("THRESHOLD_ROOT") or HERE.parents[1])
STATE = Path(os.environ.get("THRESHOLD_STATE") or HERE / "state")
DIR = STATE / "upgrades"
CFG: dict = {}                                   # {"repo": "owner/name", "base": "main"}
log = logging.getLogger("upgrades")


def _slug(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40] or "upgrade"


def propose(title: str, rationale: str, diff: str = "") -> dict:
    DIR.mkdir(parents=True, exist_ok=True)
    key = f"{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}-{_slug(title)}"
    rec = {"id": f"upgrade:{key}", "key": key, "title": title[:120], "rationale": rationale[:4000], "diff": diff, "status": "proposed",
           "ts": datetime.now(timezone.utc).isoformat()}
    _save(rec)
    return rec


def _save(rec: dict):
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / f"{rec['key']}.json").write_text(json.dumps(rec))


def get(key: str) -> dict | None:
    p = DIR / f"{key}.json"
    return json.loads(p.read_text()) if p.exists() and "/" not in key else None


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DIR.glob("*.json"))] if DIR.exists() else []


def _gh(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def open_pr(repo: str, token: str, branch: str, base: str, files: dict, title: str, body: str) -> str:
    """Branch from `base`, commit each changed file through the contents API, open the pull request. Returns its URL."""
    api, h = f"https://api.github.com/repos/{repo}", _gh(token)
    with httpx.Client(timeout=30, headers=h) as c:
        sha = c.get(f"{api}/git/ref/heads/{base}").raise_for_status().json()["object"]["sha"]
        r = c.post(f"{api}/git/refs", json={"ref": f"refs/heads/{branch}", "sha": sha})
        if r.status_code not in (201, 422):                      # 422: the branch exists from an earlier attempt
            r.raise_for_status()
        for path, content in files.items():
            cur = c.get(f"{api}/contents/{path}", params={"ref": branch})
            put = {"message": title, "content": base64.b64encode(content.encode()).decode(), "branch": branch}
            if cur.status_code == 200:
                put["sha"] = cur.json()["sha"]
            c.put(f"{api}/contents/{path}", json=put).raise_for_status()
        pr = c.post(f"{api}/pulls", json={"title": title, "head": branch, "base": base, "body": body})
        if pr.status_code == 422:                                # a pull request for this branch is already open
            found = c.get(f"{api}/pulls", params={"head": f"{repo.split('/')[0]}:{branch}", "state": "open"}).json()
            return found[0]["html_url"] if found else pr.raise_for_status()
        return pr.raise_for_status().json()["html_url"]


def open_issue(repo: str, token: str, title: str, body: str) -> str:
    r = httpx.post(f"https://api.github.com/repos/{repo}/issues", json={"title": title, "body": body}, headers=_gh(token), timeout=30)
    return r.raise_for_status().json()["html_url"]


def verify(diff: str, sandbox) -> dict:
    """Apply the diff to a copy of apps/engine inside the sandbox and run the whole test suite there."""
    files = sandbox.tree(ROOT, only=("apps/engine",), skip=("state", "__pycache__", ".pytest_cache"))
    patched = sandbox.apply_diff(files, diff)
    if patched is None:
        return {"ok": False, "applied": False, "out": "the diff did not apply", "patched": {}, "changed": []}
    r = sandbox.run("python", patched, "cd apps/engine && python -m pytest -q -p no:cacheprovider", 900, sandbox.REPAIR_IMAGE, True)
    out = r["stdout"] + r["stderr"]
    return {"ok": r["exit"] == 0, "applied": True, "out": out, "patched": patched, "changed": [p for p in patched if files.get(p) != patched[p]]}


def deliver(branch: str, title: str, body: str, v: dict, key: str, diff: str) -> tuple[str | None, str]:
    """A verified change leaves through a pull request; with no repository or token it is kept as a patch for the owner."""
    repo, token = CFG.get("repo"), os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    if repo and token:
        try:
            return open_pr(repo, token, branch, CFG.get("base", "main"), {p: v["patched"][p] for p in v["changed"]}, title, body), "pr_opened"
        except Exception as ex:
            log.warning("pull request failed, keeping the patch: %s", ex)
    p = STATE / "patches" / f"{key}.diff"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(diff)
    return None, "patch_saved"


def act(key: str, action: str, sandbox) -> dict:
    rec = get(key)
    if not rec:
        return {"ok": False, "error": "unknown upgrade"}
    if rec["status"] != "proposed":
        return {"ok": False, "error": f"already {rec['status']}"}
    if action == "decline":
        rec["status"] = "declined"
        _save(rec)
        return {"ok": True}
    if action != "approve":
        return {"ok": False, "error": f"cannot {action} an upgrade"}
    repo, token = CFG.get("repo"), os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    if not rec.get("diff"):
        rec["pr"] = open_issue(repo, token, rec["title"], rec["rationale"]) if repo and token else None
        rec["status"] = "issue_opened" if rec["pr"] else "approved"
        _save(rec)
        return {"ok": True, "status": rec["status"], "url": rec["pr"]}
    if not sandbox.available("agent"):
        return {"ok": False, "error": "sandbox unavailable"}
    v = verify(rec["diff"], sandbox)
    rec["tests"] = v["out"][-1500:]
    if not v["ok"]:
        rec["status"] = "tests_failed" if v["applied"] else "patch_failed"
        _save(rec)
        return {"ok": False, "error": rec["status"], "tests": rec["tests"][-400:]}
    body = f"{rec['rationale']}\n\nProposed by SEXTANT, approved by the owner.\n\n**Sandbox tests**\n```\n{rec['tests'][-800:]}\n```"
    rec["pr"], rec["status"] = deliver(f"upgrade/{key}", f"upgrade: {rec['title']}", body, v, key, rec["diff"])
    _save(rec)
    return {"ok": True, "status": rec["status"], "url": rec["pr"]}
