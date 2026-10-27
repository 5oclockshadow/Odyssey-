/* lab-engine.js — Graph Lab runtime.
   One graph (AtlasCorpus) = data + agent. Five forms lay the same nodes out
   differently; the agent's 8 modules are hub nodes inside the volume, and a
   query run is activation spreading through both. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function fib(i, n) { var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963; return [Math.cos(a) * r, y, Math.sin(a) * r]; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  var FORMS = [
    { id: 'force', label: 'Force 3D', tool: 'neighbours', cap: 'Edges pull, nodes repel. Communities settle into clusters.' },
    { id: 'hyper', label: 'Hypergraph', tool: 'groups', cap: 'Each hull is one hyperedge: a relation among all its members at once.' },
    { id: 'simplicial', label: 'Simplicial', tool: 'cliques', cap: 'Points within ε join; triples that all touch fill as triangles.' },
    { id: 'tesseract', label: 'Tesseract 4D', tool: 'vertex', cap: '16 communities sit on the 16 vertices of a hypercube rotating through w.' },
    { id: 'hyperbolic', label: 'Hyperbolic', tool: 'ancestry', cap: 'The belongs-to tree in a Poincaré ball: depth pushes toward the rim.' }
  ];

  /* ---------- graph ---------- */
  function build(C) {
    var nodes = [], idx = {};
    C.nodes.forEach(function (n, i) { idx[n[0]] = i; nodes.push({ i: i, name: n[0], comm: n[1], parent: n[2], year: n[3], def: n[4], hub: false }); });
    var edges = [];
    function add(a, b, t) { if (a == null || b == null || a === b) return; edges.push({ a: a, b: b, t: t }); }
    nodes.forEach(function (n) { if (n.parent && idx[n.parent] != null) add(n.i, idx[n.parent], 'isa'); });
    C.rels.forEach(function (r) { add(idx[r[0]], idx[r[2]], r[1]); });
    var hyper = C.hyper.map(function (h) { return { name: h[0], m: h[1].map(function (x) { return idx[x]; }).filter(function (x) { return x != null; }) }; });
    var nc = nodes.length, hubs = [];
    C.program.forEach(function (p, k) {
      var i = nodes.length;
      nodes.push({ i: i, name: p.id, comm: -1, hub: true, step: k, cls: p.cls, sig: p.sig, inst: p.inst, def: p.cls + ' · ' + p.sig, pos: p.pos });
      hubs.push(i);
      if (idx[p.inst] != null) add(i, idx[p.inst], 'inst');
    });
    C.flow.forEach(function (f) { add(hubs[f[0]], hubs[f[1]], 'flow'); });
    C.upd.forEach(function (f) { add(hubs[f[0]], hubs[f[1]], 'upd'); });
    var adj = nodes.map(function () { return []; });
    edges.forEach(function (e) { adj[e.a].push([e.b, e.t]); adj[e.b].push([e.a, e.t]); });
    var inHyper = nodes.map(function () { return []; });
    hyper.forEach(function (h, k) { h.m.forEach(function (i) { inHyper[i].push(k); }); });
    return { C: C, nodes: nodes, idx: idx, edges: edges, hyper: hyper, adj: adj, inHyper: inHyper, nc: nc, hubs: hubs };
  }

  /* ---------- layouts ---------- */
  function forceLayout(G) {
    var r = rng(7), n = G.nc, P = [], V = [];
    var cc = G.C.communities.map(function (_, c) { return fib(c, G.C.communities.length); });
    for (var i = 0; i < n; i++) { var c = cc[G.nodes[i].comm]; P.push([c[0] * 0.7 + (r() - .5) * .3, c[1] * 0.7 + (r() - .5) * .3, c[2] * 0.7 + (r() - .5) * .3]); }
    var E = G.edges.filter(function (e) { return e.a < n && e.b < n; });
    for (var it = 0; it < 360; it++) {
      var step = 0.02 * (1 - it / 400), F = P.map(function () { return [0, 0, 0]; });
      for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
        var dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], dz = P[a][2] - P[b][2], d2 = dx * dx + dy * dy + dz * dz + 1e-4, f = 0.0016 / d2;
        if (G.nodes[a].comm === G.nodes[b].comm) f *= 0.6;
        F[a][0] += dx * f; F[a][1] += dy * f; F[a][2] += dz * f; F[b][0] -= dx * f; F[b][1] -= dy * f; F[b][2] -= dz * f;
      }
      E.forEach(function (e) {
        var A = P[e.a], B = P[e.b], k = e.t === 'isa' ? 0.5 : 0.18;
        for (var q = 0; q < 3; q++) { var d = (B[q] - A[q]) * k; F[e.a][q] += d; F[e.b][q] -= d; }
      });
      for (i = 0; i < n; i++) for (var q2 = 0; q2 < 3; q2++) { F[i][q2] -= P[i][q2] * 0.05; P[i][q2] += Math.max(-0.05, Math.min(0.05, F[i][q2] * step * 10)); }
    }
    var rs = P.map(function (p) { return Math.hypot(p[0], p[1], p[2]); }).sort(function (a, b) { return a - b; }), m = rs[Math.floor(rs.length * 0.92)] || 1;
    return P.map(function (p) { var r = Math.hypot(p[0], p[1], p[2]) / m, s = r > 1.15 ? 1.15 / r : 1; return [p[0] / m * s, p[1] / m * s, p[2] / m * s]; });
  }
  function hyperbolicLayout(G) {
    var n = G.nc, P = new Array(n), kids = G.nodes.slice(0, n).map(function () { return []; }), root = G.idx['Atlas'];
    G.nodes.slice(0, n).forEach(function (d) { if (d.i === root) return; var p = d.parent != null ? G.idx[d.parent] : null; kids[p != null ? p : root].push(d.i); });
    P[root] = [0, 0, 0];
    function place(i, dir, depth, spread) {
      var ks = kids[i], up = Math.abs(dir[1]) < .9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(dir, up)), v = cross(dir, u);
      ks.forEach(function (k, j) {
        var a = TAU * j / ks.length + depth, d = norm([dir[0] + spread * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), dir[1] + spread * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), dir[2] + spread * (Math.cos(a) * u[2] + Math.sin(a) * v[2])]);
        var r = Math.tanh(0.62 * (depth + 1)) * 0.98; P[k] = [d[0] * r, d[1] * r, d[2] * r];
        place(k, d, depth + 1, spread * 0.55);
      });
    }
    kids[root].forEach(function (k, j) { var d = fib(j, kids[root].length), r = Math.tanh(0.62); P[k] = [d[0] * r, d[1] * r, d[2] * r]; place(k, d, 1, 0.5); });
    for (var i = 0; i < n; i++) if (!P[i]) P[i] = [0, 0, 0];
    return P;
  }
  function tesseract4(G) {
    var r = rng(11);
    return G.nodes.slice(0, G.nc).map(function (d) { var c = d.comm, j = 0.16; return [(c & 1 ? 1 : -1) + (r() - .5) * j * 2, (c & 2 ? 1 : -1) + (r() - .5) * j * 2, (c & 4 ? 1 : -1) + (r() - .5) * j * 2, (c & 8 ? 1 : -1) + (r() - .5) * j * 2]; });
  }
  function rot4(p, a, b) {
    var x = p[0], y = p[1], z = p[2], w = p[3], ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    var x1 = x * ca - w * sa, w1 = x * sa + w * ca, y1 = y * cb - w1 * sb, w2 = y * sb + w1 * cb;
    var s = 1.5 / (3.2 - w2); return [x1 * s * 0.62, y1 * s * 0.62, z * s * 0.62, w2];
  }
  var TESS_E = []; (function () { for (var a = 0; a < 16; a++) for (var k = 0; k < 4; k++) { var b = a ^ (1 << k); if (a < b) TESS_E.push([a, b]); } })();
  function vert4(c) { return [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1, c & 8 ? 1 : -1]; }

  function rips(P, n, eps) {
    var E = [], T = [], nb = []; for (var i = 0; i < n; i++) nb.push({});
    for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (dist(P[i], P[j]) < eps) { E.push([i, j]); nb[i][j] = 1; nb[j][i] = 1; }
    for (var e = 0; e < E.length && T.length < 1200; e++) { var a = E[e][0], b = E[e][1]; for (var k in nb[a]) { k = +k; if (k > b && nb[b][k]) T.push([a, b, k]); } }
    var par = []; for (i = 0; i < n; i++) par[i] = i;
    function f(x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }
    E.forEach(function (x) { par[f(x[0])] = f(x[1]); });
    var b0 = 0; for (i = 0; i < n; i++) if (f(i) === i) b0++;
    return { E: E, T: T, b0: b0, b1: Math.max(0, E.length - n + b0 - T.length) };
  }

  /* ---------- agent ---------- */
  var STOP = 'a an the of to in on and or is are be by how what which why does do can with for from its it that this as at into more than two between shown get difference made make up change'.split(' ').reduce(function (o, w) { o[w] = 1; return o; }, {});
  function stem(w) { return w.replace(/(ings|ing|ies|es|ed|s)$/, function (m) { return m === 'ies' ? 'y' : ''; }); }
  function toks(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w && !STOP[w]; }).map(stem); }
  var DEFAULTS = { decay: 0.55, hops: 3, k: 10, boost: 0.35, w: { isa: 1, uses: 0.8, analog: 0.6, hyper: 0.7, inst: 0.5 } };
  var TOOL_KW = { hyper: ['hyper', 'group', 'n-ary', 'among', 'more than two', 'set'], simplicial: ['hole', 'homology', 'simplex', 'simplic', 'triangle', 'betti', 'point cloud'], tesseract: ['tesseract', '4d', 'fourth', 'hypercube', 'dimension'], hyperbolic: ['hierarch', 'tree', 'taxonom', 'poincar', 'hyperbolic', 'distortion'] };
  var COMM_TOOL = { 3: 'force', 5: 'hyper', 6: 'simplicial', 9: 'tesseract', 8: 'hyperbolic' };

  function Agent(G) {
    var nameT = G.nodes.map(function (d) { return d.hub ? [] : toks(d.name); }), defT = G.nodes.map(function (d) { return d.hub ? [] : toks(d.def); });
    function parse(q) {
      var qt = toks(q), set = {}; qt.forEach(function (w) { set[w] = 1; });
      var sc = [];
      for (var i = 0; i < G.nc; i++) {
        var nt = nameT[i], hit = 0; nt.forEach(function (w) { if (set[w]) hit++; });
        var s = nt.length ? hit / nt.length : 0; if (hit) s += 0.2 * hit;
        if (q.toLowerCase().indexOf(G.nodes[i].name.toLowerCase()) >= 0) s += 1;
        var dh = 0; defT[i].forEach(function (w) { if (set[w]) dh++; }); s += 0.04 * dh;
        if (s > 0.12) sc.push([i, s]);
      }
      sc.sort(function (a, b) { return b[1] - a[1]; });
      return { tokens: qt, entities: sc.slice(0, 6) };
    }
    function spread(seeds, p) {
      var a = new Float32Array(G.nodes.length), hops = [];
      seeds.forEach(function (s) { a[s] = 1; }); hops.push(Array.from(a));
      for (var h = 0; h < p.hops; h++) {
        var b = Float32Array.from(a, function (x) { return x * 0.5; });
        for (var u = 0; u < G.nc; u++) {
          if (a[u] < 0.01) continue;
          var out = a[u] * p.decay / Math.sqrt(G.adj[u].length + 1);
          G.adj[u].forEach(function (e) { if (e[0] < G.nc) b[e[0]] += out * (p.w[e[1]] || 0.5); });
          G.inHyper[u].forEach(function (k) { G.hyper[k].m.forEach(function (v) { if (v !== u) b[v] += out * p.w.hyper; }); });
        }
        var m = 0; for (var i = 0; i < b.length; i++) m = Math.max(m, b[i]);
        for (i = 0; i < b.length; i++) b[i] /= m || 1;
        a = b; hops.push(Array.from(a));
      }
      return hops;
    }
    function tool(form, q, seeds, act) {
      var N = G.nodes, obs, ev = [];
      if (form === 'hyper') {
        var hs = []; seeds.forEach(function (s) { G.inHyper[s].forEach(function (k) { if (hs.indexOf(k) < 0) hs.push(k); }); });
        if (!hs.length) { var best = -1, bk = 0; G.hyper.forEach(function (h, k) { var t = h.m.reduce(function (z, i) { return z + act[i]; }, 0) / h.m.length; if (t > best) { best = t; bk = k; } }); hs = [bk]; }
        hs.forEach(function (k) { ev = ev.concat(G.hyper[k].m); });
        obs = hs.map(function (k) { return G.hyper[k].name + ' {' + G.hyper[k].m.map(function (i) { return N[i].name; }).join(', ') + '}'; }).join('; ');
      } else if (form === 'hyperbolic') {
        var chains = seeds.map(function (s) { var c = [], i = s; while (i != null && c.length < 8) { c.push(i); i = N[i].parent != null ? G.idx[N[i].parent] : null; } return c; });
        chains.forEach(function (c) { ev = ev.concat(c); G.nodes.forEach(function (d) { if (!d.hub && d.parent === N[c[0]].name) ev.push(d.i); }); });
        obs = chains.map(function (c) { return c.map(function (i) { return N[i].name; }).join(' ⊂ '); }).join('; ');
      } else if (form === 'tesseract') {
        var cs = []; seeds.forEach(function (s) { if (cs.indexOf(N[s].comm) < 0) cs.push(N[s].comm); });
        cs.forEach(function (c) { N.forEach(function (d) { if (!d.hub && d.comm === c && G.adj[d.i].length > 1) ev.push(d.i); }); });
        obs = cs.map(function (c) { return G.C.communities[c][0] + ' at vertex ' + vert4(c).map(function (x) { return x > 0 ? '+' : '−'; }).join(''); }).join('; ');
      } else if (form === 'simplicial') {
        var P = G.layout.force, near = [];
        seeds.forEach(function (s) { for (var i = 0; i < G.nc; i++) if (i !== s && dist(P[i], P[s]) < 0.3) near.push(i); });
        var tri = 0; for (var x = 0; x < near.length; x++) for (var y = x + 1; y < near.length; y++) if (dist(P[near[x]], P[near[y]]) < 0.3) tri++;
        ev = near; obs = near.length + ' points within ε=0.30 of the seeds, closing ' + tri + ' triangles';
      } else {
        seeds.forEach(function (s) { G.adj[s].forEach(function (e) { if (e[0] < G.nc) ev.push(e[0]); }); });
        obs = 'neighbours: ' + ev.slice(0, 10).map(function (i) { return N[i].name; }).join(', ');
      }
      return { obs: obs, ev: ev.filter(function (v, i, a) { return a.indexOf(v) === i; }) };
    }
    function pickTool(q, act, seeds) {
      var ql = q.toLowerCase();
      for (var f in TOOL_KW) if (TOOL_KW[f].some(function (k) { return ql.indexOf(k) >= 0; })) return f;
      var best = -1, bi = 0; for (var i = 0; i < G.nc; i++) if (act[i] > best && seeds.indexOf(i) < 0) { best = act[i]; bi = i; }
      var c = seeds.length ? G.nodes[seeds[0]].comm : G.nodes[bi].comm;
      return COMM_TOOL[c] || COMM_TOOL[G.nodes[bi].comm] || 'force';
    }
    function findGold(q) { var all = G.C.train.concat(G.C.dev), ql = q.trim().toLowerCase(); for (var i = 0; i < all.length; i++) if (all[i].q.toLowerCase() === ql) return all[i]; return null; }
    function run(q, p, forceSeeds) {
      p = p || DEFAULTS;
      var ps = parse(q), seeds = forceSeeds || ps.entities.slice(0, 3).map(function (e) { return e[0]; });
      if (!seeds.length) seeds = [G.idx['Graph']];
      var hops = spread(seeds, p), act = hops[hops.length - 1].slice();
      var form = pickTool(q, act, seeds), t = tool(form, q, seeds, act);
      var bst = p.boost != null ? p.boost : 0.35; t.ev.forEach(function (i) { act[i] = Math.min(1, act[i] * (1 + bst) + bst * 0.25); });
      var order = []; for (var i = 0; i < G.nc; i++) order.push(i);
      order.sort(function (a, b) { return act[b] - act[a]; });
      var sub = order.slice(0, p.k);
      seeds.forEach(function (s) { if (sub.indexOf(s) < 0) sub.push(s); });
      var subE = G.edges.filter(function (e) { return sub.indexOf(e.a) >= 0 && sub.indexOf(e.b) >= 0; });
      var answer = sub.slice(0, 4).map(function (i, k) { return { text: G.nodes[i].name + ': ' + G.nodes[i].def, cites: [k + 1] }; });
      var gold = findGold(q), score = null;
      if (gold) { var hit = gold.gold.filter(function (g) { return sub.indexOf(G.idx[g]) >= 0; }).length; score = hit / gold.gold.length; }
      var N = function (i) { return G.nodes[i].name; };
      var steps = [
        { id: 'parse', out: ps.entities.map(function (e) { return N(e[0]); }).join(', ') || '—' },
        { id: 'seed', out: seeds.map(N).join(', ') },
        { id: 'spread', out: p.hops + ' hops, decay ' + p.decay + ' → ' + order.filter(function (i) { return act[i] > 0.2; }).length + ' nodes above 0.2' },
        { id: 'reason', out: 'Thought: the question is about ' + FORMS.filter(function (f) { return f.id === form; })[0].label.toLowerCase() + ' structure. Action: ' + form + '.' + FORMS.filter(function (f) { return f.id === form; })[0].tool + '(' + seeds.map(N).join(', ') + '). Observation: ' + t.obs },
        { id: 'lift', out: sub.length + ' nodes, ' + subE.length + ' edges' },
        { id: 'answer', out: answer.length + ' cited sentences' },
        { id: 'metric', out: score == null ? 'no gold label for this question' : 'recall@' + p.k + ' = ' + score.toFixed(2) + ' (' + Math.round(score * gold.gold.length) + '/' + gold.gold.length + ')' },
        { id: 'compile', out: 'trace kept as a candidate demo' }
      ];
      return { q: q, seeds: seeds, entities: ps.entities, hops: hops, act: act, form: form, tool: t, sub: sub, subE: subE, answer: answer, score: score, gold: gold, steps: steps, params: p };
    }
    function evalSet(set, p) { var s = 0; set.forEach(function (ex) { var r = run(ex.q, p); var hit = ex.gold.filter(function (g) { return r.sub.indexOf(G.idx[g]) >= 0; }).length; s += hit / ex.gold.length; }); return s / set.length; }
    function compile() {
      var base = evalSet(G.C.train, DEFAULTS), best = { s: base, p: DEFAULTS }, tried = 0;
      [0.35, 0.55, 0.8].forEach(function (decay) { [0.3, 0.7, 1.1].forEach(function (hy) { [0.2, 0.6, 1.0].forEach(function (an) { [2, 3].forEach(function (hops) { [0, 0.15, 0.35].forEach(function (bo) { [0.6, 1].forEach(function (us) {
        var p = { decay: decay, hops: hops, k: DEFAULTS.k, boost: bo, w: { isa: 1, uses: us, analog: an, hyper: hy, inst: 0.5 } }; tried++;
        var s = evalSet(G.C.train, p); if (s > best.s + 1e-6) best = { s: s, p: p };
      }); }); }); }); }); });
      var demos = G.C.train.map(function (ex) { var r = run(ex.q, best.p); var hit = ex.gold.filter(function (g) { return r.sub.indexOf(G.idx[g]) >= 0; }).length / ex.gold.length; return { q: ex.q, score: hit }; }).filter(function (d) { return d.score >= 0.6; });
      return { params: best.p, trainBefore: base, trainAfter: best.s, devBefore: evalSet(G.C.dev, DEFAULTS), devAfter: evalSet(G.C.dev, best.p), tried: tried, demos: demos };
    }
    return { run: run, compile: compile, parse: parse, defaults: DEFAULTS };
  }

  /* ---------- exports ---------- */
  function exportPython(G, p, demos) {
    p = p || DEFAULTS;
    var data = { nodes: G.nodes.slice(0, G.nc).map(function (d) { return [d.name, d.comm, d.parent, d.def]; }), communities: G.C.communities.map(function (c) { return c[0]; }),
      edges: G.edges.filter(function (e) { return e.a < G.nc && e.b < G.nc; }).map(function (e) { return [G.nodes[e.a].name, e.t, G.nodes[e.b].name]; }), hyper: G.hyper.map(function (h) { return [h.name, h.m.map(function (i) { return G.nodes[i].name; })]; }) };
    var ex = function (e) { return '    dspy.Example(question=' + JSON.stringify(e.q) + ', gold=' + JSON.stringify(e.gold) + ').with_inputs("question"),'; };
    return [
      '"""Graph agent — exported from Graph Lab.',
      'The knowledge graph is the agent: 8 modules wired as a graph, five graph forms as tools,',
      'and retrieval as spreading activation over the same nodes. Requires: pip install dspy"""',
      'import json, math, dspy',
      '',
      "GRAPH = json.loads(r'''" + JSON.stringify(data) + "''')",
      'PARAMS = ' + JSON.stringify(p).replace(/"/g, "'"),
      '',
      'class Graph:',
      '    def __init__(self, g):',
      '        self.nodes = {n[0]: dict(name=n[0], comm=n[1], parent=n[2], definition=n[3]) for n in g["nodes"]}',
      '        self.adj = {k: [] for k in self.nodes}',
      '        for a, t, b in g["edges"]:',
      '            self.adj[a].append((b, t)); self.adj[b].append((a, t))',
      '        self.hyper = g["hyper"]; self.communities = g["communities"]',
      '',
      '    def spread(self, seeds, decay, hops, w):',
      '        act = {k: 0.0 for k in self.nodes}',
      '        for s in seeds: act[s] = 1.0',
      '        for _ in range(hops):',
      '            nxt = {k: v * 0.5 for k, v in act.items()}',
      '            for u, a in act.items():',
      '                if a < 0.01: continue',
      '                out = a * decay / math.sqrt(len(self.adj[u]) + 1)',
      '                for v, t in self.adj[u]: nxt[v] += out * w.get(t, 0.5)',
      '                for name, members in self.hyper:',
      '                    if u in members:',
      '                        for v in members:',
      '                            if v != u: nxt[v] += out * w["hyper"]',
      '            m = max(nxt.values()) or 1.0',
      '            act = {k: v / m for k, v in nxt.items()}',
      '        return act',
      '',
      'G = Graph(GRAPH)',
      '',
      '# --- graph forms as tools ---',
      'def neighbours(entity: str) -> str:',
      '    """Force-directed view: direct neighbours of a concept."""',
      '    return ", ".join(v for v, _ in G.adj.get(entity, []))',
      '',
      'def groups(entity: str) -> str:',
      '    """Hypergraph view: every hyperedge the concept belongs to."""',
      '    return "; ".join(f"{n} {{{\', \'.join(m)}}}" for n, m in G.hyper if entity in m) or "none"',
      '',
      'def ancestry(entity: str) -> str:',
      '    """Hyperbolic view: the belongs-to chain from the concept to the root."""',
      '    chain, n = [], entity',
      '    while n and n in G.nodes and len(chain) < 8:',
      '        chain.append(n); n = G.nodes[n]["parent"]',
      '    return " ⊂ ".join(chain)',
      '',
      'def vertex(entity: str) -> str:',
      '    """Tesseract view: the concept\'s community and its 4D hypercube vertex."""',
      '    c = G.nodes[entity]["comm"]',
      '    return G.communities[c] + " at " + "".join("+" if c >> k & 1 else "-" for k in range(4))',
      '',
      'def cliques(entity: str) -> str:',
      '    """Simplicial view: neighbours that are also linked to each other."""',
      '    nb = {v for v, _ in G.adj.get(entity, [])}',
      '    tri = [(a, b) for a in nb for b, _ in G.adj[a] if b in nb and a < b]',
      '    return "; ".join(f"{entity}–{a}–{b}" for a, b in tri[:12]) or "none"',
      '',
      '# --- signatures ---',
      'class ParseEntities(dspy.Signature):',
      '    """Pick the graph concepts the question refers to."""',
      '    question: str = dspy.InputField()',
      '    candidates: list[str] = dspy.InputField()',
      '    entities: list[str] = dspy.OutputField()',
      '',
      'class AnswerFromSubgraph(dspy.Signature):',
      '    """Answer using only the subgraph. Cite node numbers like [2]."""',
      '    question: str = dspy.InputField()',
      '    subgraph: str = dspy.InputField()',
      '    answer: str = dspy.OutputField()',
      '',
      '# --- the agent graph: parse → seed → spread → reason → lift → answer ---',
      'class GraphAgent(dspy.Module):',
      '    def __init__(self, params=PARAMS):',
      '        self.p = params',
      '        self.parse = dspy.Predict(ParseEntities)',
      '        self.reason = dspy.ReAct("question, seeds -> evidence", tools=[neighbours, groups, ancestry, vertex, cliques], max_iters=3)',
      '        self.answer = dspy.ChainOfThought(AnswerFromSubgraph)',
      '',
      '    def forward(self, question):',
      '        ents = self.parse(question=question, candidates=list(G.nodes)).entities',
      '        seeds = [e for e in ents if e in G.nodes][:3] or ["Graph"]',
      '        act = G.spread(seeds, self.p["decay"], self.p["hops"], self.p["w"])',
      '        evidence = self.reason(question=question, seeds=", ".join(seeds)).evidence',
      '        for name in G.nodes:',
      '            if name.lower() in evidence.lower(): act[name] = min(1.0, act[name] * (1 + self.p["boost"]) + self.p["boost"] * 0.25)',
      '        sub = sorted(act, key=act.get, reverse=True)[: self.p["k"]]',
      '        text = "\\n".join(f"[{i+1}] {n}: {G.nodes[n][\'definition\']}" for i, n in enumerate(sub))',
      '        pred = self.answer(question=question, subgraph=text)',
      '        return dspy.Prediction(answer=pred.answer, subgraph=sub, seeds=seeds)',
      '',
      'def metric(example, pred, trace=None):',
      '    return len(set(example.gold) & set(pred.subgraph)) / len(example.gold)',
      '',
      'trainset = [',
      G.C.train.map(ex).join('\n'),
      ']',
      'devset = [',
      G.C.dev.map(ex).join('\n'),
      ']',
      '',
      'if __name__ == "__main__":',
      '    dspy.configure(lm=dspy.LM("anthropic/claude-sonnet-4-5"))',
      '    agent = dspy.BootstrapFewShot(metric=metric, max_bootstrapped_demos=' + Math.max(2, (demos || []).length) + ').compile(GraphAgent(), trainset=trainset)',
      '    print(dspy.Evaluate(devset=devset, metric=metric)(agent))',
      '    print(agent(question="What modules make up an agent?").answer)',
      ''
    ].join('\n');
  }
  function exportJS(p) {
    return ['// Graph agent — JavaScript runtime (lab-engine.js + atlas-corpus.js)',
      '<script src="atlas-corpus.js"></script>',
      '<script src="lab-engine.js"></script>',
      '<script>',
      '  const G = LabEngine.graph(AtlasCorpus);',
      '  const agent = LabEngine.agent(G);',
      '  const params = ' + JSON.stringify(p || DEFAULTS) + ';',
      '  const run = agent.run("What modules make up an agent?", params);',
      '  console.log(run.steps);          // parse → seed → spread → reason → lift → answer → metric → compile',
      '  console.log(run.sub.map(i => G.nodes[i].name));',
      '  // Tune spreading weights against the trainset (BootstrapFewShot-style grid):',
      '  const compiled = agent.compile(); console.log(compiled.trainBefore, "→", compiled.trainAfter);',
      '</script>'].join('\n');
  }

  /* ---------- renderer ---------- */
  function Lab(host, G, opts) {
    opts = opts || {};
    var cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none';
    host.appendChild(cv);
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, U = opts.ui || 1;
    var css = getComputedStyle(document.documentElement);
    function v(n, f) { return (css.getPropertyValue(n) || '').trim() || f; }
    var COL = { text: v('--color-text', '#e9e9ed'), acc: v('--color-accent', '#9184d9'), a2: v('--color-accent-300', '#c3bbee'), n3: v('--color-neutral-300', '#b5b7c4'), n5: v('--color-neutral-500', '#757888'), n7: v('--color-neutral-700', '#3a3c4c'), bg: v('--color-bg', '#161826'), font: v('--font-body', 'Inter, sans-serif') };
    var n = G.nodes.length, nc = G.nc;
    var L = { force: G.layout.force, hyper: G.layout.force, simplicial: G.layout.force, hyperbolic: G.layout.hyperbolic };
    var T4 = tesseract4(G), hubP = G.nodes.slice(nc).map(function (d) { return [d.pos[0] * 2.3, d.pos[1] * 2.3 + 0.0, d.pos[2] * 2.3]; });
    var S = { form: 'force', prev: 'force', tw: 1, yaw: 0.6, pitch: 0.28, dist: 3.4, idle: 0, drag: null, hover: -1, sel: -1, eps: 0.26, rips: null, theta: 0, act: new Float32Array(n), actT: new Float32Array(n), sub: null, hubOn: -1, pulses: [], play: null, t: 0, hubA: 1, running: false };
    var proj = new Array(n), P3 = new Array(n);
    function formPos(f, i) {
      if (i >= nc) return hubP[i - nc];
      if (f === 'tesseract') return rot4(T4[i], S.theta, S.theta * 0.62);
      return L[f][i];
    }
    function setRips() { S.rips = rips(G.layout.force, nc, S.eps); if (opts.onStats) opts.onStats(stats()); }
    function stats() { var r = S.rips; return { form: S.form, V: nc, E: r.E.length, T: r.T.length, b0: r.b0, eps: S.eps, H: G.hyper.length }; }
    setRips();
    function resize() { var r = opts.size ? { width: opts.size[0], height: opts.size[1] } : host.getBoundingClientRect(); dpr = opts.size ? 1 : Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; }
    var ro = new ResizeObserver(resize); ro.observe(host); resize();
    function project(p) {
      var cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
      var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] * cp - z * sp; z = p[1] * sp + z * cp;
      var f = Math.min(W, H) * 1.05, zz = z + S.dist, s = f / zz;
      return [W / 2 + (S.ox || 0) + x * s, H / 2 + (S.oy || 0) - y * s, zz, s];
    }
    function hit(mx, my) { var b = -1, bd = 14; for (var i = 0; i < n; i++) { var p = proj[i]; if (!p) continue; var d = Math.hypot(p[0] - mx, p[1] - my); if (d < bd) { bd = d; b = i; } } return b; }
    function evPos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    if (!opts.manual) {
    cv.addEventListener('pointerdown', function (e) { var m = evPos(e); S.drag = { x: m[0], y: m[1], yaw: S.yaw, pitch: S.pitch, moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', function (e) {
      var m = evPos(e);
      if (S.drag) { var dx = m[0] - S.drag.x, dy = m[1] - S.drag.y; S.drag.moved = Math.max(S.drag.moved, Math.abs(dx) + Math.abs(dy)); S.yaw = S.drag.yaw + dx * 0.008; S.pitch = Math.max(-1.3, Math.min(1.3, S.drag.pitch + dy * 0.008)); S.idle = 0; return; }
      var h = hit(m[0], m[1]); if (h !== S.hover) { S.hover = h; cv.style.cursor = h >= 0 ? 'pointer' : 'grab'; }
    });
    cv.addEventListener('pointerup', function (e) { var m = evPos(e), d = S.drag; S.drag = null; cv.style.cursor = 'grab'; if (d && d.moved < 4) { var h = hit(m[0], m[1]); select(h); if (opts.onSelect) opts.onSelect(h); } });
    cv.addEventListener('pointerleave', function () { S.hover = -1; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); S.dist = Math.max(1.6, Math.min(7, S.dist * (1 + e.deltaY * 0.001))); S.idle = 0; }, { passive: false });
    }
    function select(i) { S.sel = i; }
    function setForm(f) { if (f === S.form) return; S.prev = S.form; S.form = f; S.tw = 0; if (opts.onStats) opts.onStats(stats()); }
    function setEps(e) { S.eps = e; setRips(); }
    function hull(pts) {
      if (pts.length < 3) return pts;
      pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
      var lo = [], up = [];
      pts.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      for (var i = pts.length - 1; i >= 0; i--) { var p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); var x = parseInt(h, 16); return 'rgba(' + (x >> 16 & 255) + ',' + (x >> 8 & 255) + ',' + (x & 255) + ',' + a.toFixed(3) + ')'; }
    function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

    /* playback of an agent run */
    var STEP = 1.1;
    function play(run, onStep) {
      S.play = { run: run, t0: S.t, step: -1, onStep: onStep, hop: -1 };
      for (var i = 0; i < n; i++) S.actT[i] = 0; S.sub = null; S.pulses = [];
    }
    function clearRun() { S.play = null; S.sub = null; S.hubOn = -1; for (var i = 0; i < n; i++) S.actT[i] = 0; S.pulses = []; }
    function pulse(a, b, d) { if (S.pulses.length < 220) S.pulses.push({ a: a, b: b, t0: S.t, d: d || 0.7 }); }
    function tickPlay() {
      var pl = S.play; if (!pl) return;
      var e = S.t - pl.t0, k = Math.floor(e / STEP), run = pl.run;
      if (k !== pl.step && k <= 8) {
        if (pl.step >= 0 && pl.step < 7) pulse(nc + pl.step, nc + pl.step + 1, 0.6);
        pl.step = k; S.hubOn = k < 8 ? nc + k : -1;
        if (k === 1) run.seeds.forEach(function (s) { S.actT[s] = 1; pulse(nc + 1, s, 0.6); });
        if (k === 3) { run.tool.ev.forEach(function (i) { pulse(nc + 3, i, 0.8); S.actT[i] = Math.max(S.actT[i], 0.7); }); if (opts.onTool) opts.onTool(run.form); }
        if (k === 4) { S.sub = run.sub; for (var i = 0; i < nc; i++) S.actT[i] = run.sub.indexOf(i) >= 0 ? Math.max(0.55, run.act[i]) : run.act[i] * 0.12; run.sub.forEach(function (s) { pulse(s, nc + 4, 0.7); }); }
        if (k === 5) run.sub.slice(0, 4).forEach(function (s) { pulse(s, nc + 5, 0.7); });
        if (k === 7) { pulse(nc + 7, nc + 0, 0.9); pulse(nc + 7, nc + 3, 0.9); pulse(nc + 7, nc + 5, 0.9); }
        if (pl.onStep) pl.onStep(k);
        if (k === 8) { S.hubOn = -1; }
      }
      if (k === 2) {
        var h = Math.min(run.hops.length - 1, Math.floor((e - 2 * STEP) / STEP * run.hops.length));
        if (h !== pl.hop) {
          var prev = run.hops[Math.max(0, h - 1)], cur = run.hops[h];
          for (var u = 0; u < nc; u++) { S.actT[u] = cur[u]; if (prev[u] > 0.3) G.adj[u].forEach(function (x) { if (x[0] < nc && cur[x[0]] > 0.15) pulse(u, x[0], 0.5); }); }
          pl.hop = h;
        }
      }
    }

    var last = performance.now(), raf;
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now; S.t += dt;
      raf = requestAnimationFrame(frame);
      S.idle += dt; if (!S.drag && S.idle > 2.5) S.yaw += dt * 0.06;
      S.tw = Math.min(1, S.tw + dt / 1.1);
      if (S.form === 'tesseract' || S.prev === 'tesseract') S.theta += dt * 0.32;
      tickPlay();
      for (var i = 0; i < n; i++) S.act[i] += (S.actT[i] - S.act[i]) * Math.min(1, dt * 5);
      var tw = smooth(S.tw);
      for (i = 0; i < n; i++) { var a = formPos(S.prev, i), b = formPos(S.form, i); P3[i] = [a[0] + (b[0] - a[0]) * tw, a[1] + (b[1] - a[1]) * tw, a[2] + (b[2] - a[2]) * tw]; proj[i] = project(P3[i]); }
      draw(tw);
    }
    function depthA(z) { return Math.max(0.25, Math.min(1, 1.6 - (z - S.dist) * 0.5)); }
    function draw(tw) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var running = !!S.play || !!S.running, f = S.form, fa = f === S.prev ? 1 : tw;
      // frames
      if (f === 'hyperbolic' || S.prev === 'hyperbolic') {
        var o = project([0, 0, 0]), al = f === 'hyperbolic' ? fa : 1 - tw;
        ctx.strokeStyle = rgba(COL.n5, 0.35 * al); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(o[0], o[1], o[3] * 1, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(COL.n5, 0.12 * al); [0.46, 0.76].forEach(function (r) { ctx.beginPath(); ctx.arc(o[0], o[1], o[3] * r, 0, TAU); ctx.stroke(); });
      }
      if (f === 'tesseract' || S.prev === 'tesseract') {
        var al2 = f === 'tesseract' ? fa : 1 - tw, V = []; for (var c = 0; c < 16; c++) V.push(project(rot4(vert4(c), S.theta, S.theta * 0.62)));
        ctx.lineWidth = 1; TESS_E.forEach(function (e) { ctx.strokeStyle = rgba(COL.acc, 0.22 * al2); ctx.beginPath(); ctx.moveTo(V[e[0]][0], V[e[0]][1]); ctx.lineTo(V[e[1]][0], V[e[1]][1]); ctx.stroke(); });
      }
      // hyperedges
      if (f === 'hyper' || S.prev === 'hyper') {
        var al3 = f === 'hyper' ? fa : 1 - tw;
        G.hyper.forEach(function (h) {
          var pts = h.m.map(function (i) { return proj[i]; }), hs = hull(pts), on = S.sub && h.m.some(function (i) { return S.sub.indexOf(i) >= 0; });
          var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
          ctx.beginPath(); hs.forEach(function (p, k) { var dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1, q = [p[0] + dx / l * 9, p[1] + dy / l * 9]; k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
          ctx.lineJoin = 'round'; ctx.fillStyle = rgba(COL.acc, (on ? 0.16 : 0.07) * al3); ctx.fill(); ctx.strokeStyle = rgba(COL.acc, (on ? 0.7 : 0.32) * al3); ctx.lineWidth = 1; ctx.stroke();
          pts.forEach(function (p) { ctx.strokeStyle = rgba(COL.acc, 0.18 * al3); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
          ctx.fillStyle = rgba(COL.a2, 0.85 * al3); ctx.font = '500 ' + (10.5 * U) + 'px ' + COL.font; ctx.textAlign = 'center'; ctx.fillText(h.name, cx, cy - 4);
        });
      }
      // simplices
      var simp = f === 'simplicial' || S.prev === 'simplicial', al4 = f === 'simplicial' ? fa : 1 - tw;
      if (simp && S.rips) {
        S.rips.T.forEach(function (t) { var a = proj[t[0]], b = proj[t[1]], c = proj[t[2]]; ctx.fillStyle = rgba(COL.acc, 0.07 * al4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); });
        ctx.lineWidth = 0.8; S.rips.E.forEach(function (e) { var a = proj[e[0]], b = proj[e[1]]; ctx.strokeStyle = rgba(COL.a2, 0.28 * al4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      }
      // edges
      var edgeA = simp ? 1 - al4 * 0.85 : 1;
      G.edges.forEach(function (e) {
        var a = proj[e.a], b = proj[e.b], hubE = e.a >= nc || e.b >= nc;
        var lit = Math.min(S.act[e.a], S.act[e.b]), inSub = S.sub && S.sub.indexOf(e.a) >= 0 && S.sub.indexOf(e.b) >= 0;
        var base = hubE ? (e.t === 'flow' ? 0.5 : e.t === 'upd' ? 0.28 : 0.14) : (e.t === 'isa' ? 0.16 : 0.1);
        if (running && !hubE) base *= 0.5;
        if (hubE) base *= S.hubA;
        var al = (base + lit * 0.7 + (inSub ? 0.3 : 0)) * edgeA * depthA((a[2] + b[2]) / 2);
        if (hubE && S.hubA < 0.02) return;
        ctx.strokeStyle = hubE || lit > 0.2 ? rgba(COL.acc, Math.min(1, al)) : rgba(COL.n3, al);
        ctx.lineWidth = hubE && e.t === 'flow' ? 1.4 : inSub ? 1.4 : 0.8;
        if (e.t === 'upd' || e.t === 'inst' || e.t === 'analog') ctx.setLineDash([3, 4]); else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      });
      ctx.setLineDash([]);
      // pulses
      S.pulses = S.pulses.filter(function (p) { var u = (S.t - p.t0) / p.d; if (u > 1) return false; var a = proj[p.a], b = proj[p.b]; u = smooth(u); var x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; var g = ctx.createRadialGradient(x, y, 0, x, y, 7 * U); g.addColorStop(0, rgba(COL.a2, 0.95)); g.addColorStop(1, rgba(COL.acc, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7 * U, 0, TAU); ctx.fill(); return true; });
      // nodes, far to near
      var ord = []; for (var i = 0; i < n; i++) ord.push(i); ord.sort(function (a, b) { return proj[b][2] - proj[a][2]; });
      var labels = [];
      ord.forEach(function (i) {
        var p = proj[i], d = G.nodes[i], a = S.act[i], da = depthA(p[2]), s = p[3] / 360;
        if (d.hub) {
          if (S.hubA < 0.02) return; ctx.globalAlpha = S.hubA;
          var on = S.hubOn === i, r = (5.5 + (on ? 3 : 0)) * Math.max(0.7, s);
          var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4); g.addColorStop(0, rgba(COL.acc, on ? 0.55 : 0.22)); g.addColorStop(1, rgba(COL.acc, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 4, 0, TAU); ctx.fill();
          ctx.fillStyle = COL.bg; ctx.strokeStyle = on ? COL.a2 : COL.acc; ctx.lineWidth = on ? 2 : 1.4; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = on ? COL.a2 : COL.acc; ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.38, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; if (S.hubA > 0.5) labels.push([i, 2 + (on ? 1 : 0)]); return;
        }
        var dim = running && S.sub && S.sub.indexOf(i) < 0 ? 0.35 : 1;
        var r2 = (1.8 + Math.sqrt(G.adj[i].length) * 0.55 + a * 3) * Math.max(0.6, s);
        if (a > 0.08) { var g2 = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r2 * 5); g2.addColorStop(0, rgba(COL.acc, 0.5 * a)); g2.addColorStop(1, rgba(COL.acc, 0)); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(p[0], p[1], r2 * 5, 0, TAU); ctx.fill(); }
        ctx.fillStyle = a > 0.15 ? rgba(COL.a2, Math.min(1, 0.5 + a)) : rgba(COL.n3, (0.35 + 0.55 * da) * dim);
        ctx.beginPath(); ctx.arc(p[0], p[1], r2, 0, TAU); ctx.fill();
        if (i === S.sel || i === S.hover) { ctx.strokeStyle = COL.a2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], r2 + 4, 0, TAU); ctx.stroke(); }
        if (i === S.sel || i === S.hover) labels.push([i, 4]); else if (S.sub && S.sub.indexOf(i) >= 0) labels.push([i, 1]); else if (a > 0.5) labels.push([i, 0]);
        else if (!running && G.adj[i].length >= 7 && da > 0.7 && f !== 'hyper') labels.push([i, -1]);
      });
      labels.sort(function (a, b) { return a[1] - b[1]; });
      var boxes = [];
      labels.forEach(function (L2) {
        var i = L2[0], p = proj[i], d = G.nodes[i], hub = d.hub, txt = hub ? d.name : d.name;
        ctx.font = (hub ? '500 ' + 11 * U : L2[1] >= 1 ? '500 ' + 11.5 * U : '400 ' + 10.5 * U) + 'px ' + COL.font; ctx.textAlign = 'left';
        var w = ctx.measureText(txt).width, x = p[0] + 9 * U, y = p[1] + 4 * U, bx = [x - 2, y - 11 * U, w + 4, 14 * U];
        if (L2[1] < 3 && boxes.some(function (b) { return bx[0] < b[0] + b[2] && bx[0] + bx[2] > b[0] && bx[1] < b[1] + b[3] && bx[1] + bx[3] > b[1]; })) return;
        boxes.push(bx);
        ctx.fillStyle = rgba(COL.bg, 0.72); ctx.fillRect(bx[0], bx[1], bx[2], bx[3]);
        ctx.fillStyle = hub ? (S.hubOn === i ? COL.a2 : COL.acc) : L2[1] >= 1 ? COL.text : rgba(COL.n3, L2[1] < 0 ? 0.7 : 0.95);
        ctx.fillText(txt, x, y);
      });
    }
    if (!opts.manual) raf = requestAnimationFrame(frame);
    return { setForm: setForm, setEps: setEps, play: play, clear: clearRun, select: select, stats: stats, canvas: cv,
      focus: function (i) { S.sel = i; },
      renderAt: function (st) {
        S.prev = st.from; S.form = st.to; S.tw = st.tw; S.yaw = st.yaw; S.pitch = st.pitch; S.dist = st.dist; S.theta = st.theta || 0;
        S.hubA = st.hubA == null ? 1 : st.hubA; S.ox = st.ox || 0; S.oy = st.oy || 0;
        if (st.eps != null) { var q = Math.round(st.eps * 100) / 100; if (q !== S.eps) { S.eps = q; S.rips = rips(G.layout.force, nc, q); } }
        for (var i = 0; i < n; i++) S.act[i] = st.act ? st.act[i] || 0 : 0;
        S.sub = st.sub || null; S.hubOn = st.hubOn == null ? -1 : st.hubOn; S.running = !!st.running; S.sel = st.sel == null ? -1 : st.sel; S.hover = -1;
        S.t = 0; S.pulses = (st.pulses || []).map(function (p) { return { a: p.a, b: p.b, t0: -p.u, d: 1 }; });
        var tw = smooth(S.tw);
        for (i = 0; i < n; i++) { var a = formPos(S.prev, i), b = formPos(S.form, i); P3[i] = [a[0] + (b[0] - a[0]) * tw, a[1] + (b[1] - a[1]) * tw, a[2] + (b[2] - a[2]) * tw]; proj[i] = project(P3[i]); }
        draw(tw);
      }, destroy: function () { cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); } };
  }

  function graph(C) { var G = build(C); G.layout = { force: forceLayout(G), hyperbolic: hyperbolicLayout(G) }; return G; }
  window.LabEngine = { util: { rot4: rot4, tesseract4: tesseract4, vert4: vert4, TESS_E: TESS_E, rips: rips, rng: rng }, FORMS: FORMS, graph: graph, agent: Agent, lab: Lab, exportPython: exportPython, exportJS: exportJS, defaults: DEFAULTS };
})();
