/* Saltline Agency — the agent that runs Saltline.
   Skills: audit the code graph, run every self-test, check device fit, improve code behind test gates (its own code included),
   gather grounded competitor facts, write source-checked journal posts, and run research experiments.
   Every run is logged to a ledger and an agency graph; a bandit policy learns which skills pay off. Loaded through suite-patch,
   so accepted patches to this file change the agent on next load. */
import * as C from './suite-core.js';
import * as P from './suite-patch.js';
export const AG = { version: '1.4.0', name: 'Saltline Agency' };
const S = { get: (k, d) => C.db.get('agency.' + k, d), set: (k, v) => C.db.set('agency.' + k, v) };
const MODS = {}, mod = async n => MODS[n] || (MODS[n] = await P.load(n));
const getJ = async (u, ms = 20000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); } finally { clearTimeout(t); } };
export const SKILLS = {
  audit: { label: 'Audit code graph', icon: 'ph-graph', desc: 'Crawl every file, rebuild the code graph, score risk, list defects.' },
  test: { label: 'Run self-tests', icon: 'ph-flask', desc: 'Engine, hazards, code graph, agent and learned tests.' },
  devices: { label: 'Device fit', icon: 'ph-devices', desc: 'Load pages at phone, tablet and desktop widths; measure overflow, tiny text and tap targets.' },
  improve: { label: 'Improve code', icon: 'ph-magic-wand', desc: 'Write a missing test or a test-gated patch for the riskiest function, including the agent itself.' },
  intel: { label: 'Competitor intel', icon: 'ph-binoculars', desc: 'Pull sourced company facts from Wikidata and record what changed.' },
  write: { label: 'Write a post', icon: 'ph-article', desc: 'Draft a journal post from live sources, then check every number against them.' },
  research: { label: 'Fire-zone experiment', icon: 'ph-fire', desc: 'Forecast fire-prone cells from dryness and burn history; backtest against held-out years.' },
};

/* ---------- memory: ledger, agency graph, policy ---------- */
export const ledger = () => S.get('ledger', []);
function note(e) { const L = ledger(); L.unshift({ t: Date.now(), ...e }); S.set('ledger', L.slice(0, 250)); try { C.emit('agency', { skill: e.skill, ok: e.ok }); } catch (x) {} }
export const graph = () => S.get('graph', { nodes: [], edges: [] });
export function remember(nodes, edges = []) {
  const g = graph(), at = new Map(g.nodes.map((n, i) => [n.id, i]));
  for (const n of nodes) { if (at.has(n.id)) g.nodes[at.get(n.id)] = { ...g.nodes[at.get(n.id)], ...n }; else { at.set(n.id, g.nodes.length); g.nodes.push({ t: Date.now(), ...n }); } }
  const ek = new Set(g.edges.map(e => e.a + '>' + e.b)); for (const e of edges) if (!ek.has(e.a + '>' + e.b)) { ek.add(e.a + '>' + e.b); g.edges.push(e); }
  if (g.nodes.length > 420) { const keep = new Set(g.nodes.filter(n => n.type === 'skill' || n.type === 'source').map(n => n.id).concat(g.nodes.slice(-360).map(n => n.id))); g.nodes = g.nodes.filter(n => keep.has(n.id)); g.edges = g.edges.filter(e => keep.has(e.a) && keep.has(e.b)); }
  S.set('graph', g);
}
export function policy() { const p = S.get('policy', {}); for (const k of Object.keys(SKILLS)) p[k] = p[k] || { q: .5, n: 0, last: 0, ok: 0 }; return p; }
function reward(skill, r, ok) { const p = policy(), x = p[skill]; x.n++; x.ok += ok ? 1 : 0; x.q += (Math.max(0, Math.min(1, r)) - x.q) / Math.min(x.n, 8); x.last = Date.now(); S.set('policy', p); }
export function plan(k = 2, now = Date.now()) { const p = policy(); return Object.keys(SKILLS).filter(s => s !== 'audit' && s !== 'test').map(s => [s, .55 * p[s].q + .45 * Math.min(1, (now - p[s].last) / 216e5) + (Math.random() < .12 ? .4 : 0)]).sort((a, b) => b[1] - a[1]).slice(0, k).map(x => x[0]); }
async function run(skill, fn, on) {
  const t0 = performance.now(); on && on(SKILLS[skill].label + '…');
  try { const r = await fn(on); const ms = Math.round(performance.now() - t0); note({ skill, ok: r.ok !== false, summary: r.summary, ms }); reward(skill, r.reward ?? 1, r.ok !== false); remember([{ id: 'skill:' + skill, type: 'skill', label: SKILLS[skill].label }, ...(r.nodes || [])], (r.nodes || []).filter(n => n.type !== 'source').map(n => ({ a: 'skill:' + skill, b: n.id })).concat(r.edges || [])); return r; }
  catch (e) { note({ skill, ok: false, summary: 'Failed: ' + e.message, ms: Math.round(performance.now() - t0) }); reward(skill, 0, false); return { ok: false, summary: e.message }; }
}

