// Context-aware helpers for Atlas: steer a map toward a field, place a dropped node where it fits, and let nodes ask questions.
import * as A from './atlas-engine.js';

const HINTS = {
  laws: { statute: /\b(act|code|law|statute|bill)\b/i, section: /§|\bsection\b/i, clause: /^\d+\(|\bclause\b/i, agency: /authority|commission|agency|ministry|department|regulator/i, party: /\b(firms?|bodies|citizens?|companies|employers?|parties)\b/i, case: /\bv\.|\bvs\.?\b|\bcase\b/i, holding: /\bholding\b|\bheld\b/i },
  logistics: { warehouse: /warehouse|\bdock\b|cold store|storage/i, site: /\bhub\b|depot|terminal|\bport\b|\byard\b|centre|center/i, vehicle: /truck|\bvan\b|\bship\b|vessel|plane|trailer|fleet|vehicle|lorry/i, route: /\broute\b|\bR\d+\b|\blane\b|corridor/i, shipment: /shipment|consignment|parcel|pallet|\bload\b|cargo|\bS-\d+/i, order: /\border\b|\bPO-?\d+/i, product: /\bsku\b|product|goods|berries|oil\b/i, supplier: /supplier|vendor|manufacturer|factory|coop\b/i, customer: /customer|client|retailer|\bstore\b|mercato|panier/i, carrier: /carrier|haulier|haulage|freight co|courier/i, network: /network|distribution/i },
  recipes: { dish: /\b(stew|salad|soup|pie|curry|bread|cake|pasta|sauce|flatbread)\b/i, step: /^\d+[\s.)]|\b(simmer|bake|stir|chop|knead|boil|fry|mix|rest)\b/i, ingredient: /\b(\d+\s?(g|ml|tsp|tbsp)|flour|onion|salt|pepper|oil|sugar|water|egg|butter|garlic|lentils?|carrot|cumin|stock|yeast)\b/i, technique: /sweat|braise|sear|blanch|ferment/i, tool: /\b(pot|pan|oven|knife|bowl|whisk)\b/i, diet: /vegan|vegetarian|gluten|halal|kosher/i, group: /^(ingredients|method|steps)$/i },
  dna: { sequence: /locus|sequence|plasmid|chromosome/i, gene: /\bgene\b|^[a-z]{3}[A-Z]$/, exon: /\bexon\b/i, intron: /\bintron\b/i, codon: /^[ACGT]{3}$/, motif: /\bbox\b|motif|signal|\bsite\b/i, protein: /protein|enzyme/i, variant: /\bsnp\b|variant|mutation|[ACGT]>[ACGT]/i, regulator: /factor|repressor|activator|regulator/i },
  coins: { coin: /\b(coin|penny|crown|groat|sovereign|dollar|token|florin|thaler)\b/i, mint: /\bmint\b/i, issuer: /\b(king|queen|emperor|republic|kingdom|empire|duke)\b/i, holder: /museum|collector|estate|gallery/i, collection: /collection|hoard|cabinet|\bset\b/i, type: /\btype\b/i },
  homes: { property: /\b\d+\s+\w+\s+(street|st|road|rd|row|lane|ave|avenue|way|close)\b|house|flat|apartment|\bplot\b|cottage|terrace/i, room: /kitchen|bedroom|bathroom|loft|garage|lounge|cellar/i, system: /boiler|roof|wiring|plumbing|heating|window|solar/i, org: /\bbank\b|insur|builder|council|mutual|lender/i, portfolio: /portfolio/i, person: /^[A-Z]\.\s?[A-Z][a-z]+/ },
  companies: { fund: /capital|\bfund\b|partners|ventures/i, unit: /division|\bunit\b|department/i, company: /\b(ltd|inc|corp|group|holdings|plc|llc|gmbh|foods|energy|freight)\b/i, person: /\b(ceo|cfo|cto|chair|director|founder)\b|^[A-Z][a-z]+ [A-Z][a-z]+$/ },
  libraries: { library: /library/i, collection: /collection|papers|archive|special|\bmaps\b/i, item: /manuscript|charter|volume|edition|gazette|\bmap\b|letters?\b|\bbook/i, owner: /council|trust|university|college|ministry|foundation/i, donor: /estate|donor|bequest|family/i, vendor: /digital|\bltd\b|vendor|scanning|publisher/i },
  patents: { patent: /\b(US|EP|WO|JP|CN)[- ]?\d/, claim: /^claim\s*\d+/i, family: /family/i, assignee: /labs|systems|\bltd\b|\binc\b|corp|gmbh|university|institute/i, inventor: /^[A-Z]\.\s?[A-Z]/ },
};
const CONTAIN = {
  laws: { section: ['statute'], clause: ['section'], holding: ['case'] }, recipes: { ingredient: ['group', 'dish'], step: ['group', 'dish'], group: ['dish'] },
  dna: { gene: ['sequence'], motif: ['sequence', 'gene'], exon: ['gene'], intron: ['gene'], codon: ['exon'] }, coins: { coin: ['collection'] },
  homes: { property: ['portfolio'], room: ['property'], system: ['property'] }, companies: { person: ['company', 'unit'], unit: ['company'] },
  libraries: { collection: ['library'], item: ['collection'] }, patents: { patent: ['family'], claim: ['patent'] }, logistics: { warehouse: ['site'], site: ['network'], route: ['network'], vehicle: ['network'] },
};
const tok = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9§]+/).filter(w => w.length > 2));
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size); };
const mentions = (label, other) => { const o = other.toLowerCase().trim(); return o.length >= 4 && new RegExp('(^|[^a-z0-9])' + o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(String(label).toLowerCase()); };

export const containRules = a => CONTAIN[a.pack.id] || {};
export function inferType(a, label, ctx = {}) {
  const H = HINTS[a.pack.id] || {}, L = String(label || '').trim();
  for (const t of a.pack.types) { const m = H[t.id] && L.match(H[t.id]); if (m && m.index === 0) return { type: t.id, why: 'it opens like a ' + t.label.toLowerCase() }; } // an opening cue such as § or Dock wins over a word later in the name
  for (const t of a.pack.types) if (H[t.id] && H[t.id].test(L)) return { type: t.id, why: 'wording matches ' + t.label.toLowerCase() };
  const T = tok(L), votes = new Map();
  for (const e of a.ents.values()) { if (!a.pack.types.some(t => t.id === e.type)) continue; const s = overlap(T, tok(e.label)); if (s > 0.3) votes.set(e.type, (votes.get(e.type) || 0) + s); }
  const best = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]; if (best) return { type: best[0], why: 'similar to existing ' + ((a.pack.types.find(t => t.id === best[0]) || { label: 'thing' }).label.toLowerCase()) };
  const sib = (ctx.focus && a.ents.get(ctx.focus) ? a.ents.get(ctx.focus).kids : a.roots).map(id => a.ents.get(id)).find(x => x && a.pack.types.some(t => t.id === x.type)); if (sib) return { type: sib.type, why: 'same kind as its neighbours' };
  return { type: a.pack.types[0].id, why: 'default type for this field' };
}
// Does this wording belong to another field? Returns that pack when the current field has no match at all.
export function foreignPack(a, label) {
  const L = String(label || '').trim(); if (!L) return null; const H0 = HINTS[a.pack.id] || {};
  if (a.pack.types.some(t => H0[t.id] && H0[t.id].test(L))) return null;
  let best = null; for (const p of A.PACKS) { if (p.id === a.pack.id) continue; const H = HINTS[p.id] || {}; for (const t of p.types) { const m = H[t.id] && L.match(H[t.id]); if (m && (!best || (m.index === 0 && best.idx !== 0))) { best = { pack: p, idx: m.index }; if (m.index === 0) break; } } if (best && best.idx === 0) break; }
  return best && best.pack;
}
export function suggestPlacement(a, label, o = {}) {
  const L = String(label || '').trim(); if (!L) return null;
  const focus = o.focus === undefined ? a.focus : o.focus, near = o.near && a.ents.has(o.near) ? o.near : null, inf = o.type ? { type: o.type, why: 'chosen by you' } : inferType(a, L, { focus }), rules = containRules(a)[inf.type];
  const inFocus = id => !focus || A.chain(a, id).includes(focus), T = tok(L); let parent = null, why = 'placed at this level', score = 0;
  if (rules) {
    const cands = [...a.ents.values()].filter(e => rules.includes(e.type)).map(e => { let s = overlap(T, tok(e.label)) * 1.2 + (mentions(L, e.label) ? 1 : 0) + (inFocus(e.id) ? 0.35 : 0) + (e.id === focus ? 0.3 : 0) + (near && (e.id === near || A.chain(a, near).includes(e.id)) ? 0.8 : 0); return { e, s }; }).sort((x, y) => y.s - x.s);
    if (cands.length && cands[0].s > 0) { parent = cands[0].e.id; score = cands[0].s; why = 'belongs inside ' + cands[0].e.label + ' (a ' + (a.pack.types.find(t => t.id === rules[0]) || { label: 'container' }).label.toLowerCase() + ')'; }
  }
  if (!parent && near && !rules) { const n = a.ents.get(near); if (n && A.canDescend(a, near)) { parent = near; why = 'next to your selection, inside ' + n.label; } }
  if (!parent && focus && !rules) { parent = focus; why = 'placed inside ' + a.ents.get(focus).label; }
  const links = [];
  for (const e of a.ents.values()) {
    if (links.length >= 3) break; if (e.id === parent || !mentions(L, e.label)) continue;
    const out = a.pack.relations.find(r => (!r.from.length || r.from.includes(inf.type)) && (!r.to.length || r.to.includes(e.type))), inn = a.pack.relations.find(r => (!r.from.length || r.from.includes(e.type)) && (!r.to.length || r.to.includes(inf.type)));
    if (out) links.push({ to: e.id, rel: out.label, dir: 'out', label: e.label }); else if (inn) links.push({ to: e.id, rel: inn.label, dir: 'in', label: e.label });
  }
  const confidence = Math.min(1, 0.35 + (rules ? 0.2 : 0) + Math.min(0.3, score * 0.2) + links.length * 0.1 + (o.type ? 0.3 : 0));
  const fp = o.type ? null : foreignPack(a, L);
  return { label: L, type: inf.type, parent, links, confidence: +confidence.toFixed(2), reason: inf.why + '; ' + why, contextHint: fp ? { id: fp.id, name: fp.name } : null };
}
export function drop(a, label, o = {}) {
  const s = suggestPlacement(a, label, o); if (!s) return null; const e = A.addEntity(a, { type: s.type, label: s.label, parent: s.parent }); if (!e) return null;
  if (o.x != null && (s.parent || null) === (a.focus || null)) { e.x = o.x; e.y = o.y; } else if (o.x != null && s.parent) { const p = a.ents.get(s.parent); e.x = (p.x || 0) + (Math.random() - 0.5) * 60; e.y = (p.y || 0) + (Math.random() - 0.5) * 60; }
  const made = []; for (const l of s.links) { const lk = l.dir === 'out' ? A.addLink(a, e.id, l.to, l.rel) : A.addLink(a, l.to, e.id, l.rel); if (lk) made.push(lk); }
  if (o.from && a.ents.has(o.from) && o.from !== e.id) { const R = o.rel || (a.pack.relations[0] || {}).label, lk = A.addLink(a, o.from, e.id, R); if (lk) made.push(lk); }
  A.touch(a, e.id, 1); return { entity: e, suggestion: s, links: made };
}
// Switch the map's context. Entities keep their place; types are re-read through the new field's wording.
export function steer(a, text) {
  const next = A.detectPack(text); if (next.id === a.pack.id || next.id === 'generic') return { changed: false, pack: a.pack, retyped: 0 };
  a.pack = next; let retyped = 0; for (const e of a.ents.values()) if (!next.types.some(t => t.id === e.type)) { e.type = inferType(a, e.label, { focus: e.parent }).type; retyped++; }
  return { changed: true, pack: next, retyped };
}

