// Browser side of the backend. If a real server answers /api/health it is used; otherwise the same handler runs here, saved in this browser.
import { handle, makeCode } from './server/handler.js';

export function createMemStore(storage) {
  const KEY = 'tandem-demo-db', load = () => { try { return JSON.parse(storage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let db = { signups: [], upgrades: [], contacts: [], events: [], queue: [], rate: {}, ...load() };
  const save = () => { try { storage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ } };
  const score = s => s.seq - 10 * s.referrals;
  return {
    reset() { db = { signups: [], upgrades: [], contacts: [], events: [], queue: [], rate: {} }; save(); },
    signupByEmail: e => db.signups.find(s => s.email === e) || null, signupByCode: c => db.signups.find(s => s.code === c) || null,
    addSignup(v) { const row = { id: db.signups.length + 1, seq: db.signups.length + 1, code: makeCode(), email: v.email, name: v.name, role: v.role, interest: v.interest, useCase: v.useCase, referred_by: v.ref || null, referrals: 0, source: v.source, survey: null, created_at: new Date().toISOString() }; db.signups.push(row); save(); return row; },
    bumpReferral(c) { const s = db.signups.find(x => x.code === c); if (s) { s.referrals++; save(); } }, setSurvey(c, v) { const s = db.signups.find(x => x.code === c); if (s) { s.survey = v; save(); } },
    positionOf(c) { const me = db.signups.find(s => s.code === c); return me ? 1 + db.signups.filter(s => score(s) < score(me)).length : null; },
    addUpgrade(v) { db.upgrades.push({ id: db.upgrades.length + 1, ...v, created_at: new Date().toISOString() }); save(); return db.upgrades.length; },
    addContact(v) { db.contacts.push({ id: db.contacts.length + 1, ...v, created_at: new Date().toISOString() }); save(); return db.contacts.length; },
    addEvent(v) { db.events.push({ ...v, created_at: new Date().toISOString() }); if (db.events.length > 500) db.events.shift(); save(); },
    enqueue(code, drip) { for (const d of drip) if (!db.queue.some(q => q.code === code && q.template === d.tpl)) db.queue.push({ code, template: d.tpl, send_at: new Date(Date.now() + d.delayH * 3600000).toISOString(), sent_at: null }); save(); },
    rateOk(key, limit, windowMs) { const now = Date.now(), a = (db.rate[key] || []).filter(t => t > now - windowMs); if (a.length >= limit) { db.rate[key] = a; return false; } a.push(now); db.rate[key] = a; return true; },
    stats() { const ev = {}; for (const e of db.events) ev[e.type] = (ev[e.type] || 0) + 1; const bi = {}; for (const s of db.signups) bi[s.interest] = (bi[s.interest] || 0) + 1; return { signups: db.signups.length, byInterest: bi, referrals: db.signups.reduce((n, s) => n + s.referrals, 0), upgrades: db.upgrades.length, events: ev }; },
    allSignups: () => db.signups, dump: () => db,
  };
}

let real = null, store = null;
const probe = async () => { if (real !== null) return real; try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 900), r = await fetch('/api/health', { signal: ctl.signal }); clearTimeout(t); real = r.ok && (r.headers.get('content-type') || '').includes('json'); } catch (e) { real = false; } return real; };
export const getStore = () => store || (store = createMemStore(globalThis.localStorage));
export const mode = async () => ((await probe()) ? 'live server' : 'in-browser demo');
export async function api(method, path, body) {
  if (await probe()) { const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }
  return handle(getStore(), { method, path, body: body || {}, headers: {}, env: { PUBLIC_URL: '' }, ip: 'demo' });
}
const sid = () => { try { let s = sessionStorage.getItem('tandem-sid'); if (!s) { s = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('tandem-sid', s); } return s; } catch (e) { return 'anon'; } };
export const track = (type, page, props) => api('POST', '/api/events', { type, page, session: sid(), props }).catch(() => null);
export const refFromUrl = () => { try { const r = new URLSearchParams(location.search).get('ref'); if (r) sessionStorage.setItem('tandem-ref', r.toUpperCase()); return sessionStorage.getItem('tandem-ref') || ''; } catch (e) { return ''; } };
export const member = { get: () => { try { return JSON.parse(localStorage.getItem('tandem-member')); } catch (e) { return null; } }, set: v => { try { localStorage.setItem('tandem-member', JSON.stringify(v)); } catch (e) { /* ignore */ } } };
