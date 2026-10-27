import * as A from './suite-agent.js';
import * as AI from './suite-ai.js';

// One budget for every agent in every container: the host allows about 15 model calls a minute in total.
const LIMIT = 13; let stamps = [], chain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function slot() { const t = Date.now(); stamps = stamps.filter(x => t - x < 60000); if (stamps.length >= LIMIT) { await sleep(60000 - (t - stamps[0]) + 60); return slot(); } stamps.push(Date.now()); }

const SEED = { '/README.md': 'Mega Graph workspace. /work holds files you and the agents make. /patterns holds saved structures. Project files are readable under /project (read-only).\n', '/work/notes.md': '# Notes\n', '/patterns/.keep': '' };
// A container: its own map, agents, brain, files, chat, log and approvals. Nothing it does touches this browser's storage.
function fresh(init) { return { host: null, subs: new Set(), logs: [], chat: [], approvals: [], busy: null, stop: false, shell: [], vfs: init.vfs ? JSON.parse(JSON.stringify(init.vfs)) : Object.fromEntries(Object.entries(SEED).map(([k, v]) => [k, { c: v, t: Date.now() }])), agents: [], mcps: [], conns: {}, custom: [], policy: { graph: 'auto', brain: 'auto', net: 'auto', files: 'ask', terminal: 'ask', mcp: 'ask', agents: 'ask', ...(init.policy || {}) }, disabled: [], ledger: { haiku: 0, sonnet: 0, tools: 0 }, brain: { nodes: [], edges: [] }, tick: 0, sessions: [], container: true }; }

function makeKit(init) {
// Mega Graph agent kit: shared store, tool registry (MCP style), virtual files, terminal, patterns,
// agent brain graph and the agent loop. The UI docks (Mega Dock, Mega Console) only read and call this.

const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota: keep working in memory */ } };
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const clip = (s, n = 1500) => { s = typeof s === 'string' ? s : JSON.stringify(s); return s.length > n ? s.slice(0, n) + '… [' + (s.length - n) + ' more chars]' : s; };

const MODELS = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-5' };
const POLICY_KEYS = [['graph', 'Graph edits'], ['brain', 'Brain and patterns'], ['net', 'Web and literature reads'], ['files', 'Project files'], ['terminal', 'Terminal and code'], ['mcp', 'External MCP servers'], ['agents', 'Creating tools and agents']];

const DEFAULT_AGENTS = [
  { id: 'scout', name: 'Scout', model: 'haiku', color: '#7fcfb6', maxSteps: 8, packs: ['graph', 'web', 'lit', 'chem', 'brain', 'patterns', 'docs'], directive: 'You find things out. Search the web and literature, read what you find, and add what is worth keeping to the map as thoughts, each linked to what it supports or contradicts. Put the source in the thought detail. Stop when you have 5 to 8 solid additions.' },
  { id: 'builder', name: 'Builder', model: 'haiku', color: '#7fb2e5', maxSteps: 10, packs: ['graph', 'files', 'patterns', 'terminal', 'brain', 'docs'], directive: 'You build and organise. Restructure the map, write notes and files under /work, reuse saved patterns before inventing structure, and save new patterns that worked. Make small, checkable changes.' },
  { id: 'critic', name: 'Critic', model: 'sonnet', color: '#e8956f', maxSteps: 6, packs: ['graph', 'web', 'lit', 'brain', 'docs'], directive: 'You test the map. Find the weakest claims and the places where thoughts contradict each other, check them against sources, and add challenge thoughts linked with relation "contradicts" or "assumes". Say plainly what does not hold.' },
  { id: 'planner', name: 'Planner', model: 'sonnet', color: '#c79be0', maxSteps: 8, packs: ['graph', 'brain', 'patterns', 'agents'], directive: 'You set direction. Read the whole map and the brain, say in one sentence what the next round should settle, write a plan into the brain, then delegate pieces to Scout, Builder or Critic.' },
];
const SEED_FILES = { '/README.md': 'Mega Graph workspace. /work holds files you and the agents make. /patterns holds saved structures. Project files are readable under /project (read-only).\n', '/work/notes.md': '# Notes\n', '/patterns/.keep': '' };

const S = init ? fresh(init) : {
  host: null, subs: new Set(), logs: [], chat: [], approvals: [], busy: null, stop: false, shell: [],
  vfs: LS('mega-vfs') || { ...Object.fromEntries(Object.entries(SEED_FILES).map(([k, v]) => [k, { c: v, t: Date.now() }])) },
  agents: LS('mega-agents') || DEFAULT_AGENTS, mcps: LS('mega-mcps') || [], conns: {}, custom: LS('mega-custom') || [],
  policy: LS('mega-policy') || { graph: 'auto', brain: 'auto', net: 'auto', files: 'ask', terminal: 'ask', mcp: 'ask', agents: 'ask' },
  disabled: LS('mega-disabled') || [], ledger: { haiku: 0, sonnet: 0, tools: 0 },
  brain: LS('mega-brain') || { nodes: [], edges: [] }, tick: 0,
  sessions: LS('mega-sessions') || [],
};
// Chat and the log survive a reload, so a session can be inspected and continued later.
if (!init) { S.chat = LS('mega-chat') || []; S.logs = LS('mega-log') || []; }
const on = fn => { S.subs.add(fn); return () => S.subs.delete(fn); };
const emit = () => { S.tick++; for (const f of S.subs) try { f(); } catch (e) { /* a dead view must not stop the rest */ } };
const persist = init ? () => {} : (what) => { if (!what || what.includes('vfs')) save('mega-vfs', S.vfs); if (!what || what.includes('agents')) save('mega-agents', S.agents); if (!what || what.includes('mcps')) save('mega-mcps', S.mcps.map(({ tools, ...m }) => m)); if (!what || what.includes('custom')) save('mega-custom', S.custom); if (!what || what.includes('policy')) { save('mega-policy', S.policy); save('mega-disabled', S.disabled); } if (!what || what.includes('brain')) save('mega-brain', S.brain); if (!what || what.includes('chat')) { save('mega-chat', S.chat.slice(-120)); save('mega-log', S.logs.slice(-200)); } if (!what || what.includes('sessions')) save('mega-sessions', S.sessions); };
let chatT = null; const persistChat = () => { if (chatT) return; chatT = setTimeout(() => { chatT = null; persist(['chat']); }, 900); };
const save_ = persist;

function log(k, text, who) { S.logs.push({ i: S.logs.length + 1, t: now(), k, who: who || '', text: clip(text, 600) }); if (S.logs.length > 400) S.logs.shift(); persistChat(); emit(); }
const say = (who, text, extra) => { S.chat.push({ id: uid('m'), who, text, t: now(), ...(extra || {}) }); if (S.chat.length > 200) S.chat.shift(); persistChat(); emit(); };
const attach = host => { S.host = host; log('sys', 'Workspace ready'); };

