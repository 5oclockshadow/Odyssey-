// Atlas engine: map anything as typed entities, typed links and nested levels. Headless, no DOM.
import { PACKS, GENERIC } from './atlas-packs.js';
export { PACKS, GENERIC };

const EXPECT = {
  laws: [{ type: 'statute', rel: 'enforces', dir: 'in', need: 'agency' }, { type: 'statute', rel: 'applies to', dir: 'out', need: 'party', skip: 'amends' }],
  recipes: [{ type: 'dish', rel: 'suits', dir: 'out', need: 'diet' }, { type: 'step', rel: 'uses', dir: 'out', need: 'ingredient' }],
  dna: [{ type: 'gene', rel: 'encodes', dir: 'out', need: 'protein' }, { type: 'gene', rel: 'regulates', dir: 'in', need: 'regulator' }],
  coins: [{ type: 'coin', rel: 'minted at', dir: 'out', need: 'mint' }, { type: 'coin', rel: 'issued under', dir: 'out', need: 'issuer' }],
  homes: [{ type: 'property', rel: 'owns', dir: 'in', need: 'person' }, { type: 'property', rel: 'insures', dir: 'in', need: 'org' }],
  companies: [{ type: 'company', rel: 'leads', dir: 'in', need: 'person' }],
  libraries: [{ type: 'item', rel: 'owns', dir: 'in', need: 'owner' }],
  logistics: [{ type: 'shipment', rel: 'fulfils', dir: 'out', need: 'order' }, { type: 'vehicle', rel: 'operated by', dir: 'out', need: 'carrier' }, { type: 'order', rel: 'ordered by', dir: 'out', need: 'customer' }],
  patents: [{ type: 'patent', rel: 'assigned to', dir: 'out', need: 'assignee' }, { type: 'patent', rel: 'invented', dir: 'in', need: 'inventor' }],
};
const KW = { laws: /law|legal|statute|regulat|legislat|court|compliance/, recipes: /recipe|dish|cook|food|meal|ingredient|kitchen|bak/, dna: /dna|gene|sequenc|genom|rna|protein|plasmid|codon/, coins: /coin|numismat|currency|mint|banknote|medal/, homes: /home|house|propert|real estate|mortgage|housing|apartment|landlord/, companies: /ceo|compan|corporat|executive|firm|business|board|shareholder|subsidiar/, libraries: /librar|archive|collection|book|provenance|museum|manuscript|catalog/, patents: /patent|invent|intellectual|trademark|licens/, logistics: /logistic|supply chain|shipping|freight|warehouse|fleet|delivery|depot|cargo|haulage|courier/ };
export function detectPack(topic) {
  const t = String(topic || '').toLowerCase(); let best = null, bs = 0;
  for (const p of PACKS) { const m = t.match(new RegExp(KW[p.id].source, 'g')); const s = m ? m.reduce((q, x) => q + x.length, 0) : 0; if (s > bs) { bs = s; best = p; } }
  return best || GENERIC;
}
const short = (s, n = 48) => { s = String(s || ''); return s.length <= n ? s : s.slice(0, n - 1) + '…'; };

export function createAtlas(topic = '', o = {}) {
  const pack = o.packObj || (o.pack ? (PACKS.find(p => p.id === o.pack) || GENERIC) : (o.detect ? detectPack(topic) : GENERIC));
  return { topic: topic || pack.name, lens: o.lens || '', pack, ents: new Map(), roots: [], links: [], focus: null, seq: 0, lseq: 0, sample: false, heat: new Map(), log: [] };
}
export const chain = (a, id) => { const out = []; let e = a.ents.get(id), guard = 0; while (e && guard++ < 64) { out.unshift(e.id); e = e.parent ? a.ents.get(e.parent) : null; } return out; };
export const depthOf = (a, id) => chain(a, id).length - 1;
export const typeOf = (a, id) => { const e = a.ents.get(id); return a.pack.types.find(t => t.id === e.type) || a.pack.types[0]; };
const rad = (i, n, r) => ({ x: Math.cos(i / Math.max(1, n) * Math.PI * 2) * r, y: Math.sin(i / Math.max(1, n) * Math.PI * 2) * r });

