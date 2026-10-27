/* Neurite core · native port for Cortex (pure logic, no DOM)
   Re-implemented from satellitecomponent/Neurite @ e62b270402b6 (MIT):
   vec2 + fractal maths (mandelbrot.js, updatefractal.js), Zettelkasten parsing and sync
   (zettelkasten.js, zetpath.js, zetplacementstrategy.js, zetsplitter.js, zetsyntax.js),
   code parsing (searchapi/codeparser/gitparsed.js), search scoring (searchapi/search.js),
   settings and tags (globals.js). Embeddings are local hashed vectors so search works offline. */
(function () {
'use strict';
const NS = window.Neurite = window.Neurite || {};
if (NS.core) return;

const lerp = (a, b, t) => a * (1 - t) + b * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reEsc = s => String(s).replace(/[\^$\\.*+?()[\]{}|\/]/g, '\\$&');

/* ───────────── vec2 · complex numbers (mandelbrot.js) ───────────── */
class vec2 {
  constructor(x, y) { if (x && typeof x === 'object') { y = x.y; x = x.x; } this.x = x; this.y = y; }
  isFinite() { return isFinite(this.x) && isFinite(this.y); }
  isInvalid() { return isNaN(this.x) || isNaN(this.y); }
  plus(o) { return new vec2(this.x + o.x, this.y + o.y); }
  minus(o) { return new vec2(this.x - o.x, this.y - o.y); }
  times(o) { return new vec2(this.x * o.x, this.y * o.y); }
  div(o) { return new vec2(this.x / o.x, this.y / o.y); }
  dot(o) { return this.x * o.x + this.y * o.y; }
  rot(a) { const c = Math.cos(a), s = Math.sin(a); return new vec2(this.x * c - this.y * s, this.x * s + this.y * c); }
  rot90() { return new vec2(this.y, -this.x); }
  unrot90() { return new vec2(-this.y, this.x); }
  cross(o) { return this.x * o.y - this.y * o.x; }
  scale(s) { return new vec2(this.x * s, this.y * s); }
  unscale(s) { return new vec2(this.x / s, this.y / s); }
  normed(s = 1) { return this.scale(s / this.mag()); }
  mag2() { return this.x * this.x + this.y * this.y; }
  mag() { return Math.hypot(this.x, this.y); }
  ang() { return Math.atan2(this.y, this.x); }
  pang() { if (this.x == 0 && this.y == 0) return 0; const p = this.x / (Math.abs(this.x) + Math.abs(this.y)); return this.y < 0 ? p - 1 : 1 - p; }
  map(f) { return new vec2(f(this.x), f(this.y)); }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y); }
  cadd(o) { return this.plus(o); }
  csub(o) { return this.minus(o); }
  cneg() { return new vec2(-this.x, -this.y); }
  cmult(o) { return new vec2(this.x * o.x - this.y * o.y, this.y * o.x + this.x * o.y); }
  caamult(o) { const s = this.plus(o); return s.scale(this.cmult(o).mag() / s.mag()); }
  cconj() { return new vec2(this.x, -this.y); }
  crecip() { const m = this.mag2(); return new vec2(this.x / m, -this.y / m); }
  cdiv(o) { return this.cmult(o.crecip()); }
  cpow(o) { let l = this.clog(); l = typeof o === 'number' ? l.scale(o) : l.cmult(o); return l.isInvalid() ? new vec2(0, 0) : l.cexp(); }
  ipow(n) { if (n < 0) return this.crecip().ipow(-n); if (n == 0) return new vec2(1, 0); if (n == 1) return this; let c = this.ipow(n >> 1); c = c.cmult(c); return n & 1 ? c.cmult(this) : c; }
  cexp() { const m = Math.exp(this.x); return new vec2(m * Math.cos(this.y), m * Math.sin(this.y)); }
  clog() { return new vec2(Math.log(this.mag2()) / 2, Math.atan2(this.y, this.x)); }
  sqrt() { const l = this.mag(), u = Math.sqrt((l + this.x) / 2), v = (this.y < 0 ? -1 : 1) * Math.sqrt((l - this.x) / 2); return new vec2(u, v); }
  lerpto(o, t) { return new vec2(lerp(this.x, o.x, t), lerp(this.y, o.y, t)); }
  ctostring() { return this.y < 0 ? this.x + '-i' + (-this.y) : this.x + '+i' + this.y; }
  toString() { return this.x + ',' + this.y; }
}
const ZERO = new vec2(0, 0);
function gaussianRandom2() { const u = 1 - Math.random(), v = Math.random(), m = Math.sqrt(-2 * Math.log(u)); return new vec2(m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)); }

