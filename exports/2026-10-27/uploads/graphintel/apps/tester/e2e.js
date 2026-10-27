/* E2E: TESTER's journeys through the institute site in a live iframe. A journey is a list of steps: go, click, fill, see, gone, has,
   count, value, back, wait. Each step waits up to its timeout for its condition, so the page can stream. The same journeys.json drives
   qa.py in the container through Playwright. Every journey starts from a fresh load; console errors fail it. window.E2E; no build step. */
(function () {
  'use strict';
  var E = {};
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var vis = function (w, el) { if (!el || !el.getBoundingClientRect) return false; var r = el.getBoundingClientRect(), cs = w.getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  var all = function (d, sel) { try { return Array.prototype.slice.call(d.querySelectorAll(sel)); } catch (e) { return []; } };
  var first = function (w, d, sel) { var xs = all(d, sel); for (var i = 0; i < xs.length; i++) if (vis(w, xs[i])) return xs[i]; return null; };
  var sub = function (v, env) { return String(v).replace(/\$([A-Z0-9_]+)/g, function (m, k) { return env && env[k] != null ? env[k] : m; }); };
  var setValue = function (w, el, v) {
    var proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  E.op = function (s) { return ['go', 'click', 'fill', 'see', 'gone', 'has', 'count', 'value', 'back', 'wait'].filter(function (k) { return k in s; })[0] || '?'; };
  E.label = function (s) { var op = E.op(s); return op + ' ' + (op === 'fill' ? s.fill + ' ← "' + s.value + '"' : op === 'has' ? s.has + ' ∋ "' + s.text + '"' : op === 'count' ? s.count + ' ' + (s.max == null ? '≥ ' + s.min : s.min + '–' + s.max) : op === 'value' ? s.value + ' = "' + s.is + '"' : op === 'back' ? '' : String(s[op])); };
  E.applies = function (j, width) { return (!j.minWidth || width >= j.minWidth) && (!j.maxWidth || width <= j.maxWidth); };
  E.load = async function (url) { var r = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('journeys: HTTP ' + r.status); return r.json(); };

  E.open = function (frame, url, settle, errs) {
    return new Promise(function (done) {
      var finished = false, t0 = Date.now();
      var hook = function () {
        try {
          var w = frame.contentWindow; if (!w || w.__e2eHooked) return; w.__e2eHooked = true;
          var ce = w.console.error.bind(w.console);
          w.console.error = function () { var a = [].slice.call(arguments); errs.push(a.map(function (x) { return x && x.message ? x.message : typeof x === 'object' ? JSON.stringify(x) : String(x); }).join(' ').slice(0, 240)); return ce.apply(null, a); };
          w.addEventListener('error', function (ev) { errs.push(String(ev.message || ev.error || 'error').slice(0, 240)); });
          w.addEventListener('unhandledrejection', function (ev) { errs.push('unhandled rejection: ' + String(ev.reason && ev.reason.message || ev.reason).slice(0, 200)); });
        } catch (e) {}
      };
      var poll = setInterval(function () {
        hook();
        var d = null; try { d = frame.contentDocument; } catch (e) {}
        var ready = d && d.readyState === 'complete' && d.querySelector('[data-e2e]');
        if (!finished && (ready || Date.now() - t0 > 15000)) { finished = true; clearInterval(poll); setTimeout(function () { done(!!ready); }, settle); }
      }, 20);
      frame.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'e2e=' + Date.now();
    });
  };

  async function step(frame, s, o) {
    var w = frame.contentWindow, d = w && w.document, T = s.timeout || o.timeout || 4000;
    var until = async function (fn) { var t0 = Date.now(), r; for (;;) { try { r = fn(); } catch (e) { r = null; } if (r) return r; if (Date.now() - t0 > T) return null; await wait(50); } };
    var op = E.op(s);
    if (op === 'go') { w.location.hash = String(s.go).replace(/^#?/, '#'); await wait(120); return { ok: true }; }
    if (op === 'back') { w.history.back(); await wait(200); return { ok: true }; }
    if (op === 'wait') { await wait(s.wait); return { ok: true }; }
    if (op === 'click') {
      var el = await until(function () { return first(w, d, s.click); });
      if (!el) return s.optional ? { ok: true, skipped: true } : { ok: false, why: 'nothing visible matches ' + s.click };
      try { el.click(); } catch (e) { return { ok: false, why: 'click threw ' + e.message }; }
      await wait(80); return { ok: true };
    }
    if (op === 'fill') { var f = await until(function () { return first(w, d, s.fill); }); if (!f) return { ok: false, why: 'no field ' + s.fill }; setValue(w, f, sub(s.value || '', o.env)); await wait(40); return { ok: true }; }
    if (op === 'see') return (await until(function () { return first(w, d, s.see); })) ? { ok: true } : { ok: false, why: s.see + ' did not appear' };
    if (op === 'gone') return (await until(function () { return !first(w, d, s.gone); })) ? { ok: true } : { ok: false, why: s.gone + ' is still showing' };
    if (op === 'has') {
      var want = String(s.text || '').toLowerCase(), last = '';
      var ok = await until(function () { var x = first(w, d, s.has); last = x ? (x.innerText || x.textContent || '') : ''; return x && last.toLowerCase().indexOf(want) >= 0; });
      return ok ? { ok: true } : { ok: false, why: s.has + ' does not say "' + s.text + '"' + (last ? ' (it says "' + last.replace(/\s+/g, ' ').slice(0, 70) + '")' : '') };
    }
    if (op === 'count') {
      var n = 0, okc = await until(function () { n = all(d, s.count).filter(function (x) { return vis(w, x); }).length; return n >= (s.min || 0) && (s.max == null || n <= s.max); });
      return okc ? { ok: true } : { ok: false, why: s.count + ': ' + n + ' showing, wanted ' + (s.max == null ? 'at least ' + s.min : s.min + '–' + s.max) };
    }
    if (op === 'value') { var cur = '', okv = await until(function () { var x = first(w, d, s.value); cur = x ? x.value : ''; return x && cur === s.is; }); return okv ? { ok: true } : { ok: false, why: s.value + ' is "' + cur + '", wanted "' + s.is + '"' }; }
    return { ok: false, why: 'unknown step ' + JSON.stringify(s) };
  }

  E.run = async function (frame, url, j, o) {
    o = o || {}; var errs = [], t0 = Date.now(), out = { id: j.id, who: j.who, width: o.width, ok: true, steps: [], errors: errs };
    var miss = (j.needs || []).filter(function (k) { return !(o.env && o.env[k]); });
    if (miss.length) { out.skipped = 'needs ' + miss.join(', '); return out; }
    if (o.width) frame.style.width = o.width + 'px';
    var loaded = await E.open(frame, url, o.settle == null ? 600 : o.settle, errs);
    if (!loaded) { out.ok = false; out.failed = -1; out.why = 'the page did not render a [data-e2e] element within 15 s'; out.ms = Date.now() - t0; return out; }
    for (var i = 0; i < j.steps.length; i++) {
      if (o.stop && o.stop()) { out.ok = false; out.stopped = true; out.why = 'stopped'; break; }
      var s = j.steps[i], t = Date.now(), r = await step(frame, s, o);
      r.i = i; r.ms = Date.now() - t; r.label = E.label(s);
      out.steps.push(r); if (o.onStep) o.onStep(j, r, o.width);
      if (!r.ok) { out.ok = false; out.failed = i; out.why = 'step ' + (i + 1) + ' (' + r.label + '): ' + r.why; break; }
    }
    if (errs.length && out.ok) { out.ok = false; out.why = 'console: ' + errs[0]; }
    out.ms = Date.now() - t0;
    return out;
  };
  window.E2E = E;
})();