const cleanTags = t => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map(x => String(x).trim().replace(/^#/, '').slice(0, 40)).filter(Boolean))].slice(0, 20);
const cleanAttrs = o => { const r = {}; for (const [k, v] of Object.entries(o || {})) { const kk = String(k).trim().slice(0, 60); if (kk && v != null) r[kk] = (typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 2000)); } return r; };
export function addEntity(a, { type, label, attrs = {}, note = '', parent = null, unverified = false, tags = [], source = '', created, edited }) {
  label = String(label || '').trim(); if (!label) return null;
  const p = parent ? a.ents.get(parent) : null; if (parent && !p) return null;
  const t = a.pack.types.find(x => x.id === type) || a.pack.types[0], sibs = p ? p.kids : a.roots, pt = rad(sibs.length, sibs.length + 1, 120);
  const e = { id: 'e' + (++a.seq), type: t.id, label, attrs: cleanAttrs(attrs), note: String(note || ''), tags: cleanTags(tags), source: String(source || '').trim().slice(0, 500), created: created || Date.now(), edited: edited || created || Date.now(), parent: p ? p.id : null, kids: [], x: pt.x + (Math.random() - 0.5) * 30, y: pt.y + (Math.random() - 0.5) * 30, vx: 0, vy: 0, born: typeof performance !== 'undefined' ? performance.now() : 0, unverified };
  a.ents.set(e.id, e); sibs.push(e.id); return e;
}
export function findByLabel(a, label, type) { const k = String(label).trim().toLowerCase(); let hit = null; for (const e of a.ents.values()) if (e.label.toLowerCase() === k && (!type || e.type === type)) { hit = e; break; } return hit; }
const relByLabel = (a, r) => a.pack.relations.find(x => x.label === r || x.id === r) || null;
export function addLink(a, from, to, rel, attrs = {}) {
  if (from === to || !a.ents.has(from) || !a.ents.has(to)) return null;
  const R = relByLabel(a, rel), label = R ? R.label : String(rel || 'relates to');
  if (a.links.some(l => l.a === from && l.b === to && l.rel === label)) return null;
  const l = { id: 'l' + (++a.lseq), a: from, b: to, rel: label, attrs: { ...attrs } }; a.links.push(l); return l;
}
export function removeEntity(a, id) {
  const e = a.ents.get(id); if (!e) return 0; const doomed = []; const walk = i => { doomed.push(i); for (const k of a.ents.get(i).kids) walk(k); }; walk(id);
  const S = new Set(doomed); a.links = a.links.filter(l => !S.has(l.a) && !S.has(l.b));
  const sibs = e.parent ? a.ents.get(e.parent).kids : a.roots, i = sibs.indexOf(id); if (i >= 0) sibs.splice(i, 1);
  if (a.focus && S.has(a.focus)) a.focus = e.parent;
  for (const i2 of doomed) { a.ents.delete(i2); a.heat.delete(i2); } return doomed.length;
}
export function updateEntity(a, id, patch) { const e = a.ents.get(id); if (!e) return null; if (patch.label != null && String(patch.label).trim()) e.label = String(patch.label).trim(); if (patch.type && a.pack.types.some(t => t.id === patch.type)) e.type = patch.type; if (patch.note != null) e.note = String(patch.note); if (patch.attrs) { for (const [k, v] of Object.entries(patch.attrs)) { const kk = String(k).trim(); if (!kk) continue; if (v == null) delete e.attrs[kk]; else e.attrs[kk.slice(0, 60)] = (typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 2000)); } } if (patch.renameAttr && e.attrs[patch.renameAttr.from] != null) { const to = String(patch.renameAttr.to || '').trim().slice(0, 60); if (to && !(to in e.attrs)) { const nx = {}; for (const [k, v] of Object.entries(e.attrs)) nx[k === patch.renameAttr.from ? to : k] = v; e.attrs = nx; } } if (patch.tags != null) e.tags = cleanTags(patch.tags); if (patch.source != null) e.source = String(patch.source).trim().slice(0, 500); if (patch.unverified != null) e.unverified = !!patch.unverified; e.edited = Date.now(); return e; }
export function moveEntity(a, id, newParent) {
  const e = a.ents.get(id); if (!e || id === newParent) return false; if (newParent && (!a.ents.has(newParent) || chain(a, newParent).includes(id))) return false;
  const from = e.parent ? a.ents.get(e.parent).kids : a.roots, i = from.indexOf(id); if (i >= 0) from.splice(i, 1);
  (newParent ? a.ents.get(newParent).kids : a.roots).push(id); e.parent = newParent || null; return true;
}
export function removeLink(a, id) { const i = a.links.findIndex(l => l.id === id); if (i < 0) return false; a.links.splice(i, 1); return true; }

