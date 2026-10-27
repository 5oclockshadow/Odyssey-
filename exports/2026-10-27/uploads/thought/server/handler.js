// The API, written once. The Node server and the in-page demo both call handle() with a store.
// A store is any object with the methods used below (all may be async).
import { validateWaitlist, validateSurvey, validateContact, validateEvent, validateUpgrade } from './validate.js';

export const DRIP = [{ tpl: 'welcome', delayH: 0 }, { tpl: 'nurture1', delayH: 48 }, { tpl: 'nurture2', delayH: 120 }, { tpl: 'upgrade', delayH: 240 }, { tpl: 'lastcall', delayH: 336 }];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const makeCode = () => { const a = new Uint8Array(8); (globalThis.crypto || {}).getRandomValues(a); return [...a].map(x => B32[x % 32]).join(''); };
export const tierOf = referrals => referrals >= 10 ? 'founding circle' : referrals >= 3 ? 'priority' : 'standard';
const res = (status, json) => ({ status, json });
const bad = errors => res(422, { ok: false, error: 'validation', errors });
export const safeEq = (a, b) => { a = String(a ?? ''); b = String(b ?? ''); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
export const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const fp = s => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0).toString(16); };
const origin = env => (env && env.PUBLIC_URL) || '';

export async function handle(store, req) {
  const { method = 'GET', body = {}, headers = {}, env = {} } = req, path = String(req.path || '').replace(/\/+$/, '').split('?')[0] || '/', ip = (env.TRUST_PROXY === '1' && String(headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.ip || 'local', audit = typeof req.audit === 'function' ? req.audit : () => {}, isAdmin = !!env.ADMIN_TOKEN && safeEq(String(headers.authorization || ''), 'Bearer ' + env.ADMIN_TOKEN), who = 'ip:' + fp(ip);
  try {
    if (method === 'GET' && path === '/api/health') return res(200, { ok: true, service: 'tandem', time: new Date().toISOString() });
    if (method === 'POST' && !(await store.rateOk(ip + ':' + path, path.endsWith('events') ? 120 : 12, 60000))) { audit({ event: 'rate_limit', outcome: 'denied', actor: who, path }); return res(429, { ok: false, error: 'rate_limited' }); }

    if (method === 'POST' && path === '/api/waitlist') {
      const v = validateWaitlist(body); if (!v.ok) return bad(v.errors);
      const found = await store.signupByEmail(v.value.email);
      if (found) return res(200, summary(store, found, env, true, await store.positionOf(found.code)));
      const row = await store.addSignup(v.value);
      if (v.value.ref) await store.bumpReferral(v.value.ref);
      await store.enqueue(row.code, DRIP);
      return res(201, summary(store, row, env, false, await store.positionOf(row.code)));
    }
    let m = path.match(/^\/api\/waitlist\/([A-Z2-7]{8})$/i);
    if (method === 'GET' && m) { const row = await store.signupByCode(m[1].toUpperCase()); if (!row) return res(404, { ok: false, error: 'not_found' }); return res(200, summary(store, row, env, true, await store.positionOf(row.code))); }
    m = path.match(/^\/api\/waitlist\/([A-Z2-7]{8})\/survey$/i);
    if (method === 'POST' && m) { const v = validateSurvey(body); if (!v.ok) return bad(v.errors); const row = await store.signupByCode(m[1].toUpperCase()); if (!row) return res(404, { ok: false, error: 'not_found' }); await store.setSurvey(row.code, v.value); return res(200, { ok: true }); }
    if (method === 'POST' && path === '/api/upgrade') { const v = validateUpgrade(body); if (!v.ok) return bad(v.errors); const row = await store.signupByCode(v.value.code); if (!row) return res(404, { ok: false, error: 'not_found' }); const id = await store.addUpgrade(v.value); return res(201, { ok: true, id, message: 'Recorded. No payment was taken.' }); }
    if (method === 'POST' && path === '/api/contact') { const v = validateContact(body); if (!v.ok) return bad(v.errors); const id = await store.addContact(v.value); return res(201, { ok: true, id }); }
    if (method === 'POST' && path === '/api/events') { const v = validateEvent(body); if (!v.ok) return bad(v.errors); await store.addEvent(v.value); return res(202, { ok: true }); }
    if (method === 'GET' && path === '/api/stats') { if (!isAdmin) { audit({ event: 'admin.stats', outcome: 'denied', actor: who }); return res(401, { ok: false, error: 'unauthorized' }); } audit({ event: 'admin.stats', outcome: 'allowed', actor: 'admin' }); return res(200, { ok: true, ...(await store.stats()) }); }
    if (method === 'GET' && path === '/api/admin/signups.csv') { if (!isAdmin) { audit({ event: 'admin.export', outcome: 'denied', actor: who }); return res(401, { ok: false, error: 'unauthorized' }); } const rows = await store.allSignups(), cols = ['seq', 'email', 'name', 'role', 'interest', 'referrals', 'source', 'created_at']; audit({ event: 'admin.export', outcome: 'allowed', actor: 'admin', rows: rows.length }); return res(200, { csv: [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n') }); }
    return res(404, { ok: false, error: 'not_found' });
  } catch (e) { audit({ event: 'server_error', outcome: 'error', actor: who, path, error: String(e && e.message || e).slice(0, 200) }); return res(500, { ok: false, error: 'server_error' }); }
}
function summary(store, row, env, duplicate, position) {
  const link = (origin(env) || '') + '/Map%20Graph%20-%20Home.dc.html?ref=' + row.code;
  return { ok: true, duplicate, id: row.id, code: row.code, position: position ?? null, referrals: row.referrals || 0, tier: tierOf(row.referrals || 0), referralUrl: link };
}
