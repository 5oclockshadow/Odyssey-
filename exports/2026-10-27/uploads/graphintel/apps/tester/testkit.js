/* TestKit: the tester in a browser tab. It loads the repository into Pyodide and runs TESTER's own Python (its tests, its graph of the
   code, its static checks), checks JavaScript syntax, and opens every page in a live iframe at six screen sizes, clicking through each
   page's tabs and views. Results come back as FAIL lines in the test-everything skill's words. window.TestKit; no build step. */
(function () {
  'use strict';
  var TK = {};
  TK.SIZES = [['phone small', 320], ['phone', 390], ['tablet portrait', 768], ['tablet landscape', 1024], ['laptop', 1440], ['TV', 1920]];
  TK.IGNORE = /\/api\/|\/health|\/ops\/|apps\.json|%7B%7B|\{\{/;            // engine and ops calls, the runtime app registry, holes requested mid-stream
  TK.DANGER = /reset|delete|remove|sign ?out|log ?out|clear|start over|retire|fire\b|publish|send|apply|approve|decline|pay|buy|upgrade|run|turn|ask|generate|propose|reprice|hire|connect|sign in|export|download|print|copy|install|ship|close|cancel|×|✕/i;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var enc = function (rel) { return rel.split('/').map(encodeURIComponent).join('/'); };
  TK.root = '../../';                                                      // the repository root, seen from apps/tester/

  TK.manifest = async function (base) {
    try { var r = await fetch((base || '') + '/files', { cache: 'no-store' }); if (r.ok) return (await r.json()).files; } catch (e) {}
    return (await (await fetch('manifest.json?' + Date.now())).json()).files;
  };

  // — pages: the same rules as apps/tester/qa.py —
  TK.check = function (w, d, opts) {
    var out = [], iw = w.innerWidth, txt = d.body ? d.body.innerText : '', canvas = !!d.querySelector('meta[name="design_doc_mode"][content="canvas"], deck-stage, doc-page');
    if (txt.length < 60) out.push(['blank', 'the page shows almost no text']);
    if (!canvas && d.documentElement.scrollWidth - iw > 2) out.push(['scroll', 'the page is ' + (d.documentElement.scrollWidth - iw) + 'px wider than the screen']);
    var clipped = function (el) { for (var p = el.parentElement; p && p !== d.body; p = p.parentElement) { var o = w.getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { if (p.getBoundingClientRect().right <= iw + 2) return true; } } return false; };
    if (!canvas) {
      var off = 0, ex = '';
      d.querySelectorAll('body *').forEach(function (el) { var r = el.getBoundingClientRect(); if (!r.width || !r.height) return; var cs = w.getComputedStyle(el); if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') return; if (r.right > iw + 2 && !clipped(el)) { off++; if (!ex) ex = el.tagName.toLowerCase() + ' "' + (el.textContent || '').trim().slice(0, 32) + '"'; } });
      if (off) out.push(['offscreen', off + ' element(s) stick out of the screen, e.g. ' + ex]);
    }
    var prose = (function () { var c = d.body ? d.body.cloneNode(true) : null; if (!c) return ''; c.querySelectorAll('pre,code,textarea,script,style').forEach(function (x) { x.remove(); }); return c.textContent || ''; })();
    ['NaN', 'undefined', '[object', 'null%'].forEach(function (b) { var i = prose.indexOf(b), txt = prose; if (i >= 0) out.push(['rendering', 'the text shows "' + b + '" near "' + txt.slice(Math.max(0, i - 30), i + 16).replace(/\s+/g, ' ') + '"']); });
    if (!(opts && opts.after)) {
      var nb = 0; d.querySelectorAll('button,a[href]').forEach(function (b) { if (!(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.title) nb++; });
      if (nb) out.push(['a11y', nb + ' button(s) or link(s) have no name']);
      if (d.querySelectorAll('img:not([alt])').length) out.push(['a11y', 'image without alt text']);
      var bad = {}; (w.performance.getEntriesByType('resource') || []).forEach(function (e) { if (e.responseStatus >= 400 && e.responseStatus !== 502 && e.name.indexOf(w.location.origin) === 0 && !TK.IGNORE.test(e.name)) bad[e.responseStatus + ' ' + decodeURIComponent(new URL(e.name).pathname).split('/serve/').pop()] = 1; });
      Object.keys(bad).slice(0, 4).forEach(function (b) { out.push(['request', b]); });
    }
    return out;
  };
  TK.hook = function (frame, sink) {
    var stop = false, t = setInterval(function () {
      try {
        var w = frame.contentWindow; if (!w || w.__tk || w.location.href === 'about:blank') return; w.__tk = 1;
        w.addEventListener('error', function (e) { sink('uncaught ' + (e.message || e.type) + (e.filename ? ' (' + decodeURIComponent(e.filename.split('/serve/').pop()) + ':' + e.lineno + ')' : '')); });
        w.addEventListener('unhandledrejection', function (e) { sink('unhandled rejection: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 160)); });
        var ce = w.console.error.bind(w.console); w.console.error = function () { var a = [].slice.call(arguments); sink(a.map(function (x) { return x && x.message ? x.message : typeof x === 'object' ? JSON.stringify(x) : String(x); }).join(' ').slice(0, 220)); ce.apply(null, a); };
      } catch (e) {}
      if (stop) clearInterval(t);
    }, 4);
    return function () { stop = true; };
  };
  TK.controls = function (d) {
    var seen = {}, list = [];
    d.querySelectorAll('button, label, [role=tab], [role=radio]').forEach(function (el) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim(), r = el.getBoundingClientRect();
      if (!t || t.length > 28 || TK.DANGER.test(t) || !r.width || !r.height || seen[t] || el.closest('a[href],form,[role=dialog]')) return;
      if (el.tagName === 'LABEL' && !el.querySelector('input[type=radio],input[type=checkbox]')) return;
      seen[t] = 1; list.push(t);
    });
    return list.slice(0, 16);
  };
  var find = function (d, t) { return [].slice.call(d.querySelectorAll('button, label, [role=tab], [role=radio]')).find(function (el) { return (el.textContent || '').replace(/\s+/g, ' ').trim() === t; }); };

  // Opens each page in `frame` (the dashboard's live view) at each width, then clicks its tabs at the widest. onStep(info) after every check.
  TK.uiSuite = async function (o) {
    var res = [], frame = o.frame, widths = o.widths, crawl = o.crawl !== false, settle = o.settle || 3200;
    try { var k = 'threshold_livesim_v2', s = JSON.parse(localStorage.getItem(k) || 'null'); if (s) { var was = s.paused; s.paused = true; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {}
    for (var i = 0; i < o.pages.length && !o.stop(); i++) {
      for (var j = 0; j < widths.length && !o.stop(); j++) {
        var page = o.pages[i], width = widths[j], errs = [], sink = function (m) { errs.push(m); };
        o.onOpen && o.onOpen(page, width);
        frame.style.width = width + 'px';
        var unhook = TK.hook(frame, sink);
        await new Promise(function (r) { frame.onload = r; frame.src = TK.root + enc(page) + '?tk=' + Date.now(); setTimeout(r, 15000); });
        await wait(settle); unhook();
        var w = frame.contentWindow, d = w.document, fails = [];
        try { fails = TK.check(w, d); } catch (e) { fails = [['harness', e.message]]; }
        errs.splice(0).filter(function (x, n, a) { return a.indexOf(x) === n; }).slice(0, 5).forEach(function (m) { fails.push(['console', m]); });
        var r1 = { page: page, width: width, step: '', fails: fails }; res.push(r1); o.onStep && o.onStep(r1);
        if (crawl && width === Math.max.apply(null, widths)) {
          var ctl = TK.controls(d);
          for (var c = 0; c < ctl.length && !o.stop(); c++) {
            var el = find(d, ctl[c]); if (!el) continue;
            try { el.click(); } catch (e) { errs.push('click threw ' + e.message); }
            await wait(800);
            var f2 = []; try { f2 = TK.check(w, d, { after: true }); } catch (e) {}
            errs.splice(0).filter(function (x, n, a) { return a.indexOf(x) === n; }).slice(0, 4).forEach(function (m) { f2.push(['console', m]); });
            var r2 = { page: page, width: width, step: ctl[c], fails: f2 }; res.push(r2); o.onStep && o.onStep(r2);
          }
        }
      }
    }
    try { var s2 = JSON.parse(localStorage.getItem('threshold_livesim_v2') || 'null'); if (s2 && was != null) { s2.paused = was; localStorage.setItem('threshold_livesim_v2', JSON.stringify(s2)); } } catch (e) {}
    return res;
  };

  TK.jsSuite = async function (files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var rel = files[i]; if (!/\.(m?js|html)$/.test(rel) || /^apps\/web\/dist\//.test(rel)) continue;
      var txt = await (await fetch(TK.root + enc(rel) + '?' + Date.now())).text(), blocks = [];
      if (/\.m?js$/.test(rel)) blocks.push([txt, 1]);
      else txt.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (m, attrs, body, at) { var t = ((attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '').toLowerCase(); if (!/\ssrc\s*=/i.test(attrs) && body.trim() && ['', 'text/javascript', 'application/javascript', 'text/x-dc'].indexOf(t) >= 0) blocks.push([body, txt.slice(0, at).split('\n').length]); return m; });
      blocks.forEach(function (b) { if (/^\s*(import|export)\s/m.test(b[0])) return; try { new Function(b[0]); } catch (e) { out.push({ file: rel, line: b[1], msg: e.message }); } if (/\]\s*,\s*,/.test(b[0])) out.push({ file: rel, line: b[1], msg: 'a double comma leaves a hole in an array' }); });
    }
    return out;
  };

  // — Python: TESTER's own code, in Pyodide —
  var PY = null;
  TK.python = async function (files, log) {
    if (PY) return PY;
    if (!window.loadPyodide) await new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'; s.onload = ok; s.onerror = function () { bad(new Error('Pyodide did not load')); }; document.head.appendChild(s); });
    log('starting Python'); var py = await window.loadPyodide();
    log('loading packages'); await py.loadPackage(['micropip', 'pyyaml', 'pydantic', 'pytest', 'ssl']);
    try { await py.pyimport('micropip').install(['fastapi==0.115.6', 'starlette==0.41.3', 'anyio==4.7.0', 'sniffio', 'idna', 'httpx==0.28.1', 'httpcore==1.0.7', 'h11==0.14.0', 'certifi', 'pyflakes==3.2.0'], false, false); } catch (e) { log('some packages did not install: ' + String(e).slice(-200)); }
    PY = py; await TK.sync(files, log); return py;
  };
  TK.sync = async function (files, log) {
    var n = 0, TEXT = /\.(py|js|mjs|html|ya?ml|json|jsonl|md|txt|toml|conf|sh|css|example|csv)$|Dockerfile|LICENSE|ignore$/;
    try { PY.FS.lookupPath('/repo'); PY.runPython('import shutil; shutil.rmtree("/repo", ignore_errors=True)'); } catch (e) {}
    await Promise.all(files.map(async function (rel) {
      var r = await fetch(TK.root + enc(rel) + '?' + Date.now()); if (!r.ok) return;
      var p = '/repo/' + rel; PY.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')) || '/repo');
      if (TEXT.test(rel)) PY.FS.writeFile(p, await r.text()); else PY.FS.writeFile(p, new Uint8Array(await r.arrayBuffer())); n++;
    }));
    log && log(n + ' files loaded');
  };
  TK.PYCODE = [
    'import sys, os, io, json, types, time, contextlib',
    'def _stub():',
    '    try:',
    '        import dspy  # noqa',
    '        return',
    '    except Exception:',
    '        pass',
    '    d = types.ModuleType("dspy")',
    '    class Signature:',
    '        @classmethod',
    '        def with_instructions(cls, s): return cls',
    '    class Module:',
    '        def __init__(self, *a, **k): pass',
    '        def __call__(self, **k): raise RuntimeError("no model in the browser")',
    '    d.Signature, d.ReAct, d.Predict = Signature, Module, Module',
    '    d.InputField = d.OutputField = lambda *a, **k: None',
    '    d.LM = lambda *a, **k: None',
    '    d.configure = lambda **k: None',
    '    sys.modules["dspy"] = d',
    '_stub()',
    'os.environ.update(TESTER_LOOP="off", TESTER_LIVE="off")',
    'sys.path.insert(0, "/repo/apps/tester") if "/repo/apps/tester" not in sys.path else None',
    'for _m in [m for m in list(sys.modules) if m in ("brain", "ingest", "checks", "agent", "serve", "qa", "test_tester_graph")]: del sys.modules[_m]',
    'OUT = {}',
    'if MODE == "tests":',
    '    import pytest',
    '    os.chdir("/repo/apps/tester")',
    '    buf = io.StringIO()',
    '    t0 = time.time()',
    '    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):',
    '        code = pytest.main(["-q", "-p", "no:cacheprovider", "-p", "no:anyio", "--tb=short", "-W", "ignore::DeprecationWarning", "-rA"])',
    '    text = buf.getvalue()',
    '    OUT = {"code": int(code), "tail": text[-6000:], "seconds": round(time.time() - t0, 1), "lines": [l for l in text.splitlines() if l.startswith(("PASSED", "FAILED", "SKIPPED", "ERROR"))]}',
    'elif MODE == "audit":',
    '    import yaml, ingest, checks, agent',
    '    from brain import Brain',
    '    cfg = yaml.safe_load(open("/repo/apps/tester/tester.yaml"))',
    '    b = Brain("/tmp/tk-graph.json")',
    '    t0 = time.time()',
    '    ingest.ingest(b, "/repo", cfg)',
    '    ingest.selfmodel(b, cfg, agent.TOOL_INFO, checks.CHECKS)',
    '    found, status = checks.run(checks.plan(b, cfg, names=list(checks.STATIC)), b, "/repo", cfg)',
    '    for f in found:',
    '        fid = "finding:" + f["key"]',
    '        b.node(fid, "finding", f["title"], check=f["check"], severity=f["severity"], status="open", file=f["file"])',
    '        for p in f["points"]: b.link("points_at", fid, p)',
    '    OUT = {"stats": b.stats(), "status": status, "findings": found, "graph": b.connectome(limit=2600), "pages": checks.pages_for(b, cfg), "seconds": round(time.time() - t0, 1)}',
    'else:',
    '    import yaml, ingest, hashlib, collections',
    '    from brain import Brain',
    '    cfg = yaml.safe_load(open("/repo/apps/tester/tester.yaml"))',
    '    b = Brain("/tmp/tk-challenge.json")',
    '    ingest.ingest(b, "/repo", cfg)',
    '    files = [n for n in b.nodes.values() if n["type"] == "file"]',
    '    texts = {}',
    '    for n in files:',
    '        try: texts[n["path"]] = open("/repo/" + n["path"], encoding="utf-8", errors="replace").read()',
    '        except OSError: pass',
    '    unref = []',
    '    for n in files:',
    '        p = n["path"]; base = p.rsplit("/", 1)[-1]; stem = base.rsplit(".", 1)[0]',
    '        if n.get("kind") not in ("python", "js", "page", "style", "data") or base.startswith("test_") or base in ("support.js", "manifest.json"): continue',
    '        keys = [base, base.replace(" ", "%20")] + (["import " + stem, "from " + stem] if base.endswith(".py") else []) + (["name=" + chr(34) + stem.replace(".dc", "") + chr(34)] if base.endswith(".dc.html") else [])',
    '        if not any(q != p and any(k in t for k in keys) for q, t in texts.items()): unref.append({"path": p, "lines": n.get("lines", 0), "evidence": "no other file mentions " + base})',
    '    by = collections.defaultdict(list)',
    '    for p, t in texts.items(): by[hashlib.sha1(t.encode()).hexdigest()].append(p)',
    '    dups = sorted((sorted(v) for v in by.values() if len(v) > 1), key=lambda v: -len(v))',
    '    big = sorted(({"path": n["path"], "lines": n.get("lines", 0)} for n in files), key=lambda x: -x["lines"])[:12]',
    '    OUT = {"unreferenced": unref, "duplicates": dups, "biggest": big, "lines": sum(n.get("lines", 0) for n in files), "files": len(files)}',
    'json.dumps(OUT)'].join('\n');
  TK.runPython = async function (mode) { PY.globals.set('MODE', mode); return JSON.parse(await PY.runPythonAsync(TK.PYCODE)); };
  window.TestKit = TK;
})();