// Build a map from a pack's sample: nested entities plus label-addressed links.
export function loadSample(a) {
  const S = a.pack.sample && a.pack.sample(); if (!S) return a; a.sample = true;
  const build = (node, parent) => { const [type, label, attrs, kids] = node, e = addEntity(a, { type, label, attrs, parent }); for (const k of kids || []) build(k, e.id); };
  for (const r of S.roots) build(r, null);
  for (const [x, y, rel, attrs] of S.links) { const A = findByLabel(a, x), B = findByLabel(a, y); if (A && B) addLink(a, A.id, B.id, rel, attrs || {}); }
  return a;
}
// Plain outline: indentation is containment, "type: label" sets a type, "A -rel-> B" adds a link.
export function parseOutline(a, text) {
  const added = [], stack = [], pending = [];
  for (const raw of String(text || '').split('\n')) {
    if (!raw.trim()) continue; const lm = raw.match(/^\s*(.+?)\s*-\s*([^>-][^>]*?)\s*->\s*(.+?)\s*$/);
    if (lm) { pending.push([lm[1], lm[3], lm[2]]); continue; }
    const indent = Math.floor((raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length) / 2); let body = raw.trim().replace(/^[-*•]\s*/, ''), type = null;
    const tm = body.match(/^([A-Za-z ]{2,18}):\s*(.+)$/); if (tm) { const t = a.pack.types.find(x => x.id === tm[1].toLowerCase() || x.label.toLowerCase() === tm[1].toLowerCase()); if (t) { type = t.id; body = tm[2]; } }
    stack.length = Math.min(stack.length, indent); const parent = stack.length ? stack[stack.length - 1] : null;
    const e = addEntity(a, { type: type || (a.pack.types[Math.min(indent, a.pack.types.length - 1)] || a.pack.types[0]).id, label: body, parent }); if (e) { stack[indent] = e.id; added.push(e); }
  }
  let links = 0; for (const [x, y, r] of pending) { const A = findByLabel(a, x), B = findByLabel(a, y); if (A && B && addLink(a, A.id, B.id, r)) links++; }
  return { added, links };
}
export function exportJSON(a) { return { topic: a.topic, lens: a.lens || '', pack: a.pack.id, packDef: a.pack.custom ? a.pack : undefined, entities: [...a.ents.values()].map(e => ({ id: e.id, type: e.type, label: e.label, attrs: e.attrs, note: e.note, tags: e.tags || [], source: e.source || '', created: e.created, edited: e.edited, parent: e.parent, unverified: !!e.unverified, dismissed: e.dismissed || [], x: Math.round(e.x || 0), y: Math.round(e.y || 0) })), links: a.links.map(l => ({ a: l.a, b: l.b, rel: l.rel, attrs: l.attrs })) }; }
export function importJSON(d) {
  const a = createAtlas(d.topic || '', { ...(d.packDef ? { packObj: d.packDef } : { pack: d.pack }), lens: d.lens }), idMap = new Map(), pending = [...(d.entities || [])];
  for (let guard = 0; pending.length && guard < 64; guard++) for (let i = pending.length - 1; i >= 0; i--) { const x = pending[i]; if (x.parent && !idMap.has(x.parent)) continue; const e = addEntity(a, { type: x.type, label: x.label, attrs: x.attrs, note: x.note, tags: x.tags, source: x.source, created: x.created, edited: x.edited, parent: x.parent ? idMap.get(x.parent) : null, unverified: x.unverified }); if (e) { idMap.set(x.id, e.id); e.born = 0; if (typeof x.x === 'number' && typeof x.y === 'number') { e.x = x.x; e.y = x.y; } if (x.dismissed && x.dismissed.length) e.dismissed = [...x.dismissed]; } pending.splice(i, 1); }
  for (const l of d.links || []) if (idMap.has(l.a) && idMap.has(l.b)) addLink(a, idMap.get(l.a), idMap.get(l.b), l.rel, l.attrs); a._idMap = idMap; return a;
}

