// Saltline Suite engine — ingestion, RAPTOR tree, knowledge graph, graph retriever (DSPy-style),
// Redis-style cache, Hebbian edge learning, Q-table strategy selection, dossier builder, test harness.
export const hasClaude = () => !!(window.claude && window.claude.complete);
export async function llm(system, user, max = 700) { return await window.claude.complete({ system, messages: [{ role: 'user', content: user }], max_tokens: max }); }
export function fnv(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- persistence + bus (console, suite and tester share this) ---------- */
export const db = {
  get(k, d) { try { const v = localStorage.getItem('saltline.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('saltline.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const BC = 'BroadcastChannel' in window ? new BroadcastChannel('saltline-suite') : null;
export function emit(type, data) { const m = { type, data, t: Date.now() }; try { BC && BC.postMessage(m); } catch (e) {} window.dispatchEvent(new CustomEvent('suite', { detail: m })); }
export function listen(fn) { BC && BC.addEventListener('message', e => fn(e.data)); window.addEventListener('suite', e => fn(e.detail)); }

/* ---------- Redis-style cache (in-browser; same GET/SET/INCR/TTL semantics) ---------- */
export class RedisLite {
  constructor() { this.m = new Map(); this.hits = 0; this.miss = 0; this.ops = 0; }
  get(k) { this.ops++; const e = this.m.get(k); if (!e || (e.x && e.x < Date.now())) { this.m.delete(k); this.miss++; return null; } this.hits++; return e.v; }
  set(k, v, ttl) { this.ops++; this.m.set(k, { v, x: ttl ? Date.now() + ttl * 1000 : 0 }); return 'OK'; }
  incr(k) { const v = (+this.get(k) || 0) + 1; this.set(k, v); return v; }
  stats() { const t = this.hits + this.miss; return { keys: this.m.size, hits: this.hits, miss: this.miss, ops: this.ops, hitRate: t ? this.hits / t : 0 }; }
}

/* ---------- text + vectors ---------- */
const STOP = new Set('a an the and or of to in on for with by at from as is are was were be been this that these those it its into over under per not no we our their they which who will would can may also than then there here such using use used has have had all any each other more most some about within between during after before should must shall'.split(' '));
export const tok = s => (String(s).toLowerCase().match(/[a-z][a-z0-9\-]{1,}/g) || []).filter(w => !STOP.has(w));
function tf(text) { const m = new Map(); for (const w of tok(text)) m.set(w, (m.get(w) || 0) + 1); return m; }
function vec(tfm, idf) { const v = new Map(); let n = 0; for (const [w, c] of tfm) { const x = (1 + Math.log(c)) * (idf.get(w) || idf.__def); v.set(w, x); n += x * x; } n = Math.sqrt(n) || 1; for (const [w, x] of v) v.set(w, x / n); return v; }
function cos(a, b) { if (a.size > b.size) [a, b] = [b, a]; let s = 0; for (const [w, x] of a) { const y = b.get(w); if (y) s += x * y; } return s; }
function idfOf(texts) { const df = new Map(); for (const t of texts) for (const w of new Set(tok(t))) df.set(w, (df.get(w) || 0) + 1); const N = texts.length, idf = new Map(); for (const [w, d] of df) idf.set(w, Math.log((N + 1) / (d + 1)) + 1); idf.__def = Math.log(N + 1) + 1; return idf; }

export function chunk(text, size = 650) {
  const sents = String(text).replace(/\r/g, '').split(/(?<=[.!?])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean);
  const out = []; let cur = '';
  for (const s of sents) { if ((cur + ' ' + s).length > size && cur) { out.push(cur.trim()); const last = cur.split(/(?<=[.!?])\s+/).slice(-1)[0] || ''; cur = last.length < 220 ? last : ''; } cur += ' ' + s; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
export function extractive(text, idf, n = 3) {
  const s = [...new Set(String(text).split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 25))];
  if (s.length <= n) return s.join(' ');
  const sc = s.map((x, i) => { const t = tok(x); let v = 0; for (const w of new Set(t)) v += (idf.get(w) || idf.__def); return [i, v / Math.sqrt(t.length + 1)]; });
  return sc.sort((a, b) => b[1] - a[1]).slice(0, n).map(a => a[0]).sort((a, b) => a - b).map(i => s[i]).join(' ');
}

/* ---------- document extraction (txt, md, csv, json, html, pdf, docx, xlsx) ---------- */
function csvToText(t) {
  const rows = t.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
  if (rows.length < 2) return t;
  const h = rows[0], body = rows.slice(1);
  const stats = h.slice(1).map((k, i) => { const vals = body.map(r => [parseFloat(r[i + 1]), r[0]]).filter(v => !isNaN(v[0])); if (vals.length < 2) return ''; vals.sort((a, b) => b[0] - a[0]); return `Highest ${k.replace(/_/g, ' ')} ${vals[0][0]} (record ${vals[0][1]}), lowest ${vals[vals.length - 1][0]} (record ${vals[vals.length - 1][1]}).`; }).filter(Boolean).join(' ');
  return (stats ? `Column summary: ${stats}\n\n` : '') + body.map(r => `Record ${r[0]}: ` + h.slice(1).map((k, i) => `${k.replace(/_/g, ' ')} ${r[i + 1] ?? ''}`).join(', ') + '.').join('\n\n');
}
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export async function extractFile(file) {
  const name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'pdf') {
      const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; let out = '';
      for (let p = 1; p <= pdf.numPages; p++) { const c = await (await pdf.getPage(p)).getTextContent(); out += c.items.map(i => i.str).join(' ') + '\n\n'; }
      return { name, kind: 'PDF', text: out, pages: pdf.numPages };
    }
    if (ext === 'docx' || ext === 'xlsx') {
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
      const z = await JSZip.loadAsync(await file.arrayBuffer());
      if (ext === 'docx') { const xml = await z.file('word/document.xml').async('string'); return { name, kind: 'Word', text: decodeXml(xml.replace(/<\/w:p>/g, '\n\n').replace(/<[^>]+>/g, '')) }; }
      const ss = z.file('xl/sharedStrings.xml') ? await z.file('xl/sharedStrings.xml').async('string') : '';
      const strs = [...ss.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => decodeXml(m[1]));
      return { name, kind: 'Excel', text: strs.join('. ') + '.' };
    }
    let t = await file.text();
    if (ext === 'csv') return { name, kind: 'CSV', text: csvToText(t) };
    if (ext === 'json') { try { t = JSON.stringify(JSON.parse(t), null, 1).replace(/[{}\[\]",]/g, ' '); } catch (e) {} return { name, kind: 'JSON', text: t }; }
    if (ext === 'html' || ext === 'htm') return { name, kind: 'HTML', text: t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ') };
    return { name, kind: ext.toUpperCase() || 'Text', text: t };
  } catch (e) { return { name, kind: ext.toUpperCase(), text: '', error: e.message }; }
}
export const docFromText = (name, text) => ({ name, kind: (name.split('.').pop() || 'txt').toUpperCase(), text: name.endsWith('.csv') ? csvToText(text) : text });

/* ---------- knowledge graph ---------- */
export class Graph {
  constructor() { this.N = new Map(); this.A = new Map(); this.idf = new Map(); this.idf.__def = 1; this.uid = Math.random().toString(36).slice(2, 10); }
  add(n) { if (!this.N.has(n.id)) { this.N.set(n.id, n); this.A.set(n.id, new Map()); } return this.N.get(n.id); }
  link(a, b, type, w = 0.5) {
    if (a === b || !this.N.has(a) || !this.N.has(b)) return null;
    const e = this.A.get(a).get(b); if (e) { e.w = Math.min(1, e.w + w * 0.25); e.n++; return e; }
    const o = { type, w, n: 1 }; this.A.get(a).set(b, o); this.A.get(b).set(a, o); return o;
  }
  edges() { const out = []; for (const [a, m] of this.A) for (const [b, e] of m) if (a < b) out.push({ a, b, type: e.type, w: e.w }); return out; }
  hops(id, k) { const seen = new Map([[id, 0]]); let fr = [id]; for (let d = 1; d <= k; d++) { const nx = []; for (const u of fr) for (const v of (this.A.get(u) || new Map()).keys()) if (!seen.has(v)) { seen.set(v, d); nx.push(v); } fr = nx; } return seen; }
}
export const LEX = {
  species: ['salicornia', 'atriplex', 'suaeda', 'mangrove', 'avicennia', 'seagrass', 'flamingo', 'plover', 'sandpiper', 'heron', 'tern', 'dugong', 'turtle', 'halophyte', 'spartina', 'tamarix', 'shorebird'],
  habitat: ['mudflat', 'intertidal', 'wetland', 'sabkha', 'estuary', 'saltmarsh', 'dune', 'reef', 'lagoon', 'floodplain', 'aquifer', 'groundwater'],
  pressure: ['brine', 'salinity', 'tds', 'nitrate', 'turbidity', 'hydrocarbon', 'metals', 'dust', 'noise', 'effluent', 'discharge', 'dredging'],
  regulatory: ['permit', 'licence', 'license', 'esia', 'eia', 'consent', 'baseline', 'compliance', 'authority', 'ministry', 'agency', 'condition'],
  method: ['drone', 'satellite', 'sentinel', 'ndvi', 'sampling', 'transect', 'quadrat', 'piezometer', 'survey'],
  social: ['community', 'fishers', 'stakeholder', 'employment', 'heritage', 'herders'],
};
const LEXRE = Object.entries(LEX).flatMap(([cat, ts]) => ts.map(t => [t, cat, new RegExp('\\b' + t, 'i')]));

/* ---------- ingestion: chunk → graph → entities → RAPTOR tree ---------- */
function centroid(ns) { const c = new Map(); for (const n of ns) for (const [w, x] of n.vec) c.set(w, (c.get(w) || 0) + x / ns.length); let s = 0; for (const x of c.values()) s += x * x; s = Math.sqrt(s) || 1; for (const [w, x] of c) c.set(w, x / s); return c; }
function kmeans(ns, k) {
  if (k <= 1) return [ns];
  let C = Array.from({ length: k }, (_, i) => ns[Math.floor(i * ns.length / k)].vec), A = [];
  for (let it = 0; it < 6; it++) { A = Array.from({ length: C.length }, () => []); for (const n of ns) { let bi = 0, bv = -1; C.forEach((c, i) => { const v = cos(n.vec, c); if (v > bv) { bv = v; bi = i; } }); A[bi].push(n); } A = A.filter(a => a.length); C = A.map(centroid); }
  return A;
}
export async function llmSummarize(text, cache) {
  const k = 'sum:' + fnv(text); const c = cache && cache.get(k); if (c) return c;
  const out = await llm('You write node summaries for a RAPTOR retrieval tree over a client\'s environmental project documents. 3-4 sentences. Keep every number, unit, species, place and organisation exactly as written. No preamble.', text.slice(0, 6000), 260);
  cache && cache.set(k, out.trim(), 3600); return out.trim();
}
export async function ingest(docs, { summarize, onProgress, cache } = {}) {
  const g = new Graph(), errors = [], chunkIds = [];
  for (const d of docs) {
    const t = String(d.text || '').trim();
    if (!t) { errors.push({ doc: d.name, error: d.error || 'empty document' }); continue; }
    const letters = (t.match(/[a-z]/gi) || []).length / t.length;
    if (letters < 0.45) { errors.push({ doc: d.name, error: 'unreadable / non-text content' }); continue; }
    g.add({ id: 'd:' + d.name, type: 'doc', label: d.name, kind: d.kind });
    chunk(t).forEach((c, i, arr) => { const id = 'c:' + d.name + ':' + i; g.add({ id, type: 'chunk', label: d.name + ' ¶' + (i + 1), text: c, doc: d.name, level: 0 }); g.link('d:' + d.name, id, 'contains', 0.6); if (i) g.link('c:' + d.name + ':' + (i - 1), id, 'next', 0.3); chunkIds.push(id); });
    onProgress && onProgress({ stage: 'chunk', doc: d.name, chunks: chunkIds.length });
  }
  g.idf = idfOf(chunkIds.map(id => g.N.get(id).text));
  for (const id of chunkIds) { const n = g.N.get(id); n.vec = vec(tf(n.text), g.idf); }
  for (const id of chunkIds) {
    const n = g.N.get(id), ents = [];
    for (const [t, cat, re] of LEXRE) if (re.test(n.text)) { g.add({ id: 'e:' + t, type: 'entity', label: t, cat }); g.link(id, 'e:' + t, 'mentions', 0.4); ents.push('e:' + t); }
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) g.link(ents[i], ents[j], 'co', 0.15);
  }
  onProgress && onProgress({ stage: 'entities', entities: [...g.N.values()].filter(n => n.type === 'entity').length });
  let layer = chunkIds.map(id => g.N.get(id)), L = 0, root = null;
  while (layer.length && (layer.length > 1 || L === 0) && L < 4) {
    const groups = layer.length <= 4 ? [layer] : kmeans(layer, Math.ceil(layer.length / 4));
    L++; const next = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi], text = grp.map(n => n.text).join(' ');
      let sum; try { sum = summarize ? await summarize(text, L) : extractive(text, g.idf, 2 + L); } catch (e) { sum = extractive(text, g.idf, 2 + L); }
      const node = g.add({ id: `s:L${L}:${gi}`, type: 'summary', level: L, label: `RAPTOR L${L} · ${gi + 1}`, text: sum, size: grp.length });
      node.vec = vec(tf(sum), g.idf);
      grp.forEach(ch => g.link(ch.id, node.id, 'summarizes', 0.7));
      next.push(node);
      onProgress && onProgress({ stage: 'raptor', level: L, done: gi + 1, total: groups.length });
    }
    layer = next;
  }
  if (layer.length === 1) { root = layer[0]; root.root = true; root.label = 'RAPTOR root'; }
  const entities = [...g.N.values()].filter(n => n.type === 'entity');
  return { g, chunks: chunkIds.length, levels: L, entities: entities.length, entityList: entities.map(e => e.label), errors, root, docs: docs.length - errors.length };
}

/* ---------- Hebbian learning on co-retrieved nodes ---------- */
export function hebb(g, ids, eta = 0.15) {
  const out = [];
  for (const e of g.edges()) if (e.type === 'hebb') { const o = g.A.get(e.a).get(e.b); o.w *= 0.995; }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]; let e = g.A.get(a) && g.A.get(a).get(b);
    if (!e) e = g.link(a, b, 'hebb', 0.05); else { e.w = e.w + eta * (1 - e.w); e.n++; }
    if (e) out.push([a, b, e.w]);
  }
  return out;
}

/* ---------- Q-table: per-section retrieval strategy (shared, persisted) ---------- */
export const ACTIONS = ['hop1', 'hop2', 'hop3', 'raptor', 'hybrid'];
export class QTable {
  constructor(saved) { this.Q = (saved && saved.Q) || {}; this.n = (saved && saved.n) || 0; this.alpha = 0.3; this.eps = (saved && saved.eps) || 0.25; }
  row(s) { return this.Q[s] || (this.Q[s] = Object.fromEntries(ACTIONS.map(a => [a, 0.5]))); }
  choose(s) { const r = this.row(s); if (Math.random() < this.eps) return ACTIONS[Math.random() * ACTIONS.length | 0]; return Object.entries(r).sort((a, b) => b[1] - a[1])[0][0]; }
  best(s) { return Object.entries(this.row(s)).sort((a, b) => b[1] - a[1])[0]; }
  update(s, a, rew) { const r = this.row(s); r[a] += this.alpha * (rew - r[a]); this.n++; return r[a]; }
  save() { db.set('q', { Q: this.Q, n: this.n, eps: this.eps }); }
}

/* ---------- retriever: a DSPy-style Retrieve module whose backend IS the graph ---------- */
export class GraphRetriever {
  constructor(g, cache) { this.g = g; this.cache = cache; }
  forward(query, { k = 6, strategy = 'hybrid' } = {}) {
    const key = `ret:${this.g.uid}:${strategy}:${k}:${fnv(query)}:${this.g.N.size}`;
    const hit = this.cache && this.cache.get(key); if (hit) return { ...hit, cached: true };
    const qv = vec(tf(query), this.g.idf);
    const text = [...this.g.N.values()].filter(n => n.vec);
    const scored = text.map(n => [n, cos(qv, n.vec)]).sort((a, b) => b[1] - a[1]);
    const cand = new Map(); const add = (n, s, via) => { const c = cand.get(n.id); if (!c || c.s < s) cand.set(n.id, { n, s, via }); };
    if (strategy === 'raptor') {
      scored.filter(([n]) => n.type === 'summary').slice(0, 3).forEach(([n, s]) => {
        add(n, s * 1.05, 'raptor L' + n.level);
        for (const [v, e] of this.g.A.get(n.id)) if (e.type === 'summarizes') { const c = this.g.N.get(v); if (c.vec && c.level < n.level) add(c, cos(qv, c.vec) + 0.03, 'raptor child'); }
      });
      scored.filter(([n]) => n.type === 'chunk').slice(0, 2).forEach(([n, s]) => add(n, s, 'seed'));
    } else {
      const depth = strategy === 'hop1' ? 1 : strategy === 'hop3' ? 3 : 2;
      if (strategy === 'hybrid') scored.filter(([n]) => n.type === 'summary').slice(0, 2).forEach(([n, s]) => add(n, s, 'raptor L' + n.level));
      for (const [sn, ss] of scored.filter(([n]) => n.type === 'chunk').slice(0, 3)) {
        add(sn, ss, 'seed');
        for (const [id, d] of this.g.hops(sn.id, depth)) { if (!d) continue; const n = this.g.N.get(id); if (!n.vec) continue; add(n, cos(qv, n.vec) * (1 - 0.1 * d), d + '-hop'); }
      }
    }
    const passages = [...cand.values()].sort((a, b) => b.s - a.s).slice(0, k).map(c => ({ id: c.n.id, text: c.n.text, score: +c.s.toFixed(3), via: c.via, type: c.n.type, level: c.n.level, doc: c.n.doc }));
    const res = { passages, trace: { strategy, candidates: cand.size, k } };
    this.cache && this.cache.set(key, res, 600);
    return { ...res, cached: false };
  }
}
export const entitiesOf = (g, ids) => [...new Set(ids.flatMap(id => [...(g.A.get(id) || new Map()).keys()].filter(v => g.N.get(v).type === 'entity').map(v => g.N.get(v).label)))];

/* ---------- suite catalog ---------- */
export const SECTIONS = {
  summary: { t: 'Executive summary', q: 'project overview purpose scale location', need: ['project', 'location', 'scale'] },
  project: { t: 'Project description', q: 'activities components phases footprint area water workforce', need: ['phase', 'area', 'water'] },
  setting: { t: 'Site & regulatory setting', q: 'site location authority permit consent requirements', need: ['permit', 'authority', 'site'] },
  baseline: { t: 'Baseline environment', q: 'baseline soil hydrology habitat species survey conditions', need: ['baseline', 'soil', 'habitat'] },
  water: { t: 'Water, salinity & discharges', q: 'water quality salinity brine discharge groundwater tds samples', need: ['salinity', 'water', 'brine'] },
  bio: { t: 'Biodiversity & habitats', q: 'species birds habitat colony vegetation cover ecology', need: ['species', 'habitat'] },
  social: { t: 'Community & stakeholders', q: 'community fishers stakeholder employment access meeting concerns', need: ['community', 'stakeholder'] },
  impacts: { t: 'Impact significance', q: 'impact significance magnitude sensitivity risk effects', need: ['impact', 'significance'] },
  mitigation: { t: 'Mitigation & management', q: 'mitigation measures management plan controls', need: ['mitigation', 'plan'] },
  monitoring: { t: 'Monitoring plan', q: 'monitoring plan frequency sampling drone satellite parameters', need: ['monitoring', 'frequency'] },
  gaps: { t: 'Evidence gaps & next steps', q: 'gap missing confirm survey required', need: [] },
};
export const PRODUCTS = [
  { id: 'dossier', icon: 'ph-books', name: 'Pre-submission Environmental Dossier', short: 'The complete file you take to a regulator or a major environmental consultancy: baseline, impacts, mitigation, monitoring and evidence gaps, every claim cited to your own documents.', for: 'Projects heading into a permit, ESIA or consultancy scoping meeting', sections: ['summary', 'project', 'setting', 'baseline', 'water', 'bio', 'social', 'impacts', 'mitigation', 'monitoring', 'gaps'] },
  { id: 'baseline', icon: 'ph-map-trifold', name: 'Baseline Evidence Pack', short: 'Organises what you already know about the site into a cited baseline and lists what still needs surveying.', for: 'Early-stage sites with scattered survey data', sections: ['summary', 'setting', 'baseline', 'water', 'bio', 'gaps'] },
  { id: 'permit', icon: 'ph-seal-check', name: 'Permit Readiness Check', short: 'Reads your project file against what a permit submission typically asks for and flags the gaps before the meeting.', for: 'Teams with a regulator meeting on the calendar', sections: ['summary', 'setting', 'project', 'impacts', 'mitigation', 'gaps'] },
  { id: 'bio', icon: 'ph-bird', name: 'Biodiversity Screening', short: 'Species and habitat screening from survey notes and site data, with significance and mitigation.', for: 'Sites near wetlands, coasts or protected species', sections: ['summary', 'baseline', 'bio', 'impacts', 'mitigation', 'monitoring', 'gaps'] },
  { id: 'monitor', icon: 'ph-chart-line-up', name: 'Monitoring & MRV Plan', short: 'Parameters, methods, frequency and responsibilities for water, habitat and vegetation monitoring.', for: 'Operating projects and carbon / restoration MRV', sections: ['summary', 'project', 'water', 'bio', 'monitoring', 'gaps'] },
];
export const INTAKE = [
  ['org', 'Organisation', 1], ['contact', 'Contact name & email', 0], ['project', 'Project name', 1], ['location', 'Site location', 1],
  ['authority', 'Regulator / consultancy you are meeting', 0], ['activity', 'What will happen on site', 1, 'area'], ['scale', 'Scale & duration', 1],
  ['sensitivities', 'Known sensitivities', 0, 'area'], ['meeting', 'Meeting date', 0], ['notes', 'Anything else', 0, 'area'],
];
export const validateIntake = i => INTAKE.filter(f => f[2] && !String(i[f[0]] || '').trim()).map(f => f[1]);
export const ROUTES = [['#/', 'Home'], ['#/products', 'Products'], ['#/onboarding', 'Onboarding'], ['#/intake', 'Intake'], ['#/dossier', 'Dossier'], ['#/sitemap', 'Sitemap']];
export const SITE_PAGES = [['Command Center.html', 'Console'], ['Dossier.html', 'Dossier Suite'], ['Onboarding.html', 'AI onboarding'], ['Tester.html', 'Tester agent'], ['Field Tools.html', 'Field tools'], ['Impact Assessment.html', 'ESIA workspace']];
export async function checkHrefs(cache) {
  const c = cache && cache.get('hrefs'); if (c) return c;
  const res = await Promise.all(SITE_PAGES.map(async ([href, label]) => { try { const r = await fetch(encodeURI(href), { cache: 'no-store' }); return { href, label, ok: r.ok, status: r.status }; } catch (e) { return { href, label, ok: false, status: 'ERR' }; } }));
  cache && cache.set('hrefs', res, 900); return res;
}

/* ---------- dossier builder ---------- */
const DSYS = 'You are a senior environmental consultant preparing a pre-submission dossier that a client will take to a regulator or a major environmental consultancy. Use ONLY the numbered sources (excerpts of the client\'s own documents and RAPTOR summaries). Cite every factual claim with [S#]. Never invent figures, species, statutes, dates or names. Where evidence is missing write [GAP: what is needed]. Use "##" for sub-headings and "-" for bullets. 170-300 words. Do not repeat the section title.';
function evidenceDraft(S, passages, missing) {
  const lines = passages.filter(p => p.type === 'chunk' || p.type === 'summary').slice(0, 5).map((p, i) => `- ${p.text.replace(/\s+/g, ' ').slice(0, 240).trim()}${p.text.length > 240 ? '…' : ''} [S${passages.indexOf(p) + 1}]`);
  return `## Evidence retrieved\n${lines.join('\n')}` + (missing.length ? `\n\n[GAP: no evidence found for ${missing.join(', ')}]` : '');
}
export async function buildDossier({ intake, product, ing, retriever, qt, llmSections = 0, onSection, signal, extraGaps = [], withHazards = false }) {
  const P = PRODUCTS.find(p => p.id === product) || PRODUCTS[0], out = []; let calls = 0;
  const hazardSection = async () => { if (!withHazards || out.some(s => s.id === 'hazards')) return null; const snap = db.get('hz.snapshot', null); if (!snap || Date.now() - snap.t > 30 * 864e5) return null; try { const HZ = await import('./suite-hazards.js'), flagged = snap.sites.filter(x => x.band === 'High' || x.band === 'Elevated'); const hz = { id: 'hazards', title: 'Natural hazard and context screening', strategy: '—', reward: 1, coverage: 1, missing: flagged.map(x => `${x.name}: ${x.band.toLowerCase()} exposure (${x.score}/100), commission a site-specific hazard assessment`), passages: [], cached: false, body: HZ.snapshotMarkdown(snap), mode: 'evidence', citations: 0, validCitations: 0 }; out.push(hz); onSection && onSection(hz); return hz; } catch (e) { return null; } };
  for (let si = 0; si < P.sections.length; si++) {
    if (signal && signal.stop) break;
    const sid = P.sections[si], S = SECTIONS[sid];
    if (sid === 'gaps') await hazardSection();
    if (sid === 'gaps') {
      const all = [...new Set(out.flatMap(s => s.missing.map(m => `${s.title}: ${m}`)))].concat(extraGaps);
      let body = all.length ? '## Gaps to close before the meeting\n' + all.map(g => `- [GAP: ${g}]`).join('\n') : 'No evidence gaps detected against this product\'s checklist.';
      let mode = 'evidence';
      if (si < llmSections && hasClaude() && all.length) { try { calls++; body = await llm('You turn an evidence-gap list into a short, prioritised next-steps plan for a client preparing an environmental submission. Markdown with "##" and "-". Keep each gap as [GAP: …]. 120-220 words. Do not invent requirements.', `Project: ${intake.project}\nGaps:\n${all.join('\n')}`, 500); mode = 'llm'; } catch (e) {} }
      const sec = { id: sid, title: S.t, strategy: '—', reward: 1, coverage: 1, missing: [], passages: [], cached: false, body, mode, citations: 0, validCitations: 0 };
      out.push(sec); onSection && onSection(sec); continue;
    }
    const a = qt.choose(sid);
    const query = S.q + ' ' + (intake.activity || '') + ' ' + (intake.sensitivities || '');
    const r = retriever.forward(query, { k: 6, strategy: a });
    const ctx = r.passages.map(p => p.text).join(' ').toLowerCase();
    const cov = S.need.length ? S.need.filter(w => ctx.includes(w)).length / S.need.length : 1;
    const div = new Set(r.passages.map(p => p.doc || p.id)).size / Math.max(1, r.passages.length);
    const reward = 0.75 * cov + 0.25 * div; qt.update(sid, a, reward);
    hebb(ing.g, r.passages.map(p => p.id));
    const missing = S.need.filter(w => !ctx.includes(w));
    let body, mode = 'evidence';
    if (si < llmSections && hasClaude()) {
      try {
        calls++;
        body = await llm(DSYS, `Client: ${intake.org}\nProject: ${intake.project}\nLocation: ${intake.location}\nActivity: ${intake.activity}\nScale: ${intake.scale}\n\nSection: ${S.t}\nFocus: ${S.q}\nNo source evidence found for: ${missing.join(', ') || 'none'}\n\nSOURCES\n` + r.passages.map((p, i) => `[S${i + 1}] (${p.doc || 'RAPTOR L' + p.level}) ${p.text.slice(0, 700)}`).join('\n'), 800);
        mode = 'llm';
      } catch (e) { body = evidenceDraft(S, r.passages, missing); }
    } else body = evidenceDraft(S, r.passages, missing);
    const cites = [...body.matchAll(/\[S(\d+)\]/g)].map(m => +m[1]);
    const sec = { id: sid, title: S.t, strategy: a, reward, coverage: cov, missing, passages: r.passages, cached: !!r.cached, body, mode, citations: cites.length, validCitations: cites.filter(c => c >= 1 && c <= r.passages.length).length };
    out.push(sec); onSection && onSection(sec);
  }
  if (!(signal && signal.stop)) await hazardSection();
  out.llmCalls = calls;
  return out;
}
export function mdToHtml(t) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[S(\d+)\]/g, '<sup class="cite" data-s="$1">S$1</sup>').replace(/\[GAP:\s*([^\]]+)\]/g, '<span class="gap">Gap · $1</span>');
  let html = '', ul = false;
  for (let ln of String(t).split(/\r?\n/)) {
    ln = ln.trim();
    if (/^#{1,6}\s/.test(ln)) { if (ul) { html += '</ul>'; ul = false; } html += '<h4>' + inline(ln.replace(/^#+\s*/, '')) + '</h4>'; continue; }
    if (/^[-*•]\s+/.test(ln)) { if (!ul) { html += '<ul>'; ul = true; } html += '<li>' + inline(ln.replace(/^[-*•]\s+/, '')) + '</li>'; continue; }
    if (/^\d+[.)]\s+/.test(ln)) { if (!ul) { html += '<ul>'; ul = true; } html += '<li>' + inline(ln.replace(/^\d+[.)]\s+/, '')) + '</li>'; continue; }
    if (!ln) { if (ul) { html += '</ul>'; ul = false; } continue; }
    if (ul) { html += '</ul>'; ul = false; }
    html += '<p>' + inline(ln) + '</p>';
  }
  return html + (ul ? '</ul>' : '');
}

