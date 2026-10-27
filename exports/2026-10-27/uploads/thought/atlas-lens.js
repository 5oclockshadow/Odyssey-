// Sub-maps and paths for ANY idea: map into it, for it, from it, or backwards from a goal, and synthesize the missing steps.
import * as A from './atlas-engine.js';

export const UNIVERSAL = [
  { id: 'part', label: 'part of', from: [], to: [], directed: true }, { id: 'serves', label: 'serves', from: [], to: [], directed: true },
  { id: 'leads', label: 'leads to', from: [], to: [], directed: true }, { id: 'requires', label: 'requires', from: [], to: [], directed: true },
];
export const MODES = [
  { id: 'into', label: 'Into', blurb: 'What it is made of', verb: null },
  { id: 'for', label: 'For', blurb: 'What it serves, who needs it', verb: 'serves' },
  { id: 'from', label: 'From', blurb: 'What follows from it', verb: 'leads to' },
  { id: 'reverse', label: 'Reverse', blurb: 'What must come first, back to the source', verb: 'requires' },
];
export const directedRel = (a, rel) => { const R = a.pack.relations.find(r => r.label === rel) || UNIVERSAL.find(r => r.label === rel); return R ? R.directed : true; };
const out = (a, id) => a.links.filter(l => l.a === id).map(l => ({ l, to: l.b })).concat(a.links.filter(l => l.b === id && !directedRel(a, l.rel)).map(l => ({ l, to: l.a })));
const inn = (a, id) => a.links.filter(l => l.b === id).map(l => ({ l, to: l.a })).concat(a.links.filter(l => l.a === id && !directedRel(a, l.rel)).map(l => ({ l, to: l.b })));

// The sub-map of one entity: which entities and links belong, with hop distance from it.
export function subMap(a, id, mode, o = {}) {
  const e = a.ents.get(id); if (!e) return null; const depth = o.depth || 4, dist = new Map([[id, 0]]), links = new Set();
  if (mode === 'into') { const walk = (i, d) => { for (const k of a.ents.get(i).kids) { dist.set(k, d); if (d < depth) walk(k, d + 1); } }; walk(id, 1); const S = new Set(dist.keys()); for (const l of a.links) if (S.has(l.a) && S.has(l.b)) links.add(l.id); }
  else { const step = mode === 'from' ? out : inn; let frontier = [id]; for (let d = 1; d <= depth && frontier.length; d++) { const next = []; for (const f of frontier) for (const { l, to } of step(a, f)) { links.add(l.id); if (!dist.has(to)) { dist.set(to, d); next.push(to); } } frontier = next; } }
  const order = [...dist.entries()].sort((x, y) => x[1] - y[1]).map(x => x[0]);
  return { id, mode, ids: new Set(dist.keys()), dist, links, order, size: dist.size - 1 };
}
// Forward and reverse routes between two entities along the direction of the links.
export function paths(a, from, to, o = {}) {
  const max = o.max || 4, find = (s, t, step) => { const res = [], q = [[s]]; while (q.length && res.length < max) { const p = q.shift(), last = p[p.length - 1]; if (last === t) { res.push(p); continue; } if (p.length > (o.depth || 7)) continue; for (const { to: n } of step(a, last)) if (!p.includes(n)) q.push([...p, n]); } return res; };
  const forward = find(from, to, out), reverse = find(to, from, out), und = A.chain ? (() => { const adj = new Map(); for (const l of a.links) { (adj.get(l.a) || adj.set(l.a, []).get(l.a)).push(l.b); (adj.get(l.b) || adj.set(l.b, []).get(l.b)).push(l.a); } for (const e of a.ents.values()) if (e.parent) { (adj.get(e.id) || adj.set(e.id, []).get(e.id)).push(e.parent); (adj.get(e.parent) || adj.set(e.parent, []).get(e.parent)).push(e.id); } /* being inside something also connects two ideas */ const prev = new Map([[from, null]]), q = [from]; while (q.length) { const v = q.shift(); if (v === to) break; for (const w of adj.get(v) || []) if (!prev.has(w)) { prev.set(w, v); q.push(w); } } if (!prev.has(to)) return null; const p = []; for (let v = to; v !== null; v = prev.get(v)) p.unshift(v); return p; })() : null;
  return { forward, reverse, undirected: und, connected: forward.length > 0 || reverse.length > 0 };
}
const edgeOf = (a, x, y) => a.links.find(l => (l.a === x && l.b === y) || (l.a === y && l.b === x));
export const pathLinkIds = (a, p) => { const s = new Set(); for (let i = 1; i < p.length; i++) { const l = edgeOf(a, p[i - 1], p[i]); if (l) s.add(l.id); } return s; };

