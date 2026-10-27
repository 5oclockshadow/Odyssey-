/* Neurite surface · camera, simulation loop, rendering, input, Zettelkasten sync, AI nodes, persistence
   Ported from satellitecomponent/Neurite: interface.js (pan/zoom/rotate, touch), nodestep.js (NodeSimulation,
   regen debt, mouse orbit path), mandelbrot.js (hair rendering, preserve/clear/screenshot), edgeclass.js (EdgeView
   ribbons + arrows), nodeclass.js (draw, drag, scroll-scale), nodemode.js, movenodes.js, togglenodestate.js (drag box),
   zettelkasten.js (ZettelkastenProcessor), search.js, ainode.js/aimessage.js (context + multi-agent loops),
   wikipedia.js, filternodes.js (forget), savenet.js (save/load). Rendering is canvas-based for speed. */
(function () {
'use strict';
const NS = window.Neurite, C = NS.core, G = NS.graph, vec2 = C.vec2, clamp = C.clamp, lerp = C.lerp, ZK = C.ZK;
if (NS.Surface) return;
const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

/* ───────────── Zettelkasten processor (zettelkasten.js) ───────────── */
class ZettelProcessor {
  constructor(s) { this.s = s; this.text = ''; this.wraps = new Map(); this.lineOf = new Map(); this.order = []; this.busy = false; this.strategy = new C.NodePlacementStrategy(C.ZetPath.create(s.S.zetPath)); }
  get tags() { const S = this.s.S; return { node: S.nodeTag || '##', ref: S.refTag || '[[', llm: S.llmTag || 'AI:' }; }
  setPath(style, options) { this.s.S.zetPath = style; this.strategy.updatePath(C.ZetPath.create(style, options)); }
  unique(name) { name = String(name || 'Untitled').trim().replace(/,/g, '') || 'Untitled'; if (!this.wraps.has(name)) return name; let i = 2; while (this.wraps.has(name + '(' + i + ')')) i++; return name + '(' + i + ')'; }
  setText(text, origin = 'editor') { this.text = String(text); this.process(); this.s.emit('zettel', { text: this.text, origin }); this.s.changed(); }
  commit(origin) { this.process(); this.s.emit('zettel', { text: this.text, origin }); this.s.changed(); }
  load(text) {
    this.text = String(text || ''); this.wraps.clear(); this.lineOf.clear(); this.order = [];
    ZK.parse(this.text, this.tags).forEach(sec => { const n = [...this.s.nodes.values()].find(x => !x.removed && x.title === sec.title && (x.type === (sec.kind === 'ai' ? 'ai' : 'text'))); if (n) { this.wraps.set(sec.title, n); this.order.push(n); } });
    this.process();
  }
  spawn(sec) {
    const s = this.s;
    if (this._bind && this._bind.title === sec.title) { const n = this._bind.node; this._bind = null; return n; }
    if (sec.kind === 'ai') return s.createNode('ai', { title: sec.title, pos: s.randomInView(0.7), fromZk: true });
    this.strategy.nodeObjects = this.order.filter(n => !n.removed && n.isTextNode);
    const p = this.forceRandom ? null : this.strategy.calculatePositionAndScale(s.S.zetSpread);
    let pos, scale;
    if (p && p.first) { pos = s.viewCenter(); scale = s.defaultScale() * 0.8; }
    else if (p) { pos = new vec2(p.x, p.y); scale = p.scale; }
    else { pos = s.randomInView(0.75); scale = s.defaultScale() * 0.8; }
    return s.createNode('text', { title: sec.title, text: sec.bodyText, pos, scale, fromZk: true });
  }
  process() {
    if (this.busy) return; this.busy = true;
    const s = this.s;
    try {
      const tags = this.tags, secs = ZK.parse(this.text, tags), titles = new Set(secs.map(x => x.title)), byLine = new Map(), next = new Map(), seen = new Set();
      this.wraps.forEach(n => { if (!n.removed) byLine.set(this.lineOf.get(n.uuid), n); });
      for (const sec of secs) {
        if (next.has(sec.title)) continue;
        let n = this.wraps.get(sec.title);
        if (!n || n.removed) {
          const cand = byLine.get(sec.line);
          if (cand && !cand.removed && !titles.has(cand.title) && !seen.has(cand.uuid)) { cand.title = sec.title; s.viewTitle(cand); n = cand; }
          else { n = this.spawn(sec); this.order.push(n); }
        }
        next.set(sec.title, n); this.lineOf.set(n.uuid, sec.line); seen.add(n.uuid);
        if (sec.kind === 'text' && n.text !== sec.bodyText) { n.text = sec.bodyText; s.viewText(n); }
        if (sec.kind === 'ai' && (n.data.draft || '') !== sec.bodyText) { n.data.draft = sec.bodyText; s.viewText(n); }
      }
      this.wraps.forEach(n => { if (!seen.has(n.uuid) && !n.removed) s.removeNode(n, { fromZk: true }); });
      this.wraps = next; this.order = this.order.filter(n => !n.removed && seen.has(n.uuid));
      const want = new Set();
      for (const sec of secs) {
        const a = next.get(sec.title); if (!a) continue;
        for (const r of sec.refs) {
          const b = next.get(r) || s.nodeByTitle(r); if (!b || b === a) continue;
          const k = G.Edge.key(a, b); want.add(k);
          const e = s.edges.get(k); if (e) e.zk = true; else s.connectDistance(a, b, { zk: true, kind: 'ref' });
        }
      }
      [...s.edges.values()].forEach(e => { if (e.zk && !want.has(e.edgeKey)) s.removeEdge(e, { fromZk: true }); });
    } finally { this.busy = false; }
  }
  onNodeTitle(n, raw) {
    let t = String(raw).trim().replace(/,/g, '') || 'Untitled'; const old = n.title;
    if (t === old) return t;
    if (this.wraps.get(old) !== n) { n.title = t; return t; }
    if (this.wraps.has(t) && this.wraps.get(t) !== n) t = this.unique(t);
    this.text = ZK.rename(this.text, old, t, this.tags); n.title = t; this.wraps.delete(old); this.wraps.set(t, n);
    this.commit('node'); return t;
  }
  onNodeBody(n, body) { if (this.wraps.get(n.title) !== n) return; this.text = ZK.setBody(this.text, n.title, body, this.tags); n.text = body; this.commit('node'); }
  addRef(from, to) { const t = ZK.addRef(this.text, from, to, this.tags); if (t !== this.text) { this.text = t; this.commit('edge'); } }
  removeRef(from, to) { const t = ZK.removeRef(this.text, from, to, this.tags); if (t !== this.text) { this.text = t; this.commit('edge'); } }
  addNote(title, body = '', o = {}) {
    title = this.unique(title); const s = this.s;
    let node = o.node;
    if (!node && !o.random && (o.pos || o.scale)) node = s.createNode('text', { title, text: body, pos: o.pos, scale: o.scale, anchored: o.anchored, fromZk: true });
    if (node) { node.title = title; s.viewTitle(node); this._bind = { title, node }; }
    this.forceRandom = !!o.random;
    this.text = ZK.append(this.text, title, body, this.tags, o.llm);
    this.commit('api'); this.forceRandom = false; this._bind = null;
    return this.wraps.get(title) || node || null;
  }
  removeNote(title) { if (!this.wraps.has(title)) return; this.text = ZK.removeSection(this.text, title, this.tags); this.commit('node'); }
}

/* ───────────── Surface ───────────── */
let SEQ = 0;
class Surface {
  constructor(host, o = {}) {
    this.host = host; this.o = o; this.id = o.id || 'default'; this.headless = !!o.headless; this.ls = 'neurite.' + this.id + '.';
    const saved = o.persistSettings === false ? null : LS.get(this.ls + 'settings');
    this.S = Object.assign({}, C.DEFAULTS, saved || {}, o.settings || {});
    this.fr = new C.Fractal(this.S);
    this.nodes = new Map(); this.edges = new Map(); this.edgeDirectionalities = {}; this.selected = new Set(); this.lit = new Set(); this.matches = null;
    this.pan = new vec2(-0.3, 0); this.zoom = new vec2(1.3, 0);
    if (o.camera) { this.pan = new vec2(o.camera.pan[0], o.camera.pan[1]); this.zoom = new vec2(o.camera.zoom[0], o.camera.zoom[1]); }
    this.W = o.width || 800; this.H = o.height || 600; this.updateXform();
    this.mouse = { x: this.W / 2, y: this.H / 2 }; this.mouseZ = this.xyToZ(this.mouse.x, this.mouse.y); this.hot = false;
    this.nodeMode = 0; this.nodeMode_v = 0; this.prev = null; this.keyState = {}; this.frame = 0; this.fps = 60; this.lastT = 0;
    this.hairs = []; this.regenDebt = 0; this.regenAmount = 0; this.mousePath = []; this.mousePathPos = null; this.pulses = [];
    this.listeners = {}; this.uuidSeq = 0; this.filterFn = null; this.vdb = new C.VectorDB(); this.embCache = new C.LRUCache(2000);
    this.autopilot = new G.Autopilot(this); this.zk = new ZettelProcessor(this); this.api = makeAPI(this); this.automata = new G.CellularAutomata(this);
    this.ai = o.ai || defaultAI; this.uid = ++SEQ;
    if (!this.headless) { this.buildChrome(); this.bindInput(); this.start(); }
    if (o.restore !== false && o.autosave !== false) { const snap = LS.get(this.ls + 'autosave'); if (snap && snap.nodes && snap.nodes.length) { try { this.deserialize(snap); this.restored = true; } catch (e) { console.warn('neurite restore', e); } } }
    NS.surfaces = (NS.surfaces || []).concat(this);
  }
  /* events */
  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return () => { this.listeners[evt] = (this.listeners[evt] || []).filter(f => f !== fn); }; }
  emit(evt, d) { (this.listeners[evt] || []).forEach(f => { try { f(d, this); } catch (e) { console.warn('neurite', evt, e); } }); }
  changed() {
    clearTimeout(this._chT);
    this._chT = setTimeout(() => { this.emit('change', this.stats()); if (this.o.autosave !== false && !this.headless) this.autosave(); }, 90);
    if (!this.headless && this.uiDirty) this.uiDirty();
  }
  stats() { let n = 0, e = 0; this.nodes.forEach(x => { if (!x.hidden) n++; }); this.edges.forEach(x => { if (!x.pts[0].hidden && !x.pts[1].hidden) e++; }); return { nodes: n, edges: e, totalNodes: this.nodes.size, totalEdges: this.edges.size, hairs: this.hairs.length, fps: Math.round(this.fps), zoom: this.zoom.mag(), pan: [this.pan.x, this.pan.y] }; }
  /* camera (mandelbrot.js · Svg.updateScaleAndOffset, fromZ, toDZ) */
  updateXform() { const Sq = Math.max(1, Math.min(this.W, this.H)); this.Sq = Sq; this.offX = (this.W - Sq) / 2; this.offY = (this.H - Sq) / 2; this.half = Sq / 2; const w = this.zoom.crecip(); this.wx = w.x; this.wy = w.y; this.pxz = this.half * Math.hypot(w.x, w.y); }
  xyToZ(x, y) { return new vec2(((x - this.offX) / this.Sq - 0.5) * 2, ((y - this.offY) / this.Sq - 0.5) * 2).cmult(this.zoom).cadd(this.pan); }
  sx(x, y) { const dx = x - this.pan.x, dy = y - this.pan.y; return this.offX + this.half * (1 + dx * this.wx - dy * this.wy); }
  sy(x, y) { const dx = x - this.pan.x, dy = y - this.pan.y; return this.offY + this.half * (1 + dx * this.wy + dy * this.wx); }
  fromZ(z) { return { x: this.sx(z.x, z.y), y: this.sy(z.x, z.y) }; }
  toDZ(dx, dy) { return new vec2(2 * dx / this.Sq, 2 * dy / this.Sq).cmult(this.zoom); }
  nodeScale(n) { return n.intrinsicScale * n.scale * Math.pow(this.zoom.mag2(), -this.S.zoomContentExp) * (this.Sq / 800); }
  defaultScale() { return Math.pow(this.zoom.mag2(), this.S.zoomContentExp) * (800 / this.Sq); }
  viewCenter() { return this.xyToZ(this.W / 2, this.H / 2); }
  randomInView(f = 0.8) { return this.xyToZ(this.W / 2 + (Math.random() - 0.5) * this.W * f, this.H / 2 + (Math.random() - 0.5) * this.H * f); }
  performZoom(amount, dest) { const inv = 1 / amount; this.zoom = this.zoom.scale(inv); this.pan = dest.scale(1 - inv).plus(this.pan.scale(inv)); this.camMoved(); }
  rotateAt(angle, pivot) { const r = new vec2(Math.cos(angle), Math.sin(angle)), zc = pivot.minus(this.pan); this.zoom = this.zoom.cmult(r); this.pan = this.pan.plus(zc.cmult(new vec2(1, 0).minus(r))); this.camMoved(); }
  setCamera(pan, zoom) { if (pan) this.pan = new vec2(pan[0] ?? pan.x, pan[1] ?? pan.y); if (zoom) this.zoom = typeof zoom === 'number' ? this.zoom.scale(zoom / this.zoom.mag()) : new vec2(zoom[0] ?? zoom.x, zoom[1] ?? zoom.y); this.camMoved(); }
  camMoved() { this.updateXform(); this._camDirty = true; }
  zoomBy(f) { this.autopilot.reset(); this.api.zoom(f, this.W / 2, this.H / 2, 380); }
  /* graph ops */
  nextUuid() { while (this.nodes.has(String(this.uuidSeq))) this.uuidSeq++; return String(this.uuidSeq++); }
  resolve(x) { return x && typeof x === 'object' ? x : this.nodes.get(String(x)) || this.nodeByTitle(String(x)); }
  nodeByTitle(t) { const l = String(t).toLowerCase(); for (const n of this.nodes.values()) if (!n.removed && String(n.title).toLowerCase() === l) return n; return null; }
  edgeBetween(a, b) { return this.edges.get(G.Edge.key(a, b)) || null; }
  createNode(type = 'text', o = {}) {
    const n = new G.Node(this, Object.assign({}, o, { type }));
    if (this.nodes.has(n.uuid)) return this.nodes.get(n.uuid);
    if (type === 'ai') n.data = Object.assign({ msgs: [], draft: '', zkReplies: true, auto: false, memory: false }, n.data);
    if (type === 'link') n.data = Object.assign({ url: '' }, n.data);
    if (type === 'code') n.data = Object.assign({ lang: 'html', code: '' }, n.data);
    this.nodes.set(n.uuid, n);
    if (this.filterFn) n.hidden = !this.filterFn(n);
    if (!this.headless && !o.lazy) this.buildNodeEl(n);
    if (type === 'text' && !o.fromZk && o.zk !== false && !this.zk.busy && !this._loading) { n.title = this.zk.unique(n.title || 'New note'); this.zk.wraps.set(n.title, n); this.zk.order.push(n); this.zk.text = ZK.append(this.zk.text, n.title, n.text, this.zk.tags); this.zk.commit('node'); this.viewTitle(n); }
    if ((type === 'file' || type === 'link') && n.data.chunks && n.data.chunks.length) this.vdb.add(n.data.key || n.data.url || n.uuid, n.data.chunks, { node: n.uuid });
    this.emit('node:add', n); this.changed();
    return n;
  }
  removeNode(n, o = {}) {
    if (!n || n.removed) return;
    [...n.edges].forEach(e => this.removeEdge(e, { quiet: true, fromNode: true }));
    n.removed = true; this.nodes.delete(n.uuid); this.selected.delete(n.uuid); this.lit.delete(n.uuid);
    if (this.prev === n) this.prev = null; if (this.autopilot.referenceFrame === n) this.autopilot.reset();
    if (n.el) n.el.remove();
    if (!o.fromZk && this.zk.wraps.get(n.title) === n) { this.zk.text = ZK.removeSection(this.zk.text, n.title, this.zk.tags); this.zk.wraps.delete(n.title); this.zk.commit('node'); }
    if (n.data && (n.data.key || n.data.url)) this.vdb.remove(n.data.key || n.data.url);
    this.emit('node:remove', n); this.emit('select', this.selectedNodes()); this.changed();
  }
  connectDistance(a, b, o = {}) {
    if (!a || !b || a === b) return null;
    const k = G.Edge.key(a, b), ex = this.edges.get(k); if (ex) return ex;
    const e = new G.Edge(this, a, b, Object.assign({ length: o.length ?? Math.max(1e-9, a.pos.distanceTo(b.pos) * 0.5) }, o));
    if (o.style == null && this.o.edgeStyle) e.style = this.o.edgeStyle(e) || {};
    this.edges.set(k, e); a.edges.push(e); b.edges.push(e);
    this.emit('edge:add', e); this.changed(); return e;
  }
  connect(a, b, o = {}) { return this.connectDistance(a, b, o); }
  connectNodes(a, b) {
    if (!a || !b || a === b) return null;
    if (a.isTextNode && b.isTextNode && this.zk.wraps.get(a.title) === a && this.zk.wraps.get(b.title) === b) { this.zk.addRef(a.title, b.title); this.zk.addRef(b.title, a.title); return this.edgeBetween(a, b); }
    return this.connectDistance(a, b, { kind: 'link' });
  }
  removeEdge(e, o = {}) {
    if (!e || !this.edges.has(e.edgeKey)) return;
    const [a, b] = e.pts;
    if (e.zk && !o.fromZk && !o.fromNode && a.isTextNode && b.isTextNode) { this.zk.removeRef(a.title, b.title); this.zk.removeRef(b.title, a.title); if (!this.edges.has(e.edgeKey)) return; }
    this.edgeDirectionalities[e.edgeKey] = { start: e.directionality.start, end: e.directionality.end };
    this.edges.delete(e.edgeKey); a.edges = a.edges.filter(x => x !== e); b.edges = b.edges.filter(x => x !== e);
    if (this.hoverEdge === e) this.hoverEdge = null;
    this.emit('edge:remove', e); if (!o.quiet) this.changed();
  }
  clear() { [...this.edges.values()].forEach(e => this.removeEdge(e, { quiet: true, fromZk: true })); [...this.nodes.values()].forEach(n => this.removeNode(n, { fromZk: true })); this.zk.text = ''; this.zk.wraps.clear(); this.zk.order = []; this.edgeDirectionalities = {}; this.vdb.clear(); this.emit('zettel', { text: '', origin: 'clear' }); this.changed(); }
  selectedNodes() { return [...this.selected].map(id => this.nodes.get(id)).filter(Boolean); }
  select(n, add = false) { if (!add) this.selected.forEach(id => { const x = this.nodes.get(id); this.selected.delete(id); x && this.viewClasses(x); }); if (n) { this.selected.add(n.uuid); this.viewClasses(n); } this.emit('select', this.selectedNodes()); }
  toggleSelect(n) { if (this.selected.has(n.uuid)) this.selected.delete(n.uuid); else this.selected.add(n.uuid); this.viewClasses(n); this.emit('select', this.selectedNodes()); }
  setLit(ids) { const prev = this.lit; this.lit = new Set((ids || []).map(x => typeof x === 'object' ? x.uuid : String(x))); this.nodes.forEach(n => { if (prev.has(n.uuid) !== this.lit.has(n.uuid) || prev.size !== this.lit.size) this.viewClasses(n); }); }
  setFilter(fn) { this.filterFn = fn || null; this.nodes.forEach(n => { n.hidden = fn ? !fn(n) : false; this.viewClasses(n); }); this.changed(); }
  pulse(a, b, o = {}) {
    a = this.resolve(a); b = this.resolve(b); if (!a || !b) return; const e = this.edgeBetween(a, b); if (!e) return;
    this.pulses.push({ e, from: a, t0: performance.now() + (o.delay || 0), dur: o.ms || 900, color: o.color || this.theme.accent });
  }
  pulsePath(ids, o = {}) { const ns = ids.map(x => this.resolve(x)).filter(Boolean); for (let i = 0; i < ns.length - 1; i++) this.pulse(ns[i], ns[i + 1], Object.assign({}, o, { delay: (o.delay || 0) + i * (o.step || 260) })); }
  zoomTo(n, o = {}) {
    n = this.resolve(n); if (!n) return;
    const ap = this.autopilot; ap.reset();
    if (this.nodeScale(n) * n.dispW() >= 8) ap.zoomToFitFrame(n, o.margin || 1.6); else ap.zoomToFrame(n, 0.55);
    if (o.level && o.level !== 1) ap.targetZoom_scaleBy(1 / o.level);
    ap.start(this.S.autopilotSpeed, o.ms || 3200);
    if (o.skip || this.headless) { ap.skip(); ap.reset(); this.camMoved(); }
    if (o.select !== false) this.select(n);
  }
  fit(list, o = {}) {
    const ns = (list || [...this.nodes.values()]).filter(n => n && !n.hidden); if (!ns.length) return;
    const u = this.zoom.unscale(this.zoom.mag()).crecip(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    ns.forEach(n => { const p = n.pos.cmult(u), r = n.zWidth() * 0.55, rh = 2 * n.dispH() * n.scale / 800 * 0.55; x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - rh); y1 = Math.max(y1, p.y + rh); });
    const c = new vec2((x0 + x1) / 2, (y0 + y1) / 2).cmult(this.zoom.unscale(this.zoom.mag())), m = o.margin || 1.12;
    const zm = Math.max(((x1 - x0) / 2) * this.Sq / this.W, ((y1 - y0) / 2) * this.Sq / this.H, 1e-12) * m;
    const z = this.zoom.scale(zm / this.zoom.mag());
    if (o.instant || this.headless) { this.pan = c; this.zoom = z; this.camMoved(); return; }
    this.autopilot.reset(); this.api.movement([], {}, {}, {}, 0); return this._camTo(c, z, o.ms || 900);
  }
  _camTo(pan, zoom, ms) { const sp = this.pan, lz0 = this.zoom.clog(), lz1 = zoom.clog(), t0 = performance.now(); return new Promise(res => { const f = () => { const t = Math.min(1, (performance.now() - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; this.pan = sp.lerpto(pan, e); this.zoom = lz0.lerpto(lz1, e).cexp(); this.camMoved(); if (t < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); }
  setSettings(patch) { Object.assign(this.S, patch); if (patch.palette && C.PALETTES[patch.palette]) { const p = C.PALETTES[patch.palette]; Object.assign(this.S, { rgb: p.rgb, colorC: p.colorC, colorS: p.colorS, colorR: p.colorR }); } if ('fractal' in patch || 'exponent' in patch || 'juliaX' in patch || 'juliaY' in patch) this.hairs = this.hairs.filter(h => h.keep); if ('zetPath' in patch) this.zk.setPath(patch.zetPath); if (this.o.persistSettings !== false) LS.set(this.ls + 'settings', pickKeys(this.S, C.FRACTAL_KEYS)); this.emit('settings', this.S); if (this.uiSettings) this.uiSettings(); }
  /* loop (nodestep.js · NodeSimulation.nodeStep) */
  start() { if (this.raf) return; const loop = t => { this.raf = requestAnimationFrame(loop); try { this.step(t); } catch (e) { if (!this._warned) { console.warn('neurite frame', e); this._warned = 1; } } }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); this.raf = null; }
  tick(frames = 1, dtMs = 16.7) { for (let i = 0; i < frames; i++) this.step((this.lastT || 0) + dtMs, { headless: true }); }
  step(t, o = {}) {
    const dtMs = this.lastT ? t - this.lastT : 16.7; this.lastT = t; this.frame++;
    if (dtMs > 0) { const a = Math.exp(-dtMs / 1000); this.fps = this.fps * a + (1 - a) * 1000 / dtMs; }
    if (this.selected.size) this.processSelectedNodes();
    const z0 = this.zoom.mag();
    this.autopilot.update(); this.updateXform();
    this.mouseZ = this.xyToZ(this.mouse.x, this.mouse.y);
    this.nodeMode_v = lerp(this.nodeMode_v, this.nodeMode, 0.125);
    const dt = Math.min(1, Math.pow(1 - this.nodeMode_v, 5));
    this.nodes.forEach(n => { if (!n.hidden) n.step(dt); });
    this.edges.forEach(e => { if (!e.pts[0].hidden && !e.pts[1].hidden) e.step(dt); });
    if (o.headless || this.headless) return;
    const z1 = this.zoom.mag(); if (z1 !== z0) this.regenAmount += Math.abs(Math.log(z1 / z0)) * 800;
    this.updateMousePath(); this.updateRegen(); this.render(t);
    if (this._camDirty || this.frame % 20 === 0) { this._camDirty = false; if (this.uiHud) this.uiHud(); if (this.frame % 4 === 0 || this.frame % 20 === 0) this.emit('camera', { zoom: this.zoom.mag(), pan: this.pan, fps: this.fps }); }
  }
  processSelectedNodes() {
    const k = this.keyState; if (this.typing()) return;
    const dir = []; if (k.ArrowUp) dir.push('up'); if (k.ArrowDown) dir.push('down'); if (k.ArrowLeft) dir.push('left'); if (k.ArrowRight) dir.push('right');
    const map = { up: 1.5 * Math.PI, down: 0.5 * Math.PI, left: Math.PI, right: 0, 'up-left': 1.25 * Math.PI, 'up-right': 1.75 * Math.PI, 'down-left': 0.75 * Math.PI, 'down-right': 0.25 * Math.PI };
    const ang = map[dir.join('-')]; if (ang !== undefined) this.selectedNodes().forEach(n => n.moveNode(ang + this.zoom.ang()));
    const f = k.f ? 1.04 : k.d ? 0.96 : 0;
    if (f) { const ns = this.selectedNodes(); if (!ns.length) return; const c = ns.reduce((t, n) => t.plus(n.pos), new vec2(0, 0)).scale(1 / ns.length); ns.forEach(n => { n.scale *= f; n.pos = c.plus(n.pos.minus(c).scale(f)); if (n.anchorForce) n.anchor = n.pos; G.updateNodeEdgesLength(n); }); }
  }
  updateMousePath() {
    if (this.prev || !this.nodeMode) { this.mousePath = []; this.mousePathPos = null; return; }
    if (!this.mousePathPos) { this.mousePathPos = this.mouseZ; this.mousePath = [this.mouseZ]; }
    for (let i = 0; i < this.S.orbitStepRate; i++) { this.mousePathPos = this.fr.step(this.mousePathPos, this.mouseZ); if (this.mousePathPos.isFinite() && this.mousePathPos.mag2() < 1e6) this.mousePath.push(this.mousePathPos); }
    if (this.mousePath.length > 600) this.mousePath.splice(1, this.mousePath.length - 600);
  }
  updateRegen() {
    const S = this.S;
    this.regenDebt = Math.min(16, this.regenDebt + lerp(S.regenDebtAdjustmentFactor, this.regenAmount * 0.02 + S.regenDebtAdjustmentFactor, Math.min(1, Math.pow(this.nodeMode_v, 5) * 1.01)) + Math.min(10, this.regenAmount * 0.01));
    const v = this.hairView(), t0 = performance.now();
    for (; this.regenDebt > 0 && performance.now() - t0 < 5; this.regenDebt--) { const hh = this.fr.hair(v, Math.max(3, (Math.random() * S.renderSteps) | 0)); if (hh) { hh.t = performance.now(); hh.kz = v.zm; this.hairs.push(hh); } }
    this.regenAmount = 0;
    const max = S.maxLines; let live = 0; for (let i = this.hairs.length - 1; i >= 0; i--) if (!this.hairs[i].keep) { live++; if (live > max) { this.hairs.splice(i, 1); } }
  }
  hairView() { const zm = this.zoom.mag(); return { zm, zoom: this.zoom, mouseZ: this.hot ? this.mouseZ : null, iters: this.fr.itersFor(zm), e: this.fr.epsFor(zm), nmv: this.nodeMode_v, randomZ: () => this.xyToZ(Math.random() * this.W, Math.random() * this.H) }; }
  preserveHairs() { this.hairs.forEach(h => { h.keep = true; }); this.toast && this.toast('Fractal lines frozen. Alt + C clears them.'); }
  clearPreserved() { this.hairs.forEach(h => { h.keep = false; }); }
  /* input (interface.js) */
  typing() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); }
  local(e) { const r = this.host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  /* search (search.js) */
  searchNodes(term, o = {}) {
    const mode = o.mode || 'keyword', max = o.max || 0, list = [...this.nodes.values()].filter(n => !n.hidden);
    if (!String(term || '').trim()) { this.matches = null; this.nodes.forEach(n => this.viewClasses(n)); return []; }
    let out;
    if (mode === 'semantic') {
      const qv = C.embed(term);
      out = list.map(n => { const key = n.uuid + ':' + (n.title + n.getText()).length; let v = this.embCache.get(key); if (!v) { v = C.embed(n.title + ' ' + n.searchStrings().join(' ')); this.embCache.set(key, v); } return { n, sc: C.hybridScore(term, n.title, n.searchStrings().join(' '), qv, v) }; })
        .filter(x => x.sc.scoreSum > 0.12).sort((a, b) => b.sc.scoreSum - a.sc.scoreSum).map(x => Object.assign(x.n, { _score: x.sc.scoreSum }));
    } else out = C.keywordRank(list, term, n => n.searchStrings().join(' ')).map(x => Object.assign(x.it, { _score: x.numMatches }));
    if (max) out = out.slice(0, max);
    this.matches = new Set(out.map(n => n.uuid)); this.nodes.forEach(n => this.viewClasses(n));
    return out;
  }
  /* AI nodes (ainode.js · aimessage.js · filternodes.js) */
  nodeData(n, query) {
    const tag = this.S.nodeTag;
    if (this.o.nodeContext) { const c = this.o.nodeContext(n, query); if (c) return c; }
    if (n.isTextNode) return tag + ' ' + n.title + '\n' + n.text;
    if (n.isLLM) { const last = (n.data.msgs || []).slice(-4).map(m => (m.role === 'ai' ? n.title : 'User') + ': ' + String(m.text).slice(0, 400)).join('\n'); return tag + ' ' + (n.title || 'no_name') + ' Conversation History with ' + (n.title || 'no_name') + ':\n' + last; }
    if (n.type === 'file' || n.type === 'link') { const key = n.data.key || n.data.url; const hits = key && this.vdb.keys.has(key) ? this.vdb.search(query || n.title, 3, [key]).map(h => h.text).join('\n…\n') : (n.data.preview || n.text || '').slice(0, 1600); return (n.type === 'file' ? 'File ' + (n.data.path || n.title) + ' (' + (n.data.lang || '') + ')' : 'Link "' + n.title + '": ' + (n.data.url || '')) + '\n' + hits; }
    if (n.type === 'repo') return 'Repository ' + n.title + ': ' + (n.data.desc || '') + (n.data.lang ? ' · ' + n.data.lang : '');
    if (n.type === 'code') return 'Code (' + n.data.lang + ') ' + n.title + ':\n' + String(n.data.code || '').slice(0, 1600);
    return n.title + (n.data.sub ? ': ' + n.data.sub : '');
  }
  async contextFor(n, query) {
    const parts = [], seen = new Set();
    n.traverseConnectedNodes(x => { if (seen.has(x.uuid)) return; seen.add(x.uuid); parts.push(this.nodeData(x, query)); }, true);
    if (n.data.memory) this.searchNodes(query, { mode: 'semantic', max: 5 }).filter(x => x !== n && !seen.has(x.uuid) && x.isTextNode).forEach(x => parts.push(this.nodeData(x, query)));
    let ctx = parts.filter(Boolean).join('\n\n');
    if (n.data.forget && ctx.trim()) {
      try { const r = await this.ai({ system: "Here's the current context and top matched nodes to help you decide which node titles should be forgotten:\n\n" + ctx + '\n\nWithout preface or explanation, based on the provided user message and context, suggest which node titles should be forgotten. Return the exact titles to forget separated by newlines.', messages: [{ role: 'user', content: query }], max_tokens: 200 }); ctx = ZK.removeTitlesFromContext(ctx, new Set(String(r).split('\n').map(x => x.trim()).filter(Boolean)), { node: this.S.nodeTag }); } catch (e) {}
    }
    if (this.searchMemory && this.vdb.size && query) { const hits = this.vdb.search(query, 3); if (hits.length) ctx += '\n\nRelevant code:\n' + hits.map(h => '[' + h.key + ']\n' + h.text.slice(0, 700)).join('\n'); }
    return ctx.slice(0, 12000);
  }
  aiSystem(n) {
    const S = this.S, ref = S.refTag + 'Title' + (C.BRACKETS[S.refTag] || '');
    return (this.o.aiSystem && this.o.aiSystem(n)) || ('You are "' + (n.title || 'AI node') + '", an AI node inside a Neurite fractal graph. Use the linked context. ' +
      (n.data.zkReplies ? 'Reply as 1 to 3 short notes. Start each note with "' + S.nodeTag + ' " and a title of at most 5 words on its own line, then 1 to 3 plain sentences. Reference related notes with ' + ref + '. ' : 'Reply in plain sentences. ') +
      'Other connected AI nodes may receive your reply. Start a line with @Name to address one, or write /exit to end a loop. ' +
      (n.data.auto ? 'Finish with one line "Prompt: <the next question you will explore> :End Prompt". ' : '') + 'No other markdown.');
  }
  async aiSend(n, text, meta = {}) {
    n = this.resolve(n); if (!n || n.type !== 'ai' || n.data.busy) return;
    text = String(text ?? n.data.draft ?? '').trim(); if (!text) return;
    n.data.msgs = (n.data.msgs || []).concat({ role: 'you', who: meta.from || 'You', text }); n.data.draft = ''; n.data.busy = true; this.viewText(n); this.viewMsgs(n);
    if (this.zk.wraps.get(n.title) === n) { this.zk.text = ZK.setBody(this.zk.text, n.title, '', this.zk.tags); this.zk.commit('ai'); }
    this.emit('ai:start', { node: n, text });
    const ctx = await this.contextFor(n, text);
    const hist = (n.data.msgs || []).slice(-9, -1).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.raw || m.text).slice(0, 1200) }));
    while (hist.length && hist[0].role !== 'user') hist.shift();
    const merged = []; hist.forEach(m => { if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content; else merged.push(Object.assign({}, m)); });
    const msg = { role: 'user', content: 'Linked context:\n' + (ctx || '(nothing linked)') + '\n\n' + (meta.from ? '[' + meta.from + '] ' : '') + text };
    if (merged.length && merged[merged.length - 1].role === 'user') merged[merged.length - 1].content += '\n\n' + msg.content; else merged.push(msg);
    let out;
    try { out = String(await this.ai({ system: this.aiSystem(n), messages: merged, max_tokens: 700, node: n })); }
    catch (e) { out = this.S.nodeTag + ' Model unreachable\nI could not reach the model, so nothing new was added. The linked context is still on the graph.'; }
    n.data.busy = false;
    let next = null; const pm = /Prompt:\s*([\s\S]*?)\s*:End Prompt/i.exec(out); if (pm) { next = pm[1].trim(); out = out.replace(pm[0], '').trim(); }
    const born = n.data.zkReplies ? this.spawnReplyNotes(n, out) : [];
    n.data.msgs = n.data.msgs.concat({ role: 'ai', who: n.title, raw: out, text: born.length ? 'Added ' + born.length + ' linked note' + (born.length > 1 ? 's' : '') + ': ' + born.map(b => b.title).join(', ') + '.' : out.replace(new RegExp('^' + C.reEsc(this.S.nodeTag) + '\\s*', 'gm'), ''), notes: born.map(b => b.uuid) });
    if (n.data.msgs.length > 80) n.data.msgs = n.data.msgs.slice(-80);
    this.viewMsgs(n); this.emit('ai:reply', { node: n, text: out, notes: born }); this.changed();
    this.forwardToPeers(n, out, meta.hops || 0);
    const left = meta.autoLeft ?? this.S.autoSteps;
    if (n.data.auto && next && left > 0) setTimeout(() => this.aiSend(n, next, { autoLeft: left - 1, hops: meta.hops }), 600);
    return out;
  }
  forwardToPeers(n, out, hops) {
    if (hops >= this.S.maxAiHops || /(^|\s)\/exit\b/i.test(out)) return;
    let peers = n.edges.filter(e => e.canSend(n)).map(e => e.other(n)).filter(p => p && p.isLLM && p !== n);
    const at = [...String(out).matchAll(/@([\w\- ]{2,40}?)(?=[\s,.:!?]|$)/g)].map(m => m[1].trim().toLowerCase());
    if (at.length) { if (at.includes('self')) peers = [n]; else peers = peers.filter(p => at.some(a => p.title.toLowerCase().startsWith(a))); }
    if (!n.data.loop && !at.length) return;
    peers.forEach((p, i) => setTimeout(() => this.aiSend(p, String(out).slice(0, 1400), { from: n.title, hops: hops + 1 }), 500 + i * 300));
  }
  aiTalk(n) { n = this.resolve(n); const last = (n.data.msgs || []).filter(m => m.role === 'ai').slice(-1)[0]; const peers = n.edges.filter(e => e.canSend(n)).map(e => e.other(n)).filter(p => p && p.isLLM); peers.forEach((p, i) => setTimeout(() => this.aiSend(p, last ? (last.raw || last.text) : 'Hello. What should we explore together?', { from: n.title, hops: 1 }), i * 300)); return peers; }
  spawnReplyNotes(n, out) {
    const tag = this.S.nodeTag, secs = []; let cur = null;
    String(out).split('\n').forEach(l => { const t = l.trim(); if (t.startsWith(tag)) { cur = { title: t.slice(tag.length).replace(/\*+/g, '').trim() || 'Note', body: [] }; secs.push(cur); } else if (cur && t) cur.body.push(t); });
    const born = [];
    secs.slice(0, 4).forEach((sec, i) => {
      const parent = G.Node.parentAvailableFromRoot(n, 3, true), kids = parent.edges.length, ang = (parent === n ? -0.9 : -0.6) + (kids + i) * 0.82, r = parent.zWidth() * (parent === n ? 1.05 : 0.95);
      const pos = parent.pos.plus(new vec2(Math.cos(ang) * r, Math.sin(ang) * r * 0.8)), scale = (parent === n ? n.scale * 0.82 : parent.scale * 0.88);
      const note = this.zk.addNote(sec.title, sec.body.join(' '), { pos, scale });
      if (note) { this.connectDistance(parent === n ? n : parent, note, { kind: parent === n ? 'ai' : 'ref' }); if (parent !== n && parent.isTextNode) { this.zk.addRef(parent.title, note.title); } born.push(note); }
    });
    return born;
  }
  async promptZettelkasten(message) {
    const titles = [...this.zk.wraps.keys()].slice(-60).join(', '), S = this.S, ref = S.refTag + 'Title' + (C.BRACKETS[S.refTag] || '');
    let out;
    try { out = String(await this.ai({ system: 'You are the Zettelkasten AI of a Neurite graph. Respond as a graph of thoughts: 2 to 5 notes, each starting with "' + S.nodeTag + ' Title" on its own line, followed by 1 to 3 sentences, linking related notes with ' + ref + '. Existing notes: ' + titles, messages: [{ role: 'user', content: message }], max_tokens: 900 })); }
    catch (e) { out = S.nodeTag + ' ' + String(message).slice(0, 32) + '\nThe model was unreachable, so this note only records the prompt.'; }
    const before = new Set(this.zk.wraps.keys());
    this.zk.text = this.zk.text + (this.zk.text ? '\n\n' : '') + out.trim(); this.zk.commit('ai');
    return { text: out, nodes: [...this.zk.wraps.entries()].filter(([t]) => !before.has(t)).map(([, n]) => n) };
  }
  async wiki(n, query, o = {}) {
    n = this.resolve(n); const q = String(query || n.data.draft || n.title).trim(); if (!q) return [];
    const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=20&srsearch=' + encodeURIComponent(q)).then(x => x.json());
    let hits = (r.query && r.query.search) || []; if (o.novelty) hits = hits.sort(() => Math.random() - 0.5);
    hits = hits.slice(0, 3); const out = [];
    for (const [i, h] of hits.entries()) {
      let ex = ''; try { const p = await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&origin=*&titles=' + encodeURIComponent(h.title)).then(x => x.json()); ex = Object.values(p.query.pages)[0].extract || ''; } catch (e) {}
      const ang = -0.8 + i * 0.8, pos = n.pos.plus(new vec2(Math.cos(ang), Math.sin(ang)).scale(n.zWidth() * 1.1));
      const note = this.zk.addNote('Wikipedia · ' + h.title, ex.slice(0, 700) + '\nhttps://en.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')), { pos, scale: n.scale * 0.8 });
      if (note) { this.connectDistance(n, note, { kind: 'ai' }); out.push(note); }
    }
    return out;
  }
  /* persistence (savenet.js) */
  serialize() {
    const dir = e => [e.directionality.start ? e.directionality.start.uuid : null, e.directionality.end ? e.directionality.end.uuid : null];
    return { v: 1, app: 'neurite-port', at: new Date().toISOString(), camera: { pan: [this.pan.x, this.pan.y], zoom: [this.zoom.x, this.zoom.y] }, zettel: this.zk.text, settings: pickKeys(this.S, C.FRACTAL_KEYS),
      nodes: [...this.nodes.values()].filter(n => !n.transient).map(n => ({ u: n.uuid, t: n.type, ti: n.title, tx: n.text, p: [n.pos.x, n.pos.y], s: n.scale, a: n.anchorForce, c: n.collapsed ? 1 : 0, w: n.w, h: n.h, g: n.group, k: n.kind, i: n.icon, ch: n.chrome, col: n.color, d: cleanData(n.data), ca: n.createdAt })),
      edges: [...this.edges.values()].filter(e => !e.transient && !e.pts[0].transient && !e.pts[1].transient).map(e => ({ p: [e.pts[0].uuid, e.pts[1].uuid], l: e.length, s: e.strength, k: e.kind, z: e.zk ? 1 : 0, d: dir(e), st: e.style })) };
  }
  deserialize(j, o = {}) {
    if (!j || !Array.isArray(j.nodes)) throw new Error('Not a Neurite save');
    this._loading = true;
    try {
      if (!o.merge) this.clear();
      if (j.settings && o.settings !== false) Object.assign(this.S, j.settings);
      if (j.camera && o.camera !== false) this.setCamera(j.camera.pan, j.camera.zoom);
      j.nodes.forEach(x => { if (this.nodes.has(String(x.u))) return; this.createNode(x.t, { uuid: x.u, title: x.ti, text: x.tx, pos: x.p, scale: x.s, anchored: x.a === 1, collapsed: !!x.c, w: x.w, h: x.h, group: x.g, kind: x.k, icon: x.i, chrome: x.ch, color: x.col, data: x.d, createdAt: x.ca, fromZk: true }); });
      j.edges.forEach(x => { const a = this.nodes.get(String(x.p[0])), b = this.nodes.get(String(x.p[1])); if (!a || !b) return; const e = this.connectDistance(a, b, { length: x.l, strength: x.s, kind: x.k, zk: !!x.z, style: x.st || undefined }); if (e && x.d) { e.directionality = { start: x.d[0] ? this.nodes.get(String(x.d[0])) || null : null, end: x.d[1] ? this.nodes.get(String(x.d[1])) || null : null }; } });
    } finally { this._loading = false; }
    this.zk.load(j.zettel || '');
    this.changed(); this.emit('load', j);
  }
  autosave() { clearTimeout(this._asT); this._asT = setTimeout(() => { const d = this.serialize(); if (d.nodes.length > 1500) return; LS.set(this.ls + 'autosave', d); }, 700); }
  listSaves() { return (LS.get(this.ls + 'saves') || []).sort((a, b) => b.at.localeCompare(a.at)); }
  save(name) { name = String(name || 'Untitled').trim(); const d = this.serialize(); if (!LS.set(this.ls + 'save.' + name, d)) return false; const idx = this.listSaves().filter(x => x.name !== name); idx.push({ name, at: d.at, nodes: d.nodes.length, edges: d.edges.length }); LS.set(this.ls + 'saves', idx); this.emit('saves'); return true; }
  load(name) { const d = LS.get(this.ls + 'save.' + name); if (!d) return false; this.deserialize(d); return true; }
  removeSave(name) { LS.del(this.ls + 'save.' + name); LS.set(this.ls + 'saves', this.listSaves().filter(x => x.name !== name)); this.emit('saves'); }
  exportJSON(name = 'neurite-graph') { const b = new Blob([JSON.stringify(this.serialize(), null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  async importJSON(file) { const j = JSON.parse(await file.text()); this.deserialize(j); }
  destroy() { this.stop(); this.automata.stop(); (this._unbind || []).forEach(f => f()); if (this.ro) this.ro.disconnect(); if (this.host) { this.host.innerHTML = ''; this.host.classList.remove('nrt'); } NS.surfaces = (NS.surfaces || []).filter(s => s !== this); }
}
function pickKeys(o, keys) { const r = {}; keys.forEach(k => { if (k in o) r[k] = o[k]; }); return r; }
function cleanData(d) { const r = {}; for (const k in d) { if (k === 'busy' || k === 'chunks' || k.startsWith('_')) continue; const v = d[k]; if (typeof v === 'function') continue; r[k] = k === 'msgs' && Array.isArray(v) ? v.slice(-60) : v; } return r; }
function makeAPI(s) { return G.makeNeuralAPI(s); }
async function defaultAI({ system, messages, max_tokens }) {
  if (window.claude && typeof window.claude.complete === 'function') return String(await window.claude.complete({ system, messages, max_tokens }));
  const last = (messages[messages.length - 1] || {}).content || '', titles = [...String(last).matchAll(/^##\s+(.+)$/gm)].map(m => m[1]).slice(0, 3);
  return '## Offline reply\nNo model is connected, so this is a local placeholder. I can see ' + (titles.length ? titles.map(t => '[[' + t + ']]').join(', ') : 'nothing linked yet') + '.';
}
NS.Surface = Surface; NS.ZettelProcessor = ZettelProcessor; NS.defaultAI = defaultAI; NS.LS = LS;
})();