// ── levels: what is on screen at one depth, with links lifted from deeper entities ──
export function level(a, focus = a.focus) {
  const kids = focus && a.ents.get(focus) ? a.ents.get(focus).kids : a.roots, nodes = kids.map(id => a.ents.get(id)), rep = new Map();
  const mark = (id, r) => { rep.set(id, r); for (const k of a.ents.get(id).kids) mark(k, r); }; for (const id of kids) mark(id, id);
  const P = focus ? chain(a, focus) : [], agg = new Map(), ghosts = new Map();
  const ghostOf = out => { const C = chain(a, out); let i = 0; while (i < C.length && i < P.length && C[i] === P[i]) i++; return C[i] ?? out; };
  for (const l of a.links) {
    const ra = rep.get(l.a), rb = rep.get(l.b); let A, B, ghost = false;
    if (ra && rb) { if (ra === rb) continue; A = ra; B = rb; } else if (ra || rb) { ghost = true; const g = ghostOf(ra ? l.b : l.a); ghosts.set(g, a.ents.get(g)); A = ra || g; B = rb || g; } else continue;
    const k = A + '|' + B + '|' + l.rel, x = agg.get(k) || agg.set(k, { a: A, b: B, rel: l.rel, count: 0, ids: [], ghost }).get(k); x.count++; x.ids.push(l.id);
  }
  return { focus, nodes, links: [...agg.values()], ghosts: [...ghosts.values()], path: P };
}
export const canDescend = (a, id) => !!(a.ents.get(id) && a.ents.get(id).kids.length);
export function descend(a, id) { if (!canDescend(a, id)) return false; a.focus = id; return true; }
export function ascend(a) { if (!a.focus) return null; const from = a.focus, e = a.ents.get(from); a.focus = e ? e.parent : null; return from; }
export function jump(a, id) { if (id && !a.ents.has(id)) return false; a.focus = id || null; return true; }
export const trail = a => [{ id: null, label: a.topic || 'Atlas', type: null }, ...(a.focus ? chain(a, a.focus).map(id => ({ id, label: a.ents.get(id).label, type: a.ents.get(id).type })) : [])];
export function search(a, q) {
  const k = String(q || '').trim().toLowerCase(); if (!k) return [];
  return [...a.ents.values()].filter(e => e.label.toLowerCase().includes(k) || e.note.toLowerCase().includes(k) || (e.tags || []).some(t => t.toLowerCase().includes(k)) || Object.values(e.attrs).some(v => String(v).toLowerCase().includes(k))).map(e => ({ id: e.id, label: e.label, type: e.type, path: chain(a, e.id).slice(0, -1).map(i => a.ents.get(i).label).join(' › ') }));
}
export function stats(a) {
  const byType = {}, byRel = {}; let depth = 0, unverified = 0;
  for (const e of a.ents.values()) { byType[e.type] = (byType[e.type] || 0) + 1; if (e.unverified) unverified++; } for (const id of a.ents.keys()) depth = Math.max(depth, depthOf(a, id) + 1);
  for (const l of a.links) byRel[l.rel] = (byRel[l.rel] || 0) + 1; return { entities: a.ents.size, links: a.links.length, depth, byType, byRel, unverified, gaps: gaps(a).length };
}

