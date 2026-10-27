// Documents: five live documents drawn from a topic's map (brief, outline, sources, evidence ledger, search log) and written
// notes attached to the topic, the graph, a source, a piece of evidence or a search. Notes and the search log live in
// IndexedDB beside the topic (mega-topics.js).
import * as E from './thought-engine.js';
import * as TOP from './mega-topics.js';

export const SCOPES = [
  { id: 'topic', label: 'Topic', live: 'live:topic', title: 'Brief', blurb: 'What the topic asks, what the map says, what is still open' },
  { id: 'graph', label: 'Graph', live: 'live:graph', title: 'Outline', blurb: 'The map as an outline with cross-links, hubs and bridges' },
  { id: 'source', label: 'Sources', live: 'live:sources', title: 'Source list', blurb: 'Every source the map cites, found or imported' },
  { id: 'evidence', label: 'Evidence', live: 'live:evidence', title: 'Evidence ledger', blurb: 'Claims, what backs them, what challenges them' },
  { id: 'search', label: 'Searches', live: 'live:searches', title: 'Search log', blurb: 'Everything asked of the map and of the world' },
];
const KIND = { map: 'Thought search', ask: 'Ask the map', papers: 'Papers and sources', web: 'Web', chem: 'Chemistry', discovery: 'Discovery round', agent: 'Agent' };
export const kindLabel = k => KIND[k] || k;
const cap = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cell = s => cap(s, 90).replace(/\|/g, '\\|');
const pc = x => Math.round((x || 0) * 100) + '%';
const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b || a + 's');
const kidsOf = g => { const m = new Map(); for (const n of g.nodes) if (n.parent != null) (m.get(n.parent) || m.set(n.parent, []).get(n.parent)).push(n); return m; };

// ── sources ──
export function collectSources(g, searches = []) {
  const cited = new Map();
  for (const n of g.nodes) for (const e of n.evidence || []) { const key = String(e.src || '').trim().toLowerCase(); if (!key) continue; let s = cited.get(key); if (!s) cited.set(key, s = { key, src: String(e.src).trim(), year: e.year || '', url: e.url || '', nodes: [] }); if (!s.url && e.url) s.url = e.url; s.nodes.push(n.id); }
  const cites = [...cited.values()].sort((a, b) => b.nodes.length - a.nodes.length || (a.src < b.src ? -1 : 1)).map((s, i) => ({ ...s, n: i + 1 }));
  const seen = new Set(cites.map(s => s.key)), found = [];
  for (const q of searches) if (q.kind !== 'map' && q.kind !== 'ask') for (const r of q.results || []) { const key = String(r.title || '').trim().toLowerCase(); if (!key || seen.has(key)) continue; seen.add(key); found.push({ key, src: r.title, sub: r.sub || '', url: r.url || '', query: q.query, at: q.at }); }
  const imp = new Map(); for (const n of g.nodes) { const m = /^Import · (.+)$/.exec(n.via || ''); if (m) { let o = imp.get(m[1]); if (!o) imp.set(m[1], o = { name: m[1], count: 0, sample: n.label }); o.count++; } }
  return { cited: cites, found, imports: [...imp.values()].sort((a, b) => b.count - a.count), byKey: new Map(cites.map(s => [s.key, s])) };
}
const cites = (n, S) => (n.evidence || []).map(e => S.byKey.get(String(e.src || '').trim().toLowerCase())).filter(Boolean).slice(0, 3).map(s => '[' + s.n + ']').join('');
const line = (n, S, eff, long = 140) => '- **' + n.label + '**' + (n.detail ? ' — ' + cap(n.detail, long) : '') + ' _(' + pc(eff.get(n.id)) + (n.status ? ', ' + n.status : '') + ')_ ' + cites(n, S);