/* ---------- audit + tests ---------- */
let LAST = null;
export const lastAudit = () => S.get('audit', null);
async function doAudit(on) {
  const G = await mod('suite-codegraph.js'), cr = await G.crawl({ onProgress: (n, p) => on && on(`Reading ${p} · ${n} files`) });
  const g = G.analyze(cr.files, { tests: (S.get('tests', null) || {}).items || [], missing: cr.missing, e2e: S.get('e2e', []), patches: P.list() }); LAST = g;
  S.set('audit', { t: g.t, metrics: g.metrics, findings: g.findings.slice(0, 160), risky: g.fns.slice().sort((a, b) => b.risk - a.risk).slice(0, 40).map(f => ({ id: f.id, label: f.label, file: f.file, line: f.line, cc: f.cc, loc: f.loc, fanIn: f.fanIn, tested: f.tested, risk: f.risk })), files: g.files.map(f => ({ path: f.path, kind: f.kind, loc: f.loc, fns: f.fns, findings: f.findings, imports: f.imports, links: f.links })) });
  const m = g.metrics; return { summary: `${m.files} files · ${m.fns} functions · ${m.calls} calls · ${m.high} high, ${m.med} medium findings`, reward: 1 - Math.min(1, (m.high * 3 + m.med) / 60), nodes: [{ id: 'audit:' + g.t, type: 'run', label: `Audit · ${m.high}/${m.med}/${m.low}` }] };
}
export const learned = () => S.get('learned', []);
async function runLearned(file, M) { const out = []; for (const t of learned().filter(x => x.file === file)) { const t0 = performance.now(); try { const f = new Function('M', 'A', '"use strict"; return (async () => {\n' + t.code + '\n})();'); const d = await f(M, (c, m) => { if (!c) throw new Error(m || 'assertion failed'); }); out.push({ name: t.name, module: file, fn: t.fn, ok: true, detail: String(d ?? 'ok') + ' · learned', ms: +(performance.now() - t0).toFixed(1) }); } catch (e) { out.push({ name: t.name, module: file, fn: t.fn, ok: false, detail: e.message + ' · learned', ms: 0 }); } } return out; }
export const TESTED = ['suite-core.js', 'suite-hazards.js', 'suite-codegraph.js', 'suite-agent.js'];
async function doTest(on) {
  let items = [];
  for (const f of TESTED) { on && on('Testing ' + f); try { const M = f === 'suite-agent.js' ? await import('./suite-agent.js').catch(() => ({ selfTests })) : await mod(f); const r = await (M.selfTests || selfTests)(); items = items.concat(r.items, await runLearned(f, M)); } catch (e) { items.push({ name: f + ' loads', module: f, fn: 'import', ok: false, detail: e.message, ms: 0 }); } }
  const passed = items.filter(i => i.ok).length, res = { t: Date.now(), items, total: items.length, passed, pass: passed === items.length, version: C.SUITE.version };
  S.set('tests', res); C.db.set('selftests', res); try { C.emit('selftest', { passed, total: items.length }); } catch (e) {}
  return { ok: res.pass, summary: `${passed}/${items.length} assertions pass`, reward: passed / Math.max(1, items.length), nodes: [{ id: 'tests:' + res.t, type: 'run', label: `Tests · ${passed}/${items.length}` }] };
}

/* ---------- device fit + stretch ---------- */
export const DEVICES = [['Phone', 360], ['Tablet', 768], ['Desktop', 1440]];
export const FIT_PAGES = ['Command Center.html', 'Observatory.dc.html', 'Market.dc.html', 'Dossier.html', 'Onboarding.html', 'Tester.html'];
async function doDevices(on) {
  const base = new URL('.', document.baseURI).href, out = [];
  for (const page of FIT_PAGES) { let html; try { html = await fetch(new URL(page, base).href, { cache: 'no-store' }).then(r => r.text()); } catch (e) { continue; }
    for (const [dev, W] of DEVICES) { on && on(`${page} at ${W}px`); const fr = document.createElement('iframe'); fr.style.cssText = `position:fixed;left:-40000px;top:0;width:${W}px;height:900px;border:0;opacity:0;pointer-events:none`; const ld = new Promise(r => { fr.onload = r; setTimeout(r, 12000); }); fr.srcdoc = html.replace(/<head[^>]*>/i, m => m + `<base href="${base}">`); document.body.appendChild(fr); await ld; await new Promise(r => setTimeout(r, 2600));
      try { const d = fr.contentDocument, w = fr.contentWindow, sw = d.documentElement.scrollWidth; let text = 0, small = 0, tap = 0; for (const el of [...d.body.querySelectorAll('*')].slice(0, 2500)) { if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; text++; if (parseFloat(w.getComputedStyle(el).fontSize) < 11) small++; } if (W <= 400) for (const el of d.querySelectorAll('button,input,select,[role=button],nav a')) { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.height < 28 || r.width < 28)) tap++; } out.push({ page, dev, W, overflow: Math.max(0, sw - W), small, text, tap, ok: sw <= W + 2 && small / Math.max(1, text) < .2 }); }
      catch (e) { out.push({ page, dev, W, ok: false, err: e.message }); } fr.remove(); } }
  S.set('devices', { t: Date.now(), rows: out }); const ok = out.filter(r => r.ok).length;
  return { ok: ok === out.length, summary: `${ok}/${out.length} page × device checks pass`, reward: ok / Math.max(1, out.length), nodes: [{ id: 'devices:' + Date.now(), type: 'run', label: `Device fit · ${ok}/${out.length}` }] };
}

