/* gi-core.js — autonomous graph-intelligence core + live 3D view.
   One graph holds data and agent (the 8 DSPy modules are concept nodes).
   The core probes itself, learns edge weights (plasticity), proposes and tests
   structural changes (evolve), perturbs itself (shake), mines insights, and
   escalates to an LLM through a DSPy-style signature when it is unsure. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }
  function ts() { var d = new Date(); return d.toTimeString().slice(0, 8); }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function create(C) {
    var G = LabEngine.graph(C), parser = LabEngine.agent(G), nc = G.nc, N = G.nodes.slice(0, nc);
    var rnd = Math.random;
    var TYPEW = { isa: 1, uses: 0.8, analog: 0.6, pred: 0.7, llm: 0.7 };
    var core = { G: G, N: N, nc: nc, C: C, listeners: [], logs: [], cycle: 0, iqHist: [], devHist: [], autopilot: false, busy: false,
      params: { decay: 0.55, hops: 2, k: 8, hyper: 0.7, eta: 0.15 }, stats: { runs: 0, escalations: 0, llmLinks: 0, predAdded: 0, rejected: 0, pruned: 0, shakes: 0 },
      viz: null, focus: null, runs: [], evolution: [], pendingLLM: [], llmAvailable: !!(window.claude && window.claude.complete), lastRun: null, step: -1 };
    var mods = C.program.map(function (p) { return G.idx[p.inst]; });
    core.mods = mods;

    /* ---- mutable edge set with plastic weights ---- */
    var E = [], key = {};
    function k2(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
    function addEdge(a, b, t, w, src) { if (a === b || key[k2(a, b)] != null) return null; var e = { a: a, b: b, t: t, w: w == null ? 1 : w, w0: w == null ? 1 : w, src: src || 'corpus', born: now() }; key[k2(a, b)] = E.length; E.push(e); return e; }
    G.edges.forEach(function (e) { if (e.a < nc && e.b < nc) addEdge(e.a, e.b, e.t); });
    var adj;
    function rebuild() { key = {}; E.forEach(function (e, i) { key[k2(e.a, e.b)] = i; }); adj = N.map(function () { return []; }); E.forEach(function (e, i) { adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); }); }
    rebuild();
    core.E = E; core.adj = function () { return adj; };

    function emit(kind) { core.listeners.forEach(function (f) { f(kind); }); }
    core.on = function (f) { core.listeners.push(f); return function () { core.listeners = core.listeners.filter(function (g) { return g !== f; }); }; };
    function log(kind, text) { core.logs.push({ t: ts(), kind: kind, text: text }); if (core.logs.length > 2500) core.logs.shift(); emit('log'); }
    core.log = log;
    var name = function (i) { return N[i].name; };

    /* ---- plastic spreading activation ---- */
    function spread(seeds, p, mask) {
      var a = new Float32Array(nc), hops = []; seeds.forEach(function (s) { a[s] = 1; }); hops.push(Array.from(a));
      for (var h = 0; h < p.hops; h++) {
        var b = Float32Array.from(a, function (x) { return x * 0.5; });
        for (var u = 0; u < nc; u++) {
          if (a[u] < 0.01) continue; var out = a[u] * p.decay / Math.sqrt(adj[u].length + 1);
          adj[u].forEach(function (x) { var e = E[x[1]]; b[x[0]] += out * (TYPEW[e.t] || 0.5) * e.w; });
          G.inHyper[u].forEach(function (k) { if (k === mask) return; G.hyper[k].m.forEach(function (v) { if (v !== u) b[v] += out * p.hyper; }); });
        }
        var m = 0; for (var i = 0; i < nc; i++) m = Math.max(m, b[i]); for (i = 0; i < nc; i++) b[i] /= m || 1;
        a = b; hops.push(Array.from(a));
      }
      return hops;
    }
    function run(probe, p) {
      p = p || core.params;
      var seeds = probe.seeds;
      if (!seeds || !seeds.length) { seeds = parser.parse(probe.text).entities.slice(0, 3).map(function (e) { return e[0]; }); }
      if (!seeds.length) seeds = [G.idx['Graph']];
      var hops, act, res = core.strategy ? core.strategy(core, seeds, p, probe.mask) : null;
      if (res && res.hops) { hops = res.hops; act = hops[hops.length - 1]; }
      else if (res && res.act) { act = res.act; hops = [act]; }
      else { hops = spread(seeds, p, probe.mask); act = hops[hops.length - 1]; }
      var ord = [];
      for (var i = 0; i < nc; i++) ord.push(i); ord.sort(function (x, y) { return act[y] - act[x]; });
      var sub = ord.filter(function (i) { return seeds.indexOf(i) < 0; }).slice(0, p.k);
      var gold = probe.gold ? probe.gold.filter(function (g) { return seeds.indexOf(g) < 0; }) : null, score = null;
      if (gold && gold.length) score = gold.filter(function (g) { return sub.indexOf(g) >= 0; }).length / gold.length;
      var top = act[sub[0]] || 0, mass = sub.reduce(function (z, i) { return z + act[i]; }, 0), conf = cl(mass / p.k * 0.6 + top * 0.4, 0, 1);
      return { probe: probe, seeds: seeds, hops: hops, act: act, sub: sub, gold: gold, score: score, conf: conf };
    }
    core.run = run;

    /* ---- probes: the graph writes its own tests ---- */
    var roots = {}; N.forEach(function (d) { if (d.parent === 'Atlas' && roots[d.comm] == null) roots[d.comm] = d.i; });
    function bfsPath(a, b, block) { var prev = {}, q = [a], seen = {}; seen[a] = 1; if (block != null && block !== a && block !== b) seen[block] = 1; while (q.length) { var u = q.shift(); if (u === b) break; adj[u].forEach(function (x) { if (!seen[x[0]]) { seen[x[0]] = 1; prev[x[0]] = u; q.push(x[0]); } }); } if (!seen[b]) return null; var p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p; }
    core.path = bfsPath;
    function textProbe(ex, tag) { return { kind: tag, text: ex.q, seeds: ex.seeds.map(function (s) { return G.idx[s]; }).filter(function (x) { return x != null; }), gold: ex.gold.map(function (g) { return G.idx[g]; }).filter(function (x) { return x != null; }) }; }
    var bench = C.train.map(function (ex) { var p = textProbe(ex, 'train'); p.seeds = null; return p; })
      .concat(G.hyper.map(function (h, k) { return { kind: 'group', text: 'Without the hyperedge, what belongs with ' + name(h.m[0]) + '?', seeds: [h.m[0]], gold: h.m.slice(1), mask: k }; }));
    (function () { var r = LabEngine.util.rng(3), n = 0, guard = 0; while (n < 10 && guard++ < 500) { var a = Math.floor(r() * nc), b = Math.floor(r() * nc), p = a !== b && bfsPath(a, b); if (p && p.length >= 4 && p.length <= 5) { bench.push({ kind: 'path', text: 'How is ' + name(a) + ' related to ' + name(b) + '?', seeds: [a, b], gold: p.slice(1, -1) }); n++; } } })();
    var dev = C.dev.map(function (ex) { var p = textProbe(ex, 'dev'); p.seeds = null; return p; });
    core.bench = bench; core.dev = dev;
    function genProbe() {
      var r = rnd();
      if (r < 0.3) { var h = G.hyper[Math.floor(rnd() * G.hyper.length)], m = shuffle(h.m, rnd), s = m.slice(0, rnd() < 0.5 ? 1 : 2); return { kind: 'group', text: 'Without its hyperedge, what completes {' + s.map(name).join(', ') + ', …}?', seeds: s, gold: m.slice(s.length), src: h.name, mask: G.hyper.indexOf(h) }; }
      if (r < 0.5) { var cs = Object.keys(roots), c = +cs[Math.floor(rnd() * cs.length)], rt = roots[c], kids = N.filter(function (d) { return d.parent === name(rt); }).map(function (d) { return d.i; }); if (kids.length >= 2) return { kind: 'community', text: 'What lives under ' + name(rt) + '?', seeds: [rt], gold: kids, src: C.communities[c][0] }; }
      if (r < 0.7) { for (var t = 0; t < 20; t++) { var a = Math.floor(rnd() * nc), b = Math.floor(rnd() * nc), p = a !== b && bfsPath(a, b); if (p && p.length >= 4 && p.length <= 5) return { kind: 'path', text: 'How is ' + name(a) + ' related to ' + name(b) + '?', seeds: [a, b], gold: p.slice(1, -1) }; } }
      if (r < 0.85 && core.insights && core.insights.length) { var ins = core.insights[Math.floor(rnd() * core.insights.length)]; if (ins.nodes.length >= 3) return { kind: 'insight', text: ins.q, seeds: ins.nodes.slice(0, 1), gold: ins.nodes.slice(1), src: ins.title }; }
      var all = C.train.concat(C.dev), ex = all[Math.floor(rnd() * all.length)]; return textProbe(ex, 'corpus');
    }
    core.genProbe = genProbe;

    function evalSet(set, p) { var s = 0, n = 0; set.forEach(function (pr) { var r = run(pr, p); if (r.score != null) { s += r.score; n++; } }); return n ? s / n : 0; }
    function iq() { return evalSet(bench); }
    core.iq = iq; core.devIQ = function () { return evalSet(dev); };

    /* ---- plasticity (Hebbian on probe outcomes) ---- */
    function hebb(r) {
      if (!r.gold) return { up: 0, down: 0 };
      var good = {}; r.gold.concat(r.seeds).forEach(function (g) { good[g] = 1; });
      var inSub = {}; r.sub.concat(r.seeds).forEach(function (s) { inSub[s] = 1; });
      var up = 0, down = 0, eta = core.params.eta;
      E.forEach(function (e) {
        var ga = good[e.a], gb = good[e.b], sa = inSub[e.a], sb = inSub[e.b];
        if (ga && gb) { e.w += eta * (2 - e.w) * 0.5; up++; }
        else if ((sa && sb) && !(ga && gb)) { e.w -= eta * e.w * 0.35; down++; }
        else e.w += (e.w0 - e.w) * 0.004;
        e.w = cl(e.w, 0.05, 2);
      });
      return { up: up, down: down };
    }

    /* ---- one autonomous cycle ---- */
    core.step = function (probe) {
      probe = probe || genProbe();
      var r = run(probe); core.cycle++; core.stats.runs++;
      var hb = hebb(r);
      if (r.gold && r.score < 1) r.gold.forEach(function (m) { if (r.sub.indexOf(m) < 0) missQ.push([r.seeds[0], m]); }); if (missQ.length > 40) missQ.splice(0, missQ.length - 40);
      core.lastRun = r; core.viz = { r: r, t0: now() };
      core.runs.unshift({ cycle: core.cycle, kind: probe.kind, q: probe.text, seeds: r.seeds.map(name), sub: r.sub.map(name), score: r.score, conf: +r.conf.toFixed(2) }); if (core.runs.length > 40) core.runs.pop();
      log('run', '#' + core.cycle + ' [' + probe.kind + '] ' + probe.text + ' → ' + (r.score == null ? 'no gold' : 'recall ' + r.score.toFixed(2)) + ' · conf ' + r.conf.toFixed(2) + ' · hebb +' + hb.up + '/−' + hb.down + ' · seeds ' + r.seeds.map(name).join(', ') + ' · top-' + r.sub.length + ' ' + r.sub.slice(0, 5).map(name).join(', ') + (r.gold ? ' · hit ' + r.gold.filter(function (g) { return r.sub.indexOf(g) >= 0; }).length + '/' + r.gold.length + (r.score < 1 ? ' · missed ' + r.gold.filter(function (g) { return r.sub.indexOf(g) < 0; }).map(name).join(', ') : '') : ''));
      if (core.cycle % 4 === 0) measure();
      /* upgrades handled by the research ⇄ tester loop in gi-stack.js */
      var weak = (r.score != null && r.score < 0.34) || r.conf < 0.3;
      if (weak && core.llmAvailable && !core.llmBusy && (core.stats.escalations < 3 || core.cycle % 5 === 0)) core.escalate(r);
      emit('cycle');
      return r;
    };
    function measure() { var a = iq(), d = core.devIQ(); core.iqHist.push(a); core.devHist.push(d); if (core.iqHist.length > 80) { core.iqHist.shift(); core.devHist.shift(); } emit('iq'); return a; }
    core.measure = measure;

    /* ---- evolve: propose, test, accept or reject ---- */
    function aa(a, b) { var na = {}; adj[a].forEach(function (x) { na[x[0]] = 1; }); var s = 0; adj[b].forEach(function (x) { if (na[x[0]]) s += 1 / Math.log(adj[x[0]].length + 1.5); }); return s; }
    core.adamic = aa;
    var tried = {}, missQ = [];
    core.evolve = function (quiet) {
      var base = iq(), cands = [];
      for (var a = 0; a < nc; a++) for (var b = a + 1; b < nc; b++) if (key[k2(a, b)] == null) { var s = aa(a, b); if (s > 0.9) cands.push([a, b, s, 'pred']); }
      cands = cands.filter(function (c) { return !tried[k2(c[0], c[1])]; }); cands.sort(function (x, y) { return y[2] - x[2]; });
      var mq = []; missQ.splice(0).reverse().forEach(function (m) { if (m[0] !== m[1] && key[k2(m[0], m[1])] == null && !tried[k2(m[0], m[1])] && !mq.some(function (x) { return k2(x[0], x[1]) === k2(m[0], m[1]); })) mq.push([m[0], m[1], aa(m[0], m[1]), 'pred', 'missed-gold']); });
      cands = mq.slice(0, 4).concat(cands.slice(0, 4)).concat(core.pendingLLM.splice(0).map(function (l) { return [l[0], l[1], 0, 'llm', l[2]]; }));
      var acc = 0, rej = 0;
      cands.forEach(function (c) {
        if (key[k2(c[0], c[1])] != null) return; tried[k2(c[0], c[1])] = 1;
        var e = addEdge(c[0], c[1], c[3], 0.6, c[3] === 'llm' ? 'llm:' + (c[4] || 'related') : c[4] === 'missed-gold' ? 'missed gold · AA ' + c[2].toFixed(2) : 'adamic-adar ' + c[2].toFixed(2)); rebuild();
        var nv = iq();
        if (nv >= base + 0.001 || (c[3] === 'llm' && nv >= base - 0.001)) { acc++; base = nv; if (c[3] === 'llm') core.stats.llmLinks++; else core.stats.predAdded++; core.evolution.unshift({ t: ts(), op: 'add', a: name(c[0]), b: name(c[1]), via: e.src, iq: +nv.toFixed(3) }); log('evolve', '+ ' + name(c[0]) + ' — ' + name(c[1]) + ' (' + e.src + ') accepted · IQ ' + nv.toFixed(3)); }
        else { E.pop(); rebuild(); rej++; core.stats.rejected++; if (!quiet) log('evolve', '× ' + name(c[0]) + ' — ' + name(c[1]) + ' rejected (IQ ' + nv.toFixed(3) + ' < ' + base.toFixed(3) + ')'); }
      });
      var weak = E.map(function (e, i) { return [e, i]; }).filter(function (x) { return x[0].t !== 'isa' && x[0].w < 0.16; });
      weak.slice(0, 3).forEach(function (x) {
        var i = E.indexOf(x[0]); if (i < 0) return; E.splice(i, 1); rebuild(); var nv = iq();
        if (nv >= base - 0.0005) { core.stats.pruned++; base = nv; core.evolution.unshift({ t: ts(), op: 'prune', a: name(x[0].a), b: name(x[0].b), via: 'w=' + x[0].w.toFixed(2), iq: +nv.toFixed(3) }); log('evolve', '− pruned ' + name(x[0].a) + ' — ' + name(x[0].b) + ' (w ' + x[0].w.toFixed(2) + ')'); }
        else { E.splice(i, 0, x[0]); rebuild(); }
      });
      if (core.evolution.length > 60) core.evolution.length = 60;
      log('evolve', 'generation done: ' + acc + ' accepted, ' + rej + ' rejected · ' + E.length + ' edges');
      core.insights = mine(); emit('evolve');
    };

    /* ---- shake: perturbation robustness ---- */
    core.shake = function () {
      core.stats.shakes++; var base = iq(), trials = [], saved = E.slice();
      for (var t = 0; t < 5; t++) { var keep = saved.filter(function () { return rnd() > 0.15; }); E.length = 0; keep.forEach(function (e) { E.push(e); }); rebuild(); trials.push(iq()); }
      E.length = 0; saved.forEach(function (e) { E.push(e); }); rebuild();
      var bc = core.betweenEdges ? core.betweenEdges.slice(0, 14) : [], worst = null, wd = 0;
      bc.forEach(function (x) { var i = E.indexOf(x.e); if (i < 0) return; E.splice(i, 1); rebuild(); var d = base - iq(); E.splice(i, 0, x.e); rebuild(); if (d > wd) { wd = d; worst = x.e; } });
      var m = trials.reduce(function (a, b) { return a + b; }, 0) / trials.length, rob = base ? m / base : 1;
      core.lastShake = { base: base, mean: m, rob: rob, worst: worst ? name(worst.a) + ' — ' + name(worst.b) : null, wd: wd };
      log('shake', 'removed 15% of edges ×5 · IQ ' + base.toFixed(3) + ' → ' + m.toFixed(3) + ' · robustness ' + (rob * 100).toFixed(0) + '%' + (worst ? ' · most load-bearing edge: ' + core.lastShake.worst + ' (−' + wd.toFixed(3) + ')' : ''));
      if (core.view) core.view.kick(); emit('shake');
    };

    /* ---- compile ---- */
    core.compile = function () {
      var base = iq(), best = { s: base, p: core.params }, n = 0;
      [0.4, 0.55, 0.7, 0.85].forEach(function (d) { [2, 3].forEach(function (h) { [0.3, 0.7, 1.1].forEach(function (hy) { var p = { decay: d, hops: h, k: core.params.k, hyper: hy, eta: core.params.eta }; n++; var s = evalSet(bench, p); if (s > best.s + 1e-6) best = { s: s, p: p }; }); }); });
      core.params = best.p; log('compile', n + ' configs · IQ ' + base.toFixed(3) + ' → ' + best.s.toFixed(3) + ' · decay ' + best.p.decay + ' hops ' + best.p.hops + ' hyper ' + best.p.hyper); measure(); emit('compile');
    };

    /* ---- agent-authored layouts + runtime RAPTOR/LLM taxonomy ---- */
    core.taxonomy = [];
    core.inventLayout = async function () {
      if (!(window.claude && window.claude.complete)) return null;
      var prompt = 'Author a NEW 3D layout for a force-graph of ' + core.nc + ' knowledge-graph nodes. Signature: function layout(ctx){} where ctx = {nc, N:[{name,comm,parent,year}], pr:Float32Array pagerank, depth:int[], hash:(i)=>0..1, TAU:6.283}. Return an array of nc [x,y,z] floats, roughly within [-1.3,1.3], deterministic, spread out, visually distinct and meaningful (group by community / year / pagerank / depth). No libraries. Return ONLY JSON {"name":"lowercaseid","label":"Short Title","code":"function layout(ctx){ ... }"}.';
      try {
        var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out);
        var fn = (new Function('return (' + j.code + ')'))();
        var ctx = { nc: core.nc, N: core.N, pr: core.pr || new Float32Array(core.nc), depth: [], hash: function (i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }, TAU: Math.PI * 2 };
        var P = fn(ctx); if (!P || P.length !== core.nc) throw new Error('bad length');
        for (var i = 0; i < core.nc; i++) { var p = P[i]; if (!p || !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) throw new Error('non-finite'); }
        var id = ((j.name || 'invented').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'layout');
        if (core.capability && core.capability(id)) id = id + ((core.capabilities || []).length);
        if (core.view && core.view.addLayout) core.view.addLayout(id, fn);
        if (core.capabilities) { core.capabilities.push({ id: id, label: j.label || id, kind: 'archetype', layout: id, status: 'shipped', note: 'LLM-authored layout', shippedAt: ts() }); core.stats.shipped = (core.stats.shipped || 0) + 1; core.lastShip = { cap: core.capabilities[core.capabilities.length - 1], t: now() }; }
        log('ship', 'invented layout \u201c' + (j.label || id) + '\u201d \u2014 LLM-authored, added live');
        if (core.bus) core.bus.post({ type: 'layout', id: id, label: j.label || id, code: j.code });
        emit('ship'); return id;
      } catch (e) { log('err', 'layout invention failed: ' + (e && e.message || e)); return null; }
    };
    core.raptorStep = async function () {
      var comms = {}, i; for (i = 0; i < core.nc; i++) { (comms[core.N[i].comm] = comms[core.N[i].comm] || []).push(i); }
      var done = {}; core.taxonomy.forEach(function (t) { done[t.cid] = 1; });
      var next = Object.keys(comms).map(Number).filter(function (cc) { return !done[cc]; }).sort(function (a, b) { return comms[b].length - comms[a].length; })[0];
      if (next == null) { if (core.flags) core.flags.raptor = true; core.architect && core.architect(); return null; }
      var mem = comms[next], names = mem.slice(0, 14).map(function (k) { return core.N[k].name; });
      var base = core.C.communities[next] || ['cluster ' + next, ''];
      var entry = { cid: next, name: base[0], summary: base[1] || '', members: mem.length };
      if (window.claude && window.claude.complete) {
        try { var r = await window.claude.complete('These knowledge-graph concepts form one cluster: ' + names.join(', ') + '. Give a crisp cluster name and a one-sentence summary of what unifies them. Return ONLY JSON {"name":"2-4 words","summary":"one sentence"}.'); var mm = r.match(/\{[\s\S]*\}/), jj = JSON.parse(mm ? mm[0] : r); if (jj.name) entry.name = jj.name; if (jj.summary) entry.summary = jj.summary; } catch (e) {}
      }
      core.taxonomy.push(entry); if (core.flags) core.flags.raptor = true; core.architect && core.architect();
      log('research', 'raptor \u00b7 named cluster \u201c' + entry.name + '\u201d (' + entry.members + ' concepts) \u2014 ' + (entry.summary || '').slice(0, 70));
      emit('ship'); return entry;
    };

    /* ---- LLM layer (DSPy-style signature) ---- */
    var SIG = 'question, seeds, subgraph, vocabulary -> answer, missing_links, confidence';
    core.signature = SIG;
    core.escalate = async function (r, force) {
      if (!core.llmAvailable) { log('llm', 'LM layer unavailable in this environment; graph answers stand alone'); return null; }
      core.llmBusy = true; core.stats.escalations++; emit('llm');
      var sub = r.sub.slice(0, 10).map(function (i, k) { return '[' + (k + 1) + '] ' + name(i) + ': ' + N[i].def; }).join('\n');
      var vocab = N.map(function (d) { return d.name; }).join(' | ');
      log('llm', (force ? 'ask' : 'escalate') + ' · conf ' + r.conf.toFixed(2) + (r.score != null ? ' · recall ' + r.score.toFixed(2) : '') + ' · dspy.Predict("' + SIG + '")');
      var prompt = 'You are the LM layer of a DSPy program whose retrieval is a knowledge graph. Signature: ' + SIG + '.\n' +
        'question: ' + r.probe.text + '\nseeds: ' + r.seeds.map(name).join(', ') + '\nsubgraph:\n' + sub + '\nvocabulary (node names, use exactly): ' + vocab + '\n\n' +
        'Return ONLY JSON: {"answer": "2 sentences citing [n]", "missing_links": [["Node A","relation","Node B"]] (0-3 links between vocabulary nodes that the graph should have to answer this), "confidence": 0..1}';
      try {
        var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out);
        var links = (j.missing_links || []).map(function (l) { return [G.idx[l[0]], G.idx[l[2]], l[1]]; }).filter(function (l) { return l[0] != null && l[1] != null && l[0] < nc && l[1] < nc && l[0] !== l[1]; });
        core.pendingLLM = core.pendingLLM.concat(links);
        r.llm = { answer: j.answer, conf: j.confidence, links: links.map(function (l) { return name(l[0]) + ' —' + l[2] + '→ ' + name(l[1]); }) };
        log('llm', '← ' + (j.answer || '').slice(0, 220));
        if (links.length) log('llm', '← proposes ' + links.length + ' link(s): ' + r.llm.links.join('; ') + ' · queued for evolve test');
      } catch (e) { log('err', 'LM layer error: ' + (e && e.message || e)); }
      core.llmBusy = false; emit('llm'); return r.llm;
    };

    /* ---- insight mining ---- */
    function mine() {
      var out = [], deg = adj.map(function (a) { return a.length; });
      // PageRank
      var pr = new Float64Array(nc).fill(1 / nc);
      for (var it = 0; it < 40; it++) { var nx = new Float64Array(nc).fill(0.15 / nc); for (var u = 0; u < nc; u++) { var d = deg[u] || 1; adj[u].forEach(function (x) { nx[x[0]] += 0.85 * pr[u] / d; }); } pr = nx; }
      core.pr = pr;
      // Brandes betweenness (nodes + edges)
      var bc = new Float64Array(nc), ebc = new Float64Array(E.length);
      for (var s = 0; s < nc; s++) {
        var S = [], P = N.map(function () { return []; }), sig = new Float64Array(nc), dist = new Int32Array(nc).fill(-1), q = [s]; sig[s] = 1; dist[s] = 0;
        while (q.length) { var v = q.shift(); S.push(v); adj[v].forEach(function (x) { var w = x[0]; if (dist[w] < 0) { dist[w] = dist[v] + 1; q.push(w); } if (dist[w] === dist[v] + 1) { sig[w] += sig[v]; P[w].push([v, x[1]]); } }); }
        var del = new Float64Array(nc);
        while (S.length) { var w2 = S.pop(); P[w2].forEach(function (pv) { var c = sig[pv[0]] / sig[w2] * (1 + del[w2]); del[pv[0]] += c; ebc[pv[1]] += c; }); if (w2 !== s) bc[w2] += del[w2]; }
      }
      var norm = (nc - 1) * (nc - 2); for (var i = 0; i < nc; i++) bc[i] /= norm;
      core.bc = bc;
      core.betweenEdges = E.map(function (e, i) { return { e: e, v: ebc[i] / norm }; }).sort(function (a, b) { return b.v - a.v; });
      var ROOT = G.idx['Atlas'];
      var byBC = Array.from(bc).map(function (v, i) { return [i, v]; }).filter(function (x) { return x[0] !== ROOT; }).sort(function (a, b) { return b[1] - a[1]; });
      byBC.slice(0, 3).forEach(function (x) {
        var cs = {}; adj[x[0]].forEach(function (y) { cs[N[y[0]].comm] = 1; }); var cn = Object.keys(cs).map(function (c) { return C.communities[c][0]; });
        out.push({ kind: 'bridge', title: name(x[0]) + ' is a bridge', body: 'Betweenness ' + x[1].toFixed(3) + ' — it sits on many shortest paths and touches ' + cn.length + ' communities (' + cn.slice(0, 3).join(', ') + (cn.length > 3 ? '…' : '') + ').', nodes: [x[0]].concat(adj[x[0]].slice(0, 6).map(function (y) { return y[0]; })), score: x[1], q: 'Why does ' + name(x[0]) + ' connect ' + cn.slice(0, 2).join(' and ') + '?' });
      });
      // articulation points
      var disc = new Int32Array(nc).fill(-1), low = new Int32Array(nc), timer = 0, art = {};
      function dfs(u, p) { disc[u] = low[u] = timer++; var ch = 0; adj[u].forEach(function (x) { var v = x[0]; if (disc[v] < 0) { ch++; dfs(v, u); low[u] = Math.min(low[u], low[v]); if (p >= 0 && low[v] >= disc[u]) art[u] = (art[u] || 0) + 1; } else if (v !== p) low[u] = Math.min(low[u], disc[v]); }); if (p < 0 && ch > 1) art[u] = ch - 1; }
      for (i = 0; i < nc; i++) if (disc[i] < 0) dfs(i, -1);
      var arts = Object.keys(art).map(Number).filter(function (x) { return x !== ROOT; }).sort(function (a, b) { return art[b] - art[a] || deg[b] - deg[a]; });
      if (arts.length) out.push({ kind: 'fragile', title: arts.length + ' single points of failure', body: 'Removing any one of ' + arts.slice(0, 5).map(name).join(', ') + (arts.length > 5 ? '…' : '') + ' disconnects part of the graph. ' + name(arts[0]) + ' alone would cut off ' + art[arts[0]] + ' branch' + (art[arts[0]] > 1 ? 'es' : '') + '.', nodes: arts.slice(0, 8), score: arts.length / nc, q: 'What depends on ' + name(arts[0]) + '?' });
      // predicted links
      var pl = []; for (var a = 0; a < nc; a++) for (var b = a + 1; b < nc; b++) if (key[k2(a, b)] == null) { var sc = aa(a, b); if (sc > 0.8) pl.push([a, b, sc]); }
      pl.sort(function (x, y) { return y[2] - x[2]; });
      pl.slice(0, 3).forEach(function (x) { out.push({ kind: 'missing', title: 'Missing link? ' + name(x[0]) + ' — ' + name(x[1]), body: 'No edge, but they share neighbours (Adamic–Adar ' + x[2].toFixed(2) + '). Evolve will test adding it.', nodes: [x[0], x[1]].concat(adj[x[0]].filter(function (y) { return key[k2(y[0], x[1])] != null; }).map(function (y) { return y[0]; })), score: x[2], q: 'How is ' + name(x[0]) + ' related to ' + name(x[1]) + '?' }); });
      // irreducible hyperedges
      G.hyper.map(function (h) { var m = h.m, pairs = 0, have = 0; for (var x = 0; x < m.length; x++) for (var y = x + 1; y < m.length; y++) { pairs++; if (key[k2(m[x], m[y])] != null) have++; } return [h, have / pairs]; }).sort(function (x, y) { return x[1] - y[1]; }).slice(0, 2).forEach(function (x) {
        out.push({ kind: 'group', title: '“' + x[0].name + '” exists only as a group', body: 'Only ' + Math.round(x[1] * 100) + '% of its member pairs are linked by ordinary edges. Pairwise retrieval would miss it; the hyperedge carries it.', nodes: x[0].m, score: 1 - x[1], q: 'What belongs with ' + name(x[0].m[0]) + '?' });
      });
      // cross-domain analogies
      var an = E.filter(function (e) { return e.t === 'analog' && N[e.a].comm !== N[e.b].comm; }), far = an.map(function (e) { var p = (function () { var sv = E.indexOf(e); E.splice(sv, 1); rebuild(); var pp = bfsPath(e.a, e.b); E.splice(sv, 0, e); rebuild(); return pp; })(); return [e, p ? p.length - 1 : 99]; }).sort(function (x, y) { return y[1] - x[1]; });
      far.slice(0, 2).forEach(function (x) { out.push({ kind: 'analogy', title: name(x[0].a) + ' ≈ ' + name(x[0].b), body: 'A cross-domain analogy (' + C.communities[N[x[0].a].comm][0] + ' ↔ ' + C.communities[N[x[0].b].comm][0] + '). Without it the shortest route is ' + (x[1] >= 99 ? 'none' : x[1] + ' hops') + '.', nodes: [x[0].a, x[0].b], score: x[1], q: 'Why is ' + name(x[0].a) + ' like ' + name(x[0].b) + '?' }); });
      // self-reference: modules
      var mp = []; for (i = 0; i < 7; i++) { var p2 = bfsPath(mods[i], mods[i + 1]); mp.push(p2 ? p2.length - 1 : 0); }
      out.push({ kind: 'self', title: 'The agent is ' + mp.reduce(function (a, b) { return a + b; }, 0) + ' hops long', body: 'Its eight modules are concept nodes. Walking parse → compile through the data takes ' + mp.join(' + ') + ' hops; ' + name(mods[2]) + ' is the module with the highest PageRank among them.', nodes: mods.slice(), score: 1, q: 'What modules make up an agent?' });
      // time span
      var yrs = N.filter(function (d) { return d.year; }), old = yrs.reduce(function (a, b) { return a.year < b.year ? a : b; }), nu = yrs.reduce(function (a, b) { return a.year > b.year ? a : b; }), tp = bfsPath(old.i, nu.i, ROOT);
      if (tp) out.push({ kind: 'time', title: (nu.year - old.year) + ' years in ' + (tp.length - 1) + ' hops', body: name(old.i) + ' (' + old.year + ') reaches ' + name(nu.i) + ' (' + nu.year + ') through ' + tp.slice(1, -1).map(name).join(' → ') + '.', nodes: tp, score: tp.length, q: 'How is ' + name(old.i) + ' related to ' + name(nu.i) + '?' });
      // top pagerank
      var prt = Array.from(pr).map(function (v, i) { return [i, v]; }).filter(function (x) { return x[0] !== ROOT; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
      out.push({ kind: 'center', title: 'Centre of gravity: ' + name(prt[0][0]), body: 'Highest PageRank after the root: ' + prt.map(function (x) { return name(x[0]) + ' ' + (x[1] * 100).toFixed(1) + '%'; }).join(' · '), nodes: prt.map(function (x) { return x[0]; }), score: prt[0][1], q: 'What is ' + name(prt[0][0]) + ' connected to?' });
      return out;
    }
    core.insights = mine();

    /* ---- virtual files ---- */
    var src = {};
    ['atlas-corpus.js', 'lab-engine.js', 'gi-strategies.js', 'gi-github.js', 'gi-stack.js', 'gi-core.js'].forEach(function (f) { fetch(f).then(function (r) { return r.text(); }).then(function (t) { src[f] = t; emit('files'); }).catch(function () {}); });
    core.files = function () {
      return [
        { dir: 'corpus', name: 'atlas-corpus.js', live: false, get: function () { return src['atlas-corpus.js'] || 'loading…'; } },
        { dir: 'engine', name: 'lab-engine.js', live: false, get: function () { return src['lab-engine.js'] || 'loading…'; } },
        { dir: 'engine', name: 'gi-core.js', live: false, get: function () { return src['gi-core.js'] || 'loading…'; } },
        { dir: 'engine', name: 'gi-stack.js', live: false, get: function () { return src['gi-stack.js'] || 'loading…'; } },
        { dir: 'engine', name: 'gi-strategies.js', live: false, get: function () { return src['gi-strategies.js'] || 'loading…'; } },
        { dir: 'engine', name: 'gi-github.js', live: false, get: function () { return src['gi-github.js'] || 'loading…'; } },
        { dir: 'export', name: 'graph_agent.py', live: true, get: function () { return LabEngine.exportPython(G, { decay: core.params.decay, hops: core.params.hops, k: core.params.k, boost: 0, w: { isa: 1, uses: 0.8, analog: 0.6, hyper: core.params.hyper, inst: 0.5 } }); } },
        { dir: 'live', name: 'weights.json', live: true, get: function () { var ch = E.filter(function (e) { return Math.abs(e.w - e.w0) > 0.02 || e.src !== 'corpus'; }).sort(function (a, b) { return Math.abs(b.w - b.w0) - Math.abs(a.w - a.w0); }); return JSON.stringify({ params: core.params, edges: E.length, changed: ch.length, top: ch.slice(0, 40).map(function (e) { return { a: name(e.a), b: name(e.b), type: e.t, w: +e.w.toFixed(3), w0: e.w0, src: e.src }; }) }, null, 2); } },
        { dir: 'live', name: 'runs.jsonl', live: true, get: function () { return core.runs.map(function (r) { return JSON.stringify(r); }).join('\n') || '// no runs yet — start autopilot or type `run`'; } },
        { dir: 'live', name: 'insights.md', live: true, get: function () { return core.insights.map(function (x) { return '## ' + x.title + '\n' + x.body + '\nnodes: ' + x.nodes.map(name).join(', ') + '\nauto-question: ' + x.q + '\n'; }).join('\n'); } },
        { dir: 'live', name: 'evolution.log', live: true, get: function () { return core.evolution.map(function (e) { return e.t + '  ' + (e.op === 'add' ? '+' : '−') + ' ' + e.a + ' — ' + e.b + '  [' + e.via + ']  IQ ' + e.iq; }).join('\n') || '// no generations yet'; } },
        { dir: 'live', name: 'signature.dspy', live: true, get: function () { return 'class GraphEscalation(dspy.Signature):\n    """LM layer: called when graph confidence < 0.30 or recall < 0.34."""\n    question: str = dspy.InputField()\n    seeds: list[str] = dspy.InputField()\n    subgraph: str = dspy.InputField()\n    vocabulary: list[str] = dspy.InputField()\n    answer: str = dspy.OutputField()\n    missing_links: list[tuple[str, str, str]] = dspy.OutputField()\n    confidence: float = dspy.OutputField()\n\n# escalations so far: ' + core.stats.escalations + '\n# LM-proposed links accepted by evolve: ' + core.stats.llmLinks; } }
      ];
    };

    /* ---- autopilot ---- */
    var timer = null;
    core.setAutopilot = function (on, ms) {
      core.autopilot = on; clearInterval(timer);
      if (on) { timer = setInterval(function () { core.step(); if (core.cycle % 5 === 0 && core.think) core.think(); }, ms || 1700); log('sys', 'autopilot on \u00b7 probe \u2192 spread \u2192 score \u2192 hebb \u00b7 agent thinks every 5 \u00b7 measure every 4'); }
      else log('sys', 'autopilot off'); emit('auto');
    };

    core._int = { E: E, k2: k2, edgeIndex: function (a, b) { return key[k2(a, b)]; }, addEdge: addEdge, rebuild: rebuild, iq: iq, devIQ: core.devIQ, evalSet: evalSet, bench: bench, dev: dev, missQ: missQ, tried: tried, remine: function () { core.insights = mine(); }, name: name, cl: cl, ts: ts, now: now, rnd: rnd, log: log, emit: emit, measure: measure, G: G, N: N, nc: nc, C: C, mods: mods, spread: spread, TYPEW: TYPEW };
    if (window.GI_STACK && window.GI_STACK.wire) window.GI_STACK.wire(core);
    if (window.GI_ARENA && window.GI_ARENA.wire) window.GI_ARENA.wire(core);
    if (window.GI_HISTORY && window.GI_HISTORY.wire) window.GI_HISTORY.wire(core);

    measure();
    log('sys', 'graph loaded · ' + nc + ' concepts · ' + E.length + ' edges · ' + G.hyper.length + ' hyperedges · modules bound to ' + mods.map(name).join(', '));
    log('sys', 'benchmark: ' + bench.length + ' probes (' + C.train.length + ' corpus + ' + (bench.length - C.train.length) + ' hyperedge) · dev ' + dev.length + ' · IQ ' + core.iqHist[0].toFixed(3));
    log('sys', 'LM layer ' + (core.llmAvailable ? 'online (window.claude)' : 'offline') + ' · signature ' + SIG);
    log('insight', core.insights.length + ' insights mined: ' + core.insights.map(function (x) { return x.kind; }).join(', '));
    return core;
  }

  /* ================= live 3D view ================= */
  var ICE = [214, 236, 255], MOLT = [255, 106, 26], GOLD = [255, 190, 110], BLUE = [90, 140, 220];
  var THEME = { font: '"Geist Mono", ui-monospace, monospace', labelBg: 'rgba(4,5,9,0.72)', hot: [255, 150, 80], llm: [255, 255, 255], hit: [120, 220, 140], miss: [255, 100, 90], sub: [120, 200, 255], frag: [255, 80, 70] };
  /* GI.theme({ ice, molt, gold, blue, hot, llm, hit, miss, sub, frag: [r,g,b], font, labelBg }) — call before GI.View; defaults are the legacy palette. */
  function theme(t) { if (!t) return THEME; if (t.ice) ICE = t.ice; if (t.molt) MOLT = t.molt; if (t.gold) GOLD = t.gold; if (t.blue) BLUE = t.blue; for (var k in THEME) if (t[k] != null) THEME[k] = t[k]; return THEME; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + cl(a, 0, 1).toFixed(3) + ')'; }
  function mix(a, b, u) { return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)]; }
  function sprite(col, core) { var c = document.createElement('canvas'); c.width = c.height = 96; var x = c.getContext('2d'), g = x.createRadialGradient(48, 48, 0, 48, 48, 48); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(core, rgba(col, 0.9)); g.addColorStop(0.35, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, 96, 96); return c; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function View(host, core, opts) {
    opts = opts || {};
    var cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none'; host.appendChild(cv);
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, nc = core.nc, N = core.N;
    var SI = sprite(ICE, 0.06), SM = sprite(MOLT, 0.1), SG = sprite(GOLD, 0.08);
    var pos = core.G.layout.force.map(function (p) { return p.slice(); }), proj = new Array(nc);
    var V = { yaw: 0.5, pitch: 0.25, dist: 3.0, idle: 0, drag: null, hover: -1, sel: -1, temp: 0.3, mode: 'heat', act: new Float32Array(nc), labels: true, layout: 'force', targets: null, targetsName: null, lens: { fragility: false, links: false, analogy: false, hubs: false, bridges: false, path: false, evolved: false }, custom: {}, staticAct: null, retr: null, view: 'graph', pan2: [0, 0], zoom2: 1, mxh: null, mmOpen: {}, pathTo: -1 };
    var modSet = {}; core.mods.forEach(function (m, k) { modSet[m] = k; });
    var depthArr = (function () { var d = new Array(nc); for (var i = 0; i < nc; i++) { var c = 0, j = i; while (j != null && N[j].parent != null && c < 12) { var pj = core.G.idx[N[j].parent]; if (pj == null || pj >= nc) break; j = pj; c++; } d[i] = c; } return d; })();
    var parentArr = (function () { var p = new Array(nc); for (var i = 0; i < nc; i++) { var q = N[i].parent != null ? core.G.idx[N[i].parent] : null; p[i] = (q != null && q < nc && q !== i) ? q : -1; } return p; })();
    var kids = (function () { var k = [], i; for (i = 0; i < nc; i++) k.push([]); for (i = 0; i < nc; i++) if (parentArr[i] >= 0) k[parentArr[i]].push(i); return k; })();
    var maxDepth = Math.max(1, Math.max.apply(null, depthArr));
    function treeOrder() {
      var pr = core.pr || new Float32Array(nc), roots = [], i, cnt = 0, seen = new Uint8Array(nc), leaf = new Float32Array(nc);
      var by = function (a, b) { return (N[a].comm - N[b].comm) || (pr[b] - pr[a]); };
      for (i = 0; i < nc; i++) if (parentArr[i] < 0) roots.push(i);
      roots.sort(by);
      function dfs(u) { if (seen[u]) return leaf[u]; seen[u] = 1; var ch = kids[u].slice().sort(by); if (!ch.length) { leaf[u] = cnt++; return leaf[u]; } var s = 0; ch.forEach(function (c) { s += dfs(c); }); leaf[u] = s / ch.length; return leaf[u]; }
      roots.forEach(dfs); for (i = 0; i < nc; i++) if (!seen[i]) dfs(i);
      return { pos: leaf, leaves: Math.max(1, cnt) };
    }
    function fibp(i, n) { var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.399963; return [Math.cos(a) * r, y, Math.sin(a) * r]; }
    function layoutTargets(name2) {
      var Pn = new Array(nc), i, pr = core.pr || new Float32Array(nc);
      if (V.custom[name2]) { try { var PC = V.custom[name2]({ nc: nc, N: N, pr: core.pr || new Float32Array(nc), depth: depthArr, hash: hash, TAU: TAU }); if (PC && PC.length === nc) return PC.map(function (p) { return [(+p[0]) || 0, (+p[1]) || 0, (+p[2]) || 0]; }); } catch (e) {} }
      if (name2 === 'radial') { var ord = []; for (i = 0; i < nc; i++) ord.push(i); ord.sort(function (a, b) { return pr[b] - pr[a]; }); var per = 13; ord.forEach(function (id, rk) { var ring = Math.floor(rk / per), inr = rk % per, rr = 0.12 + ring * 0.3, ang = inr / per * TAU + ring * 0.7; Pn[id] = [Math.cos(ang) * rr, (N[id].comm - 7.5) * 0.015, Math.sin(ang) * rr]; }); }
      else if (name2 === 'sphere') { for (i = 0; i < nc; i++) { var f = fibp(N[i].comm, core.C.communities.length); var u = [f[0] + (hash(i) - 0.5) * 0.55, f[1] + (hash(i * 3) - 0.5) * 0.55, f[2] + (hash(i * 7) - 0.5) * 0.55], l = Math.hypot(u[0], u[1], u[2]) || 1; Pn[i] = [u[0] / l * 1.15, u[1] / l * 1.15, u[2] / l * 1.15]; } }
      else if (name2 === 'helix') { var ys = []; for (i = 0; i < nc; i++) ys.push([i, N[i].year || 1985]); ys.sort(function (a, b) { return a[1] - b[1]; }); ys.forEach(function (it, rk) { var t = rk / (nc - 1 || 1), ang = t * TAU * 4; Pn[it[0]] = [Math.cos(ang) * 0.78, (t - 0.5) * 2.3, Math.sin(ang) * 0.78]; }); }
      else if (name2 === 'chord') { var gr = {}; for (i = 0; i < nc; i++) { (gr[N[i].comm] = gr[N[i].comm] || []).push(i); } var ks = Object.keys(gr).sort(function (a, b) { return a - b; }), idx = 0; ks.forEach(function (c) { gr[c].forEach(function (id) { var ang = idx / nc * TAU; Pn[id] = [Math.cos(ang) * 1.18, Math.sin(ang) * 1.18, 0]; idx++; }); }); }
      else if (name2 === 'layers') { var md = 1; for (i = 0; i < nc; i++) md = Math.max(md, depthArr[i]); var bl = {}; for (i = 0; i < nc; i++) { (bl[depthArr[i]] = bl[depthArr[i]] || []).push(i); } Object.keys(bl).forEach(function (d) { var arr = bl[d]; arr.forEach(function (id, j) { var x = (arr.length > 1 ? j / (arr.length - 1) - 0.5 : 0) * 2.5; Pn[id] = [x, 1.05 - (d / md) * 2.1, (N[id].comm - 7.5) * 0.02]; }); }); }
      else if (name2 === 'grid') { for (i = 0; i < nc; i++) { var c = N[i].comm, cx = (c % 4 - 1.5) * 0.64, cy = (1.5 - Math.floor(c / 4)) * 0.64; Pn[i] = [cx + (hash(i) - 0.5) * 0.44, cy + (hash(i * 7) - 0.5) * 0.44, (hash(i * 13) - 0.5) * 0.3]; } }
      else if (name2 === 'tree' || name2 === 'radialtree') { var to = treeOrder(); for (i = 0; i < nc; i++) { var tu = to.pos[i] / Math.max(1, to.leaves - 1), dd = depthArr[i] / maxDepth; if (name2 === 'tree') Pn[i] = [(tu - 0.5) * 2.7, 1.05 - dd * 2.1, (N[i].comm - 7.5) * 0.025]; else { var ta = tu * TAU, tr = 0.1 + dd * 1.12; Pn[i] = [Math.cos(ta) * tr, (N[i].comm - 7.5) * 0.012, Math.sin(ta) * tr]; } } }
      else if (name2 === 'strata3d') { var lv = {}, CC = core.C.communities.length || 16; for (i = 0; i < nc; i++) (lv[depthArr[i]] = lv[depthArr[i]] || []).push(i); Object.keys(lv).forEach(function (d) { var arr = lv[d].slice().sort(function (a, b) { return pr[b] - pr[a]; }); arr.forEach(function (id, k) { var t = arr.length > 1 ? k / (arr.length - 1) : 0, ang = (N[id].comm / CC) * TAU + (hash(id) - 0.5) * 0.5, rr = 0.18 + t * 0.95; Pn[id] = [Math.cos(ang) * rr, 1.0 - (d / maxDepth) * 2.0, Math.sin(ang) * rr]; }); }); }
      else if (name2 === 'arc') { var oa = []; for (i = 0; i < nc; i++) oa.push(i); oa.sort(function (a, b) { return (N[a].comm - N[b].comm) || (pr[b] - pr[a]); }); oa.forEach(function (id, k) { Pn[id] = [(k / Math.max(1, nc - 1) - 0.5) * 2.8, -0.35, 0]; }); }
      else if (name2 === 'galaxy') { var CG = core.C.communities.length || 16, gg = {}; for (i = 0; i < nc; i++) (gg[N[i].comm] = gg[N[i].comm] || []).push(i); Object.keys(gg).forEach(function (cm) { var arr = gg[cm].slice().sort(function (a, b) { return pr[b] - pr[a]; }), a0 = (+cm / CG) * TAU; arr.forEach(function (id, k) { var t = arr.length > 1 ? k / (arr.length - 1) : 0, ang = a0 + t * 2.4, rr = 0.12 + t * 1.05; Pn[id] = [Math.cos(ang) * rr, (hash(id * 5) - 0.5) * 0.18 * (1 - t), Math.sin(ang) * rr]; }); }); }
      else { for (i = 0; i < nc; i++) Pn[i] = pos[i].slice(); }
      return Pn;
    }
    function drawGuides(name2) {
      ctx.lineWidth = 1;
      if (name2 === 'radial' || name2 === 'chord') { var o = P([0, 0, 0]); [0.42, 0.72, 1.0, 1.18].forEach(function (r) { ctx.strokeStyle = rgba(ICE, name2 === 'chord' && r > 1 ? 0.16 : 0.05); ctx.beginPath(); ctx.arc(o[0], o[1], o[3] * r, 0, TAU); ctx.stroke(); }); }
      else if (name2 === 'sphere') { for (var m = 0; m < 5; m++) { ctx.strokeStyle = rgba(ICE, 0.05); ctx.beginPath(); for (var k = 0; k <= 40; k++) { var a = k / 40 * TAU, ph = m / 5 * Math.PI, p = P([Math.cos(a) * Math.cos(ph), Math.sin(a), Math.cos(a) * Math.sin(ph)]); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); } }
      else if (name2 === 'helix') { var a1 = P([0, -1.35, 0]), b1 = P([0, 1.35, 0]); ctx.strokeStyle = rgba(ICE, 0.1); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke(); }
      else if (name2 === 'layers') { for (var d = 0; d < 6; d++) { var y = 1.05 - (d / 5) * 2.1, l = P([-1.4, y, 0]), rr = P([1.4, y, 0]); ctx.strokeStyle = rgba(ICE, 0.05); ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(rr[0], rr[1]); ctx.stroke(); } }
      else if (name2 === 'grid') { for (var c = 0; c < 16; c++) { var cx = (c % 4 - 1.5) * 0.64, cy = (1.5 - Math.floor(c / 4)) * 0.64, cs = [P([cx - 0.3, cy - 0.3, 0]), P([cx + 0.3, cy - 0.3, 0]), P([cx + 0.3, cy + 0.3, 0]), P([cx - 0.3, cy + 0.3, 0])]; ctx.strokeStyle = rgba(ICE, 0.06); ctx.beginPath(); cs.forEach(function (p, j) { j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke(); } }
    }
    function ringXZ(r, y, al) { ctx.strokeStyle = rgba(ICE, al); ctx.beginPath(); for (var k = 0; k <= 48; k++) { var a = k / 48 * TAU, p = P([Math.cos(a) * r, y, Math.sin(a) * r]); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
    function line3(a, b, al) { var p = P(a), q = P(b); ctx.strokeStyle = rgba(ICE, al); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    function drawGuides2(n2) {
      ctx.lineWidth = 1; var d;
      if (n2 === 'tree') for (d = 0; d <= maxDepth; d++) line3([-1.45, 1.05 - (d / maxDepth) * 2.1, 0], [1.45, 1.05 - (d / maxDepth) * 2.1, 0], 0.05);
      else if (n2 === 'radialtree') for (d = 1; d <= maxDepth; d++) ringXZ(0.1 + (d / maxDepth) * 1.12, 0, 0.06);
      else if (n2 === 'strata3d') { for (d = 0; d <= maxDepth; d++) ringXZ(1.15, 1.0 - (d / maxDepth) * 2.0, 0.08); line3([0, 1.1, 0], [0, -1.1, 0], 0.08); }
      else if (n2 === 'arc') line3([-1.45, -0.35, 0], [1.45, -0.35, 0], 0.14);
      else if (n2 === 'galaxy') { ringXZ(0.12, 0, 0.1); ringXZ(0.6, 0, 0.04); ringXZ(1.17, 0, 0.04); }
    }
    function resize() { var r = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; }
    var ro = new ResizeObserver(resize); ro.observe(host); resize();
    function P(p) { var cy = Math.cos(V.yaw), sy = Math.sin(V.yaw), cp = Math.cos(V.pitch), sp = Math.sin(V.pitch); var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] * cp - z * sp; z = p[1] * sp + z * cp; var zz = Math.max(0.2, z + V.dist), s = Math.min(W, H) * 1.05 / zz; return [W / 2 + x * s, H / 2 - y * s, zz, s]; }
    function hit(mx, my) { var b = -1, bd = 16; for (var i = 0; i < nc; i++) { var p = proj[i]; if (!p) continue; var d = Math.hypot(p[0] - mx, p[1] - my); if (d < bd) { bd = d; b = i; } } return b; }
    function ev(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener('pointerdown', function (e) { var m = ev(e); V.drag = { x: m[0], y: m[1], yaw: V.yaw, pitch: V.pitch, mv: 0, px: V.pan2[0], py: V.pan2[1] }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { var m = ev(e); if (V.drag) { var dx = m[0] - V.drag.x, dy = m[1] - V.drag.y; V.drag.mv = Math.max(V.drag.mv, Math.abs(dx) + Math.abs(dy)); if (V.view !== 'graph') { if (V.drag.mv > 3) V.pan2 = [V.drag.px + dx, V.drag.py + dy]; return; } V.yaw = V.drag.yaw + dx * 0.007; V.pitch = cl(V.drag.pitch + dy * 0.007, -1.3, 1.3); V.idle = 0; return; } if (V.view === 'matrix') { var hm = mxHit(m[0], m[1]); V.mxh = hm ? { r: hm.r, c: hm.c, x: m[0], y: m[1] } : null; V.hover = hm ? MX.order[hm.r] : -1; cv.style.cursor = hm ? 'crosshair' : 'grab'; return; } if (V.view === 'markmap') { var hn = mmHit(m[0], m[1]); V.hover = hn && hn.node != null ? hn.node : -1; cv.style.cursor = hn ? 'pointer' : 'grab'; return; } var h = hit(m[0], m[1]); V.hover = h; cv.style.cursor = h >= 0 ? 'pointer' : 'grab'; });
    cv.addEventListener('pointerup', function (e) { var m = ev(e), d = V.drag; V.drag = null; if (!d || d.mv >= 4) return; if (V.view === 'matrix') { var hm = mxHit(m[0], m[1]); V.sel = hm ? MX.order[hm.r] : -1; } else if (V.view === 'markmap') { var hn = mmHit(m[0], m[1]); if (hn && hn.d === 0) { var anyOpen = MM.root.kids.some(function (k) { return k.open; }); MM.root.kids.forEach(function (k) { V.mmOpen[k.id] = !anyOpen; }); return; } if (hn && hn.d === 1) { V.mmOpen[hn.id] = !hn.open; return; } V.sel = hn && hn.node != null ? hn.node : -1; } else V.sel = hit(m[0], m[1]); if (opts.onSelect) opts.onSelect(V.sel); });
    cv.addEventListener('pointerleave', function () { V.hover = -1; V.mxh = null; });
    cv.addEventListener('dblclick', function () { if (V.view !== 'graph') { V.pan2 = [0, 0]; V.zoom2 = 1; } });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); if (V.view !== 'graph') { var m = ev(e), z0 = V.zoom2, z1 = cl(z0 * (1 - e.deltaY * 0.0015), 0.35, 10), k = z1 / z0, bx = V.view === 'matrix' ? 112 : 24, by = V.view === 'matrix' ? 104 : 104; V.pan2 = [m[0] - (m[0] - bx - V.pan2[0]) * k - bx, m[1] - (m[1] - by - V.pan2[1]) * k - by]; V.zoom2 = z1; return; } V.dist = cl(V.dist * (1 + e.deltaY * 0.001), 1.4, 7); V.idle = 0; }, { passive: false });

    function simulate(dt) {
      var F = pos.map(function () { return [0, 0, 0]; }), E = core.E, t = V.temp;
      for (var a = 0; a < nc; a++) for (var b = a + 1; b < nc; b++) { var dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1], dz = pos[a][2] - pos[b][2], d2 = dx * dx + dy * dy + dz * dz + 1e-4, f = 0.0016 / d2; if (N[a].comm === N[b].comm) f *= 0.6; F[a][0] += dx * f; F[a][1] += dy * f; F[a][2] += dz * f; F[b][0] -= dx * f; F[b][1] -= dy * f; F[b][2] -= dz * f; }
      E.forEach(function (e) { var A = pos[e.a], B = pos[e.b], k = (e.t === 'isa' ? 0.5 : 0.18) * e.w; for (var q = 0; q < 3; q++) { var d = (B[q] - A[q]) * k; F[e.a][q] += d; F[e.b][q] -= d; } });
      for (var i = 0; i < nc; i++) for (var q2 = 0; q2 < 3; q2++) { F[i][q2] -= pos[i][q2] * 0.06; pos[i][q2] += cl(F[i][q2] * 0.2 * t, -0.03, 0.03); }
      V.temp += (0.12 - V.temp) * dt * 0.4;
    }
    function kick() { V.temp = 1; pos.forEach(function (p) { p[0] += (Math.random() - 0.5) * 0.5; p[1] += (Math.random() - 0.5) * 0.5; p[2] += (Math.random() - 0.5) * 0.5; }); V.shakeT = now(); }
    core.view = { kick: kick };
    function targetAct() {
      var z = core.viz, a = new Float32Array(nc); if (!z) return V.staticAct || a;
      var e = (now() - z.t0) / 1000, r = z.r;
      if (e < 0.35) r.seeds.forEach(function (s) { a[s] = e / 0.35; });
      else if (e < 1.6) { var H = r.hops.length - 1, x = (e - 0.35) / 1.25 * Math.max(1, H), h = Math.max(0, Math.min(Math.max(0, H - 1), Math.floor(x))), u = H < 1 ? 1 : x - h, hl = r.hops[h] || r.act, hn = r.hops[h + 1] || r.act; for (var i = 0; i < nc; i++) a[i] = hl[i] + (hn[i] - hl[i]) * u; }
      else { var fade = cl(1 - (e - 3.5) / 3, 0.25, 1), sub = {}; r.sub.forEach(function (s) { sub[s] = 1; }); for (i = 0; i < nc; i++) a[i] = (sub[i] || r.seeds.indexOf(i) >= 0 ? Math.max(0.55, r.act[i]) : r.act[i] * 0.15) * fade; }
      return a;
    }
    function quad(p0, c, p1, t) { var m = 1 - t; return [m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1]]; }
    function blob(s, x, y, r, a) { if (a <= 0.004) return; ctx.globalAlpha = cl(a, 0, 1); ctx.drawImage(s, x - r, y - r, r * 2, r * 2); }

    function ctl(a, b) { var A = pos[a], B = pos[b]; if (V.layout === 'arc') return [(A[0] + B[0]) / 2, A[1] + Math.abs(A[0] - B[0]) * 0.55, 0]; if (V.layout === 'tree' || V.layout === 'strata3d' || V.layout === 'layers') return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; return [(A[0] + B[0]) * 0.39, (A[1] + B[1]) * 0.39, (A[2] + B[2]) * 0.39]; }
    function bfs(a, b) { var adj = core.adj(), prev = new Int32Array(nc), seen = new Uint8Array(nc), q = [a], h = 0, z; for (z = 0; z < nc; z++) prev[z] = -1; seen[a] = 1; while (h < q.length) { var u = q[h++]; if (u === b) break; var nb = adj[u] || []; for (z = 0; z < nb.length; z++) { var w = nb[z][0]; if (!seen[w]) { seen[w] = 1; prev[w] = u; q.push(w); } } } if (!seen[b]) return null; var p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p; }
    var pcache = { k: '', p: null };
    function pathBetween(a, b) { if (a == null || b == null || a < 0 || b < 0 || a >= nc || b >= nc) return null; var key = a + '>' + b + ':' + core.E.length; if (pcache.k !== key) pcache = { k: key, p: a === b ? [a] : bfs(a, b) }; return pcache.p; }
    function pathTarget() { return V.pathTo >= 0 ? V.pathTo : V.hover; }
    function tip(txt, x, y) { ctx.font = '500 11px ' + THEME.font; var w = ctx.measureText(txt).width + 14, bx = Math.max(6, Math.min(W - w - 6, x + 14)), by = Math.max(6, y - 32); ctx.fillStyle = THEME.labelBg; ctx.fillRect(bx, by, w, 22); ctx.strokeStyle = rgba(GOLD, 0.5); ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, 21); ctx.fillStyle = rgba(ICE, 0.95); ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 7, by + 11); ctx.textBaseline = 'alphabetic'; }
    /* ---- matrix view: adjacency grouped by community ---- */
    var MX = { order: null, at: null, key: '' };
    function mxPrep() { var key = nc + ':' + (core.pr ? 1 : 0) + ':' + core.C.communities.length; if (MX.key === key && MX.order) return; var pr = core.pr || new Float32Array(nc), o = [], i; for (i = 0; i < nc; i++) o.push(i); o.sort(function (a, b) { return (N[a].comm - N[b].comm) || (pr[b] - pr[a]); }); var at = new Int32Array(nc); o.forEach(function (id, k) { at[id] = k; }); MX.order = o; MX.at = at; MX.key = key; }
    function mxGeo() { var L = 112, T0 = 104, B0 = 56, side = Math.max(80, Math.min(W - L - 28, H - T0 - B0)), cs = side / nc * V.zoom2; return { x0: L + V.pan2[0], y0: T0 + V.pan2[1], cs: cs }; }
    function mxHit(mx, my) { mxPrep(); var g = mxGeo(), c = Math.floor((mx - g.x0) / g.cs), r = Math.floor((my - g.y0) / g.cs); if (r < 0 || r >= nc) return null; if (c < 0 || c >= nc) return mx < g.x0 && mx > g.x0 - 110 ? { r: r, c: r } : null; return { r: r, c: c }; }
    function drawMatrix(T) {
      mxPrep(); var g = mxGeo(), x0 = g.x0, y0 = g.y0, cs = g.cs, S = cs * nc, mode = V.mode, foc = core.focus ? core.focus.nodes : null, fs = {}, cm = core.C.communities, k, i, start = 0;
      if (foc) foc.forEach(function (x) { fs[x] = 1; });
      ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1; ctx.fillStyle = rgba(ICE, 0.02); ctx.fillRect(x0, y0, S, S);
      for (k = 1; k <= nc; k++) { if (k === nc || N[MX.order[k]].comm !== N[MX.order[k - 1]].comm) { var c0 = N[MX.order[start]].comm, len = k - start; ctx.fillStyle = rgba(GOLD, 0.035); ctx.fillRect(x0 + start * cs, y0 + start * cs, len * cs, len * cs); ctx.strokeStyle = rgba(GOLD, 0.35); ctx.strokeRect(x0 + start * cs + 0.5, y0 + start * cs + 0.5, Math.max(1, len * cs - 1), Math.max(1, len * cs - 1)); if (k < nc) { ctx.strokeStyle = rgba(ICE, 0.07); ctx.beginPath(); ctx.moveTo(x0, y0 + k * cs); ctx.lineTo(x0 + S, y0 + k * cs); ctx.moveTo(x0 + k * cs, y0); ctx.lineTo(x0 + k * cs, y0 + S); ctx.stroke(); } if (len * cs >= 10) { ctx.font = '500 10px ' + THEME.font; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(ICE, 0.6); var nm = cm[c0] ? String(cm[c0][0]) : 'c' + c0; ctx.fillText(nm.length > 16 ? nm.slice(0, 15) + '\u2026' : nm, x0 - 8, y0 + (start + len / 2) * cs); } start = k; } }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.strokeStyle = rgba(ICE, 0.14); ctx.strokeRect(x0 - 0.5, y0 - 0.5, S + 1, S + 1);
      var pad = cs > 5 ? 0.6 : 0, cw = Math.max(1, cs - pad * 2);
      core.E.forEach(function (e) { var r = MX.at[e.a], q = MX.at[e.b], heat = Math.min(V.act[e.a], V.act[e.b]), col = ICE, al = 0.22 + Math.min(1, e.w) * 0.3; if (mode === 'heat') { col = mix(ICE, MOLT, cl(heat * 1.4, 0, 1)); al += heat * 0.55; } else if (mode === 'plastic') { var dw = e.w - e.w0; col = dw > 0 ? mix(ICE, MOLT, cl(dw * 1.5, 0, 1)) : mix(ICE, BLUE, cl(-dw * 2, 0, 1)); al = 0.18 + Math.min(0.8, Math.abs(dw) * 1.2); } else if (mode === 'community') { col = N[e.a].comm === N[e.b].comm ? GOLD : MOLT; al = 0.6; } else if (mode === 'insight') { var on = fs[e.a] && fs[e.b]; col = on ? GOLD : ICE; al = on ? 0.95 : 0.07; } if (e.src !== 'corpus' && mode !== 'insight') { col = e.t === 'llm' ? THEME.llm : GOLD; al = Math.max(al, 0.75); } if (V.lens.evolved && e.src !== 'corpus') { col = GOLD; al = 0.6 + 0.35 * Math.sin(T * 2.4); } ctx.fillStyle = rgba(col, al); ctx.fillRect(x0 + q * cs + pad, y0 + r * cs + pad, cw, cw); ctx.fillRect(x0 + r * cs + pad, y0 + q * cs + pad, cw, cw); });
      for (i = 0; i < nc; i++) { var id = MX.order[i], a = V.act[id]; if (a > 0.02) { ctx.fillStyle = rgba(MOLT, cl(0.25 + a, 0, 1)); ctx.fillRect(x0 + i * cs, y0 + i * cs, cs, cs); } }
      var mark = function (a2, b2, col, al) { var r = MX.at[a2], q = MX.at[b2]; ctx.strokeStyle = rgba(col, al); ctx.lineWidth = 1.2; ctx.strokeRect(x0 + q * cs - 1, y0 + r * cs - 1, cs + 2, cs + 2); ctx.strokeRect(x0 + r * cs - 1, y0 + q * cs - 1, cs + 2, cs + 2); };
      if (V.lens.links) (core.insights || []).filter(function (x) { return x.kind === 'missing'; }).forEach(function (x) { mark(x.nodes[0], x.nodes[1], GOLD, 0.6 + 0.3 * Math.sin(T * 3)); });
      if (V.lens.hubs && core.pr) { var hs = []; for (i = 0; i < nc; i++) hs.push(i); hs.sort(function (p1, p2) { return core.pr[p2] - core.pr[p1]; }); hs.slice(0, 8).forEach(function (x) { ctx.fillStyle = rgba(GOLD, 0.12); ctx.fillRect(x0, y0 + MX.at[x] * cs, S, cs); }); }
      if (V.lens.bridges && core.bc) { var bs = []; for (i = 0; i < nc; i++) bs.push(i); bs.sort(function (p1, p2) { return core.bc[p2] - core.bc[p1]; }); bs.slice(0, 6).forEach(function (x) { ctx.fillStyle = rgba(MOLT, 0.1); ctx.fillRect(x0 + MX.at[x] * cs, y0, cs, S); }); }
      if (V.lens.fragility) { var fr = (core.insights || []).filter(function (x) { return x.kind === 'fragile'; })[0]; if (fr) fr.nodes.forEach(function (x) { var r = MX.at[x]; ctx.strokeStyle = rgba(THEME.frag, 0.85); ctx.lineWidth = 1.4; ctx.strokeRect(x0 + r * cs - 1.5, y0 + r * cs - 1.5, cs + 3, cs + 3); }); }
      if (V.lens.path && V.sel >= 0) { var tg = pathTarget(), ph = tg >= 0 && tg !== V.sel ? pathBetween(V.sel, tg) : null; if (ph) for (k = 0; k < ph.length - 1; k++) mark(ph[k], ph[k + 1], GOLD, 0.95); }
      if (V.retr) (V.retr.hit || []).forEach(function (x) { var r = MX.at[x]; ctx.strokeStyle = rgba(THEME.hit, 0.9); ctx.lineWidth = 1.2; ctx.strokeRect(x0 + r * cs - 1.5, y0 + r * cs - 1.5, cs + 3, cs + 3); });
      var hv = V.mxh; if (hv) { ctx.fillStyle = rgba(ICE, 0.07); ctx.fillRect(x0, y0 + hv.r * cs, S, cs); ctx.fillRect(x0 + hv.c * cs, y0, cs, S); var A = MX.order[hv.r], B = MX.order[hv.c], ei = core._int && core._int.edgeIndex ? core._int.edgeIndex(A, B) : null, ed = ei != null ? core.E[ei] : null; tip(N[A].name + (A !== B ? '  \u00d7  ' + N[B].name + (ed ? '  \u00b7  ' + ed.t + ' ' + ed.w.toFixed(2) + (ed.src !== 'corpus' ? ' \u00b7 evolved' : '') : '  \u00b7  no edge') : '  \u00b7  act ' + V.act[A].toFixed(2)), hv.x, hv.y); }
      if (V.sel >= 0) { var rs = MX.at[V.sel]; ctx.strokeStyle = rgba(ICE, 0.75); ctx.lineWidth = 1; ctx.strokeRect(x0 - 0.5, y0 + rs * cs - 0.5, S + 1, cs + 1); ctx.strokeRect(x0 + rs * cs - 0.5, y0 - 0.5, cs + 1, S + 1); ctx.font = '500 11px ' + THEME.font; ctx.fillStyle = rgba(ICE, 0.95); ctx.textBaseline = 'middle'; ctx.fillText(N[V.sel].name, x0 + S + 8, y0 + rs * cs + cs / 2); ctx.textBaseline = 'alphabetic'; }
    }
    /* ---- mind map (markmap-style outline): graph \u2192 communities \u2192 belongs-to tree ---- */
    var MM = { root: null, key: '', hits: [] };
    function mmBuild() {
      var key = nc + ':' + core.C.communities.length; if (MM.key === key && MM.root) return;
      var pr = core.pr || new Float32Array(nc), cmn = core.C.communities, g = {}, i, root = { id: 'root', label: 'Graph Lab', kids: [], d: 0, comm: -1 };
      for (i = 0; i < nc; i++) (g[N[i].comm] = g[N[i].comm] || []).push(i);
      Object.keys(g).map(Number).sort(function (a, b) { return a - b; }).forEach(function (cm) {
        var set = {}, made = {}, byPr = function (a, b) { return pr[b] - pr[a]; }; g[cm].forEach(function (x) { set[x] = 1; });
        var cn = { id: 'c' + cm, label: cmn[cm] ? String(cmn[cm][0]) : 'community ' + cm, kids: [], d: 1, comm: cm, count: g[cm].length };
        var mk = function (x, d) { if (made[x]) return null; made[x] = 1; var nd = { id: 'n' + x, node: x, label: N[x].name, kids: [], d: d, comm: cm }; kids[x].filter(function (y) { return set[y]; }).sort(byPr).forEach(function (y) { var c = mk(y, d + 1); if (c) nd.kids.push(c); }); return nd; };
        g[cm].filter(function (x) { return parentArr[x] < 0 || !set[parentArr[x]]; }).sort(byPr).forEach(function (x) { var c = mk(x, 2); if (c) cn.kids.push(c); });
        g[cm].forEach(function (x) { if (!made[x]) { var c = mk(x, 2); if (c) cn.kids.push(c); } });
        root.kids.push(cn);
      });
      MM.root = root; MM.key = key;
    }
    function mmColor(cm) { var P8 = [MOLT, GOLD, THEME.sub, [185, 150, 255], THEME.hit, mix(MOLT, GOLD, 0.5), mix(ICE, THEME.sub, 0.4), mix(GOLD, [185, 150, 255], 0.5)]; return P8[((cm % 8) + 8) % 8]; }
    function drawMarkmap(T) {
      mmBuild(); var z = V.zoom2, rowH = 19 * z, fz = Math.max(8, Math.min(16, 11.5 * z)), X0 = 24 + V.pan2[0], Y0 = 104 + V.pan2[1], hits = [], i, d;
      var auto = {}; if (V.sel >= 0) auto[N[V.sel].comm] = 1; for (i = 0; i < nc; i++) if (V.act[i] > 0.45) auto[N[i].comm] = 1; if (V.pathTo >= 0) auto[N[V.pathTo].comm] = 1;
      if (!Object.keys(auto).length && MM.root.kids.length) auto[MM.root.kids.slice().sort(function (a, b) { return b.count - a.count; })[0].comm] = 1;
      var font = function (nd) { return (nd.d <= 1 ? '600 ' : '500 ') + (nd.d === 0 ? fz + 3 : nd.d === 1 ? fz + 1 : fz) + 'px ' + THEME.font; };
      var maxW = [], meas = function (nd) { ctx.font = font(nd); nd.w = ctx.measureText(nd.label + (nd.d === 1 ? '  +' + nd.count : '')).width + 12; maxW[nd.d] = Math.max(maxW[nd.d] || 0, nd.w); nd.kids.forEach(meas); };
      meas(MM.root);
      var colX = [X0]; for (d = 1; d < maxW.length; d++) colX[d] = colX[d - 1] + maxW[d - 1] + 34 * z;
      var y = Y0, place = function (nd) { nd.x = colX[nd.d] != null ? colX[nd.d] : X0; nd.open = nd.d !== 1 ? true : (V.mmOpen[nd.id] != null ? !!V.mmOpen[nd.id] : !!auto[nd.comm]); if (!nd.kids.length || !nd.open) { nd.y = y; y += rowH; return; } nd.kids.forEach(place); nd.y = (nd.kids[0].y + nd.kids[nd.kids.length - 1].y) / 2; };
      place(MM.root);
      var tg = pathTarget(), ph = V.lens.path && V.sel >= 0 && tg >= 0 && tg !== V.sel ? pathBetween(V.sel, tg) : null, onP = {}; if (ph) ph.forEach(function (x) { onP[x] = 1; });
      ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'alphabetic';
      var draw = function (nd, par) {
        var vis = (nd.y > -30 && nd.y < H + 30) || (par && par.y > -30 && par.y < H + 30);
        if (vis) {
          var col = nd.d === 0 ? ICE : mmColor(nd.comm), a = nd.node != null ? V.act[nd.node] : 0, isSel = nd.node != null && nd.node === V.sel, onPath = nd.node != null && onP[nd.node], lbl = nd.label + (nd.d === 1 && !nd.open ? '  +' + nd.count : ''), w = nd.w;
          if (par) { var sx = par.x + par.w, sy = par.y, mx = (sx + nd.x) / 2; ctx.strokeStyle = rgba(onPath ? GOLD : col, onPath ? 0.95 : 0.5); ctx.lineWidth = Math.max(1, (onPath ? 2.6 : Math.max(1, 2.2 - nd.d * 0.35)) * Math.min(1.5, z)); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(mx, sy, mx, nd.y, nd.x, nd.y); ctx.stroke(); }
          ctx.strokeStyle = rgba(onPath ? GOLD : col, nd.d <= 1 ? 0.9 : 0.6); ctx.lineWidth = nd.d <= 1 ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(nd.x + w, nd.y); ctx.stroke();
          if (a > 0.2) blob(SM, nd.x + w / 2, nd.y - fz * 0.45, Math.min(44, w * 0.55), Math.min(0.7, a * 0.7));
          ctx.font = font(nd); ctx.fillStyle = isSel ? rgba(ICE, 1) : onPath ? rgba(GOLD, 1) : a > 0.2 ? rgba(mix(ICE, MOLT, cl(a, 0, 1)), 1) : rgba(ICE, nd.d <= 1 ? 0.95 : 0.8);
          ctx.fillText(lbl, nd.x + 5, nd.y - 5);
          if (nd.kids.length) { ctx.fillStyle = nd.open ? THEME.labelBg : rgba(col, 1); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(nd.x + w, nd.y, 3.4 * Math.min(1.4, z), 0, TAU); ctx.fill(); ctx.stroke(); }
          if (isSel || (nd.node != null && nd.node === V.hover)) { ctx.strokeStyle = isSel ? rgba(ICE, 0.75) : rgba(GOLD, 0.55); ctx.lineWidth = 1; ctx.strokeRect(nd.x - 2, nd.y - fz - 8, w + 4, fz + 11); }
          hits.push({ x: nd.x, y: nd.y - fz - 8, w: w + 8, h: fz + 12, nd: nd });
        }
        if (nd.open) nd.kids.forEach(function (k) { draw(k, nd); });
      };
      draw(MM.root, null);
      MM.hits = hits;
    }
    function mmHit(mx, my) { var hs = MM.hits || []; for (var i = hs.length - 1; i >= 0; i--) { var h = hs[i]; if (mx >= h.x - 4 && mx <= h.x + h.w + 4 && my >= h.y && my <= h.y + h.h) return h.nd; } return null; }
    var last = now(), raf;
    function frame() {
      raf = requestAnimationFrame(frame);
      var t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t; var T = t / 1000;
      V.idle += dt; if (!V.drag && V.idle > 2.5) V.yaw += dt * 0.05;
      if (V.layout === 'force') simulate(dt);
      else { if (!V.targets || V.targetsName !== V.layout) { V.targets = layoutTargets(V.layout); V.targetsName = V.layout; } var kk = Math.min(1, dt * 2.4); for (var li = 0; li < nc; li++) { var tg = V.targets[li]; if (!tg) continue; pos[li][0] += (tg[0] - pos[li][0]) * kk; pos[li][1] += (tg[1] - pos[li][1]) * kk; pos[li][2] += (tg[2] - pos[li][2]) * kk; } }
      var ta = targetAct(); for (var i = 0; i < nc; i++) V.act[i] += (ta[i] - V.act[i]) * Math.min(1, dt * 8);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
      if (V.view === 'matrix') { try { drawMatrix(T); } catch (err) {} return; }
      if (V.view === 'markmap') { try { drawMarkmap(T); } catch (err) {} return; }
      for (i = 0; i < nc; i++) proj[i] = P(pos[i]);
      ctx.globalCompositeOperation = 'lighter';
      // floor
      var gy = -1.2; for (var g = -2.8; g <= 2.81; g += 0.35) { [[[g, gy, -2.8], [g, gy, 2.8]], [[-2.8, gy, g], [2.8, gy, g]]].forEach(function (L) { var a = P(L[0]), b = P(L[1]); ctx.strokeStyle = rgba(ICE, 0.045); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }); }
      if (V.layout !== 'force') { drawGuides(V.layout); drawGuides2(V.layout); }
      var mode = V.mode, foc = core.focus ? core.focus.nodes : null, focSet = {}; if (foc) foc.forEach(function (x) { focSet[x] = 1; });
      var shk = V.shakeT ? cl(1 - (t - V.shakeT) / 1500, 0, 1) : 0;
      // edges
      core.E.forEach(function (e, k) {
        var a = proj[e.a], b = proj[e.b], c = P(ctl(e.a, e.b));
        var heat = Math.min(V.act[e.a], V.act[e.b]), dz = cl(1.5 - ((a[2] + b[2]) / 2 - V.dist) * 0.45, 0.2, 1), col = ICE, al = 0.08 + (e.t === 'isa' ? 0.06 : 0), lw = 1;
        if (mode === 'heat') { col = mix(ICE, MOLT, cl(heat * 1.4, 0, 1)); al += heat * 0.6; lw += heat * 1.5; }
        else if (mode === 'plastic') { var dw = e.w - e.w0; col = dw > 0 ? mix(ICE, MOLT, cl(dw * 1.5, 0, 1)) : mix(ICE, BLUE, cl(-dw * 2, 0, 1)); al = 0.06 + Math.abs(dw) * 0.6; lw = 0.6 + e.w * 1.4; }
        else if (mode === 'community') { col = N[e.a].comm === N[e.b].comm ? mix(ICE, GOLD, (N[e.a].comm % 8) / 10) : MOLT; al = N[e.a].comm === N[e.b].comm ? 0.12 : 0.3; }
        else if (mode === 'insight') { var on = focSet[e.a] && focSet[e.b]; col = on ? GOLD : ICE; al = on ? 0.7 : 0.04; lw = on ? 2 : 1; }
        if (e.src !== 'corpus') { col = e.t === 'llm' ? THEME.llm : GOLD; al = Math.max(al, 0.55); ctx.setLineDash([4, 6]); ctx.lineDashOffset = -T * 24; } else ctx.setLineDash([]);
        al += shk * 0.2;
        ctx.strokeStyle = rgba(col, al * dz); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
        if (mode !== 'insight' || focSet[e.a]) { var n = heat > 0.2 ? 3 : 1; for (var j = 0; j < n; j++) { var tt = (T * (0.15 + heat * 0.5 + (mode === 'plastic' ? e.w * 0.15 : 0)) + hash(k) + j / n) % 1, pt = quad(a, c, b, tt); blob(heat > 0.2 ? SM : SI, pt[0], pt[1], 2.5 + heat * 5, (0.22 + heat * 0.7) * dz); } }
      });
      ctx.setLineDash([]);
      // agent route
      for (var k = 0; k < 7; k++) { var A = proj[core.mods[k]], B = proj[core.mods[k + 1]], ma = pos[core.mods[k]], mb = pos[core.mods[k + 1]], m3 = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2 + 0.18, (ma[2] + mb[2]) / 2], lm = Math.hypot(m3[0], m3[1], m3[2]) || 1, cc = P([m3[0] * (1 + 0.3 / lm), m3[1] * (1 + 0.3 / lm), m3[2] * (1 + 0.3 / lm)]);
        [[7, 0.07], [2.5, 0.22], [1.1, 0.85]].forEach(function (L, li) { ctx.strokeStyle = rgba(li === 2 ? GOLD : MOLT, L[1] * 0.8); ctx.lineWidth = L[0]; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(cc[0], cc[1], B[0], B[1]); ctx.stroke(); });
        var tp = (T * 0.3 + k * 0.17) % 1, pq = quad(A, cc, B, tp); blob(SG, pq[0], pq[1], 7, 0.6); }
      // nodes
      var ord = []; for (i = 0; i < nc; i++) ord.push(i); ord.sort(function (a, b) { return proj[b][2] - proj[a][2]; });
      var pr = core.pr;
      ord.forEach(function (i) {
        var p = proj[i], blur = Math.abs(p[2] - V.dist + 0.2), deg = core.adj()[i].length, base = (2.4 + Math.sqrt(deg) * 1.3) * p[3] / 420, a = V.act[i];
        if (mode === 'insight' && foc) a = focSet[i] ? 0.8 : 0;
        var r = base * (1 + blur * 1.0) * (1 + a * 0.8), da = 1 / (1 + blur * 1.5), col = mode === 'community' ? sprite : null;
        var dim = mode === 'insight' && foc && !focSet[i] ? 0.3 : 1;
        blob(SI, p[0], p[1], r * 5, (0.5 + 0.5 * da) * (1 - a) * dim);
        if (a > 0.02) blob(mode === 'insight' ? SG : SM, p[0], p[1], r * 7, a);
        if (mode === 'plastic' && pr) blob(SG, p[0], p[1], r * 3 * (1 + pr[i] * 40), 0.25);
        if (modSet[i] != null) { ctx.strokeStyle = rgba(GOLD, 0.8); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, TAU); ctx.stroke(); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(T * 0.6 + modSet[i]); ctx.beginPath(); ctx.arc(0, 0, 16, 0, 1); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI, Math.PI + 1); ctx.stroke(); ctx.restore(); }
        if (i === V.sel || i === V.hover) { ctx.strokeStyle = rgba(ICE, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, TAU); ctx.stroke(); }
      });
      // lenses (self-shipped overlays)
      if (V.lens.links) { (core.insights || []).filter(function (x) { return x.kind === 'missing'; }).forEach(function (x) { var a = proj[x.nodes[0]], b = proj[x.nodes[1]]; if (!a || !b) return; ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(GOLD, 0.45 + 0.3 * Math.sin(T * 2)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); blob(SG, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 8, 0.5); }); }
      if (V.lens.analogy) { core.E.forEach(function (e) { if (e.t === 'analog' && N[e.a].comm !== N[e.b].comm) { var a = proj[e.a], b = proj[e.b], mid = [(pos[e.a][0] + pos[e.b][0]) * 0.5, (pos[e.a][1] + pos[e.b][1]) * 0.5 + 0.3, (pos[e.a][2] + pos[e.b][2]) * 0.5], c = P(mid); ctx.strokeStyle = rgba(GOLD, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); } }); }
      if (V.lens.fragility) { var fr = (core.insights || []).filter(function (x) { return x.kind === 'fragile'; })[0]; if (fr) fr.nodes.forEach(function (i) { var p = proj[i]; if (!p) return; var pu = 0.5 + 0.5 * Math.sin(T * 3 + i); ctx.strokeStyle = rgba(THEME.frag, 0.5 + 0.4 * pu); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 12 + 3 * pu, 0, TAU); ctx.stroke(); }); }
      if (V.lens.hubs && pr) { var hubs = []; for (i = 0; i < nc; i++) hubs.push(i); hubs.sort(function (p1, p2) { return pr[p2] - pr[p1]; }); hubs.slice(0, 8).forEach(function (x, k) { var p = proj[x]; if (!p) return; var rr = Math.min(34, 13 + pr[x] * 900); blob(SG, p[0], p[1], rr * 1.5, 0.22); ctx.strokeStyle = rgba(GOLD, 0.75 - k * 0.06); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, TAU); ctx.stroke(); ctx.font = '500 10px ' + THEME.font; ctx.fillStyle = rgba(GOLD, 0.9); ctx.fillText('#' + (k + 1), p[0] + rr * 0.72, p[1] - rr * 0.72); }); }
      if (V.lens.bridges && core.bc) { var brs = []; for (i = 0; i < nc; i++) brs.push(i); brs.sort(function (p1, p2) { return core.bc[p2] - core.bc[p1]; }); var bset = {}; brs.slice(0, 6).forEach(function (x) { bset[x] = 1; }); core.E.forEach(function (e) { if (!(bset[e.a] || bset[e.b]) || N[e.a].comm === N[e.b].comm) return; var a = proj[e.a], b = proj[e.b], c = P(ctl(e.a, e.b)); ctx.strokeStyle = rgba(MOLT, 0.6); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); }); brs.slice(0, 6).forEach(function (x) { var p = proj[x]; if (!p) return; ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(MOLT, 0.95); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], 15, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }); }
      if (V.lens.evolved) core.E.forEach(function (e, k) { if (e.src === 'corpus') return; var a = proj[e.a], b = proj[e.b], c = P(ctl(e.a, e.b)); ctx.strokeStyle = rgba(GOLD, 0.45 + 0.4 * Math.sin(T * 2.4 + k)); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); });
      if (V.lens.path && V.sel >= 0) { var ptg = pathTarget(), phh = ptg >= 0 && ptg !== V.sel ? pathBetween(V.sel, ptg) : null; if (phh) { for (var qq = 0; qq < phh.length - 1; qq++) { var pa = proj[phh[qq]], pb = proj[phh[qq + 1]], pcc = P(ctl(phh[qq], phh[qq + 1])); ctx.strokeStyle = rgba(GOLD, 0.95); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(pcc[0], pcc[1], pb[0], pb[1]); ctx.stroke(); var qp = quad(pa, pcc, pb, (T * 0.8 + qq * 0.2) % 1); blob(SG, qp[0], qp[1], 9, 0.8); } phh.forEach(function (x) { var p = proj[x]; ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, TAU); ctx.stroke(); }); } }
      // retrieval overlay (tester connectome): seeds, lifted subgraph, gold hits & misses
      if (V.retr) {
        var RR = V.retr;
        (RR.sub || []).forEach(function (i) { var p = proj[i]; if (!p) return; ctx.strokeStyle = rgba(THEME.sub, 0.55); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, TAU); ctx.stroke(); });
        (RR.miss || []).forEach(function (i) { var p = proj[i]; if (!p) return; ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(THEME.miss, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, TAU); ctx.stroke(); ctx.setLineDash([]); });
        (RR.hit || []).forEach(function (i) { var p = proj[i]; if (!p) return; blob(SG, p[0], p[1], 15, 0.5); ctx.strokeStyle = rgba(THEME.hit, 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, TAU); ctx.stroke(); });
        (RR.seeds || []).forEach(function (i) { var p = proj[i]; if (!p) return; blob(SM, p[0], p[1], 16, 0.6); ctx.strokeStyle = rgba(MOLT, 0.95); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, TAU); ctx.stroke(); });
      }
      // labels
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; var boxes = [];
      function lab(i, txt, col, size, pri) { var p = proj[i]; ctx.font = '500 ' + size + 'px ' + THEME.font; var w = ctx.measureText(txt).width, x = p[0] + 16, y = p[1] - 6, bx = [x - 4, y - size, w + 8, size + 6]; if (!pri && boxes.some(function (b) { return bx[0] < b[0] + b[2] && bx[0] + bx[2] > b[0] && bx[1] < b[1] + b[3] && bx[1] + bx[3] > b[1]; })) return; boxes.push(bx); ctx.fillStyle = THEME.labelBg; ctx.fillRect(bx[0], bx[1], bx[2], bx[3]); ctx.fillStyle = col; ctx.fillText(txt, x, y); }
      if (V.sel >= 0) lab(V.sel, N[V.sel].name, rgba(ICE, 1), 13, true);
      if (V.hover >= 0 && V.hover !== V.sel) lab(V.hover, N[V.hover].name, rgba(ICE, 1), 13, true);
      core.mods.forEach(function (m, k) { lab(m, '0' + (k + 1) + ' ' + core.C.program[k].id.toUpperCase(), rgba(GOLD, 1), 11, true); });
      if (mode === 'insight' && foc) foc.forEach(function (x) { lab(x, N[x].name, rgba(GOLD, 1), 12, false); });
      else { var hot = ord.filter(function (x) { return V.act[x] > 0.45; }).slice(-12); hot.forEach(function (x) { lab(x, N[x].name, rgba(THEME.hot, 1), 12, false); }); }
      if (V.labels && pr) { var tops = []; for (i = 0; i < nc; i++) tops.push(i); tops.sort(function (a, b) { return pr[b] - pr[a]; }); tops.slice(0, 10).forEach(function (x) { lab(x, N[x].name, rgba(ICE, 0.7), 11, false); }); }
    }
    raf = requestAnimationFrame(frame);
    var api = { addLayout: function (nm, fn) { V.custom[nm] = fn; V.targets = null; }, hasLayout: function (nm) { return !!V.custom[nm]; }, setMode: function (m) { V.mode = m; }, setField: function (act) { V.staticAct = act ? Float32Array.from(act) : null; }, showRetrieval: function (r) { V.retr = r || null; }, clearRetrieval: function () { V.retr = null; V.staticAct = null; }, setLayout: function (n) { V.layout = n; V.targets = null; if (n === 'force') V.temp = 0.6; }, setLens: function (k, v) { V.lens[k] = v; }, getState: function () { return { layout: V.layout, lens: V.lens, mode: V.mode, view: V.view, sel: V.sel, pathTo: V.pathTo }; }, setView: function (v) { V.view = (v === 'matrix' || v === 'markmap') ? v : 'graph'; V.pan2 = [0, 0]; V.zoom2 = 1; V.mxh = null; V.hover = -1; }, setPathTo: function (i) { V.pathTo = i == null ? -1 : i; }, path: function (a, b) { return pathBetween(a, b); }, select: function (i) { V.sel = i; }, kick: kick, setLabels: function (b) { V.labels = b; }, destroy: function () { cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); } }; core.view = api; return api;
  }

  window.GI = { create: create, View: View, theme: theme };
})();