/* ───────────── settings (globals.js) ───────────── */
const DEFAULTS = {
  zoomSpeed: 0.0015, dragZoomSpeed: 0.005, panSpeed: 1, zoomContentExp: 0.5, gestureRotateSpeed: Math.PI / 180,
  nodeModeKey: 'Shift', nodeModeTrigger: 'down', rotateModifierSpeed: Math.PI / 180 / 36, dragRotateSpeed: 0.01,
  zoomSpeedMultiplier: 1, neuriteScroll: false,
  maxLines: 520, renderSteps: 22, renderStepSize: 0.1, renderWidthMult: 0.3, regenDebtAdjustmentFactor: 2,
  iterations: 256, autoIterations: true, maxDist: 4, orbitStepRate: 2, innerOpacity: 1, outerOpacity: 1,
  flashlight_stdev: 0.25, flashlight_fraction: 0.73, fractal: 'mandelbrot', exponent: 2, juliaX: 0.256, juliaY: 0.01,
  palette: 'nocturne', rgb: [0.62, 0.56, 1], colorR: 0, colorC: 118, colorS: 112, glow: 0.5,
  autopilotRF_Iscale: 0.5, autopilotSpeed: 0.1, autopilotMaxSpeed: 0.1,
  useFlowDirection: true, flowDirectionRotation: 0, flowDirectionRandomRange: Math.PI / 1.05, fractalForce: true,
  lodPx: 24, edgeWidth: 0.01, maxAiHops: 4, autoSteps: 3,
  nodeTag: '##', refTag: '[[', llmTag: 'AI:', zetPath: 'Radial', zetSpread: 0.26
};
const FRACTAL_KEYS = ['maxLines', 'renderSteps', 'renderStepSize', 'renderWidthMult', 'regenDebtAdjustmentFactor', 'iterations', 'autoIterations', 'innerOpacity', 'outerOpacity', 'flashlight_stdev', 'flashlight_fraction', 'fractal', 'exponent', 'juliaX', 'juliaY', 'palette', 'rgb', 'colorR', 'colorC', 'colorS', 'glow', 'useFlowDirection', 'fractalForce', 'zoomSpeed', 'neuriteScroll', 'nodeTag', 'refTag', 'zetPath'];
const PALETTES = {
  nocturne: { label: 'Nocturne', rgb: [0.62, 0.56, 1], colorC: 118, colorS: 112, colorR: 0 },
  neurite: { label: 'Neurite', rgb: [1, 1, 1], colorC: 127, colorS: 127, colorR: 0 },
  ember: { label: 'Ember', rgb: [1, 0.66, 0.34], colorC: 124, colorS: 118, colorR: 0 },
  aurora: { label: 'Aurora', rgb: [0.4, 1, 0.8], colorC: 116, colorS: 110, colorR: 0 },
  mono: { label: 'Mono', rgb: [1, 1, 1], colorC: 150, colorS: 70, colorR: 1 }
};
const BRACKETS = { '(': ')', '[': ']', '{': '}', '<': '>', '((': '))', '[[': ']]', '{{': '}}', '<<': '>>', '«': '»', '/*': '*/', '<!--': '-->', '#[': ']#', '<%': '%>', '(*': '*)', '`': '`', '```': '```', '${': '}', '|': '|' };

