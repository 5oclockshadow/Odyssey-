// test-suites.js — one registry that unifies every test suite in the codebase into a single runnable shape.
// A suite is loaded lazily and normalised to { tests:[{id,name,group,run}] } or { batch(emit) }.
// A broken module surfaces as a load error instead of taking the whole console down.
// It also carries the codebase map (which source files each suite covers) and a CRUD classifier,
// so the tester, the agent graph and the codebase are read from one place.

const t0 = () => performance.now();
const since = s => Math.round(performance.now() - s);
const str = v => String(v == null ? '' : v);

// ── Normalising adapters ──────────────────────────────────────────────────
// Shape A: TESTS[{id,name,group,fn}] — fn returns an evidence string or throws.
const fromFn = list => list.map(t => ({
  id: t.id, name: t.name, group: t.group || 'general',
  run: async () => { const s = t0(); try { const ev = await t.fn(); return { pass: true, evidence: str(ev), ms: since(s) }; } catch (e) { return { pass: false, evidence: str(e && e.message || e), ms: since(s) }; } },
}));
// Shape B: TESTS[{id,name,claim,run(E)}] — run returns {pass,evidence,value}.
const fromRun = (list, E) => list.map(t => ({
  id: t.id, name: t.name, group: t.claim || 'general',
  run: async () => { const s = t0(); try { const r = await t.run(E); return { pass: !!r.pass, evidence: str(r.evidence), value: r.value, ms: since(s) }; } catch (e) { return { pass: false, evidence: 'threw: ' + str(e && e.message || e), ms: since(s) }; } },
}));

// ── The registry (metadata only — no imports happen here) ─────────────────
export const SPECS = [
  { id: 'engine', kind: 'run', layer: 'Core reasoning', title: 'Reasoning engine', file: 'thought-tests.js', hint: 30,
    blurb: 'SELF-DISCOVER modules, grounding, graph intelligence, plasticity, persistence',
    covers: ['thought-engine.js'], load: () => import('./thought-tests.js') },
  { id: 'mind', kind: 'fn', layer: 'Core reasoning', title: 'Free-running mind', file: 'thought-mind-tests.js', hint: 9,
    blurb: 'Autonomous thinking, drives that answer the map, live Claude choices, safe fallback',
    covers: ['thought-mind.js'], load: () => import('./thought-mind-tests.js') },
  { id: 'lenses', kind: 'fn', layer: 'Core reasoning', title: 'Dynamic lenses', file: 'thought-lens-tests.js', hint: 5,
    blurb: 'Angle suggestions that follow the thought, looking, wander, used-lens decay',
    covers: ['thought-lenses.js'], load: () => import('./thought-lens-tests.js') },
  { id: 'bag', kind: 'fn', layer: 'Core reasoning', title: 'Bag, shake & parser', file: 'thought-bag-tests.js', hint: 30,
    blurb: 'Shake parser, graph invariants, degree integrity, no duplicate or dangling edges',
    covers: ['thought-bag.js', 'thought-shake.js'], load: () => import('./thought-bag-tests.js') },
  { id: 'atlas', kind: 'fn', layer: 'Atlas', title: 'Atlas engine', file: 'atlas-tests.js', hint: 35,
    blurb: 'Packs, levels, editing, views, gap-finding, Markdown and outline round-trips',
    covers: ['atlas-engine.js', 'atlas-packs.js', 'atlas-views.js'], load: () => import('./atlas-tests.js') },
  { id: 'assist', kind: 'fnAll', layer: 'Atlas', title: 'Steering & placement', file: 'atlas-assist-tests.js', hint: 14,
    blurb: 'Field steering, type inference per domain, where a dropped idea lands, auto-growth',
    covers: ['atlas-assist.js'], load: () => import('./atlas-assist-tests.js') },
  { id: 'atlaslens', kind: 'fn', layer: 'Atlas', title: 'Sub-maps & paths', file: 'atlas-lens-tests.js', hint: 12,
    blurb: 'Into / for / from sub-maps, scaffolds, custom reading contexts',
    covers: ['atlas-lens.js'], load: () => import('./atlas-lens-tests.js') },
  { id: 'api', kind: 'fn', layer: 'Backend', title: 'Waitlist API', file: 'tandem-tests.js', hint: 18,
    blurb: 'Handler routes, validation, rate limits, referrals, tiers, admin auth, CSV export',
    covers: ['tandem-api.js', 'server/handler.js', 'server/validate.js'], load: () => import('./tandem-tests.js') },
  { id: 'security', kind: 'security', layer: 'Backend', title: 'Security & audit', file: 'server/security-tests.js', hint: 9,
    blurb: 'Admin auth fails closed, CSV formula-injection neutralised, constant-time compare, audit redaction',
    covers: ['server/handler.js'], load: () => import('./server/handler.js') },
  { id: 'scenario', kind: 'fnAll', layer: 'Integration', title: 'End-to-end scenarios', file: 'scenario-suite.js', hint: 8,
    blurb: 'Whole sessions — grow, drop, answer, sub-map, route, export, import — invariants checked after every move',
    covers: ['atlas-engine.js', 'atlas-assist.js', 'atlas-lens.js', 'thought-bag.js', 'tandem-api.js', 'server/handler.js'], load: () => import('./scenario-suite.js') },
  { id: 'sim', kind: 'mega', layer: 'Integration', title: 'Live simulation · graph-intelligent agent', file: 'mega-tests.js', heavy: true,
    blurb: 'Each person opens a real-sized map, asks their own question, runs their real tasks. The tester is the agent; the agent reads the graph.',
    covers: ['mega-tests.js', 'mega-cases.js', 'mega-corpus.js', 'mega-agent.js', 'mega-dspy.js', 'mega-docs.js', 'thought-trust.js', 'thought-rewrite.js', 'suite-core.js', 'suite-learn.js', 'suite-views.js'],
    load: () => import('./mega-tests.js') },
];

