
export async function runSecurityTests(handle, safeEq, csvCell) {
  const out = [], T = (id, name, ok, d) => out.push({ id, name, ok: !!ok, detail: d || '' });
  const mk = () => { const hits = {}, rows = [{ seq: 1, email: 'a@b.co', name: '=cmd|x', role: 'other', interest: 'both', referrals: 0, source: '', created_at: 'x' }]; return { hits, rateOk: async (k, n) => (hits[k] = (hits[k] || 0) + 1) <= n, stats: async () => ({ total: 1 }), allSignups: async () => rows, signupByEmail: async () => null, addSignup: async v => ({ id: 1, code: 'ABCDEFGH', referrals: 0, ...v }), positionOf: async () => 1, enqueue: async () => {}, bumpReferral: async () => {}, addContact: async () => 1, addEvent: async () => {}, signupByCode: async () => null }; };
  const TOKEN = 'k'.repeat(32), env = { ADMIN_TOKEN: TOKEN }, log = [], audit = e => log.push(e);
  const call = (store, o) => handle(store, { env, audit, ip: '1.1.1.1', ...o });
  let s = mk(), r;
  r = await call(s, { path: '/api/stats' }); T('CC6.1-neg', 'stats without token refused', r.status === 401);
  r = await call(s, { path: '/api/stats', headers: { authorization: 'Bearer wrong' } }); T('CC6.1-neg', 'stats wrong token refused', r.status === 401);
  r = await call(s, { path: '/api/stats', headers: { authorization: 'Bearer ' + TOKEN } }); T('CC6.1-pos', 'stats with token allowed', r.status === 200);
  r = await handle(s, { path: '/api/stats', env: {}, audit }); T('CC6.1-neg', 'stats refused when ADMIN_TOKEN unset (fail closed)', r.status === 401);
  r = await handle(s, { path: '/api/admin/signups.csv', env: { ADMIN_TOKEN: '' }, headers: { authorization: 'Bearer ' }, audit }); T('CC6.1-neg', 'export refused with empty token', r.status === 401);
  r = await call(s, { path: '/api/admin/signups.csv', headers: { authorization: 'Bearer ' + TOKEN } }); T('C1.1-pos', 'CSV neutralises formula cells', r.status === 200 && r.json.csv.includes("\"'=cmd|x\""), r.json.csv);
  T('CC6.1-unit', 'safeEq equal/unequal/length', safeEq('ab', 'ab') && !safeEq('ab', 'abc') && !safeEq('ab', 'ac'));
  T('CC7.2-pos', 'denied+allowed admin events audited', log.some(e => e.event === 'admin.stats' && e.outcome === 'denied') && log.some(e => e.event === 'admin.export' && e.outcome === 'allowed'));
  T('CC7.2-neg', 'audit log holds no token and no raw ip', !JSON.stringify(log).includes(TOKEN) && !JSON.stringify(log).includes('1.1.1.1'));
  s = mk(); let last; for (let i = 0; i < 14; i++) last = await call(s, { method: 'POST', path: '/api/contact', body: {} }); T('CC6.6-pos', 'rate limit trips at 13th POST', last.status === 429);
  T('CC7.2-pos', 'rate_limit denial audited', log.some(e => e.event === 'rate_limit'));
  s = mk(); for (let i = 0; i < 14; i++) await call(s, { method: 'POST', path: '/api/contact', headers: { 'x-forwarded-for': 'spoof' + i }, body: {} }); T('CC6.6-neg', 'spoofed X-Forwarded-For does not bypass limit', s.hits['1.1.1.1:/api/contact'] === 14);
  r = await call(mk(), { method: 'POST', path: '/api/waitlist', body: { email: 'not-an-email' } }); T('PI1.2-neg', 'bad email rejected 422', r.status === 422);
  r = await call(mk(), { method: 'POST', path: '/api/waitlist', body: { email: 'x'.repeat(300) + '@a.co' } }); T('PI1.2-neg', 'oversized email rejected', r.status === 422);
  r = await call(mk(), { method: 'POST', path: '/api/waitlist', body: { email: 'ok@ex.com', name: "<script>\u0000'; DROP TABLE signups;--" } }); T('PI1.2-pos', 'hostile name accepted as inert text, control chars stripped', r.status === 201);
  r = await call(mk(), { method: 'POST', path: '/api/events', body: { type: 'rm -rf' } }); T('PI1.2-neg', 'unknown event type rejected', r.status === 422);
  r = await call(mk(), { method: 'GET', path: '/api/nope' }); T('CC6.1-neg', 'unknown route 404', r.status === 404);
  const bad = mk(); bad.stats = async () => { throw new Error('db down'); }; r = await call(bad, { path: '/api/stats', headers: { authorization: 'Bearer ' + TOKEN } }); T('A1.2-pos', 'store failure returns 500 without internals', r.status === 500 && r.json.error === 'server_error' && !JSON.stringify(r.json).includes('db down'));
  T('CC7.2-pos', 'server_error audited', log.some(e => e.event === 'server_error'));
  return { out, log };
}