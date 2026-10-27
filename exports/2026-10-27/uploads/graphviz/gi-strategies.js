/* gi-strategies.js — the agent's retrieval code, as five swappable, readable
   implementations. Each takes (core, seeds, p, mask) and returns scores over
   the graph: { act: Float32Array(core.nc) } or { hops: [...] } for animation.
   The tester benchmarks them against held-out dev recall and may hot-swap the
   winner — or ship a Claude-written sixth. This file IS the code examples.

   Context API available to every strategy:
     core.nc                number of concept nodes
     core.N[i]              { name, def, comm, parent, year }
     core.adj()             adjacency: [[neighbourIndex, edgeIndex], ...]
     core.E[edgeIndex].w    live (plastic) edge weight
     core.E[edgeIndex].t    edge type: isa | uses | analog | pred | llm
     core._typew[type]      the type's base conductance
     core.G.inHyper[i]      hyperedge ids node i belongs to
     core.G.hyper[k].m      member node indices of hyperedge k
     core._spread(s,p,mask) the built-in spreading-activation pass (Graphify)
     core._embed()          cached tf-idf vectors + cosine (Semantica)              */
(function () {
  'use strict';

  // ── Graphify — typed spreading activation over plastic edges + hyperedges ──
  function graphify(core, seeds, p, mask) {
    return { hops: core._spread(seeds, p, mask) };          // the default agent code
  }

  // ── Semantica — dense semantic match: cosine to the seed centroid in tf-idf space ──
  function semantica(core, seeds, p) {
    var em = core._embed(), c = em.centroid(seeds), act = new Float32Array(core.nc);
    for (var i = 0; i < core.nc; i++) act[i] = em.cosTo(c, i);
    return { act: act };
  }

  // ── PageRanker — personalized PageRank restarting at the seeds ──
  function pageRanker(core, seeds, p) {
    var nc = core.nc, adj = core.adj(), E = core.E, tp = new Float32Array(nc), a = new Float32Array(nc);
    seeds.forEach(function (s) { tp[s] = 1 / seeds.length; a[s] = tp[s]; });
    for (var it = 0; it < 24; it++) {
      var nx = new Float32Array(nc);
      for (var u = 0; u < nc; u++) {
        if (a[u] < 1e-6) continue;
        var deg = adj[u].length || 1;
        adj[u].forEach(function (x) { nx[x[0]] += 0.85 * a[u] * E[x[1]].w / deg; });
      }
      for (var k = 0; k < nc; k++) nx[k] += 0.15 * tp[k];
      a = nx;
    }
    return { act: a };
  }

  // ── HyperLeap — hyperedge-first: a seed pulls in its whole group, then one hop ──
  function hyperLeap(core, seeds, p, mask) {
    var nc = core.nc, G = core.G, adj = core.adj(), E = core.E, act = new Float32Array(nc);
    seeds.forEach(function (s) {
      act[s] = 1;
      G.inHyper[s].forEach(function (k) {
        if (k === mask) return;                             // honour the hidden hyperedge
        var m = G.hyper[k].m, w = 0.95 - 0.02 * m.length;
        m.forEach(function (v) { if (act[v] < w) act[v] = w; });
      });
      adj[s].forEach(function (x) { var w = 0.45 * E[x[1]].w; if (act[x[0]] < w) act[x[0]] = w; });
    });
    return { act: act };
  }

  // ── PathWeaver — multi-source BFS frontier, nearer and better-connected ranks higher ──
  function pathWeaver(core, seeds, p) {
    var nc = core.nc, adj = core.adj(), dist = new Int32Array(nc).fill(-1), q = [];
    seeds.forEach(function (s) { dist[s] = 0; q.push(s); });
    while (q.length) { var u = q.shift(); adj[u].forEach(function (x) { if (dist[x[0]] < 0) { dist[x[0]] = dist[u] + 1; q.push(x[0]); } }); }
    var act = new Float32Array(nc);
    for (var i = 0; i < nc; i++) act[i] = dist[i] < 0 ? 0 : (1 / (1 + dist[i])) * (1 + Math.min(adj[i].length, 8) / 16);
    return { act: act };
  }

  var LIST = [
    { id: 'graphify', name: 'Graphify', tagline: 'Typed spreading activation over plastic edges + hyperedges', fn: graphify },
    { id: 'semantica', name: 'Semantica', tagline: 'Dense cosine match to the seed centroid in tf-idf space', fn: semantica },
    { id: 'pageranker', name: 'PageRanker', tagline: 'Personalized PageRank restarting at the seeds', fn: pageRanker },
    { id: 'hyperleap', name: 'HyperLeap', tagline: 'Hyperedge-first — a seed pulls in its whole group', fn: hyperLeap },
    { id: 'pathweaver', name: 'PathWeaver', tagline: 'Multi-source BFS frontier by distance × connectivity', fn: pathWeaver }
  ];
  LIST.forEach(function (s) { s.source = s.fn.toString(); s.by = 'built-in'; });

  // tf-idf embedding used by Semantica — attached lazily, cached per core
  var CACHE = new WeakMap();
  function embed(core) {
    if (CACHE.has(core)) return CACHE.get(core);
    var STOP = 'a an the of to in on and or is are be by how what which why does do can with for from its it that this as at into more than two between shown get difference made make up change'.split(' ').reduce(function (o, w) { o[w] = 1; return o; }, {});
    function toks(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
    var nc = core.nc, docs = [], df = {};
    for (var i = 0; i < nc; i++) { var tf = {}; toks(core.N[i].name + ' ' + core.N[i].def).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; }); docs[i] = tf; Object.keys(tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); }
    var vecs = docs.map(function (tf) { var v = {}, n = 0; Object.keys(tf).forEach(function (w) { var x = (1 + Math.log(tf[w])) * Math.log(nc / df[w]); v[w] = x; n += x * x; }); n = Math.sqrt(n) || 1; Object.keys(v).forEach(function (w) { v[w] /= n; }); return v; });
    function dot(a, b) { var s = 0, ks = Object.keys(a.length < b.length ? a : b); for (var w in a) if (b[w]) s += a[w] * b[w]; return s; }
    var E = {
      centroid: function (seeds) { var c = {}; seeds.forEach(function (s) { var v = vecs[s]; for (var w in v) c[w] = (c[w] || 0) + v[w] / seeds.length; }); var n = 0; for (var w in c) n += c[w] * c[w]; n = Math.sqrt(n) || 1; for (var w2 in c) c[w2] /= n; return c; },
      cosTo: function (c, i) { return dot(c, vecs[i]); }
    };
    CACHE.set(core, E); return E;
  }

  window.GI_STRATEGIES = { list: LIST, embed: embed };
})();
