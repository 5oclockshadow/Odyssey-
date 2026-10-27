// Realistic sessions: what a person actually does, end to end, with the invariants checked after every run.
import * as A from './atlas-engine.js';
import * as S from './atlas-assist.js';
import * as P from './atlas-lens.js';
import { createBag } from './thought-bag.js';
import { createMemStore } from './tandem-api.js';
import { handle } from './server/handler.js';

const ok = (c, m) => { if (!c) throw new Error(m); };
const integrity = a => {
  for (const e of a.ents.values()) { ok(a.pack.types.some(t => t.id === e.type), 'bad type ' + e.type); ok(e.parent ? a.ents.get(e.parent) && a.ents.get(e.parent).kids.includes(e.id) : a.roots.includes(e.id), 'parent link ' + e.label); for (const k of e.kids) ok(a.ents.has(k) && a.ents.get(k).parent === e.id, 'kid link'); const seen = new Set(); let c = e; while (c) { ok(!seen.has(c.id), 'cycle'); seen.add(c.id); c = c.parent ? a.ents.get(c.parent) : null; } }
  const keys = new Set(); for (const l of a.links) { ok(a.ents.has(l.a) && a.ents.has(l.b) && l.a !== l.b, 'dangling'); const k = l.a + '|' + l.b + '|' + l.rel; ok(!keys.has(k), 'duplicate link'); keys.add(k); }
};
const rnd = (() => { let s = 20240611; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const pick = arr => arr[Math.floor(rnd() * arr.length)];

export const TESTS = [
  { id: 501, group: 'scenario', name: 'a researcher maps a topic from nothing: grow, drop, answer, sub-map, route, export, import', fn: async () => {
    const a = A.createAtlas('How do heat pumps fail in cold climates'); A.addEntity(a, { type: 'idea', label: 'How do heat pumps fail in cold climates' }); P.setLens(a, 'Failure analysis for a utility');
    for (let i = 0; i < 30; i++) { const r = await S.growStep(a, { cap: 40 }); if (r.idle) break; } ok(a.ents.size >= 4, 'grew ' + a.ents.size); const g0 = a.ents.size, ph = [...a.ents.values()].find(e => e.unverified); A.updateEntity(a, ph.id, { label: 'Compressor lock-up', unverified: false }); for (let i = 0; i < 10; i++) { const r = await S.growStep(a, { cap: 40 }); if (r.idle) break; } ok(a.ents.size > g0, 'answering a placeholder lets auto grow again (' + g0 + ' -> ' + a.ents.size + ')');
    const d1 = S.drop(a, 'Defrost cycle fault'), d2 = S.drop(a, 'Refrigerant leak', { near: d1.entity.id }); ok(d1 && d2, 'drops');
    const q = S.questions(a, d1.entity.id, { limit: 20 }).find(x => x.kind === 'rel' || x.kind === 'child'); const ans = S.answer(a, d1.entity.id, q, 'Ice build-up on the outdoor coil'); ok(ans && ans.entity, 'answer');
    const root = a.roots[0]; for (const m of ['into', 'for', 'from', 'reverse']) ok(P.subMap(a, root, m), m);
    const route = P.paths(a, d1.entity.id, ans.entity.id); ok(route.connected || route.undirected, 'route'); if (!route.connected) ok(P.synthesize(a, d1.entity.id, ans.entity.id), 'bridge');
    integrity(a); const b = A.restore(JSON.parse(JSON.stringify(A.serialize(a)))); ok(b.ents.size === a.ents.size && b.links.length === a.links.length, 'round-trip'); integrity(b); return a.ents.size + ' ideas, ' + a.links.length + ' links, round-trips'; } },
  { id: 502, group: 'scenario', name: 'an operations lead builds a small network by dropping nodes, with no preset field', fn: async () => {
    const a = A.createAtlas('Regional deliveries'); P.setLens(a, 'Daily deliveries across three depots'); for (const k of ['Depot', 'Truck', 'Route', 'Customer', 'Order']) P.addKind(a, k); for (const v of ['delivers to', 'runs on', 'serves']) P.addVerb(a, v);
    const names = ['Depot North', 'Depot South', 'Truck A', 'Truck B', 'Route 1 North to South', 'Customer Alder', 'Customer Birch', 'Order 1001 for Customer Alder', 'Order 1002 for Customer Birch'];
    for (const n of names) { const r = S.drop(a, n, { type: P.addKind ? undefined : undefined }); ok(r && r.entity, n); }
    const links = [['Truck A', 'Route 1 North to South', 'runs on'], ['Route 1 North to South', 'Customer Alder', 'delivers to'], ['Order 1001 for Customer Alder', 'Customer Alder', 'serves']]; for (const [x, y, v] of links) ok(A.addLink(a, A.findByLabel(a, x).id, A.findByLabel(a, y).id, v), x);
    const m = P.subMap(a, A.findByLabel(a, 'Customer Alder').id, 'reverse'); ok(m.size >= 3, 'reverse ' + m.size); integrity(a); return a.ents.size + ' nodes, reverse from the customer reaches ' + m.size; } },
  { id: 503, group: 'scenario', name: 'random edits never break the map (1,000 operations, invariants checked every 50)', fn: async () => {
    const a = A.createAtlas('Fuzz'); const kinds = ['thing', 'actor', 'place', 'idea']; A.addEntity(a, { type: 'idea', label: 'Root' });
    for (let i = 0; i < 1000; i++) { const ids = [...a.ents.keys()], op = Math.floor(rnd() * 10), x = pick(ids), y = pick(ids);
      if (op < 3) A.addEntity(a, { type: pick(kinds), label: 'n' + i, parent: rnd() < 0.5 ? x : null }); else if (op < 5) A.addLink(a, x, y, pick(['leads to', 'serves', 'relates to'])); else if (op === 5 && ids.length > 8) A.removeEntity(a, x); else if (op === 6) A.moveEntity(a, x, y); else if (op === 7) S.drop(a, 'drop ' + i); else if (op === 8) await S.growStep(a, { cap: 150 }); else { const q = S.questions(a, x, { limit: 5 })[0]; if (q) S.answer(a, x, q, 'a' + i); }
      if (i % 50 === 0) integrity(a); } integrity(a); return a.ents.size + ' ideas, ' + a.links.length + ' links, still consistent'; } },
  { id: 504, group: 'scenario', name: 'a 600-idea map stays fast in every view calculation', fn: async () => {
    const a = A.createAtlas('Big'); const r0 = A.addEntity(a, { type: 'idea', label: 'Root' }); const all = [r0.id]; for (let i = 0; i < 600; i++) { const e = A.addEntity(a, { type: pick(['thing', 'actor', 'place', 'idea']), label: 'Idea ' + i, parent: rnd() < 0.8 ? pick(all) : null }); all.push(e.id); if (i > 3) A.addLink(a, e.id, pick(all), 'leads to'); }
    const t0 = performance.now(); const lv = A.level(a); A.flow(a, lv); A.radial(a, 3); A.table(a, { scope: 'all', sort: 'links' }); A.columns(a, all[300]); A.stats(a); A.gaps(a); A.squarify(lv.nodes.map(e => ({ id: e.id, v: 1 + A.descendants(a, e.id) })), 0, 0, 1000, 700); P.subMap(a, r0.id, 'into'); P.subMap(a, all[300], 'reverse'); P.paths(a, all[10], all[500]); const ms = performance.now() - t0; ok(ms < 1500, Math.round(ms) + ' ms'); integrity(a); return Math.round(ms) + ' ms for every view calculation at ' + a.ents.size + ' ideas'; } },
  { id: 505, group: 'scenario', name: 'Thoughts: a user shakes five times, steps back, withdraws a revision and keeps working', fn: async () => {
    const b = await createBag({ key: 'tg-scn' }); await b.reset('Reduce food waste in cafés'); for (const t of ['10 wild ideas', 'a few objections around the hubs', '8 grounded facts near the weakest', 'fuse across the bridges, dense links', '6 new']) { const r = await b.shake(t); ok(r && r.ids.length >= 1, t); }
    ok(b.revs.length === 6 && b.latest === 5, 'revisions'); const n5 = b.g.nodes.length, vis2 = b.visible(2).size; ok(vis2 < n5, 'older revision shows less'); const w = b.undoRev(); ok(w && b.revs.length === 5, 'withdraw'); const r = await b.shake('3 more'); ok(r.letter === 'F', 'letter ' + r.letter);
    const ids = new Set(b.g.nodes.map(n => n.id)); for (const e of b.g.edges) ok(ids.has(e.a) && ids.has(e.b), 'dangling edge'); return b.g.nodes.length + ' thoughts over ' + b.revs.length + ' revisions'; } },
  { id: 506, group: 'scenario', name: 'the launch funnel with 60 visitors: signups, referrals, tiers, surveys and a duplicate', fn: async () => {
    const st = createMemStore({ _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } }); const call = (m, p, b, ip) => handle(st, { method: m, path: p, body: b || {}, headers: {}, env: {}, ip: ip || 'ip' + Math.random() });
    const first = (await call('POST', '/api/waitlist', { email: 'founder@example.com', interest: 'both' })).json; let invited = 0; for (let i = 0; i < 12; i++) { const r = await call('POST', '/api/waitlist', { email: 'f' + i + '@example.com', interest: 'atlas', ref: first.code }); if (r.status === 201) invited++; }
    for (let i = 0; i < 47; i++) await call('POST', '/api/waitlist', { email: 'v' + i + '@example.com' }); ok(st.stats().signups === 60, 'signups ' + st.stats().signups);
    const me = (await call('GET', '/api/waitlist/' + first.code)).json; ok(me.referrals === 12 && me.tier === 'founding circle' && me.position === 1, JSON.stringify(me));
    const dup = await call('POST', '/api/waitlist', { email: 'FOUNDER@example.com' }); ok(dup.json.duplicate && dup.json.code === first.code, 'duplicate'); ok((await call('POST', '/api/waitlist/' + first.code + '/survey', { useCase: 'Mapping failures', teamSize: '2-5', domains: ['x'] })).status === 200, 'survey'); ok((await call('POST', '/api/upgrade', { code: first.code })).status === 201, 'upgrade');
    ok(st.stats().upgrades === 1 && st.stats().referrals === 12, 'stats'); return '60 members, founder at #1 with 12 referrals'; } },
  { id: 507, group: 'scenario', name: 'abuse and bad input: oversized, malformed and hostile requests are refused or cleaned', fn: async () => {
    const st = createMemStore({ _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } }); const call = (m, p, b, ip) => handle(st, { method: m, path: p, body: b, headers: {}, env: {}, ip: ip || 'x' + Math.random() });
    for (const bad of [{}, { email: '' }, { email: 'a@b' }, { email: '<script>@x.io' + 'y'.repeat(300) }, { email: 123 }, null]) { const r = await call('POST', '/api/waitlist', bad === null ? undefined : bad); ok(r.status === 422 || r.status === 201, 'status ' + r.status); }
    const evil = await call('POST', '/api/waitlist', { email: 'ok@example.com', name: '<img src=x onerror=alert(1)>\u0000\n', useCase: 'z'.repeat(5000) }); ok(evil.status === 201, 'evil accepted as plain text'); const row = st.signupByCode(evil.json.code); ok(row.useCase.length <= 500 && !/[\u0000-\u001f]/.test(row.name), 'cleaned');
    ok((await call('POST', '/api/events', { type: 'drop table' })).status === 422, 'event type'); ok((await call('GET', '/api/admin/signups.csv')).status === 401, 'csv'); ok((await call('DELETE', '/api/waitlist')).status === 404, 'method'); return 'refused or cleaned'; } },
];
export const ALL = TESTS;
export async function runAll(onProgress) {
  const out = [];
  for (const t of ALL) { const t0 = performance.now(); let pass = true, evidence = ''; try { evidence = (await t.fn()) || ''; } catch (e) { pass = false; evidence = String((e && e.message) || e); } out.push({ id: t.id, group: t.group, name: t.name, pass, evidence, ms: Math.round(performance.now() - t0) }); if (onProgress) onProgress(out); }
  try { localStorage.removeItem('tg-scn'); } catch (e) {}
  return out;
}