// ── Load + normalise one suite (returns runnable tests or a batch runner) ──
export async function loadSuite(spec) {
  const mod = await spec.load();
  if (spec.kind === 'run') { const E = await import('./thought-engine.js'); return { tests: fromRun(mod.TESTS, E), claims: mod.CLAIMS || null, E, mod }; }
  if (spec.kind === 'fn') return { tests: fromFn(mod.TESTS), mod };
  if (spec.kind === 'fnAll') return { tests: fromFn(mod.ALL || mod.TESTS), mod };
  if (spec.kind === 'security') {
    const ST = await import('./server/security-tests.js');
    return { batch: async emit => { const out = await ST.runSecurityTests(mod.handle, mod.safeEq, mod.csvCell); return out.map((r, i) => { const row = { id: r.id + '·' + (i + 1), name: r.name, group: (r.id.split('-')[0] || 'sec'), pass: !!r.ok, evidence: str(r.detail), ms: 0 }; emit && emit(row); return row; }); } };
  }
  if (spec.kind === 'mega') {
    const PEOPLE = mod.PEOPLE, opts = { net: false, live: false, battery: false, retries: 0 };
    return { people: PEOPLE, batch: async (emit, which) => {
      const list = which && which.length ? which : PEOPLE, out = [];
      for (const p of list) {
        const s = t0(); let row;
        try { const { rows } = await mod.runPerson(p, opts); const fails = rows.filter(r => r.verdict === 'fail'), slow = rows.filter(r => r.verdict === 'slow'), pass = rows.filter(r => r.verdict === 'pass').length;
          row = { id: p.id, name: p.name, group: p.cat, pass: fails.length === 0, slow: slow.length, evidence: pass + ' steps passed' + (slow.length ? ', ' + slow.length + ' over budget' : '') + (fails.length ? ' — FAILED ' + fails[0].label + ': ' + str(fails[0].out).split('\n')[0] : ' · map answered its own question'), ms: since(s) };
        } catch (e) { row = { id: p.id, name: p.name, group: p.cat || 'sim', pass: false, evidence: 'threw: ' + str(e && e.message || e), ms: since(s) }; }
        out.push(row); emit && emit(row);
      }
      return out;
    } };
  }
  throw new Error('unknown suite kind ' + spec.kind);
}