// ── virtual files ──
const norm = p => { p = String(p || '/').trim().replace(/\\/g, '/'); if (!p.startsWith('/')) p = '/work/' + p; const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return '/' + out.join('/'); };
const fs = {
  norm,
  list(dir = '/') { dir = norm(dir); const pre = dir === '/' ? '/' : dir + '/', seen = new Map(); for (const [p, f] of Object.entries(S.vfs)) if (p.startsWith(pre)) { const rest = p.slice(pre.length), i = rest.indexOf('/'); if (i < 0) { if (rest !== '.keep') seen.set(rest, { name: rest, dir: false, size: f.c.length, t: f.t }); } else seen.set(rest.slice(0, i), { name: rest.slice(0, i), dir: true, size: 0 }); } if (dir === '/') seen.set('project', { name: 'project', dir: true, size: 0 }); return [...seen.values()].sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)); },
  async read(p) { p = norm(p); if (p.startsWith('/project/')) { const r = await fetch(p.slice(9)); if (!r.ok) throw new Error('no such project file: ' + p.slice(9)); return await r.text(); } if (!S.vfs[p]) throw new Error('no such file: ' + p); return S.vfs[p].c; },
  write(p, c) { p = norm(p); if (p.startsWith('/project')) throw new Error('/project is read-only from the browser. Write under /work.'); S.vfs[p] = { c: String(c), t: Date.now() }; persist(['vfs']); emit(); return p; },
  rm(p) { p = norm(p); if (p.startsWith('/project')) throw new Error('/project is read-only'); const pre = p + '/'; let n = 0; for (const k of Object.keys(S.vfs)) if (k === p || k.startsWith(pre)) { delete S.vfs[k]; n++; } if (!n) throw new Error('no such path: ' + p); persist(['vfs']); emit(); return n; },
  mv(a, b) { a = norm(a); b = norm(b); let n = 0; for (const k of Object.keys(S.vfs)) if (k === a || k.startsWith(a + '/')) { S.vfs[b + k.slice(a.length)] = S.vfs[k]; delete S.vfs[k]; n++; } if (!n) throw new Error('no such path: ' + a); persist(['vfs']); emit(); return n; },
  grep(q, dir = '/') { const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), out = []; for (const [p, f] of Object.entries(S.vfs)) if (p.startsWith(norm(dir)) && p !== '/patterns/.keep') f.c.split('\n').forEach((l, i) => { if (re.test(l)) out.push(p + ':' + (i + 1) + ': ' + l.slice(0, 160)); }); return out.slice(0, 40); },
  all() { return Object.keys(S.vfs).filter(p => !p.endsWith('/.keep')).sort(); },
};

// ── brain: the agents' own graph, linked to user thoughts by id ──
const brain = {
  wipe() { S.brain = { nodes: [], edges: [] }; },
  add(kind, label, o = {}) { const B = S.brain; let n = o.reuse ? B.nodes.find(x => x.kind === kind && x.label === label) : null; if (n) { n.uses = (n.uses || 0) + 1; n.t = Date.now(); } else { n = { id: uid('b'), kind, label: String(label).slice(0, 90), detail: String(o.detail || '').slice(0, 600), t: Date.now(), uses: 1, refs: o.refs || [], agent: o.agent || '' }; B.nodes.push(n); if (B.nodes.length > 300) { const drop = B.nodes.filter(x => x.kind !== 'goal').sort((a, b) => (a.uses + a.t / 1e13) - (b.uses + b.t / 1e13))[0]; if (drop) brain.remove(drop.id); } } if (o.link) brain.link(o.link, n.id, o.rel || 'used'); persist(['brain']); emit(); return n; },
  link(a, b, rel = 'used', w) { if (a === b) return; const B = S.brain; let e = B.edges.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); if (!e) { e = { a, b, rel, w: w ?? 0.3 }; B.edges.push(e); } else e.w = Math.min(1, e.w + 0.2 * (1 - e.w)); return e; }, // Hebbian: links used together get stronger
  remove(id) { const B = S.brain; B.nodes = B.nodes.filter(n => n.id !== id); B.edges = B.edges.filter(e => e.a !== id && e.b !== id); persist(['brain']); emit(); },
  decay() { const B = S.brain; for (const e of B.edges) e.w = Math.max(0.05, e.w * 0.985); },
  recall(q, k = 6) { const T = new Set(String(q).toLowerCase().split(/\W+/).filter(w => w.length > 2)); return S.brain.nodes.map(n => { const W = (n.label + ' ' + n.detail).toLowerCase().split(/\W+/); let h = 0; for (const w of W) if (T.has(w)) h++; return { n, s: h / Math.sqrt(W.length + 1) + Math.min(0.3, (n.uses || 0) * 0.03) }; }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.n); },
  clear() { S.brain = { nodes: [], edges: [] }; persist(['brain']); emit(); },
};

// ── helpers over the user's graph ──
const H = () => { if (!S.host || !S.host.g()) throw new Error('no map is open'); return S.host; };
const nodeLine = n => n.id + ' | ' + n.label + ' | ' + (n.plane || '') + (n.dormant ? ' | dormant' : '');
const nodeOf = (h, id) => { const n = h.g().byId.get(id); if (!n) throw new Error('no thought with id ' + id + '. Use node_search to find ids.'); return n; };
const J = async url => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + new URL(url).host); return r.json(); };
const q_ = s => encodeURIComponent(String(s));

// ── tools ──
const fmtRun = r => { if (typeof r === 'string') return r; if (!r) return '(no output)'; const lines = [...(r.out || [])]; if (r.result != null) lines.push('→ ' + JSON.stringify(r.result)); if (!r.ok) throw new Error((r.error || 'code failed') + (lines.length ? '\n' + lines.join('\n') : '')); return lines.join('\n') || '(no output)'; };
const TOOLS = [];
const T = (name, pack, pol, desc, args, run) => TOOLS.push({ name, pack, pol, desc, args, run });
const PACKS = { graph: ['Graph', 'Read, add, change and link thoughts on the open map'], web: ['Web', 'Wikipedia, Wikidata, Crossref and any URL'], lit: ['Literature', 'PubMed, Europe PMC and the built-in paper index'], chem: ['Chemistry', 'PubChem, UniProt, RDKit analogs and grading'], files: ['Files', 'Create, read, edit, move and delete workspace files'], terminal: ['Terminal', 'Shell commands and sandboxed JavaScript'], patterns: ['Patterns', 'Save and reuse map structures'], brain: ['Brain', 'The agents\' own memory, plans and skills'], agents: ['Agents', 'Delegate work, make tools, call external MCP servers'], docs: ['Documents', 'Read the topic brief, outline, sources, evidence and search log; write notes'] };