// ── view data ──
export function columns(a, selId) {
  const cols = [{ title: a.topic, ents: a.roots.map(id => a.ents.get(id)), sel: null }], P = selId && a.ents.has(selId) ? chain(a, selId) : [];
  P.forEach((id, i) => { cols[i].sel = id; const e = a.ents.get(id); if (e.kids.length) cols.push({ title: e.label, ents: e.kids.map(k => a.ents.get(k)), sel: null }); }); return cols;
}
export function table(a, { scope = 'level', sort = 'label', q = '', focus = a.focus } = {}) {
  let list = scope === 'all' ? [...a.ents.values()] : level(a, focus).nodes; const k = q.trim().toLowerCase();
  if (k) list = list.filter(e => e.label.toLowerCase().includes(k) || Object.values(e.attrs).some(v => String(v).toLowerCase().includes(k)));
  const deg = new Map(); for (const l of a.links) { deg.set(l.a, (deg.get(l.a) || 0) + 1); deg.set(l.b, (deg.get(l.b) || 0) + 1); }
  const rows = list.map(e => ({ e, type: e.type, label: e.label, links: deg.get(e.id) || 0, kids: e.kids.length, path: chain(a, e.id).slice(0, -1).map(i => a.ents.get(i).label).join(' › ') }));
  rows.sort((x, y) => sort === 'links' ? y.links - x.links : sort === 'type' ? x.type.localeCompare(y.type) || x.label.localeCompare(y.label) : sort === 'kids' ? y.kids - x.kids : x.label.localeCompare(y.label)); return rows;
}
// Layered left-to-right layout for directed relations (ownership, citation, flow).
export function flow(a, lv = level(a)) {
  const ids = lv.nodes.map(n => n.id), S = new Set(ids), isDir = rel => { const R = a.pack.relations.find(r => r.label === rel); return R ? R.directed : true; };
  const E = lv.links.filter(l => S.has(l.a) && S.has(l.b) && isDir(l.rel)), layer = new Map(ids.map(i => [i, 0]));
  for (let it = 0; it < ids.length; it++) { let ch = false; for (const l of E) if (layer.get(l.b) < layer.get(l.a) + 1 && layer.get(l.a) + 1 <= ids.length) { layer.set(l.b, layer.get(l.a) + 1); ch = true; } if (!ch) break; }
  const max = Math.max(0, ...layer.values()), layers = Array.from({ length: max + 1 }, () => []); for (const i of ids) layers[layer.get(i)].push(i);
  const pos = new Map(); const reindex = () => layers.forEach(L => L.forEach((id, i) => pos.set(id, i))); reindex();
  for (let sweep = 0; sweep < 3; sweep++) { for (let li = 1; li < layers.length; li++) { const bc = id => { const ps = E.filter(l => l.b === id).map(l => pos.get(l.a)); return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : pos.get(id); }; layers[li].sort((x, y) => bc(x) - bc(y)); reindex(); } }
  return { layers, layerOf: layer, edges: E, loose: ids.filter(i => !E.some(l => l.a === i || l.b === i)) };
}
export function radial(a, maxDepth = 3) {
  const leaves = id => { const e = a.ents.get(id); return e.kids.length ? e.kids.reduce((s, k) => s + leaves(k), 0) : 1; }, out = [];
  const place = (ids, a0, a1, depth) => { const tot = ids.reduce((s, i) => s + leaves(i), 0); let cur = a0; for (const id of ids) { const span = (a1 - a0) * leaves(id) / tot; out.push({ id, depth, a0: cur, a1: cur + span }); if (depth < maxDepth) place(a.ents.get(id).kids, cur, cur + span, depth + 1); cur += span; } };
  if (a.roots.length) place(a.roots, -Math.PI / 2, Math.PI * 1.5, 0); return out;
}
// Force layout for one level. Positions live on the entities.
export function stepLevel(a, lv, alpha = 1, w = 900, h = 600) {
  const N = lv.nodes, n = N.length; if (!n) return 0; const by = new Map(N.map(e => [e.id, e]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const p = N[i], q = N[j]; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy; if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; } const d = Math.sqrt(d2), f = 5200 * alpha / d2; p.vx -= dx / d * f; p.vy -= dy / d * f; q.vx += dx / d * f; q.vy += dy / d * f; }
  for (const l of lv.links) { const p = by.get(l.a), q = by.get(l.b); if (!p || !q) continue; const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 150) * 0.03 * alpha; p.vx += dx / d * f; p.vy += dy / d * f; q.vx -= dx / d * f; q.vy -= dy / d * f; }
  let en = 0; for (const e of N) { e.vx -= e.x * 0.012 * alpha; e.vy -= e.y * 0.012 * alpha; e.vx *= 0.8; e.vy *= 0.8; e.x += e.vx; e.y += e.vy; e.x = Math.max(-w, Math.min(w, e.x)); e.y = Math.max(-h, Math.min(h, e.y)); en += e.vx * e.vx + e.vy * e.vy; }
  return en / n;
}

