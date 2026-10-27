// Storage hygiene shared by every app: drop known test scratch, keep version history under a byte budget, retry on quota.
export const SCRATCH = ['prof', 'prof2', 'prof3', 'tg-prof', 'tg-bag-test', 'tg-scn'];
export function cleanScratch() { let freed = 0; try { for (const k of SCRATCH) { const v = localStorage.getItem(k); if (v != null) { freed += v.length; localStorage.removeItem(k); } } } catch (e) { console.warn('storage: scratch cleanup failed:', e && e.message); } return freed; }
const r1 = x => Math.round(x * 10) / 10;
// A version keeps what you need to reopen the map, not its activity trail.
export function compact(d) { if (!d || !Array.isArray(d.nodes)) return d; return { ...d, trace: [], log: [], archive: (d.archive || []).slice(0, 20), nodes: d.nodes.map(n => { const m = { ...n, x: r1(n.x || 0), y: r1(n.y || 0) }; delete m.tx; delete m.ty; delete m.vx; delete m.vy; return m; }) }; }
export function capHistory(list, budget = 600000) { const out = []; let size = 0; for (const h of list || []) { const s = JSON.stringify(h).length; if (out.length && size + s > budget) break; out.push(h); size += s; } return out; }
export function trimKey(key, keep) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (!Array.isArray(v) || v.length <= keep) return 0; const before = JSON.stringify(v).length, t = v.slice(0, keep); localStorage.setItem(key, JSON.stringify(t)); return before - JSON.stringify(t).length; } catch (e) { return 0; } }
const HISTORY_KEYS = () => { const ks = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/-history$/.test(k)) ks.push(k); } } catch (e) {} return ks; };
// Write with recovery: on quota, drop scratch, then shrink every map's version history to its newest 2, then retry.
export function safeWrite(key, value) {
  const text = JSON.stringify(value); try { localStorage.setItem(key, text); return { ok: true }; } catch (e) { if (!/quota|exceed|full/i.test(String(e && (e.name + e.message)))) return { ok: false, error: e && e.message }; }
  let freed = cleanScratch(); try { localStorage.setItem(key, text); return { ok: true, freed, how: 'cleared test scratch' }; } catch (e) {}
  for (const k of HISTORY_KEYS()) if (k !== key) freed += trimKey(k, 2); try { localStorage.setItem(key, text); return { ok: true, freed, how: 'kept only the 2 newest versions of other maps' }; } catch (e) { return { ok: false, error: 'storage is full', freed }; }
}
