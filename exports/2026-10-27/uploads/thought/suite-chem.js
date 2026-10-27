// Chemistry discovery for ChemGraph: live public sources, parallel research agents, and a search over
// what to research next (visit counts + learned values + priors, in the spirit of AlphaGo's tree search).
// Sources that answer directly from the browser: PubMed (NCBI E-utilities), Europe PMC, PubChem, UniProt,
// AlphaFold DB (AlphaFold 2 models), RCSB PDB. Wolfram|Alpha and general web search need a connected MCP tool.
import * as Lr from './suite-learn.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const gates = new Map();
async function gate(host, gap) { const t = gates.get(host) || 0, now = Date.now(), wait = Math.max(0, t - now); gates.set(host, Math.max(now, t) + gap); if (wait) await sleep(wait); }
async function getJSON(url, o = {}) {
  const host = new URL(url).host; await gate(host, host.includes('ncbi') ? 380 : 120);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), o.timeout || 15000);
  try {
    const res = await fetch(url, { method: o.body ? 'POST' : 'GET', headers: o.body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined, signal: ctl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text(); return txt ? JSON.parse(txt) : null;
  } catch (e) { if (!o.retried && e.name !== 'AbortError' && /network|fetch/i.test(e.message)) { clearTimeout(t); await sleep(1200); return getJSON(url, { ...o, retried: true }); } throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); }
  finally { clearTimeout(t); }
}
const enc = encodeURIComponent, cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export const SOURCES = {
  pubmed: { label: 'PubMed', kind: 'papers' },
  europepmc: { label: 'Europe PMC', kind: 'papers' },
  pubchem: { label: 'PubChem', kind: 'molecule' },
  uniprot: { label: 'UniProt', kind: 'protein' },
  alphafold: { label: 'AlphaFold DB', kind: 'structure' },
  pdb: { label: 'RCSB PDB', kind: 'structure' },
  wolfram: { label: 'Wolfram|Alpha', kind: 'compute', mcp: /wolfram|alpha|calc|compute|math/i },
  web: { label: 'Web search', kind: 'web', mcp: /search|web|fetch|browse/i },
};