// ── gaps, research and the brain ──
export function gaps(a) {
  const rules = EXPECT[a.pack.id] || [], out = [];
  for (const e of a.ents.values()) for (const r of rules) {
    if (e.type !== r.type || e.unverified) continue; if (r.skip && a.links.some(l => l.rel === r.skip && (l.a === e.id || l.b === e.id))) continue; const C = chain(a, e.id);
    const ok = a.links.some(l => l.rel === r.rel && (r.dir === 'in' ? C.includes(l.b) : C.includes(l.a)));
    if (!ok) { const need = a.pack.types.find(t => t.id === r.need); out.push({ ent: e.id, rel: r.rel, dir: r.dir, need: r.need, text: `${e.label}: no ${need ? need.label.toLowerCase() : r.need} ${r.dir === 'in' ? 'linked via' : 'linked via'} "${r.rel}"` }); }
  }
  return out;
}
const hasClaude = () => typeof window !== 'undefined' && window.claude && typeof window.claude.complete === 'function';
export const liveAvailable = hasClaude;
export function touch(a, id, v = 1) { a.heat.set(id, Math.min(4, (a.heat.get(id) || 0) + v)); }
export function cool(a) { for (const [k, v] of a.heat) { if (v < 0.05) a.heat.delete(k); else a.heat.set(k, v * 0.9); } }
export async function research(a, gap, o = {}) {
  const e = a.ents.get(gap.ent); if (!e) return null; const need = a.pack.types.find(t => t.id === gap.need) || a.pack.types[0]; let spec = null;
  if (o.live && hasClaude()) {
    try {
      const txt = await window.claude.complete(`Map: "${a.topic}" (${a.pack.name}). Entity: "${e.label}" (${e.type}${Object.keys(e.attrs).length ? ', ' + JSON.stringify(e.attrs) : ''}). It has no ${need.label.toLowerCase()} linked by "${gap.rel}". Propose ONE plausible ${need.label.toLowerCase()} that fits as an illustrative placeholder. Return ONLY JSON {"label": string <= 60 chars, "note": string <= 120 chars}. Do not claim it is a real record.`);
      const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); if (j.label) spec = { label: short(String(j.label), 70), note: short(String(j.note || ''), 160) + ' (AI proposal, unverified)' };
    } catch (x) { /* fall back to a placeholder */ }
  }
  if (!spec) spec = { label: '? ' + need.label + ' ' + (gap.dir === 'in' ? 'for' : 'of') + ' ' + short(e.label, 30), note: 'Open question found by the map: ' + gap.text };
  if (findByLabel(a, spec.label)) return null;
  const n = addEntity(a, { type: need.id, label: spec.label, note: spec.note, parent: o.parent === 'sibling' ? e.parent : null, unverified: true }); if (!n) return null;
  const l = gap.dir === 'in' ? addLink(a, n.id, e.id, gap.rel) : addLink(a, e.id, n.id, gap.rel); touch(a, e.id, 0.5); touch(a, n.id, 1); return { entity: n, link: l, gap };
}
// One auto step: pick an open question (hot and shallow first) and research it.
export async function autoStep(a, o = {}) {
  cool(a); const G = gaps(a); if (!G.length) return { idle: true, reason: 'No open questions: every entity meets its pack rules.' };
  const g = G.map(x => ({ x, s: (a.heat.get(x.ent) || 0) + 1 / (1 + depthOf(a, x.ent)) + Math.random() * 0.6 })).sort((p, q) => q.s - p.s)[0].x;
  const r = await research(a, g, { live: o.live, parent: 'sibling' }); return r ? { idle: false, ...r } : { idle: true, reason: 'Nothing new to add for ' + a.ents.get(g.ent).label };
}
// Sleep: fold duplicate placeholders and exact duplicates, drop repeated links.
export function consolidate(a) {
  let merged = 0; const seen = new Map();
  for (const e of [...a.ents.values()]) { const k = e.type + '|' + e.label.toLowerCase() + '|' + (e.parent || ''); const keep = seen.get(k); if (!keep) { seen.set(k, e.id); continue; }
    for (const l of a.links) { if (l.a === e.id) l.a = keep; if (l.b === e.id) l.b = keep; } for (const kid of [...e.kids]) moveEntity(a, kid, keep); removeEntity(a, e.id); merged++; }
  const ks = new Set(); a.links = a.links.filter(l => { const k = l.a + '|' + l.b + '|' + l.rel; if (l.a === l.b || ks.has(k)) return false; ks.add(k); return true; }); return { merged };
}
// Live fill: ask Claude for a starter map for any topic, shaped by the pack.
export async function liveFill(a, topic, o = {}) {
  if (!hasClaude()) return null;
  const types = a.pack.types.map(t => t.id).join(', '), rels = a.pack.relations.map(r => r.label).join(', ');
  try {
    const txt = await window.claude.complete(`Create an ILLUSTRATIVE map for the topic "${topic}". Use invented example names, not real people or firms. Entity types: ${types}. Link verbs: ${rels}. Entities may nest (parent = label of the containing entity). Return ONLY JSON {"entities":[{"label":string,"type":string,"parent":string|null,"attrs":object}],"links":[{"a":string,"b":string,"rel":string}]} with 12 to 24 entities and 8 to 20 links.`);
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)), byLabel = new Map(); let n = 0;
    const list = [...(j.entities || [])]; for (let g = 0; g < 4 && list.length; g++) for (let i = list.length - 1; i >= 0; i--) { const x = list[i]; if (x.parent && !byLabel.has(String(x.parent).toLowerCase())) continue; const e = addEntity(a, { type: x.type, label: x.label, attrs: x.attrs || {}, parent: x.parent ? byLabel.get(String(x.parent).toLowerCase()) : null, unverified: true }); if (e) { byLabel.set(e.label.toLowerCase(), e.id); n++; } list.splice(i, 1); }
    let links = 0; for (const l of j.links || []) { const A = byLabel.get(String(l.a).toLowerCase()), B = byLabel.get(String(l.b).toLowerCase()); if (A && B && addLink(a, A, B, l.rel)) links++; }
    a.sample = false; return { entities: n, links };
  } catch (e) { return null; }
}
export const serialize = a => ({ ...exportJSON(a), focus: a.focus, sample: a.sample });
export function restore(d) { const a = importJSON(d); a.sample = !!d.sample; a.focus = d.focus && a._idMap.get(d.focus) || null; return a; }

