// Twin runtime: timers that keep running in background tabs, and a channel that links the twin engines.
// Browsers slow ordinary timers in hidden tabs. Timers driven from a worker, plus a held Web Lock, keep auto mode working.
const SRC = 'const t=new Map();onmessage=e=>{const d=e.data;if(d.op==="set"){t.set(d.id,setTimeout(()=>{t.delete(d.id);postMessage(d.id)},d.ms))}else{clearTimeout(t.get(d.id));t.delete(d.id)}}';
let worker = null, seq = 0; const cbs = new Map();
function wk() {
  if (worker !== null) return worker;
  try { worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }))); worker.onmessage = e => { const f = cbs.get(e.data); if (f) { cbs.delete(e.data); try { f(); } catch (err) { console.warn('twin timer', err); } } }; } catch (e) { worker = false; }
  return worker;
}
export const after = (fn, ms) => { const w = wk(); if (!w) return setTimeout(fn, ms); const id = ++seq; cbs.set(id, fn); w.postMessage({ op: 'set', id, ms }); return id; };
export const clear = h => { if (worker && cbs.has(h)) { cbs.delete(h); worker.postMessage({ op: 'clear', id: h }); } else clearTimeout(h); };
// Holding a lock while a loop runs keeps the tab from being frozen. Call the returned function to release it.
export function keepAwake(name) { if (!navigator.locks) return () => {}; let release = null, done = false; navigator.locks.request('tg-' + name, () => new Promise(r => { if (done) r(); else release = r; })); return () => { done = true; if (release) release(); }; }
// Let the browser paint and handle input between chunks of heavy work.
export const breathe = () => (globalThis.scheduler && scheduler.yield ? scheduler.yield() : new Promise(r => setTimeout(r, 0)));

const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tg-twins') : null, peers = new Map(), subs = new Set();
let me = null, beatH = null;
if (ch) ch.onmessage = e => { const m = e.data; if (!m || (me && m.from === me.name)) return; if (m.type === 'presence') peers.set(m.from, { ...m.stats, name: m.from, at: Date.now() }); else if (m.type === 'bye') peers.delete(m.from); for (const f of subs) { try { f(m); } catch (err) { /* subscriber error */ } } };
export function join(name, getStats) {
  me = { name, getStats }; const beat = () => { if (ch) ch.postMessage({ type: 'presence', from: name, stats: getStats() }); beatH = after(beat, 2000); };
  beat(); if (ch) ch.postMessage({ type: 'hello', from: name }); addEventListener('pagehide', () => { if (ch) ch.postMessage({ type: 'bye', from: name }); });
}
export const send = (type, payload) => { if (ch && me) ch.postMessage({ type, from: me.name, payload }); };
export const on = f => { subs.add(f); return () => subs.delete(f); };
export const sister = name => { const p = peers.get(name); return p && Date.now() - p.at < 7000 ? p : null; };
globalThis.TW = { after, clear, keepAwake, breathe, join, send, on, sister };