T('graph_overview', 'graph', 'graph', 'Counts, planes, hubs and the selected thought', {}, async () => { const h = H(), g = h.g(), deg = new Map(); for (const e of g.edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); } const hubs = g.nodes.filter(n => !n.dormant).sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0)).slice(0, 6); return 'seed: ' + g.seed + '\nthoughts: ' + g.nodes.length + ', links: ' + g.edges.length + '\nselected: ' + (h.sel() || 'none') + '\nhubs:\n' + hubs.map(n => nodeLine(n) + ' | links ' + (deg.get(n.id) || 0)).join('\n'); });
// Label matches first (exact, then prefix, then contains), then meaning. Meaning alone drops short tokens, so "Chapter 12" would find every chapter.
T('node_search', 'graph', 'graph', 'Find thoughts by label or meaning', { query: 'text', k: 'how many, default 8' }, async a => { const h = H(), g = h.g(), q = String(a.query || '').trim(), ql = q.toLowerCase(), k = Math.min(30, +a.k || 8), seen = new Set(), out = [], add = (n, s) => { if (!n || seen.has(n.id) || out.length >= k) return; seen.add(n.id); out.push(nodeLine(n) + ' | ' + s + (n.detail ? ' | ' + String(n.detail).slice(0, 80) : '')); }; if (ql) { const L = g.nodes.map(n => [n, n.label.toLowerCase()]); for (const [n, l] of L) if (l === ql) add(n, 'exact'); for (const [n] of L.filter(([n, l]) => l.startsWith(ql)).sort((x, y) => x[1].length - y[1].length)) add(n, 'label'); for (const [n] of L.filter(([n, l]) => l.includes(ql)).sort((x, y) => x[1].length - y[1].length)) add(n, 'label'); } for (const x of h.E.similar(g, q, k)) add(x.node, x.score.toFixed(2)); return out.join('\n') || 'no similar thoughts'; });
T('node_get', 'graph', 'graph', 'Full detail and links of one thought', { id: 'thought id' }, async a => { const h = H(), n = nodeOf(h, a.id), g = h.g(), es = g.edges.filter(e => e.a === n.id || e.b === n.id); return nodeLine(n) + '\ndetail: ' + (n.detail || '') + '\nparent: ' + (n.parent || 'none') + '\ngrounding: ' + (n.g ?? '?') + '\nlinks:\n' + es.map(e => e.id + ' | ' + (e.a === n.id ? '->' : '<-') + ' ' + (e.a === n.id ? e.b : e.a) + ' | ' + h.E.edgeRelation(e)).join('\n'); });
T('node_add', 'graph', 'graph', 'Add a thought, optionally under a parent', { label: 'short title', detail: 'longer text with source', plane: 'plane id, optional', parent: 'parent id, optional', grounding: '0 to 1, optional' }, async a => { const h = H(); h.mark('agent add'); const par = a.parent && h.g().byId.get(a.parent) ? a.parent : null; const n = h.E.addNodeRaw(h.g(), { label: h.E.short(String(a.label || 'Untitled'), 90), detail: String(a.detail || ''), plane: a.plane || (par ? h.g().byId.get(par).plane : 'concepts'), g: a.grounding != null ? +a.grounding : 0.5, parent: par, via: S.who || 'Agent' }); if (par) h.E.addEdgeRaw(h.g(), par, n.id, null, 'expands'); h.changed('Agent added "' + h.E.short(n.label, 40) + '"', 'agent'); return 'added ' + n.id; });
T('node_update', 'graph', 'graph', 'Change a thought\'s text, tags or plane', { id: '', label: '', detail: '', tags: 'array', plane: '' }, async a => { const h = H(); nodeOf(h, a.id); h.mark('agent edit'); const p = {}; for (const k of ['label', 'detail', 'tags', 'plane']) if (a[k] != null) p[k] = a[k]; h.E.updateNode(h.g(), a.id, p); h.changed('Agent edited ' + a.id, 'agent'); return 'updated ' + a.id; });
T('node_delete', 'graph', 'graph', 'Delete a thought (undo is available in the map)', { id: '' }, async a => { const h = H(), n = nodeOf(h, a.id); if (n.root) throw new Error('the seed cannot be deleted'); h.mark('agent delete'); h.E.removeNodes(h.g(), [a.id]); h.changed('Agent deleted "' + h.E.short(n.label, 40) + '"', 'agent'); return 'deleted ' + a.id; });
T('edge_add', 'graph', 'graph', 'Link two thoughts', { a: 'id', b: 'id', relation: 'supports, contradicts, causes, refines, assumes, depends on …' }, async x => { const h = H(); nodeOf(h, x.a); nodeOf(h, x.b); h.mark('agent link'); const e = h.E.link(h.g(), x.a, x.b, x.relation || 'supports'); h.changed('Agent linked ' + x.a + ' ' + (x.relation || 'supports') + ' ' + x.b, 'agent'); return e ? 'linked, edge ' + e.id : 'could not link'; });
T('edge_update', 'graph', 'graph', 'Change a link\'s relation or strength', { id: 'edge id', relation: '', weight: '0 to 1' }, async a => { const h = H(); h.mark('agent edit'); const p = {}; if (a.relation) p.relation = a.relation; if (a.weight != null) p.weight = +a.weight; const e = h.E.updateEdge(h.g(), a.id, p); if (!e) throw new Error('no edge ' + a.id); h.changed('Agent updated link ' + a.id, 'agent'); return 'updated'; });
T('edge_delete', 'graph', 'graph', 'Remove a link', { id: 'edge id' }, async a => { const h = H(); h.mark('agent unlink'); if (!h.E.removeEdge(h.g(), a.id)) throw new Error('no edge ' + a.id); h.changed('Agent removed link ' + a.id, 'agent'); return 'removed'; });
T('node_neighbors', 'graph', 'graph', 'Thoughts within N hops', { id: '', hops: 'default 2' }, async a => { const h = H(); nodeOf(h, a.id); const m = h.E.hops(h.g(), a.id, +a.hops || 2); return [...m.entries()].filter(([id]) => id !== a.id).slice(0, 30).map(([id, d]) => d + ' hop | ' + nodeLine(h.g().byId.get(id))).join('\n') || 'none'; });
T('node_expand', 'graph', 'graph', 'Grow a thought with the map\'s own reasoning modules', { id: '' }, async a => { const h = H(); nodeOf(h, a.id); await h.expand(a.id); return 'expanded ' + a.id; });
T('view_set', 'graph', 'graph', 'Switch the map view (one of 30)', { view: 'view id, e.g. sunburst, matrix, force, ego, chord' }, async a => { const h = H(); h.setView(String(a.view)); return 'view ' + a.view; });
T('node_select', 'graph', 'graph', 'Select and focus a thought', { id: '' }, async a => { const h = H(); nodeOf(h, a.id); h.select(a.id); return 'selected ' + a.id; });

