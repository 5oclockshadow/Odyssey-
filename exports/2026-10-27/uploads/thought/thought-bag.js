// The bag: engine + shake + revision tracking + persistence behind one headless object.
// No DOM, no styling. Any design can import this and render what it exposes.
import * as E from './thought-engine.js';
import * as S from './thought-shake.js';
export { E, S };

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const PLANE_SYMBOL = { facts: 'square', concepts: 'circle', principles: 'triangle', wild: 'diamond' };
const edgeKey = e => (e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a);

let modulesReady = null;
export async function createBag({ seed = 'Teach a city to sleep better', w = 900, h = 600, key = 'tg-bag' } = {}) {
  await (modulesReady || (modulesReady = E.loadModules('reasoning_modules.json')));
  const bag = {
    E, S, key, w, h, g: null, revs: [], birth: new Map(), alpha: 1, busy: false,
    dials: { ...S.DEFAULTS, acts: { ...S.DEFAULTS.acts }, mix: {} },
    get latest() { return this.revs.length - 1; },
    letter: i => LETTERS[i % 26] + (i >= 26 ? Math.floor(i / 26) : ''),

    async reset(text, o = {}) {
      this.g = E.createGraph(text, { w: this.w, h: this.h }); E.seedGraph(this.g, 5); this.g.cx = this.w / 2; this.g.cy = this.h / 2;
      this.birth = new Map(); this.revs = [];
      const first = await S.shake(this.g, { count: o.initial ?? 8, links: 1, wild: 40, aim: 'auto' });
      this.revs.push({ i: 0, letter: 'A', at: new Date().toISOString(), ids: this.g.nodes.map(n => n.id), edges: this.g.edges.map(edgeKey), did: first.did, note: 'Issued for review', intent: first.intent, text: '' });
      for (const n of this.g.nodes) this.birth.set(n.id, 0);
      this.alpha = 1; this.save(); return this;
    },

    // One shake = one revision. `input` may be a description, dial overrides, or both: shake('12 wild ideas', { aim: 'weak' }).
    async shake(text = '', over = {}) {
      if (this.busy) return null; this.busy = true;
      try {
        const P = S.parseShake(text).settings, d = this.dials;
        const opts = { count: P.count ?? d.count, links: P.links ?? d.links, wild: P.wild ?? d.wild, aim: P.aim ?? d.aim, acts: P.acts ? { ...P.acts } : d.acts, mix: P.mix || d.mix, ...over };
        const rep = await S.shake(this.g, opts), i = this.revs.length;
        this.revs.push({ i, letter: this.letter(i), at: new Date().toISOString(), ids: rep.nodes, edges: rep.edges, did: rep.did, intent: rep.intent, text, note: S.parseShake(text).say.join(' · ') });
        for (const id of rep.nodes) this.birth.set(id, i);
        Object.assign(d, { count: opts.count, links: opts.links, wild: opts.wild, aim: opts.aim, acts: opts.acts });
        this.alpha = 1; for (const n of this.g.nodes) { const k = this.birth.get(n.id) === i ? 2 : 6; n.vx += (Math.random() - 0.5) * k; n.vy += (Math.random() - 0.5) * k; }
        this.save(); return this.revs[i];
      } finally { this.busy = false; }
    },
    undoRev() { if (this.revs.length < 2) return null; const r = this.revs.pop(); S.toss(this.g, r.ids); for (const id of r.ids) this.birth.delete(id); this.alpha = 0.6; this.save(); return r; },
    strike(id) { S.toss(this.g, [id]); this.birth.delete(id); this.alpha = 0.5; this.save(); },

    bornIn(id) { return this.birth.get(id) ?? 0; },
    visible(rev = this.latest) { return new Set(this.g.nodes.filter(n => this.bornIn(n.id) <= rev).map(n => n.id)); },
    // Parts list: stable item numbers in order of arrival.
    parts(rev = this.latest) { return this.g.nodes.map((n, i) => ({ no: i + 1, n, rev: this.bornIn(n.id) })).filter(p => p.rev <= rev); },
    stats(rev = this.latest) {
      const vis = this.visible(rev), nodes = this.g.nodes.filter(n => vis.has(n.id)), eff = E.effectiveGrounding(this.g);
      return { nodes: nodes.length, edges: this.g.edges.filter(e => vis.has(e.a) && vis.has(e.b)).length, clusters: E.metrics(this.g).communities, grounding: nodes.length ? nodes.reduce((s, n) => s + (eff.get(n.id) ?? n.g), 0) / nodes.length : 0 };
    },
    hopsFromRoot(id) { const root = this.g.nodes[0]; const p = root ? E.shortestPath(this.g, root.id, id) : null; return p ? p : []; },
    neighbors(id) { return E.neighborsOf(this.g, id); },
    describe: text => S.parseShake(text).say,
    symbol: plane => PLANE_SYMBOL[plane] || 'circle',
    // Layout step for any renderer that wants positions. Returns true while still moving.
    tick() { if (this.alpha <= 0.02) return false; E.stepLayout(this.g, 'field', { alpha: this.alpha, w: this.w * 3, h: this.h * 3, link: 82, spring: 0.03, repel: 2400, pad: 30 }); this.alpha *= 0.988; return true; },
    resize(w, h) { this.w = w; this.h = h; if (this.g) { this.g.cx = w / 2; this.g.cy = h / 2; } this.alpha = Math.max(this.alpha, 0.3); },
    save() { try { localStorage.setItem(this.key, JSON.stringify({ graph: E.serialize(this.g), revs: this.revs, birth: [...this.birth], dials: this.dials })); } catch (e) { /* storage blocked */ } },
    load() {
      try {
        const d = JSON.parse(localStorage.getItem(this.key)); if (!d || !d.graph || !d.graph.nodes || !d.graph.nodes.length) return false;
        const g = E.restore(d.graph, { w: this.w, h: this.h }); if (!g) return false; E.sanitize(g);
        g.cx = this.w / 2; g.cy = this.h / 2; for (const n of g.nodes) if (!isFinite(n.x) || !isFinite(n.y)) { n.x = g.cx + (Math.random() - 0.5) * 80; n.y = g.cy + (Math.random() - 0.5) * 80; }
        this.g = g; this.revs = d.revs && d.revs.length ? d.revs : [{ i: 0, letter: 'A', at: new Date().toISOString(), ids: g.nodes.map(n => n.id), edges: [], did: {}, note: 'Restored', intent: {}, text: '' }]; this.birth = new Map(d.birth || []); this.dials = { ...this.dials, ...(d.dials || {}) }; this.alpha = 1; return true;
      } catch (e) { return false; }
    },
  };
  return bag;
}