/* ---------- improve: learned tests first, then test-gated patches ---------- */
async function doImprove(on) {
  if (!C.hasClaude()) return { ok: false, summary: 'Claude is not available in this browser, so no code was changed.', reward: .2 };
  const G = await mod('suite-codegraph.js'); if (!LAST) await doAudit(on);
  const tried = S.get('tried', {}), fresh = id => !tried[id] || Date.now() - tried[id] > 864e5;
  const cand = LAST.fns.filter(f => TESTED.includes(f.file) && f.kind !== 'class' && f.loc >= 3 && f.loc <= 90 && fresh(f.id)).sort((a, b) => b.risk - a.risk);
  const fn = cand[0]; if (!fn) return { summary: 'Nothing eligible to improve right now.', reward: .5 };
  tried[fn.id] = Date.now(); S.set('tried', tried);
  const file = fn.file, orig = await fetch(new URL(file, document.baseURI).href, { cache: 'no-store' }).then(r => r.text()), covered = fn.tested || learned().some(t => t.file === file && t.fn === fn.label);
  if (!covered) {
    on && on(`Writing a test for ${fn.label}()`);
    const reply = await C.llm('You write one self-test for a JavaScript function in a browser ES module. The module namespace is available as M and an assert function as A(condition, message). Reply with ONLY the body of an async function: plain JavaScript statements that call M.' + fn.label + ' with concrete inputs, assert the results with A(...), and finally return a short string describing what was checked. No imports, no network calls, no DOM.', `File: ${file}\nExported: ${fn.exported}\nSOURCE\n${fn.src}`, 900);
    const code = String(reply).replace(/^```(?:js|javascript)?\s*|\s*```$/g, '').trim(), M = await mod(file), probe = { file, fn: fn.label, name: `${fn.label}() behaves as written (learned)`, code, t: Date.now() };
    if (!fn.exported) return { ok: false, summary: `${fn.label}() is not exported, so a test cannot reach it.`, reward: .2 };
    S.set('learned', learned().concat([probe])); const r = await runLearned(file, M); const mine = r.find(x => x.name === probe.name);
    if (!mine || !mine.ok) { S.set('learned', learned().filter(t => t !== probe && !(t.name === probe.name && t.t === probe.t))); return { ok: false, summary: `Discarded a test for ${fn.label}(): it failed against the current code (${mine ? mine.detail : 'no result'}).`, reward: .25 }; }
    return { summary: `Learned a new test for ${fn.label}() in ${file}: ${mine.detail}`, reward: .8, nodes: [{ id: 'test:' + file + ':' + fn.label, type: 'test', label: `Test · ${fn.label}()` }], edges: [{ a: 'test:' + file + ':' + fn.label, b: 'code:' + file }] };
  }
  on && on(`Drafting a patch for ${fn.label}()`);
  const { system, user } = G.improvePrompt(fn, file, (LAST.findings || []).filter(f => f.fn === fn.id)), imp = G.parseImprovement(await C.llm(system, user, 2200));
  const next = G.replaceRange(orig, fn.start, fn.end, imp.code);
  if (G.exportsOf(next).join() !== G.exportsOf(orig).join()) return { ok: false, summary: `Rejected patch for ${fn.label}(): it changed the module's exports.`, reward: .2 };
  let M2; try { M2 = await P.importSource(next); } catch (e) { return { ok: false, summary: `Rejected patch for ${fn.label}(): it does not load (${e.message}).`, reward: .1 }; }
  on && on(`Testing the patch for ${fn.label}()`);
  const base = M2.selfTests ? await M2.selfTests() : { items: [] }, items = base.items.concat(await runLearned(file, M2)), bad = items.filter(i => !i.ok);
  if (!items.length || bad.length) return { ok: false, summary: `Rejected patch for ${fn.label}(): ${bad.length ? bad.length + ' test' + (bad.length > 1 ? 's' : '') + ' failed (' + bad[0].name + ')' : 'no tests ran'}.`, reward: .3 };
  const G2 = M2.analyze ? M2 : G, before = G.parseJS(fn.src).fns[0] || { cc: fn.cc }, after = G2.parseJS(imp.code).fns[0] || { cc: before.cc };
  P.set(file, { src: next, base: P.fnv(orig), t: Date.now(), fn: fn.label, fnId: fn.id, why: imp.why, tests: `${items.length}/${items.length}`, cc: [before.cc, after.cc] }); MODS[file] = null;
  return { summary: `Applied a patch to ${fn.label}() in ${file}; ${items.length}/${items.length} tests pass, complexity ${before.cc} → ${after.cc}.${file === 'suite-agent.js' ? ' The agent improved its own code.' : ''}`, reward: 1, nodes: [{ id: 'patch:' + file + ':' + fn.label, type: 'patch', label: `Patch · ${fn.label}()` }, { id: 'code:' + file, type: 'source', label: file }], edges: [{ a: 'patch:' + file + ':' + fn.label, b: 'code:' + file }] };
}

