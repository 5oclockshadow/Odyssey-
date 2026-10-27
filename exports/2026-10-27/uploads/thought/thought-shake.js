// Shake: jolt a graph so new thoughts and links fall out. Built on the public thought-engine API.
import * as E from './thought-engine.js';

const ek = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const wpick = (items, wf) => { const ws = items.map(wf), tot = ws.reduce((s, w) => s + w, 0); if (!tot) return items[0]; let r = Math.random() * tot; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

export const AIMS = [
  { id: 'auto', label: 'Anywhere' }, { id: 'weak', label: 'Weakest' }, { id: 'hubs', label: 'Hubs' },
  { id: 'fringe', label: 'Fringe' }, { id: 'bridges', label: 'Bridges' }, { id: 'newest', label: 'Newest' },
];
export const DEFAULTS = { count: 10, links: 1.5, wild: 45, aim: 'auto', acts: { grow: true, fuse: true, challenge: true, project: true }, mix: {} };

// Natural language -> dial settings. Only keys it recognises are returned.
export function parseShake(text) {
  const t = String(text || '').toLowerCase(), s = {}, say = [];
  if (!t.trim()) return { settings: s, say };
  const words = [['avalanche', 40], ['flood', 30], ['tons', 30], ['lots', 25], ['loads', 25], ['dozen', 12], ['several', 7], ['handful', 6], ['a few', 5], ['few', 5], ['a couple', 2], ['couple', 2]];
  const m = t.match(/\b(\d{1,2})\b(?!\s*(links?|connections?|edges?))/);
  if (m) s.count = E.clamp(+m[1], 1, 40); else for (const [k, v] of words) if (t.includes(k)) { s.count = v; break; }
  if (s.count) say.push(`${s.count} new thoughts`);
  if (/\b(wild|crazy|weird|absurd|out there|outlandish|unhinged)\b/.test(t)) { s.wild = 90; say.push('wild'); }
  else if (/\b(grounded|safe|careful|factual|realistic|sober|boring)\b/.test(t)) { s.wild = 10; say.push('grounded'); }
  else if (/\bbalanced\b/.test(t)) { s.wild = 40; say.push('balanced'); }
  const lm = t.match(/(\d)\s*(links?|connections?|edges?)/);
  if (lm) s.links = E.clamp(+lm[1], 0, 4);
  else if (/\b(dense|tangled|web|interlink\w*|knotted|lots of (links|connections|edges)|well connected|cross-?link\w*)\b/.test(t)) s.links = 3.5;
  else if (/\b(sparse|loose|isolated|no links|few links|few connections|standalone)\b/.test(t)) s.links = 0.3;
  if (s.links != null) say.push(s.links >= 3 ? 'dense links' : s.links <= 0.5 ? 'loose links' : `${s.links} links each`);
  const aims = [[/\b(weak\w*|ungrounded|shaky|unproven|speculative)\b/, 'weak', 'near the weakest'], [/\b(hubs?|central|core|main|busiest)\b/, 'hubs', 'around hubs'], [/\b(edges? of|fringe|outer|leaf|leaves|periphery|margins?)\b/, 'fringe', 'on the fringe'], [/\b(bridge|bridges|between|across|gaps?)\b/, 'bridges', 'across bridges'], [/\b(newest|recent|latest|fresh\w*)\b/, 'newest', 'near the newest']];
  for (const [rx, id, w] of aims) if (rx.test(t)) { s.aim = id; say.push(w); break; }
  const f = /\b(fuse|combine|mix|collide|cross-?breed|mash)\b/.test(t), c = /\b(challenge|object|attack|doubt|break|poke|question)\b/.test(t), p = /\b(reframe|re-?express|flip|translate|restate)\b/.test(t);
  if (f || c || p) { s.acts = { grow: true, fuse: f, challenge: c, project: p }; say.push([f && 'fusing', c && 'challenging', p && 'reframing'].filter(Boolean).join(' + ')); }
  const mix = {};
  if (/\b(facts?|evidence|data|sources?)\b/.test(t)) mix.facts = 3;
  if (/\b(principles?|rules?|laws?)\b/.test(t)) mix.principles = 3;
  if (/\b(concepts?|frames?|framings?|models?|metaphors?)\b/.test(t)) mix.concepts = 3;
  if (/\b(wild|crazy|weird|absurd|out there)\b/.test(t)) mix.wild = 3;
  if (Object.keys(mix).length) { s.mix = mix; say.push(Object.keys(mix).join(' / ') + ' leaning'); }
  return { settings: s, say };
}

function pickAnchors(g, aim, k, focus) {
  const N = g.nodes.filter(n => !n.dormant), idx = new Map(g.nodes.map((n, i) => [n.id, i]));
  const near = focus ? new Set([focus, ...E.neighborsOf(g, focus).map(n => n.id)]) : null;
  const eff = !near && aim === 'weak' ? E.effectiveGrounding(g) : null;
  let bridge = null;
  if (!near && aim === 'bridges') { // cheap bridge proxy: many neighbours that do not know each other
    const adj = new Map(); for (const e of g.edges) { (adj.get(e.a) || adj.set(e.a, new Set()).get(e.a)).add(e.b); (adj.get(e.b) || adj.set(e.b, new Set()).get(e.b)).add(e.a); }
    bridge = new Map(); for (const [id, ns] of adj) { const a = [...ns]; let tri = 0; for (const x of a) { const nx = adj.get(x); if (nx) for (const y of a) if (y > x && nx.has(y)) tri++; } const kk = a.length, pairs = kk * (kk - 1) / 2; bridge.set(id, pairs ? (1 - tri / pairs) * Math.log(kk + 1) : 0); }
  }
  const score = n => {
    const noise = Math.random() * 0.35;
    if (near) return (near.has(n.id) ? 1 : 0.03) + noise;
    switch (aim) {
      case 'weak': return (1 - (eff.get(n.id) ?? n.g)) + noise;
      case 'hubs': return Math.log((n.deg || 0) + 1) * 0.6 + noise;
      case 'fringe': return 1 / (n.deg + 1) + noise;
      case 'bridges': return (bridge.get(n.id) || 0) * 0.6 + noise * 0.5;
      case 'newest': return idx.get(n.id) / g.nodes.length + noise * 0.5;
      default: return Math.random() + 0.1;
    }
  };
  const pool = N.map(n => ({ n, s: score(n) })).sort((a, b) => b.s - a.s);
  return pool.slice(0, Math.max(2, k)).map(x => x.n);
}
const planeMod = plane => { const ms = E.modules().filter(m => E.planeForModule(m.id) === plane); return ms.length ? ms[Math.floor(Math.random() * ms.length)] : E.pickModule(40); };

export async function shake(g, o = {}) {
  const t0 = performance.now(), S = { ...DEFAULTS, ...o, acts: { ...DEFAULTS.acts, ...(o.acts || {}) } };
  const had = new Set(g.nodes.map(n => n.id)), hadE = new Set(g.edges.map(e => ek(e.a, e.b)));
  const w = S.wild / 100, count = S.count, did = { grow: 0, fuse: 0, challenge: 0, project: 0, link: 0 };
  const anchors = pickAnchors(g, S.aim, Math.ceil(count / 2) + 1, o.focus || null);
  const targeted = Object.entries(S.acts).filter(([k, v]) => k !== 'grow' && v).length < 3;
  const actW = { grow: S.acts.grow ? 5 : 0, fuse: S.acts.fuse && g.nodes.length > 4 ? (targeted ? 3 : 1.4) : 0, challenge: S.acts.challenge ? (targeted ? 3 : 1.2) : 0, project: S.acts.project ? (targeted ? 3 : 1.2) : 0 };
  if (!Object.values(actW).some(Boolean)) actW.grow = 1;
  const added = () => g.nodes.filter(n => !had.has(n.id));
  const norm = n => n.label.trim().toLowerCase();
  const dropDupes = () => { const seen = new Set(), dup = []; for (const n of g.nodes) { const k = norm(n); if (seen.has(k)) { if (!had.has(n.id)) dup.push(n.id); } else seen.add(k); } if (dup.length) E.removeNodes(g, dup); return dup.length; };
  const mixW = p => ({ facts: (1 - w) * 3 + 0.4, concepts: 2, principles: 1.3, wild: w * 3.2 + 0.1 }[p]) * (S.mix[p] || 1);
  for (let i = 0; i < count * 5 && added().length < count; i++) {
    let a = anchors[i % anchors.length]; if (!g.byId.has(a.id)) continue;
    const act = wpick(Object.keys(actW), k => actW[k]), live = !!o.live;
    try {
      if (act === 'fuse') {
        const nb = new Set(E.neighborsOf(g, a.id).map(x => x.id)), b = wpick(g.nodes.filter(n => n.id !== a.id && !n.root && !n.members), n => nb.has(n.id) ? 1 : 4); // far-apart pairs react best
        if (!b) throw 0;
        const sim = E.nodeSim(a, b); if (sim > 0.72) throw 0; // near-duplicates would merge, not fuse
        const outcome = g.edges.some(e => e.kind === 'challenge' && ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))) ? 'tension' : (a.plane === b.plane && sim > 0.3 ? 'lift' : 'emergence'); // cheap stand-in for the engine's graph-wide tension scan, which is quadratic
        const r = await E.fuse(g, a.id, b.id, { wild: S.wild, auto: true, live, outcome }); if (r) { did.fuse++; dropDupes(); continue; }
      } else if (act === 'challenge') { if (a.root || a.challengeOf || (g.nodes.some(n => n.challengeOf === a.id))) throw 0; const r = await E.challenge(g, a.id, { live }); if (r) { did.challenge++; dropDupes(); continue; } }
      else if (act === 'project') {
        const plane = wpick(E.PLANES.map(p => p.id).filter(p => p !== a.plane), mixW); const r = await E.project(g, a.id, plane, { live }); if (r && !had.has(r.id) && g.byId.has(r.id)) { did.project++; dropDupes(); continue; }
      }
    } catch (e) { /* fall back to growing */ }
    const mod = planeMod(wpick(E.PLANES.map(p => p.id), mixW));
    const r = await E.expand(g, a.id, mod.id, { wild: S.wild, live: !!o.live, autoLink: false }); if (r.length) did.grow++;
    dropDupes();
  }
  dropDupes();
  const nodes = added();
  // Links: each new thought reaches for like-minded or distant neighbours; wildness widens the reach.
  const quota = Math.round(S.links * nodes.length), RELS = ['resembles', 'supports', 'bridges', 'refines'];
  let made = 0;
  const order = [...nodes].sort(() => Math.random() - 0.5);
  for (let pass = 0; pass < 3 && made < quota; pass++) for (const n of order) {
    if (made >= quota) break;
    const nb = new Set(E.neighborsOf(g, n.id).map(x => x.id));
    let target = null, rel = 'resembles';
    if (pass === 0) { const c = E.similar(g, n, 8).find(x => !nb.has(x.node.id) && x.node.id !== n.id); if (c) { target = c.node; rel = c.score > 0.25 ? 'resembles' : 'refines'; } }
    if (!target && (pass > 0 || w > 0.5)) { const far = g.nodes.filter(m => m.id !== n.id && !nb.has(m.id) && !m.root); if (far.length) { target = far[Math.floor(Math.random() * far.length)]; rel = RELS[2]; } }
    if (target && E.link(g, n.id, target.id, rel)) { made++; did.link++; }
  }
  const nodeIds = nodes.map(n => n.id);
  const edgeKeys = g.edges.map(e => ek(e.a, e.b)).filter(k => !hadE.has(k));
  const rep = { id: (g.shakes ? g.shakes.length : 0) + 1, at: E.timeStr(), nodes: nodeIds, edges: edgeKeys, did, ms: Math.round(performance.now() - t0), intent: { count: S.count, links: S.links, wild: S.wild, aim: o.focus ? 'here' : S.aim } };
  (g.shakes = g.shakes || []).push(rep);
  E.trace(g, 'graph', `SHAKE · +${nodeIds.length} thoughts, +${edgeKeys.length} links · ${S.aim} · wild ${S.wild}`);
  return rep;
}
export const toss = (g, ids) => { E.removeNodes(g, ids.filter(id => g.byId.has(id))); };