export function descendants(a, id) { let n = 0; const walk = i => { for (const k of a.ents.get(i).kids) { n++; walk(k); } }; if (a.ents.has(id)) walk(id); return n; }
// Squarified treemap: items {id, v} laid out in the box; returns [{id, x, y, w, h}].
export function squarify(items, x, y, w, h) {
  items = items.map(i => ({ ...i })).sort((p, q) => q.v - p.v); const tot = items.reduce((s, i) => s + i.v, 0) || 1, k = w * h / tot, out = []; items.forEach(i => { i.a = i.v * k; });
  const worst = (r, s) => { const sum = r.reduce((q, i) => q + i.a, 0), mx = Math.max(...r.map(i => i.a)), mn = Math.min(...r.map(i => i.a)); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); };
  while (items.length) { const sh = Math.min(w, h), row = [items[0]]; let rest = 1; while (rest < items.length && worst([...row, items[rest]], sh) <= worst(row, sh)) { row.push(items[rest]); rest++; }
    const sum = row.reduce((q, i) => q + i.a, 0);
    if (w >= h) { const rw = sum / h; let yy = y; for (const i of row) { const hh = i.a / rw; out.push({ id: i.id, x, y: yy, w: rw, h: hh }); yy += hh; } x += rw; w -= rw; } else { const rh = sum / w; let xx = x; for (const i of row) { const ww = i.a / rh; out.push({ id: i.id, x: xx, y, w: ww, h: rh }); xx += ww; } y += rh; h -= rh; }
    items = items.slice(row.length); }
  return out;
}