/* ---------- competitor intelligence (Wikidata, sourced) ---------- */
export const COMPETITORS = ['Environmental Resources Management', 'WSP Global', 'AECOM', 'Jacobs Solutions', 'Ramboll', 'Arcadis', 'Tetra Tech', 'Stantec', 'SLR Consulting', 'Mott MacDonald', 'Sphera Solutions', 'Cority', 'Planet Labs', 'Dataminr', 'Jupiter Intelligence'];
const CUR = { Q4917: 'USD', Q4916: 'EUR', Q25224: 'GBP', Q1104069: 'CAD', Q259502: 'AUD', Q25417: 'DKK', Q122922: 'SEK', Q132643: 'NOK', Q25344: 'CHF', Q8146: 'JPY' };
export const pickEntity = (results, name) => (results || []).find(r => /compan|consult|firm|business|engineer|software|corporat|provider|group|service/i.test(r.description || '')) || (results || []).find(r => (r.label || '').toLowerCase() === name.toLowerCase()) || null;
export function latestClaim(claims, p) { const cs = (claims && claims[p]) || []; if (!cs.length) return null; const when = c => { const q = c.qualifiers && c.qualifiers.P585; return q && q[0].datavalue ? Date.parse(q[0].datavalue.value.time.replace(/^\+/, '').replace(/-00/g, '-01')) || 0 : 0; }; const pref = cs.filter(c => c.rank === 'preferred'); const pool = pref.length ? pref : cs.filter(c => c.rank !== 'deprecated'); return pool.slice().sort((a, b) => when(b) - when(a))[0] || null; }
const val = c => c && c.mainsnak && c.mainsnak.datavalue ? c.mainsnak.datavalue.value : null;
const yearOf = c => { const q = c && c.qualifiers && c.qualifiers.P585; return q && q[0].datavalue ? q[0].datavalue.value.time.slice(1, 5) : null; };
async function doIntel(on) {
  const W = 'https://www.wikidata.org/w/api.php?format=json&origin=*', found = [];
  for (const name of COMPETITORS) { on && on('Looking up ' + name); try { const r = await getJ(`${W}&action=wbsearchentities&language=en&limit=4&search=${encodeURIComponent(name)}`); const e = pickEntity(r.search, name); if (e) found.push({ name, id: e.id, label: e.label, desc: e.description || '' }); } catch (e) {} }
  if (!found.length) throw new Error('Wikidata did not respond');
  const ents = (await getJ(`${W}&action=wbgetentities&props=claims|labels&languages=en&ids=${found.map(f => f.id).join('|')}`)).entities || {}, refs = new Set();
  const rows = found.map(f => { const cl = (ents[f.id] || {}).claims || {}, emp = latestClaim(cl, 'P1128'), rev = latestClaim(cl, 'P2139'), hq = latestClaim(cl, 'P159'), inc = latestClaim(cl, 'P571'), web = latestClaim(cl, 'P856'), par = latestClaim(cl, 'P749') || latestClaim(cl, 'P127'); [hq, par].forEach(c => { const v = val(c); if (v && v.id) refs.add(v.id); }); const rv = val(rev); return { ...f, url: 'https://www.wikidata.org/wiki/' + f.id, employees: val(emp) ? +val(emp).amount : null, empYear: yearOf(emp), revenue: rv ? +rv.amount : null, revUnit: rv ? CUR[String(rv.unit).split('/').pop()] || String(rv.unit).split('/').pop() : null, revYear: yearOf(rev), hq: val(hq) && val(hq).id, founded: val(inc) ? val(inc).time.slice(1, 5) : null, web: val(web), parent: val(par) && val(par).id }; });
  if (refs.size) { const L = (await getJ(`${W}&action=wbgetentities&props=labels&languages=en&ids=${[...refs].slice(0, 50).join('|')}`)).entities || {}; rows.forEach(r => { r.hq = r.hq ? ((L[r.hq] || {}).labels || {}).en?.value || r.hq : null; r.parent = r.parent ? ((L[r.parent] || {}).labels || {}).en?.value || r.parent : null; }); }
  const prev = S.get('intel', null), changes = [];
  if (prev) rows.forEach(r => { const o = prev.rows.find(x => x.id === r.id); if (o) ['employees', 'revenue', 'hq', 'parent'].forEach(k => { if (o[k] !== r[k] && r[k] != null) changes.push({ name: r.label, field: k, from: o[k], to: r[k] }); }); });
  S.set('intel', { t: Date.now(), rows, changes: changes.concat(prev && prev.changes ? prev.changes : []).slice(0, 40) });
  const facts = rows.reduce((a, r) => a + ['employees', 'revenue', 'hq', 'founded', 'parent'].filter(k => r[k] != null).length, 0);
  return { summary: `${rows.length} companies matched on Wikidata · ${facts} sourced facts · ${changes.length} changes since last run`, reward: facts / (rows.length * 5), nodes: [{ id: 'source:wikidata', type: 'source', label: 'Wikidata' }, ...rows.map(r => ({ id: 'co:' + r.id, type: 'company', label: r.label }))], edges: rows.map(r => ({ a: 'co:' + r.id, b: 'source:wikidata' })) };
}

