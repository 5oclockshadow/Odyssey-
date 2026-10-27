/* neural-film.js — world + renderer for "The Agent Is the Graph" (v3).
   The agent's eight modules ARE concept nodes in the corpus graph; the program
   is a route through the data. Everything is a pure function of authored T. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var ICE = [214, 236, 255], MOLT = [255, 106, 26], GOLD = [255, 190, 110], BG = '#040509';
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sm(t) { t = cl(t, 0, 1); return t * t * (3 - 2 * t); }
  function eo(t) { t = cl(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function L3(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + cl(a, 0, 1).toFixed(3) + ')'; }
  function mix(a, b, u) { return [Math.round(lerp(a[0], b[0], u)), Math.round(lerp(a[1], b[1], u)), Math.round(lerp(a[2], b[2], u))]; }

  // Query beat, seconds after CUES.Query
  var Q = { type0: 0.5, type1: 2.8, parse: 3.0, seed: 4.0, spread0: 5.0, spread1: 8.0, reason: 8.4, lift: 11.0, answer: 13.0, metric: 16.5 };
  var STEP_AT = [Q.parse, Q.seed, Q.spread0, Q.reason, Q.lift, Q.answer, Q.metric];

  function World() {
    var U = LabEngine.util, G = LabEngine.graph(AtlasCorpus), agent = LabEngine.agent(G), nc = G.nc, N = G.nodes;
    var cmp = agent.compile(), run = agent.run(AtlasCorpus.film.text, cmp.params);
    var mods = AtlasCorpus.program.map(function (p) { return G.idx[p.inst]; });
    var edges = G.edges.filter(function (e) { return e.a < nc && e.b < nc; });
    var deg = []; for (var i = 0; i < nc; i++) deg.push(G.adj[i].filter(function (x) { return x[0] < nc; }).length);
    var root = G.idx['Atlas'], depth = [], par = [];
    for (i = 0; i < nc; i++) { var d = 0, j = i; while (j !== root && d < 12) { var p = N[j].parent != null ? G.idx[N[j].parent] : root; if (p == null) p = root; if (d === 0) par[i] = p; j = p; d++; } depth[i] = d; if (i === root) par[i] = root; }
    var born = depth.map(function (d, i) { return 0.5 + d * 1.25 + hash(i) * 0.9; });
    var T4 = U.tesseract4(G), ripsCache = {};
    function rips(eps) { var k = Math.round(eps * 100); return ripsCache[k] || (ripsCache[k] = U.rips(G.layout.force, nc, k / 100)); }
    var dust = []; var r = U.rng(5); for (i = 0; i < 320; i++) { var a = r() * TAU, z = r() * 2 - 1, rr = 1.7 + r() * 2.6, s = Math.sqrt(1 - z * z); dust.push([Math.cos(a) * s * rr, z * rr * 0.7, Math.sin(a) * s * rr, r()]); }
    var route = []; for (i = 0; i < 7; i++) route.push([i, i + 1]);
    var upd = [[7, 0], [7, 3], [7, 5]];
    return { G: G, N: N, nc: nc, agent: agent, cmp: cmp, run: run, mods: mods, edges: edges, deg: deg, par: par, born: born, T4: T4, rips: rips, dust: dust, route: route, upd: upd, U: U };
  }

  function formPos(W, f, i, theta) {
    if (f === 'tesseract') return W.U.rot4(W.T4[i], theta, theta * 0.62);
    if (f === 'hyperbolic') return W.G.layout.hyperbolic[i];
    return W.G.layout.force[i];
  }

  function formsAt(W, T, C) {
    var seq = [[0, 'force'], [C.Hypergraph, 'hyper'], [C.Simplicial, 'simplicial'], [C.Tesseract, 'tesseract'], [C.Hyperbolic, 'hyperbolic'], [C.Query, 'force'], [C.Query + Q.reason, W.run.form], [C.Query + Q.answer, 'force']];
    var i = 0; while (i + 1 < seq.length && T >= seq[i + 1][0]) i++;
    var to = seq[i][1], from = i ? seq[i - 1][1] : to;
    return { from: from, to: to, tw: from === to ? 1 : sm((T - seq[i][0]) / 1.8) };
  }

  /* full scene state for time T */
  function stateAt(W, T, C) {
    var nc = W.nc, run = W.run, f = formsAt(W, T, C), theta = T * 0.3, q = T - C.Query;
    var pos = new Array(nc), alpha = new Float32Array(nc), act = new Float32Array(nc);
    var lift = T >= C.Query + Q.lift ? sm((q - Q.lift) / 1.2) * (1 - sm((T - C.Coda) / 2.5)) : 0;
    var subSet = {}; run.sub.forEach(function (s) { subSet[s] = 1; });
    for (var i = 0; i < nc; i++) {
      var p = L3(formPos(W, f.from, i, theta), formPos(W, f.to, i, theta), f.tw);
      var b = eo((T - W.born[i]) / 1.3);
      if (b < 1) p = L3(W.G.layout.force[W.par[i]], p, b);
      if (lift > 0 && !subSet[i]) p = [p[0] * (1 + 0.45 * lift), p[1] * (1 + 0.45 * lift), p[2] * (1 + 0.45 * lift)];
      pos[i] = p; alpha[i] = b * (subSet[i] ? 1 : 1 - 0.7 * lift);
    }
    // activation (heat)
    if (q >= Q.seed && T < C.Coda + 4) {
      if (q < Q.spread0) { var u = eo((q - Q.seed) / 0.6); run.seeds.forEach(function (s) { act[s] = u; }); }
      else if (q < Q.spread1) {
        var H = run.hops.length - 1, x = (q - Q.spread0) / (Q.spread1 - Q.spread0) * H, h = Math.min(H - 1, Math.floor(x)), uu = sm(x - h);
        for (i = 0; i < nc; i++) act[i] = lerp(run.hops[h][i], run.hops[h + 1][i], uu);
      } else {
        var last = run.hops[run.hops.length - 1], u2 = sm((q - Q.reason - 0.3) / 1.0), u3 = sm((q - Q.lift) / 1.0);
        for (i = 0; i < nc; i++) { var a = lerp(last[i], run.act[i], u2); act[i] = lerp(a, subSet[i] ? Math.max(0.6, a) : a * 0.1, u3); }
      }
      var out = 1 - sm((T - C.Coda) / 3); for (i = 0; i < nc; i++) act[i] *= out;
    }
    // agent route
    var routeA = sm((T - C.Agent - 0.4) / 1.2) * (1 - 0.6 * sm((T - C.Coda - 1) / 3)), seg = [], modOn = -1, modHeat = new Float32Array(8);
    var A0 = C.Agent + 1.8;
    for (var k = 0; k < 8; k++) modHeat[k] = T >= C.Agent && T < C.Force ? Math.max(0, 1 - Math.abs(T - (A0 + k * 0.85)) / 0.9) : 0;
    if (T >= C.Agent && T < C.Force) { var kk = Math.floor((T - A0) / 0.85); if (kk >= 0 && kk < 8) modOn = kk; }
    var step = -1; if (T >= C.Query && T < C.Compile) STEP_AT.forEach(function (t, j) { if (q >= t) step = j; });
    if (T >= C.Compile && T < C.Coda) step = 7;
    if (step >= 0) { modOn = step; for (k = 0; k <= step; k++) modHeat[k] = k === step ? 1 : 0.45; }
    for (k = 0; k < 7; k++) {
      var drawn = T < C.Force ? sm((T - (A0 + k * 0.85 + 0.35)) / 0.6) : 1;
      var hot = step > k ? 1 : 0;
      seg.push({ a: k, b: k + 1, p: drawn, hot: hot });
    }
    var comp = T >= C.Compile ? sm((T - C.Compile - 1) / 5) * (1 - sm((T - C.Coda - 1) / 3)) : 0;
    // packets
    var packets = [];
    function pk(a, b, t0, d, kind) { var u = (T - t0) / d; if (u >= 0 && u < 1) packets.push({ a: a, b: b, u: u, kind: kind }); }
    for (k = 0; k < 7; k++) pk(k, k + 1, A0 + k * 0.85 + 0.35, 0.6, 'route');
    W.upd.forEach(function (e) { pk(e[0], e[1], A0 + 7 * 0.85 + 0.4, 1.0, 'upd'); });
    for (k = 0; k < 6; k++) pk(k, k + 1, C.Query + STEP_AT[k + 1] - 0.55, 0.55, 'route');
    if (T >= C.Compile) [1.2, 3.0, 4.8].forEach(function (t) { W.upd.forEach(function (e) { pk(e[0], e[1], C.Compile + t, 1.0, 'upd'); }); });
    var gp = [];
    function gk(a, b, t0, d) { var u = (T - t0) / d; if (u >= 0 && u < 1) gp.push({ a: a, b: b, u: u }); }
    run.seeds.forEach(function (s) { gk(W.mods[1], s, C.Query + Q.seed, 0.6); });
    if (q > Q.spread0 - 0.2 && q < Q.spread1 + 0.8) {
      var HH = run.hops.length - 1, hd = (Q.spread1 - Q.spread0) / HH;
      for (var hh = 1; hh <= HH; hh++) { var pr = run.hops[hh - 1], cu = run.hops[hh], c = 0; for (var uu2 = 0; uu2 < nc && c < 80; uu2++) if (pr[uu2] > 0.3) W.G.adj[uu2].forEach(function (x) { if (x[0] < nc && cu[x[0]] > 0.15 && c < 80) { gk(uu2, x[0], C.Query + Q.spread0 + (hh - 1) * hd + hash(uu2 * 31 + x[0]) * 0.3, 0.65); c++; } }); }
    }
    run.tool.ev.forEach(function (i2, j) { gk(W.mods[3], i2, C.Query + Q.reason + 0.3 + j * 0.03, 0.8); });
    run.sub.forEach(function (s) { gk(s, W.mods[4], C.Query + Q.lift + hash(s) * 0.3, 0.7); });
    run.sub.slice(0, 4).forEach(function (s) { gk(s, W.mods[5], C.Query + Q.answer, 0.7); });
    // shockwaves
    var waves = [];
    function wv(i2, t0, d, s) { var u = (T - t0) / d; if (u >= 0 && u < 1) waves.push({ i: i2, u: u, s: s || 1 }); }
    run.seeds.forEach(function (s) { wv(s, C.Query + Q.seed, 1.4, 1.6); wv(s, C.Query + Q.seed + 0.35, 1.4, 1.0); });
    for (k = 0; k < 8; k++) wv(W.mods[k], A0 + k * 0.85, 1.0, 0.8);
    STEP_AT.forEach(function (t, j) { wv(W.mods[j], C.Query + t, 1.0, 0.9); });
    wv(W.mods[7], C.Compile + 0.6, 1.2, 1.2);
    // camera
    var push = sm(T / 9), pull = sm((T - C.Coda - 0.5) / 5.5), qz = sm((T - C.Query) / 2) * (1 - sm((T - C.Compile - 3) / 3));
    var cam = { yaw: 0.35 + T * 0.055, pitch: 0.2 + 0.09 * Math.sin(T * 0.1), dist: lerp(5.0, 2.75, push) - 0.25 * qz - 0.2 * lift + 1.6 * pull, ox: lerp(170, -150, qz) + 260 * pull, oy: 10 };
    var eps = T >= C.Simplicial && T < C.Tesseract + 1 ? lerp(0.12, 0.36, sm((T - C.Simplicial - 0.8) / 5.4)) : 0.26;
    var over = {
      hyper: f.to === 'hyper' ? f.tw : f.from === 'hyper' ? 1 - f.tw : 0,
      simp: f.to === 'simplicial' ? f.tw : f.from === 'simplicial' ? 1 - f.tw : 0,
      tess: f.to === 'tesseract' ? f.tw : f.from === 'tesseract' ? 1 - f.tw : 0,
      ball: f.to === 'hyperbolic' ? f.tw : f.from === 'hyperbolic' ? 1 - f.tw : 0
    };
    var activeN = 0, heat = 0; for (i = 0; i < nc; i++) { heat += act[i]; if (act[i] > 0.2) activeN++; }
    return { T: T, f: f, theta: theta, pos: pos, alpha: alpha, act: act, lift: lift, subSet: subSet, routeA: routeA, seg: seg, modOn: modOn, modHeat: modHeat, comp: comp, packets: packets, gp: gp, waves: waves, cam: cam, eps: eps, over: over, step: step, activeN: activeN, heat: heat, q: q, answerA: sm((q - Q.answer) / 0.8) * (1 - sm((T - C.Coda) / 1.5)) };
  }

  /* ---------- renderer ---------- */
  function sprite(col, core) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(core, rgba(col, 0.9)); g.addColorStop(0.35, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c;
  }
  function Renderer(canvas, W, w, h) {
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d'), SI = sprite(ICE, 0.06), SM = sprite(MOLT, 0.1), SG = sprite(GOLD, 0.08);
    var cam, proj = [];
    function P(p) {
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] * cp - z * sp; z = p[1] * sp + z * cp;
      var zz = z + cam.dist; if (zz < 0.15) zz = 0.15; var s = h * 1.12 / zz;
      return [w / 2 + cam.ox + x * s, h / 2 + cam.oy - y * s, zz, s];
    }
    function curve(a, b, bend) { // screen-space quadratic between projected points with a 3D control point
      return null;
    }
    function quadPt(p0, c, p1, t) { var m = 1 - t; return [m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1]]; }
    function blob(spr, x, y, r, a) { if (a <= 0.003 || r <= 0.2) return; ctx.globalAlpha = cl(a, 0, 1); ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); }
    function hull(pts) {
      if (pts.length < 3) return pts; pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
      var lo = [], up = []; pts.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      for (var i = pts.length - 1; i >= 0; i--) { var p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    function draw(S, opt) {
      opt = opt || {}; cam = S.cam; var nc = W.nc, T = S.T;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < nc; i++) proj[i] = P(S.pos[i]);
      ctx.globalCompositeOperation = 'lighter';
      // floor grid
      var gy = -1.25, step = 0.32, ext = 3.2; ctx.lineWidth = 1;
      for (var g = -ext; g <= ext + 1e-6; g += step) {
        [[[g, gy, -ext], [g, gy, ext]], [[-ext, gy, g], [ext, gy, g]]].forEach(function (L) {
          var n = 10; ctx.beginPath(); var prev = null;
          for (var k = 0; k <= n; k++) { var t = k / n, p = P([lerp(L[0][0], L[1][0], t), gy, lerp(L[0][2], L[1][2], t)]); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); prev = p; }
          var mid = P([(L[0][0] + L[1][0]) / 2, gy, (L[0][2] + L[1][2]) / 2]);
          ctx.strokeStyle = rgba(ICE, 0.05 * cl(1.4 - (mid[2] - cam.dist) * 0.3, 0, 1)); ctx.stroke();
        });
      }
      // dust
      W.dust.forEach(function (d, k) { var a = T * 0.02 + d[3] * TAU, p = P([d[0] * Math.cos(a * 0.3) - d[2] * Math.sin(a * 0.3), d[1] + Math.sin(T * 0.2 + k) * 0.03, d[0] * Math.sin(a * 0.3) + d[2] * Math.cos(a * 0.3)]); blob(SI, p[0], p[1], 2 + p[3] * 0.004, 0.25 * (0.5 + 0.5 * Math.sin(T * 0.7 + k))); });
      // hyperbolic ball
      if (S.over.ball > 0.01) {
        var o = P([0, 0, 0]); [1, 0.76, 0.46].forEach(function (r, k) { ctx.strokeStyle = rgba(ICE, (k ? 0.06 : 0.22) * S.over.ball); ctx.lineWidth = k ? 1 : 1.5; ctx.beginPath(); ctx.arc(o[0], o[1], o[3] * r, 0, TAU); ctx.stroke(); });
        for (var m = 0; m < 6; m++) { ctx.strokeStyle = rgba(ICE, 0.05 * S.over.ball); ctx.beginPath(); for (var k2 = 0; k2 <= 48; k2++) { var a2 = k2 / 48 * TAU, ph = m / 6 * Math.PI, p2 = P([Math.cos(a2) * Math.cos(ph), Math.sin(a2), Math.cos(a2) * Math.sin(ph)]); k2 ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1]); } ctx.stroke(); }
      }
      // tesseract frame
      if (S.over.tess > 0.01) {
        var V = []; for (var c = 0; c < 16; c++) V.push(P(W.U.rot4(W.U.vert4(c), S.theta, S.theta * 0.62)));
        W.U.TESS_E.forEach(function (e) { ctx.strokeStyle = rgba(GOLD, 0.2 * S.over.tess); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(V[e[0]][0], V[e[0]][1]); ctx.lineTo(V[e[1]][0], V[e[1]][1]); ctx.stroke(); });
        V.forEach(function (v) { blob(SG, v[0], v[1], 10, 0.5 * S.over.tess); });
      }
      // hyperedge films
      if (S.over.hyper > 0.01) {
        W.G.hyper.forEach(function (hy, k) {
          var pts = hy.m.map(function (i) { return proj[i]; }), hs = hull(pts), cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
          var hot = hy.m.some(function (i) { return S.subSet[i] && S.lift > 0; }), col = mix(ICE, MOLT, (k % 5) / 8 + (hot ? 0.6 : 0));
          ctx.beginPath(); hs.forEach(function (p, j) { var dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1, q = [p[0] + dx / l * 14, p[1] + dy / l * 14]; j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
          ctx.fillStyle = rgba(col, 0.05 * S.over.hyper); ctx.fill(); ctx.strokeStyle = rgba(col, 0.35 * S.over.hyper); ctx.lineWidth = 1.2; ctx.setLineDash([2, 6]); ctx.lineDashOffset = -T * 20; ctx.stroke(); ctx.setLineDash([]);
          pts.forEach(function (p) { ctx.strokeStyle = rgba(col, 0.14 * S.over.hyper); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
          blob(SI, cx, cy, 9, 0.6 * S.over.hyper);
        });
      }
      // simplices
      if (S.over.simp > 0.01) {
        var R = W.rips(S.eps);
        R.T.forEach(function (t) { var a = proj[t[0]], b = proj[t[1]], c2 = proj[t[2]]; ctx.fillStyle = rgba(mix(ICE, GOLD, hash(t[0] + t[1] * 7)), 0.045 * S.over.simp); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.closePath(); ctx.fill(); });
        ctx.lineWidth = 1; R.E.forEach(function (e) { var a = proj[e[0]], b = proj[e[1]]; ctx.strokeStyle = rgba(ICE, 0.16 * S.over.simp); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      }
      // graph edges: bundled curves + flow particles
      var edgeDim = 1 - 0.75 * S.over.simp;
      W.edges.forEach(function (e, k) {
        var a = proj[e.a], b = proj[e.b], al = Math.min(S.alpha[e.a], S.alpha[e.b]); if (al < 0.02) return;
        var mid = L3(S.pos[e.a], S.pos[e.b], 0.5), cp = P([mid[0] * 0.78, mid[1] * 0.78, mid[2] * 0.78]);
        var heat = Math.min(S.act[e.a], S.act[e.b]), dz = cl(1.5 - ((a[2] + b[2]) / 2 - cam.dist) * 0.45, 0.2, 1);
        ctx.strokeStyle = rgba(mix(ICE, MOLT, cl(heat * 1.4, 0, 1)), (0.07 + 0.08 * (e.t === 'isa') + heat * 0.55) * al * dz * edgeDim);
        ctx.lineWidth = 1 + heat * 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(cp[0], cp[1], b[0], b[1]); ctx.stroke();
        var n = heat > 0.2 ? 3 : 1;
        for (var j = 0; j < n; j++) { var t = (T * (0.18 + heat * 0.5) + hash(k) + j / n) % 1, pt = quadPt(a, cp, b, t); blob(heat > 0.2 ? SM : SI, pt[0], pt[1], 3 + heat * 5, (0.25 + heat * 0.7) * al * dz * edgeDim); }
      });
      // graph packets
      S.gp.forEach(function (g2) { var a = proj[g2.a], b = proj[g2.b], mid = L3(S.pos[g2.a], S.pos[g2.b], 0.5), cp = P([mid[0] * 0.78, mid[1] * 0.78, mid[2] * 0.78]), u = sm(g2.u), pt = quadPt(a, cp, b, u); blob(SM, pt[0], pt[1], 16, 0.9 * Math.sin(Math.PI * g2.u)); });
      // agent route (arcs over the data)
      function rc(k1, k2) { var A = S.pos[W.mods[k1]], B = S.pos[W.mods[k2]], mid = L3(A, B, 0.5), lm = Math.hypot(mid[0], mid[1], mid[2]) || 1, push = 0.22 + 0.25 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); return [proj[W.mods[k1]], P([mid[0] + mid[0] / lm * push, mid[1] + mid[1] / lm * push + 0.12, mid[2] + mid[2] / lm * push]), proj[W.mods[k2]]]; }
      if (S.routeA > 0.01) {
        var thick = 1 + 2.2 * S.comp;
        S.seg.forEach(function (sg) {
          if (sg.p <= 0) return; var c3 = rc(sg.a, sg.b), n2 = 28, e2 = Math.max(1, Math.round(n2 * sg.p));
          [[10 * thick, 0.07], [3.5 * thick, 0.22], [1.4 * thick, 0.9]].forEach(function (L, li) {
            ctx.strokeStyle = rgba(li === 2 ? GOLD : MOLT, L[1] * S.routeA * (0.55 + 0.45 * sg.hot + 0.3 * S.comp)); ctx.lineWidth = L[0]; ctx.lineCap = 'round';
            ctx.beginPath(); for (var j = 0; j <= e2; j++) { var pt = quadPt(c3[0], c3[1], c3[2], j / n2); j ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); } ctx.stroke();
          });
          if (sg.p >= 1) for (var j2 = 0; j2 < 2; j2++) { var t2 = (T * 0.35 + j2 / 2 + sg.a * 0.13) % 1, pt2 = quadPt(c3[0], c3[1], c3[2], t2); blob(SG, pt2[0], pt2[1], 7 * thick, 0.55 * S.routeA); }
        });
        W.upd.forEach(function (u2) { var c4 = rc(u2[0], u2[1]); ctx.setLineDash([3, 9]); ctx.lineDashOffset = T * 30; ctx.strokeStyle = rgba(MOLT, (0.18 + 0.5 * S.comp) * S.routeA); ctx.lineWidth = 1.2 + S.comp * 2; ctx.beginPath(); ctx.moveTo(c4[0][0], c4[0][1]); ctx.quadraticCurveTo(c4[1][0], c4[1][1], c4[2][0], c4[2][1]); ctx.stroke(); ctx.setLineDash([]); });
        S.packets.forEach(function (pk) { var c5 = rc(pk.a, pk.b), pt = quadPt(c5[0], c5[1], c5[2], sm(pk.u)); blob(SG, pt[0], pt[1], pk.kind === 'upd' ? 22 : 30, Math.sin(Math.PI * pk.u)); blob(SI, pt[0], pt[1], 8, Math.sin(Math.PI * pk.u)); });
      }
      // shockwaves
      S.waves.forEach(function (wv) { var p = proj[wv.i], r = 12 + eo(wv.u) * 150 * wv.s * p[3] / 400; ctx.strokeStyle = rgba(MOLT, 0.7 * (1 - wv.u)); ctx.lineWidth = 2 * (1 - wv.u) + 0.5; ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * (0.55 + 0.45 * Math.abs(Math.cos(cam.pitch))), 0, 0, TAU); ctx.stroke(); });
      // nodes (depth-of-field sprites)
      var ord = []; for (i = 0; i < nc; i++) ord.push(i); ord.sort(function (a, b) { return proj[b][2] - proj[a][2]; });
      var modIdx = {}; W.mods.forEach(function (m, k) { modIdx[m] = k; });
      ord.forEach(function (i) {
        var p = proj[i], al = S.alpha[i]; if (al < 0.01) return;
        var blur = Math.abs(p[2] - cam.dist + 0.2), base = (3 + Math.sqrt(W.deg[i]) * 1.6) * p[3] / 420, a = S.act[i];
        var r = base * (1 + blur * 1.1) * (1 + a * 0.8), da = 1 / (1 + blur * 1.6);
        var mk = modIdx[i], isMod = mk != null && S.routeA > 0.05;
        blob(SI, p[0], p[1], r * 5, (0.55 + 0.45 * da) * al * (1 - a));
        if (a > 0.02) blob(SM, p[0], p[1], r * 7, a * al);
        if (isMod) { var mh = S.modHeat[mk]; blob(SM, p[0], p[1], r * (8 + 6 * mh), (0.45 + 0.55 * mh) * S.routeA); ctx.strokeStyle = rgba(GOLD, (0.55 + 0.45 * mh) * S.routeA); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], 14 + 8 * mh, 0, TAU); ctx.stroke();
          ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(T * 0.6 + mk); ctx.strokeStyle = rgba(GOLD, 0.5 * S.routeA); ctx.beginPath(); ctx.arc(0, 0, 22 + 8 * mh, 0, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 22 + 8 * mh, Math.PI, Math.PI + 1.1); ctx.stroke(); ctx.restore(); }
      });
      // labels
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      var boxes = [];
      function label(i, line1, line2, col, a, size, pri) {
        if (a < 0.03) return; var p = proj[i]; ctx.font = '500 ' + size + 'px "Geist Mono", ui-monospace, monospace'; ctx.letterSpacing = '0.08em';
        var w1 = ctx.measureText(line1).width, x = p[0] + 26, y = p[1] - 8, bx = [x - 6, y - size, w1 + 12, size * (line2 ? 2.3 : 1.4)];
        if (!pri && boxes.some(function (b) { return bx[0] < b[0] + b[2] && bx[0] + bx[2] > b[0] && bx[1] < b[1] + b[3] && bx[1] + bx[3] > b[1]; })) return;
        boxes.push(bx);
        ctx.strokeStyle = rgba(col, 0.5 * a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0] + 6, p[1] - 3); ctx.lineTo(x - 8, y - size * 0.35); ctx.stroke();
        ctx.fillStyle = rgba(col, a); ctx.fillText(line1, x, y);
        if (line2) { ctx.font = '400 ' + Math.round(size * 0.8) + 'px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = rgba(ICE, 0.7 * a); ctx.fillText(line2, x, y + size * 1.05); }
      }
      if (S.routeA > 0.05) W.mods.forEach(function (m, k) { var mh = S.modHeat[k]; label(m, '0' + (k + 1) + ' ' + AtlasCorpus.program[k].id.toUpperCase(), W.N[m].name, mh > 0.3 ? GOLD : MOLT, S.routeA * (0.75 + 0.25 * mh) * S.alpha[m], 22, true); });
      if (S.answerA > 0.02) W.run.sub.forEach(function (s, k) { if (W.mods.indexOf(s) < 0) label(s, '[' + (k + 1) + '] ' + W.N[s].name, null, ICE, S.answerA, 20, k < 4); });
      else if (S.q > Q.seed && S.q < Q.answer) W.run.seeds.forEach(function (s) { label(s, 'SEED · ' + W.N[s].name, null, MOLT, 1, 22, true); });
      if (S.over.hyper > 0.4) W.G.hyper.forEach(function (hy) { var cx = 0, cy = 0; hy.m.forEach(function (i) { cx += proj[i][0]; cy += proj[i][1]; }); cx /= hy.m.length; cy /= hy.m.length; ctx.font = '500 18px "Geist Mono", monospace'; ctx.letterSpacing = '0.06em'; ctx.fillStyle = rgba(ICE, 0.8 * S.over.hyper); ctx.fillText(hy.name.toUpperCase(), cx + 12, cy - 10); });
      ctx.letterSpacing = '0px';
    }
    return { draw: draw };
  }

  window.NeuralFilm = { World: World, stateAt: stateAt, Renderer: Renderer, Q: Q, STEP_AT: STEP_AT, ICE: ICE, MOLT: MOLT };
})();
