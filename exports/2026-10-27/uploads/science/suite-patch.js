/* Saltline patch layer — lets the suite update its own code in this browser.
   A patch is a full replacement source for one module, stored with the hash of the file it was made against.
   load(file) imports the patched source when the original is unchanged; otherwise the original. ?nopatch disables all patches. */
const K = f => 'saltline.patch.' + f;
export const fnv = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function get(f) { try { return JSON.parse(localStorage.getItem(K(f)) || 'null'); } catch (e) { return null; } }
export function set(f, p) { try { localStorage.setItem(K(f), JSON.stringify(p)); return true; } catch (e) { return false; } }
export function clear(f) { try { localStorage.removeItem(K(f)); } catch (e) {} }
export function list() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('saltline.patch.') && k !== 'saltline.patch.off') { const p = get(k.slice(15)); if (p) out.push({ file: k.slice(15), ...p }); } } } catch (e) {} return out.sort((a, b) => b.t - a.t); }
export const disabled = () => { try { return /[?&]nopatch\b/.test(location.search) || localStorage.getItem('saltline.patch.off') === '1'; } catch (e) { return false; } };
export const setDisabled = on => { try { on ? localStorage.setItem('saltline.patch.off', '1') : localStorage.removeItem('saltline.patch.off'); } catch (e) {} };
export function rewriteImports(src, base) { return String(src).replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, a, q, p) => a + q + new URL(p, base).href + q); }
export async function importSource(src, base = new URL('.', document.baseURI).href) { const u = URL.createObjectURL(new Blob([rewriteImports(src, base)], { type: 'text/javascript' })); try { return await import(u); } finally { setTimeout(() => URL.revokeObjectURL(u), 5000); } }
export const active = [];
export async function load(file) {
  const url = new URL(file, document.baseURI).href, p = disabled() ? null : get(file);
  if (p && p.src) {
    try {
      const cur = await fetch(url, { cache: 'no-store' }).then(r => r.text());
      if (fnv(cur) !== p.base) { if (!p.stale) set(file, { ...p, stale: true }); }
      else { const m = await importSource(p.src); active.push(file); return m; }
    } catch (e) { console.warn('[suite-patch] ' + file + ' patch not applied, using original: ' + e.message); }
  }
  return import(url);
}