// ── editing depth: merge two ideas, edit a link, export as text, ask the map ──
export function mergeEntities(a, src, dst) {
  const s = a.ents.get(src), d = a.ents.get(dst); if (!s || !d || src === dst || chain(a, dst).includes(src)) return null;
  let links = 0, parts = 0;
  for (const l of [...a.links]) { if (l.a !== src && l.b !== src) continue; const from = l.a === src ? dst : l.a, to = l.b === src ? dst : l.b; if (addLink(a, from, to, l.rel, l.attrs)) links++; }
  for (const k of [...s.kids]) if (moveEntity(a, k, dst)) parts++;
  if (s.note && !d.note.includes(s.note)) d.note = (d.note ? d.note + '\n' : '') + s.note;
  for (const [k, v] of Object.entries(s.attrs)) if (d.attrs[k] == null || d.attrs[k] === '') d.attrs[k] = v;
  if (!s.unverified) d.unverified = false; removeEntity(a, src); return { links, parts };
}
export function updateLink(a, id, patch = {}) { const l = a.links.find(x => x.id === id); if (!l) return null; if (patch.rel) { const R = relByLabel(a, patch.rel); l.rel = R ? R.label : String(patch.rel); } if (patch.flip) { const t = l.a; l.a = l.b; l.b = t; } return l; }
const cleanNote = s => String(s || '').replace(/\s+/g, ' ').trim();
export function exportMarkdown(a) {
  const out = ['# ' + a.topic, '']; if (a.lens) out.push('_' + a.lens + '_', '');
  out.push('Kinds: ' + a.pack.types.map(t => t.label).join(', ') + '. Verbs: ' + a.pack.relations.map(r => r.label).join(', ') + '.', '');
  const walk = (ids, d) => { for (const id of ids) { const e = a.ents.get(id), t = typeOf(a, id), at = Object.entries(e.attrs).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + ': ' + v).join(', '); out.push('  '.repeat(d) + '- **' + e.label + '** (' + t.label + (e.unverified ? ', unverified' : '') + ')' + (at ? ' · ' + at : '') + (e.tags && e.tags.length ? ' · ' + e.tags.map(t => '#' + t).join(' ') : '') + (e.source ? ' · [source](' + e.source + ')' : '') + (e.note ? ' — ' + cleanNote(e.note) : '')); walk(e.kids, d + 1); } };
  walk(a.roots, 0);
  if (a.links.length) { out.push('', '## Links', ''); for (const l of a.links) out.push('- ' + a.ents.get(l.a).label + ' → ' + l.rel + ' → ' + a.ents.get(l.b).label); }
  const G = gaps(a); if (G.length) { out.push('', '## Open questions', ''); for (const g of G.slice(0, 40)) out.push('- ' + g.text); }
  return out.join('\n') + '\n';
}
// The same shape parseOutline reads, so a map can round-trip through plain text.
export function exportOutline(a) { const out = []; const walk = (ids, d) => { for (const id of ids) { const e = a.ents.get(id), t = typeOf(a, id), pre = /^[A-Za-z ]{2,18}$/.test(t.label) ? t.label + ': ' : ''; out.push('  '.repeat(d) + pre + e.label); walk(e.kids, d + 1); } }; walk(a.roots, 0); for (const l of a.links) out.push(a.ents.get(l.a).label + ' -' + l.rel + '-> ' + a.ents.get(l.b).label); return out.join('\n') + '\n'; }
const STOP = new Set(['the', 'and', 'what', 'which', 'who', 'how', 'does', 'are', 'for', 'with', 'that', 'this', 'from', 'into', 'its', 'did', 'where', 'when', 'why', 'can', 'map', 'idea', 'ideas', 'about', 'tell', 'show', 'all', 'any', 'there', 'have', 'has']);
const article = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + String(w).toLowerCase();
export function queryMap(a, q) {
  const toks = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t));
  if (!toks.length) return { hits: [], answer: 'Ask with a few content words: a name, a kind of thing, a verb.' };
  const score = e => { const lab = e.label.toLowerCase(), hay = (lab + ' ' + e.note + ' ' + Object.values(e.attrs).join(' ') + ' ' + (e.tags || []).join(' ') + ' ' + typeOf(a, e.id).label).toLowerCase(); let s = 0; for (const t of toks) { if (lab.includes(t)) s += 3; else if (hay.includes(t)) s += 1; } return s; };
  const hits = [...a.ents.values()].map(e => ({ e, s: score(e) })).filter(h => h.s > 0).sort((x, y) => y.s - x.s).slice(0, 6);
  if (!hits.length) return { hits: [], answer: 'Nothing in this map matches "' + q + '" yet.' };
  const where = e => { const c = chain(a, e.id).slice(0, -1).map(i => a.ents.get(i).label); return c.length ? ' inside ' + c.join(' › ') : ' at the top level'; };
  const lines = hits.slice(0, 3).map(({ e }) => { const out = a.links.filter(l => l.a === e.id).map(l => l.rel + ' ' + a.ents.get(l.b).label), inn = a.links.filter(l => l.b === e.id).map(l => a.ents.get(l.a).label + ' ' + l.rel + ' it'); let s = e.label + ' is ' + article(typeOf(a, e.id).label) + where(e) + (e.kids.length ? ', holding ' + e.kids.length + (e.kids.length === 1 ? ' idea' : ' ideas') : '') + '.'; if (out.length) s += ' It ' + out.slice(0, 4).join(', ') + '.'; if (inn.length) s += ' ' + inn.slice(0, 3).join('; ').replace(/^./, c => c.toUpperCase()) + '.'; if (e.note) s += ' Note: ' + short(cleanNote(e.note), 120); if (e.unverified) s += ' (unverified)'; return s; });
  return { hits: hits.map(h => ({ id: h.e.id, label: h.e.label, score: h.s })), answer: (hits.length === 1 ? 'One idea matches.' : hits.length + ' ideas match.') + '\n' + lines.join('\n') };
}
export async function liveAsk(a, q, hits) {
  if (!hasClaude()) return null; const ids = new Set((hits || []).map(h => h.id)); for (const l of a.links) if (ids.has(l.a) || ids.has(l.b)) { ids.add(l.a); ids.add(l.b); } if (!ids.size) for (const id of a.roots.slice(0, 30)) ids.add(id);
  const ctx = [...ids].slice(0, 60).map(id => { const e = a.ents.get(id); return '- ' + e.label + ' [' + typeOf(a, id).label + (e.parent ? ', inside ' + a.ents.get(e.parent).label : '') + ']' + (e.note ? ': ' + short(cleanNote(e.note), 100) : ''); }), lk = a.links.filter(l => ids.has(l.a) && ids.has(l.b)).slice(0, 80).map(l => a.ents.get(l.a).label + ' —' + l.rel + '→ ' + a.ents.get(l.b).label);
  try { const t = await window.claude.complete('You answer questions about a user\'s map titled "' + a.topic + '". Use ONLY the map below. If it cannot answer, say in one sentence what is missing. At most 90 words, plain prose, no markdown.\nIDEAS:\n' + ctx.join('\n') + '\nLINKS:\n' + (lk.join('\n') || '(none)') + '\nQUESTION: ' + q); return String(t || '').trim().slice(0, 700) || null; } catch (e) { return null; }
}