export async function pubmed(q, n = 4) {
  const s = await getJSON('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=' + n + '&term=' + enc(q));
  const ids = (s && s.esearchresult && s.esearchresult.idlist) || []; if (!ids.length) return [];
  const d = await getJSON('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=' + ids.join(','));
  return ids.map(id => d && d.result && d.result[id]).filter(Boolean).map(r => ({ src: 'pubmed', kind: 'paper', title: cut(r.title, 200), authors: (r.authors && r.authors[0] ? r.authors[0].name + (r.authors.length > 1 ? ' et al.' : '') : 'Unknown'), year: String(r.pubdate || '').slice(0, 4), venue: r.source || 'PubMed', doi: String(r.elocationid || '').replace(/^doi:\s*/i, ''), url: 'https://pubmed.ncbi.nlm.nih.gov/' + r.uid + '/', meta: 'PMID ' + r.uid }));
}
export async function europepmc(q, n = 4) {
  const d = await getJSON('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=lite&pageSize=' + n + '&query=' + enc(q));
  return ((d && d.resultList && d.resultList.result) || []).map(r => ({ src: 'europepmc', kind: 'paper', title: cut(r.title, 200), authors: cut(r.authorString || 'Unknown', 60), year: String(r.pubYear || ''), venue: r.journalTitle || r.source || 'Europe PMC', doi: r.doi || '', url: r.doi ? 'https://doi.org/' + r.doi : 'https://europepmc.org/article/' + r.source + '/' + r.id, meta: (r.citedByCount ? r.citedByCount + ' citations' : '') + (r.isOpenAccess === 'Y' ? ' · open access' : '') }));
}
export async function pubchem(q) {
  const props = 'MolecularFormula,MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,IUPACName';
  const d = await getJSON('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/' + enc(q) + '/property/' + props + '/JSON');
  const p = d && d.PropertyTable && d.PropertyTable.Properties && d.PropertyTable.Properties[0]; if (!p) return [];
  let smiles = ''; for (const k of ['SMILES', 'CanonicalSMILES']) { try { const s = await getJSON('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + p.CID + '/property/' + k + '/JSON'); const v = s && s.PropertyTable && s.PropertyTable.Properties[0]; smiles = v && (v.SMILES || v.CanonicalSMILES || v.ConnectivitySMILES) || ''; if (smiles) break; } catch (e) {} }
  const mw = +p.MolecularWeight, fails = [mw > 500 && 'MW > 500', p.XLogP > 5 && 'XLogP > 5', p.HBondDonorCount > 5 && 'H-bond donors > 5', p.HBondAcceptorCount > 10 && 'H-bond acceptors > 10'].filter(Boolean), veber = (p.TPSA ?? 0) <= 140 && (p.RotatableBondCount ?? 0) <= 10;
  return [{ src: 'pubchem', kind: 'molecule', title: q[0].toUpperCase() + q.slice(1) + ' · ' + p.MolecularFormula + ' · ' + mw.toFixed(1) + ' g/mol', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/' + p.CID, meta: 'CID ' + p.CID + ' · Lipinski ' + (fails.length ? 'fails ' + fails.join(', ') : 'pass') + ' · Veber ' + (veber ? 'pass' : 'fail'), detail: [p.IUPACName && 'IUPAC: ' + p.IUPACName, smiles && 'SMILES: ' + smiles, 'XLogP ' + (p.XLogP ?? '?') + ', TPSA ' + (p.TPSA ?? '?') + ' Å², HBD ' + p.HBondDonorCount + ', HBA ' + p.HBondAcceptorCount + ', rotatable bonds ' + p.RotatableBondCount].filter(Boolean).join('. '), data: { ...p, smiles, lipinskiFails: fails.length } }];
}
export async function uniprot(q, n = 2) {
  const d = await getJSON('https://rest.uniprot.org/uniprotkb/search?format=json&size=' + n + '&fields=accession,protein_name,gene_names,organism_name,length,cc_function&query=' + enc('(' + q + ') AND (reviewed:true)'));
  return ((d && d.results) || []).map(r => { const name = (r.proteinDescription && r.proteinDescription.recommendedName && r.proteinDescription.recommendedName.fullName.value) || r.primaryAccession, gene = r.genes && r.genes[0] && r.genes[0].geneName ? r.genes[0].geneName.value : '', fn = (r.comments || []).find(c => c.commentType === 'FUNCTION'), fnText = fn && fn.texts && fn.texts[0] ? fn.texts[0].value : '';
    return { src: 'uniprot', kind: 'protein', title: (gene ? gene + ' · ' : '') + name, acc: r.primaryAccession, url: 'https://www.uniprot.org/uniprotkb/' + r.primaryAccession, meta: r.primaryAccession + ' · ' + (r.organism ? r.organism.scientificName : '') + ' · ' + (r.sequence ? r.sequence.length : '?') + ' aa', detail: cut(fnText, 600) }; });
}
export async function alphafold(acc) {
  const d = await getJSON('https://alphafold.ebi.ac.uk/api/prediction/' + enc(acc)); const r = Array.isArray(d) ? d[0] : null; if (!r) return [];
  const pl = r.globalMetricValue != null ? +r.globalMetricValue : null;
  return [{ src: 'alphafold', kind: 'structure', title: 'AlphaFold model ' + r.entryId + (r.latestVersion ? ' v' + r.latestVersion : ''), url: 'https://alphafold.ebi.ac.uk/entry/' + acc, meta: (pl != null ? 'mean pLDDT ' + pl.toFixed(1) + (pl >= 90 ? ' (very high)' : pl >= 70 ? ' (confident)' : pl >= 50 ? ' (low)' : ' (very low)') : 'no confidence score') + ' · predicted, not experimental', detail: 'Predicted structure for ' + (r.uniprotDescription || acc) + '. Model file: ' + (r.pdbUrl || r.cifUrl || 'see entry') + '.', data: { plddt: pl } }];
}
export async function pdb(q, n = 3) {
  const d = await getJSON('https://search.rcsb.org/rcsbsearch/v2/query', { body: { query: { type: 'terminal', service: 'full_text', parameters: { value: q } }, return_type: 'entry', request_options: { paginate: { start: 0, rows: n } } } });
  const ids = ((d && d.result_set) || []).map(r => r.identifier), out = [];
  for (const id of ids) { let t = null; try { t = await getJSON('https://data.rcsb.org/rest/v1/core/entry/' + id); } catch (e) {} const res = t && t.rcsb_entry_info && t.rcsb_entry_info.resolution_combined; out.push({ src: 'pdb', kind: 'structure', title: 'PDB ' + id + (t && t.struct ? ' · ' + cut(t.struct.title, 90) : ''), url: 'https://www.rcsb.org/structure/' + id, meta: (t && t.exptl && t.exptl[0] ? t.exptl[0].method.toLowerCase() : 'experimental') + (res ? ' · ' + res[0] + ' Å' : ''), year: t && t.rcsb_accession_info ? String(t.rcsb_accession_info.initial_release_date || '').slice(0, 4) : '' }); }
  return out;
}
async function viaMcp(conn, AG, re, q) {
  const tools = (conn && conn.tools) || [], tool = tools.find(t => re.test(t.name + ' ' + (t.description || ''))); if (!tool) return null;
  const props = (tool.inputSchema && tool.inputSchema.properties) || {}, key = Object.keys(props).find(k => /query|q|input|text|expr|url/i.test(k)) || Object.keys(props)[0] || 'query';
  const r = await AG.mcpCall(conn, tool.name, { [key]: q }); const txt = (typeof r === 'string' ? r : r && r.content ? r.content.map(c => c.text || '').join('\n') : r && r.text ? r.text : JSON.stringify(r || '')).trim();
  return txt ? [{ src: 'mcp', kind: 'tool', title: tool.name + ': ' + cut(q, 60), meta: 'via MCP · ' + tool.name, detail: cut(txt, 900) }] : [];
}

// What a thought is about, from its words. Decides which sources make sense.
const RX = { protein: /\b(protein|receptor|enzyme|kinase|protease|channel|transporter|antibod\w*|gene|target|[A-Z][A-Z0-9]{2,6}\d?\b|domain|subunit|ligase|synthase|polymerase)\b/, molecule: /\b(compound|molecule|ligand|inhibitor|agonist|antagonist|drug|smiles|scaffold|analog\w*|salt|acid|amine|ester|\w+(ine|ide|ol|ate|one|ib|mab|vir|cin|mycin|pril|sartan|statin))\b/i, mechanism: /\b(bind\w*|pocket|site|pathway|mechanism|allosteric|covalent|selectiv\w*|conformation|fold\w*|docking)\b/i, measure: /\b(ic50|ki|kd|ec50|yield|solubility|logp|assay|potency|toxicity|half-life|pka|energy|enthalpy|rate)\b/i };
export function kindOf(n) { const t = (n.label || '') + ' ' + (n.detail || ''), k = []; if (RX.protein.test(t)) k.push('protein'); if (RX.molecule.test(t)) k.push('molecule'); if (RX.mechanism.test(t)) k.push('mechanism'); if (RX.measure.test(t)) k.push('measure'); return k.length ? k : ['general']; }
export function sourcesFor(n, enabled) {
  const k = kindOf(n), s = ['pubmed', 'europepmc'];
  if (k.includes('protein')) s.push('uniprot', 'pdb');
  if (k.includes('molecule') || k.includes('measure')) s.push('pubchem');
  if (k.includes('measure')) s.push('wolfram');
  if (k.includes('mechanism')) s.push('pdb');
  s.push('web');
  return [...new Set(s)].filter(x => enabled[x] !== false);
}
// Queries: entity words first (gene names, mutations, compounds), then at most two other content words.
// Databases (UniProt, PDB, PubChem) get entity words only; literature gets a short phrase.
const STOP = /^(the|a|an|of|to|in|on|for|and|or|with|what|which|how|why|could|would|does|is|are|be|this|that|it|its|we|our|new|selective|needs|case|precedent|world|checked|against|idea|thing|way|ways|better|good|nothing|about|until|whoever|serves|worst|sits|inside|larger|system|pushes|core|problem|under|not|can|fix|unit|read|as|design|make|find|first|one|two)$/i;
const words = s => String(s || '').replace(/\s*[—–]\s*.*$/, '').replace(/,\s*read as.*$/i, '').replace(/[?!.,;:"“”()]/g, ' ').split(/\s+/).filter(Boolean);
const COMMON = /^(someone|anyone|everyone|none|done|alone|phone|zone|tone|online|offline|bone|stone|gone|ate|late|state|rate|date|create|data|update|role|whole|control|tool|pool|school|side|wide|inside|outside|guide|provide|decide|machine|line|online|define|mine|fine|time|combine|engine|routine|medicine|baseline|pipeline|timeline|deadline|online)$/i;
const isEntity = w => /[A-Z]{2,}|\d/.test(w) || (w.length > 4 && !COMMON.test(w) && RX.molecule.test(w));
export function queryFor(g, n, src) {
  const c = n.chem || {}; if (c.queue && c.queue.length) return c.queue[0];
  const seedE = words(g.seed).filter(isEntity), own = words(n.root ? g.seed : n.label), ent = [...new Set([...own.filter(isEntity), ...seedE])], gen = own.filter(w => !isEntity(w) && !STOP.test(w) && w.length > 3);
  if (src === 'uniprot') { const gene = ent.find(w => /^[A-Z][A-Z0-9]{1,7}$/.test(w) && !/^[A-Z]\d+[A-Z]$/.test(w)); return gene || ent.filter(w => !/^[A-Z]\d+[A-Z]$/.test(w))[0] || gen.slice(0, 2).join(' ') || g.seed; }
  if (src === 'pdb' || src === 'pubchem' || src === 'wolfram') return ent.slice(0, 3).join(' ') || gen.slice(0, 3).join(' ') || g.seed;
  return [...ent.slice(0, 4), ...gen.slice(0, 2)].join(' ') || g.seed;
}
export function broader(g, n) { return [...new Set(words(g.seed).filter(isEntity))].slice(0, 3).join(' '); }

// Which (thought, source) pairs to run next. Each pair is scored by its learned value plus an exploration
// term that shrinks with visits, weighted by a prior (uncertain, central, never-researched thoughts first).
export function plan(g, E, cfg, k, enabled) {
  const L = Lr.learnState(g), N = g.nodes.filter(n => !n.members && !n.dormant), now = Date.now(); if (!N.length) return [];
  const total = Object.values(L.n).reduce((t, r) => t + Object.values(r).reduce((a, b) => a + b, 0), 0) + 1, cand = [];
  for (const n of N) {
    const c = n.chem || {}, stale = c.at ? Math.min(1, (now - c.at) / 600000) : 1, unc = 1 - (n.g ?? 0.5), prior = 0.25 + 0.45 * unc + 0.2 * stale + (n.root ? (c.runs ? 0.1 : 0.8) : 0) + Math.min(0.2, (n.deg || 0) * 0.03) + (c.queue && c.queue.length ? 0.25 : 0) - (c.runs || 0) * 0.08;
    if (c.busy || (c.at && now - c.at < 120000 && !(c.queue && c.queue.length))) continue;
    const s = Lr.stateOf(g, n, E);
    for (const src of sourcesFor(n, enabled)) { const a = 'r:' + src, q = (L.q[s] && L.q[s][a]) || 0, v = (L.n[s] && L.n[s][a]) || 0; cand.push({ n, src, s, a, score: q + (cfg.ucb ?? 0.6) * prior * Math.sqrt(total) / (1 + v), prior }); }
  }
  cand.sort((x, y) => y.score - x.score);
  const out = [], used = new Set();
  for (const c of cand) { if (used.has(c.n.id)) continue; const pair = cand.filter(d => d.n === c.n).slice(0, 2); out.push({ node: c.n, srcs: pair.map(p => p.src), states: pair, score: c.score }); used.add(c.n.id); if (out.length >= k) break; }
  return out;
}

async function runSource(src, q, n, ctx) {
  const S = SOURCES[src];
  if (S.mcp) { if (!ctx.mcp) return { items: [], skip: 'needs an MCP tool' }; const r = await viaMcp(ctx.mcp, ctx.AG, S.mcp, q); return r ? { items: r } : { items: [], skip: 'no matching MCP tool' }; }
  if (src === 'pubmed') return { items: await pubmed(q) };
  if (src === 'europepmc') return { items: await europepmc(q) };
  if (src === 'pubchem') { const words = q.split(' ').filter(w => RX.molecule.test(w)); let items = []; for (const w of (words.length ? words : [q]).slice(0, 2)) { try { items = items.concat(await pubchem(w)); } catch (e) {} } return { items }; }
  if (src === 'uniprot') { let items = []; try { items = await uniprot(q + ' AND (organism_id:9606)'); } catch (e) {} if (!items.length) items = await uniprot(q); const exact = items.filter(it => it.title.split(' · ')[0].toUpperCase() === q.toUpperCase()); if (exact.length) items = exact; for (const it of items.slice(0, 1)) { try { const af = await alphafold(it.acc); if (af.length) { it.af = af[0]; } } catch (e) {} } return { items }; }
  if (src === 'pdb') return { items: await pdb(q) };
  return { items: [] };
}

// One agent: research one thought from up to two sources, attach evidence, add what it found,
// then think about it (Claude when Live AI is on) and queue follow-up queries for re-research.
async function agent(g, E, job, ctx, idx) {
  const n = job.node, say = t => ctx.log({ agent: idx + 1, text: t }), q = queryFor(g, n, 'pubmed'), c = n.chem = n.chem || { runs: 0, found: 0, queue: [] };
  c.busy = true; const g0 = n.g ?? 0.5; let found = 0, added = 0;
  const qs = job.srcs.map(s => queryFor(g, n, s));
  say('Researching "' + E.short(n.label, 48) + '" · ' + job.srcs.map((s, i) => SOURCES[s].label + ' "' + qs[i] + '"').join(' + '));
  try {
    const res = await Promise.allSettled(job.srcs.map((s, i) => runSource(s, qs[i], n, ctx)));
    for (let i = 0; i < res.length; i++) {
      const src = job.srcs[i], r = res[i], st = job.states[i];
      if (r.status === 'rejected') { say(SOURCES[src].label + ' failed: ' + r.reason.message); if (st) Lr.rewardNow(g, st.s, st.a, -0.2, st.s, ctx.cfg, SOURCES[src].label); continue; }
      if (r.value.skip) { say(SOURCES[src].label + ' skipped: ' + r.value.skip); continue; }
      const items = r.value.items || []; let hits = 0;
      for (const it of items) {
        if (!g.byId.has(n.id)) break;
        if (it.kind === 'paper') { E.attachPaper(g, n.id, { authors: it.authors, year: it.year || 'n.d.', title: it.title, venue: it.venue, doi: it.doi }); hits++; continue; }
        const label = E.short(it.title, 72); if (g.nodes.some(m => m.label.trim().toLowerCase() === label.trim().toLowerCase())) continue;
        const m = E.addNodeRaw(g, { label, detail: [it.meta, it.detail, it.af ? it.af.title + ': ' + it.af.meta + '. ' + it.af.url : '', it.url].filter(Boolean).join('. '), plane: it.kind === 'tool' ? 'concepts' : 'facts', g: it.kind === 'structure' && /predicted/.test(it.meta || '') ? 0.6 : 0.8, parent: n.id, via: SOURCES[src] ? SOURCES[src].label : 'MCP', evidence: [{ src: (SOURCES[src] ? SOURCES[src].label : 'MCP') + ' · ' + (it.meta || '') + (it.url ? ' · ' + it.url : ''), year: it.year || String(new Date().getFullYear()) }] });
        E.addEdgeRaw(g, n.id, m.id, 20, 'expands'); const ed = g.edges[g.edges.length - 1]; if (ed) ed.relation = it.kind === 'molecule' ? 'candidate for' : it.kind === 'protein' ? 'targets' : it.kind === 'structure' ? 'structure of' : 'evidence for';
        if (it.kind === 'molecule' && it.data) m.mol = { smiles: it.data.smiles || '', cid: it.data.CID || null };
        hits++; added++;
        if (it.kind === 'protein') (m.chem = { queue: [it.title.split(' · ')[0] + ' inhibitor', it.title.split(' · ')[0] + ' binding site structure'], runs: 0, found: 0 });
      }
      found += hits; if (hits) say(SOURCES[src].label + ': ' + hits + ' result' + (hits > 1 ? 's' : ''));
      else say(SOURCES[src].label + ': nothing for "' + qs[i] + '"');
      if (st) Lr.rewardNow(g, st.s, st.a, hits ? Math.min(1.2, 0.3 + 0.2 * hits) : -0.15, Lr.stateOf(g, n, E), ctx.cfg, SOURCES[src].label);
    }
    if (c.queue && c.queue[0] === q) c.queue.shift();
    if (ctx.live && g.byId.has(n.id)) { try { await think(g, E, n, ctx, say); } catch (e) { say('Thinking failed: ' + e.message); } }
    else if (g.byId.has(n.id) && !found) { const bq = broader(g, n); if (bq && bq !== q && !c.queue.includes(bq) && (c.runs || 0) < 3) { c.queue.push(bq); say('Queued a broader query for later: "' + bq + '"'); } }
  } finally { c.busy = false; c.runs = (c.runs || 0) + 1; c.at = Date.now(); c.found = (c.found || 0) + found; }
  return { found, added, dg: (n.g ?? 0.5) - g0 };
}

async function think(g, E, n, ctx, say) {
  if (typeof window === 'undefined' || !window.claude || !window.claude.complete) return;
  const ev = (n.evidence || []).slice(-8).map(e => '- ' + e.src).join('\n'), kids = E.neighborsOf(g, n.id).slice(0, 10).map(m => '- ' + m.label + (m.detail ? ' (' + E.short(m.detail, 120) + ')' : '')).join('\n');
  const prompt = 'You are a medicinal chemistry and structural biology research assistant inside a discovery graph about "' + g.seed + '".\nThought: "' + n.label + '"\n' + (n.detail ? 'Detail: ' + E.short(n.detail, 400) + '\n' : '') + 'Evidence attached:\n' + (ev || '- none yet') + '\nConnected thoughts:\n' + (kids || '- none') + '\n\nThink step by step, then reply with JSON only:\n{"reasoning":"two or three sentences","hypotheses":[{"label":"a testable hypothesis, max 14 words","test":"the experiment or computation that would test it","confidence":0.0}],"queries":["a precise literature or database query to run next"]}\nAt most 2 hypotheses and 2 queries. Use only names that appear above or are standard; do not invent measurements.';
  say('Thinking about what this means…');
  const raw = await window.claude.complete(prompt), m = String(raw || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
  const j = JSON.parse(m[0]); if (j.reasoning) say('Thinks: ' + E.short(j.reasoning, 220));
  for (const h of (j.hypotheses || []).slice(0, 2)) { if (!h || !h.label) continue; const x = E.addNodeRaw(g, { label: E.short(h.label, 90), detail: 'Hypothesis. Test: ' + (h.test || 'not given') + '. Proposed by Claude from the evidence on "' + E.short(n.label, 60) + '"; not yet checked.', plane: 'wild', g: Math.max(0.1, Math.min(0.45, +h.confidence || 0.3)), parent: n.id, via: 'Claude · hypothesis' }); E.addEdgeRaw(g, n.id, x.id, 37, 'expands'); const ed = g.edges[g.edges.length - 1]; if (ed) ed.relation = 'suggests'; x.chem = { queue: [], runs: 0, found: 0 }; }
  const c = n.chem; for (const q of (j.queries || []).slice(0, 2)) if (q && !c.queue.includes(q)) c.queue.push(String(q).slice(0, 120));
  if ((j.queries || []).length) say('Queued ' + Math.min(2, j.queries.length) + ' follow-up quer' + (j.queries.length > 1 ? 'ies' : 'y'));
}

// Run k agents in parallel on the k best (thought, source) pairs.
export async function swarm(g, E, o) {
  const k = Math.max(1, Math.min(8, o.agents || 3)), jobs = plan(g, E, o.cfg || {}, k, o.enabled || {});
  if (!jobs.length) { o.log({ agent: 0, text: 'Nothing to research right now' }); return { jobs: 0, found: 0, added: 0 }; }
  o.log({ agent: 0, text: 'Round · ' + jobs.length + ' agent' + (jobs.length > 1 ? 's' : '') + ' in parallel' });
  const res = await Promise.allSettled(jobs.map((j, i) => agent(g, E, j, o, i)));
  let found = 0, added = 0; for (const r of res) if (r.status === 'fulfilled') { found += r.value.found; added += r.value.added; } else o.log({ agent: 0, text: 'An agent stopped: ' + (r.reason && r.reason.message) });
  return { jobs: jobs.length, found, added };
}
