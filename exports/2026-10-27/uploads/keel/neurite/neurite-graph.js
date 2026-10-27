/* Neurite graph model · nodes, edges, autopilot, Neural API, automata
   Ported from satellitecomponent/Neurite: nodeclass.js, edgeclass.js, nodeutilities.js, connect.js,
   nodestep.js (Autopilot.update), interface.js (Autopilot), movenodes.js, neuralapi.js, automata.js. */
(function () {
'use strict';
const NS = window.Neurite, C = NS.core, vec2 = C.vec2, clamp = C.clamp;
if (NS.graph) return;

const SIZES = { text: [260, 170], ai: [330, 320], link: [300, 128], image: [280, 220], code: [360, 290], file: [370, 260], repo: [300, 168], chip: [150, 62] };
const ICONS = { text: 'ph-note-pencil', ai: 'ph-sparkle', link: 'ph-link', image: 'ph-image', code: 'ph-code', file: 'ph-file-code', repo: 'ph-git-branch', chip: 'ph-circle' };

/* ───────────── Node (nodeclass.js) ───────────── */
class Node {
  constructor(s, o = {}) {
    this.s = s; this.uuid = o.uuid != null ? String(o.uuid) : s.nextUuid();
    this.type = o.type || 'text'; this.title = o.title || ''; this.text = o.text || ''; this.data = Object.assign({}, o.data || {});
    this.pos = o.pos ? new vec2(o.pos.x ?? o.pos[0], o.pos.y ?? o.pos[1]) : s.viewCenter();
    this.vel = new vec2(0, 0); this.force = new vec2(0, 0);
    this.scale = o.scale ?? s.defaultScale(); this.intrinsicScale = 1; this.frictionConstant = 0.2;
    this.anchor = this.pos; this.anchorForce = o.anchored ? 1 : 0; this.followingMouse = 0; this.mouseAnchor = new vec2(0, 0);
    this.randomNodeFlowRange = (Math.random() - 0.5) * s.S.flowDirectionRandomRange;
    this.createdAt = o.createdAt || new Date().toISOString(); this.edges = []; this.removed = false;
    const sz = SIZES[this.type] || SIZES.text; this.w = o.w || sz[0]; this.h = o.h || sz[1];
    this.collapsed = !!o.collapsed; this.group = o.group || null; this.kind = o.kind || null; this.color = o.color || null;
    this.icon = o.icon || ICONS[this.type] || 'ph-circle'; this.chrome = o.chrome || (this.type === 'chip' ? 'chip' : 'window');
    this.transient = !!o.transient; this.hidden = false; this._g = null; this._phase = (Math.random() * 4) | 0; this._target = null;
  }
  get isTextNode() { return this.type === 'text'; }
  get isLLM() { return this.type === 'ai'; }
  get isLink() { return this.type === 'link'; }
  getTitle() { return this.title; }
  getText() { return this.type === 'ai' ? (this.data.draft || '') : this.type === 'code' ? (this.data.code || '') : this.text; }
  dispW() { return this.collapsed ? 60 : this.w; }
  dispH() { return this.collapsed ? 60 : this.h; }
  zWidth() { return 2 * this.dispW() * this.scale / 800; }
  step(dt) {
    if (this.anchorForce === 1 && !this.followingMouse && !this._target) return;
    dt = isNaN(dt) ? 0 : Math.min(dt, 1);
    this.updatePosition(dt); this.applyMandelbrotForce(); this.applyAnchorForce(); this.applyTarget(); this.handleMouseInteraction(dt);
  }
  updatePosition(dt) {
    if (!this.followingMouse && this.anchorForce == 0) {
      this.pos = this.pos.plus(this.vel.scale(dt / 2)); this.vel = this.vel.plus(this.force.scale(dt)); this.pos = this.pos.plus(this.vel.scale(dt / 2));
      this.force = this.vel.scale(-Math.min(this.vel.mag() + this.frictionConstant + this.anchorForce, 1 / (dt + 1e-300)));
      if (!this.pos.isFinite()) { this.pos = this.anchor; this.vel = new vec2(0, 0); this.force = new vec2(0, 0); }
    } else { this.vel = new vec2(0, 0); this.force = new vec2(0, 0); }
  }
  applyMandelbrotForce() {
    const s = this.s, S = s.S;
    if (this.anchorForce !== 0 || !S.fractalForce || this.followingMouse) return;
    let g = this._g;
    if (!g || s.nodes.size < 120 || (s.frame + this._phase) % 4 === 0) g = this._g = s.fr.grad(S.iterations, this.pos, undefined, s.fr.epsFor(this.scale));
    const g2 = g.mag2(); if (!(g2 > 0) || !isFinite(g2)) return;
    if (S.useFlowDirection) this.force = this.force.plus(g.rot(S.flowDirectionRotation + this.randomNodeFlowRange).normed().scale(g.mag()).unscale((g2 + 1e-10) * 300));
    else this.force = this.force.plus(g.unscale((g2 + 1e-10) * 300));
  }
  applyAnchorForce() { this.force = this.force.plus(this.anchor.minus(this.pos).scale(this.anchorForce)); }
  applyTarget() {
    const t = this._target; if (!t) return;
    const d = t.z.minus(this.pos), m = d.mag();
    if (m < t.tol * this.scale || performance.now() > t.until) { this._target = null; t.done && t.done(); return; }
    if (this.anchorForce) { this.pos = this.pos.plus(d.scale(0.12)); this.anchor = this.pos; return; }
    this.force = this.force.plus(d.normed().scale(Math.min(0.002 * this.scale, m)));
  }
  handleMouseInteraction(dt) {
    if (!this.followingMouse) return;
    const s = this.s, p = s.mouseZ.minus(this.mouseAnchor);
    let v = p.minus(this.pos).unscale(s.nodeMode ? 1 : Math.max(dt, 0.05));
    if (!v.isFinite()) v = new vec2(0, 0);
    this.vel = v; this.pos = p; this.anchor = this.pos;
    if (s.nodeMode === 1) updateNodeEdgesLength(this);
    if (!s.selected.has(this.uuid)) return;
    s.selected.forEach(id => { const n = s.nodes.get(id); if (!n || n === this || n.anchorForce === 1) return; n.vel = v; if (s.nodeMode === 1) updateNodeEdgesLength(n); });
  }
  moveNode(angle, f = 0.01) { const a = f * this.scale, d = new vec2(Math.cos(angle) * a, Math.sin(angle) * a); if (this.anchorForce) { this.pos = this.pos.plus(d.scale(3)); this.anchor = this.pos; } else this.force = this.force.plus(d); return d; }
  moveTo(x, y, tol = 1, done) { this._target = { z: new vec2(x, y), tol, done, until: performance.now() + 4000 }; }
  searchStrings() { const d = this.data, out = [this.title, this.text]; if (d.url) out.push(d.url); if (d.path) out.push(d.path); if (d.desc) out.push(d.desc); if (d.code) out.push(d.code); if (d.sub) out.push(d.sub); if (d.msgs) d.msgs.forEach(m => out.push(m.text)); if (d.symbols) out.push(d.symbols.map(x => x.n).join(' ')); return out.filter(Boolean); }
  forEachConnectedNode(cb) { this.edges.forEach(e => { const o = e.other(this); if (o) cb(o, e); }); }
  getEdgeDirectionalities() { return this.edges.map(edge => ({ edge, directionality: edge.getDirectionRelativeTo(this) })); }
  topologicalSort(visited, stack, filterAfterLLM = false, branch) {
    visited.add(this.uuid); stack.push(this);
    if (this.isLLM) { if (branch === null) branch = this.uuid; else if (branch !== this.uuid && branch !== undefined) return; }
    this.forEachConnectedNode(n => { if (visited.has(n.uuid)) return; n.topologicalSort(visited, stack, n.isLLM || filterAfterLLM, branch); });
  }
  traverseConnectedNodes(cb, filterAfterLLM = false) { const visited = new Set(), stack = []; this.topologicalSort(visited, stack, filterAfterLLM, filterAfterLLM ? null : undefined); while (stack.length) { const n = stack.pop(); if (n.uuid !== this.uuid) cb(n); } }
  getAllConnectedNodes(f) { const a = []; this.traverseConnectedNodes(n => a.push(n), f); return a; }
}
Node.parentAvailableFromRoot = function (root, max = 3, filterAfterLLM = false) {
  const q = [root], seen = new Set([root.uuid]);
  while (q.length) {
    const n = q.shift(), kids = []; n.forEachConnectedNode(k => { if (k.isTextNode) kids.push(k); });
    if (kids.length < max && (n.isTextNode || (filterAfterLLM && n.isLLM) || n === root)) return n;
    kids.forEach(k => { if (!seen.has(k.uuid)) { seen.add(k.uuid); q.push(k); } });
  }
  return root;
};
function updateNodeEdgesLength(n) { n.edges.forEach(e => { if (e.currentLength) e.length = e.currentLength; }); }

/* ───────────── Edge (edgeclass.js) ───────────── */
class Edge {
  constructor(s, a, b, o = {}) {
    this.s = s; this.pts = [a, b]; this.length = o.length ?? 0.6; this.currentLength = this.length; this.strength = o.strength ?? 0.1;
    this.style = o.style || {}; this.kind = o.kind || 'link'; this.zk = !!o.zk; this.transient = !!o.transient;
    this.edgeKey = Edge.key(a, b);
    const d = s.edgeDirectionalities[this.edgeKey];
    this.directionality = d ? { start: d.start, end: d.end } : { start: null, end: null };
    if (o.dir === 'ab') this.directionality = { start: a, end: b }; else if (o.dir === 'ba') this.directionality = { start: b, end: a };
    this.hover = false; this._poly = null;
  }
  static key(a, b) { return [a.uuid, b.uuid].sort().join('|'); }
  other(n) { return this.pts[0] === n ? this.pts[1] : this.pts[1] === n ? this.pts[0] : null; }
  center() { return this.pts[0].pos.plus(this.pts[1].pos).scale(0.5); }
  step() {
    const avg = this.center();
    for (const n of this.pts) {
      if (n.anchorForce !== 0) continue;
      const d = n.pos.minus(avg), m = d.mag(); this.currentLength = m;
      if (m === this.length) continue;
      n.force = n.force.plus(d.scale((1 - this.length / (m + 1e-300)) * 0.4).scale(-this.strength));
    }
  }
  stress() { const avg = this.center(); return this.pts.reduce((t, n) => t + n.pos.minus(avg).mag() - this.length, 0) / (this.length + 1); }
  scaleLength(f) { const avg = this.center(); this.length *= f; this.pts.forEach(n => { if (n.anchorForce !== 1) n.pos = n.pos.minus(avg).scale(f).plus(avg); else { n.pos = n.pos.minus(avg).scale(f).plus(avg); n.anchor = n.pos; } }); }
  getDirectionRelativeTo(n) { if (this.directionality.end === n) return 'outgoing'; if (this.directionality.start === n) return 'incoming'; return 'none'; }
  canSend(from) { const d = this.directionality; return !d.start || d.start === from; }
  toggleDirection() {
    const s = this.s, [p0, p1] = this.pts, d = this.directionality;
    const st = d.start === p0 ? '0-1' : d.start === p1 ? '1-0' : 'dflt';
    d.start = st === '0-1' ? p1 : st === '1-0' ? null : p0;
    d.end = st === '0-1' ? p0 : st === '1-0' ? null : p1;
    if (p0.isTextNode && p1.isTextNode) {
      const a = p0.title, b = p1.title, zk = s.zk;
      if (d.start === p0) { zk.addRef(b, a); zk.removeRef(a, b); }
      else if (d.start === p1) { zk.addRef(a, b); zk.removeRef(b, a); }
      else { zk.addRef(a, b); zk.addRef(b, a); }
    }
    s.edgeDirectionalities[this.edgeKey] = { start: d.start, end: d.end };
    s.changed();
  }
}

/* ───────────── Autopilot (interface.js · nodestep.js) ───────────── */
class Autopilot {
  constructor(s) { this.s = s; this.panToI = new vec2(0, 0); this.panToI_prev = null; this.referenceFrame = null; this.referenceScalePrev = 1; this.speed = 0; this.targetPan = new vec2(0, 0); this.targetZoom = new vec2(4, 0); this.threshold = 1e-6; this.until = 0; }
  isMoving() { return this.speed !== 0; }
  reset() { this.speed = 0; this.until = 0; return this.setNode(); }
  setNode(n = null) { this.referenceFrame = n; this.panToI_prev = null; return this; }
  skip() { const s = this.s; s.zoom = this.targetZoom; s.pan = this.referenceFrame ? this.referenceFrame.pos.plus(this.targetPan) : this.targetPan; return this; }
  start(speed = this.s.S.autopilotSpeed, ms = 0) { this.speed = speed; this.until = ms ? performance.now() + ms : 0; return this; }
  stop() { this.speed = 0; return this; }
  targetZoom_scaleBy(f) { this.targetZoom = this.targetZoom.scale(f); return this; }
  vectorsCloseEnough(a, b, t = this.threshold) { return a.minus(b).mag() < t; }
  zoomToFrame(n, k = 1) { const s = this.s, gz = s.zoom.mag2() * ((n.scale * k) ** (-1 / s.S.zoomContentExp)); return this.zoomToFrameByGz(n, gz); }
  zoomToFitFrame(n, margin = 1.25) {
    const s = this.s, sc = s.nodeScale(n), w = n.dispW() * sc, h = n.dispH() * sc, aspect = s.W / s.H;
    const scale = h * aspect > w ? s.H / (margin * h) : s.W / (margin * w);
    return this.zoomToFrameByGz(n, (1 / scale) ** (-1 / s.S.zoomContentExp));
  }
  zoomToFrameByGz(n, gz) { this.panToI = new vec2(0, 0); this.referenceFrame = n; this.panToI_prev = null; this.targetPan = new vec2(0, 0); this.targetZoom = this.s.zoom.unscale(gz ** 0.5); return this; }
  update() {
    if (!this.speed) return;
    const s = this.s, S = s.S, oldPan = s.pan, rf = this.referenceFrame; let newPan;
    if (rf && !rf.removed) {
      if (!this.panToI_prev) { this.panToI_prev = rf.pos.scale(1); this.referenceScalePrev = rf.scale; }
      this.panToI = this.panToI.scale(1 - S.autopilotRF_Iscale).plus(rf.pos.minus(this.panToI_prev).scale(S.autopilotRF_Iscale));
      newPan = oldPan.scale(1 - this.speed).plus(rf.pos.plus(this.targetPan).scale(this.speed).plus(this.panToI));
      this.panToI_prev = rf.pos.scale(1);
      if (rf.scale !== this.referenceScalePrev) { const f = clamp(rf.scale / this.referenceScalePrev, 0.9, 1.1); this.targetZoom = this.targetZoom.scale(f); this.referenceScalePrev = rf.scale; }
    } else { newPan = oldPan.scale(1 - this.speed).plus(this.targetPan.scale(this.speed)); this.panToI_prev = null; }
    const travel = oldPan.minus(newPan).mag() / s.zoom.mag();
    if (travel > S.autopilotMaxSpeed) {
      newPan = oldPan.plus(newPan.minus(oldPan).scale(S.autopilotMaxSpeed / travel));
      const k = Math.tanh(Math.log(S.autopilotMaxSpeed / travel + 1e-300) / 10) * 2;
      s.zoom = s.zoom.scale(1 - k * this.speed);
    } else s.zoom = s.zoom.scale(1 - this.speed).plus(this.targetZoom.scale(this.speed));
    s.pan = newPan;
    const goal = rf ? rf.pos.plus(this.targetPan) : this.targetPan;
    if (this.until && performance.now() > this.until) this.reset();
    else if (s.pan.minus(goal).mag() < 1e-4 * s.zoom.mag() && Math.abs(s.zoom.mag() / this.targetZoom.mag() - 1) < 1e-3 && !this.hold) this.reset();
  }
}

/* ───────────── Neural API (neuralapi.js) ───────────── */
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function makeNeuralAPI(s) {
  let active = 0;
  const anim = (duration, update, done) => new Promise((resolve, reject) => {
    active++; const t0 = performance.now();
    const fr = () => { let p = duration > 0 ? Math.min((performance.now() - t0) / duration, 1) : 1; try { update(ease(p)); } catch (e) { active--; reject(e); return; } if (p < 1 && !(done && done())) requestAnimationFrame(fr); else { active--; resolve(); } };
    if (s.headless) { try { update(1); } catch (e) { active--; reject(e); return; } active--; resolve(); } else requestAnimationFrame(fr);
  });
  const camAnim = (endPan, endZoom, duration = 1000, rot = null) => {
    const sp = s.pan, sz = s.zoom, lz0 = sz.clog(), lz1 = endZoom ? endZoom.clog() : null;
    if (lz1 && Math.abs(lz1.y - lz0.y) > Math.PI) lz1.y += lz1.y < lz0.y ? 2 * Math.PI : -2 * Math.PI;
    s.autopilot.reset();
    return anim(duration, t => {
      s.pan = sp.lerpto(endPan, t);
      if (lz1) s.zoom = lz0.lerpto(lz1, t).cexp();
      if (rot) { const r = new vec2(Math.cos(rot.angle * t), Math.sin(rot.angle * t)), zc = rot.pivot.minus(s.pan); s.zoom = s.zoom.cmult(r); s.pan = s.pan.plus(zc.cmult(new vec2(1, 0).minus(r))); }
      s.camMoved();
    });
  };
  const DEFAULT_MOVES = { panLeft: { p: { deltaX: -200, deltaY: 0 } }, panRight: { p: { deltaX: 200, deltaY: 0 } }, panUp: { p: { deltaX: 0, deltaY: -150 } }, panDown: { p: { deltaX: 0, deltaY: 150 } }, zoomIn: { z: { zoomFactor: 0.3 } }, zoomOut: { z: { zoomFactor: 3 } }, rotateClockwise: { r: { rotationAngle: 90 } }, rotateCounterClockwise: { r: { rotationAngle: -90 } }, rotate180: { r: { rotationAngle: 180 } } };
  const api = {
    get activeCount() { return active; },
    zoom(zoomFactor, x = s.W / 2, y = s.H / 2, duration = 1000) { const inv = 1 / zoomFactor, dest = s.xyToZ(x, y); return camAnim(dest.scale(1 - inv).plus(s.pan.scale(inv)), s.zoom.scale(inv), duration); },
    pan(dx, dy, duration = 1000) { return camAnim(s.pan.plus(s.toDZ(dx * s.S.panSpeed, dy * s.S.panSpeed)), null, duration); },
    rotate(angleDeg, x = s.W / 2, y = s.H / 2, duration = 1000) { return camAnim(s.pan, s.zoom, duration, { angle: angleDeg * Math.PI / 180, pivot: s.xyToZ(x, y) }); },
    movement(moves = [], cz = {}, cp = {}, cr = {}, d = 1000) {
      const z = {}, p = {}, r = {}; [].concat(moves).forEach(m => { const df = DEFAULT_MOVES[m] || {}; Object.assign(z, df.z || {}); Object.assign(p, df.p || {}); Object.assign(r, df.r || {}); });
      Object.assign(z, cz); Object.assign(p, cp); Object.assign(r, cr);
      let endPan = Object.keys(p).length ? s.pan.plus(s.toDZ((p.deltaX || 0) * s.S.panSpeed, (p.deltaY || 0) * s.S.panSpeed)) : s.pan, endZoom = s.zoom;
      if (z.zoomFactor !== undefined && z.zoomFactor !== 1) { endPan = s.xyToZ(z.zoomX ?? s.W / 2, z.zoomY ?? s.H / 2).scale(1 - z.zoomFactor).plus(endPan.scale(z.zoomFactor)); endZoom = s.zoom.scale(z.zoomFactor); }
      return camAnim(endPan, endZoom, d, r.rotationAngle !== undefined ? { angle: r.rotationAngle * Math.PI / 180, pivot: s.xyToZ(r.pivotX ?? s.W / 2, r.pivotY ?? s.H / 2) } : null);
    },
    goToCoords(zoomMagnitude, panReal, panImaginary, speed = 0.1) {
      const zm = parseFloat(zoomMagnitude), tz = zm ? s.zoom.scale(zm / s.zoom.mag()) : s.zoom, tp = new vec2(parseFloat(panReal), parseFloat(panImaginary));
      if (s.headless) { s.zoom = tz; s.pan = tp; return Promise.resolve(); }
      const ap = s.autopilot; ap.setNode(); ap.targetPan = tp; ap.targetZoom = tz; ap.hold = true; ap.start(speed > 1 ? undefined : speed);
      const t0 = performance.now();
      return anim(1, () => {}, () => false).then(() => new Promise(res => {
        const chk = () => { const close = ap.vectorsCloseEnough(s.zoom, tz, 1e-6 * tz.mag() + 1e-12) && ap.vectorsCloseEnough(s.pan, tp, 1e-6 * tz.mag() + 1e-12); if (!ap.isMoving() || close || performance.now() - t0 > 12000) { if (close) { s.pan = tp; s.zoom = tz; } ap.hold = false; ap.reset(); res(); } else requestAnimationFrame(chk); };
        chk();
      }));
    },
    zoomToNodeTitle(nodeOrTitle, zoomLevel = 1.0, delayMs = 3000) {
      const n = typeof nodeOrTitle === 'object' ? nodeOrTitle : s.nodeByTitle(String(nodeOrTitle));
      if (!n) return Promise.resolve(null);
      s.zoomTo(n, { level: zoomLevel });
      return new Promise(res => { const t0 = performance.now(), chk = () => { if (!s.autopilot.isMoving() || performance.now() - t0 > delayMs) { if (performance.now() - t0 > delayMs) s.autopilot.reset(); res(n); } else setTimeout(chk, 100); }; s.headless ? res(n) : setTimeout(chk, 120); });
    },
    async searchNotes(term, max) { return s.searchNodes(term, { mode: 'semantic', max: max || 8 }); },
    async searchAndZoom(term, max = null, level = 1.0, delayBetween = 2000) { const ns = await api.searchNotes(term, max); for (const n of ns) { await api.zoomToNodeTitle(n, level); await C_wait(delayBetween); } return ns; },
    resetView(animate = true, duration = 2000) { const dz = s.zoom.scale(1.3 / s.zoom.mag()), dp = new vec2(-0.3, 0); if (!animate) { s.zoom = dz; s.pan = dp; s.camMoved(); return Promise.resolve(); } return camAnim(dp, dz, duration); },
    getCoords(forCall = false) { const z = s.zoom.mag().toExponential(), a = s.pan.x.toExponential(), b = s.pan.y.toExponential(); return forCall ? 'setMandelbrotCoords(' + z + ', ' + a + ', ' + b + ', 0.1);' : { zoom: z, pan: a + '+i' + b }; },
    async queueAnimations(list) { for (const a of list) { const fn = typeof a[0] === 'function' ? a[0] : api[a[0]]; const args = Array.isArray(a[1]) ? a[1] : [a[1]]; if (fn) await fn(...args); if (a[2]) await C_wait(a[2]); } },
    async exploreBoundaryPoints({ numPoints = 100, zoomLevel = 0.0005, randomizePan = false, randomizeZoom = false, sequential = true, methods = ['cardioid', 'disk', 'spike'] } = {}) {
      let pts = C.generateBoundaryPoints(numPoints, methods); if (!sequential) pts = pts.sort(() => Math.random() - 0.5);
      for (const p of pts) await api.goToCoords(randomizeZoom ? Math.random() * zoomLevel : zoomLevel, randomizePan ? p.x + (Math.random() - 0.5) * 0.002 : p.x, randomizePan ? p.y + (Math.random() - 0.5) * 0.002 : p.y, 0.1);
    },
    addNote(title, text) { return s.zk.addNote(String(title).replace(/\n/g, ' '), text ?? '', { random: true }); },
    async promptZettelkasten(message) { return s.promptZettelkasten(message); },
    getUserResponse(message) { return Promise.resolve(window.prompt(message)); },
    delay(ms) { return C_wait(ms); },
    createNode: (type, o) => s.createNode(type, o), connect: (a, b, o) => s.connect(s.resolve(a), s.resolve(b), o), pulse: (a, b, o) => s.pulse(a, b, o),
    setFractal: (type, patch) => s.setSettings(Object.assign({ fractal: type }, patch || {})), fit: (ns) => s.fit(ns), nodes: () => [...s.nodes.values()], edges: () => [...s.edges.values()]
  };
  const REG = [
    ['neuriteAddNote', 'addNote', ['addNote', 'createNote', 'zettelkastenAddNote', 'promptNote']],
    ['neuritePromptZettelkasten', 'promptZettelkasten', ['promptZettelkasten', 'zettelkastenPrompt', 'promptZettelkastenAi', 'callZettelkastenAi', 'zettelkastenAi']],
    ['neuriteGetUserResponse', 'getUserResponse', ['getUserResponse', 'promptUser', 'requestUserResponse']],
    ['neuriteZoomToNodeTitle', 'zoomToNodeTitle', ['zoomToNodeTitle', 'focusNode', 'zoomToNote', 'zoomToNoteByTitle', 'zoomToNode']],
    ['neuriteQueueAnimations', 'queueAnimations', ['queueAnimations', 'performSequence', 'neuritePerformSequence']],
    ['neuriteResetView', 'resetView', ['resetView', 'returnToStart', 'reinitializeView']],
    ['neuriteSetMandelbrotCoords', 'goToCoords', ['setMandelbrotCoords', 'updateMandelbrotPosition', 'mandelbrotCoords']],
    ['neuriteMovement', 'movement', ['movement', 'startMovement', 'performMovement']],
    ['neuriteDelay', 'delay', ['delay', 'setDelay']],
    ['neuriteSearchNotes', 'searchNotes', ['searchNotes', 'returnSearchedNodes', 'searchNodes']],
    ['neuriteSearchAndZoom', 'searchAndZoom', ['searchAndZoom', 'searchZoom', 'zoomToRelevantNodes']],
    ['neuriteExploreBoundaryPoints', 'exploreBoundaryPoints', ['exploreBoundaryPoints', 'exploreBoundary']],
    ['neuriteZoom', 'zoom', ['zoom', 'animateZoom']], ['neuritePan', 'pan', ['pan', 'animatePan']], ['neuriteRotate', 'rotate', ['rotate', 'animateRotate']],
    ['neuriteGetCoords', 'getCoords', ['getCoords']]
  ];
  const registry = {};
  REG.forEach(([base, key, alts]) => { const fn = (...a) => api[key](...a); registry[base] = fn; alts.forEach(n => { registry[n] = fn; }); });
  api.registry = registry; api.functionNames = Object.keys(registry);
  api.neuralApiPrompt = () => [
    'Neural API · animate the fractal camera and drive the graph. Every call returns a Promise; await it to sequence.',
    'zoom(factor, x?, y?, ms?)  factor > 1 zooms in at screen point (x, y).',
    'pan(dx, dy, ms?)  pans by screen pixels.   rotate(degrees, x?, y?, ms?)',
    'movement(names[], zoomParams?, panParams?, rotateParams?, ms?)  names: ' + Object.keys(DEFAULT_MOVES).join(', '),
    'setMandelbrotCoords(zoomMagnitude, re, im, speed=0.1)  autopilot to exact coordinates.',
    'zoomToNodeTitle(titleOrNode, level?, delayMs?)   searchNotes(term, max?)   searchAndZoom(term, max?, level?, delayBetween?)',
    'addNote(title, text)   promptZettelkasten(message)   getUserResponse(message)   delay(ms)',
    'queueAnimations([[fn, args, delayAfter], ...])   exploreBoundaryPoints({numPoints, zoomLevel, methods})',
    'resetView(animate?, ms?)   getCoords(forFunctionCall?)   createNode(type, opts)   connect(a, b)   pulse(a, b)   setFractal(type)   fit()',
    'Aliases: ' + api.functionNames.join(', ')
  ].join('\n');
  return api;
}
const C_wait = ms => new Promise(r => setTimeout(r, ms));

/* ───────────── automata (automata.js) ───────────── */
class MovementAgentState {
  constructor(s, agent) { this.s = s; this.agent = agent; this.state = { baseSeparation: 0.3, maxSeparation: 4, desiredSeparation: 0.5 }; }
  component(node, seen = new Set()) { seen.add(node.uuid); node.forEachConnectedNode(n => { if (!seen.has(n.uuid)) this.component(n, seen); }); return [...seen]; }
  centroid(ids) { let x = 0, y = 0, k = 0; ids.forEach(id => { const n = this.s.nodes.get(id); if (n) { x += n.pos.x; y += n.pos.y; k++; } }); return k ? new vec2(x / k, y / k) : this.agent.pos; }
  avgScale(ids) { return ids.reduce((t, id) => t + (this.s.nodes.get(id) || { scale: 1 }).scale, 0) / ids.length; }
  update() {
    const a = this.agent, r = a.zWidth() * 1.6, near = [], ext = [];
    this.s.nodes.forEach(n => { if (n === a || n.hidden) return; const d = n.pos.distanceTo(a.pos); if (d < r) near.push(n); if (d < r * 2.5) ext.push(n); });
    const msf = Math.min(1, a.scale), range = (this.state.maxSeparation - this.state.baseSeparation) * msf;
    this.state.desiredSeparation = this.state.baseSeparation * msf + Math.min(range, range * (ext.length / 40));
    const mine = this.component(a), mineSet = new Set(mine), cen = this.centroid(mine), comps = new Map();
    near.forEach(n => { if (mineSet.has(n.uuid) || comps.has(n.uuid)) return; const ids = this.component(n), c = this.centroid(ids); ids.forEach(id => comps.set(id, { c, ids })); });
    let mv = new vec2(0, 0), need = false; const done = new Set();
    comps.forEach(({ c, ids }) => {
      if (done.has(ids)) return; done.add(ids);
      const minD = ids.reduce((m, id) => { const n = this.s.nodes.get(id); return n ? Math.min(m, a.pos.distanceTo(n.pos)) : m; }, Infinity);
      const sf = 1 + Math.tanh((this.avgScale(ids) - this.avgScale(mine)) / a.scale), want = this.state.desiredSeparation * sf;
      if (minD >= want) return;
      const away = cen.minus(c); if (!(away.mag() > 0)) return;
      mv = mv.plus(away.normed().scale((want - minD) * sf / a.scale * a.scale * 0.5)); need = true;
    });
    if (!need) return;
    mine.forEach(id => { const n = this.s.nodes.get(id); if (n && !n.followingMouse) n.moveTo(n.pos.x + mv.x, n.pos.y + mv.y, 0.05); });
  }
}
class CellularAutomata {
  constructor(s) { this.s = s; this.interval = null; this.i = 0; this.intervalMs = 40; }
  get running() { return !!this.interval; }
  next() { const ids = [...this.s.nodes.keys()]; if (!ids.length) return; if (this.i >= ids.length) this.i = 0; const n = this.s.nodes.get(ids[this.i++]); if (n && !n.hidden) new MovementAgentState(this.s, n).update(); }
  start() { clearInterval(this.interval); this.interval = setInterval(() => this.next(), this.intervalMs); this.s.emit('automata', true); }
  stop() { clearInterval(this.interval); this.interval = null; this.i = 0; this.s.emit('automata', false); }
  toggle() { this.running ? this.stop() : this.start(); }
}

NS.graph = { Node, Edge, Autopilot, makeNeuralAPI, MovementAgentState, CellularAutomata, SIZES, ICONS, updateNodeEdgesLength };
})();