/* ───────────── fractals (mandelbrot.js · updatefractal.js) ───────────── */
const FRACTALS = {
  mandelbrot: { label: 'Mandelbrot', eq: 'z<sup>n</sup> + c' },
  burningShip: { label: 'Burning ship', eq: '|z|<sup>n</sup> + c' },
  julia: { label: 'Julia', eq: 'z<sup>n</sup> + k' },
  tricorn: { label: 'Tricorn', eq: 'conj(z)<sup>n</sup> + c' },
  buffalo: { label: 'Buffalo', eq: '|z|<sup>n</sup> · z + c' },
  henon: { label: 'Hénon', eq: 'Hénon map', fixed: true },
  ikeda: { label: 'Ikeda', eq: 'Ikeda map', fixed: true },
  inverseMandelbrot: { label: 'Inverse', eq: 'z<sup>−n</sup> + c' }
};
class Fractal {
  constructor(S) { this.S = S; }
  get n() { return Math.max(1, Math.round(this.S.exponent || 2)); }
  step(z, c) {
    const S = this.S, n = this.n;
    switch (S.fractal) {
      case 'burningShip': return new vec2(Math.abs(z.x), Math.abs(z.y)).ipow(n).cadd(c);
      case 'julia': return z.ipow(n).cadd(new vec2(S.juliaX, S.juliaY));
      case 'tricorn': return z.cconj().ipow(n).cadd(c);
      case 'buffalo': return new vec2(Math.abs(z.x), Math.abs(z.y)).ipow(n).cmult(z).cadd(c);
      case 'henon': return new vec2(1 - 1.4 * z.x * z.x + z.y, 0.3 * z.x).cadd(c);
      case 'ikeda': { const t = 0.4 - 6 / (1 + z.x * z.x + z.y * z.y); return new vec2(1 + 0.9 * (z.x * Math.cos(t) - z.y * Math.sin(t)), 0.9 * (z.x * Math.sin(t) + z.y * Math.cos(t))).cadd(c); }
      case 'inverseMandelbrot': return z.ipow(-n).cadd(c);
      default: return n === 2 ? new vec2(z.x * z.x - z.y * z.y + c.x, 2 * z.x * z.y + c.y) : z.ipow(n).cadd(c);
    }
  }
  itersFor(zm) { const S = this.S; return S.autoIterations ? Math.round(clamp(S.iterations + 60 * Math.log2(Math.max(1, 1 / zm)), S.iterations, 4000)) : S.iterations; }
  epsFor(zm) { return clamp(zm * 1e-5, 1e-14, 1e-10); }
  unstep(z, c) { return z.csub(c).sqrt(); }
  mand_i(z, iters = 16) { const c = z; for (let i = 0; i < iters; i++) { if (z.mag2() > 4) return i; z = this.step(z, c); } return z.mag2() > 4 ? iters : iters + 1; }
  dist(iters, c, z) {
    const S = this.S;
    if (!z) z = S.fractal === 'julia' ? c : ZERO;
    if (S.fractal === 'mandelbrot' && this.n === 2) {
      let x = z.x, y = z.y; const cx = c.x, cy = c.y;
      for (let i = 0; i < iters; i++) { const m = x * x + y * y; if (m > 1e8) return i - Math.log2(Math.log2(m) / 2); const t = x * x - y * y + cx; y = 2 * x * y + cy; x = t; }
      return iters;
    }
    for (let i = 0; i < iters; i++) { const m = z.mag2(); if (m > 1e8) return i - Math.log2(Math.log2(m) / 2); z = this.step(z, c); }
    return iters;
  }
  grad(iters, c, z, e = 1e-10) { const d = this.dist(iters, c, z); return new vec2((this.dist(iters, new vec2(c.x + e, c.y), z) - d) / e, (this.dist(iters, new vec2(c.x, c.y + e), z) - d) / e); }
  gradzr(f, z, e = 1e-6) { const r = f(z); return new vec2((f(new vec2(z.x + e, z.y)) - r) / e, (f(new vec2(z.x, z.y + e)) - r) / e); }
  iter_n(n, c, z = ZERO) { for (let i = 0; i < n; i++) z = this.step(z, c); return z; }
  infimum(iters, z, c) { if (c === undefined) c = z; let besti = 0, bestz = z, bestd = z.mag2(); for (let i = 1; i <= iters; i++) { z = this.step(z, c); const d = z.mag2(); if (d < bestd) { bestd = d; besti = i; bestz = z; } } return { i: besti, z: bestz }; }
  period(c, z = ZERO, eps2 = 1e-7, max = 256) {
    const g = (a, b) => (b === 0 ? a : g(b, a % b)); let zf = this.step(z, c), i = 1, p = 0;
    for (; i < max; i++) { if (zf.minus(z).mag2() <= eps2) { p = i; break; } zf = this.step(this.step(zf, c), c); z = this.step(z, c); }
    for (; i < max; i++) { if (zf.minus(z).mag2() <= eps2) p = g(p, i); zf = this.step(this.step(zf, c), c); z = this.step(z, c); }
    return p;
  }
  trace(iters, z0, step = 0.5, max = 64, e) {
    const pts = [], level = this.dist(iters, z0); let z = z0, prevG2 = Infinity, total = 0, prevDir = null;
    while (pts.length < max) {
      const val = this.dist(iters, z), g = this.grad(iters, z, undefined, e), g2 = g.mag2();
      if (g2 < 1e-10 || Math.abs(val - level) > 1) break;
      if (g2 > prevG2 * 4) break;
      pts.push(z);
      const delta = g.cmult(new vec2(level - val, step)).unscale(g2);
      if (!delta.isFinite() || delta.mag() > 2 * Math.abs(step)) break;
      if (prevDir) { total += Math.abs(delta.ang() - prevDir.ang()); if (total > 2 * Math.PI) break; }
      prevDir = delta; z = z.plus(delta); prevG2 = g2;
    }
    return pts;
  }
  basin(pt, iters, max, zm) {
    const p = this.infimum(iters, pt), f = z => this.iter_n(p.i, z, z).mag2(), e = 1e-5 * Math.min(1, zm), out = [];
    for (let k = 0; k < max; k++) { let d = this.gradzr(f, pt, e); d = d.unscale(d.mag() + 1e-300).scale(zm * 0.1); pt = pt.plus(d.scale(-this.S.renderStepSize)); out.push(pt); if (!pt.isFinite() || this.mand_i(pt, iters) <= iters) break; }
    return out;
  }
  rgb(i, r, c, s) {
    const S = this.S, P = S.rgb || [1, 1, 1];
    if (r == null) r = S.colorR; if (c == null) c = S.colorC; if (s == null) s = S.colorS;
    const R = P[0] * (c - s * Math.cos(i / 1.8661)), G = P[1] * (c - s * Math.cos(i / 2.6879)), B = P[2] * (c - s * Math.cos(i / 4.2567));
    const y = 0.17697 * R + 0.8124 * G + 0.01063 * B;
    return [clamp(lerp(R, y, r), 0, 255) | 0, clamp(lerp(G, y, r), 0, 255) | 0, clamp(lerp(B, y, r), 0, 255) | 0];
  }
  color(iters, z, nmv = 0) {
    const i = this.dist(iters, z);
    if (i < iters) return this.rgb(i, nmv > 0.01 ? Math.max(this.S.colorR, nmv) : this.S.colorR);
    const inf = this.infimum(iters, z);
    return this.rgb(inf.i * 123 + 2, 1 - nmv, 128, 32 + (1 - nmv) * 48);
  }
  sample(v) {
    const S = this.S;
    if (Math.random() <= S.flashlight_fraction && v.mouseZ) return gaussianRandom2().scale(S.flashlight_stdev).cmult(v.zoom).cadd(v.mouseZ);
    let tries = 1, pt;
    do {
      pt = v.randomZ();
      for (let i = (1 - Math.random() ** 2) * (tries * 4); i > 1; i--) { const gz = this.grad(v.iters, pt, undefined, v.e); pt = pt.plus(gz.unscale(gz.mag2() * 10 + 1)); }
      tries -= 1;
    } while (tries > 0 && this.mand_i(pt, v.iters) > v.iters);
    return pt;
  }
  hair(v, max) {
    const S = this.S, iters = v.iters, pt0 = this.sample(v);
    if (!pt0 || !pt0.isFinite()) return null;
    let pt = pt0, length = 0, n = 0, opacity; const pts = [pt0];
    if (this.mand_i(pt, iters) > iters) {
      for (const nx of this.basin(pt, iters, max, v.zm)) { if (!nx.isFinite() || this.mand_i(nx, iters) <= iters) break; pts.push(nx); length += nx.minus(pt).mag(); pt = nx; n++; }
      opacity = S.innerOpacity / 10; length /= 4;
    } else {
      if (this.dist(iters, pt) < S.maxDist) return null;
      const tr = this.trace(iters, pt, Math.random() > 0.5 ? S.renderStepSize : -S.renderStepSize, max + 1, v.e);
      for (let k = 1; k < tr.length; k++) { const nx = tr[k]; if (!nx.isFinite()) break; pts.push(nx); length += nx.minus(pt).mag(); pt = nx; n++; }
      opacity = S.outerOpacity;
    }
    if (!length || pts.length < 2) return null;
    const flat = new Float64Array(pts.length * 2);
    pts.forEach((p, i) => { flat[i * 2] = p.x; flat[i * 2 + 1] = p.y; });
    return { p: flat, w: Math.min(S.renderWidthMult * length / Math.max(1, n), 0.1), c: this.color(iters, pt0, v.nmv), a: opacity, len: length };
  }
}
function generateBoundaryPoints(numPoints = 100, methods = ['cardioid', 'disk', 'spike']) {
  const out = [];
  if (methods.includes('cardioid')) for (let i = 0; i < numPoints; i++) { const t = i / numPoints * 2 * Math.PI, r = (1 - Math.cos(t)) / 2; out.push({ x: r * Math.cos(t) + 0.25, y: r * Math.sin(t) }); }
  if (methods.includes('disk')) for (let i = 0; i < numPoints; i++) { const t = i / numPoints * 2 * Math.PI; out.push({ x: 0.25 * Math.cos(t) - 1, y: 0.25 * Math.sin(t) }); }
  if (methods.includes('spike')) for (let i = 0; i < numPoints; i++) out.push({ x: -2 + 2 * i / numPoints, y: 0 });
  return out;
}

