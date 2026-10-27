// Rewrites a thought so it reads like a person wrote it. Offline: fixes the engine's stock phrasings. Live: asks Claude, then checks the answer.
import * as E from './thought-engine.js';
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s, lc = s => s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const unq = s => String(s || '').replace(/^["“]|["”]$/g, '').replace(/[,;:\s]+$/, '');
const DETAIL = [
  [/Took the claim "(.+?)" and moved it onto "(.+?)"\. Nobody has checked this transfer\.?/i, (m, a, b) => 'Borrowed from "' + a + '". Untested: does it really hold for ' + lc(b) + '?'],
  [/Only (\d+)% grounded\. One counter-example would be enough to retire it\.?/i, (m, n) => 'Weakly grounded (' + n + '%). A single counter-example would retire it.'],
  [/Does "(.+?)" leave room for "(.+?)"\? If not, one of them gives\.?/i, (m, a, b) => '"' + unq(a) + '" and "' + unq(b) + '" may not both be true. Which one gives way?'],
  [/The three objections every (.+?) idea meets first\. "(.+?)" has to answer all of them\.?/i, (m, a, b) => '"' + unq(b) + '" has to survive the three objections every ' + a + ' idea meets first.'],
  [/An emergent possibility: "(.+?)" \((\w+)\) reacting with "(.+?)"(?: \((\w+)\))?\.?/i, (m, a, p, b) => 'What happens when "' + unq(a) + '" meets "' + unq(b) + '"?'],
  [/A bridge between "(.+?)" \((\w+)\) and "(.+?)"(?: \((\w+)\))?\.?/i, (m, a, p, b) => 'Connects "' + unq(a) + '" with "' + unq(b) + '".'],
];
const LABEL = [
  [/^Push (.+?),?\s+to its extreme$/i, (m, x) => cap(unq(x)) + ', taken to the extreme'],
  [/^(.+?) may not hold\s*[—–-]\s*checked against (.+)$/i, (m, a, b) => cap(a) + ' may not hold, given ' + lc(unq(b))],
  [/^A one-week check of whether (.+)$/i, (m, x) => 'Test for one week: ' + lc(unq(x))],
  [/^(.+?), read as a case of (.+)$/i, (m, a, b) => 'Is ' + lc(unq(a)) + ' really a case of ' + lc(unq(b)) + '?'],
  [/^([a-z])/, (m, c) => c.toUpperCase()],
];
const fix = (t, rules) => { let s = E.tidy(t); for (const [re, fn] of rules) s = s.replace(re, fn); return E.tidy(s); };
export function offline(n) { const label = E.short(fix(n.label, LABEL), 110), detail = E.short(fix(n.detail || '', DETAIL), 300); return { label, detail, live: false, changed: label !== n.label || detail !== (n.detail || '') }; }
export const liveAvailable = () => typeof window !== 'undefined' && !!(window.claude && window.claude.complete);
function context(g, n) { const nb = E.neighborsOf(g, n.id).slice(0, 4).map(m => '- ' + m.label).join('\n'); const p = n.parent && g.byId.get(n.parent); return 'Map topic: ' + g.seed + '\n' + (p ? 'Grew from: ' + p.label + '\n' : '') + (nb ? 'Connected to:\n' + nb + '\n' : ''); }
export async function live(g, n, o = {}) {
  const prompt = 'You edit thoughts on an idea map so they read clearly to a curious 14-year-old and an expert alike. Keep the meaning and every specific (numbers, names). No hype, no filler, no em dashes.\n' + context(g, n) +
    'Thought label: ' + n.label + '\nThought detail: ' + (n.detail || '(none)') + '\n' + (o.retry ? 'Give a noticeably different wording from: ' + o.retry + '\n' : '') +
    'Rules: the label is one sentence or question, at most 90 characters. The detail is 1-2 sentences, at most 220 characters, and adds something the label does not say.\nReply with JSON only: {"label": "...", "detail": "..."}';
  const raw = await window.claude.complete(prompt); const m = String(raw || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply');
  const j = JSON.parse(m[0]); if (typeof j.label !== 'string' || !j.label.trim()) throw new Error('reply had no label');
  return { label: E.short(E.tidy(j.label), 110), detail: E.short(E.tidy(typeof j.detail === 'string' ? j.detail : n.detail || ''), 300), live: true, changed: true };
}
export async function rewrite(g, id, o = {}) { const n = g.byId.get(id); if (!n) return null; if (o.live && liveAvailable()) { try { return await live(g, n, o); } catch (e) { console.warn('rewrite: live failed, using offline:', e.message); } } return offline(n); }
export function roughness(n) { let s = 0; const t = n.label + ' ' + (n.detail || ''); if (!/^typed/i.test(n.via || '')) s += 1; if (n.label.length > 80) s += 1; if ((t.match(/"/g) || []).length >= 4) s += 1; for (const [re] of DETAIL.concat(LABEL)) if (re.test(n.label) || re.test(n.detail || '')) s += 2; return s; }
export async function polish(g, o = {}) {
  let fixed = 0, liveN = 0; for (const n of g.nodes) { if (n.root) continue; const r = offline(n); if (r.changed) { E.updateNode(g, n.id, { label: r.label, detail: r.detail }); fixed++; } }
  if (o.live && liveAvailable()) { const worst = g.nodes.filter(n => !n.root && !/^typed/i.test(n.via || '')).sort((a, b) => roughness(b) - roughness(a)).slice(0, o.max || 10);
    for (const n of worst) { if (o.cancelled && o.cancelled()) break; try { const r = await live(g, n); E.updateNode(g, n.id, { label: r.label, detail: r.detail }); liveN++; if (o.progress) o.progress(liveN, worst.length); } catch (e) { console.warn('polish: skipped one thought:', e.message); } } }
  return { fixed, live: liveN };
}
