"""Pages in a real browser: every page and site at each width, in Playwright's Chromium. A page fails on a console error, an uncaught
exception, a local file that does not load, a horizontal scroll, a blank body, text that leaks NaN, undefined or [object ...], or a
button with no name. The same checks scraps/qa.html runs by hand, here headless and on every run."""
import asyncio
import functools
import http.server
import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import quote, urlparse

CHECK_JS = """() => {
  const w = window, d = document, out = { fail: [], warn: [] }, iw = w.innerWidth, txt = d.body ? d.body.innerText : '', canvas = !!d.querySelector('meta[name="design_doc_mode"][content="canvas"], deck-stage, doc-page');
  if (txt.length < 60) out.fail.push('blank page');
  if (!canvas && d.documentElement.scrollWidth - iw > 2) out.fail.push('scroll: page is ' + (d.documentElement.scrollWidth - iw) + 'px wider than the screen');
  const clipped = el => { for (let p = el.parentElement; p && p !== d.body; p = p.parentElement) { const o = w.getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { const r = p.getBoundingClientRect(); if (r.right <= iw + 2) return true; } } return false; };
  const off = [];
  if (!canvas) d.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = w.getComputedStyle(el); if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') return; if (r.right > iw + 2 && !clipped(el) && off.length < 4) off.push(el.tagName.toLowerCase() + ' "' + (el.textContent || '').trim().slice(0, 30) + '" +' + Math.round(r.right - iw)); });
  off.forEach(x => out.fail.push('offscreen: ' + x));
  const prose = (() => { const c = d.body ? d.body.cloneNode(true) : null; if (!c) return ''; c.querySelectorAll('pre,code,textarea,script,style').forEach(x => x.remove()); return c.textContent || ''; })();
  ['NaN', 'undefined', '[object', 'null%'].forEach(b => { if (prose.includes(b)) out.fail.push('rendering: page text contains "' + b + '"'); });
  let nb = 0; d.querySelectorAll('button,a[href]').forEach(b => { if (!(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.title) nb++; });
  if (nb) out.fail.push('a11y: ' + nb + ' button or link with no name');
  if (d.querySelectorAll('img:not([alt])').length) out.warn.push('a11y: image without alt');
  return out;
}"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Static:
    """The working copy on 127.0.0.1, so pages load their scripts, styles and child components the way a browser would."""
    def __init__(self, root: Path):
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(root)))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


async def visit(browser, url: str, width: int, settle_ms: int, ignore) -> dict:
    ctx = await browser.new_context(viewport={"width": width, "height": 900})
    page = await ctx.new_page()
    errors, missing, host = [], [], urlparse(url).netloc

    def on_response(r):
        u = urlparse(r.url)
        if r.status >= 400 and u.netloc == host and not any(s in u.path for s in ignore):
            missing.append(f"{r.status} {u.path}")

    page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("uncaught " + str(e)[:300]))
    page.on("response", on_response)
    res = {"fail": [], "warn": []}
    try:
        await page.goto(url, wait_until="load", timeout=30000)
        await page.wait_for_timeout(settle_ms)
        res = await page.evaluate(CHECK_JS)
    except Exception as ex:
        res["fail"].append("load: " + str(ex).splitlines()[0][:200])
    finally:
        await ctx.close()
    errors = [e for e in errors if "Failed to load resource" not in e]       # judged by `missing`, which knows what to ignore
    res["fail"] += ["console: " + e for e in errors[:6]] + ["missing: " + m for m in missing[:6]]
    return res


async def _run(urls, widths, settle_ms, ignore) -> list:
    from playwright.async_api import async_playwright
    out = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            for label, url in urls:
                for w in widths:
                    out.append({"page": label, "url": url, "width": w, **await visit(browser, url, w, settle_ms, ignore)})
        finally:
            await browser.close()
    return out


def run_urls(urls, widths, settle_ms, ignore) -> list:
    return asyncio.run(_run(urls, widths, settle_ms, ignore))


def run_pages(root: Path, rels, widths, settle_ms, ignore) -> list:
    srv = Static(root)
    try:
        return run_urls([(r, f"http://127.0.0.1:{srv.port}/{quote(r)}") for r in rels], widths, settle_ms, ignore)
    finally:
        srv.close()


# — journeys: the same apps/tester/e2e/journeys.json that e2e.js runs in the Build Room, step for step —

VIS = "const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity !== 0; }; const first = s => [...document.querySelectorAll(s)].find(vis);"
JS = {
    "see": "s => { " + VIS + " return !!first(s); }",
    "gone": "s => { " + VIS + " return !first(s); }",
    "has": "([s, t]) => { " + VIS + " const e = first(s); return !!e && (e.innerText || e.textContent || '').toLowerCase().includes(t); }",
    "count": "([s, lo, hi]) => { " + VIS + " const n = [...document.querySelectorAll(s)].filter(vis).length; return n >= lo && (hi === null || n <= hi); }",
    "value": "([s, v]) => { " + VIS + " const e = first(s); return !!e && e.value === v; }",
}


def applies(j: dict, width: int) -> bool:
    return (not j.get("minWidth") or width >= j["minWidth"]) and (not j.get("maxWidth") or width <= j["maxWidth"])


async def journey(browser, url: str, j: dict, width: int, env: dict) -> dict:
    t0 = time.time()
    out = {"id": j["id"], "who": j.get("who", ""), "width": width, "ok": True, "steps": 0, "errors": []}
    need = [k for k in j.get("needs", []) if not env.get(k)]
    if need:
        return {**out, "skipped": "needs " + ", ".join(need)}
    ctx = await browser.new_context(viewport={"width": width, "height": 900})
    page = await ctx.new_page()
    page.on("console", lambda m: out["errors"].append(m.text[:240]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: out["errors"].append("uncaught " + str(e)[:240]))
    sub = lambda v: re.sub(r"\$([A-Z0-9_]+)", lambda m: env.get(m.group(1), m.group(0)), str(v))
    try:
        await page.goto(url, wait_until="load", timeout=30000)
        await page.wait_for_selector("[data-e2e]", timeout=15000)
        for i, s in enumerate(j["steps"]):
            t = s.get("timeout", 4000)
            vis = lambda sel: page.locator(sel + " >> visible=true").first
            try:
                if "go" in s:
                    await page.evaluate("h => { location.hash = h; }", "#" + str(s["go"]).lstrip("#"))
                    await page.wait_for_timeout(120)
                elif "back" in s:
                    await page.evaluate("() => history.back()")
                    await page.wait_for_timeout(200)
                elif "wait" in s:
                    await page.wait_for_timeout(s["wait"])
                elif "click" in s:
                    try:
                        await vis(s["click"]).click(timeout=t)
                    except Exception:
                        if not s.get("optional"):
                            raise AssertionError("nothing visible matches " + s["click"])
                elif "fill" in s:
                    el = vis(s["fill"])
                    if await el.evaluate("e => e.tagName", timeout=t) == "SELECT":
                        await el.select_option(sub(s.get("value", "")), timeout=t)
                    else:
                        await el.fill(sub(s.get("value", "")), timeout=t)
                elif "see" in s or "gone" in s:
                    op = "see" if "see" in s else "gone"
                    await page.wait_for_function(JS[op], arg=s[op], timeout=t)
                elif "has" in s:
                    await page.wait_for_function(JS["has"], arg=[s["has"], str(s.get("text", "")).lower()], timeout=t)
                elif "count" in s:
                    await page.wait_for_function(JS["count"], arg=[s["count"], s.get("min", 0), s.get("max")], timeout=t)
                elif "value" in s:
                    await page.wait_for_function(JS["value"], arg=[s["value"], s["is"]], timeout=t)
                out["steps"] = i + 1
            except Exception as ex:
                out.update(ok=False, failed=i, why=f"step {i + 1} {json.dumps(s)}: " + str(ex).splitlines()[0][:200])
                break
    except Exception as ex:
        out.update(ok=False, failed=-1, why="load: " + str(ex).splitlines()[0][:200])
    finally:
        await ctx.close()
    if out["ok"] and out["errors"]:
        out.update(ok=False, why="console: " + out["errors"][0])
    out["ms"] = int((time.time() - t0) * 1000)                          # as e2e.js reports it, so a slow journey is an audit proposal in both
    return out


async def _journeys(url, journeys, widths, env) -> list:
    from playwright.async_api import async_playwright
    out = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            for j in journeys:
                for w in widths:
                    if applies(j, w):
                        out.append(await journey(browser, url, j, w, env))
        finally:
            await browser.close()
    return out


def run_journeys(root: Path, spec: Path, widths=None, env=None) -> list:
    """Every journey in spec at every width it applies to, against the working copy. env fills $NAME values (E2E_KEY)."""
    d = json.loads(Path(spec).read_text())
    srv = Static(root)
    try:
        url = f"http://127.0.0.1:{srv.port}/{quote(d['site'])}"
        return asyncio.run(_journeys(url, d["journeys"], widths or d.get("widths", [390, 1440]), dict(os.environ if env is None else env)))
    finally:
        srv.close()