// ── the five live documents ──
export function brief(g, ctx = {}) {
  const S = ctx.S || collectSources(g, ctx.searches), M = E.metrics(g), eff = E.effectiveGrounding(g), root = g.nodes[0], searches = ctx.searches || [];
  const N = g.nodes.filter(n => !n.root && !n.dormant), by = id => (M.by.get(id) || {}), kids = kidsOf(g);
  const verified = N.filter(n => n.status === 'verified'), refuted = N.filter(n => n.status === 'refuted'), sourced = N.filter(n => (n.evidence || []).length);
  const top = N.slice().sort((a, b) => (by(b.id).pagerank || 0) - (by(a.id).pagerank || 0)).slice(0, 8);
  const size = new Map(); const sz = n => { if (size.has(n.id)) return size.get(n.id); size.set(n.id, 1); let t = 1; for (const k of kids.get(n.id) || []) t += sz(k); size.set(n.id, t); return t; };
  const sections = root ? (kids.get(root.id) || []).map(n => [n, sz(n)]).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
  let tens = [], ven = []; try { tens = E.tensions(g).slice(0, 5); ven = E.venues(g, 4); } catch (e) { /* a very small map has none */ }
  const L = ['# ' + (ctx.name || g.seed), '', '_Brief drafted from the map on ' + when(Date.now()) + ': ' + plural(g.nodes.length, 'thought') + ', ' + plural(g.edges.length, 'link') + ', ' + plural(S.cited.length, 'cited source') + ', ' + plural(searches.length, 'search', 'searches') + '._', '', '## The question', '', g.seed + (root && root.detail ? '\n\n' + cap(root.detail, 400) : '')];
  L.push('', '## Where the map stands', '', plural(sourced.length, 'thought') + ' (' + pc(sourced.length / (N.length || 1)) + ') carry at least one source. ' + verified.length + ' are marked verified and ' + refuted.length + ' refuted. The map falls into ' + plural(M.communities, 'cluster') + (M.sampled ? ' (centrality sampled for speed)' : '') + '.');
  L.push('', '## Main findings', '', ...(top.length ? top.map(n => line(n, S, eff)) : ['Nothing on the map yet.']));
  if (verified.length || refuted.length) L.push('', '## Checked', '', ...verified.slice(0, 6).map(n => '- Verified: **' + n.label + '**' + (n.note ? ' — ' + cap(n.note, 120) : '')), ...refuted.slice(0, 6).map(n => '- Refuted: **' + n.label + '**'));
  if (tens.length) L.push('', '## Where it is contested', '', ...tens.map(t => '- “' + cap((g.byId.get(t.a) || {}).label, 70) + '” against “' + cap((g.byId.get(t.b) || {}).label, 70) + '” — ' + t.why));
  const open = N.filter(n => n.challenge).slice(0, 5); if (ven.length || open.length) L.push('', '## Still open', '', ...ven.map(v => '- ' + cap(v.question, 180)), ...open.map(n => '- ' + cap(n.challenge, 180)));
  if (sections.length) L.push('', '## How it is organised', '', ...sections.map(([n, c]) => '- **' + n.label + '** — ' + plural(c, 'thought')));
  if (searches.length) { const k = {}; for (const q of searches) k[q.kind] = (k[q.kind] || 0) + 1; L.push('', '## How it was investigated', '', Object.entries(k).map(([a, b]) => b + ' ' + kindLabel(a).toLowerCase()).join(', ') + '. Latest: ' + searches.slice(0, 3).map(q => '“' + cap(q.query, 60) + '”').join(', ') + '. See the search log.'); }
  if (S.cited.length) L.push('', '## Sources', '', ...S.cited.slice(0, 12).map(s => s.n + '. ' + s.src + (s.year ? ' (' + s.year + ')' : '') + ' — cited on ' + plural(s.nodes.length, 'thought')), S.cited.length > 12 ? '\n…and ' + (S.cited.length - 12) + ' more in the source list.' : '');
  return L.join('\n');
}
export function outline(g, ctx = {}) {
  const S = ctx.S || collectSources(g, ctx.searches), M = E.metrics(g), eff = E.effectiveGrounding(g), kids = kidsOf(g), root = g.nodes[0], big = g.nodes.length > 160;
  const L = ['# Outline: ' + (ctx.name || g.seed), '', '_' + plural(g.nodes.length, 'thought') + ', ' + plural(g.edges.length, 'link') + ', ' + plural(M.communities, 'cluster') + '. ' + (big ? 'Large map: the outline shows the first three levels and up to 12 thoughts under each; export the JSON for everything.' : 'Every thought is listed.') + '_', '', '## Outline', ''];
  const walk = (n, d) => { L.push('  '.repeat(d) + line(n, S, eff, 90)); const K = kids.get(n.id) || []; if (d >= (big ? 2 : 8)) { if (K.length) L.push('  '.repeat(d + 1) + '- _' + plural(K.length, 'more thought') + ' below_'); return; } const lim = big ? 12 : 60; for (const k of K.slice(0, lim)) walk(k, d + 1); if (K.length > lim) L.push('  '.repeat(d + 1) + '- _…and ' + (K.length - lim) + ' more_'); };
  if (root) walk(root, 0);
  const X = g.edges.filter(e => e.kind !== 'expands').sort((a, b) => (b.weight ?? 0.5) - (a.weight ?? 0.5)).slice(0, big ? 60 : 120);
  if (X.length) { L.push('', '## Cross-links', '', 'The strongest ' + X.length + ' of ' + g.edges.filter(e => e.kind !== 'expands').length + '.', '', '| From | Relation | To | Strength |', '|---|---|---|---|'); for (const e of X) { const a = g.byId.get(e.a), b = g.byId.get(e.b); if (a && b) L.push('| ' + cell(a.label) + ' | ' + cell(e.relation || e.kind) + ' | ' + cell(b.label) + ' | ' + pc(e.weight ?? 0.5) + ' |'); } }
  const nm = id => cap((g.byId.get(id) || {}).label, 60);
  L.push('', '## Hubs and bridges', '', '- Hubs: ' + M.hubs.map(nm).join('; '), '- Bridges between clusters: ' + M.bridges.map(nm).join('; '));
  return L.join('\n');
}
export function sources(g, ctx = {}) {
  const S = ctx.S || collectSources(g, ctx.searches), L = ['# Sources: ' + (ctx.name || g.seed), '', '_' + plural(S.cited.length, 'cited source') + ', ' + S.found.length + ' found but not cited, ' + plural(S.imports.length, 'import') + '._', '', '## Cited', ''];
  if (!S.cited.length) L.push('No thought cites a source yet. Open a thought and use “Find papers, news and online material”, or run the Evidence lab.');
  for (const s of S.cited.slice(0, 80)) { const names = s.nodes.slice(0, 3).map(id => '[[' + cap((g.byId.get(id) || {}).label, 50) + ']]').join(', '); L.push(s.n + '. **' + s.src + '**' + (s.year ? ' (' + s.year + ')' : '') + (s.url ? ' — [' + cap(s.url, 50) + '](' + s.url + ')' : '') + '  \n   Supports ' + names + (s.nodes.length > 3 ? ' and ' + (s.nodes.length - 3) + ' more' : '') + '.'); }
  if (S.cited.length > 80) L.push('', '…and ' + (S.cited.length - 80) + ' more.');
  if (S.found.length) { L.push('', '## Found in searches, not cited yet', ''); for (const f of S.found.slice(0, 40)) L.push('- **' + cap(f.src, 120) + '**' + (f.sub ? ' — ' + cap(f.sub, 80) : '') + (f.url ? ' — [link](' + f.url + ')' : '') + ' _(found by “' + cap(f.query, 50) + '”)_'); }
  if (S.imports.length) { L.push('', '## Imported records', ''); for (const i of S.imports) L.push('- **' + i.name + '** — ' + plural(i.count, 'record') + ', for example “' + cap(i.sample, 60) + '”'); }
  return L.join('\n');
}
export function evidence(g, ctx = {}) {
  const S = ctx.S || collectSources(g, ctx.searches), eff = E.effectiveGrounding(g), N = g.nodes.filter(n => !n.root && !n.dormant);
  const ver = N.filter(n => n.status === 'verified'), ref = N.filter(n => n.status === 'refuted');
  const table = (rows, more) => { const o = ['| Claim | Grounding | Evidence |', '|---|---|---|']; for (const n of rows) o.push('| [[' + cap(n.label, 70) + ']] | ' + pc(eff.get(n.id)) + ' | ' + ((n.evidence || []).length ? (n.evidence || []).slice(0, 2).map(e => cell(e.src) + (e.year ? ' ' + e.year : '')).join('; ') + ' ' + cites(n, S) : 'none') + ' |'); if (more > 0) o.push('', '_…and ' + more + ' more._'); return o; };
  const L = ['# Evidence ledger: ' + (ctx.name || g.seed), '', '_' + ver.length + ' verified, ' + ref.length + ' refuted, ' + N.filter(n => !n.status && (n.evidence || []).length).length + ' sourced but unchecked, ' + N.filter(n => !(n.evidence || []).length).length + ' without a source._'];
  if (ver.length) L.push('', '## Verified', '', ...table(ver.slice(0, 30), ver.length - 30));
  if (ref.length) L.push('', '## Refuted', '', ...table(ref.slice(0, 30), ref.length - 30));
  const chal = g.edges.filter(e => e.kind === 'challenge').slice(0, 25);
  if (chal.length) { L.push('', '## Challenged', '', '| Objection | Against |', '|---|---|'); for (const e of chal) { const a = g.byId.get(e.a), b = g.byId.get(e.b); if (a && b) L.push('| ' + cell(a.label) + ' | [[' + cap(b.label, 70) + ']] |'); } }
  const strong = N.filter(n => !n.status && eff.get(n.id) >= 0.7 && (n.evidence || []).length).sort((a, b) => eff.get(b.id) - eff.get(a.id)); if (strong.length) L.push('', '## Well supported, not yet verified', '', ...table(strong.slice(0, 15), strong.length - 15));
  const thin = N.filter(n => n.plane === 'facts' && !(n.evidence || []).length && eff.get(n.id) < 0.45).sort((a, b) => eff.get(a.id) - eff.get(b.id)); if (thin.length) L.push('', '## Facts that still need a source', '', ...table(thin.slice(0, 15), thin.length - 15));
  if (L.length < 4) L.push('', 'No claims have been checked or sourced yet.');
  return L.join('\n');
}
export function searches(g, ctx = {}) {
  const Q = ctx.searches || [], k = {}; for (const q of Q) k[q.kind] = (k[q.kind] || 0) + 1;
  const L = ['# Search log: ' + (ctx.name || g.seed), '', Q.length ? '_' + plural(Q.length, 'search', 'searches') + ': ' + Object.entries(k).map(([a, b]) => b + ' ' + kindLabel(a).toLowerCase()).join(', ') + '._' : 'Nothing has been searched yet. Searching the map, asking it a question, looking for papers and agent web lookups all land here.'];
  if (Q.length) { L.push('', '| When | Kind | Query | Results |', '|---|---|---|---|'); for (const q of Q.slice(0, 60)) L.push('| ' + when(q.at) + ' | ' + kindLabel(q.kind) + ' | ' + cell(q.query) + ' | ' + q.n + ' |'); L.push('', '## Detail'); for (const q of Q.slice(0, 25)) { L.push('', '### ' + cap(q.query, 100), '', '_' + kindLabel(q.kind) + (q.by ? ' by ' + q.by : '') + ', ' + when(q.at) + ', ' + plural(q.n, 'result') + '._'); if (q.answer) L.push('', '> ' + cap(q.answer, 500)); if (q.note) L.push('', q.note); for (const r of (q.results || []).slice(0, 8)) L.push('- ' + (r.nodeId ? '[[' + cap(r.title, 70) + ']]' : r.url ? '[' + cap(r.title, 90) + '](' + r.url + ')' : cap(r.title, 90)) + (r.sub ? ' — ' + cap(r.sub, 90) : '')); } }
  return L.join('\n');
}
const GEN = { 'live:topic': brief, 'live:graph': outline, 'live:sources': sources, 'live:evidence': evidence, 'live:searches': searches };
const memo = new WeakMap();
export function live(g, id, ctx = {}) {
  let mass = 0; for (const n of g.nodes) mass += (n.status ? 3 : 0) + (n.evidence || []).length + n.g;
  const sig = [g.nodes.length, g.edges.length, mass.toFixed(2), (ctx.searches || []).length, ((ctx.searches || [])[0] || {}).at, ctx.name].join(':');
  let m = memo.get(g); if (!m) memo.set(g, m = {}); if (m[id] && m[id].sig === sig) return m[id].md;
  const f = GEN[id]; if (!f) return ''; if (!ctx.S || ctx.S.sig !== sig) ctx = { ...ctx, S: Object.assign(collectSources(g, ctx.searches), { sig }) };
  const md = f(g, ctx); m[id] = { sig, md }; return md;
}
export function counts(g, ctx = {}) {
  const S = collectSources(g, ctx.searches), N = g.nodes.filter(n => !n.root);
  return { 'live:topic': plural(g.nodes.length, 'thought'), 'live:graph': plural(g.edges.length, 'link'), 'live:sources': S.cited.length + ' cited', 'live:evidence': N.filter(n => n.status).length + ' checked', 'live:searches': String((ctx.searches || []).length) };
}

