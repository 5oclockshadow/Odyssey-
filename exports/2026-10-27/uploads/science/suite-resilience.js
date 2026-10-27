/* Saltline Resilience — SOC 2-aligned control checks, bounded chaos tests on the suite's own functions, and a review log.
   Runs in the browser against this codebase only. It produces findings and evidence. It does not certify compliance:
   SOC 2 is an attestation issued by a licensed CPA firm after an examination period. */
import * as G from './suite-codegraph.js';
export const RS = { version: '1.4.0' };
const kv = (k, d) => { try { const v = JSON.parse(localStorage.getItem('saltline.rs.' + k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const kput = (k, v) => { try { localStorage.setItem('saltline.rs.' + k, JSON.stringify(v)); } catch (e) {} };
export const CRITERIA = { CC6: 'Logical access and encryption', CC7: 'Monitoring and operations', CC8: 'Change management', CC9: 'Vendor management', PI1: 'Processing integrity', A1: 'Availability', C1: 'Confidentiality' };
export const last = () => kv('last', null);
export const history = () => kv('log', []);

/* ---------- SOC 2-aligned static checks (text in, findings out) ---------- */
const scan = (files, test) => files.flatMap(f => f.text.split('\n').map((l, i) => test(l, f) ? { file: f.path, line: i + 1, snippet: l.trim().slice(0, 160) } : null).filter(Boolean));
const htmlOnly = files => files.filter(f => /\.html?$/i.test(f.path));
export const CHECKS = [
  { id: 'tls', criterion: 'CC6.7', title: 'Plain HTTP endpoint', sev: 'high', fix: 'Use https:// for every endpoint. localhost is exempt.', run: files => scan(files, l => /http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/i.test(l) && !/xmlns/.test(l)) },
  { id: 'secret', criterion: 'CC6.1', title: 'Credential-like value in source', sev: 'high', fix: 'Move the value to server-side configuration or an environment secret, then rotate it.', run: files => scan(files, l => /(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-\/+=]{12,}['"]/i.test(l)) },
  { id: 'storage', criterion: 'C1.1', title: 'Sensitive key written to browser storage', sev: 'high', fix: 'Keep credentials out of localStorage: hold them in memory or in an httpOnly session.', run: files => scan(files, l => /localStorage\.setItem\([^)]*(token|secret|password|api[_-]?key)/i.test(l)) },
  { id: 'dyncode', criterion: 'PI1.4', title: 'Dynamic code execution', sev: 'med', fix: 'Replace new Function and eval with fixed assertions or a sandboxed interpreter, and review each use.', run: files => scan(files, l => /\bnew Function\s*\(|\beval\s*\(/.test(l)) },
  { id: 'sri', criterion: 'CC6.8', title: 'Third-party script without integrity hash', sev: 'med', fix: 'Add integrity= and crossorigin= with a pinned hash, or self-host the file.', run: files => scan(htmlOnly(files), l => /<script[^>]*src="https?:\/\//i.test(l) && !/integrity=/.test(l)) },
  { id: 'innerhtml', criterion: 'PI1.2', title: 'Interpolated value set as HTML without escaping (heuristic)', sev: 'med', fix: 'Wrap interpolated values in esc() or build nodes with textContent.', run: files => scan(files, l => /innerHTML\s*=\s*`[^`]*\$\{(?![^}]*esc\()/.test(l)) },
  { id: 'swallow', criterion: 'CC7.2', title: 'Error caught and discarded', sev: 'low', fix: 'Record the error in the event ledger or rethrow it, so monitoring can see it.', run: files => scan(files, l => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(l)) },
  { id: 'changes', criterion: 'CC8.1', title: 'Automated code change without a full passing test run', sev: 'high', fix: 'Write a patch only after every test for its module passes; reject it otherwise.', run: (files, ctx) => (ctx.patches || []).filter(p => { const [a, b] = String(p.tests || '').split('/').map(Number); return !(b > 0 && a === b); }).map(p => ({ file: p.file, line: 0, snippet: `${p.fn}() · tests recorded: ${p.tests || 'none'}` })) },
  { id: 'vendors', criterion: 'CC9.2', title: 'Third-party hosts contacted by the suite', sev: 'info', inventory: true, fix: 'Record each processor, its data, and its terms in the vendor register.', run: files => { const hosts = new Map(); files.forEach(f => { for (const m of f.text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) { const h = m[1].toLowerCase(); if (!hosts.has(h)) hosts.set(h, new Set()); hosts.get(h).add(f.path); } }); return [...hosts].map(([h, s]) => ({ file: h, line: 0, snippet: `used by ${[...s].slice(0, 4).join(', ')}${s.size > 4 ? ' +' + (s.size - 4) : ''}` })); } },
];

/* ---------- chaos: bounded fuzzing of the suite's own pure exports ---------- */
const POOL = [undefined, null, NaN, Infinity, -Infinity, -1, 0, 1e308, '', 'x', '{"a":1}', [], {}, [null], { features: null }, { daily: {} }, true, -0];
export const CHAOS_MODULES = ['suite-hazards.js', 'suite-forecast.js', 'suite-agent.js'];
const DENY = /^(load|get|fetch|save|set|init|watch|snapshot|remember|geocode|self|run|cycle|build|ingest|write|persist|clear|remove|state|store|doAudit|sourcePack|plan|policy|ledger|graph|journal|learned|last|history|emit|mount|draw|paint|tip|hide|reset|send|post)/i;
export function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const show = v => { if (v === undefined) return 'undefined'; if (typeof v === 'number') return String(v); if (typeof v === 'string') return JSON.stringify(v).slice(0, 24); try { return (JSON.stringify(v) || typeof v).slice(0, 40); } catch (e) { return typeof v; } };
export function discover(M) {
  const fuzz = [], skipped = [];
  for (const name of Object.keys(M)) {
    const fn = M[name]; if (typeof fn !== 'function') continue;
    if (/^class\b/.test(Function.prototype.toString.call(fn))) { skipped.push({ name, why: 'class' }); continue; }
    if (fn.constructor && fn.constructor.name !== 'Function') { skipped.push({ name, why: 'async (network or storage)' }); continue; }
    if (DENY.test(name)) { skipped.push({ name, why: 'side effects or network' }); continue; }
    fuzz.push([name, Math.min(fn.length, 4)]);
  }
  return { fuzz, skipped };
}
export function fuzzFn(fn, name, arity, rnd, n = 160) {
  const res = { fn: name, arity, cases: 0, crashes: 0, nan: 0, ms: 0, example: '' }, t0 = performance.now(), pick = () => POOL[Math.floor(rnd() * POOL.length)], tries = [];
  if (!arity) tries.push([]);
  for (let i = 0; i < arity; i++) for (const v of POOL) { const a = Array.from({ length: arity }, pick); a[i] = v; tries.push(a); }
  for (let k = 0; k < n && arity; k++) tries.push(Array.from({ length: arity }, pick));
  for (const args of tries) { res.cases++; try { const r = fn(...args); if (typeof r === 'number' && !isFinite(r)) res.nan++; } catch (e) { res.crashes++; if (!res.example) res.example = `(${args.map(show).join(', ')}) → ${e.name}: ${String(e.message).slice(0, 90)}`; } }
  res.ms = +(performance.now() - t0).toFixed(1); return res;
}

/* ---------- stress: work sized to the suite's real inputs, against a time budget ---------- */
const synth = (n, r) => Array.from({ length: n }, (_, i) => ({ id: 'syn' + i, dom: ['seismic', 'storm', 'flood', 'volcanic'][i % 4], title: 'Event ' + i, place: '', lat: r() * 140 - 70, lon: r() * 360 - 180, t: Date.now() - i * 3600e3, sev: r(), mag: 4 + r() * 3, src: 'usgs' }));
export function stressTargets(H, r) { return [
  { name: 'dedupe() on 4,000 events', budget: 2000, work: () => H.dedupe(synth(4000, r)) },
  { name: 'exposure() against 20,000 events', budget: 1500, work: () => H.exposure({ lat: 36.8, lon: -2.2 }, { events: synth(20000, r), now: Date.now() }) },
  { name: 'parseEONET() on 5,000 records', budget: 1000, work: () => H.parseEONET({ events: Array.from({ length: 5000 }, (_, i) => ({ id: 'e' + i, title: 'x', categories: [{ id: 'wildfires' }], geometry: [{ type: 'Point', coordinates: [i % 180, i % 80], date: '2026-10-01T00:00:00Z', magnitudeValue: 100, magnitudeUnit: 'acres' }] })) }) },
]; }
export function stressOne(name, work, budget) { const t0 = performance.now(); let err = ''; try { work(); } catch (e) { err = e.message; } const ms = +(performance.now() - t0).toFixed(1); return { name, ms, budget, over: ms > budget || !!err, err }; }

/* ---------- scoring ---------- */
export function socScore(checks) { const c = checks.filter(x => !x.inventory); return c.length ? Math.round(100 * c.filter(x => x.pass).length / c.length) : null; }

/* ---------- run: crawl, check, fuzz, stress, diff against the last run ---------- */
async function loadPatches() { try { const P = await import('./suite-patch.js'); return P.list ? P.list() : []; } catch (e) { return []; } }
export async function runAll({ onStep, files = null, label = 'This suite' } = {}) {
  const t0 = performance.now(), prev = last(), run = kv('runs', 0) + 1, rnd = prng(run * 7919);
  kput('runs', run);
  const suite = !files;
  onStep && onStep(suite ? 'Reading the codebase' : 'Reading the target');
  const cr = suite ? await G.crawl({ onProgress: (n, p) => onStep && onStep('Reading ' + p) }) : { files, missing: [] };
  const patches = suite ? await loadPatches() : [];
  onStep && onStep('Running SOC 2-aligned checks');
  const checks = CHECKS.map(c => { let f = []; try { f = c.run(cr.files, { patches }) || []; } catch (e) { f = [{ file: 'tester', line: 0, snippet: 'check error: ' + e.message }]; } return { id: c.id, criterion: c.criterion, title: c.title, sev: c.sev, fix: c.fix, inventory: !!c.inventory, count: f.length, pass: !!c.inventory || c.sev === 'low' || f.length === 0, findings: f.slice(0, 40) }; });
  const chaos = [], skipped = [];
  for (const path of (suite ? CHAOS_MODULES : [])) {
    onStep && onStep('Fuzzing ' + path);
    const M = await import('./' + path), D = discover(M);
    for (const [name, arity] of D.fuzz) chaos.push({ mod: path, ...fuzzFn(M[name], name, arity, rnd, 160) });
    D.skipped.forEach(s => skipped.push({ mod: path, ...s }));
  }
  onStep && onStep('Stress-testing the engine');
  const stress = suite ? stressTargets(await import('./suite-hazards.js'), rnd).map(s => stressOne(s.name, s.work, s.budget)) : [];
  const findings = [];
  checks.forEach(c => c.findings.forEach(f => findings.push({ src: 'check', id: c.id + ':' + f.file + ':' + f.line, criterion: c.criterion, sev: c.inventory ? 'info' : c.sev, title: c.title, where: f.file + (f.line ? ':' + f.line : ''), detail: f.snippet, fix: c.fix })));
  chaos.filter(c => c.crashes > 0).forEach(c => findings.push({ src: 'chaos', id: 'chaos:' + c.mod + ':' + c.fn, criterion: 'PI1.3', sev: 'med', title: `${c.fn}() throws on invalid input`, where: c.mod, detail: `${c.crashes} of ${c.cases} inputs throw · ${c.example}`, fix: 'Validate inputs at the boundary and return a documented fallback value.' }));
  stress.filter(s => s.over).forEach(s => findings.push({ src: 'stress', id: 'stress:' + s.name, criterion: 'A1.2', sev: 'med', title: `${s.name} over budget`, where: 'engine', detail: `${s.ms} ms against a ${s.budget} ms budget${s.err ? ' · ' + s.err : ''}`, fix: 'Index the lookup or cap the input size.' }));
  const nonInv = checks.filter(c => !c.inventory), socS = socScore(checks), chaosS = chaos.length ? Math.round(100 * chaos.filter(c => c.crashes === 0).length / chaos.length) : null, stressS = stress.length ? Math.round(100 * stress.filter(s => !s.over).length / stress.length) : null;
  const ids = new Set(findings.map(f => f.id)), prevIds = new Set(((prev && prev.findings) || []).map(f => f.id));
  const added = findings.filter(f => !prevIds.has(f.id)).length, resolved = [...prevIds].filter(x => !ids.has(x)).length;
  const state = { t: Date.now(), target: label, run, ms: Math.round(performance.now() - t0), socScore: socS, chaosScore: chaosS, stressScore: stressS, checksPassing: nonInv.filter(c => c.pass).length, checksTotal: nonInv.length, checks, findings: findings.slice(0, 400), chaos, stress, skipped, coverage: { fuzzed: chaos.length, skipped: skipped.length, files: cr.files.length, missing: cr.missing.length }, added, resolved };
  kput('last', state);
  const log = history(); log.unshift({ t: state.t, run, soc: socS, chaos: chaosS, stress: stressS, findings: findings.length, added, resolved, fuzzed: chaos.length, ms: state.ms }); kput('log', log.slice(0, 80));
  return state;
}

/* ---------- targets beyond this suite: a URL the page can read, or a folder the user picks ---------- */
const TEXT = /\.(html?|m?js|jsx|tsx|ts|css|json|md|txt|py|go|rb|php|java|cs|rs|sql|ya?ml|toml|sh)$/i, SKIPDIR = /(^|\/)(node_modules|\.git|dist|build|vendor|__pycache__)(\/|$)/;
export async function sourceFromUrl(url, onStep) {
  const base = new URL(url); if (!/^https?:$/.test(base.protocol)) throw new Error('only http and https URLs can be read');
  const seen = new Map(), queue = [base.href];
  while (queue.length && seen.size < 60) {
    const u = queue.shift(); if (seen.has(u)) continue;
    onStep && onStep('Reading ' + u);
    let t; try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); t = await r.text(); } catch (e) { continue; }
    seen.set(u, t);
    if (/<html|<!doctype/i.test(t)) for (const m of t.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/gi)) { try { const r = new URL(m[1], u); if (r.origin === base.origin) queue.push(r.href); } catch (e) {} }
  }
  return [...seen].map(([u, text]) => ({ path: u.slice(base.origin.length) || '/', text }));
}
export async function sourceFromFiles(list) {
  const picked = [...list].filter(f => TEXT.test(f.name) && f.size < 2e6 && !SKIPDIR.test(f.webkitRelativePath || f.name)).slice(0, 400);
  return Promise.all(picked.map(async f => ({ path: f.webkitRelativePath || f.name, text: await f.text() })));
}

/* ---------- self-tests: the checks test themselves on planted defects ---------- */
export async function selfTests() {
  const out = [], M = 'suite-resilience.js', A = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const T = async (name, fn, body) => { const t0 = performance.now(); try { const d = await body(); out.push({ name, module: M, fn, ok: true, detail: String(d ?? 'ok'), ms: +(performance.now() - t0).toFixed(1) }); } catch (e) { out.push({ name, module: M, fn, ok: false, detail: e.message || String(e), ms: +(performance.now() - t0).toFixed(1) }); } };
  const ck = id => CHECKS.find(c => c.id === id);
  await T('tls check flags http, ignores localhost and xmlns', 'CHECKS', () => { const r = ck('tls').run([{ path: 'a.html', text: '<a href="http://example.org/x">a</a>\n<a href="http://localhost:8000">b</a>\n<svg xmlns="http://www.w3.org/2000/svg">' }]); A(r.length === 1 && r[0].line === 1, JSON.stringify(r)); return '1 finding, line 1'; });
  await T('secret check catches a long credential, ignores short values', 'CHECKS', () => { const r = ck('secret').run([{ path: 'a.js', text: 'const apiKey = "abcd1234efgh5678";\nconst token = "short";' }]); A(r.length === 1 && r[0].line === 1, JSON.stringify(r)); return '1 finding'; });
  await T('storage check flags a token written to localStorage', 'CHECKS', () => { const r = ck('storage').run([{ path: 'a.js', text: "localStorage.setItem('saltline.token', t);\nlocalStorage.setItem('saltline.theme', v);" }]); A(r.length === 1, JSON.stringify(r)); return '1 finding'; });
  await T('dyncode check flags new Function and eval', 'CHECKS', () => { const r = ck('dyncode').run([{ path: 'a.js', text: "const f = new Function('a', 'return a');\nconst g = eval(x);" }]); A(r.length === 2, JSON.stringify(r)); return '2 findings'; });
  await T('sri check flags a CDN script without integrity', 'CHECKS', () => { const r = ck('sri').run([{ path: 'a.html', text: '<script src="https://unpkg.com/x.js"></script>\n<script src="https://unpkg.com/y.js" integrity="sha384-abc" crossorigin="anonymous"></script>' }]); A(r.length === 1 && r[0].line === 1, JSON.stringify(r)); return '1 finding'; });
  await T('innerhtml check flags raw interpolation, passes esc()', 'CHECKS', () => { const r = ck('innerhtml').run([{ path: 'a.js', text: 'el.innerHTML = `<b>${name}</b>`;\nel.innerHTML = `<b>${esc(name)}</b>`;' }]); A(r.length === 1 && r[0].line === 1, JSON.stringify(r)); return '1 finding'; });
  await T('changes check flags a patch whose tests did not all pass', 'CHECKS', () => { const r = ck('changes').run([], { patches: [{ file: 'a.js', fn: 'f', tests: '4/5' }, { file: 'b.js', fn: 'g', tests: '3/3' }] }); A(r.length === 1 && r[0].file === 'a.js', JSON.stringify(r)); return '1 unverified patch'; });
  await T('chaos harness counts a throwing function', 'fuzzFn', () => { const r = fuzzFn(function boom(x) { if (x == null) throw new TypeError('null input'); return 1; }, 'boom', 1, prng(1), 20); A(r.crashes > 0 && /TypeError/.test(r.example), JSON.stringify(r)); return `${r.crashes} of ${r.cases} inputs throw`; });
  await T('chaos harness stays quiet on a robust function', 'fuzzFn', () => { const r = fuzzFn(function safe() { return 1; }, 'safe', 1, prng(2), 20); A(r.crashes === 0 && r.cases > 0, JSON.stringify(r)); return `0 of ${r.cases} crash`; });
  await T('discover() fuzzes sync pure functions, skips async, classes and side effects', 'discover', () => { const D = discover({ a(x) { return x; }, b: async () => 1, c: class {}, load: x => x, ok: x => x, K: 3 }); A(D.fuzz.map(f => f[0]).join() === 'a,ok' && D.skipped.length === 3, JSON.stringify(D)); return 'a, ok fuzzed · 3 skipped'; });
  await T('score ignores inventory checks', 'socScore', () => { const s = socScore([{ pass: true }, { pass: true }, { pass: true }, { pass: false }, { pass: true, inventory: true }]); A(s === 75, 'got ' + s); return '3 of 4 pass → 75'; });
  await T('stress harness flags work over its budget', 'stressOne', () => { const r = stressOne('slow', () => { const t = performance.now(); while (performance.now() - t < 30) {} }, 5); A(r.over && r.ms >= 25, JSON.stringify(r)); return `${r.ms} ms against 5 ms`; });
  const passed = out.filter(o => o.ok).length;
  return { t: Date.now(), items: out, total: out.length, passed, pass: passed === out.length, version: RS.version };
}