/* ───────────── placement paths (zetpath.js · zetplacementstrategy.js) ───────────── */
class ZetPath {
  constructor(o) { this.options = Object.assign({}, o); this.path = []; }
  radialNodes(num, spacing, scale, startNodeIndex) { const r = []; for (let i = 0; i < num; i++) { const a = 2 * Math.PI * i / num; r.push({ x: Math.cos(a) * spacing, y: Math.sin(a) * spacing, scale, startNodeIndex, startFromBeginning: true }); } return r; }
  generatePath() { this.path = []; return this.path; }
}
ZetPath.Spiral = class extends ZetPath {
  generatePath() {
    const o = this.options, path = this.path = []; let angle = 0, radius = o.pathDistance * o.scale;
    const inc = 0.1 + Math.abs(o.curl) * 0.3;
    for (let i = 0; i < o.pathLength; i++) {
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      path.push({ x, y, scale: o.scale });
      angle += inc * Math.sign(o.curl || 1); radius += inc;
      const target = o.pathDistance * o.scale, cur = Math.hypot(x, y); radius *= target / (cur || 1);
    }
    return path;
  }
};
ZetPath.Branching = class extends ZetPath {
  generatePath() {
    const o = this.options, path = this.path = [], bf = Math.max(2, o.factor | 0), depth = Math.floor(Math.log(o.pathLength) / Math.log(bf)), dA = 2 * Math.PI / bf;
    const branch = (d, parent, angle) => {
      if (d === 0) return;
      for (let i = 0; i < bf; i++) {
        const a = angle + (i - (bf - 1) / 2) * dA, r = o.pathDistance * (depth - d + 1);
        path.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, scale: Math.pow(o.scale, depth - d + 1), startNodeIndex: parent, startFromBeginning: false });
        branch(d - 1, path.length - 1, a);
      }
    };
    branch(depth, 0, 0);
    return path;
  }
};
ZetPath.Radial = class extends ZetPath {
  generatePath() {
    const o = this.options, path = this.path = [], nb = Math.min(Math.floor(o.depth), 8), per = Math.min(Math.floor(o.pathLength / nb), 50), sp = Math.max(o.pathDistance, 1), maxLen = o.pathLength * nb;
    let sc = o.scale, layer = [0];
    for (let i = 0; i < nb - 1 && path.length < maxLen; i++) {
      const next = []; sc = Math.max(sc * o.scale, 0.1);
      for (let j = 0; j < layer.length && path.length < maxLen; j++) {
        const kids = this.radialNodes(per, sp, sc, layer[j]);
        path.push(...kids.slice(0, maxLen - path.length));
        next.push(...kids.map((_, k) => path.length - kids.length + k));
      }
      layer = next;
    }
    return path;
  }
};
ZetPath.Empty = class extends ZetPath {};
ZetPath.defaults = { Branching: { factor: 4, pathDistance: 1, pathLength: 64, scale: 0.98 }, Radial: { depth: 8, pathDistance: 5, pathLength: 64, scale: 0.8 }, Spiral: { curl: 0.2, pathDistance: 1, pathLength: 64, scale: 1 } };
ZetPath.create = function (style, options = {}) {
  if (style === 'Random' || !ZetPath[style]) return { zetPath: new ZetPath.Empty(), zetPlacementOverride: true };
  const zp = new ZetPath[style](Object.assign({}, ZetPath.defaults[style], options[style] || {}));
  zp.generatePath();
  return { zetPath: zp, zetPlacementOverride: false };
};

class NodePlacementStrategy {
  constructor(pathObject = {}, nodeObjects = []) { this.nodeObjects = nodeObjects; this.path = (pathObject.zetPath && pathObject.zetPath.path) || []; this.zetPlacementOverride = !!pathObject.zetPlacementOverride; this.currentPathIndex = 0; }
  updatePath(po) { this.path = (po.zetPath && po.zetPath.path) || []; this.zetPlacementOverride = !!po.zetPlacementOverride; this.currentPathIndex = 0; }
  // returns { x, y, scale } relative-ready; null means "random in view"
  calculatePositionAndScale(spread = 1) {
    if (this.zetPlacementOverride) return null;
    const nodes = this.nodeObjects;
    if (!nodes.length) return { first: true };
    if (!this.path.length) return null;
    if (this.currentPathIndex >= this.path.length) this.currentPathIndex = 0;
    const pt = this.path[this.currentPathIndex];
    this.currentPathIndex = (this.currentPathIndex + 1) % this.path.length;
    if (!pt || pt.useCreateTextNode) return null;
    const start = this.getStartNode(pt);
    if (!start) return null;
    return { x: start.pos.x + pt.x * start.scale * spread, y: start.pos.y + pt.y * start.scale * spread, scale: start.scale * pt.scale };
  }
  getStartNode(pt) {
    const nodes = this.nodeObjects; let i = nodes.length - 1;
    if (pt.startNodeIndex !== undefined) i = pt.startFromBeginning ? pt.startNodeIndex : nodes.length - 1 - pt.startNodeIndex;
    return nodes[i] && !nodes[i].removed ? nodes[i] : nodes[nodes.length - 1];
  }
  getPreviewPoints(x, y, scale, spread = 1) {
    const pts = []; let i = this.currentPathIndex;
    for (let k = 0; k < this.path.length; k++) { const p = this.path[i]; x += p.x * scale * spread; y += p.y * scale * spread; scale *= p.scale; pts.push({ x, y }); i = (i + 1) % this.path.length; }
    return pts;
  }
}