const PROMPTS = { into: ['Parts of', 'Stages of', 'Inputs to'], for: ['Purpose of', 'Who needs', 'Outcome served by'], from: ['What follows', 'Risks that follow', 'Next step after'], reverse: ['What must be true before', 'The goal behind', 'First step toward'] };
// Offline scaffold: question-shaped placeholders, unverified, that the user or Claude fills in.
export function scaffold(a, id, mode, o = {}) {
  const e = a.ents.get(id); if (!e) return []; const made = [], type = (a.pack.types.find(t => t.id === e.type) || a.pack.types[0]).id, short = e.label.length > 34 ? e.label.slice(0, 33) + '…' : e.label;
  for (const p of (PROMPTS[mode] || []).slice(0, o.count || 3)) {
    const label = '? ' + p + ' ' + short; if (A.findByLabel(a, label)) continue; const n = A.addEntity(a, { type, label, parent: mode === 'into' ? id : e.parent, unverified: true, note: MODES.find(m => m.id === mode).blurb + ' (placeholder, fill me in)' }); if (!n) continue;
    if (mode === 'for') A.addLink(a, n.id, id, 'serves'); else if (mode === 'from') A.addLink(a, id, n.id, 'leads to'); else if (mode === 'reverse') A.addLink(a, n.id, id, 'leads to');
    made.push(n);
  }
  return made;
}
const hasClaude = () => typeof window !== 'undefined' && window.claude && typeof window.claude.complete === 'function';
export async function liveScaffold(a, id, mode, o = {}) {
  const e = a.ents.get(id); if (!e || !hasClaude()) return null; const M = MODES.find(m => m.id === mode), types = a.pack.types.map(t => t.id).join(', ');
  try {
    const txt = await window.claude.complete(`Map: "${a.topic}". Idea: "${e.label}"${e.note ? ' (' + e.note + ')' : ''}. Task: map ${mode.toUpperCase()} this idea (${M.blurb}). Return ONLY JSON {"items":[{"label":string<=60,"type":string,"note":string<=120}]} with 3 to 5 items. Types available: ${types}. Be concrete and general; do not invent real people, firms or figures.`);
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)), made = [];
    for (const it of (j.items || []).slice(0, 6)) { if (!it.label || A.findByLabel(a, it.label)) continue; const n = A.addEntity(a, { type: it.type, label: String(it.label).slice(0, 70), note: (String(it.note || '') + ' (AI proposal, unverified)').trim(), parent: mode === 'into' ? id : e.parent, unverified: true }); if (!n) continue;
      if (mode === 'for') A.addLink(a, n.id, id, 'serves'); else if (mode === 'from') A.addLink(a, id, n.id, 'leads to'); else if (mode === 'reverse') A.addLink(a, n.id, id, 'leads to'); made.push(n); }
    return made;
  } catch (x) { return null; }
}
// No route from one idea to another? Add a bridge that asks how they connect.
export function synthesize(a, from, to) {
  const A0 = a.ents.get(from), B0 = a.ents.get(to); if (!A0 || !B0 || from === to) return null; const p = paths(a, from, to); if (p.forward.length) return { existed: true, path: p.forward[0], made: [] };
  const lab = n => n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label, label = '? How ' + lab(A0) + ' leads to ' + lab(B0); if (A.findByLabel(a, label)) return { existed: false, made: [], path: null };
  const n = A.addEntity(a, { type: A0.type, label, parent: A0.parent === B0.parent ? A0.parent : null, unverified: true, note: 'Bridge the map found missing between "' + A0.label + '" and "' + B0.label + '".' }); if (!n) return null;
  const l1 = A.addLink(a, from, n.id, 'leads to'), l2 = A.addLink(a, n.id, to, 'leads to'); return { existed: false, made: [n], links: [l1, l2], path: [from, n.id, to] };
}
// A context for ANY topic: name it, list its kinds of thing and its verbs.
const COLORS = ['#4a5d7a', '#2a7f7f', '#b5651d', '#6b7d2c', '#8a4f7d', '#a23b2a', '#c49a1a', '#3b6e4f', '#5a4a8a', '#7a5a3b'], GLYPHS = ['■', '●', '▲', '◆', '▣', '◈', '▥', '⌂', '✦', '▶'];
export function customPack(name, typeNames, verbNames) {
  const slug = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x', types = [...new Set((typeNames || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 12), verbs = [...new Set((verbNames || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 12);
  if (!types.length) types.push('Thing');
  return { id: 'custom-' + slug(name || 'context'), name: name || 'Custom context', blurb: 'Your own context: ' + types.join(', ') + '.', keywords: [], custom: true, types: types.map((t, i) => ({ id: slug(t), label: t, glyph: GLYPHS[i % GLYPHS.length], color: COLORS[i % COLORS.length], attrs: [] })), relations: verbs.map(v => ({ id: slug(v), label: v, from: [], to: [], directed: true })), sample: null };
}
export function useCustom(a, name, typeNames, verbNames) {
  const p = customPack(name, typeNames, verbNames); a.pack = p; let retyped = 0; for (const e of a.ents.values()) if (!p.types.some(t => t.id === e.type)) { e.type = p.types[0].id; retyped++; } return { pack: p, retyped };
}