T('wikipedia_search', 'web', 'net', 'Search Wikipedia', { query: '' }, async a => { const d = await J('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q_(a.query) + '&format=json&origin=*&srlimit=5'); return (d.query.search || []).map(r => r.title + ' — ' + r.snippet.replace(/<[^>]+>/g, '') + ' (https://en.wikipedia.org/wiki/' + q_(r.title.replace(/ /g, '_')) + ')').join('\n') || 'no results'; });
T('wikidata_search', 'web', 'net', 'Look up an entity on Wikidata', { query: '' }, async a => { const d = await J('https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' + q_(a.query) + '&language=en&format=json&origin=*&limit=5'); return (d.search || []).map(r => r.id + ' | ' + r.label + ' | ' + (r.description || '')).join('\n') || 'no results'; });
T('crossref_search', 'web', 'net', 'Search scholarly works on Crossref', { query: '' }, async a => { const d = await J('https://api.crossref.org/works?rows=5&query=' + q_(a.query)); return (d.message.items || []).map(i => ((i.title || [])[0] || 'untitled') + ' (' + (((i.issued || {})['date-parts'] || [[]])[0][0] || '?') + ') doi:' + i.DOI).join('\n') || 'no results'; });
T('fetch_url', 'web', 'net', 'Fetch a page as text. Only sites that allow cross-origin reads work.', { url: 'https://…' }, async a => { if (!/^https:\/\//i.test(a.url || '')) throw new Error('use an https:// address'); const r = await fetch(a.url); if (!r.ok) throw new Error('HTTP ' + r.status); const t = await r.text(); return clip(t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 2500); });
T('pubmed_search', 'lit', 'net', 'Search PubMed', { query: '', k: 'default 5' }, async a => { const k = Math.min(10, +a.k || 5), s = await J('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=' + k + '&term=' + q_(a.query)), ids = s.esearchresult.idlist || []; if (!ids.length) return 'no results'; const d = await J('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=' + ids.join(',')); return ids.map(i => { const r = d.result[i]; return 'PMID ' + i + ' | ' + r.title + ' | ' + (r.source || '') + ' ' + (r.pubdate || ''); }).join('\n'); });
T('europepmc_search', 'lit', 'net', 'Search Europe PMC (papers and preprints)', { query: '' }, async a => { const d = await J('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=5&query=' + q_(a.query)); return (d.resultList.result || []).map(r => r.title + ' | ' + (r.journalTitle || r.source) + ' ' + (r.pubYear || '') + ' | ' + (r.doi ? 'doi:' + r.doi : r.source + ':' + r.id)).join('\n') || 'no results'; });
T('papers_local', 'lit', 'net', 'Search the built-in paper index', { query: '' }, async a => { const h = H(); return h.E.searchPapers(h.g(), String(a.query), 5).map(x => x.paper.title + ' (' + x.paper.year + ') ' + x.paper.venue + ' doi:' + x.paper.doi).join('\n') || 'none'; });
T('pubchem_lookup', 'chem', 'net', 'Look up a compound by name in PubChem', { name: '' }, async a => { const d = await J('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/' + q_(a.name) + '/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName/JSON'); const p = d.PropertyTable.Properties[0]; return 'CID ' + p.CID + ' | ' + p.MolecularFormula + ' | ' + p.MolecularWeight + ' g/mol | SMILES ' + (p.CanonicalSMILES || p.ConnectivitySMILES) + ' | ' + p.IUPACName; });
T('uniprot_search', 'chem', 'net', 'Search UniProt proteins', { query: '' }, async a => { const d = await J('https://rest.uniprot.org/uniprotkb/search?size=4&format=json&query=' + q_(a.query)); return (d.results || []).map(r => r.primaryAccession + ' | ' + (((r.proteinDescription || {}).recommendedName || {}).fullName || {}).value + ' | ' + ((r.organism || {}).scientificName || '')).join('\n') || 'no results'; });
T('rdkit_analogs', 'chem', 'net', 'Valid analogs of a SMILES by substituent swaps (RDKit checks validity)', { smiles: '', k: 'default 4' }, async a => { const GR = await import('./suite-grade.js'); const r = await GR.analogs(String(a.smiles), +a.k || 4); return r.length ? JSON.stringify(r).slice(0, 1200) : 'no valid analogs'; });
T('rdkit_grade', 'chem', 'net', 'Grade a molecule: valid, new, stable, drug-like, backed', { smiles: '' }, async a => { const GR = await import('./suite-grade.js'); const r = await GR.gradeMolecule({ mol: { smiles: String(a.smiles) }, detail: '', evidence: [] }); return r ? r.levelName + ' (score ' + (r.score ?? '?') + ')\nflags: ' + (r.flags || []).join('; ') + '\n' + (r.steps || []).map(s => typeof s === 'string' ? s : JSON.stringify(s)).join('\n').slice(0, 800) : 'could not grade'; });

T('fs_list', 'files', 'files', 'List a folder', { path: 'default /' }, async a => fs.list(a.path || '/').map(f => (f.dir ? 'dir  ' : 'file ') + f.name + (f.dir ? '/' : ' (' + f.size + ')')).join('\n') || 'empty');
T('fs_read', 'files', 'files', 'Read a file (/project/<name> reads this project\'s files)', { path: '' }, async a => clip(await fs.read(a.path), 4000));
T('fs_write', 'files', 'files', 'Create or overwrite a file under /work, /patterns or /notes', { path: '', content: '' }, async a => 'wrote ' + fs.write(a.path, a.content));
T('fs_edit', 'files', 'files', 'Replace text in a file', { path: '', find: '', replace: '' }, async a => { const c = await fs.read(a.path); if (!c.includes(a.find)) throw new Error('text not found'); fs.write(a.path, c.replace(a.find, () => a.replace ?? '')); return 'edited ' + fs.norm(a.path); });
T('fs_delete', 'files', 'files', 'Delete a file or folder', { path: '' }, async a => 'deleted ' + fs.rm(a.path) + ' item(s)');
T('fs_move', 'files', 'files', 'Move or rename', { from: '', to: '' }, async a => 'moved ' + fs.mv(a.from, a.to) + ' item(s)');
T('fs_search', 'files', 'files', 'Search file contents', { query: '', dir: '' }, async a => fs.grep(a.query, a.dir || '/').join('\n') || 'no matches');
T('terminal_run', 'terminal', 'terminal', 'Run a terminal command (try "help")', { cmd: '' }, async a => (await term(String(a.cmd))) || '(no output)');
T('js_run', 'terminal', 'terminal', 'Run JavaScript over the whole map in a sandbox. map.nodes = [{id,label,detail,plane,g,parent,tags}], map.edges = [{a,b,kind,relation,weight}]. Imported records keep their fields in detail as "key: value · key: value". `records` holds those rows already parsed: [{_id,_label,_parent, field: value}]. Use log() to print; 3-second limit. Best for questions about many thoughts at once: count, group and compare with records instead of reading thoughts one by one.', { code: '' }, async a => { const r = await A.runCode(String(a.code), H().g()); return clip(fmtRun(r), 2500); });

const capture = (g, root) => { const ids = new Set([root]), all = g.nodes; let grew = true; while (grew) { grew = false; for (const n of all) if (n.parent && ids.has(n.parent) && !ids.has(n.id)) { ids.add(n.id); grew = true; } } const L = all.filter(n => ids.has(n.id)), ix = new Map(L.map((n, i) => [n.id, i])); return { nodes: L.map(n => ({ label: n.label, detail: n.detail || '', plane: n.plane, parent: n.id === root ? null : (ix.get(n.parent) ?? null) })), edges: g.edges.filter(e => ix.has(e.a) && ix.has(e.b) && e.kind !== 'expands').map(e => ({ a: ix.get(e.a), b: ix.get(e.b), relation: e.relation || '' })) }; };
T('pattern_save', 'patterns', 'brain', 'Save a structure as a reusable pattern. Give root = a thought id to capture it and everything under it.', { name: '', description: '', root: 'thought id', nodes: 'or an explicit list [{label,detail,plane,parent:index}]' }, async a => { const h = H(); const body = a.root ? capture(h.g(), nodeOf(h, a.root).id) : { nodes: a.nodes || [], edges: a.edges || [] }; if (!body.nodes.length) throw new Error('nothing to save'); const name = String(a.name || 'pattern').toLowerCase().replace(/[^a-z0-9]+/g, '-'); fs.write('/patterns/' + name + '.json', JSON.stringify({ name, description: a.description || '', ...body }, null, 1)); brain.add('skill', name, { detail: a.description || '', reuse: true }); return 'saved /patterns/' + name + '.json with ' + body.nodes.length + ' thoughts'; });
T('pattern_find', 'patterns', 'brain', 'Find saved patterns', { query: '' }, async a => { const out = []; for (const p of fs.all().filter(p => p.startsWith('/patterns/'))) { const c = JSON.parse(S.vfs[p].c), s = (c.name + ' ' + c.description + ' ' + c.nodes.map(n => n.label).join(' ')).toLowerCase(); const hit = String(a.query || '').toLowerCase().split(/\W+/).filter(w => w.length > 2 && s.includes(w)).length; if (hit || !a.query) out.push([hit, c.name + ' | ' + c.description + ' | ' + c.nodes.length + ' thoughts']); } return out.sort((x, y) => y[0] - x[0]).map(x => x[1]).join('\n') || 'no saved patterns'; });
T('pattern_apply', 'patterns', 'graph', 'Build a saved pattern on the map, under a thought', { name: '', under: 'thought id, default the seed' }, async a => { const h = H(), g = h.g(), p = JSON.parse(await fs.read('/patterns/' + String(a.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json')), top = a.under ? nodeOf(h, a.under).id : (g.nodes.find(n => n.root) || g.nodes[0]).id; h.mark('agent pattern'); const ids = []; p.nodes.forEach((n, i) => { const par = n.parent == null ? top : ids[n.parent]; const x = h.E.addNodeRaw(g, { label: n.label, detail: n.detail, plane: n.plane || 'concepts', g: 0.5, parent: par, via: 'Pattern ' + p.name }); ids.push(x.id); if (par) h.E.addEdgeRaw(g, par, x.id, null, 'expands'); }); for (const e of p.edges || []) if (ids[e.a] && ids[e.b]) h.E.link(g, ids[e.a], ids[e.b], e.relation || 'supports'); h.changed('Pattern "' + p.name + '" applied · ' + ids.length + ' thoughts', 'agent'); brain.add('skill', p.name, { reuse: true }); return 'applied ' + ids.length + ' thoughts'; });
const dx = () => { const d = H().docs; if (!d) throw new Error('documents are not available in this workspace'); return d; };
T('doc_list', 'docs', 'graph', 'List the open topic\'s documents: five live ones drawn from the map (live:topic brief, live:graph outline, live:sources, live:evidence, live:searches) and written notes', {}, async () => dx().list());
T('doc_read', 'docs', 'graph', 'Read a document by id. Live documents are regenerated from the map each time. Long ones come in parts: pass offset to continue', { id: 'live:topic', offset: 0 }, async a => dx().read(String(a.id || 'live:topic'), +a.offset || 0));
T('doc_write', 'docs', 'files', 'Create a written note, or replace one when id is given. scope is topic, graph, source, evidence or search; about says what it is about (a thought label, a source number, a search query). Body is Markdown: [[Thought label]] links a thought, [2] cites source 2', { title: '', body: '', scope: 'topic', about: '', id: '' }, async a => dx().write(a));
T('doc_append', 'docs', 'files', 'Add text to the end of a written note', { id: '', text: '' }, async a => dx().append(String(a.id), String(a.text || '')));
T('doc_delete', 'docs', 'files', 'Delete a written note', { id: '' }, async a => dx().remove(String(a.id)));
T('brain_remember', 'brain', 'brain', 'Write a memory into the agent brain, linked to thought ids', { text: '', refs: 'array of thought ids' }, async a => { const n = brain.add('memory', String(a.text).slice(0, 80), { detail: a.text, refs: a.refs || [], link: S.goalId, rel: 'learned' }); return 'remembered ' + n.id; });
T('brain_recall', 'brain', 'brain', 'Recall memories, plans and skills', { query: '' }, async a => brain.recall(a.query, 6).map(n => n.kind + ' | ' + n.label + ' | ' + n.detail.slice(0, 160)).join('\n') || 'nothing relevant');
T('brain_plan', 'brain', 'brain', 'Record a plan as steps in the brain', { goal: '', steps: 'array of strings' }, async a => { const p = brain.add('plan', String(a.goal).slice(0, 80), { detail: (a.steps || []).join('\n'), link: S.goalId, rel: 'plans' }); (a.steps || []).slice(0, 8).forEach((s, i) => { const st = brain.add('plan', (i + 1) + '. ' + String(s).slice(0, 80), { link: p.id, rel: 'step' }); }); return 'plan ' + p.id; });

T('agent_delegate', 'agents', 'brain', 'Hand a sub-task to another agent and get its summary', { agent: 'agent name', goal: '' }, async (a, ctx) => { if ((ctx.depth || 0) >= 1) throw new Error('delegation is limited to one level'); const ag = S.agents.find(x => x.id === String(a.agent).toLowerCase() || x.name.toLowerCase() === String(a.agent).toLowerCase()); if (!ag) throw new Error('no agent ' + a.agent + '. Agents: ' + S.agents.map(x => x.name).join(', ')); return await runAgent(ag, a.goal, { depth: 1, quiet: true }); });
T('tool_create', 'agents', 'agents', 'Make a new tool from sandboxed JavaScript. In the code, `args` holds the call arguments and `map` the graph.', { name: 'snake_case', desc: '', code: 'JavaScript that log()s its result' }, async a => { const name = 'custom_' + String(a.name).toLowerCase().replace(/[^a-z0-9_]+/g, '_'); S.custom = S.custom.filter(t => t.name !== name); S.custom.push({ name, desc: String(a.desc || ''), code: String(a.code || '') }); persist(['custom']); emit(); return 'created ' + name; });
T('tool_delete', 'agents', 'agents', 'Delete a custom tool', { name: '' }, async a => { const n = S.custom.length; S.custom = S.custom.filter(t => t.name !== a.name); persist(['custom']); emit(); return n === S.custom.length ? 'no such custom tool' : 'deleted'; });
T('mcp_list', 'agents', 'brain', 'List connected external MCP servers and their tools', {}, async () => S.mcps.filter(m => S.conns[m.id]).map(m => m.name + ': ' + S.conns[m.id].tools.map(t => t.name).join(', ')).join('\n') || 'no external servers connected');
T('mcp_call', 'agents', 'mcp', 'Call a tool on a connected external MCP server', { server: 'server name', tool: '', args: 'object' }, async a => { const m = S.mcps.find(x => x.name === a.server || x.id === a.server), c = m && S.conns[m.id]; if (!c) throw new Error('server not connected: ' + a.server); return clip(await A.mcpCall(c, a.tool, a.args || {}), 3000); });

const toolList = () => [...TOOLS.map(t => ({ ...t, custom: false })), ...S.custom.map(t => ({ name: t.name, pack: 'custom', pol: 'terminal', desc: t.desc || 'Custom tool', args: { args: 'object' }, custom: true, code: t.code }))];
const toolOn = t => !S.disabled.includes(t.pack) && !S.disabled.includes(t.name);
const polOf = t => S.policy[t.pol] || 'ask';

// ── approvals: file and terminal actions wait for the user ──
function approve(who, tool, args) {
  return new Promise(res => { const a = { id: uid('a'), who, tool, args, t: now(), res: v => { S.approvals = S.approvals.filter(x => x.id !== a.id); log('sys', (v ? 'Approved ' : 'Denied ') + tool, who); res(v); emit(); } }; S.approvals.push(a); log('sys', 'Waiting for approval: ' + tool + ' ' + clip(args, 160), who); emit(); });
}

async function callTool(name, args, ctx = {}) {
  const t = toolList().find(x => x.name === name); if (!t) throw new Error('no tool ' + name);
  if (!toolOn(t)) throw new Error(name + ' is switched off in the MCP tab');
  const pol = polOf(t); if (pol === 'deny') throw new Error(name + ' is blocked by policy');
  if (pol === 'ask' && !ctx.approved && !(ctx.direct)) { const ok = await approve(ctx.who || 'Agent', name, args); if (!ok) throw new Error('the user denied ' + name); }
  S.who = ctx.who || 'You'; S.ledger.tools++;
  try {
    let out;
    if (t.custom) { const r = await A.runCode('const args = ' + JSON.stringify(args || {}) + ';\n' + t.code, H().g()); out = fmtRun(r); }
    else out = await t.run(args || {}, ctx);
    if (/^(wikipedia_search|wikidata_search|crossref_search|pubmed_search|europepmc_search|papers_local|pubchem_lookup|uniprot_search|rdkit_analogs|fetch_url)$/.test(name)) { try { const h = H(); if (h.logSearch) { const rs = String(out || '').split('\n').filter(Boolean).slice(0, 10).map(l => { const u = (l.match(/https?:\/\/[^\s)]+/) || [''])[0], p = l.replace(/\s*\(?https?:\/\/[^\s)]+\)?/, '').split(' — '); return { title: p[0].slice(0, 160), sub: (p[1] || '').slice(0, 160), url: u }; }); h.logSearch({ kind: t.pack === 'chem' ? 'chem' : (t.pack === 'lit' || name === 'crossref_search') ? 'papers' : 'web', query: name.replace(/_search|_lookup|_/g, ' ').trim() + ': ' + (args.query || args.name || args.smiles || args.url || ''), results: rs, by: ctx.who }); } } catch (e) { /* logging never blocks a tool */ } }
    log('tool', name + ' ' + clip(args, 140) + '\n→ ' + clip(out, 300), ctx.who || 'You'); return typeof out === 'string' ? out : JSON.stringify(out);
  } catch (e) { log('error', name + ' failed: ' + e.message, ctx.who || 'You'); throw e; }
}

// ── external MCP servers: create, read, update, delete ──
async function mcpAdd(name, url, token) { const m = { id: uid('s'), name: name || new URL(url).host, url, token: token || '' }; S.mcps.push(m); persist(['mcps']); emit(); return mcpConnect(m.id); }
async function mcpConnect(id) { const m = S.mcps.find(x => x.id === id); if (!m) return; m.status = 'connecting'; emit(); try { const c = await A.mcpConnect(m.url, m.token); S.conns[id] = c; m.status = 'connected'; m.error = ''; log('mcp', 'Connected ' + m.name + ' · ' + c.tools.length + ' tools', 'MCP'); } catch (e) { m.status = 'error'; m.error = e.message; log('error', 'MCP ' + m.name + ': ' + e.message, 'MCP'); } emit(); return m; }
const mcpUpdate = (id, p) => { const m = S.mcps.find(x => x.id === id); if (m) { Object.assign(m, p); delete S.conns[id]; m.status = ''; persist(['mcps']); emit(); } };
const mcpRemove = id => { S.mcps = S.mcps.filter(m => m.id !== id); delete S.conns[id]; persist(['mcps']); emit(); };
const MARKET = [
  { id: 'deepwiki', name: 'DeepWiki', cat: 'Code', url: 'https://mcp.deepwiki.com/mcp', desc: 'Ask questions about public GitHub repositories. Public, no key. Availability is up to the operator.' },
  { id: 'custom', name: 'Your own server', cat: 'Any', url: '', desc: 'Any MCP server that speaks streamable HTTP over https (or http://localhost). Paste the address and an optional token.' },
];

// ── terminal ──
const HELP = 'ls [dir] · cat f · write f text · echo text > f · append f text · rm p · mv a b · find q · grep q\ngraph stats|nodes|add <label>|link <a> <b> [rel]|del <id>|view <id>|search <q>\npattern list|find <q>|apply <name>\ntool list|<name> <json>\nbrain recall <q>\njs <code> · history · clear · help';
async function term(line) {
  line = String(line || '').trim(); if (!line) return ''; S.shell.push(line); if (S.shell.length > 100) S.shell.shift();
  const m = /^echo\s+([\s\S]*?)\s*(>>?)\s*(\S+)$/.exec(line); if (m) { const f = fs.norm(m[3]); fs.write(f, m[2] === '>>' ? ((S.vfs[f] || { c: '' }).c + m[1] + '\n') : m[1] + '\n'); return ''; }
  const [cmd, ...rest] = line.split(/\s+/), tail = line.slice(cmd.length).trim();
  try {
    switch (cmd) {
      case 'help': return HELP;
      case 'ls': return fs.list(rest[0] || '/').map(f => f.dir ? f.name + '/' : f.name + '  ' + f.size).join('\n');
      case 'cat': return await fs.read(rest[0]);
      case 'head': return (await fs.read(rest[0])).split('\n').slice(0, 20).join('\n');
      case 'write': { const f = rest[0]; fs.write(f, tail.slice(f.length).trim()); return ''; }
      case 'append': { const f = fs.norm(rest[0]); fs.write(f, (S.vfs[f] ? S.vfs[f].c : '') + tail.slice(rest[0].length).trim() + '\n'); return ''; }
      case 'rm': return 'removed ' + fs.rm(rest[0]);
      case 'mv': fs.mv(rest[0], rest[1]); return '';
      case 'find': return fs.all().filter(p => p.toLowerCase().includes(tail.toLowerCase())).join('\n');
      case 'grep': return fs.grep(tail).join('\n') || 'no matches';
      case 'history': return S.shell.map((c, i) => (i + 1) + '  ' + c).join('\n');
      case 'clear': S.shell = []; return '';
      case 'js': return await callTool('js_run', { code: tail }, { direct: true });
      case 'graph': { const s = rest[0], r = tail.slice(s.length).trim(); if (s === 'stats') return await callTool('graph_overview', {}, { direct: true }); if (s === 'nodes') { const g = H().g(); return g.nodes.slice(-30).map(nodeLine).join('\n'); } if (s === 'add') return await callTool('node_add', { label: r }, { direct: true }); if (s === 'link') return await callTool('edge_add', { a: rest[1], b: rest[2], relation: rest.slice(3).join(' ') || 'supports' }, { direct: true }); if (s === 'del') return await callTool('node_delete', { id: rest[1] }, { direct: true }); if (s === 'view') return await callTool('view_set', { view: rest[1] }, { direct: true }); if (s === 'search') return await callTool('node_search', { query: r }, { direct: true }); return 'graph stats | nodes | add | link | del | view | search'; }
      case 'pattern': { const s = rest[0], r = tail.slice(s.length).trim(); if (s === 'list') return await callTool('pattern_find', { query: '' }, { direct: true }); if (s === 'find') return await callTool('pattern_find', { query: r }, { direct: true }); if (s === 'apply') return await callTool('pattern_apply', { name: r }, { direct: true }); return 'pattern list | find <q> | apply <name>'; }
      case 'brain': return rest[0] === 'recall' ? await callTool('brain_recall', { query: tail.slice(6).trim() }, { direct: true }) : 'brain recall <q>';
      case 'tool': { if (!rest[0] || rest[0] === 'list') return toolList().map(t => (toolOn(t) ? '  ' : 'x ') + t.name + ' [' + t.pack + ', ' + polOf(t) + '] ' + t.desc).join('\n'); const a = tail.slice(rest[0].length).trim(); return await callTool(rest[0], a ? JSON.parse(a) : {}, { direct: true }); }
      default: return 'unknown command: ' + cmd + '. Type help.';
    }
  } catch (e) { return 'error: ' + e.message; }
}

// ── the agent loop ──
async function llm(agent, system, messages) {
  if (!AI.available()) throw new Error('Live AI is not available in this viewer. Tools still work from the MCP tab and the terminal.');
  const run = async () => { await slot(); const msgs = messages.map((m, i) => i === 0 ? { ...m, content: system + '\n\n' + m.content } : m); const text = await window.claude.complete({ model: MODELS[agent.model] || agent.model || MODELS.haiku, max_tokens: agent.model === 'sonnet' ? 1600 : 1100, messages: msgs }); S.ledger[agent.model === 'sonnet' ? 'sonnet' : 'haiku']++; emit(); return String(text || ''); };
  const next = chain.then(run, run); chain = next.catch(() => {}); return next;
}
const RULES = 'You are an agent working on the user\'s thought graph through tools. Each turn reply with ONE JSON object and nothing else: {"say":"one sentence on what you are doing and why","tool":"tool_name","args":{...}} to use a tool, or {"say":"...","done":true,"final":"2 to 4 sentences: what changed and what is still open"} to finish. Never invent ids, sources, numbers or citations: read ids from tool results. Put the source in a thought\'s detail. One tool per turn. Use ids you have already seen instead of looking them up again. When the goal asks you to add something, add it as soon as you know where it goes. On a big map, answer counting, ranking or comparison questions with one js_run over `records` (or map), not by searching or opening thoughts one at a time; then write the answer with node_add. Stop as soon as the goal is met.';
// On big maps the last 30 thoughts say little, so the agent also gets the top-level sections and the busiest thoughts.
function snapshot(h) { const g = h.g(), big = g.nodes.length > 300, L = g.nodes.filter(n => !n.dormant).slice(big ? -12 : -30), root = g.nodes.find(n => n.root) || g.nodes[0], sel = h.sel() && g.byId.get(h.sel());
  const top = big && root ? g.nodes.filter(n => n.parent === root.id).slice(0, 30) : [], hubs = big ? g.nodes.filter(n => !n.root).sort((a, b) => (b.deg || 0) - (a.deg || 0)).slice(0, 8) : [];
  return 'seed: ' + g.seed + ' | ' + g.nodes.length + ' thoughts, ' + g.edges.length + ' links | selected: ' + (sel ? nodeLine(sel) : 'none') + (big ? '\ntop-level sections (id | label | plane):\n' + top.map(nodeLine).join('\n') + '\nbusiest thoughts:\n' + hubs.map(nodeLine).join('\n') : '') + '\nrecent thoughts (id | label | plane):\n' + L.map(nodeLine).join('\n'); }

async function runAgent(agent, goal, o = {}) {
  const h = H(), depth = o.depth || 0, who = agent.name, tools = toolList().filter(t => toolOn(t) && polOf(t) !== 'deny' && (agent.packs || []).concat(t.custom ? ['custom'] : []).includes(t.pack) && !(depth >= 1 && t.name === 'agent_delegate'));
  const cat = tools.map(t => '- ' + t.name + ' ' + JSON.stringify(t.args) + ' : ' + t.desc + (polOf(t) === 'ask' ? ' [asks the user first]' : '')).join('\n');
  const goalNode = brain.add('goal', String(goal).slice(0, 80), { agent: who, refs: h.sel() ? [h.sel()] : [] }); const prevGoal = S.goalId; S.goalId = goalNode.id;
  const mem = brain.recall(goal, 5).map(n => n.kind + ': ' + n.label + (n.detail ? ' — ' + n.detail.slice(0, 120) : '')).join('\n');
  const system = RULES + '\n\nYour role (' + who + '): ' + agent.directive + '\n\nTools:\n' + cat + (mem ? '\n\nFrom your brain:\n' + mem : '') + (o.extra ? '\n\n' + o.extra : '');
  const max = agent.maxSteps || 8, budget = i => { const left = max - i - 1; return '\n\nStep ' + (i + 2) + ' of ' + max + '.' + (left === 1 ? ' Last step: make the change the goal asks for now, or finish.' : left === 2 ? ' Two steps left: act now rather than reading more.' : ''); };
  const msgs = [{ role: 'user', content: 'Goal: ' + goal + '\n\nYou have ' + max + ' steps.\n\nCurrent map:\n' + snapshot(h) }];
  if (!o.quiet) say(who, 'On it: ' + goal, { agent: agent.id }); log('agent', 'start · ' + goal + ' · ' + (agent.model === 'sonnet' ? 'Sonnet' : 'Haiku'), who);
  let final = '', fails = 0, lastSay = ''; const used = new Set();
  try {
    for (let i = 0; i < max && !S.stop; i++) {
      const raw = await llm(agent, system, msgs); const j = AI.parse(raw, null);
      if (!j || typeof j !== 'object') { if (++fails > 2) throw new Error('the model stopped returning JSON'); msgs.push({ role: 'assistant', content: raw.slice(0, 400) }, { role: 'user', content: 'Reply with one JSON object only.' }); continue; }
      msgs.push({ role: 'assistant', content: JSON.stringify(j).slice(0, 1200) });
      if (j.say) lastSay = j.say; if (j.say && !o.quiet) say(who, j.say, { agent: agent.id, step: i + 1 }); else if (j.say) log('agent', j.say, who);
      if (j.done || !j.tool) { final = j.final || j.say || 'Done.'; break; }
      let out; try { out = await callTool(j.tool, j.args || {}, { who, depth }); used.add(j.tool); if (o.trace) o.trace.push({ tool: j.tool, args: j.args || {}, ok: true, out: clip(out, 500) }); const tn = brain.add('tool', j.tool, { reuse: true, link: goalNode.id, rel: 'used' }); if (!o.quiet) say(who, '', { tool: j.tool, args: clip(j.args || {}, 200), result: clip(out, 260) }); }
      catch (e) { out = 'ERROR: ' + e.message; if (o.trace) o.trace.push({ tool: j.tool, args: j.args || {}, ok: false, out: e.message }); if (!o.quiet) say(who, '', { tool: j.tool, args: clip(j.args || {}, 200), result: out, bad: true }); }
      msgs.push({ role: 'user', content: 'RESULT of ' + j.tool + ':\n' + clip(out, 1800) + '\n\nMap now:\n' + snapshot(h) + budget(i) });
      if (msgs.length > 14) msgs.splice(1, 2);
    }
    if (!final) final = S.stop ? 'Stopped.' : 'Used all ' + max + ' steps' + (used.size ? ' (' + [...used].join(', ') + ')' : '') + '. Last: ' + (lastSay || 'no note') + ' Ask me to continue if there is more to do.';
    const tools_ = [...used]; for (let a = 0; a < tools_.length; a++) for (let b = a + 1; b < tools_.length; b++) { const A_ = S.brain.nodes.find(n => n.kind === 'tool' && n.label === tools_[a]), B_ = S.brain.nodes.find(n => n.kind === 'tool' && n.label === tools_[b]); if (A_ && B_) brain.link(A_.id, B_.id, 'used together'); }
    brain.decay(); goalNode.detail = final.slice(0, 300); persist(['brain']);
  } catch (e) { final = 'Stopped: ' + e.message; log('error', final, who); }
  S.goalId = prevGoal; if (!o.quiet) say(who, final, { agent: agent.id, final: true }); log('agent', 'end · ' + clip(final, 200), who); return final;
}

async function ask(text, agentId) {
  text = String(text || '').trim(); if (!text) return; say('You', text);
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
  if (m && m[1] !== 'help') { try { const out = await callTool(m[1], m[2].trim() ? JSON.parse(m[2]) : {}, { direct: true }); say('Tool', clip(out, 1200), { tool: m[1] }); } catch (e) { say('Tool', e.message, { bad: true }); } return; }
  if (m) { say('Mega', 'Type a goal and the selected agent works on it with its tools. Or call a tool directly: /node_add {"label":"…"}. See the MCP tab for every tool.'); return; }
  const ag = S.agents.find(a => a.id === agentId) || S.agents[0]; S.busy = ag.id; S.stop = false; emit();
  try { await runAgent(ag, text); } finally { S.busy = null; emit(); }
}
// ── sessions: a whole working state (map, brain, files, chat, log) that can be reopened and continued ──
// Bodies live in IndexedDB: a 2,000-thought map is about a megabyte, which localStorage cannot hold several of.
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('mega-graph', 1); r.onupgradeneeded = () => r.result.createObjectStore('sessions'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('sessions', mode), q = fn(t.objectStore('sessions')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return { get: k => tx('readonly', s => s.get(k)), put: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
const hasIDB = () => { try { return typeof indexedDB !== 'undefined'; } catch (e) { return false; } };
async function saveSession(meta, graphData) {
  const id = meta.id || uid('ses');
  const body = { id, mode: meta.mode || '', name: meta.name, who: meta.who || '', note: meta.note || '', at: Date.now(), counts: meta.counts || '', graph: graphData, brain: JSON.parse(JSON.stringify(meta.brain || S.brain)), vfs: JSON.parse(JSON.stringify(meta.vfs || S.vfs)), chat: (meta.chat || S.chat).slice(-80), logs: (meta.logs || S.logs).slice(-120) };
  let where = 'idb'; try { if (!hasIDB()) throw new Error('no IndexedDB'); await IDB.put(id, body); } catch (e) { where = 'local'; try { localStorage.setItem('mega-session-' + id, JSON.stringify(body)); } catch (e2) { throw new Error('the session is too big to save here: ' + (e2 && e2.message)); } }
  const nodes = (graphData && graphData.nodes) || [], edges = (graphData && graphData.edges) || [];
  S.sessions = [{ id, mode: body.mode, name: body.name, who: body.who, note: body.note, at: body.at, counts: body.counts, size: nodes.length, links: edges.length, kb: Math.round(JSON.stringify(body).length / 1024), where }, ...S.sessions.filter(x => x.id !== id)].slice(0, 24);
  persist(['sessions']); emit(); return id;
}
async function readSession(id) { try { if (hasIDB()) { const b = await IDB.get(id); if (b) return b; } } catch (e) { /* fall back to the old place */ } return LS('mega-session-' + id); }
// Open a session: keep whatever map was open as its own session first, then hand the app the session to load on boot.
async function openSession(id, appId) {
  const b = await readSession(id); if (!b) throw new Error('that session is no longer saved');
  appId = appId || b.mode || (() => { try { return localStorage.getItem('mega-mode'); } catch (e) { return null; } })() || 'thoughtmap';
  const cur = LS('mg-' + appId + '-current'), hasMap = !!(cur && Array.isArray(cur.nodes) && cur.nodes.length > 1 && !(cur.seed === (b.graph || {}).seed && cur.nodes.length === ((b.graph || {}).nodes || []).length));
  // the brain, files and chat are replaced too, so they are kept even when this mode has no map of its own
  const hasWork = S.brain.nodes.length > 0 || S.chat.length > 0 || Object.keys(S.vfs).some(p => (p.startsWith('/work/') && p !== '/work/notes.md') || (p.startsWith('/patterns/') && !p.endsWith('/.keep')));
  if (hasMap || hasWork) {
    try { await saveSession({ name: 'Your work before opening "' + b.name + '"', who: hasMap ? cur.nodes.length + ' thoughts, ' + (cur.edges || []).length + ' links' : 'agent brain, files and chat', note: 'Kept automatically', mode: appId }, hasMap ? cur : null); } catch (e) { throw new Error('could not keep your current work first, so nothing was opened: ' + e.message); }
  }
  S.brain = b.brain || { nodes: [], edges: [] }; S.vfs = b.vfs || S.vfs; S.chat = b.chat || []; S.logs = b.logs || [];
  persist(['brain', 'vfs', 'chat']);
  try { localStorage.setItem('mega-mode', appId); localStorage.setItem('mega-open', id); } catch (e) {}
  emit(); return b;
}
async function deleteSession(id) { try { if (hasIDB()) await IDB.del(id); } catch (e) {} try { localStorage.removeItem('mega-session-' + id); } catch (e) {} S.sessions = S.sessions.filter(x => x.id !== id); persist(['sessions']); emit(); }
const stop = () => { S.stop = true; for (const a of S.approvals.slice()) a.res(false); emit(); };
const addAgent = () => { S.agents.push({ id: uid('ag'), name: 'Agent ' + (S.agents.length + 1), model: 'haiku', color: '#e5c46f', maxSteps: 8, packs: ['graph', 'web', 'brain'], directive: 'Describe what this agent is for.' }); persist(['agents']); emit(); };
const patchAgent = (id, p) => { const a = S.agents.find(x => x.id === id); if (a) { Object.assign(a, p); persist(['agents']); emit(); } };
const removeAgent = id => { if (S.agents.length > 1) { S.agents = S.agents.filter(a => a.id !== id); persist(['agents']); emit(); } };
const setPolicy = (k, v) => { S.policy[k] = v; persist(['policy']); emit(); };
const toggleOff = k => { S.disabled = S.disabled.includes(k) ? S.disabled.filter(x => x !== k) : [...S.disabled, k]; persist(['policy']); emit(); };

  return { S, log, callTool, mcpAdd, mcpConnect, term, runAgent, ask, saveSession, readSession, openSession, deleteSession, MODELS, POLICY_KEYS, on, emit, save_, say, attach, fs, brain, PACKS, toolList, toolOn, polOf, mcpUpdate, mcpRemove, MARKET, stop, addAgent, patchAgent, removeAgent, setPolicy, toggleOff };
}
const K0 = makeKit(null);
export const { S, log, callTool, mcpAdd, mcpConnect, term, runAgent, ask, saveSession, readSession, openSession, deleteSession, MODELS, POLICY_KEYS, on, emit, save_, say, attach, fs, brain, PACKS, toolList, toolOn, polOf, mcpUpdate, mcpRemove, MARKET, stop, addAgent, patchAgent, removeAgent, setPolicy, toggleOff } = K0;
export const spawn = init => makeKit(init || {});
