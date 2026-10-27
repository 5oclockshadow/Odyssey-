/* gi-arena.js — the official test harness for "graph as agent, agent as graph".
   Arena      every strategy runs every probe (train, hyperedge, path, held-out dev; each tagged
              by domain). Outputs the recall matrix, split means, per-domain dev, LeanLoC
              fitness, pairwise W/L/T, Elo (K=16, mean of 12 seeded orderings), a bootstrap 90%
              CI on dev, and an exact two-sided sign test of champion vs challenger. The tester
              runs it on a timer and after every code patch, and promotes a challenger only
              when it beats the champion on dev without losing the head-to-head.
   Diffs      LCS line diff with hunks, for code patches and any two strategies.
   Q-policy   tabular Q-learning picks the research loop's next technique (agentic choice).
   Stack      the DSPy cluster's artifacts generated from live state: Pydantic models, Signature
              with InputField / OutputField, YAML, .env, RAPTOR, Redis, Regex, BM25, Hebbian,
              Q-table, LeanLoC.
   New code   BM25 joins the pool at boot; RAPTOR and Hybrid join only when the agent ships them
              as capabilities (gi-stack.js), and then compete like any other strategy.          */
(function () {
  'use strict';
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mean(a) { var s = 0, n = 0; a.forEach(function (v) { if (v != null && isFinite(v)) { s += v; n++; } }); return n ? s / n : null; }
  function f3(v) { return v == null || !isFinite(v) ? '—' : v.toFixed(3); }
  function loc(src) { return String(src || '').split('\n').filter(function (l) { return l.trim() && !/^\s*(\/\/|#|\*|\/\*)/.test(l); }).length; }
  var STOP = {}; 'a an the of to in on and or is are be by how what which why does do can with for from its it that this as at into more than two between their they them one'.split(' ').forEach(function (w) { STOP[w] = 1; });
  var TOK = /[a-z0-9]+/g, STEM = /(ings|ing|ies|es|ed|s)$/;
  function toks(s) { return (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(TOK) || []).filter(function (w) { return w.length > 1 && !STOP[w]; }).map(function (w) { return w.replace(STEM, function (m) { return m === 'ies' ? 'y' : ''; }); }); }
  function signP(w, l) { var n = w + l, k = Math.min(w, l); if (!n) return 1; var c = 1, s = 0; for (var i = 0; i <= k; i++) { s += c; c = c * (n - i) / (i + 1); } return Math.min(1, 2 * s / Math.pow(2, n)); }

  /* ---- unified line diff ---- */
  function diff(a, b, ctx) {
    var A = String(a || '').split('\n'), B = String(b || '').split('\n'), n = A.length, m = B.length, ops = [], i, j;
    if (n * m > 250000) { A.forEach(function (s, k) { ops.push(['-', k + 1, null, s]); }); B.forEach(function (s, k) { ops.push(['+', null, k + 1, s]); }); }
    else {
      var dp = []; for (i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
      for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      i = 0; j = 0;
      while (i < n && j < m) { if (A[i] === B[j]) { ops.push([' ', i + 1, j + 1, A[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', i + 1, null, A[i]]); i++; } else { ops.push(['+', null, j + 1, B[j]]); j++; } }
      while (i < n) { ops.push(['-', i + 1, null, A[i]]); i++; } while (j < m) { ops.push(['+', null, j + 1, B[j]]); j++; }
    }
    ctx = ctx == null ? 3 : ctx;
    var keep = new Uint8Array(ops.length), add = 0, del = 0, out = [], gap = false;
    ops.forEach(function (o, k) { if (o[0] === ' ') return; if (o[0] === '+') add++; else del++; for (var q = Math.max(0, k - ctx); q <= Math.min(ops.length - 1, k + ctx); q++) keep[q] = 1; });
    ops.forEach(function (o, k) { if (keep[k]) { if (gap) out.push(['@', null, null, '⋯']); gap = false; out.push(o); } else if (out.length) gap = true; });
    return { lines: out, add: add, del: del, same: ops.length - add - del, a: n, b: m };
  }

  /* ---- Redis-style cache: GET / SET EX with LRU eviction ---- */
  function makeCache(max) {
    var m = new Map(), hits = 0, misses = 0, sets = 0, evict = 0;
    return {
      get: function (k) { var v = m.get(k); if (!v || v.exp < Date.now()) { if (v) m.delete(k); misses++; return null; } hits++; m.delete(k); m.set(k, v); return v.val; },
      set: function (k, val, ttl) { sets++; m.delete(k); m.set(k, { val: val, exp: Date.now() + (ttl || 600) * 1000 }); if (m.size > max) { m.delete(m.keys().next().value); evict++; } },
      flush: function () { m.clear(); },
      stats: function () { return { keys: m.size, hits: hits, misses: misses, sets: sets, evicted: evict, max: max, rate: hits + misses ? hits / (hits + misses) : 0 }; }
    };
  }

  function wire(core) {
    if (core.testbench) return core.testbench;
    var I = core._int, C = core.C, N = core.N, nc = core.nc, GD = window.GI_DOMAINS;
    var role = window.GI_HISTORY_ROLE || 'agent', DIDS = ['graph', 'ai', 'safety'];
    var devDom = (C.dev || []).map(function (x) { return x.dom || 'graph'; }), trainDom = (C.train || []).map(function (x) { return x.dom || 'graph'; });
    var nm = function (i) { return N[i] ? N[i].name : '?'; };
    var cache = core.cache = makeCache(8000);

    /* ---- BM25 over concept names + definitions ---- */
    var docs = N.map(function (d) { return toks(d.name + ' ' + d.name + ' ' + (d.def || '')); }), df = {}, avg = 0, K1 = 1.2, Bb = 0.75, ND = docs.length;
    docs.forEach(function (t) { avg += t.length; var seen = {}; t.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
    avg /= ND || 1;
    var tf = docs.map(function (t) { var o = {}; t.forEach(function (w) { o[w] = (o[w] || 0) + 1; }); return o; });
    function idf(w) { var n = df[w] || 0; return Math.log(1 + (ND - n + 0.5) / (n + 0.5)); }
    function bm25Score(q, i) { var s = 0, f = tf[i], len = docs[i].length; for (var k = 0; k < q.length; k++) { var x = f[q[k]]; if (x) s += idf(q[k]) * x * (K1 + 1) / (x + K1 * (1 - Bb + Bb * len / avg)); } return s; }
    function bm25(core2, seeds) {
      var q = [], act = new Float32Array(nc), mx = 0, i;
      seeds.forEach(function (s) { if (s < nc) q = q.concat(docs[s]); });
      for (i = 0; i < nc; i++) { act[i] = bm25Score(q, i); if (act[i] > mx) mx = act[i]; }
      for (i = 0; i < nc; i++) act[i] /= mx || 1;
      seeds.forEach(function (s) { if (s < nc) act[s] = 1; });
      return { act: act };
    }

    /* ---- RAPTOR: retrieve over a community summary tree (extractive summaries) ---- */
    var comms = {}; for (var c0 = 0; c0 < nc; c0++) (comms[N[c0].comm] = comms[N[c0].comm] || []).push(c0);
    var cids = Object.keys(comms).map(Number), ctf = cids.map(function (c) { var o = {}, n = 0; comms[c].forEach(function (i) { docs[i].forEach(function (w) { o[w] = (o[w] || 0) + 1; n++; }); }); o.__n = n; return o; });
    var cavg = ctf.reduce(function (s, o) { return s + o.__n; }, 0) / (ctf.length || 1);
    function clusterScore(q, k) { var o = ctf[k], s = 0; for (var j = 0; j < q.length; j++) { var x = o[q[j]]; if (x) s += idf(q[j]) * x * (K1 + 1) / (x + K1 * (1 - Bb + Bb * o.__n / cavg)); } return s; }
    function raptor(core2, seeds) {
      var q = [], act = new Float32Array(nc), adj = core2.adj(), near = {}, qmax = 0, i;
      seeds.forEach(function (s) { if (s < nc) { q = q.concat(docs[s]); (adj[s] || []).forEach(function (x) { near[x[0]] = 1; }); } });
      var top = cids.map(function (c, k) { return [c, clusterScore(q, k)]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 2);
      top.forEach(function (cp) { comms[cp[0]].forEach(function (j) { qmax = Math.max(qmax, bm25Score(q, j)); }); });
      top.forEach(function (cp, rank) { comms[cp[0]].forEach(function (j) { act[j] = Math.max(act[j], bm25Score(q, j) / (qmax || 1) * (rank ? 0.7 : 1) + (near[j] ? 0.3 : 0)); }); });
      var mx = 0; for (i = 0; i < nc; i++) mx = Math.max(mx, act[i]); for (i = 0; i < nc; i++) act[i] /= mx || 1;
      seeds.forEach(function (s) { if (s < nc) act[s] = 1; });
      return { act: act };
    }
    if (!core.getStrategy('bm25')) core.strategies.push({ id: 'bm25', name: 'BM25', tagline: 'Okapi BM25 over concept names and definitions (k1 1.2, b 0.75)', fn: bm25, source: bm25.toString(), by: 'built-in' });

    /* ---- Hybrid — reciprocal-rank fusion of lexical (BM25) + dense (tf-idf cosine) + graph spreading ---- */
    function hybrid(core2, seeds, p, mask) {
      var i, sp = core2._spread(seeds, p, mask), spreadAct = sp[sp.length - 1], lex = bm25(core2, seeds).act;
      var em = core2._embed(), cen = em.centroid(seeds), dense = new Float32Array(nc);
      for (i = 0; i < nc; i++) dense[i] = em.cosTo(cen, i);
      function ranks(arr) { var id = []; for (var j = 0; j < nc; j++) id.push(j); id.sort(function (a, b) { return arr[b] - arr[a]; }); var r = new Float32Array(nc); id.forEach(function (node, rank) { r[node] = rank; }); return r; }
      var rS = ranks(spreadAct), rL = ranks(lex), rD = ranks(dense), K = 60, act = new Float32Array(nc), mx = 0;
      for (i = 0; i < nc; i++) { act[i] = 1 / (K + rS[i]) + 1 / (K + rL[i]) + 1 / (K + rD[i]); if (act[i] > mx) mx = act[i]; }
      for (i = 0; i < nc; i++) act[i] /= mx || 1;
      seeds.forEach(function (s) { if (s < nc) act[s] = 1; });
      return { act: act };
    }

    /* RAPTOR and Hybrid are advanced retrievers the agent DISCOVERS and SHIPS as capabilities.
       They join the competing pool only when their capability ships — one source of truth for
       "abilities we have": a retrieval ability we have == a strategy registered in the pool. */
    var ADVANCED = {
      raptor: { id: 'raptor', name: 'RAPTOR', tagline: 'Score community summaries, then rank members of the top two clusters', fn: raptor, source: raptor.toString(), by: 'built-in' },
      hybrid: { id: 'hybrid', name: 'Hybrid', tagline: 'Reciprocal-rank fusion of BM25 (lexical) + tf-idf cosine (dense) + graph spreading', fn: hybrid, source: hybrid.toString(), by: 'built-in' }
    };
    core.advancedStrategies = ADVANCED;
    core.enableStrategy = function (id) {
      var s = ADVANCED[id]; if (!s) return null; if (core.getStrategy(id)) return core.getStrategy(id);
      core.strategies.push(s); core.log('tester', s.name + ' retrieval joined the arena pool · competes on held-out dev recall like any other strategy'); I.emit('strategy'); return s;
    };
    ['raptor', 'hybrid'].forEach(function (id) { var cap = core.capability && core.capability(id); if (cap && cap.status === 'shipped') core.enableStrategy(id); });

    /* ---- Q-learning research policy ---- */
    var ACTS = ['graph', 'pot', 'code', 'strategy'], Q = {}, visits = {}, alpha = 0.3, gamma = 0.6, eps0 = 0.25, chosen = {}, lastUpd = null, qlog = [];
    function stateKey() { var H = core.history, w = H && H.weakest ? H.weakest() : 'graph'; var iq = core.iqHist[core.iqHist.length - 1] || 0, dv = core.devHist[core.devHist.length - 1] || 0; return (iq - dv > 0.1 ? 'gap' : 'tight') + '·' + (w || 'graph'); }
    function qrow(s) { return Q[s] || (Q[s] = { graph: 0, pot: 0, code: 0, strategy: 0 }); }
    core.qpolicy = {
      acts: ACTS, params: { alpha: alpha, gamma: gamma, eps0: eps0 },
      choose: function (round, avail) {
        if (chosen.round === round && avail.indexOf(chosen.a) >= 0) return chosen.a;
        var s = stateKey(), q = qrow(s), n = 0; Object.keys(visits).forEach(function (k) { n += visits[k]; });
        var eps = Math.max(0.05, eps0 / Math.sqrt(1 + n / 8)), a, why;
        if (Math.random() < eps) { a = avail[Math.floor(Math.random() * avail.length)]; why = 'explore, ε=' + eps.toFixed(2); }
        else { a = avail.slice().sort(function (x, y) { return q[y] - q[x]; })[0]; why = 'exploit, argmax Q=' + q[a].toFixed(3) + ', ε=' + eps.toFixed(2); }
        chosen = { round: round, a: a, s: s, why: why, eps: eps, t: Date.now() };
        core.log('research', 'Q-POLICY · round ' + round + ' · state ' + s + ' · ' + avail.map(function (x) { return 'Q(' + x + ')=' + q[x].toFixed(3); }).join(' ') + ' → ' + a.toUpperCase() + ' (' + why + ')');
        return a;
      },
      update: function (a, r2) {
        var s = chosen.a === a && chosen.s ? chosen.s : stateKey(), s2 = stateKey(), q = qrow(s), q2 = qrow(s2);
        var rwd = 100 * (r2.ddev || 0) - 0.001 * (r2.ms || 0) - 0.02 * (r2.loc || 0) + (r2.keep ? 0.5 : -0.25);
        var mx = Math.max.apply(null, ACTS.map(function (x) { return q2[x]; })), old = q[a], td = rwd + gamma * mx - old;
        q[a] = old + alpha * td; visits[s + '|' + a] = (visits[s + '|' + a] || 0) + 1;
        lastUpd = { t: Date.now(), s: s, a: a, s2: s2, r: rwd, old: old, nw: q[a], mx: mx, td: td, ddev: r2.ddev || 0, ms: r2.ms || 0, loc: r2.loc || 0, keep: !!r2.keep, label: r2.label };
        qlog.unshift(lastUpd); if (qlog.length > 40) qlog.pop();
        core.log('research', 'Q-UPDATE · Q(' + s + ', ' + a + ') ← ' + old.toFixed(3) + ' + ' + alpha + '·(' + rwd.toFixed(3) + ' + ' + gamma + '·' + mx.toFixed(3) + ' − ' + old.toFixed(3) + ') = ' + q[a].toFixed(3) + ' · r = 100·' + (r2.ddev || 0).toFixed(3) + ' − 0.001·' + Math.round(r2.ms || 0) + 'ms − 0.02·' + (r2.loc || 0) + 'LOC ' + (r2.keep ? '+ 0.5 kept' : '− 0.25 rejected'));
      },
      table: function () { return Q; }, visits: function () { return visits; }, last: function () { return lastUpd; }, chosen: function () { return chosen; }, log: function () { return qlog; }, state: stateKey,
      line: function () { var s = stateKey(), q = qrow(s); return 'Q[' + s + '] ' + ACTS.map(function (x) { return x + ' ' + q[x].toFixed(2); }).join(' '); },
      export: function () { return { Q: Q, visits: visits }; },
      import: function (o) { if (!o || !o.Q) return; Object.keys(o.Q).forEach(function (s) { var r = qrow(s); ACTS.forEach(function (x) { if (isFinite(o.Q[s][x])) r[x] = o.Q[s][x]; }); }); if (o.visits) visits = o.visits; }
    };
    ACTS.forEach(function () {}); qrow(stateKey());

    /* ---- capture Program-of-Thought programs for the diff view ---- */
    var potLog = [];
    if (core.pot) { var pot0 = core.pot; core.pot = async function () { var r = await pot0.apply(core, arguments); if (r && r.code) { potLog.unshift({ t: Date.now(), code: r.code, keep: !!r.keep, ddev: r.ddev || 0, summary: r.summary || '' }); if (potLog.length > 20) potLog.pop(); } return r; }; }

    /* ---- arena ---- */
    function domOfProbe(p) { if (!GD || !p.gold || !p.gold.length) return 'graph'; var cnt = {}; p.gold.concat(p.seeds || []).forEach(function (g) { if (g < nc) { var d = GD.domOf(N[g].comm); cnt[d] = (cnt[d] || 0) + 1; } }); return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || 'graph'; }
    function probes() {
      var P = [], cnt = {};
      function add(p, split, dom) { cnt[split] = (cnt[split] || 0) + 1; P.push({ p: p, split: split, dom: dom, text: p.text, id: ({ train: 'T', hyper: 'H', path: 'P', dev: 'D' })[split] + cnt[split] }); }
      I.bench.forEach(function (p, i) { var split = p.kind === 'train' ? 'train' : p.kind === 'group' ? 'hyper' : 'path'; add(p, split, split === 'train' ? (trainDom[i] || 'graph') : domOfProbe(p)); });
      I.dev.forEach(function (p, i) { add(p, 'dev', devDom[i]); });
      return P;
    }
    function version() { var s = I.E.length; for (var k = 0; k < I.E.length; k += 5) s = (s * 31 + Math.round(I.E[k].w * 1000) + I.E[k].a * 7 + I.E[k].b) | 0; return s + ':' + core.params.decay + ':' + core.params.hops + ':' + core.params.k + ':' + core.params.hyper; }
    var A = core.testbench = { diff: diff, last: null, potLog: potLog, runs: 0, promotions: [] };
    A.run = function (opt) {
      opt = opt || {};
      var t0 = performance.now(), P = probes(), keepFn = core.strategy, keepId = core.activeStrategy, ver = version(), rows = [];
      core.strategies.forEach(function (s) {
        var r = new Float32Array(P.length), ms = 0, err = null;
        core.strategy = s.fn;
        for (var k = 0; k < P.length; k++) {
          var key = s.id + '|' + P[k].id + '|' + ver, hit = cache.get(key);
          if (hit) { r[k] = hit.r; ms += hit.ms; continue; }
          var t1 = performance.now(), v = 0;
          try { var res = core.run(P[k].p); v = res.score == null ? NaN : res.score; } catch (e) { v = 0; err = String(e && e.message || e).slice(0, 90); }
          var dt = performance.now() - t1; r[k] = v; ms += dt; cache.set(key, { r: v, ms: dt }, 900);
        }
        var src = s.source || String(s.fn);
        rows.push({ id: s.id, name: s.name, by: s.by || 'built-in', tagline: s.tagline || '', src: src, loc: loc(src), r: r, ms: ms, err: err });
      });
      core.strategy = keepFn; core.activeStrategy = keepId;
      rows.forEach(function (row) {
        row.split = {}; ['train', 'hyper', 'path', 'dev'].forEach(function (sp) { row.split[sp] = mean(P.map(function (q, k) { return q.split === sp ? row.r[k] : null; })); });
        row.train = mean(P.map(function (q, k) { return q.split !== 'dev' ? row.r[k] : null; }));
        row.dev = row.split.dev;
        row.dd = DIDS.map(function (d) { return mean(P.map(function (q, k) { return q.split === 'dev' && q.dom === d ? row.r[k] : null; })); });
        row.fit = 100 * (row.dev || 0) - 0.001 * row.ms - 0.02 * row.loc;
        var di = []; P.forEach(function (q, k) { if (q.split === 'dev' && isFinite(row.r[k])) di.push(k); });
        var R = rng(17), bs = [];
        for (var b = 0; b < 400; b++) { var sm = 0; for (var q2 = 0; q2 < di.length; q2++) sm += row.r[di[Math.floor(R() * di.length)]]; bs.push(sm / (di.length || 1)); }
        bs.sort(function (x, y) { return x - y; }); row.ci = di.length ? [bs[20], bs[379]] : [null, null];
      });
      var elo = rows.map(function () { return 0; }), W = rows.map(function () { return 0; }), L = W.slice(), T = W.slice(), ORD = 12;
      for (var o = 0; o < ORD; o++) {
        var R2 = rng(101 + o), e = rows.map(function () { return 1000; }), order = P.map(function (_, k) { return k; });
        for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(R2() * (i + 1)), tt = order[i]; order[i] = order[j]; order[j] = tt; }
        order.forEach(function (k) {
          for (var a = 0; a < rows.length; a++) for (var b2 = a + 1; b2 < rows.length; b2++) {
            var ra = rows[a].r[k], rb = rows[b2].r[k]; if (!isFinite(ra) || !isFinite(rb)) continue;
            var sa = ra > rb + 1e-9 ? 1 : rb > ra + 1e-9 ? 0 : 0.5, ea = 1 / (1 + Math.pow(10, (e[b2] - e[a]) / 400));
            e[a] += 16 * (sa - ea); e[b2] -= 16 * (sa - ea);
            if (o === 0) { if (sa === 1) { W[a]++; L[b2]++; } else if (sa === 0) { W[b2]++; L[a]++; } else { T[a]++; T[b2]++; } }
          }
        });
        e.forEach(function (v, k) { elo[k] += v / ORD; });
      }
      rows.forEach(function (row, k) { row.elo = elo[k]; row.w = W[k]; row.l = L[k]; row.t = T[k]; });
      var ranked = rows.slice().sort(function (a, b) { return (b.dev || 0) - (a.dev || 0) || (b.train || 0) - (a.train || 0) || b.elo - a.elo; });
      var champ = rows.filter(function (r) { return r.id === keepId; })[0] || ranked[0], chall = ranked.filter(function (r) { return r !== champ && !r.err; })[0] || null, sign = null;
      if (chall) { var w = 0, l = 0, ties = 0; P.forEach(function (q, k) { var x = chall.r[k], y = champ.r[k]; if (!isFinite(x) || !isFinite(y)) return; if (x > y + 1e-9) w++; else if (y > x + 1e-9) l++; else ties++; }); sign = { w: w, l: l, ties: ties, n: w + l, p: signP(w, l) }; }
      var res = { t: Date.now(), ms: performance.now() - t0, probes: P.map(function (q) { return { id: q.id, split: q.split, dom: q.dom, text: q.text, gold: q.p.gold ? q.p.gold.length : 0 }; }), rows: ranked, champion: champ.id, challenger: chall ? chall.id : null, sign: sign, cache: cache.stats(), version: ver };
      A.last = res; A.runs++;
      core.log('tester', 'ARENA #' + A.runs + ' · ' + rows.length + ' strategies × ' + P.length + ' probes (' + ['train', 'hyper', 'path', 'dev'].map(function (sp) { return P.filter(function (q) { return q.split === sp; }).length + ' ' + sp; }).join(', ') + ') in ' + Math.round(res.ms) + 'ms · cache ' + res.cache.hits + ' hits / ' + res.cache.misses + ' misses (' + Math.round(res.cache.rate * 100) + '%)');
      ranked.forEach(function (r, k) { core.log('tester', '  #' + (k + 1) + ' ' + r.name + (r.id === champ.id ? ' [champion]' : r === chall ? ' [challenger]' : '') + ' · train ' + f3(r.train) + ' · dev ' + f3(r.dev) + ' [90% CI ' + f3(r.ci[0]) + '–' + f3(r.ci[1]) + '] · graph/ai/safety ' + r.dd.map(f3).join('/') + ' · Elo ' + Math.round(r.elo) + ' · W/L/T ' + r.w + '/' + r.l + '/' + r.t + ' · ' + r.loc + ' LOC · ' + Math.round(r.ms) + 'ms · fitness ' + r.fit.toFixed(2) + (r.err ? ' · ERROR ' + r.err : '')); });
      if (sign) core.log('tester', 'SIGN TEST · ' + chall.name + ' vs ' + champ.name + ' · wins ' + sign.w + ', losses ' + sign.l + ', ties ' + sign.ties + ' · p = 2·Σ C(' + sign.n + ',i)/2^' + sign.n + ' for i ≤ ' + Math.min(sign.w, sign.l) + ' = ' + sign.p.toFixed(4));
      if (opt.promote && chall && sign) {
        var better = (chall.dev || 0) > (champ.dev || 0) + 1e-6, safeTrain = (chall.train || 0) >= (champ.train || 0) - 0.02, h2h = sign.w >= sign.l;
        if (better && safeTrain && h2h) { core.useStrategy(chall.id); A.promotions.unshift({ t: Date.now(), from: champ.name, to: chall.name, dev0: champ.dev, dev1: chall.dev, p: sign.p }); core.log('tester', 'PROMOTE · ' + chall.name + ' replaces ' + champ.name + ' · dev ' + f3(champ.dev) + ' → ' + f3(chall.dev) + ' · train ' + f3(champ.train) + ' → ' + f3(chall.train) + ' · head-to-head ' + sign.w + '–' + sign.l + ' (p ' + sign.p.toFixed(3) + ')'); }
        else core.log('tester', 'HOLD · ' + champ.name + ' stays · ' + [better ? null : 'challenger dev ' + f3(chall.dev) + ' ≤ ' + f3(champ.dev), safeTrain ? null : 'train drops ' + f3(champ.train) + ' → ' + f3(chall.train), h2h ? null : 'loses head-to-head ' + sign.w + '–' + sign.l].filter(Boolean).join(' · '));
      }
      return res;
    };

    /* ---- live math ---- */
    A.math = function () {
      var r = core.lastRun, p = core.params, up = 0, down = 0, sw = 0;
      I.E.forEach(function (e) { sw += e.w; if (e.w > e.w0 + 0.01) up++; else if (e.w < e.w0 - 0.01) down++; });
      var terms = Object.keys(df).map(function (w) { return [w, idf(w), df[w]]; }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
      return {
        params: p,
        run: r ? { q: r.probe.text, seeds: r.seeds.map(nm), top: r.sub.map(nm), gold: r.gold ? r.gold.map(nm) : [], hits: r.gold ? r.gold.filter(function (g) { return r.sub.indexOf(g) >= 0; }).map(nm) : [], score: r.score, conf: r.conf } : null,
        hebb: { eta: p.eta, mean: sw / (I.E.length || 1), up: up, down: down, n: I.E.length },
        bm25: { k1: K1, b: Bb, N: ND, avgdl: avg, vocab: terms.length, rare: terms.slice(0, 4), common: terms.slice(-4) },
        q: lastUpd, qp: core.qpolicy.params, chosen: chosen,
        arena: A.last ? { champ: A.last.rows.filter(function (x) { return x.id === A.last.champion; })[0], chall: A.last.rows.filter(function (x) { return x.id === A.last.challenger; })[0], sign: A.last.sign } : null,
        cache: cache.stats()
      };
    };

    /* ---- the DSPy cluster's artifacts, generated from live state ---- */
    A.stack = function () {
      var p = core.params, act = core.getStrategy(core.activeStrategy) || {}, gh = core.gh ? core.gh.stats : {}, cs = cache.stats(), llm = !!(window.claude && window.claude.complete);
      var commNames = C.communities.map(function (c) { return c[0]; }), qp = core.qpolicy.params, E = I.E.length;
      var lit = function (s) { return JSON.stringify(s); };
      var items = [
        ['pydantic', 'Pydantic BaseModel', 'models.py', 'python', [
          '# generated from the live graph: ' + nc + ' concepts · ' + E + ' edges · ' + commNames.length + ' communities',
          'from typing import Literal', 'from pydantic import BaseModel, Field', '',
          'Community = Literal[' + commNames.slice(0, 6).map(lit).join(', ') + ', ...]  # ' + commNames.length + ' in total', '',
          'class Citation(BaseModel):', '    node: str = Field(description="graph concept the claim rests on")', '    community: Community', '    weight: float = Field(ge=0.05, le=2.0, description="learned Hebbian edge weight")', '',
          'class Evidence(BaseModel):', '    claim: str', '    citations: list[Citation] = Field(min_length=1)', '',
          'class GraphAnswer(BaseModel):', '    answer: str', '    evidence: list[Evidence]', '    recall_at_k: float = Field(ge=0, le=1)', '    domain: Literal["graph", "ai", "safety"]'].join('\n')],
        ['signature', 'Signature', 'graph_qa.py', 'python', [
          'import dspy', 'from models import GraphAnswer', '',
          'class GraphQA(dspy.Signature):', '    """Answer from the retrieved subgraph and cite every claim."""',
          '    question: str = dspy.InputField(desc="natural-language query")',
          '    seeds: list[str] = dspy.InputField(desc="entities parsed by Regex, ranked by BM25")',
          '    subgraph: list[str] = dspy.InputField(desc="top-' + p.k + ' concepts after ' + p.hops + '-hop spreading (decay ' + p.decay + ')")',
          '    answer: GraphAnswer = dspy.OutputField(desc="typed answer, validated by Pydantic")', '',
          'program = dspy.ChainOfThought(GraphQA)', '# retrieval code in use: ' + (act.name || core.activeStrategy) + ' · ' + (act.by || 'built-in')].join('\n')],
        ['inputfield', 'InputField', 'graph_qa.py', 'python', 'question: str = dspy.InputField(desc="natural-language query")\nseeds: list[str] = dspy.InputField(desc="entities parsed by Regex, ranked by BM25")\nsubgraph: list[str] = dspy.InputField(desc="top-' + p.k + ' concepts after spreading activation")'],
        ['outputfield', 'OutputField', 'graph_qa.py', 'python', 'answer: GraphAnswer = dspy.OutputField(desc="typed answer, validated by Pydantic")\n# GraphAnswer → Evidence → Citation: three nested BaseModels'],
        ['yaml', 'YAML config', 'config.yaml', 'yaml', [
          'graph:', '  concepts: ' + nc, '  edges: ' + E, '  edge_budget: ' + (core.EDGE_CAP || '—'), '  communities: ' + commNames.length,
          'retrieval:', '  strategy: ' + core.activeStrategy, '  decay: ' + p.decay, '  hops: ' + p.hops, '  k: ' + p.k, '  hyperedge_weight: ' + p.hyper, '  bm25: { k1: ' + K1 + ', b: ' + Bb + ' }',
          'plasticity:', '  hebbian_eta: ' + p.eta,
          'policy:', '  q_learning: { alpha: ' + qp.alpha + ', gamma: ' + qp.gamma + ', epsilon0: ' + qp.eps0 + ' }',
          'fitness: "100*ddev - 0.001*ms - 0.02*loc"   # LeanLoC',
          'cache: { backend: redis-style-lru, max_keys: ' + cs.max + ', ttl_s: 900 }',
          'ingest: { repos: ' + (core.gh ? core.gh.repos.length : 0) + ', files_queued: ' + (gh.total || 0) + ', batch: 8 }'].join('\n')],
        ['env', '.env file', '.env', 'ini', [
          'GI_LM=window.claude          # host model; ' + (llm ? 'online' : 'offline in this tab'),
          'GITHUB_API=https://api.github.com', 'GITHUB_RAW=https://raw.githubusercontent.com', 'GITHUB_TOKEN=                # unset: 60 API calls/hour, used only for tree walks',
          'GI_EDGE_CAP=' + (core.EDGE_CAP || ''), 'GI_HISTORY_KEY=gi-history-v1', 'GI_MEMORY_KEY=gi-memory-v1', 'GI_ROLE=' + role, 'REDIS_URL=memory://lru        # in-browser stand-in with Redis GET/SET EX semantics'].join('\n')],
        ['raptor', 'RAPTOR', 'raptor.js', 'js', '// ' + cids.length + ' level-1 clusters (communities) · extractive summaries · avg ' + Math.round(cavg) + ' tokens per cluster\n' + raptor.toString()],
        ['redis', 'Redis', 'cache.js', 'js', '// live: ' + cs.keys + ' keys · ' + cs.hits + ' hits · ' + cs.misses + ' misses · hit rate ' + Math.round(cs.rate * 100) + '% · ' + cs.evicted + ' evicted\n' + makeCache.toString()],
        ['regex', 'Regex', 'patterns.js', 'js', [
          'TOKEN   = ' + TOK.toString() + '                    // BM25 tokenizer', 'STEM    = ' + STEM.toString() + '        // suffix stemmer',
          'LM_JSON = /\\{[\\s\\S]*\\}/                       // pulls the JSON object out of every LM reply',
          'PY_SYM  = /^[ \\t]*(?:class|def|async[ \\t]+def)[ \\t]+([A-Za-z_]\\w*)/gm   // symbols from ingested Python',
          'JS_SYM  = /\\b(?:class|function|interface)[ \\t]+([A-Za-z_$][\\w$]*)/g     // symbols from ingested JS/TS',
          'CITE    = /\\[(\\d+)\\]/g                        // citations in generated answers'].join('\n')],
        ['bm25', 'BM25', 'bm25.js', 'js', '// N=' + ND + ' docs · avgdl ' + avg.toFixed(1) + ' · ' + Object.keys(df).length + ' terms · k1 ' + K1 + ' · b ' + Bb + '\n' + idf.toString() + '\n' + bm25Score.toString() + '\n' + bm25.toString()],
        ['hebbian', 'Hebbian update', 'plasticity.js', 'js', [
          '// runs after every probe (η = ' + p.eta + ')', 'E.forEach(function (e) {', '  if (good[e.a] && good[e.b]) e.w += eta * (2 - e.w) * 0.5;          // both ends relevant: strengthen',
          '  else if (inSub[e.a] && inSub[e.b]) e.w -= eta * e.w * 0.35;     // co-retrieved, not relevant: weaken', '  else e.w += (e.w0 - e.w) * 0.004;                               // drift home',
          '  e.w = clamp(e.w, 0.05, 2);', '});'].join('\n')],
        ['qtable', 'Q-table', 'policy.js', 'js', '// Q(s,a) ← Q(s,a) + α·(r + γ·max Q(s′,·) − Q(s,a))   α ' + qp.alpha + ' · γ ' + qp.gamma + ' · ε₀ ' + qp.eps0 + '\nQ = ' + JSON.stringify(Q, function (k, v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }, 2)],
        ['leanloc', 'LeanLoC', 'fitness.js', 'js', '// fitness = 100·Δdev − 0.001·ms − 0.02·LOC  (smaller code wins ties)\n' + core.strategies.map(function (s) { var src = s.source || String(s.fn); return (s.name + '                        ').slice(0, 24) + String(loc(src)).padStart(4) + ' LOC'; }).join('\n')]
      ];
      return items.map(function (it) { var i = core.find ? core.find(it[1]) : -1; return { id: it[0], node: it[1], file: it[2], lang: it[3], code: it[4], idx: i, inGraph: i >= 0, deg: i >= 0 ? (core.adj()[i] || []).length : 0, comm: i >= 0 ? commNames[N[i].comm] : '—' }; });
    };

    /* ---- the tester runs the arena on a timer and after every code patch ---- */
    if (role === 'tester') {
      var lastPatches = 0;
      setTimeout(function () { try { A.run({ promote: true }); } catch (e) {} }, 4000);
      setInterval(function () { try { A.run({ promote: true }); } catch (e) { core.log('err', 'arena: ' + (e && e.message || e)); } }, 60000);
      core.on(function () { var n = (core.codePatches || []).length; if (n !== lastPatches) { lastPatches = n; setTimeout(function () { try { A.run({ promote: true }); } catch (e) {} }, 200); } });
    }
    core.log('sys', 'arena wired · ' + core.strategies.length + ' strategies (BM25 baseline; RAPTOR & Hybrid join when shipped) · Q-policy over ' + ACTS.join('/') + ' · Redis-style cache ' + cache.stats().max + ' keys');
    return A;
  }

  window.GI_ARENA = { wire: wire, diff: diff, signP: signP };
})();