// Vocabulary you shape yourself: the kinds of thing and the verbs of THIS map. No preset fields.
const own = a => { if (!a.pack.custom) a.pack = { ...a.pack, id: 'lens-' + Date.now().toString(36), name: 'Your lens', custom: true, types: a.pack.types.map(t => ({ ...t, attrs: [...t.attrs] })), relations: a.pack.relations.map(r => ({ ...r })), sample: null }; return a.pack; };
const slug1 = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const setLens = (a, text) => { a.lens = String(text || '').trim().slice(0, 300); return a.lens; };
export function addKind(a, label) { const l = String(label || '').trim(); if (!l) return null; const p = own(a), id = slug1(l); if (!id || p.types.some(t => t.id === id)) return null; const t = { id, label: l, glyph: GLYPHS[p.types.length % GLYPHS.length], color: COLORS[p.types.length % COLORS.length], attrs: [] }; p.types.push(t); return t; }
export function removeKind(a, id) { const p = own(a); if (p.types.length <= 1) return false; const i = p.types.findIndex(t => t.id === id); if (i < 0) return false; p.types.splice(i, 1); for (const e of a.ents.values()) if (e.type === id) e.type = p.types[0].id; return true; }
export function addVerb(a, label) { const l = String(label || '').trim(); if (!l) return null; const p = own(a); if (p.relations.some(r => r.label.toLowerCase() === l.toLowerCase())) return null; const r = { id: slug1(l), label: l, from: [], to: [], directed: true }; p.relations.push(r); return r; }
export function removeVerb(a, label) { const p = own(a), i = p.relations.findIndex(r => r.label === label); if (i < 0) return false; p.relations.splice(i, 1); return true; }
// Ask Claude for the kinds and verbs that suit what this map is for.
export async function liveLens(a, text) {
  if (typeof window === 'undefined' || !window.claude || !window.claude.complete) return null; const l = String(text || a.lens || a.topic).trim();
  try { const txt = await window.claude.complete('A user is mapping: "' + l + '". Propose the kinds of thing and the verbs that suit this map. Return ONLY JSON {"kinds":[string],"verbs":[string]} with 5 to 9 kinds (single or two words, capitalised) and 6 to 10 verbs (lowercase, active, e.g. "funds", "depends on"). Be specific to the subject, not generic.'); const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); const kinds = (j.kinds || []).map(String).filter(Boolean).slice(0, 9), verbs = (j.verbs || []).map(String).filter(Boolean).slice(0, 10); if (!kinds.length) return null; setLens(a, l); const r = useCustom(a, l.slice(0, 40), kinds, verbs); return { kinds, verbs, retyped: r.retyped }; } catch (x) { return null; }
}