// ── notes: written documents ──
export const listNotes = async topic => (await TOP.listDocs(topic)).filter(d => d.kind === 'note').sort((a, b) => b.at - a.at);
export async function saveNote(topic, a) {
  const old = a.id ? await TOP.getDoc(a.id) : null, now = Date.now();
  const d = { id: a.id || 'n' + now.toString(36) + Math.random().toString(36).slice(2, 5), topic, kind: 'note', scope: a.scope || (old && old.scope) || 'topic', about: a.about != null ? String(a.about) : (old && old.about) || '', title: cap(a.title || (old && old.title) || 'Untitled note', 120), body: String(a.body != null ? a.body : (old && old.body) || ''), author: a.author || (old && old.author) || 'you', created: (old && old.created) || now, at: now };
  await TOP.putDoc(d); return d;
}
export const getNote = id => TOP.getDoc(id);
export const removeNote = id => TOP.removeDoc(id);
export async function loadLog(topic) { const d = await TOP.getDoc('log:' + topic); return (d && d.items) || []; }
export const saveLog = (topic, items) => TOP.putDoc({ id: 'log:' + topic, topic, kind: 'searchlog', items: items.slice(0, 300), at: Date.now() });

// For agents: plain-text listing and reading.
export function listText(g, ctx, notes) { const c = counts(g, ctx); return [...SCOPES.map(s => s.live + ' | ' + s.title + ' (live, ' + c[s.live] + ') | ' + s.blurb), ...notes.map(n => n.id + ' | ' + n.title + ' (' + n.scope + (n.about ? ', about ' + cap(n.about, 30) : '') + ', by ' + n.author + ', ' + when(n.at) + ')')].join('\n'); }
export function readText(g, ctx, notes, id, off = 0) {
  const note = notes.find(n => n.id === id), md = note ? note.body : live(g, id, ctx); if (!md && !note) throw new Error('no document ' + id);
  const part = md.slice(off, off + 6000); return (note ? 'Note: ' + note.title + '\n\n' : '') + part + (md.length > off + 6000 ? '\n\n[more: call doc_read with offset ' + (off + 6000) + ' of ' + md.length + ']' : '');
}

