/* Saltline code graph — crawls every file in the suite and parses JS, HTML and Design Component sources into one graph:
   files, functions, calls, imports, page links, external endpoints, storage keys, events, DOM ids and tests.
   Scores risk, finds defects, detects cloned logic, runs end-to-end page checks and builds test-gated patches. */
export const CG = { version: '1.4.0' };
export const SEED = ['Command Center.html', 'Observatory.dc.html', 'Biodiversity.dc.html', 'Code Lab.dc.html', 'Dossier.html', 'Onboarding.html', 'Tester.html', 'Field Tools.html', 'Impact Assessment.html', 'Market.dc.html', 'Lead Graph.html', 'Institute.dc.html', 'Features.dc.html', 'Saltline.dc.html', 'Terminal.dc.html', 'Dashboard Styles.dc.html', 'Command Center v1 (legacy).html', 'suite-core.js', 'suite-hazards.js', 'suite-bio.js', 'suite-codegraph.js', 'suite-patch.js', 'suite-launcher.js', 'suite-theme.js', 'suite-theme.css', 'institute-intel.js', 'institute-data.js', 'features-data.js', 'saltline-data.js', 'saltline-engine.js'];
export const ENGINE = ['suite-core.js', 'suite-hazards.js', 'suite-bio.js', 'suite-codegraph.js', 'suite-patch.js'];
export const ENTRY = ['Command Center.html'];
export const LEGACY = new Set(['Command Center v1 (legacy).html']);
const SKIP = new Set(['support.js']);
const RUNTIME_IDS = new Set(['root']);
const LIBS = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)$/;
const KW = new Set('if for while switch catch function return typeof new delete void throw yield await do else try finally case default break continue in of instanceof class extends super import export const let var this null true false undefined async static get set with'.split(' '));

/* ---------- tokenizer: blank comments, string bodies and regex bodies so braces and calls can be read safely ---------- */
export function mask(src) {
  const s = String(src), n = s.length, out = s.split(''), strings = [];
  let prev = '', word = '';
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const isId = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$';
  const regexOk = () => !prev || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || (prev === 'w' && /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await|instanceof)$/.test(word));
  function tpl(i) {
    const start = i, parts = []; let j = i + 1, seg = j;
    while (j < n) {
      const x = s[j];
      if (x === '\\') { j += 2; continue; }
      if (x === '`') { blank(seg, j); parts.push(s.slice(seg, j)); strings.push({ s: start, e: j + 1, v: parts.join('${…}'), q: '`' }); return j + 1; }
      if (x === '$' && s[j + 1] === '{') { blank(seg, j); parts.push(s.slice(seg, j)); j = code(j + 2, true); seg = j; continue; }
      j++;
    }
    blank(seg, n); return n;
  }
  function code(i, stop) {
    let depth = 0;
    while (i < n) {
      const c = s[i], d = s[i + 1];
      if (c === '/' && d === '/') { let j = s.indexOf('\n', i); if (j < 0) j = n; blank(i, j); i = j; continue; }
      if (c === '/' && d === '*') { let j = s.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
      if (c === '"' || c === "'") { let j = i + 1; while (j < n && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } strings.push({ s: i, e: j + 1, v: s.slice(i + 1, j), q: c }); blank(i + 1, j); i = j + 1; prev = c; word = ''; continue; }
      if (c === '`') { i = tpl(i); prev = '`'; word = ''; continue; }
      if (c === '/' && regexOk()) { let j = i + 1, cls = false; while (j < n && s[j] !== '\n') { const x = s[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j++; } blank(i + 1, j); i = j + 1; while (i < n && isId(s[i])) i++; prev = 'r'; word = ''; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (stop && depth === 0) return i + 1; depth--; }
      if (isId(c)) { let j = i; while (j < n && isId(s[j])) j++; word = s.slice(i, j); prev = 'w'; i = j; continue; }
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') { prev = c; word = ''; }
      i++;
    }
    return i;
  }
  code(0, false);
  return { code: out.join(''), strings };
}
const lineIndex = s => { const L = [0]; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) L.push(i + 1); return L; };
const lineAt = (L, i) => { let lo = 0, hi = L.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L[m] <= i) lo = m; else hi = m - 1; } return lo + 1; };
const pair = (c, i, o, x) => { let d = 0; for (let j = i; j < c.length; j++) { if (c[j] === o) d++; else if (c[j] === x) { d--; if (!d) return j; } } return c.length - 1; };
const exprEnd = (c, i) => { let d = 0; for (let j = i; j < c.length; j++) { const x = c[j]; if (x === '(' || x === '[' || x === '{') d++; else if (x === ')' || x === ']' || x === '}') { if (!d) return j - 1; d--; } else if (!d && (x === ';' || x === ',' || x === '\n')) return j - 1; } return c.length - 1; };
const depths = c => { const D = new Int16Array(c.length + 1); let d = 0; for (let i = 0; i < c.length; i++) { if (c[i] === '}') d--; D[i] = d; if (c[i] === '{') d++; } return D; };
const nParams = s => s.trim() ? s.split(',').filter(x => x.trim()).length : 0;
const BRANCH = /\bif\b|\bfor\b|\bwhile\b|\bcase\b|\bcatch\b|&&|\|\||\?\?|\?(?![.?])/g;