// ── The codebase, by layer. Coverage is read against SPECS.covers ─────────
export const FILES = {
  'Core reasoning': ['thought-engine.js', 'thought-mind.js', 'thought-lenses.js', 'thought-bag.js', 'thought-shake.js', 'thought-rewrite.js', 'thought-trust.js'],
  'Atlas': ['atlas-engine.js', 'atlas-assist.js', 'atlas-lens.js', 'atlas-packs.js', 'atlas-views.js'],
  'Backend': ['tandem-api.js', 'tandem-core.js', 'server/handler.js', 'server/validate.js', 'server/store-sqlite.js', 'server/worker.js', 'server/emails.js'],
  'Simulation & suite': ['mega-tests.js', 'mega-cases.js', 'mega-corpus.js', 'mega-agent.js', 'mega-dspy.js', 'mega-docs.js', 'mega-views.js', 'mega-topics.js', 'suite-core.js', 'suite-views.js', 'suite-learn.js', 'suite-agent.js', 'suite-ai.js', 'suite-chem.js', 'suite-evidence.js', 'suite-grade.js'],
  'Runtime': ['storage.js', 'twin-runtime.js', 'usecases-data.js', 'doc-page.js'],
};

// level: 'unit' if a non-heavy suite covers it, 'integration' if only a heavy suite does, 'none' otherwise.
export function coverage() {
  const byFile = {};
  for (const files of Object.values(FILES)) for (const f of files) byFile[f] = { file: f, suites: [], level: 'none' };
  for (const s of SPECS) for (const f of s.covers) { const e = byFile[f] || (byFile[f] = { file: f, suites: [], level: 'none' }); e.suites.push(s.id); if (!s.heavy) e.level = 'unit'; else if (e.level === 'none') e.level = 'integration'; }
  const all = Object.values(byFile);
  return { byFile, files: all, unit: all.filter(e => e.level === 'unit').length, integration: all.filter(e => e.level === 'integration').length, none: all.filter(e => e.level === 'none').length, total: all.length };
}

// ── CRUD classifier — which of create/read/update/delete a test exercises ──
export const CRUD = {
  create: ['add', 'create', 'seed', 'ingest', 'grow', 'insert', 'born', 'signup', 'sign up', 'join', 'parse', 'import', 'drop', 'research', 'shake', 'expand', 'build', 'pattern', 'attach', 'queue', 'save a note'],
  read: ['read', 'search', 'query', 'find', 'overview', 'ask', 'answer', 'metric', 'centrality', 'hub', 'bridge', 'communit', 'table', 'column', 'level', 'flow', 'radial', 'detect', 'stat', 'get', 'health', 'position', 'tier', 'hop', 'path', 'suggest', 'lens', 'sub-map', 'submap', 'tension', 'report', 'answers its', 'question'],
  update: ['update', 'verify', 'rewrite', 'merge', 'move', 'edit', 'consolidate', 'steer', 'retype', 'evolve', 'learn', 'hebbian', 'plasticit', 'sleep', 'strengthen', 'challenge', 'project', 'fold', 'settle', 'redact', 'tidy', 'activat', 'rename', 'upgrade', 'survey', 'reparent', 're-parent', 're-sort', 'referral'],
  delete: ['delete', 'remove', 'prune', 'cull', 'undo', 'forget', 'unfold', 'reject', 'refuse', 'denied', 'cannot', 'stops', 'stop', '404', 'rate limit', 'guard', 'fail', 'closed', 'neutralis'],
};
export function crudOf(text) {
  const s = String(text || '').toLowerCase(), out = new Set();
  for (const op of ['create', 'read', 'update', 'delete']) if (CRUD[op].some(k => s.includes(k))) out.add(op);
  if (!out.size) out.add('read');
  return out;
}
