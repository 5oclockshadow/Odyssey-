// Topic library: every map is its own topic, with its own history, kept in IndexedDB.
// Starting a topic, opening a session or switching modes never writes over another topic.
const DB = 'mega-topics';
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('topics')) d.createObjectStore('topics', { keyPath: 'id' }); if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'vid' }).createIndex('topic', 'topic'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const tx = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* the index is a cache; IndexedDB holds the topics */ } };
const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// A small index in localStorage lets the list render at once; the maps themselves live in IndexedDB.
const IDX = 'mega-topic-index';
export const index = () => { try { return JSON.parse(lsGet(IDX) || '[]'); } catch (e) { return []; } };
const saveIndex = L => lsSet(IDX, JSON.stringify(L.slice(0, 300)));
export const currentId = mode => lsGet('mega-topic-' + mode);
export const setCurrent = (mode, id) => lsSet('mega-topic-' + mode, id);
export const available = () => { try { return typeof indexedDB !== 'undefined'; } catch (e) { return false; } };

export async function put(t) {
  const id = t.id || uid(), now = Date.now(), old = index().find(x => x.id === id), g = t.graph || {}, nodes = g.nodes || [], edges = g.edges || [];
  const rec = { id, mode: t.mode, name: t.name || (old && old.name) || g.seed || 'Untitled', seed: g.seed || (old && old.seed) || '', at: t.at || now, created: (old && old.created) || t.created || now, size: nodes.length, links: edges.length, graph: t.graph };
  await tx('topics', 'readwrite', s => s.put(rec));
  saveIndex([{ id, mode: rec.mode, name: rec.name, seed: rec.seed, at: rec.at, created: rec.created, size: rec.size, links: rec.links, versions: old ? old.versions || 0 : 0 }, ...index().filter(x => x.id !== id)]);
  return id;
}
export const get = id => tx('topics', 'readonly', s => s.get(id));
export async function rename(id, name) { const t = await get(id); if (!t) return; t.name = name; await tx('topics', 'readwrite', s => s.put(t)); saveIndex(index().map(x => x.id === id ? { ...x, name } : x)); }
export async function remove(id) { const vs = await versions(id); await tx('topics', 'readwrite', s => s.delete(id)); for (const v of vs) await tx('versions', 'readwrite', s => s.delete(v.vid)); try { for (const d of await listDocs(id)) await removeDoc(d.id); } catch (e) { /* the documents database is optional */ } saveIndex(index().filter(x => x.id !== id)); }

// History: up to 40 full copies per topic, newest first. Listing returns metadata only.
export async function addVersion(topic, reason, graph) {
  const vid = topic + ':' + Date.now();
  await tx('versions', 'readwrite', s => s.put({ vid, topic, at: Date.now(), reason, n: (graph.nodes || []).length, links: (graph.edges || []).length, graph }));
  const all = await versions(topic); for (const v of all.slice(40)) await tx('versions', 'readwrite', s => s.delete(v.vid));
  saveIndex(index().map(x => x.id === topic ? { ...x, versions: Math.min(40, all.length) } : x)); return vid;
}
export async function versions(topic) {
  const d = await open();
  return new Promise((res, rej) => { const out = [], t = d.transaction('versions', 'readonly'), q = t.objectStore('versions').index('topic').openCursor(IDBKeyRange.only(topic)); q.onsuccess = () => { const c = q.result; if (c) { const { graph, ...meta } = c.value; out.push(meta); c.continue(); } }; t.oncomplete = () => res(out.sort((a, b) => b.at - a.at)); t.onerror = () => rej(t.error); });
}
export const getVersion = vid => tx('versions', 'readonly', s => s.get(vid));
export async function removeVersion(vid) { const v = await getVersion(vid); await tx('versions', 'readwrite', s => s.delete(vid)); if (v) saveIndex(index().map(x => x.id === v.topic ? { ...x, versions: Math.max(0, (x.versions || 1) - 1) } : x)); }

// Documents: written notes and the search log, kept per topic in their own database so the topic store never needs an upgrade.
let ddb = null;
const dopen = () => ddb || (ddb = new Promise((res, rej) => { const r = indexedDB.open('mega-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' }).createIndex('topic', 'topic'); r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); ddb = null; }; res(r.result); }; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('documents database is blocked by another tab')); }));
const dtx = async (mode, fn) => { const d = await dopen(); return new Promise((res, rej) => { const t = d.transaction('docs', mode), q = fn(t.objectStore('docs')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
export const putDoc = d => dtx('readwrite', s => s.put(d));
export const getDoc = id => dtx('readonly', s => s.get(id));
export const removeDoc = id => dtx('readwrite', s => s.delete(id));
export async function listDocs(topic) {
  const d = await dopen();
  return new Promise((res, rej) => { const out = [], t = d.transaction('docs', 'readonly'), q = t.objectStore('docs').index('topic').openCursor(IDBKeyRange.only(topic)); q.onsuccess = () => { const c = q.result; if (c) { out.push(c.value); c.continue(); } }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
}