// ── Markdown to safe HTML ──
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function labelIndex(g) { const m = new Map(); for (const n of g.nodes) { const k = n.label.trim().toLowerCase(); if (!m.has(k)) m.set(k, n.id); } return m; }
export function render(md, ctx = {}) {
  const byLabel = ctx.byLabel || new Map(), toc = [], inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(>])_([^_]+)_(?=[\s).,;:<]|$)/g, '$1<i>$2</i>').replace(/(^|[\s(>])\*([^*\s][^*]*)\*(?=[\s).,;:<]|$)/g, '$1<i>$2</i>')
    .replace(/\[\[([^\]]+)\]\]/g, (m, t) => { const id = byLabel.get(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim().toLowerCase()); return id ? '<a class="wl" data-node="' + esc(id) + '">' + t + '</a>' : '<span class="wl miss">' + t + '</span>'; })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[(\d+(?:, ?\d+)*)\]/g, (m, t) => '<sup class="ct">' + t.split(/, ?/).map(n => '<a data-cite="' + n + '">' + n + '</a>').join(',') + '</sup>');
  const Ls = String(md || '').replace(/\r/g, '').split('\n'), out = []; let i = 0, slug = 0;
  const isRow = l => /^\s*\|.*\|\s*$/.test(l), isSep = l => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
  const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
  while (i < Ls.length) {
    const l = Ls[i], h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { const id = 'h' + (++slug); toc.push({ level: h[1].length, text: h[2].replace(/[_*`]/g, ''), id }); out.push('<h' + h[1].length + ' id="' + id + '">' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
    if (isRow(l) && i + 1 < Ls.length && isSep(Ls[i + 1])) { const head = cells(l); i += 2; const rows = []; while (i < Ls.length && isRow(Ls[i])) rows.push(cells(Ls[i++])); out.push('<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'); continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const stack = []; let html = '';
      while (i < Ls.length && /^\s*([-*]|\d+\.)\s+/.test(Ls[i])) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(Ls[i]), depth = Math.floor(m[1].length / 2), tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length > depth + 1) html += '</li></' + stack.pop() + '>';
        if (stack.length === depth + 1) html += '</li>'; else while (stack.length < depth + 1) { html += '<' + tag + '>'; stack.push(tag); }
        html += '<li>' + inline(m[3]); i++;
        while (i < Ls.length && /^\s{3,}\S/.test(Ls[i]) && !/^\s*([-*]|\d+\.)\s+/.test(Ls[i])) { html += '<br>' + inline(Ls[i].trim()); i++; }
      }
      while (stack.length) html += '</li></' + stack.pop() + '>'; out.push(html); continue;
    }
    if (/^>\s?/.test(l)) { const q = []; while (i < Ls.length && /^>\s?/.test(Ls[i])) q.push(Ls[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const p = []; while (i < Ls.length && Ls[i].trim() && !/^(#{1,4}\s|>\s?|\s*([-*]|\d+\.)\s+|\s*\|.*\|\s*$)/.test(Ls[i])) p.push(Ls[i++].replace(/\s{2,}$/, '')); out.push('<p>' + inline(p.join(' ')) + '</p>');
  }
  return { html: out.join('\n'), toc };
}
export function exportHtml(title, md, ctx = {}) {
  const r = render(md, ctx), css = "body{font:16px/1.65 Georgia,'Times New Roman',serif;color:#1f2030;max-width:760px;margin:40px auto;padding:0 20px}h1,h2,h3,h4{font-family:Inter,system-ui,sans-serif;line-height:1.25}h1{font-size:28px}h2{font-size:20px;border-top:1px solid #ddd;padding-top:10px;margin-top:28px}code{background:#f1f0f6;padding:1px 4px;border-radius:4px}table{border-collapse:collapse;width:100%;font:13px Inter,system-ui,sans-serif}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f4f3f8}blockquote{border-left:3px solid #9f94e6;margin:10px 0;padding:2px 14px;color:#4d5064}a{color:#5a4fc0}.wl{background:#ece9fd;padding:0 4px;border-radius:4px}sup a{text-decoration:none}@media print{body{margin:0}}";
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + css + '</style></head><body><article class="mg-doc">' + r.html + '</article></body></html>';
}