/* ---------- JS parser ---------- */
export function parseJS(src, file = '', off = 0) {
  const { code, strings } = mask(src), L = lineIndex(src), ln = i => off + lineAt(L, i), D = depths(code), found = new Map(), classes = [];
  const add = o => { if (!found.has(o.start)) found.set(o.start, o); };
  for (const m of code.matchAll(/\b(export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) { const p0 = m.index + m[0].length - 1, p1 = pair(code, p0, '(', ')'), b = code.indexOf('{', p1); if (b < 0) continue; add({ name: m[2], kind: 'function', start: m.index, body: b, end: pair(code, b, '{', '}'), exported: !!m[1], params: nParams(code.slice(p0 + 1, p1)) }); }
  for (const m of code.matchAll(/\b(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(function\b\s*\*?\s*[\w$]*\s*\(|\(|[A-Za-z_$][\w$]*\s*=>)/g)) {
    let k = m.index + m[0].length, pc = 0;
    if (m[3].endsWith('(')) { const p0 = k - 1, p1 = pair(code, p0, '(', ')'); pc = nParams(code.slice(p0 + 1, p1)); k = p1 + 1; while (/\s/.test(code[k] || '')) k++; if (!m[3].startsWith('function')) { if (code.slice(k, k + 2) !== '=>') continue; k += 2; } }
    else pc = 1;
    while (/\s/.test(code[k] || '')) k++;
    const block = code[k] === '{', end = block ? pair(code, k, '{', '}') : exprEnd(code, k);
    add({ name: m[2], kind: 'arrow', start: m.index, body: k, end, exported: !!m[1], params: pc });
  }
  for (const m of code.matchAll(/\b(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)[^{;]*\{/g)) { const b = m.index + m[0].length - 1, e = pair(code, b, '{', '}'); add({ name: m[2], kind: 'class', start: m.index, body: b, end: e, exported: !!m[1], params: 0 }); classes.push({ b, e, name: m[2] }); }
  for (const m of code.matchAll(/(^|[\n;{},])[ \t]*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2]; if (KW.has(name)) continue;
    const p0 = m.index + m[0].length - 1, p1 = pair(code, p0, '(', ')'); let k = p1 + 1; while (/\s/.test(code[k] || '')) k++;
    if (code[k] !== '{') continue;
    add({ name, kind: 'method', start: m.index + m[1].length, body: k, end: pair(code, k, '{', '}'), exported: false, params: nParams(code.slice(p0 + 1, p1)) });
  }
  for (const c of classes) for (const m of code.slice(c.b, c.e).matchAll(/\n[ \t]*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) { const st = c.b + m.index + 1; if (D[st] !== D[c.b] + 1) continue; let k = c.b + m.index + m[0].length; while (/\s/.test(code[k] || '')) k++; add({ name: m[1], kind: 'field', start: st, body: k, end: code[k] === '{' ? pair(code, k, '{', '}') : exprEnd(code, k), exported: false, params: 0 }); }
  const fns = [...found.values()].sort((a, b) => a.start - b.start).map(f => {
    const body = code.slice(f.body, f.end + 1), cls = classes.find(c => f.start > c.b && f.end <= c.e && f.kind !== 'class');
    let mx = 0; for (let i = f.body; i <= f.end; i++) if (D[i] > mx) mx = D[i];
    const calls = new Map(), member = [];
    for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) if (!KW.has(m[1])) calls.set(m[1], (calls.get(m[1]) || 0) + 1);
    for (const m of body.matchAll(/(?<![\w$.])(this\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) member.push([m[1], m[2]]);
    const top = D[f.start] === 0 || (cls && D[f.start] === D[cls.b] + 1 && ['method', 'field'].includes(f.kind)) || (f.kind === 'method' && D[f.start] === 1);
    return { ...f, file, parent: cls ? cls.name : null, line: ln(f.start), endLine: ln(f.end), loc: lineAt(L, f.end) - lineAt(L, f.start) + 1, cc: 1 + (body.match(BRANCH) || []).length, nest: Math.max(0, mx - D[f.body]), calls, member, top: !!top, src: src.slice(f.start, f.end + 1), masked: body };
  });
  return { fns, strings, code, imports: parseImports(src), lines: L.length };
}
export function parseImports(src) {
  const ns = {}, named = {}, deps = new Set(), thisA = {};
  const clean = p => decodeURIComponent(String(p).replace(/^\.\//, '').split(/[?#]/)[0]);
  for (const m of src.matchAll(/import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g)) { ns[m[1]] = clean(m[2]); deps.add(clean(m[2])); }
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) { deps.add(clean(m[2])); m[1].split(',').forEach(x => { const [a, b] = x.trim().split(/\s+as\s+/); if (a) named[(b || a).trim()] = { spec: clean(m[2]), name: a.trim() }; }); }
  for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*await\s+(?:[\w$.]+\.)?(?:import|load|__load)\(\s*(?:[\w$]+\()?\s*['"]([^'"]+)['"]/g)) { ns[m[1]] = clean(m[2]); deps.add(clean(m[2])); }
  for (const m of src.matchAll(/\[([\w$\s,]+)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g)) { const names = m[1].split(',').map(x => x.trim()), specs = [...m[2].matchAll(/(?:import|load|__load)\(\s*(?:[\w$]+\()?\s*['"]([^'"]+)['"]/g)].map(x => clean(x[1])); names.forEach((nm, i) => { if (nm && specs[i]) { ns[nm] = specs[i]; deps.add(specs[i]); } }); }
  for (const m of src.matchAll(/import\(\s*(?:[\w$]+\()?\s*['"](\.\/[^'"]+|[\w\- ]+\.js)['"]/g)) deps.add(clean(m[1]));
  for (const m of src.matchAll(/this\.([\w$]+)\s*=\s*([\w$]+)\s*[;,]/g)) thisA[m[1]] = m[2];
  return { ns, named, deps: [...deps].filter(d => /\.(js|html|css)$/.test(d)), thisA };
}

/* ---------- HTML / Design Component parser ---------- */
export function parseHTML(src, file = '') {
  const out = { deps: new Set(), links: new Set(), ids: new Set(), scripts: [], libs: new Set() };
  const local = v => v && !/^(https?:|data:|mailto:|javascript:|#|blob:)/i.test(v) && !/\$\{|\{\{/.test(v);
  const clean = v => decodeURIComponent(v.replace(/^\.\//, '').split(/[?#]/)[0]);
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    doc.querySelectorAll('[id]').forEach(e => { if (!/\{\{/.test(e.id)) out.ids.add(e.id); });
    doc.querySelectorAll('script').forEach(s => { const sr = s.getAttribute('src'); if (sr) { if (local(sr)) out.deps.add(clean(sr)); else { try { out.libs.add(new URL(sr).host); } catch (e) {} } } else if (s.textContent.trim()) out.scripts.push({ text: s.textContent, kind: s.hasAttribute('data-dc-script') ? 'dc' : s.type === 'module' ? 'module' : 'classic' }); });
    doc.querySelectorAll('link[href]').forEach(l => { const h = l.getAttribute('href'); if (local(h)) out.deps.add(clean(h)); else { try { out.libs.add(new URL(h).host); } catch (e) {} } });
    doc.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (local(h) && /\.html$/i.test(clean(h))) out.links.add(clean(h)); });
    doc.querySelectorAll('x-import[from]').forEach(x => { const h = x.getAttribute('from'); if (local(h)) out.deps.add(clean(h)); });
    doc.querySelectorAll('dc-import[name]').forEach(x => out.deps.add(x.getAttribute('name') + '.dc.html'));
  } else {
    for (const m of src.matchAll(/\bid="([\w-]+)"/g)) out.ids.add(m[1]);
    for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) { const sr = /src="([^"]+)"/.exec(m[1]); if (sr) { if (local(sr[1])) out.deps.add(clean(sr[1])); } else if (m[2].trim()) out.scripts.push({ text: m[2], kind: /data-dc-script/.test(m[1]) ? 'dc' : /module/.test(m[1]) ? 'module' : 'classic' }); }
    for (const m of src.matchAll(/<a\b[^>]*href="([^"]+)"/g)) if (local(m[1]) && /\.html$/i.test(clean(m[1]))) out.links.add(clean(m[1]));
  }
  for (const s of out.scripts) { const i = src.indexOf(s.text); s.off = i < 0 ? 0 : lineIndex(src.slice(0, i)).length - 1; }
  return out;
}

/* ---------- crawl: follow every local reference from the seed set ---------- */
export function refsOf(text) {
  const out = new Set(), add = v => { if (!v || /^(https?:|data:|mailto:|javascript:|#|blob:)/i.test(v) || /\$\{|\{\{|\+/.test(v)) return; const c = decodeURIComponent(v.replace(/^\.\//, '').split(/[?#]/)[0]); if (/\.(html|js|css)$/i.test(c) && !c.includes('/')) out.add(c); };
  for (const m of text.matchAll(/\b(?:src|href|from)\s*=\s*"([^"]+)"/g)) add(m[1]);
  for (const m of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of text.matchAll(/(?:import|load|__load)\(\s*(?:[\w$]+\()?\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of text.matchAll(/<dc-import[^>]*\bname="([\w\- ]+)"/g)) out.add(m[1] + '.dc.html');
  return [...out];
}
export async function crawl({ seed = SEED, onProgress } = {}) {
  const base = new URL('.', document.baseURI).href, files = new Map(), missing = new Map(), from = new Map(), queue = [...new Set(seed)], tried = new Set();
  while (queue.length) {
    const path = queue.shift(); if (tried.has(path) || SKIP.has(path)) continue; tried.add(path);
    onProgress && onProgress(files.size, path);
    try { const r = await fetch(new URL(path, base).href, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const text = await r.text(); files.set(path, { path, text, bytes: text.length }); const scan = /\.js$/i.test(path) && text.includes('export async function selfTests') ? text.slice(0, text.indexOf('export async function selfTests')) : text; for (const ref of refsOf(scan)) { if (!from.has(ref)) from.set(ref, new Set()); from.get(ref).add(path); if (!tried.has(ref)) queue.push(ref); } }
    catch (e) { missing.set(path, e.message); }
  }
  return { files: [...files.values()], missing: [...missing].filter(([p]) => from.has(p)).map(([path, err]) => ({ path, err, from: [...from.get(path)] })) };
}

/* ---------- clone detection (MinHash over token shingles) ---------- */
const K = 32, SEEDS = Array.from({ length: K }, (_, i) => Math.imul(i + 1, 0x9E3779B1) >>> 0);
const h32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function signature(masked) { const t = (masked.match(/[A-Za-z_$][\w$]*|\d+|[^\s\w]/g) || []).map(x => /^\d/.test(x) ? 'N' : x), sig = new Uint32Array(K).fill(0xFFFFFFFF); if (t.length < 5) return { sig, n: t.length }; for (let i = 0; i + 5 <= t.length; i++) { const h = h32(t.slice(i, i + 5).join(' ')); for (let k = 0; k < K; k++) { const v = (Math.imul(h ^ SEEDS[k], 0x85EBCA6B) ^ (h >>> 13)) >>> 0; if (v < sig[k]) sig[k] = v; } } return { sig, n: t.length }; }
export const similarity = (a, b) => { let e = 0; for (let k = 0; k < K; k++) if (a.sig[k] === b.sig[k]) e++; return e / K; };

/* ---------- analysis ---------- */
export function analyze(files, { tests = [], missing = [], e2e = [], patches = [] } = {}) {
  const t0 = performance.now(), F = new Map(), node = new Map(), edges = [], findings = [];
  const N = (id, type, label, x = {}) => { if (!node.has(id)) node.set(id, { id, type, label, ...x }); return node.get(id); };
  const E = (a, b, type, w = 1) => { if (a && b && a !== b) edges.push({ a, b, type, w }); };
  const find = (sev, kind, title, detail, file, line, fn, action) => findings.push({ id: `${kind}|${file}|${line || 0}|${title}`, sev, kind, title, detail, file, line: line || null, fn: fn || null, action });
  const kindOf = p => /\.dc\.html$/i.test(p) ? 'dc' : /\.html$/i.test(p) ? 'page' : /\.css$/i.test(p) ? 'style' : /\.js$/i.test(p) ? 'module' : 'asset';
  for (const f of files) {
    const rec = { path: f.path, kind: kindOf(f.path), bytes: f.bytes || f.text.length, loc: lineIndex(f.text).length, text: f.text, fns: [], strings: [], deps: new Set(), links: new Set(), ids: new Set(), libs: new Set(), ns: {}, named: {}, thisA: {}, idsUsed: [], dollarIsId: false };
    const absorb = (js, off) => { const p = parseJS(js, f.path, off); p.fns.forEach(fn => { fn.off = off; rec.fns.push(fn); }); rec.strings.push(...p.strings.map(s => ({ ...s, src: js, off }))); Object.assign(rec.ns, p.imports.ns); Object.assign(rec.named, p.imports.named); Object.assign(rec.thisA, p.imports.thisA); p.imports.deps.forEach(d => rec.deps.add(d)); if (/\$\s*=\s*\(?\s*\w+\s*\)?\s*=>\s*document\.getElementById/.test(js)) rec.dollarIsId = true; for (const m of js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]/g)) rec.idsUsed.push({ id: m[1], line: off + lineAt(lineIndex(js), m.index) }); for (const m of js.matchAll(/(?:querySelector(?:All)?|\$)\(\s*['"]#([\w-]+)/g)) rec.idsUsed.push({ id: m[1], line: off + lineAt(lineIndex(js), m.index) }); rec._dollar = (rec._dollar || []).concat([...js.matchAll(/(?<![\w$.])\$\(\s*['"]([\w-]+)['"]\s*\)/g)].map(m => ({ id: m[1], line: off + lineAt(lineIndex(js), m.index) }))); for (const m of js.matchAll(/\bid\s*=\s*\\?["']([\w-]+)\\?["']|\.id\s*=\s*['"]([\w-]+)['"]/g)) rec.ids.add(m[1] || m[2]); };
    if (rec.kind === 'module') absorb(f.text, 0);
    else if (rec.kind === 'page' || rec.kind === 'dc') { const h = parseHTML(f.text, f.path); h.deps.forEach(d => rec.deps.add(d)); h.links.forEach(l => rec.links.add(l)); h.ids.forEach(i => rec.ids.add(i)); h.libs.forEach(l => rec.libs.add(l)); h.scripts.forEach(s => absorb(s.text, s.off)); }
    if (rec.dollarIsId) rec.idsUsed.push(...(rec._dollar || []));
    F.set(f.path, rec);
  }
  const has = p => F.has(p);
  /* nodes: files + functions */
  for (const r of F.values()) { N('F:' + r.path, 'file', r.path, { kind: r.kind, loc: r.loc, bytes: r.bytes, engine: ENGINE.includes(r.path), legacy: LEGACY.has(r.path) }); r.fns.forEach(fn => { fn.id = `${r.path}::${fn.parent ? fn.parent + '.' : ''}${fn.name}@${fn.line}`; }); }
  const allFns = [...F.values()].flatMap(r => r.fns), topFns = allFns.filter(f => f.top);
  topFns.forEach(fn => { N(fn.id, 'fn', fn.name, { file: fn.file, parent: fn.parent, line: fn.line, loc: fn.loc, cc: fn.cc, nest: fn.nest, exported: fn.exported, kind: fn.kind }); E('F:' + fn.file, fn.id, 'contains'); });
  /* imports + links */
  for (const r of F.values()) { r.deps.forEach(d => { if (has(d)) E('F:' + r.path, 'F:' + d, 'imports'); }); r.links.forEach(l => { if (has(l)) E('F:' + r.path, 'F:' + l, 'links'); }); }
  /* call resolution */
  const top = new Map(), exp = new Map();
  for (const r of F.values()) { const t = new Map(), x = new Map(); r.fns.filter(f => f.top).forEach(f => { if (!t.has(f.name) || f.kind !== 'method') t.set(f.name, f); if (f.exported) x.set(f.name, f); }); top.set(r.path, t); exp.set(r.path, x); }
  const fanIn = new Map(), fanOut = new Map(), callers = new Map();
  const link = (a, b, w) => { if (!b || a === b) return; E(a.id, b.id, 'calls', w); fanIn.set(b.id, (fanIn.get(b.id) || 0) + 1); fanOut.set(a.id, (fanOut.get(a.id) || 0) + 1); if (!callers.has(b.id)) callers.set(b.id, []); callers.get(b.id).push(a.id); };
  for (const r of F.values()) for (const fn of r.fns.filter(f => f.top)) {
    const done = new Set(), go = (b, w) => { if (b && !done.has(b.id)) { done.add(b.id); link(fn, b, w); } };
    fn.calls.forEach((w, name) => { const own = top.get(r.path).get(name); if (own && own !== fn) return go(own, w); const im = r.named[name]; if (im && exp.has(im.spec)) go(exp.get(im.spec).get(im.name), w); });
    fn.member.forEach(([obj, name]) => { let spec = r.ns[obj]; if (!spec && obj.startsWith('this.')) { const a = r.thisA[obj.slice(5)]; spec = a && r.ns[a]; if (!spec) { const m = r.fns.find(f => f.top && f.name === name && f.parent === fn.parent && f.kind !== 'class'); if (m && obj === 'this.' + name) return; } } if (obj === 'this') { const m = r.fns.find(f => f.top && f.name === name && f.parent && f.parent === fn.parent); return go(m, 1); } if (spec && exp.has(spec)) go(exp.get(spec).get(name) || top.get(spec).get(name), 1); });
  }
  /* strings → endpoints, storage, events */
  const stores = new Map(), events = new Map(), apis = new Map();
  const fnAt = (r, i, off) => r.fns.filter(f => f.top && f.off === off && f.start <= i && f.end >= i).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  for (const r of F.values()) {
    const seenSrc = new Set();
    for (const s of r.strings) for (const m of s.v.matchAll(/https?:\/\/[^\s'"`<>)\\{}|^]+/g)) { let host; try { host = new URL(m[0].replace(/\$\{….*$/, '')).host; } catch (e) { continue; } if (!host || host.includes('$')) continue; const lib = LIBS.test(host), id = (lib ? 'L:' : 'A:') + host; N(id, lib ? 'lib' : 'api', host); const fn = fnAt(r, s.s, s.off); E(fn ? fn.id : 'F:' + r.path, id, 'net'); if (!apis.has(id)) apis.set(id, { host, lib, users: new Set() }); apis.get(id).users.add(r.path); }
    r.libs.forEach(h => { const id = 'L:' + h; N(id, 'lib', h); E('F:' + r.path, id, 'net'); });
    for (const s of r.strings) { if (seenSrc.has(s.src)) continue; seenSrc.add(s.src);
      const pre = r.path === 'suite-hazards.js' ? 'saltline.hz.' : r.path === 'suite-bio.js' ? 'saltline.bio.' : 'saltline.';
      for (const m of s.src.matchAll(/\b(db|store)\.(get|set)\(\s*['"]([\w.:-]+)['"]\s*[,)]/g)) { const key = (m[1] === 'store' ? pre : 'saltline.') + m[3], id = 'S:' + key; N(id, 'store', key); const fn = fnAt(r, m.index, s.off); E(fn ? fn.id : 'F:' + r.path, id, m[2] === 'get' ? 'reads' : 'writes'); if (!stores.has(key)) stores.set(key, { r: new Set(), w: new Set() }); stores.get(key)[m[2] === 'get' ? 'r' : 'w'].add(r.path); }
      for (const m of s.src.matchAll(/localStorage\.(getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]\s*[,)]/g)) { const key = m[2], id = 'S:' + key; N(id, 'store', key); const fn = fnAt(r, m.index, s.off); E(fn ? fn.id : 'F:' + r.path, id, m[1] === 'getItem' ? 'reads' : 'writes'); if (!stores.has(key)) stores.set(key, { r: new Set(), w: new Set() }); stores.get(key)[m[1] === 'getItem' ? 'r' : 'w'].add(r.path); }
      for (const m of s.src.matchAll(/\bemit\(\s*['"](\w+)['"]/g)) { const id = 'E:' + m[1]; N(id, 'event', m[1]); const fn = fnAt(r, m.index, s.off); E(fn ? fn.id : 'F:' + r.path, id, 'emits'); if (!events.has(m[1])) events.set(m[1], { e: new Set(), l: new Set() }); events.get(m[1]).e.add(r.path); }
    }
  }
  for (const r of F.values()) { const seenSrc = new Set(); for (const s of r.strings) { if (seenSrc.has(s.src)) continue; seenSrc.add(s.src); for (const m of s.src.matchAll(/\btype\s*[!=]==?\s*['"](\w+)['"]/g)) if (events.has(m[1])) { const fn = fnAt(r, m.index, s.off); E('E:' + m[1], fn ? fn.id : 'F:' + r.path, 'listens'); events.get(m[1]).l.add(r.path); } } }
  /* tests */
  const testedBy = new Map();
  tests.forEach((t, i) => { const id = 'T:' + i + ':' + t.name; N(id, 'test', t.name, { ok: t.ok, module: t.module, fn: t.fn, ms: t.ms, detail: t.detail }); const target = (top.get(t.module) || new Map()).get(t.fn); E(id, target ? target.id : 'F:' + t.module, 'tests'); if (target) { if (!testedBy.has(target.id)) testedBy.set(target.id, []); testedBy.get(target.id).push({ name: t.name, ok: t.ok }); } if (!t.ok) find('high', 'test', `Self-test failing: ${t.name}`, t.detail, t.module, target && target.line, target && target.id, 'Open the function, fix it, and re-run the self-tests.'); });
  /* clones */
  const sigs = topFns.filter(f => f.kind !== 'class').map(f => ({ f, s: signature(f.masked) })).filter(x => x.s.n >= 40), dups = [];
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) { const a = sigs[i], b = sigs[j]; if (a.f.file === b.f.file && a.f.parent === b.f.parent) continue; const sim = similarity(a.s, b.s), same = a.f.name === b.f.name && a.f.file !== b.f.file; if (sim >= 0.72 || (same && sim >= 0.3)) dups.push({ a: a.f.id, b: b.f.id, sim, same }); }
  for (const d of dups) { E(d.a, d.b, 'clone', d.sim); const A = node.get(d.a), B = node.get(d.b); if (A.file === B.file && !LEGACY.has(A.file)) find('low', 'clone', `Near-duplicate logic in ${A.file}: ${A.label}() and ${B.label}()`, `${Math.round(d.sim * 100)}% token overlap.`, A.file, A.line, d.a, 'Extract the shared logic into one helper.'); else if (!LEGACY.has(A.file) && !LEGACY.has(B.file)) find('med', 'clone', `Duplicate logic: ${A.label}() in ${A.file} and ${B.label}() in ${B.file}`, `${Math.round(d.sim * 100)}% token overlap${d.same ? ', same name' : ''}. Two copies drift apart over time.`, A.file, A.line, d.a, `Keep one implementation in the engine and import it from ${B.file}.`); }
  /* per-function metrics + risk */
  const engineExp = topFns.filter(f => ENGINE.includes(f.file) && f.exported && f.kind !== 'class');
  for (const fn of topFns) { const n = node.get(fn.id); n.fanIn = fanIn.get(fn.id) || 0; n.fanOut = fanOut.get(fn.id) || 0; n.tests = testedBy.get(fn.id) || []; n.tested = n.tests.length > 0; n.risk = +(fn.cc * (1 + Math.log2(1 + n.fanIn)) * (n.tested ? 0.35 : 1) * (fn.loc > 60 ? 1.2 : 1)).toFixed(1); n.callers = callers.get(fn.id) || []; }
  /* findings */
  for (const m of missing) find('high', 'missing', `Missing file: ${m.path}`, `${m.err}. Referenced from ${m.from.join(', ')}.`, m.from[0], null, null, 'Create the file or remove the reference.');
  for (const r of F.values()) {
    if (r.legacy || LEGACY.has(r.path)) continue;
    if (r.kind === 'page' || r.kind === 'dc') { const miss = new Map(), depIds = new Set([...r.deps].flatMap(d => F.has(d) ? [...F.get(d).ids] : [])); r.idsUsed.forEach(u => { if (!r.ids.has(u.id) && !depIds.has(u.id) && !RUNTIME_IDS.has(u.id) && !miss.has(u.id)) miss.set(u.id, u.line); }); miss.forEach((line, id) => find('high', 'dom', `#${id} is used but never defined in ${r.path}`, 'Code looks the element up by id, but no element or template string defines it, so the lookup returns null.', r.path, line, null, 'Add the element or correct the id.')); }
    const sv = (files.find(f => f.path === 'suite-core.js') || { text: '' }).text.match(/SUITE\s*=\s*\{[^}]*version:\s*'([\d.]+)'/), suiteV = sv ? sv[1] : CG.version;
    const plain = r.text.replace(/https?:\/\/[^\s'"`<>)]+/g, '');
    const vs = new Set([...plain.matchAll(/(?<![@\w.\/-])v(\d+\.\d+\.\d+)\b/g)].map(m => m[1]).concat([...plain.matchAll(/\bversion:\s*['"](\d+\.\d+\.\d+)['"]/g)].map(m => m[1])));
    vs.forEach(v => { if (v !== suiteV) { const i = plain.indexOf(v); find('med', 'version', `${r.path} shows version ${v}; the suite is ${suiteV}`, 'Version labels disagree with the engine, so users and the Tester report different builds.', r.path, lineAt(lineIndex(plain), i), null, `Replace ${v} with ${suiteV}, or read the version from SUITE.`); } });
    for (const m of r.text.matchAll(/(?:\/\/|\/\*|<!--)[^\n]*\b(TODO|FIXME|HACK)\b[^\n]*/g)) find('low', 'todo', `${m[1]} in ${r.path}`, m[0].trim().slice(0, 160), r.path, lineAt(lineIndex(r.text), m.index), null, 'Resolve or ticket it.');
    for (const fn of r.fns.filter(f => f.top && f.kind !== 'class')) {
      const n = node.get(fn.id);
      if (fn.cc >= 15 && !n.tested) find(fn.cc >= 25 ? 'high' : 'med', 'complex', `${fn.name}() has complexity ${fn.cc} and no test`, `${fn.loc} lines, nesting ${fn.nest}, called from ${n.fanIn} place${n.fanIn === 1 ? '' : 's'}.`, r.path, fn.line, fn.id, 'Add a self-test that pins its behaviour, then split it.');
      else if (fn.loc >= 120) find('low', 'long', `${fn.name}() is ${fn.loc} lines long`, `Complexity ${fn.cc}.`, r.path, fn.line, fn.id, 'Split into smaller functions.');
      if (/(?<![\w$.])fetch\s*\(/.test(fn.masked) && !/AbortController|signal|timeout/.test(fn.src)) find('low', 'net', `${fn.name}() calls fetch without a timeout`, 'A stalled endpoint leaves the caller waiting indefinitely.', r.path, fn.line, fn.id, 'Route it through a fetch helper with an AbortController.');
    }
  }
  engineExp.filter(f => !node.get(f.id).tested && f.file !== 'suite-patch.js').forEach(f => find('low', 'untested', `${f.name}() in ${f.file} is exported but untested`, `Complexity ${f.cc}, ${node.get(f.id).fanIn} caller${node.get(f.id).fanIn === 1 ? '' : 's'}.`, f.file, f.line, f.id, 'Add a self-test.'));
  const allText = [...F.values()].map(r => r.text).join('\n');
  topFns.filter(f => f.exported && ENGINE.includes(f.file) && !(fanIn.get(f.id)) && (allText.split(new RegExp('\\b' + f.name.replace(/\$/g, '\\$') + '\\b')).length - 1) <= 1).forEach(f => find('low', 'unused', `${f.name}() in ${f.file} is exported but never used`, 'No other file references it.', f.file, f.line, f.id, 'Remove it or wire it in.'));
  stores.forEach((v, k) => { if (v.w.size && !v.r.size && !/patch|theme/.test(k)) find('low', 'store', `Storage key ${k} is written but never read`, `Written by ${[...v.w].join(', ')}.`, [...v.w][0], null, null, 'Read it somewhere or stop writing it.'); });
  const linked = new Set(edges.filter(e => e.type === 'links').map(e => e.b.slice(2)));
  [...F.values()].filter(r => (r.kind === 'page' || r.kind === 'dc') && !ENTRY.includes(r.path) && !linked.has(r.path) && !LEGACY.has(r.path)).forEach(r => find('low', 'orphan', `${r.path} is not linked from any page`, 'Users can only reach it by URL or the ⌘K palette.', r.path, null, null, 'Link it from the Console rail or a related page.'));
  e2e.forEach(x => { if (x.errors && x.errors.length) find('high', 'e2e', `${x.page} throws on load`, x.errors.slice(0, 3).join(' · '), x.page, null, null, 'Open the page, reproduce, fix.'); else if (!x.ok) find('med', 'e2e', `${x.page} fails its end-to-end check`, (x.checks || []).filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`).join(' · '), x.page, null, null, 'Open the page and check what did not render.'); });
  patches.filter(p => p.stale).forEach(p => find('med', 'patch', `Patch for ${p.file} is stale`, 'The file changed since the patch was made, so it is no longer applied.', p.file, null, p.fnId || null, 'Re-create the patch against the current file or discard it.'));
  /* metrics */
  const SEV = { high: 0, med: 1, low: 2 }; findings.sort((a, b) => SEV[a.sev] - SEV[b.sev]);
  const testedExp = engineExp.filter(f => node.get(f.id).tested).length, rf = [...F.values()].filter(r => !LEGACY.has(r.path));
  const metrics = { files: F.size, loc: rf.reduce((a, r) => a + r.loc, 0), bytes: rf.reduce((a, r) => a + r.bytes, 0), fns: topFns.length, inner: allFns.length - topFns.length, calls: edges.filter(e => e.type === 'calls').length, edges: edges.length, nodes: node.size, coverage: engineExp.length ? testedExp / engineExp.length : 0, testedExp, engineExp: engineExp.length, avgCC: topFns.length ? +(topFns.reduce((a, f) => a + f.cc, 0) / topFns.length).toFixed(1) : 0, maxCC: Math.max(0, ...topFns.map(f => f.cc)), high: findings.filter(f => f.sev === 'high').length, med: findings.filter(f => f.sev === 'med').length, low: findings.filter(f => f.sev === 'low').length, clones: dups.length, apis: [...apis.values()].filter(a => !a.lib).length, stores: stores.size, events: events.size, ms: Math.round(performance.now() - t0) };
  const filesOut = [...F.values()].map(r => ({ path: r.path, kind: r.kind, loc: r.loc, bytes: r.bytes, fns: r.fns.filter(f => f.top).length, engine: ENGINE.includes(r.path), legacy: LEGACY.has(r.path), imports: [...r.deps].filter(has), importedBy: [...F.values()].filter(o => o.deps.has(r.path)).map(o => o.path), links: [...r.links].filter(has), linkedFrom: [...F.values()].filter(o => o.links.has(r.path)).map(o => o.path), findings: findings.filter(f => f.file === r.path).length, text: r.text }));
  const fnsOut = topFns.filter(f => f.kind !== 'class').map(f => ({ ...node.get(f.id), src: f.src, start: f.start, end: f.end, off: f.off, callees: edges.filter(e => e.type === 'calls' && e.a === f.id).map(e => e.b) }));
  return { t: Date.now(), version: CG.version, nodes: [...node.values()], edges, findings, metrics, files: filesOut, fns: fnsOut, stores: [...stores].map(([k, v]) => ({ key: k, readers: [...v.r], writers: [...v.w] })), events: [...events].map(([k, v]) => ({ name: k, emitters: [...v.e], listeners: [...v.l] })), apis: [...apis].map(([id, v]) => ({ id, host: v.host, lib: v.lib, users: [...v.users] })), clones: dups };
}

/* ---------- end-to-end page checks in sandboxed iframes ---------- */
export const E2E = { 'Command Center.html': { sel: '#kpis .kpi', min: 6 }, 'Observatory.dc.html': { text: 'Every live hazard' }, 'Biodiversity.dc.html': { text: 'Biodiversity' }, 'Tester.html': { sel: '#runCode' }, 'Market.dc.html': { text: 'Capability matrix' }, 'Dossier.html': { minText: 200 }, 'Onboarding.html': { minText: 100 }, 'Field Tools.html': { minText: 400 }, 'Impact Assessment.html': { minText: 300 } };
export async function runE2E(pages, { settle = 4500, onProgress } = {}) {
  const base = new URL('.', document.baseURI).href, out = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i], errs = []; onProgress && onProgress(i, pages.length, page);
    let html; try { const r = await fetch(new URL(page, base).href, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); html = await r.text(); } catch (e) { out.push({ page, ok: false, errors: ['could not fetch: ' + e.message], checks: [], ms: 0, t: Date.now() }); continue; }
    const hook = `<base href="${base}"><script>(function(){var K=${JSON.stringify(page)};function r(m){try{parent.__e2e&&parent.__e2e(K,String(m).slice(0,300))}catch(e){}}addEventListener('error',function(e){if(e.target&&e.target!==window&&e.target.tagName){return}r((e.message||'error')+(e.filename?' @'+e.filename.split('/').pop()+':'+e.lineno:''))},true);addEventListener('unhandledrejection',function(e){r('unhandled rejection: '+(e.reason&&(e.reason.message||e.reason)))});var o=console.error;console.error=function(){r('console.error: '+Array.prototype.map.call(arguments,function(a){return a&&a.message?a.message:typeof a==='object'?(function(){try{return JSON.stringify(a)}catch(x){return String(a)}})():String(a)}).join(' '));return o.apply(console,arguments)}})();<\/script>`;
    const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + hook) : hook + html;
    window.__e2e = (k, m) => { if (k === page) errs.push(m); };
    const fr = document.createElement('iframe'), t0 = performance.now();
    fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;left:-30000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none';
    const loaded = new Promise(r => { fr.onload = r; setTimeout(r, 15000); });
    fr.srcdoc = doc; document.body.appendChild(fr); await loaded; const ms = Math.round(performance.now() - t0);
    await new Promise(r => setTimeout(r, settle));
    const spec = E2E[page] || {}, checks = [];
    try { const d = fr.contentDocument, txt = ((d.body && d.body.innerText) || '').trim(); checks.push({ name: 'renders content', ok: txt.length >= (spec.minText || 120), detail: txt.length.toLocaleString('en') + ' characters' }); if (spec.sel) { const k = d.querySelectorAll(spec.sel).length; checks.push({ name: spec.sel, ok: k >= (spec.min || 1), detail: k + ' found' }); } if (spec.text) checks.push({ name: `shows “${spec.text}”`, ok: txt.includes(spec.text), detail: txt.includes(spec.text) ? 'found' : 'not found' }); }
    catch (e) { checks.push({ name: 'inspect page', ok: false, detail: e.message }); }
    fr.remove();
    out.push({ page, ok: !errs.length && checks.every(c => c.ok), errors: errs, checks, ms, t: Date.now() });
  }
  delete window.__e2e; return out;
}

/* ---------- patches ---------- */
export const replaceRange = (text, start, end, code) => text.slice(0, start) + code + text.slice(end + 1);
export function exportsOf(src) { const p = parseJS(src); return p.fns.filter(f => f.exported).map(f => f.name).concat([...src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?![^;]*=>)/g)].map(m => m[1])).sort(); }
export function improvePrompt(fn, file, findings) { return { system: 'You are a senior JavaScript engineer improving one function in a browser ES-module codebase (no build step, no npm). Reply with ONLY a JSON object: {"code": "<the complete replacement source for this function, same name, same parameters, same export keyword>", "why": "<two or three plain sentences>"}. Do not add imports. Keep behaviour that callers and tests depend on. Prefer clarity, fewer branches, guarded network calls and no duplicated logic.', user: `File: ${file}\nFunction: ${fn.label}() at line ${fn.line} · complexity ${fn.cc} · ${fn.loc} lines · ${fn.fanIn} callers · tests: ${(fn.tests || []).map(t => t.name).join('; ') || 'none'}\nFindings: ${findings.map(f => f.title).join('; ') || 'none'}\n\nSOURCE\n${fn.src}` }; }
export function parseImprovement(t) { const s = String(t || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim(), m = /\{[\s\S]*\}/.exec(s); if (!m) throw new Error('No JSON in the reply'); const j = JSON.parse(m[0]); if (!j.code || typeof j.code !== 'string') throw new Error('Reply has no code'); return { code: j.code.trim(), why: String(j.why || '').trim() }; }

/* ---------- self-tests ---------- */
export async function selfTests() {
  const out = [], M = 'suite-codegraph.js', A = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const T = async (name, fn, body) => { const t0 = performance.now(); try { const d = await body(); out.push({ name, module: M, fn, ok: true, detail: String(d ?? 'ok'), ms: +(performance.now() - t0).toFixed(1) }); } catch (e) { out.push({ name, module: M, fn, ok: false, detail: e.message || String(e), ms: +(performance.now() - t0).toFixed(1) }); } };
  const FIX = "import * as H from './h.js';\nimport { foo as bar } from './b.js';\n// function fake() {}\nconst s = \"function notReal() {}\", r = /[{}]/g, t = `a ${s.length} {`;\nexport function alpha(x, y) { if (x && y) { return H.beta(x); } for (const k of y) bar(k); return x ? 1 : 2; }\nexport const gamma = async (a) => { try { await alpha(a, []); } catch (e) {} };\nconst delta = z => z * 2;\nclass Thing { constructor() { this.H = H; } run(q) { return this.H.beta(q) || delta(q); } }\n";
  await T('mask() blanks strings, comments and regex bodies', 'mask', () => { const m = mask(FIX); A(m.code.length === FIX.length, 'length changed'); A(!/notReal|fake/.test(m.code), 'string or comment leaked'); A(!/\[\{\}\]/.test(m.code), 'regex body leaked'); A(m.code.includes('s.length'), 'template expression lost'); return `${m.strings.length} strings masked`; });
  await T('parseJS() finds functions, arrows, classes and methods', 'parseJS', () => { const names = parseJS(FIX).fns.map(f => f.name); ['alpha', 'gamma', 'delta', 'Thing', 'run'].forEach(n => A(names.includes(n), 'missing ' + n)); A(!names.includes('fake') && !names.includes('notReal'), 'phantom function'); return names.join(', '); });
  await T('parseJS() measures cyclomatic complexity', 'parseJS', () => { const a = parseJS(FIX).fns.find(f => f.name === 'alpha'); A(a.cc === 5, 'cc ' + a.cc); A(a.exported, 'export flag'); return 'alpha() cc 5'; });
  await T('analyze() resolves calls across imports and aliases', 'analyze', () => { const g = analyze([{ path: 'a.js', text: FIX }, { path: 'h.js', text: 'export function beta(v) { return v; }' }, { path: 'b.js', text: 'export function foo(k) { return k; }' }]); const c = g.edges.filter(e => e.type === 'calls').map(e => e.a.split('::')[1].split('@')[0] + '>' + e.b.split('::')[1].split('@')[0]); ['alpha>beta', 'alpha>foo', 'gamma>alpha', 'Thing.run>beta', 'Thing.run>delta'].forEach(x => A(c.includes(x), 'missing edge ' + x + ' in ' + c.join(' '))); return c.length + ' call edges'; });
  await T('analyze() flags DOM ids used but never defined', 'analyze', () => { const g = analyze([{ path: 'p.html', text: '<div id="a"></div><script>document.getElementById("a"); document.getElementById("ghost");</script>' }]); const d = g.findings.filter(f => f.kind === 'dom'); A(d.length === 1 && /ghost/.test(d[0].title), JSON.stringify(d)); return '#ghost caught'; });
  await T('analyze() detects cloned logic across files', 'analyze', () => { const body = '{ const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))); }'; const g = analyze([{ path: 'x.js', text: 'export function km(a, b, c, d) ' + body }, { path: 'y.js', text: 'export function dist(a, b, c, d) ' + body }]); A(g.findings.some(f => f.kind === 'clone'), 'clone missed'); return 'km() ≈ dist()'; });
  await T('analyze() flags version drift, ignoring library URLs', 'analyze', () => { const g = analyze([{ path: 'suite-core.js', text: "export const SUITE = { name: 'S', version: '1.3.0' };" }, { path: 'p.html', text: '<script src="https://unpkg.com/d3@7.9.0/d.js"></script><small>Console · v1.2.0</small>' }]); const v = g.findings.filter(f => f.kind === 'version'); A(v.length === 1 && /1\.2\.0/.test(v[0].title), JSON.stringify(v)); return 'v1.2.0 caught · d3@7.9.0 ignored'; });
  await T('refsOf() follows imports, links and dc-imports', 'refsOf', () => { const r = refsOf('<a href="Tester.html">t</a><script src="suite-theme.js"></script><dc-import name="Card"></dc-import><script type="module">import * as C from \'./suite-core.js\'; import(u(\'suite-hazards.js\'));</script><a href="https://x.org/a.html">x</a>'); ['Tester.html', 'suite-theme.js', 'Card.dc.html', 'suite-core.js', 'suite-hazards.js'].forEach(x => A(r.includes(x), 'missing ' + x)); A(!r.some(x => /x\.org/.test(x)), 'external followed'); return r.length + ' refs'; });
  await T('replaceRange() + exportsOf() keep a module\'s API stable', 'exportsOf', () => { const src = 'export function a() { return 1; }\nexport const b = () => 2;\n', f = parseJS(src).fns.find(x => x.name === 'a'), next = replaceRange(src, f.start, f.end, 'export function a() { return 3; }'); A(/return 3/.test(next) && exportsOf(next).join() === exportsOf(src).join(), next); return 'a, b preserved'; });
  await T('parseImprovement() reads a fenced JSON reply', 'parseImprovement', () => { const r = parseImprovement('```json\n{"code":"export function a() { return 1; }","why":"Simpler."}\n```'); A(r.code.startsWith('export function a') && r.why === 'Simpler.', JSON.stringify(r)); return 'code + why'; });
  const passed = out.filter(o => o.ok).length;
  return { t: Date.now(), items: out, total: out.length, passed, pass: passed === out.length, version: CG.version };
}