// ── questions ──
const ask = (a, e, r, dir) => { const need = (dir === 'out' ? r.to : r.from), nt = need.length ? need[0] : a.pack.types[0].id, T = a.pack.types.find(t => t.id === nt); return { id: 'r:' + r.id + ':' + dir, kind: 'rel', rel: r.label, dir, need: nt, needLabel: T ? T.label.toLowerCase() : 'thing', text: dir === 'out' ? `What does ${e.label} ${r.label}?` : `What ${r.label} ${e.label}?` }; };
export function questions(a, id, o = {}) {
  const e = a.ents.get(id); if (!e) return []; const out = [], dis = new Set(e.dismissed || []), C = A.chain(a, id), has = (rel, dir) => a.links.some(l => l.rel === rel && (dir === 'out' ? C.includes(l.a) : C.includes(l.b)));
  for (const g of A.gaps(a).filter(x => x.ent === id)) { const r = a.pack.relations.find(x => x.label === g.rel); if (r) out.push({ ...ask(a, e, r, g.dir), gap: true }); }
  for (const r of a.pack.relations) {
    if (r.from.includes(e.type) && !has(r.label, 'out') && !out.some(q => q.id === 'r:' + r.id + ':out')) out.push(ask(a, e, r, 'out'));
    if (r.to.includes(e.type) && !has(r.label, 'in') && !out.some(q => q.id === 'r:' + r.id + ':in')) out.push(ask(a, e, r, 'in'));
  }
  const T = a.pack.types.find(t => t.id === e.type); for (const k of (T ? T.attrs : [])) if (!String(e.attrs[k] ?? '').trim()) out.push({ id: 'a:' + k, kind: 'attr', key: k, text: `What is the ${k} of ${e.label}?` });
  const inner = Object.entries(containRules(a)).filter(([, ps]) => ps.includes(e.type)).map(([t]) => t); if (inner.length && !e.kids.length) out.push({ id: 'c:' + inner[0], kind: 'child', need: inner[0], needLabel: (a.pack.types.find(t => t.id === inner[0]) || { label: 'part' }).label.toLowerCase(), text: `What is inside ${e.label}?` });
  const uni = [], x = e.label, innerT = inner[0] || e.type, nm = t => (a.pack.types.find(q => q.id === t) || { label: 'thing' }).label.toLowerCase();
  if (!e.kids.length && !out.some(q => q.kind === 'child')) uni.push({ id: 'u:into', kind: 'child', need: innerT, needLabel: nm(innerT), universal: true, text: 'What is ' + x + ' made of?' });
  if (!a.links.some(l => l.a === id && l.rel === 'serves')) uni.push({ id: 'u:for', kind: 'rel', rel: 'serves', dir: 'out', need: e.type, needLabel: nm(e.type), universal: true, text: 'What is ' + x + ' for?' });
  if (!a.links.some(l => l.a === id && l.rel === 'leads to')) uni.push({ id: 'u:from', kind: 'rel', rel: 'leads to', dir: 'out', need: e.type, needLabel: nm(e.type), universal: true, text: 'What comes from ' + x + '?' });
  if (!a.links.some(l => l.b === id && l.rel === 'leads to')) uni.push({ id: 'u:rev', kind: 'rel', rel: 'leads to', dir: 'in', need: e.type, needLabel: nm(e.type), universal: true, text: 'What must come before ' + x + '?' });
  const order = q => (q.gap ? 0 : q.kind === 'attr' ? 2 : q.kind === 'child' ? 1 : 3), lim = o.limit || 8, keep = Math.min(uni.length, lim >= 8 ? 2 : 0), main = out.filter(q => !dis.has(q.id)).sort((p, r) => order(p) - order(r)).slice(0, lim - keep);
  return [...main, ...uni.filter(q => !dis.has(q.id)).slice(0, o.limit && o.limit > 8 ? 4 : Math.max(keep, lim - main.length))].slice(0, Math.max(lim, 1));
}
export function answer(a, id, q, text) {
  const e = a.ents.get(id), v = String(text || '').trim(); if (!e || !v || !q) return null;
  if (q.kind === 'attr') { A.updateEntity(a, id, { attrs: { [q.key]: v } }); return { kind: 'attr', entity: e }; }
  if (q.kind === 'child') { const n = A.addEntity(a, { type: q.need, label: v, parent: id }); if (n) A.touch(a, n.id, 1); return n ? { kind: 'child', entity: n } : null; }
  let other = A.findByLabel(a, v), created = false;
  if (!other) { const s = suggestPlacement(a, v, { type: q.need, focus: e.parent, near: id }); other = A.addEntity(a, { type: q.need, label: v, parent: e.parent && !(containRules(a)[q.need] || []).length ? e.parent : s.parent }); created = true; }
  if (!other) return null; const link = q.dir === 'out' ? A.addLink(a, id, other.id, q.rel) : A.addLink(a, other.id, id, q.rel); A.touch(a, other.id, 1); return { kind: 'rel', entity: other, link, created };
}
export function dismiss(a, id, qid) { const e = a.ents.get(id); if (e) e.dismissed = [...new Set([...(e.dismissed || []), qid])]; }
export function usePack(a, id) { const p = A.PACKS.find(x => x.id === id) || A.GENERIC; if (p.id === a.pack.id) return { changed: false, retyped: 0, pack: p }; a.pack = p; let retyped = 0; for (const e of a.ents.values()) if (!p.types.some(t => t.id === e.type)) { e.type = inferType(a, e.label, { focus: e.parent }).type; retyped++; } return { changed: true, retyped, pack: p }; }