/* ---------- test fixtures: realistic client packs with planted facts + injected faults ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SECT = [['Desalination brine reuse', 'reuse of desalination reject brine for halophyte irrigation'], ['Coastal aquaculture', 'shrimp and finfish pond expansion'], ['Solar farm', 'utility-scale photovoltaic array with panel washing'], ['Lithium brine extraction', 'brine pumping and evaporation ponds'], ['Port expansion', 'berth dredging and land reclamation'], ['Saline agriculture', 'halophyte cultivation on salt-affected land'], ['Wetland restoration', 'tidal reconnection and saltmarsh replanting'], ['Industrial effluent upgrade', 'effluent treatment upgrade and new outfall'], ['Mine tailings rehabilitation', 'tailings capping and revegetation'], ['Coastal resort', 'low-rise coastal resort development']];
const REG = [['Jubail, Eastern Province', 'Saudi Arabia', 'national environmental compliance centre', 'sabkha', 'intertidal mudflat', 'flamingo'], ['Cádiz Bay, Andalusia', 'Spain', 'regional environment ministry', 'saltmarsh', 'estuary', 'sandpiper'], ['Rann of Kutch, Gujarat', 'India', 'state pollution control board', 'sabkha', 'wetland', 'flamingo'], ['Salton Sea, California', 'United States', 'state water resources board', 'lagoon', 'wetland', 'plover'], ['Kafr El Sheikh, Nile Delta', 'Egypt', 'national environmental affairs agency', 'lagoon', 'floodplain', 'heron'], ['Wheatbelt, Western Australia', 'Australia', 'state environmental protection authority', 'saltmarsh', 'floodplain', 'plover'], ['Salar de Atacama', 'Chile', 'environmental assessment service', 'lagoon', 'wetland', 'flamingo'], ['Ca Mau, Mekong Delta', 'Vietnam', 'provincial natural resources department', 'mangrove', 'intertidal mudflat', 'tern']];
export function makeCase(i) {
  const r = rng(i * 7919 + 13), pick = a => a[Math.floor(r() * a.length)], num = (a, b, d = 0) => +(a + r() * (b - a)).toFixed(d);
  const [sector, activity] = SECT[i % SECT.length], [place, country, authority, hab1, hab2, bird] = REG[(i * 3 + (i / 10 | 0)) % REG.length];
  const product = PRODUCTS[i % PRODUCTS.length].id, ha = num(12, 420), months = pick([12, 18, 24, 36]), workers = num(20, 260);
  const peak = num(48, 79, 1), colony = num(60, 900), cover = num(8, 46), km = num(1.5, 14, 1), wt = num(0.6, 4.5, 1);
  const org = pick(['Gulf Coast Agri Co.', 'Meridian Water Partners', 'Saltmarsh Renewables', 'Delta Blue Aquaculture', 'Andes Minerals', 'Coastline Developments', 'Harbour Infrastructure Group', 'Arid Lands Cooperative']);
  const project = `${place.split(',')[0]} ${sector.toLowerCase()} project`;
  const faults = []; const f = i % 10;
  if (f === 3) faults.push('empty-doc'); if (f === 4) faults.push('no-permit-letter'); if (f === 6) faults.push('missing-field'); if (f === 7) faults.push('long-doc'); if (f === 9) faults.push('garbage');
  const docs = [];
  docs.push(docFromText('site_description.md', `# Site description — ${project}\n\nThe project site lies at ${place}, ${country}. The proposed activity is ${activity}. The project scale is approximately ${ha} ha over a ${months}-month programme delivered in three phases: mobilisation, operation and handover. The site area includes ${hab1} and ${hab2} habitat with scattered halophyte cover.\n\nSoil at the site is saline sandy loam with surface salt crusting in low areas. Water for operations would be drawn from ${sector.includes('Desal') ? 'the desalination plant reject brine line' : 'a licensed groundwater abstraction'}. The nearest community lies about ${km} km away, where fishers and herders use the shoreline. The workforce will peak at ${workers} staff.`));
  const rows = ['sample_id,location,salinity_g_l,tds_mg_l,nitrate_mg_l,date'];
  const peakRow = 1 + Math.floor(r() * 5);
  for (let k = 1; k <= 6; k++) { const s = k === peakRow ? peak : num(22, 46, 1); rows.push(`W${k},${pick(['inlet', 'pond edge', 'outfall', 'borehole', 'creek'])},${s},${Math.round(s * 1000 + num(100, 900))},${num(0.4, 9.8, 1)},2026-0${1 + (k % 8)}-1${k}`); }
  docs.push(docFromText('water_quality.csv', rows.join('\n')));
  let survey = `Baseline ecological survey for ${project}. Transect and quadrat sampling recorded ${pick(['Salicornia', 'Atriplex', 'Suaeda'])}, ${pick(['Tamarix', 'Spartina', 'Avicennia mangrove'])} and seagrass along the shore. A breeding colony of ${colony} ${bird}s was observed on the ${hab2}, within 600 m of the proposed footprint. Halophyte vegetation cover averaged ${cover}% across quadrats. Drone survey flights mapped vegetation using NDVI from multispectral imagery, cross-checked against Sentinel satellite scenes. Groundwater piezometers show the water table at ${wt} m depth with brackish quality and rising salinity toward the coast.`;
  if (faults.includes('long-doc')) survey = Array.from({ length: 14 }, (_, k) => survey.replace('Baseline ecological survey', `Survey visit ${k + 1} of the baseline ecological survey`)).join('\n\n');
  docs.push(docFromText('survey_notes.txt', survey));
  if (!faults.includes('no-permit-letter')) docs.push(docFromText('regulator_letter.txt', `To ${org}. Re: ${project}. The ${authority} confirms that the project requires an environmental impact assessment and an operating permit before construction starts. The submission must include a baseline survey, an assessment of impact significance against receptor sensitivity, mitigation measures within an environmental management plan, a monitoring plan stating sampling frequency, and evidence of stakeholder engagement with the local community. Any discharge of brine or effluent to the marine environment will be subject to permit conditions.`));
  if (i % 2 === 0) docs.push(docFromText('stakeholder_minutes.md', `# Community meeting minutes\n\nRepresentatives of the fishing community and local herders attended. Stakeholders raised concerns about fish catch near the outfall, shoreline access during construction, and dust. Participants asked for local employment commitments and a grievance mechanism. The proponent agreed to share the monitoring plan and to meet again before submission.`));
  if (faults.includes('empty-doc')) docs.push(docFromText('field_notes_scan.txt', ''));
  if (faults.includes('garbage')) docs.push(docFromText('export.bin.txt', Array.from({ length: 900 }, () => String.fromCharCode(33 + Math.floor(r() * 30))).join('')));
  const intake = { org, contact: 'Project lead · lead@' + org.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) + '.example', project, location: faults.includes('missing-field') ? '' : `${place}, ${country}`, authority, activity, scale: `${ha} ha · ${months} months`, sensitivities: `${hab2} habitat, ${bird} colony, groundwater salinity, nearby community`, meeting: '', notes: '' };
  const probes = [{ q: 'highest salinity water sample measured', a: String(peak) }, { q: `breeding colony ${bird} near footprint`, a: `${colony} ${bird}` }];
  return { id: 'T' + String(i + 1).padStart(3, '0'), seed: i, name: `${sector} · ${place.split(',')[0]}`, sector, region: country, product, faults, docs, intake, probes };
}

/* ---------- one end-to-end test run ---------- */
export async function runCase(c, { qt, cache, llmSections = 0, useLLMSummaries = false, onStep } = {}) {
  const t0 = performance.now(), A = [], as = (name, ok, detail) => A.push({ name, ok: !!ok, detail: String(detail ?? '') });
  let llmCalls = 0, ing = null, secs = [], recall = 0;
  const step = s => onStep && onStep(s);
  const miss = validateIntake(c.intake);
  as('Intake validation', c.faults.includes('missing-field') ? miss.length > 0 : miss.length === 0, miss.length ? 'flagged: ' + miss.join(', ') : 'complete');
  step('ingest');
  try {
    ing = await ingest(c.docs, { cache, summarize: useLLMSummaries && hasClaude() ? async t => { llmCalls++; return llmSummarize(t, cache); } : null });
    as('Ingestion completes', true, `${ing.docs} docs · ${ing.chunks} chunks`);
  } catch (e) { as('Ingestion completes', false, e.message); return finish(); }
  as('Chunks produced', ing.chunks > 0, ing.chunks + ' chunks');
  if (c.faults.includes('empty-doc') || c.faults.includes('garbage')) as('Bad documents rejected gracefully', ing.errors.length > 0, ing.errors.map(e => e.doc + ': ' + e.error).join('; '));
  as('RAPTOR tree built', ing.root && (ing.levels >= 2 || ing.chunks < 5), `${ing.levels} levels · root ${ing.root ? 'ok' : 'missing'}`);
  as('Entities extracted', ing.entities >= 4, ing.entities + ' entities');
  step('retrieve');
  const ret = new GraphRetriever(ing.g, cache); let hits = 0;
  for (const p of c.probes) { const r = ret.forward(p.q, { k: 6, strategy: 'hybrid' }); if (r.passages.some(x => x.text.includes(p.a))) hits++; }
  recall = hits / c.probes.length;
  as('Graph retriever recalls planted facts', recall >= 0.5, Math.round(recall * 100) + '% (' + hits + '/' + c.probes.length + ')');
  const again = ret.forward(c.probes[0].q, { k: 6, strategy: 'hybrid' });
  as('Redis cache serves repeat query', again.cached, again.cached ? 'HIT' : 'MISS');
  step('dossier');
  const extraGaps = miss.map(m => 'intake: ' + m).concat(ing.errors.map(e => 'document ' + e.doc + ' — ' + e.error));
  secs = await buildDossier({ intake: c.intake, product: c.product, ing, retriever: ret, qt, llmSections, extraGaps });
  llmCalls += secs.llmCalls || 0;
  const P = PRODUCTS.find(p => p.id === c.product);
  as('Dossier has every section', secs.length === P.sections.length, `${secs.length}/${P.sections.length}`);
  const scored = secs.filter(s => s.id !== 'gaps'), cov = scored.reduce((a, s) => a + s.coverage, 0) / Math.max(1, scored.length);
  as('Evidence coverage ≥ 60%', cov >= 0.6, Math.round(cov * 100) + '%');
  as('Citations resolve to sources', secs.every(s => s.validCitations === s.citations), secs.reduce((a, s) => a + s.citations, 0) + ' citations');
  const gapSec = secs.find(s => s.id === 'gaps');
  const expectGaps = c.faults.some(f => ['no-permit-letter', 'missing-field', 'empty-doc', 'garbage'].includes(f));
  as('Gaps reported to client', expectGaps ? /GAP/.test(gapSec ? gapSec.body : '') : true, expectGaps ? 'gap list present' : 'n/a');
  const hrefs = await checkHrefs(cache);
  as('Sitemap hrefs resolve', hrefs.every(h => h.ok), hrefs.filter(h => h.ok).length + '/' + hrefs.length);
  return finish();
  function finish() {
    const coact = []; const ents = [];
    if (ing) for (const s of secs) { const e = entitiesOf(ing.g, s.passages.map(p => p.id)).slice(0, 8); ents.push(...e); for (let a = 0; a < e.length; a++) for (let b = a + 1; b < e.length; b++) coact.push([e[a], e[b]]); }
    const ecount = {}; ents.forEach(e => ecount[e] = (ecount[e] || 0) + 1);
    const scoredSecs = secs.filter(s => s.id !== 'gaps');
    return {
      id: c.id, name: c.name, product: c.product, sector: c.sector, region: c.region, faults: c.faults, llm: llmSections > 0, t: Date.now(),
      asserts: A, pass: A.every(a => a.ok), ms: Math.round(performance.now() - t0),
      metrics: ing ? { chunks: ing.chunks, levels: ing.levels, entities: ing.entities, nodes: ing.g.N.size, edges: ing.g.edges().length, recall, coverage: scoredSecs.reduce((a, s) => a + s.coverage, 0) / Math.max(1, scoredSecs.length), llmCalls } : { llmCalls },
      sections: secs.map(s => ({ id: s.id, title: s.title, strategy: s.strategy, reward: +(+s.reward).toFixed(3), coverage: s.coverage, missing: s.missing, mode: s.mode, body: llmSections > 0 ? s.body : undefined })),
      entities: Object.entries(ecount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]), coact: coact.slice(0, 60),
    };
  }
}


