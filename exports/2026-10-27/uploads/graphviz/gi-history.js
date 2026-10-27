/* gi-history.js — long-run memory, history and code frontier for the graph agent.
   Memory     the learned graph (added edges, removed corpus edges), Claude-authored strategies,
              the active strategy, compiled params and the curriculum focus persist in
              localStorage and are restored when the core boots, so the graph keeps growing
              across sessions instead of restarting from the corpus.
   Ledger     every measurement (IQ, held-out dev overall and per domain, edges, learned edges,
              active code, files ingested) and every experiment (graph patch, program of thought,
              code rewrite, strategy round, code swap, compaction, code-grounded link, record)
              is appended to a persisted ledger that the History view reads.
   Frontier   every strategy scored on held-out dev per domain. DomainRouter composes the best
              code per domain into one strategy that competes like any other.
   Curriculum an optional domain focus adds a training probe from that domain every other
              cycle and steers the research and program-of-thought prompts toward it.
   Only the agent console (GI_HISTORY_ROLE = 'agent', the default) writes; others restore. */
(function () {
  'use strict';
  var KEY = 'gi-history-v1', MEM = 'gi-memory-v1', MAXP = 1600, MAXE = 800, DIDS = ['graph', 'ai', 'safety'];
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function r3(x) { return x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000; }
  function hsh(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function wire(core) {
    if (core.history) return core.history;
    var role = window.GI_HISTORY_ROLE || 'agent', writer = role === 'agent';
    var C = core.C, I = core._int, N = core.N, nc = core.nc;
    var GD = window.GI_DOMAINS, DOM = (GD && GD.list) || [{ id: 'graph', name: 'Graph intelligence', short: 'GRAPH', color: 'rgb(120,200,255)' }];
    var devDom = (C.dev || []).map(function (x) { return x.dom || 'graph'; });
    var devSets = DIDS.map(function (d) { return I.dev.filter(function (p, i) { return devDom[i] === d; }); });
    var trainBy = {}; (C.train || []).forEach(function (x) { var d = x.dom || 'graph'; (trainBy[d] = trainBy[d] || []).push(x); });
    function idx(nm) { var i = core.G.idx[nm]; return i != null && i < nc ? i : -1; }
    function domName(id) { var d = DOM.filter(function (x) { return x.id === id; })[0]; return d ? d.name : id; }
    var base = []; I.E.forEach(function (e) { if (e.src === 'corpus') base.push([e.a, e.b, I.k2(e.a, e.b)]); });
    var H = core.history = { role: role, writer: writer, domains: DOM, focus: null, best: -1, frontier: null, bestFor: {}, now: null, savedAt: 0, restored: { added: 0, removed: 0, strategies: 0, caps: 0 } };
    var isDirty = false; function dirty() { isDirty = true; }

    /* ---- restore memory ---- */
    var mem = load(MEM), pendingActive = null;
    if (mem && mem.v === 1) {
      try {
        (mem.removed || []).forEach(function (p) { var a = idx(p[0]), b = idx(p[1]); if (a < 0 || b < 0) return; var k = I.edgeIndex(a, b); if (k != null) { I.E.splice(k, 1); I.rebuild(); H.restored.removed++; } });
        (mem.added || []).forEach(function (x) { var a = idx(x[0]), b = idx(x[1]); if (a < 0 || b < 0 || a === b) return; if (I.addEdge(a, b, x[2] || 'pred', x[3] == null ? 0.6 : x[3], x[4] || 'memory')) H.restored.added++; });
        I.rebuild();
        (mem.strategies || []).forEach(function (s) {
          if (!s.code) return; var id = 'mem-' + hsh(s.code); if (core.getStrategy(id)) return;
          try { var fn = (new Function('return (' + s.code + ')'))(); if (typeof fn !== 'function') return; core.strategies.push({ id: id, name: s.name, tagline: s.tagline || 'restored from memory', fn: fn, source: s.code, by: s.by || 'claude' }); H.restored.strategies++; } catch (e) {}
        });
        if (mem.params) Object.keys(core.params).forEach(function (k) { if (isFinite(mem.params[k])) core.params[k] = mem.params[k]; });
        if (mem.focus && DIDS.indexOf(mem.focus) >= 0) H.focus = mem.focus;
        if (mem.q && core.qpolicy) core.qpolicy.import(mem.q);
        (mem.caps || []).forEach(function (id) {
          var cp = core.capability && core.capability(id); if (!cp || cp.status === 'shipped') return;
          cp.status = 'shipped'; cp.shippedAt = 'restored'; core.stats.shipped = (core.stats.shipped || 0) + 1;
          if (cp.flag && core.flags) core.flags[cp.flag] = true;
          if (cp.kind === 'strategy' && core.enableStrategy) core.enableStrategy(id);
          H.restored.caps++;
        });
        if (H.restored.caps && core.architect) core.architect();
        pendingActive = mem.active || null;
      } catch (e) {}
    }

    /* ---- DomainRouter: the best code per domain, composed ---- */
    var domOf = GD ? function (i) { return GD.domOf(N[i].comm); } : function () { return 'graph'; }, routing = false;
    function router(core2, seeds, p, mask) {
      if (routing || !seeds || !seeds.length) return null;
      var cnt = {}; seeds.forEach(function (s) { if (s < nc) { var d = domOf(s); cnt[d] = (cnt[d] || 0) + 1; } });
      var dom = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || 'graph', s = core.getStrategy(H.bestFor[dom]);
      if (!s || s.id === 'router') return null;
      routing = true; try { return s.fn(core2, seeds, p, mask); } finally { routing = false; }
    }
    if (!core.getStrategy('router')) core.strategies.push({ id: 'router', name: 'DomainRouter', tagline: 'Routes each query to the best code for its domain: graph, AI or safety', fn: router, source: router.toString(), by: 'built-in' });
    if (pendingActive && core.getStrategy(pendingActive)) core.useStrategy(pendingActive, true);

    /* ---- ledger ---- */
    var L = load(KEY); if (!L || L.v !== 1) L = { v: 1, sessions: [], pts: [], ev: [], sn: [], best: {} };
    L.best = L.best || {};
    var sess = { id: (L.sessions.length ? L.sessions[L.sessions.length - 1].id : 0) + 1, t: Date.now(), restored: H.restored };
    if (writer) L.sessions.push(sess);
    H.ledger = L; H.session = sess.id;
    L.pts.forEach(function (p) { if (p[4] != null && p[4] > H.best) H.best = p[4]; });
    function sIdx(id) { var s = core.getStrategy(id), nm = s ? s.name : String(id); var k = L.sn.indexOf(nm); if (k < 0) { L.sn.push(nm); k = L.sn.length - 1; } return k; }
    function curDev() { return r3(core.devHist[core.devHist.length - 1]); }
    function pushEv(e) { if (!writer) return; e.t = Math.round(Date.now() / 1000); e.s = sess.id; L.ev.push(e); if (L.ev.length > MAXE) L.ev.splice(0, L.ev.length - MAXE); dirty(); }
    H.pushEv = pushEv;
    H.domainDev = function () { return devSets.map(function (set) { return set.length ? I.evalSet(set) : null; }); };
    function thin() {
      var keep = 900, old = L.pts.slice(0, L.pts.length - keep), out = [];
      old.forEach(function (p, i) { if (i % 2 === 0 || old[i - 1][1] !== p[1]) out.push(p); });
      L.pts = out.concat(L.pts.slice(L.pts.length - keep));
    }
    var lastT = 0, lastStrat = null, lastLinked = null;
    function record() {
      var t = Date.now(); if (t - lastT < 1200) return; lastT = t;
      var iq = core.iqHist[core.iqHist.length - 1], dev = core.devHist[core.devHist.length - 1], dd = H.domainDev(), learned = 0;
      I.E.forEach(function (e) { if (e.src !== 'corpus') learned++; });
      H.now = { iq: iq, dev: dev, dd: dd, edges: I.E.length, learned: learned };
      if (!writer) return;
      var g = core.gh ? core.gh.stats : {};
      L.pts.push([Math.round(t / 1000), sess.id, core.cycle, r3(iq), r3(dev), r3(dd[0]), r3(dd[1]), r3(dd[2]), I.E.length, learned, sIdx(core.activeStrategy), g.pulled || 0, g.linked || 0]);
      if (L.pts.length > MAXP) thin();
      if (dev > H.best + 1e-9) { if (H.best >= 0) pushEv({ k: 'record', l: 'new best held-out dev', ok: 1, d: r3(dev - H.best), v: r3(dev) }); H.best = dev; }
      if (lastStrat != null && lastStrat !== core.activeStrategy) pushEv({ k: 'swap', l: 'code → ' + ((core.getStrategy(core.activeStrategy) || {}).name || core.activeStrategy), ok: 1, d: 0, v: r3(dev) });
      lastStrat = core.activeStrategy;
      dirty();
    }

    /* ---- experiments, compaction, code-grounded links ---- */
    if (core.scienceStep) {
      var ss = core.scienceStep;
      core.scienceStep = async function () {
        var res = await ss.apply(core, arguments);
        try {
          var S = core.science;
          if (S.stage === 'experiment' && S.result) H.pend = { k: S.type, r: S.result };
          else if (S.stage === 'audit' && H.pend) { var x = H.pend.r; pushEv({ k: H.pend.k, l: String(x.label || H.pend.k).slice(0, 64), ok: x.keep ? 1 : 0, d: r3(x.ddev || 0), ms: x.ms, loc: x.loc, x: String(x.summary || '').slice(0, 150), v: curDev() }); H.pend = null; }
        } catch (e) {}
        return res;
      };
    }
    if (core.compact) { var cp = core.compact; core.compact = function () { var before = I.E.length, out = cp.apply(core, arguments), n = before - I.E.length; if (n > 0) pushEv({ k: 'compact', l: 'pruned ' + n + ' weak edges', ok: 1, d: 0, v: curDev() }); return out; }; }

    /* ---- code frontier: every strategy × domain on held-out dev ---- */
    H.matrix = function () {
      var keepFn = core.strategy, keepId = core.activeStrategy, rows = [];
      function score(fn) { core.strategy = fn; return { d: devSets.map(function (set) { return set.length ? I.evalSet(set) : null; }), dev: I.evalSet(I.dev) }; }
      core.strategies.forEach(function (s) {
        if (s.id === 'router') return;
        var row = { id: s.id, name: s.name, by: s.by || 'built-in', d: [null, null, null], dev: null, err: null };
        try { var sc = score(s.fn); row.d = sc.d; row.dev = sc.dev; } catch (e) { row.err = String(e && e.message || e).slice(0, 80); }
        rows.push(row);
      });
      var bestFor = {};
      DIDS.forEach(function (d, k) { var b = null; rows.forEach(function (r) { if (r.err || r.d[k] == null) return; if (!b || r.d[k] > b.d[k] + 1e-9) b = r; }); if (b) bestFor[d] = b.id; });
      H.bestFor = bestFor;
      var rs = core.getStrategy('router');
      if (rs) { try { var sr = score(rs.fn); rows.push({ id: 'router', name: rs.name, by: 'composed', d: sr.d, dev: sr.dev, err: null }); } catch (e) {} }
      core.strategy = keepFn; core.activeStrategy = keepId;
      rows.sort(function (a, b) { return (b.dev || 0) - (a.dev || 0); });
      H.frontier = { t: Date.now(), rows: rows };
      if (writer) { rows.forEach(function (r) { if (r.dev != null && (!L.best[r.name] || r.dev > L.best[r.name].dev)) L.best[r.name] = { dev: r3(r.dev), t: Math.round(Date.now() / 1000), by: r.by }; }); dirty(); }
      return H.frontier;
    };

    /* ---- curriculum ---- */
    var cc = 0, inCur = false;
    function curriculum() {
      if (!H.focus || inCur || !trainBy[H.focus]) return;
      if (++cc % 2) return;
      var pool = trainBy[H.focus], ex = pool[Math.floor(Math.random() * pool.length)];
      var probe = { kind: 'curriculum', text: ex.q, seeds: ex.seeds.map(idx).filter(function (i) { return i >= 0; }), gold: ex.gold.map(idx).filter(function (i) { return i >= 0; }) };
      inCur = true;
      setTimeout(function () { try { core.step(probe); } catch (e) {} inCur = false; }, 40);
    }
    H.setFocus = function (d) { H.focus = d && d !== 'all' && DIDS.indexOf(d) >= 0 ? d : null; core.log('research', 'curriculum → ' + (H.focus ? domName(H.focus) : 'all domains')); dirty(); };
    H.weakest = function () { var dd = (H.now && H.now.dd) || H.domainDev(), w = -1; dd.forEach(function (v, k) { if (v != null && (w < 0 || v < dd[w])) w = k; }); return w < 0 ? null : DIDS[w]; };
    H.domainLine = function () { var dd = (H.now && H.now.dd) || H.domainDev(); return 'dev by domain: ' + DIDS.map(function (d, k) { return d + ' ' + (dd[k] == null ? '—' : dd[k].toFixed(2)); }).join(' · ') + (H.focus ? ' (curriculum: ' + H.focus + ')' : ''); };
    H.focusLine = function () { var d = H.focus || H.weakest(); return d ? 'domain: ' + domName(d) : ''; };
    H.potHint = function () {
      var d = H.focus || H.weakest(); if (!d || !GD) return '';
      var cs = (DOM.filter(function (x) { return x.id === d; })[0] || {}).comms || [];
      return ' Priority: raise recall in the ' + domName(d) + ' domain; prefer pairs where core.N[i].comm or core.N[j].comm is one of [' + cs.join(',') + '].';
    };

    core.on(function (kind) {
      if (kind === 'iq') { record(); if (!H.frontier || Date.now() - H.frontier.t > 90000) setTimeout(function () { try { H.matrix(); } catch (e) {} }, 0); }
      else if (kind === 'cycle') curriculum();
      var g = core.gh && core.gh.stats;
      if (g) { if (lastLinked != null && g.linked > lastLinked) pushEv({ k: 'ingest', l: String((core.gh.lastEvt && core.gh.lastEvt.msg) || 'code-grounded link').slice(0, 72), ok: 1, d: 0, v: curDev() }); lastLinked = g.linked; }
    });

    /* ---- persistence ---- */
    H.snapshot = function () {
      var added = [], removed = [], present = {};
      I.E.forEach(function (e) { present[I.k2(e.a, e.b)] = 1; if (e.src !== 'corpus' && e.a < nc && e.b < nc) added.push([N[e.a].name, N[e.b].name, e.t, r3(e.w), String(e.src || '').slice(0, 48)]); });
      base.forEach(function (b) { if (!present[b[2]]) removed.push([N[b[0]].name, N[b[1]].name]); });
      var strategies = core.strategies.filter(function (s) { return s.by !== 'built-in'; }).map(function (s) { return { name: s.name, tagline: s.tagline, code: s.source || String(s.fn), by: s.by }; });
      var act = core.getStrategy(core.activeStrategy), active = act ? (act.by === 'built-in' ? act.id : 'mem-' + hsh(act.source || String(act.fn))) : null;
      var caps = (core.capabilities || []).filter(function (c) { return c.status === 'shipped' && c.req; }).map(function (c) { return c.id; });
      return { v: 1, t: Date.now(), added: added, removed: removed, strategies: strategies, active: active, params: core.params, focus: H.focus, q: core.qpolicy ? core.qpolicy.export() : null, caps: caps };
    };
    H.save = function () {
      if (!writer) return false;
      var ok1 = store(MEM, H.wiped ? { v: 1, t: Date.now(), added: [], removed: [], strategies: [] } : H.snapshot()), ok2 = store(KEY, L);
      if (!ok2) { L.pts = L.pts.slice(-600); L.ev = L.ev.slice(-300); ok2 = store(KEY, L); }
      isDirty = false; H.savedAt = Date.now(); return ok1 && ok2;
    };
    H.reset = function () { H.wiped = true; L.sessions = [sess]; L.pts = []; L.ev = []; L.sn = []; L.best = {}; H.best = -1; H.save(); core.log('sys', 'memory and history reset — the next session starts from the corpus'); };
    H.exportJSON = function () { return JSON.stringify({ exported: new Date().toISOString(), ledger: L, memory: H.snapshot() }, null, 1); };
    if (writer) {
      setInterval(function () { if (isDirty) H.save(); }, 15000);
      window.addEventListener('pagehide', function () { H.save(); });
    }
    if (H.restored.added || H.restored.removed || H.restored.strategies || H.restored.caps) setTimeout(function () { core.log('sys', 'memory restored · +' + H.restored.added + ' learned edges · −' + H.restored.removed + ' corpus edges · ' + H.restored.strategies + ' strategies · ' + (H.restored.caps || 0) + ' abilities'); }, 0);
    return H;
  }

  window.GI_HISTORY = { wire: wire };
})();