// Auto growth: pick the idea with most left to ask, turn its best open question into a placeholder idea (or a real one with Claude).
const cap1 = t => t ? t[0].toUpperCase() + t.slice(1) : t, sh = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
export async function growStep(a, o = {}) {
  const cap = o.cap || 60, maxDepth = o.maxDepth ?? 3; if (a.ents.size >= cap) return { idle: true, reason: 'Reached ' + cap + ' ideas. Answer some questions or raise the limit.' };
  const cands = [...a.ents.values()].filter(e => !/^\? /.test(e.label) && A.depthOf(a, e.id) <= maxDepth && !(e.unverified && A.depthOf(a, e.id) >= maxDepth)).map(e => ({ e, q: questions(a, e.id, { limit: 20 }).filter(x => x.kind !== 'attr') })).filter(x => x.q.length);
  if (!cands.length) return { idle: true, reason: 'Nothing left to ask. Answer an open question, or turn on Live AI, and auto will keep going.' };
  const pick = cands.map(c => ({ c, s: (a.heat.get(c.e.id) || 0) + 1 / (1 + A.depthOf(a, c.e.id)) + Math.random() * 0.7 - c.e.kids.length * 0.12 + (c.q[0].gap ? 0.6 : 0) })).sort((p, r) => r.s - p.s)[0].c, e = pick.e, q = pick.q[Math.floor(Math.random() * Math.min(3, pick.q.length))];
  const nt = a.pack.types.find(t => t.id === q.need), nl = nt ? nt.label : 'Idea'; let label = '? ' + sh(String(q.text || (nl + ' for ' + e.label)).replace(/\?+\s*$/, ''), 64), note = 'Open question: ' + q.text;
  if (o.live && typeof window !== 'undefined' && window.claude && window.claude.complete) {
    try { const txt = await window.claude.complete('Map: "' + a.topic + '". Idea: "' + e.label + '". Question: ' + q.text + ' Give ONE concrete answer as ILLUSTRATIVE content. Return ONLY JSON {"label": string <= 60 chars, "note": string <= 120 chars}. Do not invent real people or figures.'); const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); if (j.label) { label = String(j.label).slice(0, 70); note = String(j.note || '').slice(0, 160) + ' (AI proposal, unverified)'; } } catch (x) { /* keep the placeholder */ }
  }
  if (A.findByLabel(a, label)) { dismiss(a, e.id, q.id); return { idle: false, skipped: true, entity: e, q }; }
  const parent = q.kind === 'child' ? e.id : (e.parent && !(containRules(a)[q.need] || []).length ? e.parent : null), n = A.addEntity(a, { type: q.need || e.type, label, note, parent, unverified: true }); if (!n) return { idle: false, skipped: true, entity: e, q };
  const link = q.kind === 'child' ? null : (q.dir === 'out' ? A.addLink(a, e.id, n.id, q.rel) : A.addLink(a, n.id, e.id, q.rel)); dismiss(a, e.id, q.id); A.touch(a, e.id, 0.5); A.touch(a, n.id, 1); return { idle: false, entity: n, from: e, link, q };
}