/* ---------- journal: source-checked posts ---------- */
export function groundCheck(md, sources) {
  const body = String(md).replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' '), src = sources.map(s => `${s.title} ${s.text}`).join(' ').replace(/(\d),(?=\d{3}\b)/g, '$1');
  const sv = [...src.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => +m[0]), nums = [...body.replace(/(\d),(?=\d{3}\b)/g, '$1').matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.]*\d)/g)].map(m => m[0]).filter(x => Math.abs(+x) >= 10 || x.includes('.'));
  const miss = nums.filter(x => { const v = +x, d = (x.split('.')[1] || '').length, tol = d ? .5 * 10 ** -d : .5; return !sv.some(s => Math.abs(s - v) <= tol + 1e-9); });
  const cites = [...String(md).matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap(m => m[1].split(',').map(Number)), badCites = cites.filter(c => c < 1 || c > sources.length);
  return { numbers: nums.length, missing: [...new Set(miss)], ratio: nums.length ? (nums.length - miss.length) / nums.length : 1, cites: cites.length, badCites: [...new Set(badCites)] };
}
export const TOPICS = ['hazards', 'climate', 'conflict', 'policy', 'outbreaks'];
async function sourcePack(topic) {
  const H = await mod('suite-hazards.js'); H.init(C); const out = [], add = (title, url, text) => out.push({ n: out.length + 1, title, url, text });
  if (topic === 'hazards') { const J = H.eventJobs(), [u, g] = await Promise.all([J.usgs(), J.gdacs()]); u.slice().sort((a, b) => b.mag - a.mag).slice(0, 6).forEach(e => add(`USGS: ${e.title}, ${e.place}`, e.url, `Magnitude ${e.mag.toFixed(1)}, depth ${e.depth} km, ${new Date(e.t).toISOString().slice(0, 10)}${e.tsunami ? ', tsunami flag set' : ''}.`)); g.filter(e => e.lvl !== 'green').slice(0, 6).forEach(e => add(`GDACS: ${e.title} (${e.place})`, e.url, `${e.lvl} alert. ${e.mag}. Updated ${new Date(e.t).toISOString().slice(0, 10)}.`)); }
  if (topic === 'climate') { const [g, sw] = await Promise.all([H.loadGHG(), H.loadSpace()]); if (g.co2) add('NOAA GML global monthly CO2', 'https://gml.noaa.gov/ccgg/trends/global.html', `Global mean CO2 ${g.co2.value} ppm in ${g.co2.year}-${String(g.co2.month).padStart(2, '0')}, ${g.co2.yoy} ppm higher than a year earlier.`); if (g.ch4) add('NOAA GML global monthly CH4', 'https://gml.noaa.gov/ccgg/trends_ch4/', `Global mean methane ${g.ch4.value} ppb in ${g.ch4.year}-${String(g.ch4.month).padStart(2, '0')}, change on a year earlier ${g.ch4.yoy} ppb.`); if (sw) add('NOAA SWPC space weather', 'https://www.swpc.noaa.gov', `Planetary Kp ${sw.kpNow != null ? sw.kpNow.toFixed(2) : 'n/a'}; solar wind ${sw.wind} km/s; latest flare peak ${sw.flare ? sw.flare.max : 'n/a'}.`); }
  if (topic === 'conflict') { const [cf, fd] = await Promise.all([H.loadConflicts(), H.loadFood()]); cf.list.filter(c => c.tier === 'major').forEach(c => add(`Wikipedia: ${c.name}`, c.url, `Listed as a major war (10,000+ deaths a year); recorded deaths in the latest year ${c.deaths}; countries ${c.countries.slice(0, 6).join(', ')}.`)); fd.list.filter(r => r.pou >= 25).sort((a, b) => b.pou - a.pou).slice(0, 6).forEach(r => add(`World Bank: undernourishment in ${r.name}`, 'https://data.worldbank.org/indicator/SN.ITK.DEFC.ZS?locations=' + r.iso3, `Prevalence of undernourishment ${r.pou}% in ${r.year}.`)); }
  if (topic === 'outbreaks') (await H.loadWHO()).slice(0, 8).forEach(w => add(`WHO Disease Outbreak News: ${w.title}, ${w.country}`, w.url, `Published ${new Date(w.t).toISOString().slice(0, 10)}${w.updates > 1 ? `; ${w.updates} notices on this outbreak` : ''}.`));
  if (topic === 'policy') { const terms = ['wetlands', 'air quality', 'drought', 'endangered species', 'wildfire'], term = terms[(S.get('policyTerm', 0)) % terms.length]; S.set('policyTerm', S.get('policyTerm', 0) + 1); const d = await getJ(`https://www.federalregister.gov/api/v1/documents.json?per_page=8&order=newest&conditions[term]=${encodeURIComponent(term)}&fields[]=title&fields[]=agencies&fields[]=publication_date&fields[]=html_url&fields[]=abstract&fields[]=type`); (d.results || []).forEach(r => add(`Federal Register (${r.type}): ${r.title}`, r.html_url, `${(r.agencies || []).map(a => a.name).join(', ')}; published ${r.publication_date}. ${String(r.abstract || '').slice(0, 420)}`)); out.term = term; }
  return out;
}
async function doWrite(on) {
  if (!C.hasClaude()) return { ok: false, summary: 'Claude is not available in this browser, so no post was written.', reward: .2 };
  const p = S.get('journal', []), topic = TOPICS[p.length % TOPICS.length]; on && on('Collecting sources on ' + topic);
  const src = await sourcePack(topic); if (src.length < 2) return { ok: false, summary: `Too few live sources for a ${topic} post today.`, reward: .3 };
  on && on('Drafting the post');
  const sys = 'You write posts for the Saltline journal, an environmental science institute. Use ONLY the facts in SOURCES and cite them inline as [n]. Never introduce a number that is not in the sources. Matter-of-fact and neutral: describe what sources and documents say; no opinions on parties, candidates or governments. Markdown: a first line "# Title", then 380–600 words in short sections with "##" headings. End with a one-line "What we are watching" section.';
  const md = String(await C.llm(sys, `Topic: ${topic}${src.term ? ' (' + src.term + ')' : ''}\nDate: ${new Date().toISOString().slice(0, 10)}\n\nSOURCES\n${src.map(s => `[${s.n}] ${s.title}. ${s.text} (${s.url})`).join('\n')}`, 1500)).trim();
  const gc = groundCheck(md, src), title = (md.match(/^#\s+(.+)$/m) || [, topic])[1].trim(), status = gc.missing.length || gc.badCites.length ? 'held' : 'published';
  const post = { id: 'post:' + Date.now(), t: Date.now(), topic, title, md, sources: src.map(({ n, title, url }) => ({ n, title, url })), gc, status };
  S.set('journal', [post, ...p].slice(0, 60));
  return { ok: status === 'published', summary: `${status === 'published' ? 'Published' : 'Held for review'}: “${title}” · ${gc.numbers - gc.missing.length}/${gc.numbers} numbers grounded · ${src.length} sources`, reward: gc.ratio * (gc.badCites.length ? .5 : 1), nodes: [{ id: post.id, type: 'post', label: title }, ...src.map(s => { try { return { id: 'source:' + new URL(s.url).host, type: 'source', label: new URL(s.url).host }; } catch (e) { return null; } }).filter(Boolean)], edges: src.map(s => { try { return { a: post.id, b: 'source:' + new URL(s.url).host }; } catch (e) { return null; } }).filter(Boolean) };
}
export const journal = () => S.get('journal', []);

/* ---------- research: fire-zone forecast from dryness + burn history ---------- */
export const vpd = (t, rh) => .6108 * Math.exp(17.27 * t / (t + 237.3)) * (1 - rh / 100);
export const fuel = (yearsSince, tau = 4) => yearsSince == null ? 1 : 1 - .7 * Math.exp(-Math.max(0, yearsSince) / tau);
export function auc(scores, labels) { const a = scores.map((s, i) => [s, labels[i] ? 1 : 0]).sort((x, y) => x[0] - y[0]); let rank = 1, sp = 0, np = 0, nn = 0; for (let i = 0; i < a.length;) { let j = i; while (j < a.length && a[j][0] === a[i][0]) j++; const avg = rank + (j - i - 1) / 2; for (let k = i; k < j; k++) a[k][1] ? (sp += avg, np++) : nn++; rank += j - i; i = j; } return np && nn ? (sp - np * (np + 1) / 2) / (np * nn) : null; }
const rankN = v => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length); o.forEach(([, i], k) => r[i] = k / Math.max(1, v.length - 1)); return r; };
export const REGION = { name: 'Southern California', s: 32.5, n: 35.5, w: -120, e: -114 };
async function doResearch(on, R = REGION) {
  on && on('Loading burn history (NASA EONET)');
  const now = new Date(), Y = now.getUTCFullYear(), ev = (await getJ(`https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=2017-01-01&end=${now.toISOString().slice(0, 10)}&bbox=${R.w},${R.n},${R.e},${R.s}&limit=5000`, 40000)).events || [];
  const fires = ev.map(e => { const g = (e.geometry || []).filter(x => x.type === 'Point').slice(-1)[0]; return g ? { lon: g.coordinates[0], lat: g.coordinates[1], y: +g.date.slice(0, 4), acres: g.magnitudeUnit === 'acres' ? g.magnitudeValue : null, rx: /prescribed|\bRX\b/i.test(e.title) } : null; }).filter(f => f && !f.rx);
  on && on('Loading the climate grid (NASA POWER)');
  const PW = `https://power.larc.nasa.gov/api/temporal/climatology/regional?latitude-min=${R.s}&latitude-max=${R.n}&longitude-min=${R.w}&longitude-max=${R.e}&community=AG&format=JSON&parameters=`;
  const [rh, tx, ws] = await Promise.all(['RH2M', 'T2M_MAX', 'WS2M'].map(p => getJ(PW + p, 40000))), key = f => f.geometry.coordinates[0] + ',' + f.geometry.coordinates[1], pv = (d, p) => new Map((d.features || []).map(f => [key(f), f.properties.parameter[p]]));
  const TX = pv(tx, 'T2M_MAX'), WS = pv(ws, 'WS2M'), pw = { features: (rh.features || []).filter(f => TX.has(key(f)) && WS.has(key(f))).map(f => ({ geometry: f.geometry, properties: { parameter: { RH2M: f.properties.parameter.RH2M, T2M_MAX: TX.get(key(f)), WS2M: WS.get(key(f)) } } })) };
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const cells = (pw.features || []).map(f => { const p = f.properties.parameter, hdw = M.map(m => vpd(p.T2M_MAX[m], p.RH2M[m]) * p.WS2M[m]).sort((a, b) => b - a); return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], D: (hdw[0] + hdw[1] + hdw[2]) / 3, rhMin: Math.min(...M.map(m => p.RH2M[m])) }; }).filter(c => isFinite(c.D));
  if (cells.length < 9) throw new Error('climate grid too small');
  const lats = [...new Set(cells.map(c => c.lat))].sort((a, b) => a - b), lons = [...new Set(cells.map(c => c.lon))].sort((a, b) => a - b), dLat = lats[1] - lats[0] || .5, dLon = lons[1] - lons[0] || .625;
  const cellOf = f => cells.findIndex(c => Math.abs(c.lat - f.lat) <= dLat / 2 && Math.abs(c.lon - f.lon) <= dLon / 2);
  fires.forEach(f => f.c = cellOf(f)); const inGrid = fires.filter(f => f.c >= 0), byYear = {}; inGrid.forEach(f => byYear[f.y] = (byYear[f.y] || 0) + 1);
  const rD = rankN(cells.map(c => c.D)), rH = rD.map(x => 1 - Math.abs(x - .5) * 2), feat = upto => { const Pn = cells.map((c, i) => inGrid.filter(f => f.y < upto && f.c === i).length), last = cells.map((c, i) => { const ys = inGrid.filter(f => f.y < upto && f.c === i).map(f => f.y); return ys.length ? Math.max(...ys) : null; }); return { last, rP: rankN(Pn.map((p, i) => p + cells[i].D * 1e-6)) }; };
  const VARS = { dry: (i) => rD[i], hump: (i) => rH[i], persist: (i, f) => f.rP[i], both: (i, f) => rD[i] + f.rP[i], humpPersist: (i, f) => rH[i] + f.rP[i], full: (i, f, y) => (rH[i] + f.rP[i]) * fuel(f.last[i] == null ? null : y - f.last[i]) };
  const score = (upto, v, y) => { const f = feat(upto); return cells.map((c, i) => VARS[v](i, f, y)); };
  const tests = Object.keys(byYear).map(Number).filter(y => y >= 2019 && byYear[y] >= 3).sort(), back = tests.map(y => { const lab = cells.map((c, i) => inGrid.some(f => f.y === y && f.c === i)); const r = { year: y, fires: byYear[y], burnedCells: lab.filter(Boolean).length }; Object.keys(VARS).forEach(v => { r[v] = auc(score(y, v, y), lab); }); return r; });
  let rb = [0, 0], base = [0, 0]; tests.forEach(y => cells.forEach((c, i) => { const recent = inGrid.some(f => f.c === i && f.y >= y - 3 && f.y < y), now2 = inGrid.some(f => f.c === i && f.y === y); if (recent) { rb[1]++; if (now2) rb[0]++; } else { base[1]++; if (now2) base[0]++; } }));
  on && on('Projecting dryness (CMIP6, Open-Meteo)');
  let ratio = {}; try { const cx = (R.s + R.n) / 2, cy = (R.w + R.e) / 2, A = 'https://climate-api.open-meteo.com/v1/climate?models=MRI_AGCM3_2_S&daily=relative_humidity_2m_mean,temperature_2m_max,wind_speed_10m_max'; const hd = d => { const t = d.daily.temperature_2m_max, h = d.daily.relative_humidity_2m_mean, w = d.daily.wind_speed_10m_max; let s = 0, n = 0; t.forEach((x, i) => { if (x != null && h[i] != null && w[i] != null) { s += vpd(x, h[i]) * w[i]; n++; } }); return n ? s / n : null; }; const b = hd(await getJ(`${A}&latitude=${cx}&longitude=${cy}&start_date=2015-01-01&end_date=2019-12-31`, 40000)); for (const y of [Y + 1, Y + 2, Y + 3]) { const v = hd(await getJ(`${A}&latitude=${cx}&longitude=${cy}&start_date=${y}-01-01&end_date=${y}-12-31`, 30000)); if (b && v) ratio[y] = +(v / b).toFixed(3); } } catch (e) { ratio = {}; }
  const meanAUC = k => { const v = back.map(b => b[k]).filter(x => x != null); return v.length ? +(v.reduce((a, x) => a + x, 0) / v.length).toFixed(3) : null; }, mean = {}; Object.keys(VARS).forEach(k => mean[k] = meanAUC(k));
  const best = Object.keys(mean).filter(k => mean[k] != null).sort((a, b) => mean[b] - mean[a])[0], fAll = feat(Y + 1), lastAll = fAll.last, Pall = cells.map((c, i) => inGrid.filter(f => f.c === i).length);
  const years = [Y + 1, Y + 2, Y + 3], grid = cells.map((c, i) => ({ lat: c.lat, lon: c.lon, D: +c.D.toFixed(3), rhMin: +c.rhMin.toFixed(1), fires: Pall[i], last: lastAll[i], f: years.map(y => +(VARS[best](i, fAll, y) * (ratio[y] || 1)).toFixed(4)) }));
  const res = { t: Date.now(), region: R, cells: cells.length, dLat, dLon, fires: inGrid.length, byYear, back, mean, best, reburn: { recent: rb, other: base }, ratio, years, grid, pts: inGrid.map(f => [+f.lat.toFixed(3), +f.lon.toFixed(3), f.y]) };
  S.set('research', res);
  const fuelHelps = mean.full != null && mean.humpPersist != null && mean.full > mean.humpPersist;
  return { summary: `${inGrid.length} fires in ${cells.length} cells · best model ${best} (AUC ${mean[best]}) · fire history ${mean.persist} · dryness ${mean.dry} · intermediate dryness ${mean.hump} · burn-scar term ${fuelHelps ? 'helps' : 'does not help'} (${mean.humpPersist} → ${mean.full}) · re-burn within 3 y ${Math.round(rb[0] / Math.max(1, rb[1]) * 100)}% vs ${Math.round(base[0] / Math.max(1, base[1]) * 100)}% elsewhere`, reward: mean[best] ? (mean[best] - .5) * 2 : 0, nodes: [{ id: 'exp:fire:' + res.t, type: 'experiment', label: `Fire zones · ${best} AUC ${mean[best]}` }, { id: 'source:eonet', type: 'source', label: 'NASA EONET' }, { id: 'source:power', type: 'source', label: 'NASA POWER' }, { id: 'source:openmeteo', type: 'source', label: 'Open-Meteo CMIP6' }], edges: ['eonet', 'power', 'openmeteo'].map(s => ({ a: 'exp:fire:' + res.t, b: 'source:' + s })) };
}