/* ---------- suite version + codebase manifest: graph / agent / codebase / data / tools, one substrate ---------- */
export const SUITE = { name: 'Saltline Suite', version: '1.4.0', build: '2026-10-23', stack: ['Console', 'Observatory', 'Agency', 'Onboarding', 'Dossier', 'Field Tools', 'Tester', 'ESIA', 'Market'] };
export const CODE_MODULES = [
  { id: 'suite-core.js', role: 'Engine', fns: ['chunk', 'ingest', 'Graph', 'GraphRetriever', 'RedisLite', 'QTable', 'hebb', 'buildDossier', 'makeCase', 'runCase', 'mdToHtml', 'validateIntake', 'docFromText'] },
  { id: 'suite-theme.js', role: 'Theme', fns: ['applyTheme'] },
  { id: 'suite-hazards.js', role: 'Engine', fns: ['eventJobs', 'parseUSGS', 'parseGDACS', 'parseEONET', 'parseWHO', 'dedupe', 'exposure', 'droughtNow', 'floodSignal', 'parseConflictHTML', 'conflictsByCountry', 'canon'] },
  { id: 'Observatory.dc.html', role: 'App', fns: ['hazardMap', 'siteExposure', 'feedHealth'] },
  { id: 'Market.dc.html', role: 'App', fns: ['landscape'] },
  { id: 'suite-launcher.js', role: 'Launcher', fns: ['palette', 'search'] },
  { id: 'Onboarding.html', role: 'App', fns: ['interview', 'extract', 'recommend'] },
  { id: 'Dossier.html', role: 'App', fns: ['ingestUI', 'buildDossier', 'advisor'] },
  { id: 'Tester.html', role: 'App', fns: ['runCase', 'selfTests', 'connectome'] },
  { id: 'Command Center.html', role: 'App', fns: ['liveFeeds', 'worldMap'] },
  { id: 'Field Tools.html', role: 'App', fns: ['calculators', 'liveData', 'aiTools'] },
  { id: 'Impact Assessment.html', role: 'App', fns: ['draftESIA'] },
];
export const DATA_FIXTURES = ['site_description.md', 'water_quality.csv', 'survey_notes.txt', 'regulator_letter.txt', 'stakeholder_minutes.md'];