/* ───────────── note splitting (zetsplitter.js) ───────────── */
class ZetSplit {
  constructor(maxSentencesPerNote = 5, maxCharsPerNote = 500, connectNotes = false) { this.maxSentencesPerNote = maxSentencesPerNote; this.maxCharsPerNote = maxCharsPerNote; this.connectNotes = connectNotes; }
  splitText(text, tags = { node: '##', ref: '[[' }) {
    const sections = [];
    text.split(/\n\n+/).forEach(p => { const s = p.match(/[^.!?]+[.!?]/g) || [p]; if (s.length > this.maxSentencesPerNote) this._long(s, sections); else if (p.trim()) sections.push(p.trim()); });
    const titleOf = sec => { const w = sec.split(/\s+/).slice(0, 4).join(' '); return (w.length > 4 ? w : sec.slice(0, 30)).replace(/[.,;:!?]+$/, ''); };
    const close = BRACKETS[tags.ref] || '';
    return sections.map((sec, i) => {
      let out = tags.node + ' ' + titleOf(sec) + '\n' + sec;
      if (this.connectNotes) { if (i > 0) out += '\n\n' + tags.ref + titleOf(sections[i - 1]) + close; if (i < sections.length - 1) out += '\n\n' + tags.ref + titleOf(sections[i + 1]) + close; }
      return out;
    });
  }
  _long(sentences, sections) { let cur = ''; sentences.forEach(s => { if (cur.length + s.length > this.maxCharsPerNote) { if (cur.trim()) sections.push(cur.trim()); cur = s; } else cur += ' ' + s; }); if (cur.trim()) sections.push(cur.trim()); }
}

/* ───────────── Zettelkasten text model (zettelkasten.js) ───────────── */
const ZK = {
  forEachRef(line, tags, cb) {
    const open = tags.ref; if (!line || !line.includes(open)) return;
    const close = BRACKETS[open];
    if (close) {
      if (!line.includes(close)) return; let inside = false, buf = '';
      for (let i = 0; i < line.length; i++) {
        if (!inside) { if (line.startsWith(open, i)) { inside = true; buf = ''; i += open.length - 1; } }
        else if (line.startsWith(close, i)) { inside = false; if (buf.trim()) { if (cb(buf.trim())) return; } i += close.length - 1; }
        else buf += line[i];
      }
      return;
    }
    if (line.startsWith(open)) for (const r of line.slice(open.length).split(',')) if (r.trim() && cb(r.trim())) return;
  },
  parse(text, tags) {
    const secs = []; let cur = null;
    String(text || '').split('\n').forEach((line, i) => {
      if (line.startsWith(tags.node)) { cur = { kind: 'text', title: line.slice(tags.node.length).trim().replace(/,/g, '') || 'Untitled', line: i, body: [] }; secs.push(cur); }
      else if (tags.llm && line.startsWith(tags.llm)) { cur = { kind: 'ai', title: line.slice(tags.llm.length).trim() || 'Untitled', line: i, body: [] }; secs.push(cur); }
      else if (cur) cur.body.push(line);
    });
    secs.forEach(s => { s.refs = []; s.body.forEach(l => ZK.forEachRef(l, tags, r => { s.refs.push(r); })); s.bodyText = s.body.join('\n').replace(/^\n+|\s+$/g, ''); });
    return secs;
  },
  replaceInBrackets(s, from, to, tags) {
    const open = tags.ref, close = BRACKETS[open]; if (!close) return s;
    let i = s.indexOf(open);
    while (i !== -1) { const j = s.indexOf(close, i + open.length); if (j !== -1 && s.substring(i + open.length, j).trim() === from.trim()) s = s.substring(0, i + open.length) + to + s.substring(j); i = s.indexOf(open, i + 1); }
    return s;
  },
  rename(text, from, to, tags) {
    const fe = reEsc(from), nodeRE = '(' + reEsc(tags.node) + ')[\\t ]*' + fe + '[\\t ]*', refRE = '(' + reEsc(tags.ref) + ')([^,\\n]+,)*[\\t ]*' + fe + '[\\t ]*(,[^,\\n]+)*';
    const re = new RegExp('(\\n|^)((' + nodeRE + ')|(' + refRE + '))(?=(\\n|$))', 'g');
    const out = String(text).replace(re, (m, p1, p2, p3, p4, p5, p6, p7, p8) => p1 + (p4 ? p4 + ' ' : '') + (p6 ? p6 : '') + (p7 || '') + (p6 && !BRACKETS[tags.ref] ? '' : '') + to + (p8 || ''));
    return ZK.replaceInBrackets(out, from, to, tags);
  },
  sectionRange(text, title, tags) {
    const lines = String(text).split('\n'); let start = -1;
    for (let i = 0; i < lines.length; i++) { const l = lines[i]; if ((l.startsWith(tags.node) && l.slice(tags.node.length).trim().replace(/,/g, '') === title) || (tags.llm && l.startsWith(tags.llm) && l.slice(tags.llm.length).trim() === title)) { start = i; break; } }
    if (start < 0) return null;
    let next = lines.length;
    for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith(tags.node) || (tags.llm && lines[i].startsWith(tags.llm))) { next = i; break; }
    let end = next - 1; while (end > start && !lines[end].trim()) end--;
    return { start, end, next, lines };
  },
  refToken(title, tags) { return tags.ref + title + (BRACKETS[tags.ref] || ''); },
  hasRef(text, from, to, tags) { const r = ZK.sectionRange(text, from, tags); if (!r) return false; let hit = false; for (let i = r.start + 1; i <= r.end; i++) ZK.forEachRef(r.lines[i], tags, x => { if (x.toLowerCase() === to.toLowerCase()) hit = true; return hit; }); return hit; },
  addRef(text, from, to, tags) {
    if (ZK.hasRef(text, from, to, tags)) return text;
    const r = ZK.sectionRange(text, from, tags); if (!r) return text;
    r.lines.splice(r.end + 1, 0, ZK.refToken(to, tags));
    return r.lines.join('\n');
  },
  removeRef(text, from, to, tags) {
    const r = ZK.sectionRange(text, from, tags); if (!r) return text;
    const close = BRACKETS[tags.ref], lines = r.lines;
    for (let i = r.end; i > r.start; i--) {
      let l = lines[i];
      if (close) { const re = new RegExp(reEsc(tags.ref) + '\\s*' + reEsc(to) + '\\s*' + reEsc(close), 'gi'); l = l.replace(re, ''); }
      else if (l.startsWith(tags.ref)) { const parts = l.slice(tags.ref.length).split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== to.toLowerCase()); l = parts.length ? tags.ref + ' ' + parts.join(', ') : ''; }
      if (l !== lines[i]) { if (!l.trim()) lines.splice(i, 1); else lines[i] = l.replace(/\s{2,}/g, ' '); }
    }
    return lines.join('\n');
  },
  setBody(text, title, body, tags) {
    const r = ZK.sectionRange(text, title, tags); if (!r) return text;
    const lines = r.lines, b = String(body).split('\n');
    lines.splice(r.start + 1, r.end - r.start, ...b);
    const after = r.start + 1 + b.length;
    if (after < lines.length && lines[after].trim() && (lines[after].startsWith(tags.node) || (tags.llm && lines[after].startsWith(tags.llm)))) lines.splice(after, 0, '');
    return lines.join('\n');
  },
  removeSection(text, title, tags) {
    const r = ZK.sectionRange(text, title, tags); if (!r) return text;
    let to = r.next; r.lines.splice(r.start, to - r.start);
    return r.lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  },
  append(text, title, body, tags, llm) {
    const head = (llm ? tags.llm : tags.node) + ' ' + title, t = String(text || '');
    const sep = !t ? '' : t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
    return t + sep + head + '\n' + (body || '');
  },
  highlight(text, tags) {
    const close = BRACKETS[tags.ref];
    return String(text).split('\n').map(line => {
      if (line.startsWith(tags.node)) return '<span class="t">' + esc(line) + '</span>';
      if (tags.llm && line.startsWith(tags.llm)) return '<span class="a">' + esc(line) + '</span>';
      let o = esc(line);
      if (close) { const re = new RegExp(reEsc(esc(tags.ref)) + '(.*?)' + reEsc(esc(close)), 'g'); o = o.replace(re, m => '<span class="r">' + m + '</span>'); }
      else if (line.startsWith(tags.ref)) o = '<span class="r">' + o + '</span>';
      return o;
    }).join('\n') + '\n';
  },
  extractTitles(content, tags) { const t = new Set(), re = new RegExp('^' + reEsc(tags.node) + '\\s*(.*)$', 'gm'); let m; while ((m = re.exec(content))) t.add(m[1].trim()); return t; },
  removeTitlesFromContext(content, forget, tags) {
    const keep = []; let skip = false;
    String(content).split('\n').forEach(l => { if (l.startsWith(tags.node)) skip = forget.has(l.slice(tags.node.length).trim()); if (!skip) keep.push(l); });
    return keep.join('\n');
  }
};