/* ---------- orchestration ---------- */
const IMPL = { audit: doAudit, test: doTest, devices: doDevices, improve: doImprove, intel: doIntel, write: doWrite, research: doResearch };
export const runSkill = (skill, on) => run(skill, IMPL[skill], on);
export async function cycle(on, extra) { const out = []; out.push(await runSkill('test', on)); out.push(await runSkill('audit', on)); for (const s of extra || plan(2)) out.push(await runSkill(s, on)); S.set('cycles', S.get('cycles', 0) + 1); return out; }
export const state = () => ({ audit: lastAudit(), tests: S.get('tests', null), devices: S.get('devices', null), intel: S.get('intel', null), journal: journal(), research: S.get('research', null), ledger: ledger(), policy: policy(), graph: graph(), learned: learned(), patches: P.list(), cycles: S.get('cycles', 0) });

/* ---------- self-tests ---------- */
export async function selfTests() {
  const out = [], M = 'suite-agent.js', A = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const T = async (name, fn, body) => { const t0 = performance.now(); try { const d = await body(); out.push({ name, module: M, fn, ok: true, detail: String(d ?? 'ok'), ms: +(performance.now() - t0).toFixed(1) }); } catch (e) { out.push({ name, module: M, fn, ok: false, detail: e.message || String(e), ms: +(performance.now() - t0).toFixed(1) }); } };
  await T('auc() ranks perfectly, inversely and on ties', 'auc', () => { A(auc([1, 2, 3, 4], [0, 0, 1, 1]) === 1 && auc([4, 3, 2, 1], [0, 0, 1, 1]) === 0 && auc([1, 1, 1, 1], [0, 1, 0, 1]) === .5 && auc([1, 2], [1, 1]) === null, 'auc'); return '1 · 0 · 0.5 · null'; });
  await T('vpd() matches the Tetens equation', 'vpd', () => { const v = vpd(30, 30); A(Math.abs(v - 2.97) < .02, 'got ' + v); return v.toFixed(2) + ' kPa at 30 °C, 30%'; });
  await T('fuel() suppresses recently burnt cells and recovers', 'fuel', () => { A(fuel(1) < fuel(5) && fuel(5) < fuel(15) && fuel(null) === 1 && fuel(0) < .35, 'curve'); return `1 y ${fuel(1).toFixed(2)} · 5 y ${fuel(5).toFixed(2)} · 15 y ${fuel(15).toFixed(2)}`; });
  await T('groundCheck() catches invented numbers, allows rounding', 'groundCheck', () => { const src = [{ title: 'NOAA', text: 'CO2 426.14 ppm; 1,234 events.' }]; const ok = groundCheck('# T\nCO2 was 426.1 ppm with 1,234 events [1].', src), bad = groundCheck('CO2 hit 431 ppm [2].', src); A(ok.missing.length === 0 && ok.ratio === 1, JSON.stringify(ok)); A(bad.missing.includes('431') && bad.badCites.includes(2), JSON.stringify(bad)); return 'rounded ok · invented and bad cite caught'; });
  await T('pickEntity() prefers a company match', 'pickEntity', () => { const r = pickEntity([{ id: 'Q1', label: 'ERM', description: 'gene' }, { id: 'Q2', label: 'ERM', description: 'environmental consulting company' }], 'ERM'); A(r && r.id === 'Q2', JSON.stringify(r)); return 'Q2'; });
  await T('latestClaim() takes the most recent dated value', 'latestClaim', () => { const mk = (v, y) => ({ rank: 'normal', mainsnak: { datavalue: { value: { amount: '+' + v } } }, qualifiers: { P585: [{ datavalue: { value: { time: `+${y}-00-00T00:00:00Z` } } }] } }); const c = latestClaim({ P1128: [mk(100, 2019), mk(300, 2023), mk(200, 2021)] }, 'P1128'); A(c.mainsnak.datavalue.value.amount === '+300', JSON.stringify(c)); return '2023 value chosen'; });
  await T('plan() never schedules audit or test as extras', 'plan', () => { const p = plan(3); A(p.length === 3 && !p.includes('audit') && !p.includes('test'), p.join()); return p.join(', '); });
  await T('remember() merges nodes and de-duplicates edges', 'remember', () => { const keep = S.get('graph', null); try { S.set('graph', { nodes: [], edges: [] }); remember([{ id: 'x', type: 't' }, { id: 'y', type: 't' }], [{ a: 'x', b: 'y' }, { a: 'x', b: 'y' }]); remember([{ id: 'x', type: 't', label: 'X' }]); const g = graph(); A(g.nodes.length === 2 && g.edges.length === 1 && g.nodes[0].label === 'X', JSON.stringify(g)); return '2 nodes · 1 edge'; } finally { S.set('graph', keep || { nodes: [], edges: [] }); } });
  const passed = out.filter(o => o.ok).length;
  return { t: Date.now(), items: out, total: out.length, passed, pass: passed === out.length, version: AG.version };
}
