/* graph-engine.js — world, choreography and canvas renderer shared by
   "Graph Atlas.dc.html" (the film) and "Graph Viewer.dc.html" (the viewer).
   Every visible quantity is a pure function of authored time T. */
(function () {
  'use strict';

  var SECTIONS = ['Shell', 'Breach', 'Embedding', 'Force', 'Hypergraph', 'Simplicial', 'Multiplex', 'Tesseract', 'Temporal', 'Hyperbolic', 'Connectome', 'Query', 'Coda'];
  var DURS = [10, 10, 12, 12, 14, 12, 12, 14, 12, 12, 14, 24, 10];

  var TITLES = {
    Shell: { n: '01', label: 'Graph about data', cap: 'Nodes pinned to a surface and read from the outside.' },
    Breach: { n: '02', label: 'Data is the graph', cap: 'Past the surface, the points fall inward and become the volume.' },
    Embedding: { n: '03', label: 'Embedding → kNN graph', cap: 'Each point links to its nearest neighbours, so geometry becomes topology.' },
    Force: { n: '04', label: '3D force-directed', cap: 'Springs pull related nodes together while repulsion holds clusters apart.' },
    Hypergraph: { n: '05', label: 'Hypergraph', cap: 'One edge, many nodes: relations that only exist as a group.' },
    Simplicial: { n: '06', label: 'Simplicial complex', cap: 'As the radius grows, edges close into triangles, then tetrahedra.' },
    Multiplex: { n: '07', label: 'Multiplex', cap: 'The same nodes on every layer, with a different relation on each.' },
    Tesseract: { n: '08', label: '4D · w-axis rotation', cap: 'Every node carries a fourth coordinate, rotated through w and projected.' },
    Temporal: { n: '09', label: '4D · time', cap: 'Rewind to the first seeds, then replay: nodes are born, edges form, rewire and decay.' },
    Hyperbolic: { n: '10', label: 'Hyperbolic ball', cap: 'Room grows exponentially toward the edge, so deep hierarchies fit.' },
    Connectome: { n: '11', label: 'Connectome', cap: 'Points as neurons, edges as axons. Structure and activity are one object.' },
    Query: { n: '12', label: 'GraphRAG', cap: 'The agent is the graph. A query enters as activation; the answer is read from what lights up.' },
    Coda: { n: '··', label: 'Coda', cap: 'The subgraph settles back into the volume and the camera pulls away.' }
  };

  // Query beat, seconds after the Query cue.
  var QT = { bar0: 0.8, bar1: 1.4, type0: 1.4, type1: 4.4, chips0: 4.8, chips1: 5.5, beam0: 5.5, beam1: 6.5, spread: 6.6, hop: 0.9, dim0: 6.8, dim1: 8.4, titleOut: 5.0, up0: 10.2, up1: 11.4, lift0: 11.2, lift1: 13.4, lab0: 12.8, card0: 14.6, card1: 15.2, line0: 15.0, lineGap: 1.6, lineDur: 1.2 };

  var QUERY = {
    text: 'Which change broke checkout on Tuesday?',
    chips: ['checkout', 'Tuesday'],
    slots: [
      { name: 'checkout-service', kind: 'entity', col: 0, y: 0.18 },
      { name: 'Tue 14:02 deploy', kind: 'event', col: 0, y: -0.2 },
      { name: '502 spike 14:03', kind: 'observation', col: 1, y: 0.29 },
      { name: 'payments runbook', kind: 'document', col: 1, y: 0.09 },
      { name: 'PR 2231', kind: 'change', col: 1, y: -0.11 },
      { name: 'git log', kind: 'tool', col: 1, y: -0.31 },
      { name: 'metrics.query', kind: 'tool', col: 2, y: 0.29 },
      { name: 'Dana', kind: 'person · on-call', col: 2, y: 0.09 },
      { name: 'retry_v2 = on', kind: 'flag', col: 2, y: -0.11 },
      { name: 'rollback 14:40', kind: 'memory', col: 2, y: -0.31 }
    ],
    links: [[0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [3, 7], [4, 8], [5, 9]],
    answer: [
      { text: 'PR 2231 turned retry_v2 on', cites: [4, 8] },
      { text: 'in the Tue 14:02 deploy.', cites: [1] },
      { text: 'Checkout 502s began at 14:03', cites: [0, 2] },
      { text: 'and ended with the 14:40 rollback.', cites: [9] }
    ]
  };
  var HYPER = { name: 'plan step · rollback', kind: 'hyperedge', members: [
    { name: 'error rate < 1%', kind: 'goal' }, { name: 'deploy.revert', kind: 'tool' },
    { name: 'incident 0412', kind: 'memory' }, { name: 'Dana', kind: 'person' }] };
  var LAYERS = [{ name: 'invokes', kind: 'layer 1' }, { name: 'recalls', kind: 'layer 2' }, { name: 'depends on', kind: 'layer 3' }];
  var LY = [0.7, 0, -0.7], COLX = [-0.9, -0.52, -0.14], LIFT_D = 1.3;

  // ── math ────────────────────────────────────────────────────────────────
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // The only three easing curves in the piece.
  var M = {
    enter: function (t) { t = clamp01(t); var u = 1 - t; return 1 - u * u * u; },
    draw: function (t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2; },
    pop: function (t) { t = clamp01(t); var u = t - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; }
  };
  function ramp(T, a, b) { return M.draw((T - a) / (b - a)); }
  function env(T, a, b, c, d) { return Math.min(ramp(T, a, b), 1 - ramp(T, c, d)); }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
  function hsh(i, s) { var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  function d3(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function dP(P, i, j) { var x = P[i * 3] - P[j * 3], y = P[i * 3 + 1] - P[j * 3 + 1], z = P[i * 3 + 2] - P[j * 3 + 2]; return Math.sqrt(x * x + y * y + z * z); }
  function fog(z, ref) { var f = 1.3 - 0.3 * z / ref; return f < 0.25 ? 0.25 : f > 1 ? 1 : f; }
  function randRot(r) {
    var u1 = r(), u2 = r() * 6.2832, u3 = r() * 6.2832, s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
    var x = s1 * Math.sin(u2), y = s1 * Math.cos(u2), z = s2 * Math.sin(u3), w = s2 * Math.cos(u3);
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  function normalize(P, N, target) {
    var cx = 0, cy = 0, cz = 0, i;
    for (i = 0; i < N; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= N; cy /= N; cz /= N;
    var rr = new Float32Array(N);
    for (i = 0; i < N; i++) { P[i * 3] -= cx; P[i * 3 + 1] -= cy; P[i * 3 + 2] -= cz; rr[i] = Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
    rr.sort();
    var k = target / (rr[Math.floor(N * 0.95)] || 1);
    for (i = 0; i < N * 3; i++) P[i] *= k;
  }
  function centroids(P, N, C, comm, skip) {
    var c = [], k, i;
    for (k = 0; k < C; k++) c.push([0, 0, 0, 0]);
    for (i = 0; i < N; i++) { if (skip && skip[i]) continue; var q = c[comm[i]]; q[0] += P[i * 3]; q[1] += P[i * 3 + 1]; q[2] += P[i * 3 + 2]; q[3]++; }
    for (k = 0; k < C; k++) { var n = c[k][3] || 1; c[k] = [c[k][0] / n, c[k][1] / n, c[k][2] / n]; }
    return c;
  }
  function nodeNear(P, N, t, ok) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < N; i++) { if (ok && !ok(i)) continue; var dx = P[i * 3] - t[0], dy = P[i * 3 + 1] - t[1], dz = P[i * 3 + 2] - t[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
    return best < 0 ? 0 : best;
  }
  function mob(ux, uy, uz, vx, vy, vz, o) { // Möbius addition u ⊕ v in the Poincaré ball
    var uv = ux * vx + uy * vy + uz * vz, uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz;
    var A = 1 + 2 * uv + vv, B = 1 - uu, D = 1 + 2 * uv + uu * vv || 1e-9;
    o[0] = (A * ux + B * vx) / D; o[1] = (A * uy + B * vy) / D; o[2] = (A * uz + B * vz) / D;
  }

  // ── tokens & palette ────────────────────────────────────────────────────
  var STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  var _tok = null, _pal = null;
  function tokens() {
    if (_tok) return _tok;
    if (typeof document === 'undefined') return null;
    var cs = getComputedStyle(document.documentElement), g = function (n) { return cs.getPropertyValue(n).trim(); };
    var t = { bg: g('--color-bg'), surface: g('--color-surface'), text: g('--color-text'), accent: g('--color-accent'), divider: g('--color-divider'), section: g('--color-section'), sectionGlow: g('--color-section-glow'), shadowMd: g('--shadow-md'), shadowSm: g('--shadow-sm'), radiusSm: parseFloat(g('--radius-sm')) || 4, radiusMd: parseFloat(g('--radius-md')) || 8, radiusLg: parseFloat(g('--radius-lg')) || 14, a: {}, n: {} };
    for (var i = 0; i < STEPS.length; i++) { t.a[STEPS[i]] = g('--color-accent-' + STEPS[i]); t.n[STEPS[i]] = g('--color-neutral-' + STEPS[i]); }
    if (!t.bg || !t.a[500] || !t.n[500] || !t.surface) return null;
    _tok = t; return t;
  }
  function rgbOf(c) { var h = String(c).trim().replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var v = parseInt(h.slice(0, 6), 16) || 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgba(c, a) { var r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function rgbS(c) { return 'rgb(' + rgbOf(c).join(',') + ')'; }
  function mixRgb(a, b, t) { return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]; }
  function sprite(rgb, soft) {
    var S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2), k = rgb.join(',');
    var st = soft ? [[0, 0.5], [0.6, 0.4], [0.85, 0.12], [1, 0]] : [[0, 1], [0.08, 0.92], [0.18, 0.36], [0.42, 0.085], [1, 0]];
    for (var i = 0; i < st.length; i++) g.addColorStop(st[i][0], 'rgba(' + k + ',' + st[i][1] + ')');
    x.fillStyle = g; x.fillRect(0, 0, S, S); return c;
  }
  function palette() {
    if (_pal) return _pal;
    var t = tokens(); if (!t) return null;
    var n3 = rgbOf(t.n[300]), a3 = rgbOf(t.a[300]), a5 = rgbOf(t.a[500]), tints = [], softs = [];
    for (var i = 0; i < 5; i++) { var u = i / 4, c = u < 0.5 ? mixRgb(n3, a3, u * 2) : mixRgb(a3, a5, (u - 0.5) * 2); tints.push(sprite(c)); softs.push(sprite(c, true)); }
    _pal = {
      t: t, tints: tints, softs: softs, hot: sprite(rgbOf(t.a[100])), halo: sprite(rgbOf(t.a[400]), true), ball: sprite(rgbOf(t.a[600]), true),
      bg: t.bg, edge: rgbS(t.n[500]), edgeHot: rgbS(t.a[300]), arc: rgbS(t.a[400]), line: rgbS(t.a[400]), ring: rgbS(t.n[500]),
      hullFill: rgbS(t.a[700]), hullLine: rgbS(t.a[400]), triFill: rgbS(t.a[700]), tetFill: rgbS(t.a[600]), dust: rgbS(t.n[400]),
      planeFill: rgba(t.n[800], 1), planeLine: rgbS(t.n[600]), hotLine: rgbS(t.a[200])
    };
    return _pal;
  }

  // ── world ───────────────────────────────────────────────────────────────
  function forceLayout(N, C, comm, emb, eA, eB, eLong, r) {
    var P = new Float32Array(N * 3), D = new Float32Array(N * 3), i, c, e, E = eA.length;
    for (i = 0; i < N * 3; i++) P[i] = emb[i] * 1.3 + gauss(r) * 0.05;
    var snaps = [P.slice()], marks = { 3: 1, 7: 1, 12: 1, 20: 1, 32: 1, 48: 1, 66: 1, 90: 1 };
    var kk = 0.06, k2 = kk * kk, iters = 90, cx = new Float32Array(C * 3), cn = new Float32Array(C), cm = [];
    for (c = 0; c < C; c++) cm.push([]);
    for (i = 0; i < N; i++) cm[comm[i]].push(i);
    for (var it = 1; it <= iters; it++) {
      D.fill(0); cx.fill(0); cn.fill(0);
      for (i = 0; i < N; i++) { c = comm[i]; cx[c * 3] += P[i * 3]; cx[c * 3 + 1] += P[i * 3 + 1]; cx[c * 3 + 2] += P[i * 3 + 2]; cn[c]++; }
      for (c = 0; c < C; c++) if (cn[c]) { cx[c * 3] /= cn[c]; cx[c * 3 + 1] /= cn[c]; cx[c * 3 + 2] /= cn[c]; }
      for (c = 0; c < C; c++) {
        var m = cm[c], L = m.length;
        for (var u = 0; u < L; u++) {
          var a = m[u], ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], fx = 0, fy = 0, fz = 0;
          for (var v = u + 1; v < L; v++) {
            var b = m[v], dx = ax - P[b * 3], dy = ay - P[b * 3 + 1], dz = az - P[b * 3 + 2];
            var f = 0.6 * k2 / (dx * dx + dy * dy + dz * dz + 1e-4);
            fx += dx * f; fy += dy * f; fz += dz * f;
            D[b * 3] -= dx * f; D[b * 3 + 1] -= dy * f; D[b * 3 + 2] -= dz * f;
          }
          D[a * 3] += fx; D[a * 3 + 1] += fy; D[a * 3 + 2] += fz;
        }
      }
      for (i = 0; i < N; i++) {
        var ci = comm[i], px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2], gx = 0, gy = 0, gz = 0;
        for (c = 0; c < C; c++) {
          if (c === ci || !cn[c]) continue;
          var ex = px - cx[c * 3], ey = py - cx[c * 3 + 1], ez = pz - cx[c * 3 + 2];
          var g = 1.1 * cn[c] * k2 / (ex * ex + ey * ey + ez * ez + 0.02);
          gx += ex * g; gy += ey * g; gz += ez * g;
        }
        D[i * 3] += gx; D[i * 3 + 1] += gy; D[i * 3 + 2] += gz;
      }
      for (e = 0; e < E; e++) {
        var ea = eA[e], eb = eB[e], qx = P[eb * 3] - P[ea * 3], qy = P[eb * 3 + 1] - P[ea * 3 + 1], qz = P[eb * 3 + 2] - P[ea * 3 + 2];
        var fa = Math.sqrt(qx * qx + qy * qy + qz * qz) / kk * (eLong[e] ? 0.2 : 1);
        D[ea * 3] += qx * fa; D[ea * 3 + 1] += qy * fa; D[ea * 3 + 2] += qz * fa;
        D[eb * 3] -= qx * fa; D[eb * 3 + 1] -= qy * fa; D[eb * 3 + 2] -= qz * fa;
      }
      var temp = 0.045 * (1 - it / iters) + 0.0015;
      for (i = 0; i < N; i++) {
        var Dx = D[i * 3] - P[i * 3] * 0.7, Dy = D[i * 3 + 1] - P[i * 3 + 1] * 0.7, Dz = D[i * 3 + 2] - P[i * 3 + 2] * 0.7;
        var Dl = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz) + 1e-9, s = Math.min(Dl, temp) / Dl;
        P[i * 3] += Dx * s; P[i * 3 + 1] += Dy * s; P[i * 3 + 2] += Dz * s;
      }
      if (marks[it]) snaps.push(P.slice());
    }
    for (var j = 0; j < snaps.length; j++) normalize(snaps[j], N, lerp(1.0, 0.92, j / (snaps.length - 1)));
    return snaps;
  }

  function build(opts) {
    opts = opts || {};
    var N = Math.max(400, (opts.n | 0) || 1400), C = 16, r = rng(opts.seed || 1019);
    var W = { N: N, C: C }, i, j, k, a, b, q, t, x, y, z, l, tries;

    // 1 · communities in embedding space
    var cen = [];
    tries = 0;
    while (cen.length < C && tries++ < 20000) {
      var p = [(r() * 2 - 1) * 0.66, (r() * 2 - 1) * 0.52, (r() * 2 - 1) * 0.66];
      if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > 0.44) continue;
      var ok = true;
      for (j = 0; j < cen.length; j++) if (d3(p, cen[j]) < 0.3) { ok = false; break; }
      if (ok) cen.push(p);
    }
    while (cen.length < C) cen.push([(r() * 2 - 1) * 0.5, (r() * 2 - 1) * 0.4, (r() * 2 - 1) * 0.5]);
    var near = [];
    for (k = 0; k < C; k++) {
      var lst = [];
      for (j = 0; j < C; j++) if (j !== k) lst.push([j, d3(cen[k], cen[j])]);
      lst.sort(function (u, v) { return u[1] - v[1]; });
      near.push(lst.map(function (u) { return u[0]; }));
    }
    var nB = Math.round(N * 0.08), nC = N - nB, wts = [], ws = 0, cnt = [], tot = 0;
    for (k = 0; k < C; k++) { wts.push(0.55 + r()); ws += wts[k]; }
    for (k = 0; k < C; k++) { cnt.push(Math.floor(nC * wts[k] / ws)); tot += cnt[k]; }
    for (k = 0; tot < nC; k = (k + 1) % C) { cnt[k]++; tot++; }
    var comm = new Uint8Array(N), bridge = new Uint8Array(N), emb = new Float32Array(N * 3), n = 0;
    for (k = 0; k < C; k++) {
      var R = randRot(r), sg = 0.05 + 0.045 * r(), S0 = sg * 1.9, S1 = sg, S2 = sg * 0.75;
      for (j = 0; j < cnt[k]; j++) {
        var tail = r() < 0.06 ? 2.2 : 1, g0 = gauss(r) * S0 * tail, g1 = gauss(r) * S1 * tail, g2 = gauss(r) * S2 * tail;
        emb[n * 3] = cen[k][0] + R[0] * g0 + R[1] * g1 + R[2] * g2;
        emb[n * 3 + 1] = cen[k][1] + R[3] * g0 + R[4] * g1 + R[5] * g2;
        emb[n * 3 + 2] = cen[k][2] + R[6] * g0 + R[7] * g1 + R[8] * g2;
        comm[n++] = k;
      }
    }
    for (j = 0; j < nB; j++) {
      a = Math.floor(r() * C); b = near[a][Math.floor(r() * 3)]; t = 0.15 + 0.7 * r();
      for (q = 0; q < 3; q++) emb[n * 3 + q] = lerp(cen[a][q], cen[b][q], t) + gauss(r) * 0.016 + (q === 1 ? 0.06 * Math.sin(t * Math.PI) : 0);
      comm[n] = t < 0.5 ? a : b; bridge[n++] = 1;
    }
    normalize(emb, N, 0.78);
    var cenE = centroids(emb, N, C, comm, bridge);

    // 2 · kNN graph + weak long ties
    var K = 3, nnI = new Int32Array(N * K), nnD = new Float32Array(N * K);
    for (i = 0; i < N; i++) {
      var o = i * K;
      for (k = 0; k < K; k++) { nnD[o + k] = 1e9; nnI[o + k] = -1; }
      var xi = emb[i * 3], yi = emb[i * 3 + 1], zi = emb[i * 3 + 2];
      for (j = 0; j < N; j++) {
        if (j === i) continue;
        x = emb[j * 3] - xi; y = emb[j * 3 + 1] - yi; z = emb[j * 3 + 2] - zi;
        var dd = x * x + y * y + z * z;
        if (dd < nnD[o + K - 1]) {
          k = K - 1;
          while (k > 0 && nnD[o + k - 1] > dd) { nnD[o + k] = nnD[o + k - 1]; nnI[o + k] = nnI[o + k - 1]; k--; }
          nnD[o + k] = dd; nnI[o + k] = j;
        }
      }
    }
    var eSet = new Set(), EA = [], EB = [], EL = [];
    var addE = function (u, v, lng) {
      if (u === v || u < 0 || v < 0) return false;
      var lo = u < v ? u : v, hi = u < v ? v : u, key = lo * N + hi;
      if (eSet.has(key)) return false;
      eSet.add(key); EA.push(lo); EB.push(hi); EL.push(lng ? 1 : 0); return true;
    };
    for (i = 0; i < N; i++) for (k = 0; k < K; k++) addE(i, nnI[i * K + k], 0);
    var mem = [];
    for (k = 0; k < C; k++) mem.push([]);
    for (i = 0; i < N; i++) if (!bridge[i]) mem[comm[i]].push(i);
    var nLong = Math.round(N * 0.08);
    for (j = 0, tries = 0; j < nLong && tries < 20000; tries++) {
      a = Math.floor(r() * C); b = near[a][Math.floor(r() * 4)];
      if (!mem[a].length || !mem[b].length) continue;
      if (addE(mem[a][Math.floor(r() * mem[a].length)], mem[b][Math.floor(r() * mem[b].length)], 1)) j++;
    }
    var E = EA.length, eA = Int32Array.from(EA), eB = Int32Array.from(EB), eLong = Uint8Array.from(EL);
    var deg = new Uint16Array(N), maxDeg = 1;
    for (j = 0; j < E; j++) { deg[eA[j]]++; deg[eB[j]]++; }
    for (i = 0; i < N; i++) if (deg[i] > maxDeg) maxDeg = deg[i];
    var aS = new Int32Array(N + 1), aN = new Int32Array(E * 2), aE = new Int32Array(E * 2);
    for (j = 0; j < E; j++) { aS[eA[j] + 1]++; aS[eB[j] + 1]++; }
    for (i = 0; i < N; i++) aS[i + 1] += aS[i];
    var fp = aS.slice(0, N);
    for (j = 0; j < E; j++) { a = eA[j]; b = eB[j]; aN[fp[a]] = b; aE[fp[a]++] = j; aN[fp[b]] = a; aE[fp[b]++] = j; }
    var rnd = new Float32Array(N), ph = new Float32Array(N), rnd2 = new Float32Array(E);
    for (i = 0; i < N; i++) { rnd[i] = r(); ph[i] = r() * 6.2832; }
    for (j = 0; j < E; j++) rnd2[j] = r();

    // 3 · shell: every node pinned to the sphere it will fall from
    var shell = new Float32Array(N * 3);
    for (i = 0; i < N; i++) {
      x = emb[i * 3] + gauss(r) * 0.05; y = emb[i * 3 + 1] + gauss(r) * 0.05; z = emb[i * 3 + 2] + gauss(r) * 0.05;
      l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      var ux = gauss(r), uy = gauss(r), uz = gauss(r), ul = Math.hypot(ux, uy, uz) || 1;
      x += ux / ul * 0.62; y += uy / ul * 0.62; z += uz / ul * 0.62;
      l = Math.hypot(x, y, z) || 1;
      shell[i * 3] = x / l; shell[i * 3 + 1] = y / l; shell[i * 3 + 2] = z / l;
    }
    var nArc = 300, arcA = new Int32Array(nArc), arcB = new Int32Array(nArc);
    for (j = 0; j < nArc; j++) {
      a = Math.floor(r() * N); var mm = mem[comm[a]];
      do { b = r() < 0.55 && mm.length > 1 ? mm[Math.floor(r() * mm.length)] : Math.floor(r() * N); } while (b === a);
      arcA[j] = a; arcB[j] = b;
    }

    // 4 · force-directed relaxation (snapshots of a real run)
    var snaps = forceLayout(N, C, comm, emb, eA, eB, eLong, r), fin = snaps[snaps.length - 1];

    // 5 · hyperedges
    var nearestK = function (c0, m, P) {
      var bi = [], bd = [];
      for (var q2 = 0; q2 < N; q2++) {
        var dx = P[q2 * 3] - P[c0 * 3], dy = P[q2 * 3 + 1] - P[c0 * 3 + 1], dz = P[q2 * 3 + 2] - P[c0 * 3 + 2], d2 = dx * dx + dy * dy + dz * dz;
        if (bd.length < m || d2 < bd[bd.length - 1]) {
          var pos = bd.length;
          while (pos > 0 && bd[pos - 1] > d2) pos--;
          bd.splice(pos, 0, d2); bi.splice(pos, 0, q2);
          if (bd.length > m) { bd.pop(); bi.pop(); }
        }
      }
      return bi;
    };
    var hyp = [], hc = nodeNear(fin, N, [0.16, 0.1, -0.5], function (q2) { return !bridge[q2]; }), ring = [], hm = [hc];
    for (q = 0; q < N; q++) { var dq = dP(fin, q, hc); if (dq > 0.12 && dq < 0.28 && !bridge[q]) ring.push(q); }
    while (hm.length < 4 && ring.length) {
      var best = -1, bestD = -1;
      for (q = 0; q < ring.length; q++) { var md = 1e9; for (j = 0; j < hm.length; j++) md = Math.min(md, dP(fin, ring[q], hm[j])); if (md > bestD) { bestD = md; best = q; } }
      hm.push(ring[best]); ring.splice(best, 1);
    }
    hyp.push({ m: hm, kind: 2, order: 0 });
    for (q = 0; q < 52; q++) hyp.push({ m: nearestK(Math.floor(r() * N), 3 + Math.floor(Math.pow(r(), 1.4) * 6), fin), kind: 0 });
    for (q = 0; q < 6; q++) {
      a = Math.floor(r() * C);
      var trio = [a, near[a][0], near[a][1 + Math.floor(r() * 2)]], ms = [];
      for (var ci2 = 0; ci2 < 3; ci2++) { var pool = mem[trio[ci2]]; for (var z2 = 0; z2 < (ci2 === 2 ? 2 : 3); z2++) ms.push(pool[Math.floor(r() * pool.length)]); }
      hyp.push({ m: ms, kind: 1, order: q / 5 });
    }
    var regs = [];
    hyp.forEach(function (H) {
      var cx = 0, cy = 0, cz = 0;
      H.m.forEach(function (v) { cx += fin[v * 3]; cy += fin[v * 3 + 1]; cz += fin[v * 3 + 2]; });
      H.cen = [cx / H.m.length, cy / H.m.length, cz / H.m.length]; H.az = Math.atan2(H.cen[2], H.cen[0]);
      H.m = Int32Array.from(H.m);
      if (H.kind === 0) regs.push(H);
    });
    regs.sort(function (u, v) { return u.az - v.az; });
    regs.forEach(function (H, ix) { H.order = ix / Math.max(1, regs.length - 1); });

    // 6 · simplicial complex from the kNN graph
    var adj = [], eLen = new Float32Array(E);
    for (i = 0; i < N; i++) adj.push(new Set());
    for (j = 0; j < E; j++) { eLen[j] = dP(fin, eA[j], eB[j]); if (!eLong[j]) { adj[eA[j]].add(eB[j]); adj[eB[j]].add(eA[j]); } }
    var tris = [], tets = [];
    for (j = 0; j < E; j++) {
      if (eLong[j]) continue;
      a = eA[j]; b = eB[j];
      adj[a].forEach(function (c2) { if (c2 > b && adj[b].has(c2)) tris.push(a, b, c2); });
    }
    if (tris.length / 3 > 1800) { var keepT = []; for (q = 0; q < tris.length; q += 3) if (r() < 1800 / (tris.length / 3)) keepT.push(tris[q], tris[q + 1], tris[q + 2]); tris = keepT; }
    for (q = 0; q < tris.length; q += 3) {
      var t0 = tris[q], t1 = tris[q + 1], t2 = tris[q + 2];
      adj[t0].forEach(function (d) { if (d > t2 && adj[t1].has(d) && adj[t2].has(d)) tets.push(t0, t1, t2, d); });
    }
    if (tets.length / 4 > 500) tets = tets.slice(0, 2000);
    var triE = new Float32Array(tris.length / 3), tetE = new Float32Array(tets.length / 4);
    for (q = 0; q < triE.length; q++) { var A0 = tris[q * 3], A1 = tris[q * 3 + 1], A2 = tris[q * 3 + 2]; triE[q] = Math.max(dP(fin, A0, A1), dP(fin, A1, A2), dP(fin, A0, A2)); }
    for (q = 0; q < tetE.length; q++) { var V0 = tets[q * 4], V1 = tets[q * 4 + 1], V2 = tets[q * 4 + 2], V3 = tets[q * 4 + 3]; tetE[q] = Math.max(dP(fin, V0, V1), dP(fin, V0, V2), dP(fin, V0, V3), dP(fin, V1, V2), dP(fin, V1, V3), dP(fin, V2, V3)); }
    var kl = []; for (j = 0; j < E; j++) if (!eLong[j]) kl.push(eLen[j]);
    kl.sort(function (u, v) { return u - v; });
    var epsMax = kl[Math.floor(kl.length * 0.92)] || 0.1;

    // 7 · multiplex: three layers, same nodes, different relations
    var mul = new Float32Array(N * 3), layer = new Uint8Array(N), lP = [[], [], []], coup = [];
    for (i = 0; i < N; i++) {
      layer[i] = Math.floor(hsh(i, 9) * 3) % 3;
      mul[i * 3] = fin[i * 3] * 1.22 + fin[i * 3 + 1] * 0.18; mul[i * 3 + 1] = LY[layer[i]]; mul[i * 3 + 2] = fin[i * 3 + 2] * 1.22;
      if (hsh(i, 11) < 0.05) coup.push(i);
    }
    for (j = 0; j < E; j++) { var hv = hsh(j, 3); lP[eLong[j] ? 1 : hv < 0.48 ? 0 : hv < 0.7 ? 1 : 2].push(eA[j], eB[j]); }
    for (q = 0; q < 240; q++) { k = Math.floor(r() * C); if (mem[k].length < 2) continue; a = mem[k][Math.floor(r() * mem[k].length)]; b = mem[k][Math.floor(r() * mem[k].length)]; if (a !== b) lP[2].push(a, b); }

    // 8 · 4D: communities on the 16 tesseract vertices, bridges along its edges
    var p4 = new Float32Array(N * 4), S4 = 0.55;
    for (i = 0; i < N; i++) {
      k = comm[i];
      var Vv = [(k & 1) ? 1 : -1, (k & 2) ? 1 : -1, (k & 4) ? 1 : -1, (k & 8) ? 1 : -1];
      if (bridge[i] || hsh(i, 13) < 0.16) {
        var bit = Math.floor(hsh(i, 17) * 4) % 4, V2 = Vv.slice(), tt = hsh(i, 19);
        V2[bit] = -V2[bit];
        for (q = 0; q < 4; q++) p4[i * 4 + q] = lerp(Vv[q], V2[q], tt) * S4 + gauss(r) * 0.012;
      } else {
        for (q = 0; q < 3; q++) p4[i * 4 + q] = Vv[q] * S4 + (emb[i * 3 + q] - cenE[k][q]) * 0.5;
        p4[i * 4 + 3] = Vv[3] * S4 + gauss(r) * 0.035;
      }
    }

    // 9 · temporal growth order (BFS per community, communities radiate outward)
    var cenF = centroids(fin, N, C, comm, null), cOrd = [];
    for (k = 0; k < C; k++) cOrd.push(k);
    cOrd.sort(function (u, v) { return d3(cenF[u], cenF[0]) - d3(cenF[v], cenF[0]); });
    var head = new Int32Array(C);
    for (k = 0; k < C; k++) head[k] = nodeNear(fin, N, cenF[k], (function (kk) { return function (q2) { return comm[q2] === kk && !bridge[q2]; }; })(k));
    var birth = new Float32Array(N).fill(2), parent = new Int32Array(N).fill(-1);
    for (var ri = 0; ri < C; ri++) {
      k = cOrd[ri];
      var st0 = 0.02 + ri / (C - 1) * 0.42, h0 = head[k], queue = [h0], seen = new Set([h0]), order = [];
      for (var qi = 0; qi < queue.length; qi++) {
        var uu = queue[qi]; order.push(uu);
        adj[uu].forEach(function (v) { if (!seen.has(v) && comm[v] === k) { seen.add(v); parent[v] = uu; queue.push(v); } });
      }
      for (i = 0; i < N; i++) if (comm[i] === k && !seen.has(i)) {
        var bp = order[0], bdd = 1e9;
        for (q = 0; q < order.length; q++) { var dd2 = dP(fin, i, order[q]); if (dd2 < bdd) { bdd = dd2; bp = order[q]; } }
        parent[i] = bp; order.push(i); seen.add(i);
      }
      for (q = 0; q < order.length; q++) birth[order[q]] = Math.min(0.97, st0 + 0.5 * (q / order.length) + hsh(order[q], 23) * 0.015);
      parent[h0] = -1;
      if (ri > 0) {
        var bh = -1, bhd = 1e9;
        for (i = 0; i < N; i++) if (birth[i] < st0 - 0.02) { var dh = dP(fin, i, h0); if (dh < bhd) { bhd = dh; bh = i; } }
        parent[h0] = bh;
      }
    }
    var bOrd = Int32Array.from(Array.from({ length: N }, function (_, ix) { return ix; }).sort(function (u, v) { return birth[u] - birth[v]; }));
    var eBirth = new Float32Array(E), eDeath = new Float32Array(E).fill(2), eAlt = new Int32Array(E).fill(-1), eRw = new Float32Array(E).fill(2);
    for (j = 0; j < E; j++) {
      a = eA[j]; b = eB[j]; eBirth[j] = Math.max(birth[a], birth[b]) + 0.012;
      if (!eLong[j] && hsh(j, 29) < 0.11) {
        var pool2 = mem[comm[a]];
        for (var tr2 = 0; tr2 < 10; tr2++) {
          var cc = pool2[Math.floor(r() * pool2.length)];
          if (cc !== a && cc !== b && birth[cc] < birth[a] + 0.04) {
            eAlt[j] = cc; eBirth[j] = Math.max(birth[a], birth[cc]) + 0.012;
            eRw[j] = Math.min(0.97, Math.max(eBirth[j] + 0.1 + 0.35 * hsh(j, 31), birth[b] + 0.03));
            break;
          }
        }
      } else if (hsh(j, 37) < 0.07) eDeath[j] = Math.min(0.985, eBirth[j] + 0.15 + 0.5 * hsh(j, 41));
    }

    // 10 · hyperbolic tree (3-ary heaps per community under one root)
    var root = head[cOrd[0]], tPar = new Int32Array(N).fill(-1), tDep = new Uint8Array(N), kids = [];
    for (i = 0; i < N; i++) kids.push([]);
    for (k = 0; k < C; k++) {
      var hk = head[k], others = [];
      for (i = 0; i < N; i++) if (comm[i] === k && i !== hk) others.push(i);
      others.sort(function (u, v) { return dP(fin, u, hk) - dP(fin, v, hk); });
      var ordT = [hk].concat(others);
      for (q = 1; q < ordT.length; q++) { var pp = ordT[Math.floor((q - 1) / 3)]; tPar[ordT[q]] = pp; kids[pp].push(ordT[q]); }
      if (hk !== root) { tPar[hk] = root; kids[root].push(hk); }
    }
    var bfs = [root], maxDep = 0;
    for (q = 0; q < bfs.length; q++) { var u2 = bfs[q]; for (j = 0; j < kids[u2].length; j++) { var v2 = kids[u2][j]; tDep[v2] = tDep[u2] + 1; if (tDep[v2] > maxDep) maxDep = tDep[v2]; bfs.push(v2); } }
    var dir = new Float32Array(N * 3), ball = new Float32Array(N * 3), rk = kids[root];
    for (q = 0; q < rk.length; q++) { var fy = 1 - 2 * (q + 0.5) / rk.length, fr = Math.sqrt(1 - fy * fy), th = q * 2.39996323; dir[rk[q] * 3] = fr * Math.cos(th); dir[rk[q] * 3 + 1] = fy; dir[rk[q] * 3 + 2] = fr * Math.sin(th); }
    for (q = 1; q < bfs.length; q++) {
      var pu = bfs[q], ks = kids[pu]; if (!ks.length) continue;
      var dx0 = dir[pu * 3], dy0 = dir[pu * 3 + 1], dz0 = dir[pu * 3 + 2];
      var hx = Math.abs(dx0) < 0.9 ? 1 : 0, hy = hx ? 0 : 1;
      var e1x = dy0 * 0 - dz0 * hy, e1y = dz0 * hx - dx0 * 0, e1z = dx0 * hy - dy0 * hx, e1l = Math.hypot(e1x, e1y, e1z) || 1;
      e1x /= e1l; e1y /= e1l; e1z /= e1l;
      var e2x = dy0 * e1z - dz0 * e1y, e2y = dz0 * e1x - dx0 * e1z, e2z = dx0 * e1y - dy0 * e1x;
      var theta = 0.62 * Math.pow(0.6, Math.max(0, tDep[pu] - 1)), phi0 = hsh(pu, 43) * 6.2832, ct = Math.cos(theta), stt = Math.sin(theta);
      for (j = 0; j < ks.length; j++) {
        var phi = phi0 + 6.2832 * j / ks.length, cp = Math.cos(phi), sp = Math.sin(phi);
        var vx = dx0 * ct + (e1x * cp + e2x * sp) * stt, vy = dy0 * ct + (e1y * cp + e2y * sp) * stt, vz = dz0 * ct + (e1z * cp + e2z * sp) * stt, vl = Math.hypot(vx, vy, vz) || 1;
        dir[ks[j] * 3] = vx / vl; dir[ks[j] * 3 + 1] = vy / vl; dir[ks[j] * 3 + 2] = vz / vl;
      }
    }
    for (i = 0; i < N; i++) { var rad = Math.tanh(0.55 * tDep[i]); ball[i * 3] = dir[i * 3] * rad; ball[i * 3 + 1] = dir[i * 3 + 1] * rad; ball[i * 3 + 2] = dir[i * 3 + 2] * rad; }
    var byDep = [];
    for (q = 0; q <= maxDep; q++) byDep.push([]);
    for (i = 0; i < N; i++) if (tPar[i] >= 0) byDep[tDep[i]].push(i);
    var headBy = function (vx3, vy3, vz3) { var bb = head[0], bv = -2; for (var kk2 = 0; kk2 < C; kk2++) { var hh = head[kk2]; if (hh === root) continue; var dv = dir[hh * 3] * vx3 + dir[hh * 3 + 1] * vy3 + dir[hh * 3 + 2] * vz3; if (dv > bv) { bv = dv; bb = hh; } } return bb; };
    var g1 = headBy(0.86, 0.15, 0.5), g2 = headBy(-0.86, -0.12, -0.5);
    var ga1 = [dir[g1 * 3] * 0.82, dir[g1 * 3 + 1] * 0.82, dir[g1 * 3 + 2] * 0.82], ga2 = [dir[g2 * 3] * 0.78, dir[g2 * 3 + 1] * 0.78, dir[g2 * 3 + 2] * 0.78];

    // 11 · brain: radial warp of the force layout into two hemispheres + cerebellum
    var c0 = [0, 0.05, 0], HL = [-0.31, 0.07, 0], HR = [0.31, 0.07, 0], HRAD = [0.42, 0.58, 0.92], CB = [0, -0.43, -0.62], CBR = [0.5, 0.21, 0.31];
    var rayE = function (dv, e, rd) {
      var ox = (c0[0] - e[0]) / rd[0], oy = (c0[1] - e[1]) / rd[1], oz = (c0[2] - e[2]) / rd[2], dx = dv[0] / rd[0], dy = dv[1] / rd[1], dz = dv[2] / rd[2];
      var A = dx * dx + dy * dy + dz * dz, B = 2 * (ox * dx + oy * dy + oz * dz), Cq = ox * ox + oy * oy + oz * oz - 1, disc = B * B - 4 * A * Cq;
      if (disc < 0) return null;
      var sq = Math.sqrt(disc); return { n: (-B - sq) / (2 * A), f: (-B + sq) / (2 * A) };
    };
    var rho = function (dv) {
      var L1 = rayE(dv, HL, HRAD), R1 = rayE(dv, HR, HRAD), Cb = rayE(dv, CB, CBR), m = 0;
      if (L1 && L1.f > m) m = L1.f;
      if (R1 && R1.f > m) m = R1.f;
      if (Cb && Cb.n <= m + 0.02 && Cb.f > m) m = Cb.f;
      return m * (1 + 0.035 * Math.sin(9 * dv[0] + 5 * dv[2]) * Math.sin(11 * dv[1] + 3 * dv[2]));
    };
    var brain = new Float32Array(N * 3);
    for (i = 0; i < N; i++) {
      x = fin[i * 3]; y = fin[i * 3 + 1]; z = fin[i * 3 + 2]; l = Math.hypot(x, y, z) || 1e-6;
      var dvv = [x / l, y / l, z / l], rr = rho(dvv), ff = Math.pow(Math.min(l / 0.95, 1), 0.75) * 0.97;
      var bx = c0[0] + dvv[0] * rr * ff, by = c0[1] + dvv[1] * rr * ff, bz = c0[2] + dvv[2] * rr * ff;
      bx += (bx >= 0 ? 1 : -1) * 0.065 * clamp01((by + 0.15) / 0.45);
      brain[i * 3] = bx; brain[i * 3 + 1] = by; brain[i * 3 + 2] = bz;
    }
    var ctrl = new Float32Array(E * 3), bLen = new Float32Array(E);
    for (j = 0; j < E; j++) {
      a = eA[j]; b = eB[j];
      var mx = (brain[a * 3] + brain[b * 3]) / 2, my = (brain[a * 3 + 1] + brain[b * 3 + 1]) / 2, mz = (brain[a * 3 + 2] + brain[b * 3 + 2]) / 2, ln = dP(brain, a, b);
      bLen[j] = ln;
      if (eLong[j] || ln > 0.3) { ctrl[j * 3] = (c0[0] - mx) * 0.38; ctrl[j * 3 + 1] = (c0[1] + 0.08 - my) * 0.38; ctrl[j * 3 + 2] = (c0[2] - mz) * 0.38; }
      else { var gx2 = gauss(r), gy2 = gauss(r), gz2 = gauss(r), gl = Math.hypot(gx2, gy2, gz2) || 1, sc = 0.22 * ln / gl; ctrl[j * 3] = gx2 * sc; ctrl[j * 3 + 1] = gy2 * sc; ctrl[j * 3 + 2] = gz2 * sc; }
    }
    var dend = new Float32Array(N * 18);
    for (i = 0; i < N; i++) for (q = 0; q < 2; q++) {
      var ddx = gauss(r), ddy = gauss(r), ddz = gauss(r), dl = Math.hypot(ddx, ddy, ddz) || 1;
      ddx /= dl; ddy /= dl; ddz /= dl;
      var L0 = 0.022 + 0.02 * r(), oo = i * 18 + q * 9;
      var px2 = gauss(r), py2 = gauss(r), pz2 = gauss(r), pd = px2 * ddx + py2 * ddy + pz2 * ddz;
      px2 -= pd * ddx; py2 -= pd * ddy; pz2 -= pd * ddz;
      var pl = Math.hypot(px2, py2, pz2) || 1; px2 /= pl; py2 /= pl; pz2 /= pl;
      dend[oo] = ddx * L0 * 0.6; dend[oo + 1] = ddy * L0 * 0.6; dend[oo + 2] = ddz * L0 * 0.6;
      dend[oo + 3] = dend[oo] + (ddx * 0.82 + px2 * 0.57) * L0 * 0.55; dend[oo + 4] = dend[oo + 1] + (ddy * 0.82 + py2 * 0.57) * L0 * 0.55; dend[oo + 5] = dend[oo + 2] + (ddz * 0.82 + pz2 * 0.57) * L0 * 0.55;
      dend[oo + 6] = dend[oo] + (ddx * 0.82 - px2 * 0.57) * L0 * 0.55; dend[oo + 7] = dend[oo + 1] + (ddy * 0.82 - py2 * 0.57) * L0 * 0.55; dend[oo + 8] = dend[oo + 2] + (ddz * 0.82 - pz2 * 0.57) * L0 * 0.55;
    }
    var fA = new Uint8Array(N), fP = new Float32Array(N), eDir = new Uint8Array(E);
    for (i = 0; i < N; i++) { fA[i] = r() < 0.36 ? 1 : 0; fP[i] = 2.6 + 5.2 * r(); }
    for (j = 0; j < E; j++) eDir[j] = r() < 0.5 ? 1 : 0;

    // 12 · query: seeds, spreading-activation BFS, retrieved slots
    var sA = nodeNear(brain, N, [0.52, 0.25, 0.42], function (q2) { return !bridge[q2] && deg[q2] >= 4; });
    var sB = nodeNear(brain, N, [0.55, -0.05, -0.25], function (q2) { return !bridge[q2] && deg[q2] >= 4 && q2 !== sA && comm[q2] !== comm[sA]; });
    var qHop = new Uint8Array(N).fill(255), qPar = new Int32Array(N).fill(-1), qPE = new Int32Array(N).fill(-1), qJit = new Float32Array(N);
    var bq = [sA, sB]; qHop[sA] = 0; qHop[sB] = 0;
    for (q = 0; q < bq.length; q++) {
      var hu = bq[q]; if (qHop[hu] >= 6) continue;
      for (var ai = aS[hu]; ai < aS[hu + 1]; ai++) { var hv2 = aN[ai]; if (qHop[hv2] === 255) { qHop[hv2] = qHop[hu] + 1; qPar[hv2] = hu; qPE[hv2] = aE[ai]; bq.push(hv2); } }
    }
    for (i = 0; i < N; i++) qJit[i] = r() * 0.3;
    var used = new Set([sA, sB]);
    var kidsOf = function (pn) { var out = []; for (var a2 = aS[pn]; a2 < aS[pn + 1]; a2++) { var v3 = aN[a2]; if (qPar[v3] === pn) out.push(v3); } return out.sort(function (u, v) { return deg[v] - deg[u]; }); };
    var pick = function (pn, needKids) {
      var ks2 = kidsOf(pn).filter(function (v) { return !used.has(v); }), wk = ks2.filter(function (v) { return kidsOf(v).length > 0; });
      var cpick = (needKids && wk.length ? wk : ks2)[0];
      if (cpick == null) for (var a3 = aS[pn]; a3 < aS[pn + 1]; a3++) if (!used.has(aN[a3])) { cpick = aN[a3]; break; }
      if (cpick == null) cpick = (pn + 1) % N;
      used.add(cpick); return cpick;
    };
    var A1 = pick(sA, 1), A2 = pick(sA, 1), B1 = pick(sB, 1), B2 = pick(sB, 1);
    var slots = Int32Array.from([sA, sB, A1, A2, B1, B2, pick(A1, 0), pick(A2, 0), pick(B1, 0), pick(B2, 0)]);
    var isSlot = new Uint8Array(N), slotIdx = new Int8Array(N).fill(-1), slotDz = new Float32Array(10);
    for (q = 0; q < 10; q++) { isSlot[slots[q]] = 1; slotIdx[slots[q]] = q; slotDz[q] = (hsh(q, 47) - 0.5) * 0.12; }

    // 13 · camera targets that depend on the data
    var ce = cenE[0], bce = 1e9;
    for (k = 0; k < C; k++) { var dce = d3(cenE[k], [0.35, 0.05, 0.05]); if (dce < bce) { bce = dce; ce = cenE[k]; } }
    var tet = hyp[0].cen, bestN = -1;
    for (q = 0; q < tetE.length; q++) {
      var tc = [0, 0, 0];
      for (j = 0; j < 4; j++) { tc[0] += fin[tets[q * 4 + j] * 3] / 4; tc[1] += fin[tets[q * 4 + j] * 3 + 1] / 4; tc[2] += fin[tets[q * 4 + j] * 3 + 2] / 4; }
      if (tc[0] * -0.405 + tc[2] * -0.914 < 0.12) continue;
      var nn = 0;
      for (j = 0; j < tetE.length; j += 3) { var vq = tets[j * 4]; if (Math.abs(fin[vq * 3] - tc[0]) + Math.abs(fin[vq * 3 + 1] - tc[1]) + Math.abs(fin[vq * 3 + 2] - tc[2]) < 0.22) nn++; }
      if (nn > bestN) { bestN = nn; tet = tc; }
    }
    var camT = { emb: ce, hyp: hyp[0].cen, tet: tet, q: [(brain[sA * 3] + brain[sB * 3]) / 2, (brain[sA * 3 + 1] + brain[sB * 3 + 1]) / 2, (brain[sA * 3 + 2] + brain[sB * 3 + 2]) / 2] };

    // 14 · dust for parallax
    var nd = 1100, dust = new Float32Array(nd * 3), dustA = new Float32Array(nd);
    for (q = 0; q < nd; q++) {
      var drr = q < 260 ? 0.25 + 1.2 * r() : 2.2 + 5 * r(), gx3 = gauss(r), gy3 = gauss(r), gz3 = gauss(r), gl3 = Math.hypot(gx3, gy3, gz3) || 1;
      dust[q * 3] = gx3 / gl3 * drr; dust[q * 3 + 1] = gy3 / gl3 * drr * 0.8; dust[q * 3 + 2] = gz3 / gl3 * drr; dustA[q] = (q < 260 ? 0.12 : 0.25) + 0.5 * r();
    }

    var size0 = new Float32Array(N), tint0 = new Float32Array(N), eIntra = new Uint8Array(E), eOrd = new Float32Array(E);
    for (i = 0; i < N; i++) { size0[i] = 0.0062 + 0.0046 * Math.sqrt(deg[i] / maxDeg); tint0[i] = clamp01(0.16 + 0.44 * hsh(comm[i], 5) + 0.12 * (rnd[i] - 0.5)); }
    for (j = 0; j < E; j++) {
      eIntra[j] = !eLong[j] && comm[eA[j]] === comm[eB[j]] ? 1 : 0;
      var emx = (emb[eA[j] * 3] + emb[eB[j] * 3]) / 2, emy = (emb[eA[j] * 3 + 1] + emb[eB[j] * 3 + 1]) / 2, emz = (emb[eA[j] * 3 + 2] + emb[eB[j] * 3 + 2]) / 2;
      eOrd[j] = clamp01(Math.hypot(emx, emy, emz) / 0.85 * 0.9 + rnd2[j] * 0.1);
    }

    Object.assign(W, {
      comm: comm, bridge: bridge, emb: emb, shell: shell, arcA: arcA, arcB: arcB, snaps: snaps, fin: fin, mul: mul, layer: layer,
      lP: lP.map(function (v) { return Int32Array.from(v); }), coup: Int32Array.from(coup), p4: p4, brain: brain, ball: ball, tPar: tPar, tDep: tDep, maxDep: maxDep,
      byDep: byDep.map(function (v) { return Int32Array.from(v); }), ga1: ga1, ga2: ga2, birth: birth, parent: parent, bOrd: bOrd,
      E: E, eA: eA, eB: eB, eLong: eLong, eLen: eLen, bLen: bLen, eIntra: eIntra, eOrd: eOrd, eBirth: eBirth, eDeath: eDeath, eAlt: eAlt, eRw: eRw, eDir: eDir,
      ctrl: ctrl, dend: dend, deg: deg, rnd: rnd, rnd2: rnd2, ph: ph, fA: fA, fP: fP, size0: size0, tint0: tint0,
      hyp: hyp, hB: new Float32Array(hyp.length), tris: Int32Array.from(tris), tets: Int32Array.from(tets), triE: triE, tetE: tetE, triA: new Float32Array(triE.length), tetA: new Float32Array(tetE.length), epsMax: epsMax,
      qHop: qHop, qPar: qPar, qPE: qPE, qJit: qJit, slots: slots, isSlot: isSlot, slotIdx: slotIdx, slotDz: slotDz, liftK: new Float32Array(10), camT: camT, dust: dust, dustA: dustA,
      pos: new Float32Array(N * 3), bufA: new Float32Array(N * 3), bufB: new Float32Array(N * 3), sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N),
      size: new Float32Array(N), alpha: new Float32Array(N), tint: new Float32Array(N), heat: new Float32Array(N), act: new Float32Array(N),
      born: new Float32Array(N).fill(1), w4: new Float32Array(N), f4: new Float32Array(N).fill(1), cf: new Float32Array(N).fill(1), skel: new Float32Array(48),
      eAl: new Float32Array(E), eGr: new Float32Array(E), eHt: new Float32Array(E), eSl: new Float32Array(E).fill(1),
      bk: new Int16Array(E), bkIdx: new Int32Array(E), bkCnt: new Int32Array(40), bkOff: new Int32Array(41), bkFill: new Int32Array(40),
      lsx: new Float32Array(N * 3), lsy: new Float32Array(N * 3), lsz: new Float32Array(N * 3), maxP: 5000, pulse: new Float32Array(5000 * 4),
      F: { cam: {}, labels: [], title: {}, q: { lines: [0, 0, 0, 0], slots: [] }, ruler: {}, end: [0, 0, 0], nP: 0 }
    });
    return W;
  }

  // ── cues & camera ───────────────────────────────────────────────────────
  function cues(starts, total) {
    var s = {}, e = {}, i, tt = +total;
    for (i = 0; i < SECTIONS.length; i++) s[SECTIONS[i]] = +starts[SECTIONS[i]];
    if (!(tt > 0)) { tt = 0; for (i = 0; i < DURS.length; i++) tt += DURS[i]; }
    for (i = 0; i < SECTIONS.length; i++) e[SECTIONS[i]] = i + 1 < SECTIONS.length ? s[SECTIONS[i + 1]] : tt;
    return { s: s, e: e, total: tt };
  }
  function defaultCues() { var st = {}, t = 0; for (var i = 0; i < SECTIONS.length; i++) { st[SECTIONS[i]] = t; t += DURS[i]; } return cues(st, t); }
  function sc3(v, k) { return [v[0] * k, v[1] * k, v[2] * k]; }
  function camKeys(W, Q) {
    if (W._ckQ === Q) return W._ck;
    var s = Q.s, Z = [0, 0, 0], ct = W.camT;
    var K = [
      [s.Shell, 0.0, 0.2, 4.1, Z, 44], [s.Shell + 9.6, 0.42, 0.16, 3.3, Z, 44],
      [s.Breach + 2.4, 0.56, 0.12, 1.8, Z, 48], [s.Breach + 3.7, 0.64, 0.08, 0.72, Z, 56], [s.Breach + 5.6, 0.82, 0.05, 0.34, Z, 58], [s.Breach + 8.0, 1.0, 0.12, 1.3, Z, 50],
      [s.Embedding + 0.2, 1.16, 0.2, 2.25, Z, 46], [s.Embedding + 6.5, 1.46, 0.24, 1.6, ct.emb, 46],
      [s.Force, 1.78, 0.22, 2.15, Z, 46], [s.Force + 4.5, 2.0, 0.28, 2.75, Z, 46],
      [s.Hypergraph + 0.5, 2.36, 0.3, 2.6, Z, 46], [s.Hypergraph + 5.2, 2.6, 0.24, 2.15, sc3(ct.hyp, 0.5), 46], [s.Hypergraph + 9.6, 2.86, 0.16, 1.15, ct.hyp, 46],
      [s.Simplicial + 0.2, 3.06, 0.2, 1.65, sc3(ct.hyp, 0.4), 46], [s.Simplicial + 6.0, 3.3, 0.26, 2.1, Z, 46],
      [s.Multiplex, 3.56, 0.22, 1.4, ct.tet, 46], [s.Multiplex + 4.5, 3.86, 0.62, 3.3, Z, 46],
      [s.Tesseract, 4.25, 0.24, 2.85, Z, 46], [s.Temporal, 4.85, 0.22, 2.7, Z, 46], [s.Temporal + 3.9, 5.1, 0.24, 1.9, Z, 46], [s.Hyperbolic, 5.35, 0.2, 2.4, Z, 46],
      [s.Connectome, 5.9, 0.2, 2.8, Z, 46], [s.Connectome + 8.0, 7.1, 0.3, 2.75, Z, 46],
      [s.Query, 7.3, 0.18, 1.6, ct.q, 46], [s.Query + 5.5, 7.38, 0.14, 1.1, ct.q, 46], [s.Query + 10.8, 7.46, 0.2, 2.0, sc3(ct.q, 0.6), 46], [s.Query + 14.0, 7.55, 0.2, 2.6, Z, 46],
      [s.Coda, 7.7, 0.2, 2.65, Z, 46], [s.Coda + 3.5, 7.88, 0.22, 2.95, Z, 46], [Q.total, 8.3, 0.26, 4.3, Z, 46]
    ];
    var ts = [], ch = [[], [], [], [], [], [], []];
    for (var i = 0; i < K.length; i++) {
      if (ts.length && !(K[i][0] > ts[ts.length - 1])) continue;
      ts.push(K[i][0]); ch[0].push(K[i][1]); ch[1].push(K[i][2]); ch[2].push(K[i][3]); ch[3].push(K[i][4][0]); ch[4].push(K[i][4][1]); ch[5].push(K[i][4][2]); ch[6].push(K[i][5]);
    }
    W._ckQ = Q; W._ck = { ts: ts, ch: ch }; return W._ck;
  }
  function spline(ts, vs, T) {
    var n = ts.length;
    if (T <= ts[0]) return vs[0];
    if (T >= ts[n - 1]) return vs[n - 1];
    var i = 0; while (i < n - 2 && T > ts[i + 1]) i++;
    var t0 = ts[i], t1 = ts[i + 1], p0 = vs[i], p1 = vs[i + 1];
    var m0 = i > 0 ? (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]) : 0, m1 = i + 2 < n ? (vs[i + 2] - vs[i]) / (ts[i + 2] - ts[i]) : 0;
    var h = t1 - t0, u = (T - t0) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
  }
  function filmCam(W, T, Q) {
    var K = camKeys(W, Q), c = K.ch, ts = K.ts;
    return { yaw: spline(ts, c[0], T), pitch: spline(ts, c[1], T), dist: Math.max(0.2, spline(ts, c[2], T)), target: [spline(ts, c[3], T), spline(ts, c[4], T), spline(ts, c[5], T)], fov: spline(ts, c[6], T) };
  }
  function setCam(F, cam, w, h) {
    var c = F.cam, cp = Math.cos(cam.pitch), t = cam.target;
    c.px = t[0] + cam.dist * cp * Math.sin(cam.yaw); c.py = t[1] + cam.dist * Math.sin(cam.pitch); c.pz = t[2] + cam.dist * cp * Math.cos(cam.yaw);
    var fx = t[0] - c.px, fy = t[1] - c.py, fz = t[2] - c.pz, fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, rz = fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    c.fx = fx; c.fy = fy; c.fz = fz; c.rx = rx; c.ry = 0; c.rz = rz;
    c.ux = -rz * fy; c.uy = rz * fx - rx * fz; c.uz = rx * fy;
    c.focus = cam.dist; c.fov = cam.fov; c.fp = (h / 2) / Math.tan(cam.fov * Math.PI / 360); c.cx = w / 2; c.cy = h / 2;
    c.yaw = cam.yaw; c.pitch = cam.pitch; c.dist = cam.dist; c.target = [t[0], t[1], t[2]];
  }
  var PR = { x: 0, y: 0, z: 0 };
  function proj(c, x, y, z) {
    var dx = x - c.px, dy = y - c.py, dz = z - c.pz, zz = dx * c.fx + dy * c.fy + dz * c.fz;
    PR.z = zz; if (zz < 0.02) return false;
    var iz = c.fp / zz;
    PR.x = c.cx + (dx * c.rx + dz * c.rz) * iz; PR.y = c.cy - (dx * c.ux + dy * c.uy + dz * c.uz) * iz; return true;
  }

  // ── choreography ────────────────────────────────────────────────────────
  var X = {};
  function weights(T, Q) {
    var s = Q.s, e = Q.e, sq = s.Query;
    X.shellW = 1 - ramp(T, s.Breach + 3.0, s.Breach + 7.0);
    X.arcs = env(T, s.Shell + 0.6, s.Shell + 3.2, s.Breach + 1.2, s.Breach + 3.2);
    X.knnHold = 1 - ramp(T, s.Simplicial, s.Simplicial + 1.4);
    X.longIn = ramp(T, s.Force + 0.3, s.Force + 1.8);
    X.hyperDim = env(T, s.Hypergraph + 0.4, s.Hypergraph + 2.0, s.Simplicial, s.Simplicial + 1.2);
    X.hulls = env(T, s.Hypergraph + 0.5, s.Hypergraph + 0.9, s.Simplicial - 0.2, s.Simplicial + 1.3);
    X.hl = env(T, s.Hypergraph + 7.0, s.Hypergraph + 8.2, s.Simplicial - 0.8, s.Simplicial + 0.4);
    X.fil = env(T, s.Simplicial + 1.4, s.Simplicial + 1.6, s.Multiplex + 0.2, s.Multiplex + 2.0);
    X.eps = ramp(T, s.Simplicial + 1.8, s.Simplicial + 8.6);
    X.balls = env(T, s.Simplicial + 1.6, s.Simplicial + 2.6, s.Simplicial + 5.4, s.Simplicial + 7.2);
    X.tris = env(T, s.Simplicial + 1.8, s.Simplicial + 2.0, s.Multiplex, s.Multiplex + 1.4);
    X.planes = env(T, s.Multiplex + 1.6, s.Multiplex + 3.6, s.Tesseract, s.Tesseract + 1.6);
    X.replicas = env(T, s.Multiplex + 3.0, s.Multiplex + 5.0, s.Tesseract + 0.2, s.Tesseract + 1.8);
    X.lt = T - (s.Multiplex + 4.0);
    X.layerOut = 1 - ramp(T, s.Tesseract, s.Tesseract + 1.5);
    X.couplings = env(T, s.Multiplex + 6.4, s.Multiplex + 8.4, s.Tesseract, s.Tesseract + 1.2);
    X.w4 = env(T, s.Tesseract + 0.5, s.Tesseract + 3.0, s.Temporal, s.Temporal + 1.8);
    X.skel = env(T, s.Tesseract + 2.6, s.Tesseract + 4.6, s.Temporal, s.Temporal + 1.2);
    X.intra4 = env(T, s.Tesseract + 1.5, s.Tesseract + 3.5, s.Temporal, s.Temporal + 1.4);
    X.temporal = env(T, s.Temporal + 0.3, s.Temporal + 1.9, s.Hyperbolic, s.Hyperbolic + 1.2);
    X.g = T < s.Temporal + 3.9 ? 1 - 0.94 * ramp(T, s.Temporal + 2.0, s.Temporal + 3.8) : 0.06 + 0.94 * ramp(T, s.Temporal + 4.0, s.Temporal + 11.4);
    X.growing = T > s.Temporal + 4.0 && T < s.Temporal + 11.6;
    X.tOn = T >= s.Temporal && T < s.Hyperbolic + 1.3;
    X.ruler = env(T, s.Temporal + 1.4, s.Temporal + 2.2, e.Temporal - 0.6, e.Temporal + 0.2);
    X.hyp = env(T, s.Hyperbolic + 0.4, s.Hyperbolic + 2.6, s.Connectome + 0.3, s.Connectome + 2.6);
    X.tree = env(T, s.Hyperbolic + 1.2, s.Hyperbolic + 3.4, s.Connectome, s.Connectome + 1.5);
    X.rings = env(T, s.Hyperbolic + 1.0, s.Hyperbolic + 3.0, s.Connectome, s.Connectome + 1.6);
    X.axonT = T - (s.Connectome + 1.6);
    X.curve = ramp(T, s.Connectome + 0.6, s.Connectome + 3.8);
    X.dend = ramp(T, s.Connectome + 3.0, s.Connectome + 6.0);
    X.brain = ramp(T, s.Connectome + 0.5, s.Connectome + 3.5);
    X.fire = ramp(T, s.Connectome + 4.0, s.Connectome + 6.0) * (1 - 0.85 * env(T, sq + 5.0, sq + 6.6, s.Coda + 1.0, s.Coda + 3.0));
    X.waveZ = lerp(-1.0, 1.0, ramp(T, s.Connectome + 8.6, s.Connectome + 11.6));
    X.wave = env(T, s.Connectome + 8.4, s.Connectome + 8.8, s.Connectome + 11.4, s.Connectome + 11.8);
    X.act = env(T, sq + QT.spread - 0.1, sq + QT.spread, s.Coda + 0.8, s.Coda + 3.2);
    X.qDim = env(T, sq + QT.dim0, sq + QT.dim1, s.Coda + 0.6, s.Coda + 3.0);
    X.qDeep = env(T, sq + QT.lift0, sq + QT.lift1, s.Coda, s.Coda + 2.0);
    X.beam = ramp(T, sq + QT.beam0, sq + QT.beam1) * (1 - ramp(T, sq + QT.up0 - 0.4, sq + QT.up0 + 0.4));
    return X;
  }

  var TRANS = {
    Breach: { delay: 2.9, dur: 5.4, st: 'rand', amt: 0.45, swirl: 0.8, lift: 0.14 },
    Force: { delay: 0, dur: 1.1, st: 'rand', amt: 0.2 },
    Multiplex: { delay: 0.3, dur: 3.6, st: 'rand', amt: 0.35 },
    Tesseract: { delay: 0.2, dur: 3.2, st: 'rand', amt: 0.3 },
    Temporal: { delay: 0, dur: 2.0, st: 'rand', amt: 0.25 },
    Hyperbolic: { delay: 0.2, dur: 3.0, st: 'depth', amt: 0.4 },
    Connectome: { delay: 0.3, dur: 3.8, st: 'z', amt: 0.35 }
  };
  function breathe(W, T, src, out, amp) {
    for (var i = 0, N = W.N; i < N; i++) {
      var p = W.ph[i];
      out[i * 3] = src[i * 3] + amp * Math.sin(0.9 * T + p); out[i * 3 + 1] = src[i * 3 + 1] + amp * Math.sin(0.77 * T + p * 1.7); out[i * 3 + 2] = src[i * 3 + 2] + amp * Math.sin(0.83 * T + p * 2.3);
    }
  }
  function spin(t, w, tau) { return t <= 0 ? 0 : t < tau ? w * t * t / (2 * tau) : w * (t - tau / 2); }
  function poseInto(W, name, T, Q, F, out) {
    var N = W.N, i, s = Q.s;
    if (name === 'Shell') { out.set(W.shell); return; }
    if (name === 'Breach' || name === 'Embedding') { breathe(W, T, W.emb, out, 0.004); return; }
    if (name === 'Force') {
      var S = W.snaps, m = S.length - 1, f = M.enter((T - (s.Force + 0.7)) / 8.0) * m, j = Math.min(m - 1, Math.floor(f)), t = f - j;
      var A = S[Math.max(0, j - 1)], B = S[j], C2 = S[j + 1], D = S[Math.min(m, j + 2)], t2 = t * t, t3 = t2 * t;
      for (i = 0; i < N * 3; i++) out[i] = 0.5 * (2 * B[i] + (C2[i] - A[i]) * t + (2 * A[i] - 5 * B[i] + 4 * C2[i] - D[i]) * t2 + (3 * B[i] - A[i] - 3 * C2[i] + D[i]) * t3);
      breathe(W, T, out, out, 0.004); return;
    }
    if (name === 'Hypergraph' || name === 'Simplicial') { breathe(W, T, W.fin, out, 0.004); return; }
    if (name === 'Multiplex') { breathe(W, T, W.mul, out, 0.004); return; }
    if (name === 'Tesseract') {
      var tt = T - (s.Tesseract + 3.0), al = spin(tt, 0.42, 2.0), be = spin(tt, 0.27, 2.0), ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(be), sb = Math.sin(be), P4 = W.p4;
      var rot = function (x, y, z, w, o, k) { var x1 = x * ca - w * sa, w1 = x * sa + w * ca, y1 = y * cb - w1 * sb, w2 = y * sb + w1 * cb, f4 = 2.4 / (2.4 - w2); o[k] = x1 * f4; o[k + 1] = y1 * f4; o[k + 2] = z * f4; return w2; };
      for (i = 0; i < N; i++) { var w2 = rot(P4[i * 4], P4[i * 4 + 1], P4[i * 4 + 2], P4[i * 4 + 3], out, i * 3); W.w4[i] = w2; W.f4[i] = 2.4 / (2.4 - w2); }
      for (var v = 0; v < 16; v++) rot(((v & 1) ? 1 : -1) * 0.55, ((v & 2) ? 1 : -1) * 0.55, ((v & 4) ? 1 : -1) * 0.55, ((v & 8) ? 1 : -1) * 0.55, W.skel, v * 3);
      return;
    }
    if (name === 'Temporal') {
      var g = X.g, P = W.fin, ord = W.bOrd, par = W.parent, bt = W.birth;
      for (var q = 0; q < N; q++) {
        i = ord[q];
        var p = W.ph[i], bx = P[i * 3] + 0.012 * Math.sin(0.5 * T + p), by = P[i * 3 + 1] + 0.012 * Math.sin(0.43 * T + p * 1.3), bz = P[i * 3 + 2] + 0.012 * Math.sin(0.47 * T + p * 2.1);
        var bn = clamp01((g - bt[i]) / 0.05), pr = par[i]; W.born[i] = bn;
        if (pr < 0) { out[i * 3] = bx; out[i * 3 + 1] = by; out[i * 3 + 2] = bz; }
        else { var k = M.enter(bn); out[i * 3] = out[pr * 3] + (bx - out[pr * 3]) * k; out[i * 3 + 1] = out[pr * 3 + 1] + (by - out[pr * 3 + 1]) * k; out[i * 3 + 2] = out[pr * 3 + 2] + (bz - out[pr * 3 + 2]) * k; }
      }
      return;
    }
    if (name === 'Hyperbolic') {
      var u1 = M.draw((T - (s.Hyperbolic + 3.2)) / 4.0), u2 = M.draw((T - (s.Hyperbolic + 7.6)) / 3.9), g1 = W.ga1, g2 = W.ga2, o3 = [0, 0, 0];
      var ax = -(g1[0] * u1 + (g2[0] - g1[0]) * u2), ay = -(g1[1] * u1 + (g2[1] - g1[1]) * u2), az = -(g1[2] * u1 + (g2[2] - g1[2]) * u2), Bl = W.ball;
      for (i = 0; i < N; i++) {
        mob(ax, ay, az, Bl[i * 3], Bl[i * 3 + 1], Bl[i * 3 + 2], o3);
        out[i * 3] = o3[0]; out[i * 3 + 1] = o3[1]; out[i * 3 + 2] = o3[2]; W.cf[i] = 1 - (o3[0] * o3[0] + o3[1] * o3[1] + o3[2] * o3[2]);
      }
      return;
    }
    breathe(W, T, W.brain, out, 0.0035);
    if (name === 'Query' || name === 'Coda') liftPose(W, T, Q, F, out);
  }
  function liftPose(W, T, Q, F, out) {
    var s = Q.s, c = F.cam, sl = W.slots, asp = Math.min(1, (F.w / F.h) / (16 / 9));
    var th = 0.12 * Math.sin(0.4 * T), ct = Math.cos(th), st = Math.sin(th), xc = -0.52 * asp;
    for (var j = 0; j < sl.length; j++) {
      var S = QUERY.slots[j], i = sl[j];
      var k = Math.min(ramp(T, s.Query + QT.lift0 + S.col * 0.25, s.Query + QT.lift1 + S.col * 0.25), 1 - ramp(T, s.Coda + 0.2 + S.col * 0.15, s.Coda + 2.4 + S.col * 0.15));
      W.liftK[j] = k;
      if (k <= 0) continue;
      var x = COLX[S.col] * asp, y = S.y, dz = W.slotDz[j], rx = xc + (x - xc) * ct - dz * st, rz = (x - xc) * st + dz * ct, D = LIFT_D + rz;
      var wx = c.px + c.fx * D + c.rx * rx + c.ux * y, wy = c.py + c.fy * D + c.uy * y, wz = c.pz + c.fz * D + c.rz * rx + c.uz * y;
      out[i * 3] += (wx - out[i * 3]) * k; out[i * 3 + 1] += (wy - out[i * 3 + 1]) * k; out[i * 3 + 2] += (wz - out[i * 3 + 2]) * k;
    }
  }
  function stag(W, st, i) {
    if (st === 'depth') return W.tDep[i] / Math.max(1, W.maxDep);
    if (st === 'z') return clamp01((W.brain[i * 3 + 2] + 0.95) / 1.9);
    return W.rnd[i];
  }
  function positions(W, T, Q, F) {
    var si = F.si, name = SECTIONS[si], tr = TRANS[name], P = W.pos, N = W.N;
    poseInto(W, name, T, Q, F, W.bufB);
    if (tr && si > 0) {
      var u = (T - (Q.s[name] + tr.delay)) / tr.dur;
      if (u < 1) {
        poseInto(W, SECTIONS[si - 1], T, Q, F, W.bufA);
        var A = W.bufA, B = W.bufB, amt = tr.amt;
        for (var i = 0; i < N; i++) {
          var ui = clamp01((u - stag(W, tr.st, i) * amt) / (1 - amt)), k = M.draw(ui), o = i * 3;
          var x = A[o] + (B[o] - A[o]) * k, y = A[o + 1] + (B[o + 1] - A[o + 1]) * k, z = A[o + 2] + (B[o + 2] - A[o + 2]) * k;
          if (tr.swirl) { var ang = Math.sin(Math.PI * k) * tr.swirl * (0.6 + 0.4 * W.rnd[i]), cs = Math.cos(ang), sn = Math.sin(ang), nx = x * cs + z * sn; z = -x * sn + z * cs; x = nx; }
          if (tr.lift) { var lf = tr.lift * Math.sin(Math.PI * clamp01(ui * 2.4)) * (1 - k), la = Math.hypot(A[o], A[o + 1], A[o + 2]) || 1; x += A[o] / la * lf; y += A[o + 1] / la * lf; z += A[o + 2] / la * lf; }
          P[o] = x; P[o + 1] = y; P[o + 2] = z;
        }
        return;
      }
    }
    P.set(W.bufB);
  }
  function projectNodes(W, F) {
    var c = F.cam, P = W.pos, N = W.N;
    for (var i = 0; i < N; i++) {
      var dx = P[i * 3] - c.px, dy = P[i * 3 + 1] - c.py, dz = P[i * 3 + 2] - c.pz, z = dx * c.fx + dy * c.fy + dz * c.fz;
      if (z < 0.02) { W.sz[i] = -1; continue; }
      var iz = c.fp / z; W.sz[i] = z; W.sx[i] = c.cx + (dx * c.rx + dz * c.rz) * iz; W.sy[i] = c.cy - (dx * c.ux + dy * c.uy + dz * c.uz) * iz;
    }
  }
  function attributes(W, T, Q) {
    var N = W.N, sq = Q.s.Query, fireOn = X.fire > 0.001, waveOn = X.wave > 0.001, actOn = X.act > 0.001, i, j;
    for (i = 0; i < N; i++) {
      var sz = W.size0[i] * (1 - 0.15 * X.shellW), al = 1, tn = W.tint0[i], ht = 0, ac = 0;
      if (X.w4 > 0.001) { sz *= lerp(1, W.f4[i], X.w4); tn = lerp(tn, clamp01((W.w4[i] + 0.62) / 1.24), X.w4); }
      if (X.tOn) {
        sz *= Math.sqrt(W.born[i]);
        if (X.growing) { var dg = (X.g - W.birth[i]) / 0.03; if (dg > -0.5 && dg < 3) ht += 0.8 * Math.exp(-dg * dg); }
        if (X.g < 0.25 && W.born[i] > 0.5) ht += 0.7 * (1 - X.g / 0.25);
      }
      if (X.hyp > 0.001) { sz *= lerp(1, 0.22 + 1.1 * Math.max(0, W.cf[i]), X.hyp); tn = lerp(tn, clamp01(0.9 - 0.13 * W.tDep[i]), X.hyp); }
      if (fireOn && W.fA[i]) { var pp = W.fP[i], tl = (T - W.ph[i] / 6.2832 * pp) % pp; if (tl < 0) tl += pp; ht += X.fire * Math.exp(-tl / 0.22) * 0.9; }
      if (waveOn) { var dz = (W.brain[i * 3 + 2] - X.waveZ) / 0.07; ht += X.wave * 0.75 * Math.exp(-dz * dz); }
      if (actOn) {
        var hp = W.qHop[i];
        if (hp <= 5) { var arr = sq + QT.spread + hp * QT.hop + W.qJit[i]; if (T >= arr) { ac = X.act * Math.pow(0.7, hp); ht += ac * (0.45 + 0.9 * Math.exp(-(T - arr) / 0.55)); } }
      }
      if (X.brain > 0.001) { sz *= 1 - 0.22 * X.brain; al *= 1 - 0.3 * X.brain; }
      if (X.qDim > 0.001 && ac < 0.02) al *= 1 - 0.8 * X.qDim;
      if (X.qDeep > 0.001 && !W.isSlot[i]) al *= 1 - 0.5 * X.qDeep;
      W.size[i] = sz; W.alpha[i] = al; W.tint[i] = tn; W.heat[i] = ht; W.act[i] = ac;
    }
    for (j = 0; j < 10; j++) { var k = W.liftK[j]; if (k > 0) { i = W.slots[j]; W.size[i] *= 1 + 0.8 * k; W.heat[i] = Math.max(W.heat[i], 0.75 * k); W.alpha[i] = 1; } }
  }
  function edgeState(W, T, Q, F) {
    var E = W.E, s = Q.s, eps = X.eps * W.epsMax * 1.06, epsW = 0.12 * W.epsMax, e0 = s.Embedding + 1.0, axT = X.axonT, c;
    for (var j = 0; j < E; j++) {
      var lng = W.eLong[j], a, g = 1, ht = 0;
      if (!lng) { g = M.enter((T - (e0 + W.eOrd[j] * 6.2)) / 0.8); a = g * 0.36; } else a = 0.24 * X.longIn;
      a *= X.knnHold * (1 - 0.4 * X.hyperDim);
      if (X.fil > 0.001 && !lng) { c = clamp01((eps - W.eLen[j]) / epsW) * 0.48 * X.fil; if (c > a) { a = c; g = 1; } }
      if (X.intra4 > 0.001 && W.eIntra[j]) { c = 0.32 * X.intra4; if (c > a) { a = c; g = 1; } }
      if (X.temporal > 0.001) {
        c = clamp01((X.g - W.eBirth[j]) / 0.035) * (1 - clamp01((X.g - W.eDeath[j]) / 0.05)) * 0.36 * X.temporal;
        if (c > a) { a = c; g = 1; }
        if (X.growing) { var db = (X.g - W.eBirth[j]) / 0.02; if (db > -0.5 && db < 3) ht = 0.9 * Math.exp(-db * db) * X.temporal; }
        W.eSl[j] = W.eAlt[j] >= 0 ? M.draw((X.g - W.eRw[j]) / 0.04) : 1;
      }
      if (axT > 0) { var ag = M.enter((axT - W.rnd2[j] * 2.4) / 1.1); c = 0.16 * ag; if (c > a) { a = c; g = ag; } }
      if (X.act > 0.001) {
        var aa = W.act[W.eA[j]], ab = W.act[W.eB[j]];
        if (aa > 0.02 && ab > 0.02) ht = Math.max(ht, Math.min(aa, ab) * 1.4); else a *= 1 - 0.8 * X.qDim;
      }
      if (X.qDeep > 0.001) { a *= 1 - 0.55 * X.qDeep; var sa = W.slotIdx[W.eA[j]], sb = W.slotIdx[W.eB[j]]; if (sa >= 0) a *= 1 - W.liftK[sa]; if (sb >= 0) a *= 1 - W.liftK[sb]; }
      W.eAl[j] = a; W.eGr[j] = g; W.eHt[j] = ht;
    }
    F.slideOn = X.temporal > 0.001;
  }
  function writePulse(W, F, j, src, dst, u, inten) {
    if (F.nP >= W.maxP) return;
    var P = W.pos, cv = X.curve, ax = P[src * 3], ay = P[src * 3 + 1], az = P[src * 3 + 2], bx = P[dst * 3], by = P[dst * 3 + 1], bz = P[dst * 3 + 2];
    var mx = (ax + bx) / 2 + W.ctrl[j * 3] * cv, my = (ay + by) / 2 + W.ctrl[j * 3 + 1] * cv, mz = (az + bz) / 2 + W.ctrl[j * 3 + 2] * cv, v = 1 - u, o = F.nP * 4;
    W.pulse[o] = v * v * ax + 2 * v * u * mx + u * u * bx; W.pulse[o + 1] = v * v * ay + 2 * v * u * my + u * u * by; W.pulse[o + 2] = v * v * az + 2 * v * u * mz + u * u * bz; W.pulse[o + 3] = inten;
    F.nP++;
  }
  function label(F, x, y, z, name, kind, a, num, side) { if (a > 0.01 && z > 0.06) F.labels.push({ x: x, y: y, ly: y, name: name, kind: kind, a: a, num: num, side: side || 'right' }); }
  function overlays(W, T, Q, F) {
    var s = Q.s, sq = s.Query, N = W.N, c = F.cam, i, j, q;
    var H = W.hyp;
    for (j = 0; j < H.length; j++) {
      var h = H[j], tb = h.kind === 2 ? s.Hypergraph + 6.8 : h.kind === 1 ? s.Hypergraph + 7.8 + h.order * 1.6 : s.Hypergraph + 1.0 + h.order * 5.4;
      var b = X.hulls > 0.001 ? clamp01((T - tb) / 0.9) : 0;
      W.hB[j] = b;
      if (b > 0 && b < 1) for (q = 0; q < h.m.length; q++) W.heat[h.m[q]] += 0.55 * (1 - b);
      if (h.kind === 2 && X.hl > 0.001) for (q = 0; q < h.m.length; q++) W.heat[h.m[q]] += 0.5 * X.hl;
    }
    if (X.tris > 0.001) {
      var eps = X.eps * W.epsMax * 1.06, epsW = 0.1 * W.epsMax;
      for (q = 0; q < W.triE.length; q++) W.triA[q] = clamp01((eps - W.triE[q]) / epsW);
      for (q = 0; q < W.tetE.length; q++) W.tetA[q] = clamp01((eps - W.tetE[q]) / epsW);
    }
    F.nP = 0;
    if (X.fire > 0.001) {
      for (j = 0; j < W.E; j++) {
        if (W.eAl[j] < 0.05) continue;
        var src = W.eDir[j] ? W.eA[j] : W.eB[j], dst = src === W.eA[j] ? W.eB[j] : W.eA[j];
        if (!W.fA[src]) continue;
        var pp = W.fP[src], tl = (T - W.ph[src] / 6.2832 * pp) % pp; if (tl < 0) tl += pp;
        var trv = 0.3 + W.bLen[j] * 1.5;
        if (tl < trv) writePulse(W, F, j, src, dst, tl / trv, X.fire * (1 - 0.5 * tl / trv));
      }
    }
    if (X.act > 0.001) {
      for (i = 0; i < N; i++) {
        var hp = W.qHop[i]; if (hp === 0 || hp > 5) continue;
        var pr = W.qPar[i], t0 = sq + QT.spread + W.qHop[pr] * QT.hop + W.qJit[pr], t1 = sq + QT.spread + hp * QT.hop + W.qJit[i];
        if (T < t0 || T > t1) continue;
        writePulse(W, F, W.qPE[i], pr, i, (T - t0) / Math.max(0.05, t1 - t0), X.act * 1.25 * Math.pow(0.8, hp - 1));
      }
    }
    // labels
    F.labels.length = 0;
    var ha = env(T, s.Hypergraph + 7.8, s.Hypergraph + 8.8, s.Simplicial - 0.8, s.Simplicial + 0.2);
    if (ha > 0.01) {
      var hm = H[0].m, scx = 0, top = hm[0];
      for (q = 0; q < hm.length; q++) { scx += W.sx[hm[q]] / hm.length; if (W.sy[hm[q]] < W.sy[top]) top = hm[q]; }
      for (q = 0; q < hm.length && q < 4; q++) label(F, W.sx[hm[q]], W.sy[hm[q]], W.sz[hm[q]], HYPER.members[q].name, HYPER.members[q].kind, ha, null, W.sx[hm[q]] < scx ? 'left' : 'right');
      var bot = hm[0];
      for (q = 0; q < hm.length; q++) if (W.sy[hm[q]] > W.sy[bot]) bot = hm[q];
      F.hyperTag = W.sz[bot] > 0.06 ? { x: W.sx[bot] - 40, y: W.sy[bot] + 96, a: ha * X.hl, name: HYPER.name, kind: HYPER.kind } : null;
    } else F.hyperTag = null;
    var la = env(T, s.Multiplex + 5.2, s.Multiplex + 6.2, s.Tesseract - 0.4, s.Tesseract + 0.6);
    if (la > 0.01) for (var l = 0; l < 3; l++) {
      var bx = 1e9, by = 0, bz = 0;
      for (q = 0; q < 48; q++) { var an = q / 48 * 6.2832; if (proj(c, Math.cos(an) * 1.32, LY[l], Math.sin(an) * 1.32) && PR.x < bx) { bx = PR.x; by = PR.y; bz = PR.z; } }
      if (bx < 1e9) label(F, bx, by, bz, LAYERS[l].name, LAYERS[l].kind, la, null, 'left');
    }
    var seedA = env(T, sq + 6.0, sq + 6.8, sq + QT.lift0 - 0.2, sq + QT.lift0 + 0.4);
    for (q = 0; q < 2; q++) { var sn = W.slots[q]; label(F, W.sx[sn], W.sy[sn], W.sz[sn], QUERY.slots[q].name, QUERY.slots[q].kind, seedA); }
    F.q.slots.length = 0;
    for (q = 0; q < 10; q++) {
      var nq = W.slots[q], S = QUERY.slots[q], sa = env(T, sq + QT.lab0 + S.col * 0.3, sq + QT.lab0 + S.col * 0.3 + 0.7, s.Coda, s.Coda + 0.8);
      label(F, W.sx[nq], W.sy[nq], W.sz[nq], S.name, S.kind, sa, String(q + 1));
      F.q.slots.push({ x: W.sx[nq], y: W.sy[nq], ok: W.sz[nq] > 0.06 });
    }
    // HUD state
    var key = SECTIONS[F.si], tt = key === 'Coda' ? null : TITLES[key], ti = F.title;
    ti.key = tt ? key : null;
    if (tt) {
      var tEnd = key === 'Query' ? sq + QT.titleOut + 0.7 : Q.e[key] - 0.1;
      ti.a = env(T, s[key] + 0.35, s[key] + 1.1, tEnd - 0.6, tEnd); ti.dy = (1 - M.enter((T - (s[key] + 0.35)) / 0.75)) * 16;
      ti.n = tt.n; ti.label = tt.label; ti.cap = tt.cap;
    } else ti.a = 0;
    if (ti.a > 0.01) { var minY = 0.36 * F.h; for (q = 0; q < F.labels.length; q++) { var Lq = F.labels[q]; if (Lq.side === 'right' && Lq.x < 0.52 * F.w && Lq.ly < minY) Lq.ly = minY; } if (F.hyperTag && F.hyperTag.y < minY) F.hyperTag.y = minY; }
    var Qs = F.q;
    Qs.bar = env(T, sq + QT.bar0, sq + QT.bar1, s.Coda, s.Coda + 0.9);
    Qs.chars = Math.round(clamp01((T - (sq + QT.type0)) / (QT.type1 - QT.type0)) * QUERY.text.length);
    Qs.caret = T > sq + QT.bar1 - 0.2 && T < sq + QT.chips1 && (T < sq + QT.type1 || Math.floor(T * 2.4) % 2 === 0);
    Qs.chips = ramp(T, sq + QT.chips0, sq + QT.chips1);
    Qs.up = ramp(T, sq + QT.up0, sq + QT.up1);
    Qs.card = env(T, sq + QT.card0, sq + QT.card1, s.Coda, s.Coda + 0.9);
    for (q = 0; q < 4; q++) Qs.lines[q] = clamp01((T - (sq + QT.line0 + q * QT.lineGap)) / QT.lineDur) * Qs.card;
    Qs.beam = X.beam;
    F.ruler.a = X.ruler; F.ruler.g = X.g;
    for (q = 0; q < 3; q++) F.end[q] = env(T, s.Coda + 3.2 + q * 1.2, s.Coda + 4.0 + q * 1.2, Q.total - 1.7, Q.total - 0.6);
    F.fade = Math.max(1 - ramp(T, 0, 1.4), ramp(T, Q.total - 1.5, Q.total - 0.05));
  }
  function evaluate(W, T, Q, o) {
    o = o || {};
    var F = W.F, si = 0, i;
    F.T = T; F.w = o.width || 1920; F.h = o.height || 1080; F.dof = o.dof !== false; F.glow = o.glow == null ? 1 : +o.glow;
    for (i = 0; i < SECTIONS.length; i++) if (T >= Q.s[SECTIONS[i]] - 1e-6) si = i;
    F.si = si; F.section = SECTIONS[si];
    weights(T, Q); F.wt = X;
    setCam(F, o.camera || filmCam(W, T, Q), F.w, F.h);
    W.liftK.fill(0);
    positions(W, T, Q, F);
    projectNodes(W, F);
    attributes(W, T, Q);
    edgeState(W, T, Q, F);
    overlays(W, T, Q, F);
    return F;
  }

  // ── rendering ───────────────────────────────────────────────────────────
  function hull2(xs, ys, n) {
    var id = [], i;
    for (i = 0; i < n; i++) id.push(i);
    if (n <= 2) return id;
    id.sort(function (a, b) { return xs[a] - xs[b] || ys[a] - ys[b]; });
    var H = [], cr = function (o, a, b) { return (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]); };
    for (i = 0; i < n; i++) { while (H.length >= 2 && cr(H[H.length - 2], H[H.length - 1], id[i]) <= 0) H.pop(); H.push(id[i]); }
    var lo = H.length + 1;
    for (i = n - 2; i >= 0; i--) { while (H.length >= lo && cr(H[H.length - 2], H[H.length - 1], id[i]) <= 0) H.pop(); H.push(id[i]); }
    H.pop(); return H;
  }
  function hullPath(ctx, xs, ys, H, pad) {
    var n = H.length, i, a, b;
    if (n === 1) { ctx.moveTo(xs[H[0]] + pad, ys[H[0]]); ctx.arc(xs[H[0]], ys[H[0]], pad, 0, 6.2832); return; }
    var area = 0, ang = [];
    for (i = 0; i < n; i++) { a = H[i]; b = H[(i + 1) % n]; area += xs[a] * ys[b] - xs[b] * ys[a]; }
    var sg = area >= 0 ? 1 : -1;
    for (i = 0; i < n; i++) { a = H[i]; b = H[(i + 1) % n]; ang.push(Math.atan2(-(xs[b] - xs[a]) * sg, (ys[b] - ys[a]) * sg)); }
    ctx.moveTo(xs[H[0]] + pad * Math.cos(ang[n - 1]), ys[H[0]] + pad * Math.sin(ang[n - 1]));
    for (i = 0; i < n; i++) ctx.arc(xs[H[i]], ys[H[i]], pad, ang[(i + n - 1) % n], ang[i], sg < 0);
    ctx.closePath();
  }
  // Points and lines go through a typed-array raster (fast on software canvases);
  // only fills (planes, membranes, simplices) use canvas 2D.
  var LG = new Float32Array(256), LS = new Float32Array(256), LH = new Float32Array(256), TONE = new Uint8Array(1024);
  (function () {
    for (var i = 0; i < 256; i++) { var t = i / 255; LG[i] = 0.9 * Math.exp(-t * 26) + 0.22 * (1 - t) * (1 - t); LS[i] = t < 0.72 ? 0.5 : 0.5 * (1 - t) / 0.28; LH[i] = 0.6 * (1 - t) * (1 - t); }
    var nrm = 1 - Math.exp(-2.2);
    for (i = 0; i < 1024; i++) TONE[i] = Math.min(255, Math.round(255 * (1 - Math.exp(-1.1 * i / 512)) / nrm));
  })();
  var RS = { w: 0, h: 0 };
  function rsSize(w, h) {
    if (RS.w === w && RS.h === h) return;
    RS.w = w; RS.h = h; RS.buf = new Float32Array(w * h * 3);
    RS.cv = document.createElement('canvas'); RS.cv.width = w; RS.cv.height = h; RS.cx = RS.cv.getContext('2d');
    RS.img = RS.cx.createImageData(w, h); RS.u32 = new Uint32Array(RS.img.data.buffer);
  }
  function pt(x, y, rad, c, a, L) {
    if (a < 0.002) return;
    if (rad < 1.1) rad = 1.1;
    var w = RS.w, h = RS.h, x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(w - 1, Math.floor(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(h - 1, Math.floor(y + rad));
    if (x0 > x1 || y0 > y1) return;
    var inv = 255 / (rad * rad), buf = RS.buf, cr = c[0] * a, cg = c[1] * a, cb = c[2] * a;
    for (var py = y0; py <= y1; py++) {
      var dy = py + 0.5 - y, dy2 = dy * dy, row = py * w;
      for (var px = x0; px <= x1; px++) {
        var dx = px + 0.5 - x, t = (dx * dx + dy2) * inv;
        if (t >= 255) continue;
        var v = L[t | 0], o = (row + px) * 3;
        buf[o] += cr * v; buf[o + 1] += cg * v; buf[o + 2] += cb * v;
      }
    }
  }
  function ln(x0, y0, x1, y1, c, a) {
    if (a < 0.002) return;
    var w = RS.w, h = RS.h;
    if ((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 >= w && x1 >= w) || (y0 >= h && y1 >= h)) return;
    var dx = x1 - x0, dy = y1 - y0, buf = RS.buf, t, o, f, gr, s, cr, cg, cb;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) < 0.5) return;
      if (dx < 0) { t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; dx = -dx; dy = -dy; }
      gr = dy / dx; s = a * Math.sqrt(1 + gr * gr); cr = c[0] * s; cg = c[1] * s; cb = c[2] * s;
      var xs = Math.max(0, Math.ceil(x0 - 0.5)), xe = Math.min(w - 1, Math.floor(x1 - 0.5)), yy = y0 + gr * (xs + 0.5 - x0) - 0.5;
      for (var x = xs; x <= xe; x++, yy += gr) {
        var yi = Math.floor(yy); f = yy - yi;
        if (yi >= 0 && yi < h) { o = (yi * w + x) * 3; t = 1 - f; buf[o] += cr * t; buf[o + 1] += cg * t; buf[o + 2] += cb * t; }
        if (yi + 1 >= 0 && yi + 1 < h) { o = ((yi + 1) * w + x) * 3; buf[o] += cr * f; buf[o + 1] += cg * f; buf[o + 2] += cb * f; }
      }
    } else {
      if (dy < 0) { t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; dx = -dx; dy = -dy; }
      gr = dx / dy; s = a * Math.sqrt(1 + gr * gr); cr = c[0] * s; cg = c[1] * s; cb = c[2] * s;
      var ys = Math.max(0, Math.ceil(y0 - 0.5)), ye = Math.min(h - 1, Math.floor(y1 - 0.5)), xx = x0 + gr * (ys + 0.5 - y0) - 0.5;
      for (var y = ys; y <= ye; y++, xx += gr) {
        var xi = Math.floor(xx); f = xx - xi;
        if (xi >= 0 && xi < w) { o = (y * w + xi) * 3; t = 1 - f; buf[o] += cr * t; buf[o + 1] += cg * t; buf[o + 2] += cb * t; }
        if (xi + 1 >= 0 && xi + 1 < w) { o = (y * w + xi + 1) * 3; buf[o] += cr * f; buf[o + 1] += cg * f; buf[o + 2] += cb * f; }
      }
    }
  }
  function qd(x0, y0, cx, cy, x1, y1, c, a) {
    var px = x0, py = y0;
    for (var q = 1; q <= 5; q++) { var t = q / 5, u = 1 - t, qx = u * u * x0 + 2 * u * t * cx + t * t * x1, qy = u * u * y0 + 2 * u * t * cy + t * t * y1; ln(px, py, qx, qy, c, a); px = qx; py = qy; }
  }
  function rsFlush(ctx) {
    var buf = RS.buf, u = RS.u32, n = RS.w * RS.h;
    for (var i = 0, o = 0; i < n; i++, o += 3) {
      var r = buf[o], g = buf[o + 1], b = buf[o + 2];
      if (r + g + b < 0.003) { u[i] = 0; continue; }
      u[i] = 0xff000000 | (TONE[b >= 2 ? 1023 : (b * 512) | 0] << 16) | (TONE[g >= 2 ? 1023 : (g * 512) | 0] << 8) | TONE[r >= 2 ? 1023 : (r * 512) | 0];
    }
    RS.cx.putImageData(RS.img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.drawImage(RS.cv, 0, 0);
  }
  function f3(c) { var v = rgbOf(c); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
  function cols(pal) {
    if (pal.c) return pal.c;
    var t = pal.t;
    pal.c = { edge: f3(t.n[500]), hot: f3(t.a[300]), arc: f3(t.a[400]), line: f3(t.a[400]), ring: f3(t.n[500]), dust: f3(t.n[400]), hot1: f3(t.a[100]), halo: f3(t.a[400]), ball: f3(t.a[600]), hotLine: f3(t.a[200]), n3: f3(t.n[300]), a3: f3(t.a[300]), a5: f3(t.a[500]), tmp: [0, 0, 0] };
    return pal.c;
  }
  function tintInto(C, tn, out) {
    var A = tn < 0.5 ? C.n3 : C.a3, B = tn < 0.5 ? C.a3 : C.a5, u = tn < 0.5 ? tn * 2 : tn * 2 - 1;
    out[0] = A[0] + (B[0] - A[0]) * u; out[1] = A[1] + (B[1] - A[1]) * u; out[2] = A[2] + (B[2] - A[2]) * u; return out;
  }
  function bgImage(pal, w, h) {
    var key = w + 'x' + h; if (pal._bgKey === key) return pal._bg;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'), t = pal.t;
    x.fillStyle = t.bg; x.fillRect(0, 0, w, h);
    var lg = x.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, rgba(t.surface, 0.32)); lg.addColorStop(0.6, rgba(t.surface, 0)); x.fillStyle = lg; x.fillRect(0, 0, w, h);
    var vg = x.createRadialGradient(w / 2, h / 2, Math.max(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); x.fillStyle = vg; x.fillRect(0, 0, w, h);
    if (!pal.neb) {
      var nb = document.createElement('canvas'); nb.width = nb.height = 256;
      var nx = nb.getContext('2d'), g = nx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, rgba(t.sectionGlow, 0.24)); g.addColorStop(0.45, rgba(t.a[900], 0.16)); g.addColorStop(1, rgba(t.a[900], 0));
      nx.fillStyle = g; nx.fillRect(0, 0, 256, 256); pal.neb = nb;
    }
    pal._bg = c; pal._bgKey = key; return c;
  }
  function drawPlanes(ctx, W, F, pal) {
    var c = F.cam, a = F.wt.planes;
    for (var l = 0; l < 3; l++) {
      ctx.beginPath(); var ok = true;
      for (var k = 0; k <= 64; k++) { var an = k / 64 * 6.2832; if (!proj(c, Math.cos(an) * 1.32, LY[l], Math.sin(an) * 1.32)) { ok = false; break; } if (k) ctx.lineTo(PR.x, PR.y); else ctx.moveTo(PR.x, PR.y); }
      if (!ok) continue;
      ctx.closePath(); ctx.globalAlpha = 0.2 * a; ctx.fillStyle = pal.planeFill; ctx.fill();
      ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = pal.planeLine; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  function drawHulls(ctx, W, F, pal) {
    var H = W.hyp, X2 = F.wt, c = F.cam, xs = [], ys = [];
    ctx.lineJoin = 'round';
    for (var j = 0; j < H.length; j++) {
      var b = W.hB[j]; if (b <= 0) continue;
      var m = H[j].m, n = 0, zs = 0;
      xs.length = 0; ys.length = 0;
      for (var q = 0; q < m.length; q++) { var v = m[q]; if (W.sz[v] <= 0.06) continue; xs.push(W.sx[v]); ys.push(W.sy[v]); zs += W.sz[v]; n++; }
      if (!n) continue;
      var Hh = hull2(xs, ys, n), zav = zs / n, kind = H[j].kind, hl = X2.hl;
      var pad = (0.022 + 0.004 * m.length) * c.fp / zav * M.pop(b), fg = fog(zav, Math.max(1.6, c.focus));
      var aF = X2.hulls * fg * (kind === 2 ? 0.14 + 0.16 * hl : 0.14 * (1 - 0.55 * hl)) * (kind === 1 ? 0.6 : 1);
      var aS = X2.hulls * fg * (kind === 2 ? 0.5 + 0.45 * hl : 0.46 * (1 - 0.5 * hl));
      ctx.beginPath(); hullPath(ctx, xs, ys, Hh, pad);
      ctx.globalAlpha = aF; ctx.fillStyle = pal.hullFill; ctx.fill();
      ctx.globalAlpha = aS; ctx.strokeStyle = pal.hullLine; ctx.lineWidth = kind === 2 ? 1.8 : 1.1; ctx.stroke();
    }
  }
  function drawSimplices(ctx, W, F, pal) {
    var a = F.wt.tris, sx = W.sx, sy = W.sy, sz = W.sz, tr = W.tris, te = W.tets, NB = 6, b, q, lo, hi, any;
    for (b = 1; b <= NB; b++) {
      lo = (b - 1) / NB; hi = b / NB; any = false; ctx.beginPath();
      for (q = 0; q < W.triA.length; q++) {
        var v = W.triA[q]; if (v <= lo || v > hi) continue;
        var i0 = tr[q * 3], i1 = tr[q * 3 + 1], i2 = tr[q * 3 + 2];
        if (sz[i0] <= 0.06 || sz[i1] <= 0.06 || sz[i2] <= 0.06) continue;
        ctx.moveTo(sx[i0], sy[i0]); ctx.lineTo(sx[i1], sy[i1]); ctx.lineTo(sx[i2], sy[i2]); ctx.closePath(); any = true;
      }
      if (any) { ctx.globalAlpha = 0.24 * a * hi; ctx.fillStyle = pal.triFill; ctx.fill(); }
      any = false; ctx.beginPath();
      for (q = 0; q < W.tetA.length; q++) {
        var u = W.tetA[q]; if (u <= lo || u > hi) continue;
        var v0 = te[q * 4], v1 = te[q * 4 + 1], v2 = te[q * 4 + 2], v3 = te[q * 4 + 3];
        if (sz[v0] <= 0.06 || sz[v1] <= 0.06 || sz[v2] <= 0.06 || sz[v3] <= 0.06) continue;
        ctx.moveTo(sx[v0], sy[v0]); ctx.lineTo(sx[v1], sy[v1]); ctx.lineTo(sx[v2], sy[v2]); ctx.closePath();
        ctx.moveTo(sx[v0], sy[v0]); ctx.lineTo(sx[v1], sy[v1]); ctx.lineTo(sx[v3], sy[v3]); ctx.closePath();
        ctx.moveTo(sx[v1], sy[v1]); ctx.lineTo(sx[v2], sy[v2]); ctx.lineTo(sx[v3], sy[v3]); ctx.closePath(); any = true;
      }
      if (any) { ctx.globalAlpha = 0.34 * a * hi; ctx.fillStyle = pal.tetFill; ctx.fill(); }
    }
  }
  function rBalls(W, F, pal, k) {
    var c = F.cam, rw = F.wt.eps * W.epsMax * 1.06 * 0.5, a = F.wt.balls, C = cols(pal);
    for (var i = 0; i < W.N; i++) {
      var z = W.sz[i]; if (z <= 0.06) continue;
      var R = rw * c.fp / z * 1.25 * k; if (R < 0.8) continue;
      pt(W.sx[i] * k, W.sy[i] * k, R, C.ball, 0.07 * a * fog(z, Math.max(1.6, c.focus)), LH);
    }
  }
  function rDust(W, F, pal, k) {
    var c = F.cam, D = W.dust, n = D.length / 3, C = cols(pal);
    for (var q = 0; q < n; q++) {
      if (!proj(c, D[q * 3], D[q * 3 + 1], D[q * 3 + 2]) || PR.z < 0.15) continue;
      pt(PR.x * k, PR.y * k, Math.min(3, Math.max(1.1, 2.0 / PR.z)) * k + 0.5, C.dust, W.dustA[q] * Math.min(1, 1.6 / PR.z + 0.2) * 0.45, LG);
    }
  }
  function rArcs(W, F, pal, k) {
    var c = F.cam, P = W.pos, A = W.arcA, B = W.arcB, K = 18, a = F.wt.arcs, cd = Math.hypot(c.px, c.py, c.pz), C = cols(pal);
    for (var j = 0; j < A.length; j++) {
      var ia = A[j], ib = B[j], ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2], bx = P[ib * 3], by = P[ib * 3 + 1], bz = P[ib * 3 + 2];
      var ra = Math.hypot(ax, ay, az) || 1, rb = Math.hypot(bx, by, bz) || 1;
      ax /= ra; ay /= ra; az /= ra; bx /= rb; by /= rb; bz /= rb;
      var om = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))), so = Math.sin(om);
      if (om < 0.03 || so < 1e-4) continue;
      var back = (((ax + bx) / 2 - c.px) * c.fx + ((ay + by) / 2 - c.py) * c.fy + ((az + bz) / 2 - c.pz) * c.fz) > cd;
      var al = a * (back ? 0.16 : 0.42), lift = 0.05 + 0.18 * om / Math.PI, pen = false, lx = 0, ly = 0;
      for (var q = 0; q <= K; q++) {
        var t = q / K, wa = Math.sin((1 - t) * om) / so, wb = Math.sin(t * om) / so, rr2 = lerp(ra, rb, t) * (1 + lift * Math.sin(Math.PI * t));
        if (!proj(c, (ax * wa + bx * wb) * rr2, (ay * wa + by * wb) * rr2, (az * wa + bz * wb) * rr2)) { pen = false; continue; }
        if (pen) ln(lx, ly, PR.x * k, PR.y * k, C.arc, al);
        lx = PR.x * k; ly = PR.y * k; pen = true;
      }
    }
  }
  function rEdges(W, F, pal, k) {
    var E = W.E, c = F.cam, P = W.pos, curve = F.wt.curve, slide = F.slideOn, ref = Math.max(1.6, c.focus), C = cols(pal), col = C.tmp;
    for (var j = 0; j < E; j++) {
      var a = W.eAl[j]; if (a < 0.006) continue;
      var ia = W.eA[j], ib = W.eB[j], za = W.sz[ia], zb = W.sz[ib];
      if (za <= 0.06 || zb <= 0.06) continue;
      a *= fog((za + zb) * 0.5, ref) * Math.sqrt(W.alpha[ia] * W.alpha[ib]);
      var ht = W.eHt[j], cc = C.edge;
      if (ht > 0.12) { a = Math.min(1, a + ht * 0.5) * 1.4; cc = C.hot; }
      if (a < 0.006) continue;
      var g = W.eGr[j], x1 = W.sx[ia] * k, y1 = W.sy[ia] * k, x2 = W.sx[ib] * k, y2 = W.sy[ib] * k, bx = P[ib * 3], by = P[ib * 3 + 1], bz = P[ib * 3 + 2];
      if (slide && W.eAlt[j] >= 0) {
        var al = W.eAlt[j], t = W.eSl[j];
        bx = lerp(P[al * 3], bx, t); by = lerp(P[al * 3 + 1], by, t); bz = lerp(P[al * 3 + 2], bz, t);
        if (!proj(c, bx, by, bz)) continue; x2 = PR.x * k; y2 = PR.y * k;
      }
      if (curve > 0.01 && proj(c, (P[ia * 3] + bx) * 0.5 + W.ctrl[j * 3] * curve, (P[ia * 3 + 1] + by) * 0.5 + W.ctrl[j * 3 + 1] * curve, (P[ia * 3 + 2] + bz) * 0.5 + W.ctrl[j * 3 + 2] * curve)) {
        var qx = PR.x * k, qy = PR.y * k;
        if (g >= 0.999) qd(x1, y1, qx, qy, x2, y2, cc, a);
        else { var v = 1 - g; qd(x1, y1, x1 + (qx - x1) * g, y1 + (qy - y1) * g, v * v * x1 + 2 * v * g * qx + g * g * x2, v * v * y1 + 2 * v * g * qy + g * g * y2, cc, a); }
      } else ln(x1, y1, x1 + (x2 - x1) * g, y1 + (y2 - y1) * g, cc, a);
    }
  }
  function rLayers(W, F, pal, k) {
    var c = F.cam, P = W.pos, N = W.N, X2 = F.wt, C = cols(pal), col = C.tmp, l, i, q;
    for (l = 0; l < 3; l++) for (i = 0; i < N; i++) {
      var kk = l * N + i;
      if (proj(c, P[i * 3], P[i * 3 + 1] + LY[l] - LY[W.layer[i]], P[i * 3 + 2])) { W.lsx[kk] = PR.x * k; W.lsy[kk] = PR.y * k; W.lsz[kk] = PR.z; } else W.lsz[kk] = -1;
    }
    for (l = 0; l < 3; l++) {
      var la = M.draw((X2.lt - l * 0.8) / 1.6) * X2.layerOut * 0.4; if (la < 0.003) continue;
      var L = W.lP[l], cc = l === 1 ? C.line : C.edge;
      for (q = 0; q < L.length; q += 2) { var a = l * N + L[q], b = l * N + L[q + 1]; if (W.lsz[a] <= 0.06 || W.lsz[b] <= 0.06) continue; ln(W.lsx[a], W.lsy[a], W.lsx[b], W.lsy[b], cc, la); }
    }
    if (X2.couplings > 0.003) for (q = 0; q < W.coup.length; q++) { i = W.coup[q]; if (W.lsz[i] <= 0.06 || W.lsz[2 * N + i] <= 0.06) continue; ln(W.lsx[i], W.lsy[i], W.lsx[2 * N + i], W.lsy[2 * N + i], C.line, 0.2 * X2.couplings); }
    if (X2.replicas > 0.003) for (l = 0; l < 3; l++) for (i = 0; i < N; i++) {
      if (W.layer[i] === l) continue;
      var k2 = l * N + i, z = W.lsz[k2]; if (z <= 0.06) continue;
      pt(W.lsx[k2], W.lsy[k2], Math.max(2.4, W.size[i] * c.fp / z * 3.4) * k, tintInto(C, clamp01(W.tint[i]), col), 0.62 * X2.replicas * fog(z, Math.max(1.6, c.focus)), LG);
    }
  }
  function rTree(W, F, pal, k) {
    var c = F.cam, P = W.pos, o = [0, 0, 0], v = [0, 0, 0], a = F.wt.tree, C = cols(pal), xa = [0, 0, 0], xb = [0, 0, 0];
    var cl = function (i, out) { var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], l = Math.hypot(x, y, z); if (l > 0.995) { x *= 0.995 / l; y *= 0.995 / l; z *= 0.995 / l; } out[0] = x; out[1] = y; out[2] = z; };
    for (var d = 1; d < W.byDep.length; d++) {
      var L = W.byDep[d], al = a * Math.max(0.12, 0.52 - 0.07 * d), cc = d <= 2 ? C.line : C.edge;
      for (var q = 0; q < L.length; q++) {
        var i = L[q], p = W.tPar[i]; if (W.sz[i] <= 0.06 && W.sz[p] <= 0.06) continue;
        cl(p, xa); cl(i, xb); mob(-xa[0], -xa[1], -xa[2], xb[0], xb[1], xb[2], v);
        var nv = Math.min(0.999999, Math.hypot(v[0], v[1], v[2])), at = 0.5 * Math.log((1 + nv) / (1 - nv)), pen = false, lx = 0, ly = 0;
        for (var s = 0; s <= 6; s++) {
          var t = s / 6, sc = nv < 1e-6 ? 0 : Math.tanh(t * at) / nv;
          mob(xa[0], xa[1], xa[2], v[0] * sc, v[1] * sc, v[2] * sc, o);
          if (!proj(c, o[0], o[1], o[2])) { pen = false; continue; }
          if (pen) ln(lx, ly, PR.x * k, PR.y * k, cc, al);
          lx = PR.x * k; ly = PR.y * k; pen = true;
        }
      }
    }
  }
  function rSkeleton(W, F, pal, k) {
    var c = F.cam, V = W.skel, a = F.wt.skel, sx = [], sy = [], ok = [], C = cols(pal);
    for (var v = 0; v < 16; v++) { ok[v] = proj(c, V[v * 3], V[v * 3 + 1], V[v * 3 + 2]); sx[v] = PR.x * k; sy[v] = PR.y * k; if (ok[v]) pt(sx[v], sy[v], 0.09 * c.fp / PR.z * k, C.halo, 0.3 * a, LH); }
    for (v = 0; v < 16; v++) for (var bit = 0; bit < 4; bit++) { var b = v ^ (1 << bit); if (b < v || !ok[v] || !ok[b]) continue; ln(sx[v], sy[v], sx[b], sy[b], C.line, 0.62 * a); }
  }
  function rRings(W, F, pal, k) {
    var c = F.cam, a = F.wt.rings, C = cols(pal), cd = Math.hypot(c.px, c.py, c.pz) || 3, ox = -c.px / cd, oy = -c.py / cd, oz = -c.pz / cd, rr2 = Math.sqrt(Math.max(0, 1 - 1 / (cd * cd))), off = 1 / cd;
    for (var r = 0; r < 4; r++) {
      var pen = false, lx = 0, ly = 0, al = a * (r === 3 ? 0.42 : 0.16);
      for (var q = 0; q <= 96; q++) {
        var an = q / 96 * 6.2832, cs = Math.cos(an), sn = Math.sin(an), x, y, z;
        if (r === 0) { x = cs; y = sn; z = 0; } else if (r === 1) { x = 0; y = cs; z = sn; } else if (r === 2) { x = cs; y = 0; z = sn; }
        else { x = -ox * off + (c.rx * cs + c.ux * sn) * rr2; y = -oy * off + c.uy * sn * rr2; z = -oz * off + (c.rz * cs + c.uz * sn) * rr2; }
        if (!proj(c, x, y, z)) { pen = false; continue; }
        if (pen) ln(lx, ly, PR.x * k, PR.y * k, C.ring, al);
        lx = PR.x * k; ly = PR.y * k; pen = true;
      }
    }
  }
  function rDendrites(W, F, pal, k) {
    var c = F.cam, P = W.pos, D = W.dend, a = 0.14 * F.wt.dend, C = cols(pal);
    for (var i = 0; i < W.N; i++) {
      if (W.sz[i] <= 0.06 || W.sz[i] > 3.4 || W.alpha[i] < 0.3 || W.isSlot[i]) continue;
      var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], sx = W.sx[i] * k, sy = W.sy[i] * k;
      for (var q = 0; q < 2; q++) {
        var o = i * 18 + q * 9;
        if (!proj(c, x + D[o], y + D[o + 1], z + D[o + 2])) continue;
        var mx = PR.x * k, my = PR.y * k; ln(sx, sy, mx, my, C.edge, a);
        if (proj(c, x + D[o + 3], y + D[o + 4], z + D[o + 5])) ln(mx, my, PR.x * k, PR.y * k, C.edge, a);
        if (proj(c, x + D[o + 6], y + D[o + 7], z + D[o + 8])) ln(mx, my, PR.x * k, PR.y * k, C.edge, a);
      }
    }
  }
  function rTrails(W, F, pal, k) {
    var C = cols(pal), a = 0.5 * F.wt.temporal;
    for (var i = 0; i < W.N; i++) {
      var b = W.born[i], p = W.parent[i];
      if (b <= 0.02 || b >= 0.98 || p < 0 || W.sz[i] <= 0.06 || W.sz[p] <= 0.06) continue;
      ln(W.sx[p] * k, W.sy[p] * k, W.sx[i] * k, W.sy[i] * k, C.hotLine, a);
    }
  }
  function rLifted(W, F, pal, k) {
    var L = QUERY.links, sl = W.slots, C = cols(pal);
    for (var q = 0; q < L.length; q++) {
      var a = sl[L[q][0]], b = sl[L[q][1]], kk = Math.min(W.liftK[L[q][0]], W.liftK[L[q][1]]);
      if (kk < 0.02 || W.sz[a] <= 0.06 || W.sz[b] <= 0.06) continue;
      var x1 = W.sx[a] * k, y1 = W.sy[a] * k, x2 = W.sx[b] * k, y2 = W.sy[b] * k, dx = x2 - x1, dy = y2 - y1, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl * 0.6, ny = dx / dl * 0.6;
      ln(x1 + nx, y1 + ny, x2 + nx, y2 + ny, C.hot, 0.8 * kk); ln(x1 - nx, y1 - ny, x2 - nx, y2 - ny, C.hot, 0.8 * kk);
    }
  }
  function rBeams(W, F, pal, k, anchors) {
    var C = cols(pal);
    for (var q = 0; q < 2 && q < anchors.length; q++) {
      var p = M.enter((F.wt.beam - q * 0.12) / 0.88), n = W.slots[q];
      if (p <= 0 || W.sz[n] <= 0.06) continue;
      var ax = anchors[q].x * k, ay = anchors[q].y * k, hx = lerp(ax, W.sx[n] * k, p), hy = lerp(ay, W.sy[n] * k, p), al = Math.min(1, F.wt.beam * 1.4);
      for (var s = 0; s < 14; s++) { var t0 = s / 14, t1 = (s + 1) / 14; ln(lerp(ax, hx, t0), lerp(ay, hy, t0), lerp(ax, hx, t1), lerp(ay, hy, t1), C.hotLine, al * t1 * 1.3); }
      pt(hx, hy, 18 * k, C.hot1, al, LG);
    }
  }
  function rPulses(W, F, pal, k) {
    var c = F.cam, B = W.pulse, C = cols(pal);
    for (var p = 0; p < F.nP; p++) {
      if (!proj(c, B[p * 4], B[p * 4 + 1], B[p * 4 + 2]) || PR.z < 0.08) continue;
      var it = B[p * 4 + 3];
      pt(PR.x * k, PR.y * k, Math.min(60, (0.012 + 0.008 * it) * c.fp / PR.z * 3.2) * k, C.hot1, Math.min(1, it) * fog(PR.z, Math.max(1.6, c.focus)), LG);
    }
  }
  function rNodes(W, F, pal, k) {
    var c = F.cam, zf = Math.max(1.2, c.focus), ref = Math.max(1.6, c.focus), A = F.dof ? 0.006 * c.fp : 0, glow = F.glow, w = F.w, h = F.h, base = 0.55 + 0.2 * glow, C = cols(pal), col = C.tmp;
    for (var i = 0; i < W.N; i++) {
      var z = W.sz[i]; if (z <= 0.06) continue;
      var s = W.size[i]; if (s <= 1e-5) continue;
      var fg = fog(z, ref) * clamp01((z - 0.06) / 0.25), a = W.alpha[i] * fg * base; if (a < 0.004) continue;
      var R = Math.max(2.4, s * c.fp / z * 3.4), coc = A * Math.abs(1 / z - 1 / zf), b = 0, R2 = R;
      if (coc > 1.2) { R2 = Math.min(70, Math.sqrt(R * R + coc * coc * 4)); a *= Math.pow(R / R2, 1.15); b = clamp01((coc - 1.2) / 5); }
      if (R2 > 40) a *= 40 / R2;
      var x = W.sx[i], y = W.sy[i];
      if (x < -R2 * 3 || x > w + R2 * 3 || y < -R2 * 3 || y > h + R2 * 3) continue;
      tintInto(C, clamp01(W.tint[i]), col);
      x *= k; y *= k;
      if (b < 1) pt(x, y, R2 * k, col, Math.min(1, a * (1 - b)), LG);
      if (b > 0) pt(x, y, R2 * k, col, Math.min(1, a * b * 0.6), LS);
      var ht = W.heat[i];
      if (ht > 0.02) {
        var hh = Math.min(ht, 1.6);
        pt(x, y, Math.min(90, R2 * (2 + hh)) * k, C.halo, Math.min(1, hh * 0.22 * glow * fg), LH);
        pt(x, y, R2 * 1.1 * k, C.hot1, Math.min(1, hh * 0.65 * fg), LG);
      }
    }
  }
  function render(ctx, W, F, o) {
    var pal = palette(); if (!pal) return false;
    o = o || {};
    var X2 = F.wt, k = o.scale || 1, iw = Math.max(2, Math.round(F.w * k)), ih = Math.max(2, Math.round(F.h * k)), c = F.cam;
    rsSize(iw, ih); RS.buf.fill(0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(bgImage(pal, iw, ih), 0, 0);
    if (proj(c, 0, 0, 0)) {
      var NR = Math.min(2.2 * F.h, 1.7 * c.fp / Math.max(PR.z, 0.3)) * k;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, F.glow); ctx.drawImage(pal.neb, PR.x * k - NR, PR.y * k - NR, NR * 2, NR * 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (X2.planes > 0.002) drawPlanes(ctx, W, F, pal);
    ctx.globalCompositeOperation = 'lighter';
    if (X2.hulls > 0.002) drawHulls(ctx, W, F, pal);
    if (X2.tris > 0.002) drawSimplices(ctx, W, F, pal);
    rDust(W, F, pal, k);
    if (X2.balls > 0.002) rBalls(W, F, pal, k);
    if (X2.arcs > 0.002) rArcs(W, F, pal, k);
    rEdges(W, F, pal, k);
    if (X2.replicas > 0.002 || X2.couplings > 0.002 || (X2.lt > 0 && X2.layerOut > 0.002)) rLayers(W, F, pal, k);
    if (X2.tree > 0.002) rTree(W, F, pal, k);
    if (X2.skel > 0.002) rSkeleton(W, F, pal, k);
    if (X2.rings > 0.002) rRings(W, F, pal, k);
    if (X2.dend > 0.002) rDendrites(W, F, pal, k);
    if (X2.tOn && X2.growing) rTrails(W, F, pal, k);
    rLifted(W, F, pal, k);
    if (X2.beam > 0.002 && o.anchors) rBeams(W, F, pal, k, o.anchors);
    rPulses(W, F, pal, k);
    rNodes(W, F, pal, k);
    rsFlush(ctx);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }

  // ── compact canvas HUD for the viewer (the film draws its HUD in DOM) ──
  var _m = null;
  function mctx() { if (!_m) _m = document.createElement('canvas').getContext('2d'); return _m; }
  function hudLayout(w, h) {
    var m = mctx(), bar = { x: 16, y: h - 58, w: Math.min(520, w - 32), h: 42 };
    m.font = '400 15px Inter, system-ui, sans-serif';
    var tx = bar.x + 40, anchors = QUERY.chips.map(function (word) { var i = QUERY.text.indexOf(word); return { x: tx + m.measureText(QUERY.text.slice(0, i)).width + m.measureText(word).width / 2, y: bar.y + 6 }; });
    var cw = Math.min(330, w * 0.34);
    return { bar: bar, textX: tx, anchors: anchors, card: { x: w - 16 - cw, y: Math.max(96, h * 0.3), w: cw, row: 28 } };
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawHUD(ctx, W, F, o) {
    var pal = palette(); if (!pal) return;
    o = o || {};
    var t = pal.t, dpr = o.dpr || 1, L = hudLayout(F.w, F.h), f = function (sz, wt) { return (wt || 400) + ' ' + sz + 'px Inter, system-ui, sans-serif'; };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'middle';
    if (o.labels !== false) {
      var all = F.labels.slice();
      if (F.hyperTag && F.hyperTag.a > 0.01) all.push({ x: F.hyperTag.x, y: F.hyperTag.y, name: F.hyperTag.name, kind: F.hyperTag.kind, a: F.hyperTag.a, side: 'right' });
      for (var q = 0; q < all.length; q++) {
        var lb = all[q]; ctx.font = f(12, 500); var wn = ctx.measureText(lb.name).width; ctx.font = f(11); var wk = ctx.measureText(lb.kind).width;
        var bw = Math.max(wn, wk) + 16 + (lb.num ? 20 : 0), bh = 34, bx = lb.side === 'left' ? lb.x - 12 - bw : lb.x + 12, by = lb.y - bh / 2;
        ctx.globalAlpha = lb.a; rr(ctx, bx, by, bw, bh, t.radiusMd); ctx.fillStyle = rgba(t.surface, 0.82); ctx.fill(); ctx.strokeStyle = rgba(t.n[700], 0.7); ctx.lineWidth = 1; ctx.stroke();
        var tx0 = bx + 8;
        if (lb.num) { rr(ctx, tx0, by + 9, 15, 16, 4); ctx.fillStyle = t.a[800]; ctx.fill(); ctx.fillStyle = t.a[100]; ctx.font = f(10, 500); ctx.textAlign = 'center'; ctx.fillText(lb.num, tx0 + 7.5, by + 17.5); ctx.textAlign = 'left'; tx0 += 20; }
        ctx.fillStyle = t.n[100]; ctx.font = f(12, 500); ctx.fillText(lb.name, tx0, by + 11);
        ctx.fillStyle = t.a[300]; ctx.font = f(11); ctx.fillText(lb.kind, tx0, by + 24);
      }
    }
    var Qs = F.q;
    if (Qs.bar > 0.01) {
      var B = L.bar; ctx.globalAlpha = Qs.bar;
      rr(ctx, B.x, B.y, B.w, B.h, t.radiusLg); ctx.fillStyle = rgba(t.surface, 0.92); ctx.fill(); ctx.strokeStyle = rgba(t.n[600], 0.6); ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = t.n[400]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(B.x + 21, B.y + 19, 6, 0, 6.2832); ctx.moveTo(B.x + 25.5, B.y + 23.5); ctx.lineTo(B.x + 30, B.y + 28); ctx.stroke();
      var txt = QUERY.text.slice(0, Qs.chars), m = mctx(); m.font = f(15);
      if (Qs.chips > 0.01) for (var cI = 0; cI < QUERY.chips.length; cI++) {
        var wd = QUERY.chips[cI], ix = QUERY.text.indexOf(wd); if (ix + wd.length > Qs.chars) continue;
        var cx0 = L.textX + m.measureText(QUERY.text.slice(0, ix)).width, cw0 = m.measureText(wd).width;
        ctx.globalAlpha = Qs.bar * Qs.chips; rr(ctx, cx0 - 4, B.y + 9, cw0 + 8, 24, 5); ctx.fillStyle = t.a[800]; ctx.fill();
      }
      ctx.globalAlpha = Qs.bar; ctx.font = f(15); ctx.fillStyle = t.text; ctx.fillText(txt, L.textX, B.y + B.h / 2 + 1);
      if (Qs.caret) { ctx.fillStyle = t.accent; ctx.fillRect(L.textX + m.measureText(txt).width + 2, B.y + 11, 2, 20); }
    }
    if (Qs.card > 0.01) {
      var Cd = L.card, ch = 44 + 4 * Cd.row + 12;
      ctx.globalAlpha = Qs.card; rr(ctx, Cd.x, Cd.y, Cd.w, ch, t.radiusLg); ctx.fillStyle = rgba(t.surface, 0.94); ctx.fill(); ctx.strokeStyle = rgba(t.n[600], 0.6); ctx.stroke();
      ctx.fillStyle = t.a[300]; ctx.font = f(10, 500); ctx.fillText('ANSWER', Cd.x + 16, Cd.y + 22);
      for (var li = 0; li < 4; li++) {
        var pr = Qs.lines[li]; if (pr <= 0) continue;
        var A2 = QUERY.answer[li], ry = Cd.y + 44 + li * Cd.row + Cd.row / 2, x0 = Cd.x + 16;
        ctx.globalAlpha = Qs.card;
        for (var ci = 0; ci < A2.cites.length; ci++) { rr(ctx, x0, ry - 8, 15, 16, 4); ctx.fillStyle = t.a[800]; ctx.fill(); ctx.fillStyle = t.a[100]; ctx.font = f(10, 500); ctx.textAlign = 'center'; ctx.fillText(String(A2.cites[ci] + 1), x0 + 7.5, ry); ctx.textAlign = 'left'; x0 += 18; }
        ctx.fillStyle = t.n[100]; ctx.font = f(13); ctx.fillText(A2.text.slice(0, Math.round(pr * A2.text.length)), Cd.x + 58, ry);
        for (ci = 0; ci < A2.cites.length; ci++) {
          var sp = Qs.slots[A2.cites[ci]]; if (!sp || !sp.ok) continue;
          ctx.globalAlpha = 0.6 * pr * Qs.card; ctx.strokeStyle = t.a[400]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(Cd.x, ry); ctx.bezierCurveTo(Cd.x - 80, ry, sp.x + 80, sp.y, sp.x + 6, sp.y); ctx.stroke();
        }
      }
    }
    if (F.ruler.a > 0.01) {
      var rx = 16, ry2 = F.h - 34, rw = Math.min(360, F.w * 0.4);
      ctx.globalAlpha = F.ruler.a; var gl = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      gl.addColorStop(0, rgba(t.text, 0)); gl.addColorStop(48 / rw, rgba(t.text, 0.16)); gl.addColorStop(1 - 48 / rw, rgba(t.text, 0.16)); gl.addColorStop(1, rgba(t.text, 0));
      ctx.fillStyle = gl; ctx.fillRect(rx, ry2, rw, 1);
      ctx.fillStyle = t.accent; ctx.fillRect(rx + F.ruler.g * rw - 1, ry2 - 7, 2, 14);
      ctx.fillStyle = t.n[400]; ctx.font = f(10, 500); ctx.fillText('TIME', rx, ry2 - 14);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  window.GraphEngine = {
    SECTIONS: SECTIONS, DURS: DURS, TITLES: TITLES, QUERY: QUERY, QT: QT, HYPER: HYPER, LAYERS: LAYERS, M: M,
    build: build, cues: cues, defaultCues: defaultCues, evaluate: evaluate, render: render, drawHUD: drawHUD, hudLayout: hudLayout,
    tokens: tokens, rgba: rgba
  };
})();