/* ───────────── code parsing (gitparsed.js) ───────────── */
function chunkText(text, maxLength = 1200, overlapSize = 0) {
  const chunks = []; let cur = '', line = '';
  for (const ch of text) {
    line += ch;
    if (ch === '\n' || cur.length + line.length > maxLength) {
      if (cur.length + line.length > maxLength) {
        const split = maxLength - cur.length; let good = split;
        while (good > 0 && !/\s/.test(line[good])) good--;
        if (good > 0) { cur += line.substring(0, good); line = line.substring(good); } else { cur += line.substring(0, split); line = line.substring(split); }
        chunks.push(cur); cur = '';
      }
      if (ch === '\n') { cur += line; line = ''; if (cur.length >= maxLength) { chunks.push(cur); cur = ''; } }
    }
  }
  if (cur.length) chunks.push(cur + line); else if (line.length) chunks.push(line);
  if (overlapSize > 0) return chunks.map((c, i) => i ? chunks[i - 1].slice(-overlapSize) + c : c);
  return chunks;
}
const LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', ipynb: 'notebook', html: 'html', htm: 'html', css: 'css', scss: 'css', md: 'markdown', mdx: 'markdown', json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml', svg: 'xml', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', hpp: 'cpp', java: 'java', kt: 'kotlin', php: 'php', rb: 'ruby', rs: 'rust', go: 'go', sh: 'shell', bash: 'shell', sql: 'sql', cs: 'csharp', swift: 'swift', lua: 'lua', r: 'r', m: 'matlab', mq5: 'mql', mqh: 'mql', sol: 'solidity', txt: 'text', ini: 'ini', cfg: 'ini', env: 'ini', dockerfile: 'docker', makefile: 'make' };
const TEXT_EXT = new Set(Object.keys(LANG).concat(['gitignore', 'lock', 'csv', 'tsv', 'rst', 'tex', 'vue', 'svelte', 'astro', 'gradle', 'properties', 'conf', 'bat', 'ps1', 'zsh', 'fish', 'proto', 'graphql', 'gql', 'pyi', 'pxd', 'pyx', 'cmake', 'nix', 'dart', 'scala', 'ex', 'exs', 'erl', 'hs', 'ml', 'clj', 'jl', 'zig', 'v', 'nim']));
function getFileExtension(name) { const base = String(name).split('/').pop().toLowerCase(); if (base === 'dockerfile' || base === 'makefile') return base; const m = base.match(/\.([0-9a-z]+)(?:[?#]|$)/i); return m ? m[1].toLowerCase() : null; }
function isTextPath(p) { const b = String(p).split('/').pop().toLowerCase(); if (/\.min\.(js|css)$/.test(b) || /(^|\/)(node_modules|__pycache__|\.git|dist|build|vendor|\.venv|venv)\//.test(p)) return false; if (/^(readme|license|licence|changelog|contributing|dockerfile|makefile|procfile|requirements[\w.-]*)$/i.test(b.replace(/\.(md|txt|rst)$/, ''))) return true; const e = getFileExtension(p); return !!e && TEXT_EXT.has(e); }
const SPLIT = {
  javascript: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s/m,
  typescript: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum)\s/m,
  python: /^(?:async\s+)?(?:def|class)\s/m, ruby: /^\s*(?:def|class|module)\s/m, php: /^\s*(?:function|class)\s/m,
  java: /^\s*(?:public|private|protected)\s/m, cpp: /^(?:class|struct)\s|^\w[\w<>:*&\s]+\([^;]*\)\s*\{/m, c: /^\w[\w*\s]+\([^;]*\)\s*\{/m,
  rust: /^(?:pub\s+)?(?:fn|struct|enum|impl|trait|mod)\s/m, go: /^(?:func|type)\s/m, css: /^[^\s@{}][^{]*\{/m, html: /^\s*<(?:section|div|script|style|template|head|body|main|article)\b/m,
  markdown: /^#{1,6} /m, yaml: /^---\s*$/m, xml: /^\s*<\w/m
};
function chunkCode(text, lang, max = 1200, overlap = 0) {
  const re = SPLIT[lang], idx = [];
  if (re) { const g = new RegExp(re.source, 'gm'); let m; while ((m = g.exec(text))) { idx.push(m.index); if (g.lastIndex === m.index) g.lastIndex++; } }
  let chunks = [];
  if (idx.length) {
    let start = 0, size = 0;
    idx.forEach((s, k) => { const e = idx[k + 1] || text.length, len = e - s; if (size + len > max && s > start) { chunks.push(text.slice(start, s).trim()); start = s; size = len; } else size += len; });
    chunks.push(text.slice(start).trim());
  } else chunks = [text];
  return chunks.filter(Boolean).flatMap(c => (c.length > max ? chunkText(c, max, overlap) : [c]));
}
function analyzeCode(path, text, opts = {}) {
  const ext = getFileExtension(path) || '', lang = LANG[ext] || (ext === 'dc' ? 'html' : 'text'), t = String(text || '');
  const L = /\.dc\.html$/.test(path) ? 'html' : lang;
  const symbols = [], imports = [], add = (arr, v) => { if (v && arr.length < 400 && !arr.includes(v)) arr.push(v); };
  const sym = (re, k) => { let m; re.lastIndex = 0; while ((m = re.exec(t)) && symbols.length < 400) symbols.push({ n: m[1], k, l: t.slice(0, m.index).split('\n').length }); };
  const imp = re => { let m; re.lastIndex = 0; while ((m = re.exec(t))) add(imports, (m[1] || '').trim()); };
  if (L === 'python') { sym(/^\s*(?:async\s+)?def\s+(\w+)/gm, 'def'); sym(/^\s*class\s+(\w+)/gm, 'class'); imp(/^\s*from\s+([\w.]+)\s+import\b/gm); let m; const re = /^\s*import\s+([\w., ]+)/gm; while ((m = re.exec(t))) m[1].split(',').forEach(x => add(imports, x.trim().split(/\s+as\s+/)[0])); }
  else if (L === 'javascript' || L === 'typescript') { sym(/(?:^|[\s;])function\*?\s+([A-Za-z_$][\w$]*)/g, 'function'); sym(/(?:^|[\s;])class\s+([A-Za-z_$][\w$]*)/g, 'class'); sym(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g, 'function'); if (L === 'typescript') { sym(/interface\s+(\w+)/g, 'interface'); sym(/\btype\s+(\w+)\s*=/g, 'type'); } imp(/import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g); imp(/require\(\s*['"]([^'"]+)['"]\s*\)/g); imp(/import\(\s*['"]([^'"]+)['"]\s*\)/g); }
  else if (L === 'html') { imp(/<(?:script|img|iframe|source|video|audio)[^>]+src=["']([^"'{}]+)["']/g); imp(/<link[^>]+href=["']([^"'{}]+)["']/g); imp(/\bfrom=["']([^"'{}]+)["']/g); let m; const re = /<dc-import[^>]+name=["']([^"'{}]+)["']/g; while ((m = re.exec(t))) add(imports, m[1] + '.dc.html'); sym(/<(?:section|div)[^>]+data-screen-label=["']([^"']+)["']/g, 'screen'); sym(/^\s{2}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm, 'method'); }
  else if (L === 'css') imp(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g);
  else if (L === 'markdown') { sym(/^#{1,3}\s+(.+)$/gm, 'heading'); imp(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g); }
  else if (L === 'rust') { sym(/\bfn\s+(\w+)/g, 'fn'); sym(/\b(?:struct|enum|trait)\s+(\w+)/g, 'type'); imp(/^\s*use\s+([\w:]+)/gm); }
  else if (L === 'go') { sym(/^func\s+(?:\([^)]*\)\s*)?(\w+)/gm, 'func'); sym(/^type\s+(\w+)/gm, 'type'); imp(/^\s*"([\w./-]+)"/gm); }
  else if (L === 'ruby') { sym(/^\s*def\s+([\w?!.]+)/gm, 'def'); sym(/^\s*(?:class|module)\s+(\w+)/gm, 'class'); imp(/require(?:_relative)?\s+['"]([^'"]+)['"]/g); }
  else if (L === 'java' || L === 'kotlin' || L === 'csharp') { sym(/\b(?:class|interface|enum)\s+(\w+)/g, 'class'); imp(/^\s*(?:import|using)\s+([\w.]+)/gm); }
  else if (L === 'cpp' || L === 'c' || L === 'mql') { sym(/^\s*(?:class|struct)\s+(\w+)/gm, 'class'); sym(/^[\w<>:*&\s]+?\b(\w+)\s*\([^;{]*\)\s*\{/gm, 'function'); imp(/#include\s+["<]([^">]+)[">]/g); }
  const chunks = opts.chunks === false ? [] : chunkCode(t, L, opts.max || 1200, opts.overlap || 0);
  return { path, ext, lang: L, size: t.length, loc: t ? t.split('\n').length : 0, symbols, imports, chunks };
}
function resolveImport(fromPath, spec, files) {
  if (!spec) return null;
  const has = p => files.has(p) ? p : null, dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const norm = p => { const out = []; p.split('/').forEach(s => { if (!s || s === '.') return; if (s === '..') out.pop(); else out.push(s); }); return out.join('/'); };
  if (/^https?:/.test(spec)) return null;
  if (spec.startsWith('.') || spec.startsWith('/') || /\.\w+$/.test(spec)) {
    const base = norm(spec.startsWith('/') ? spec : (dir ? dir + '/' : '') + spec);
    return has(base) || has(base + '.js') || has(base + '.ts') || has(base + '.tsx') || has(base + '.jsx') || has(base + '/index.js') || has(base + '/index.ts') || has(base + '.py') || has(norm(spec));
  }
  const mod = spec.replace(/\./g, '/');
  return has(mod + '.py') || has(mod + '/__init__.py') || has((dir ? dir + '/' : '') + mod + '.py') || has('src/' + mod + '.py') || null;
}

/* ───────────── local embeddings + vector store (search.js · embeddingsdb.js) ───────────── */
const DIM = 256, STOP = new Set('the a an and or of to in on for with is are was were be by as at it this that from not but if then else return import def class function const let var self true false none null'.split(' '));
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function embed(text) {
  const v = new Float32Array(DIM), raw = String(text || '').slice(0, 24000).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const words = raw.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
  const add = (tok, w) => { const hh = fnv(tok); v[hh % DIM] += (hh & 0x10000 ? 1 : -1) * w; };
  for (let i = 0; i < words.length; i++) { const w = words[i]; add(w, 1); if (w.length > 4) for (let k = 0; k + 3 <= w.length; k += 2) add('#' + w.substr(k, 3), 0.22); if (i) add(words[i - 1] + '_' + w, 0.45); }
  let m = 0; for (let i = 0; i < DIM; i++) { const x = v[i]; v[i] = (x < 0 ? -1 : 1) * Math.log1p(Math.abs(x)); m += v[i] * v[i]; }
  m = Math.sqrt(m) || 1; for (let i = 0; i < DIM; i++) v[i] /= m;
  return v;
}
function cosine(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; }
class VectorDB {
  constructor() { this.items = []; this.keys = new Map(); }
  get size() { return this.items.length; }
  add(key, chunks, meta = {}) { this.remove(key); const list = []; (chunks || []).forEach((text, i) => { if (!text || !text.trim()) return; const it = { key, i, text, v: embed(text), meta }; this.items.push(it); list.push(it); }); this.keys.set(key, list.length); return list.length; }
  remove(key) { if (!this.keys.has(key)) return; this.items = this.items.filter(x => x.key !== key); this.keys.delete(key); }
  clear() { this.items = []; this.keys.clear(); }
  search(query, topN = 5, keys) {
    const q = embed(query), set = keys ? new Set(keys) : null, words = String(query).toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 2), top = [];
    for (const it of this.items) {
      if (set && !set.has(it.key)) continue;
      let s = cosine(q, it.v); if (words.length) { const low = it.text.toLowerCase(); for (const w of words) if (low.includes(w)) s += 0.08; }
      if (top.length < topN) { top.push({ it, s }); top.sort((a, b) => b.s - a.s); }
      else if (s > top[top.length - 1].s) { top[top.length - 1] = { it, s }; top.sort((a, b) => b.s - a.s); }
    }
    return top.map(({ it, s }) => ({ key: it.key, chunk: it.i, text: it.text, relevanceScore: s, meta: it.meta }));
  }
}
class LRUCache { constructor(max) { this.max = max; this.cache = new Map(); } get(k) { const v = this.cache.get(k); if (v !== undefined) { this.cache.delete(k); this.cache.set(k, v); } return v; } set(k, v) { if (this.cache.size >= this.max) this.cache.delete(this.cache.keys().next().value); this.cache.set(k, v); } }

/* keyword search (search.js · nodesForSearchTerm) and hybrid scoring (Embeddings.search) */
function keywordRank(items, term, getText) {
  const kw = String(term).toLowerCase().split(' ').filter(Boolean), out = [];
  items.forEach(it => { if (!kw.length) return; const s = getText(it).toLowerCase(); let n = 0; for (const k of kw) if (s.includes(k)) n++; if (n) out.push({ it, numMatches: n }); });
  out.sort((a, b) => b.numMatches - a.numMatches);
  return out;
}
function hybridScore(term, title, content, qv, nv) {
  const low = String(term).toLowerCase(), kws = low.split(/,\s*/).filter(Boolean);
  const titleScore = String(title).toLowerCase().includes(low) ? 10 : 0;
  let contentScore = 0; kws.forEach(k => { try { if (new RegExp('\\b' + reEsc(k) + '\\b', 'i').test(content)) contentScore++; } catch (e) {} });
  const sim = qv && nv ? cosine(qv, nv) : 0;
  return { titleScore, contentScore, similarity: sim, scoreSum: titleScore + contentScore + sim };
}

NS.core = { version: '1.0.0', vec2, ZERO, gaussianRandom2, lerp, clamp, esc, reEsc, DEFAULTS, FRACTAL_KEYS, PALETTES, BRACKETS, FRACTALS, Fractal, generateBoundaryPoints, ZetPath, NodePlacementStrategy, ZetSplit, ZK, chunkText, chunkCode, analyzeCode, resolveImport, getFileExtension, isTextPath, LANG, embed, cosine, VectorDB, LRUCache, keywordRank, hybridScore, DIM };
Object.assign(NS, { vec2, Fractal, ZetPath, ZetSplit, NodePlacementStrategy, VectorDB, embed, cosine, code: { analyze: analyzeCode, chunk: chunkCode, chunkText, resolveImport, isTextPath, getFileExtension, LANG } });
})();