/* Real assertions executed against the live engine — the tester testing this codebase. */
export async function selfTests(cache) {
  const RL = cache || new RedisLite(), out = [];
  const T = async (name, module, fn, body) => { const t0 = performance.now(); try { const d = await body(); out.push({ name, module, fn, ok: true, detail: String(d ?? 'ok'), ms: +(performance.now() - t0).toFixed(1) }); } catch (e) { out.push({ name, module, fn, ok: false, detail: e.message || String(e), ms: +(performance.now() - t0).toFixed(1) }); } };
  const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const longText = Array.from({ length: 18 }, (_, i) => `Sentence ${i + 1} describes salinity and habitat conditions at the coastal site in detail.`).join(' ');
  await T('chunk() splits long text', 'suite-core.js', 'chunk', () => { const c = chunk(longText, 300); assert(c.length > 1, 'expected >1 chunk'); return c.length + ' chunks'; });
  await T('chunk() keeps content', 'suite-core.js', 'chunk', () => { assert(chunk(longText, 300).join(' ').includes('Sentence 1'), 'lost content'); return 'content preserved'; });
  await T('chunk() handles empty input', 'suite-core.js', 'chunk', () => { assert(chunk('').length === 0, 'empty should yield 0'); return '0 chunks'; });
  await T('RedisLite GET / SET / miss', 'suite-core.js', 'RedisLite', () => { const r = new RedisLite(); r.set('k', 'v'); assert(r.get('k') === 'v', 'roundtrip'); assert(r.get('nope') === null, 'miss null'); return 'ok'; });
  await T('RedisLite INCR', 'suite-core.js', 'RedisLite', () => { const r = new RedisLite(); r.incr('n'); assert(r.incr('n') === 2, 'incr'); return 'incr to 2'; });
  await T('QTable learns toward reward', 'suite-core.js', 'QTable', () => { const q = new QTable(); for (let i = 0; i < 20; i++) q.update('s', 'hop2', 1); assert(q.best('s')[0] === 'hop2', 'best wrong'); assert(q.row('s').hop2 > 0.8, 'not converged'); return 'best=hop2 @ ' + q.row('s').hop2.toFixed(2); });
  await T('QTable choose returns a valid action', 'suite-core.js', 'QTable', () => { const q = new QTable(); assert(ACTIONS.includes(q.choose('s')), 'invalid action'); return 'valid'; });
  await T('Graph hops expand by depth', 'suite-core.js', 'Graph', () => { const g = new Graph(); ['a', 'b', 'c', 'd'].forEach(id => g.add({ id, type: 'x' })); g.link('a', 'b', 'e'); g.link('b', 'c', 'e'); g.link('c', 'd', 'e'); assert(g.hops('a', 1).size === 2, '1-hop'); assert(g.hops('a', 2).size === 3, '2-hop'); return '1 hop to 2, 2 hop to 3'; });
  await T('hebb() strengthens co-activation', 'suite-core.js', 'hebb', () => { const g = new Graph(); ['a', 'b'].forEach(id => g.add({ id, type: 'x' })); hebb(g, ['a', 'b']); const w1 = g.A.get('a').get('b').w; hebb(g, ['a', 'b']); const w2 = g.A.get('a').get('b').w; assert(w2 > w1, 'should grow'); return w1.toFixed(2) + ' to ' + w2.toFixed(2); });
  await T('docFromText() parses CSV to records', 'suite-core.js', 'docFromText', () => { const d = docFromText('w.csv', 'id,salinity\n1,54\n2,61'); assert(/Record/.test(d.text), 'no records'); return 'records built'; });
  await T('validateIntake() flags required fields', 'suite-core.js', 'validateIntake', () => { assert(validateIntake({}).includes('Organisation'), 'should flag org'); assert(validateIntake({ org: 'x', project: 'p', location: 'l', activity: 'a', scale: 's' }).length === 0, 'complete should pass'); return 'flags + passes'; });
  await T('mdToHtml() renders headings, bullets, cites, gaps', 'suite-core.js', 'mdToHtml', () => { const h = mdToHtml('## Head\n- one\nText [S1] and [GAP: data]'); assert(/<h4>/.test(h) && /<ul>/.test(h) && /cite/.test(h) && /gap/.test(h), 'missing structure'); return 'h4 / ul / cite / gap'; });
  await T('makeCase() is deterministic + injects faults', 'suite-core.js', 'makeCase', () => { assert(makeCase(4).intake.org === makeCase(4).intake.org, 'nondeterministic'); assert(makeCase(4).faults.includes('no-permit-letter'), 'fault not injected'); return 'stable + fault seeded'; });
  await T('ingest() builds chunks, entities + RAPTOR', 'suite-core.js', 'ingest', async () => { const ing = await ingest([docFromText('a.txt', 'Salicornia and Atriplex grow on the intertidal mudflat near a flamingo colony. '.repeat(6)), docFromText('b.txt', 'Groundwater salinity rises toward the coast; brine discharge is monitored by drone and satellite. '.repeat(6))], { cache: RL }); assert(ing.chunks > 0, 'no chunks'); assert(ing.entities >= 3, 'few entities'); assert(ing.levels >= 1, 'no raptor'); return `${ing.chunks} chunks · ${ing.entities} entities · ${ing.levels} levels`; });
  await T('GraphRetriever recalls a planted fact + caches', 'suite-core.js', 'GraphRetriever', async () => { const ing = await ingest([docFromText('s.txt', 'A breeding colony of 240 flamingos was recorded on the mudflat within 600 m of the footprint. Salinity peaked at 61 g per litre at the outfall. '.repeat(3))], { cache: RL }); const ret = new GraphRetriever(ing.g, RL); const r = ret.forward('flamingo colony near footprint', { k: 6, strategy: 'hybrid' }); assert(r.passages.some(p => /flamingo/i.test(p.text)), 'no recall'); assert(ret.forward('flamingo colony near footprint', { k: 6, strategy: 'hybrid' }).cached, 'cache miss'); return 'recall + cache HIT'; });
  await T('buildDossier() inserts the hazard screening before gaps', 'suite-core.js', 'buildDossier', async () => {
    const prev = db.get('hz.snapshot', null);
    db.set('hz.snapshot', { t: Date.now(), version: SUITE.version, sites: [{ name: 'Test site', lat: 1, lon: 2, score: 64, band: 'High', drivers: [{ why: 'test driver' }] }], sources: [] });
    try {
      const ing = await ingest([docFromText('h.txt', 'Saltmarsh habitat with migratory birds near the intake; groundwater salinity is monitored monthly. '.repeat(5))], { cache: RL });
      const secs = await buildDossier({ intake: { org: 'T', project: 'P', location: 'L', activity: 'a', scale: 's' }, product: PRODUCTS[0].id, ing, retriever: new GraphRetriever(ing.g, RL), qt: new QTable(), withHazards: true });
      const hi = secs.findIndex(s => s.id === 'hazards'), gi = secs.findIndex(s => s.id === 'gaps');
      assert(hi >= 0, 'no hazard section'); assert(gi < 0 || hi < gi, 'hazards should precede gaps'); assert(gi < 0 || /Test site/.test(secs[gi].body), 'flagged site missing from gaps');
      return `section ${hi + 1} of ${secs.length}, flagged site carried into gaps`;
    } finally { if (prev) db.set('hz.snapshot', prev); else { try { localStorage.removeItem('saltline.hz.snapshot'); } catch (e) {} } }
  });
  const passed = out.filter(o => o.ok).length;
  return { t: Date.now(), items: out, total: out.length, passed, pass: passed === out.length, version: SUITE.version };
}
