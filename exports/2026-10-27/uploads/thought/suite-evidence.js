// Evidence lab: find sources (papers, news, web) for one thought, cut what is known into sections of facts,
// run statistics on the numbers in a sandbox, and reason it through with named techniques. Every step reports as it runs.
import * as E from './thought-engine.js';
import { runCode, mcpCall } from './suite-agent.js';

const short = (s, n) => E.short(String(s || ''), n);
const liveOK = () => typeof window !== 'undefined' && !!(window.claude && window.claude.complete);
// Replies can be cut off at the token cap. Ask for room, and if the JSON is still cut, close it at the last whole value.
const mend = s => { for (let end = s.length; end > 1; end--) { const c = s[end - 1]; if (c !== ',' && c !== '}' && c !== ']' && c !== '"' && !/[0-9el]/.test(c)) continue; let cut = s.slice(0, end).replace(/,\s*$/, ''), st = [], str = false, esc = false; for (const ch of cut) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = str; continue; } if (ch === '"') str = !str; else if (!str) { if (ch === '{' || ch === '[') st.push(ch === '{' ? '}' : ']'); else if (ch === '}' || ch === ']') st.pop(); } } if (str) continue; try { return JSON.parse(cut + st.reverse().join('')); } catch (e) { /* keep trimming */ } } return null; };
const ask = async (prompt, o = {}) => { const raw = await window.claude.complete({ model: o.model || 'claude-haiku-4-5', max_tokens: o.tokens || 3000, messages: [{ role: 'user', content: prompt }] }), txt = String(raw || ''), i = txt.search(/[\[{]/); if (i < 0) throw new Error('no JSON in reply'); const body = txt.slice(i), e = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']')); try { return JSON.parse(body.slice(0, e + 1)); } catch (x) { const m = mend(body); if (m) return m; throw new Error('reply was cut off and could not be repaired'); } };
const KIND = { papers: 'peer-reviewed papers, preprints or official reports', news: 'news articles from named outlets', web: 'online material: official pages, datasets, explainers, talks' };

function searchTool(conn, kind) { if (!conn || !conn.tools) return null; const want = kind === 'papers' ? /scholar|paper|arxiv|pubmed|semantic|crossref|openalex/i : kind === 'news' ? /news|headline/i : /search|web|fetch|browse|google|bing|brave|exa|tavily/i; return conn.tools.find(t => want.test(t.name + ' ' + t.description)) || conn.tools.find(t => /search/i.test(t.name)) || null; }
function argFor(tool, q) { const props = (tool.schema && tool.schema.properties) || {}, k = ['query', 'q', 'search', 'term', 'text', 'url'].find(x => props[x]) || Object.keys(props).find(x => (props[x].type || 'string') === 'string') || 'query'; return { [k]: q }; }
function parseItems(text, kind, via) { try { const j = JSON.parse(text); const arr = Array.isArray(j) ? j : j.results || j.items || j.data || j.papers || j.articles || []; if (arr.length) return arr.slice(0, 8).map(x => ({ title: short(x.title || x.name || x.headline || '', 160), outlet: short(x.venue || x.source || x.journal || x.publisher || x.site || '', 60), year: String(x.year || x.published || x.date || '').slice(0, 10), url: x.url || x.link || x.doi || '', snippet: short(x.abstract || x.snippet || x.description || x.summary || '', 240), kind, via, unverified: false })).filter(x => x.title); } catch (e) {}
  return String(text).split(/\n{1,2}/).map(l => l.trim()).filter(l => l.length > 20).slice(0, 8).map(l => { const url = (l.match(/https?:\/\/\S+/) || [''])[0]; return { title: short(l.replace(url, '').replace(/^[-*•\d.\s]+/, ''), 160), outlet: url ? url.split('/')[2] : '', year: (l.match(/\b(19|20)\d{2}\b/) || [''])[0], url, snippet: '', kind, via, unverified: false }; }); }

export async function findSources(g, n, o = {}) {
  const kind = o.kind || 'papers', q = n.label + (n.detail ? ' ' + short(n.detail, 120) : ''), say = o.onStep || (() => {});
  const tool = searchTool(o.mcp, kind);
  if (tool) { say({ k: 'tool', text: o.mcp.server + ' · ' + tool.name + ' "' + short(q, 80) + '"' }); try { const r = await mcpCall(o.mcp, tool.name, argFor(tool, q)); if (!r.error) { const items = parseItems(r.text, kind, o.mcp.server); if (items.length) return { items, via: 'live from ' + o.mcp.server }; } say({ k: 'error', text: 'The tool returned nothing usable; trying the next way.' }); } catch (e) { say({ k: 'error', text: tool.name + ' failed: ' + e.message }); } }
  if (o.live && liveOK()) { say({ k: 'think', text: 'Asking Claude for ' + KIND[kind] + ' it is confident exist. Claude cannot browse here, so each one is marked to check.' });
    try { const j = await ask('List up to 5 real ' + KIND[kind] + ' relevant to this claim. Only include items you are confident exist, with the real title and outlet; if unsure, return fewer. No invented URLs: leave url empty unless you are certain.\nTopic: ' + g.seed + '\nClaim: ' + n.label + '\nDetail: ' + (n.detail || '') + '\nReply with JSON only: [{"title": "", "outlet": "", "year": "", "url": "", "snippet": "one sentence on what it found", "stance": "supports | contradicts | context"}]');
      const items = (Array.isArray(j) ? j : []).slice(0, 5).filter(x => x && x.title).map(x => ({ title: short(x.title, 160), outlet: short(x.outlet, 60), year: String(x.year || '').slice(0, 10), url: /^https?:\/\//.test(x.url || '') ? x.url : '', snippet: short(x.snippet, 240), stance: x.stance || 'context', kind, via: 'Claude (verify)', unverified: true }));
      return { items, via: 'Claude, from what it knows (check before relying on it)' }; } catch (e) { say({ k: 'error', text: 'Claude could not list sources: ' + e.message }); } }
  if (kind === 'papers') { const local = E.searchPapers(g, q, 6).map(x => ({ ...x.paper, outlet: x.paper.venue || '', kind, via: 'local library', unverified: false })); return { items: local, via: local.length ? 'the local paper library' : 'nothing found offline' }; }
  return { items: [], via: 'Turn on Live AI or connect an MCP search tool to look for ' + kind + '.' };
}

// Cut what the map knows about a thought into sections of atomic facts.
const NUM = /(-?\d+(?:[.,]\d+)?)\s*(%|percent|per ?cent|°C|°F|dB|kg|km|cm|mm|minutes?|mins?|hours?|days?|weeks?|months?|years?|times|people|users|patients|students|m|h|x|\$|€|£)?(?![a-z])/gi;
export function gather(g, n, extra = []) {
  const sections = { claim: n.label, for: [], against: [], context: [], numbers: [] }, seen = new Set(), push = (sec, text, from) => { const t = short(String(text).replace(/\s+/g, ' ').trim(), 220); const k = t.toLowerCase(); if (t.length < 8 || seen.has(k)) return; seen.add(k); sections[sec].push({ text: t, from }); };
  for (const s of String(n.detail || '').split(/(?<=[.!?])\s+/)) push('context', s, 'its detail');
  for (const ev of n.evidence || []) push('for', ev.src + (ev.year ? ' (' + ev.year + ')' : ''), 'attached source');
  for (const it of extra) push(it.stance === 'contradicts' ? 'against' : it.stance === 'supports' ? 'for' : 'context', it.title + (it.snippet ? ': ' + it.snippet : ''), it.outlet || it.via || 'source');
  for (const e of g.edges) { const o = e.a === n.id ? e.b : e.b === n.id ? e.a : null; if (!o) continue; const m = g.byId.get(o); if (!m) continue; let rel = e.relation || e.kind; try { rel = E.relation(e); } catch (er) {} rel = String(rel).toLowerCase(); const sec = /contradict|challenge|against|refut|attack/.test(rel) || e.kind === 'challenge' ? 'against' : /support|evidence|explain|confirm/.test(rel) ? 'for' : 'context'; push(sec, m.label, rel + (m.evidence && m.evidence.length ? ' · sourced' : '')); }
  for (const sec of ['claim', 'for', 'against', 'context']) for (const f of (sec === 'claim' ? [{ text: n.label, from: 'claim' }] : sections[sec])) { let mm; NUM.lastIndex = 0; while ((mm = NUM.exec(f.text))) { const v = parseFloat(mm[1].replace(',', '.')); if (!isFinite(v) || (!mm[2] && Math.abs(v) < 2)) continue; if (/^(19|20)\d{2}$/.test(mm[1]) && !mm[2]) continue; sections.numbers.push({ value: v, unit: (mm[2] || '').toLowerCase(), section: sec, text: short(f.text, 90) }); } }
  return sections;
}

// Statistics on the gathered numbers, run in the sandbox so the code is the same code a user could read.
export const STATS_CODE = `const nums = map.numbers; const by = {}; for (const x of nums) (by[x.unit || 'plain'] = by[x.unit || 'plain'] || []).push(x);
const out = {}; for (const [u, xs] of Object.entries(by)) { const v = xs.map(x => x.value).sort((a, b) => a - b), n = v.length, mean = v.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0, med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const fr = xs.filter(x => x.section === 'for').map(x => x.value), ag = xs.filter(x => x.section === 'against').map(x => x.value), m = a => a.length ? a.reduce((p, q) => p + q, 0) / a.length : null;
  out[u] = { n, min: v[0], max: v[n - 1], mean: +mean.toFixed(3), median: med, sd: +sd.toFixed(3), cv: mean ? +(sd / Math.abs(mean)).toFixed(3) : null, forMean: m(fr), againstMean: m(ag), spread: n > 1 ? +((v[n - 1] - v[0]) / (Math.abs(med) || 1)).toFixed(2) : 0 };
  log(u + ': n=' + n + ' mean=' + out[u].mean + ' median=' + med + ' sd=' + out[u].sd + (out[u].cv != null ? ' cv=' + out[u].cv : '') + (fr.length && ag.length ? ' for≈' + m(fr).toFixed(2) + ' vs against≈' + m(ag).toFixed(2) : '')); }
const counts = { for: map.for.length, against: map.against.length, context: map.context.length }; log('facts: ' + counts.for + ' for, ' + counts.against + ' against, ' + counts.context + ' context'); return { byUnit: out, counts };`;

export async function examine(g, n, o = {}) {
  const say = o.onStep || (() => {}), stop = o.cancelled || (() => false);
  const S = gather(g, n, o.sources || []); say({ k: 'facts', text: S.for.length + ' for · ' + S.against.length + ' against · ' + S.context.length + ' context · ' + S.numbers.length + ' numbers', sections: S });
  let stats = null;
  if (S.numbers.length) { say({ k: 'code', text: STATS_CODE }); const data = { numbers: S.numbers, for: S.for, against: S.against, context: S.context }; const r = await runCodeOn(data); stats = r.ok ? r.result : null; say({ k: r.ok ? 'result' : 'error', text: r.ok ? (r.out || []).join('\n') : r.error }); }
  if (stop()) return null;
  const techniques = o.techniques || ['steelman', 'strongest objection', 'base rates', 'mechanism check', 'what would change my mind'];
  if (o.live && liveOK()) { say({ k: 'think', text: 'Reasoning it through with: ' + techniques.join(', ') + '.' });
    try { const j = await ask('You are reviewing one claim on an idea map, thoroughly and honestly. Topic: ' + g.seed + '\nClaim: ' + n.label + '\n\nFacts FOR:\n' + (S.for.map(f => '- ' + f.text + ' [' + f.from + ']').join('\n') || '(none)') + '\nFacts AGAINST:\n' + (S.against.map(f => '- ' + f.text + ' [' + f.from + ']').join('\n') || '(none)') + '\nCONTEXT:\n' + (S.context.map(f => '- ' + f.text).join('\n') || '(none)') + '\nSTATISTICS computed from the numbers above: ' + JSON.stringify(stats || {}).slice(0, 1500) + '\n\nWork through each technique in order: ' + techniques.join('; ') + '. Be concrete and short. Never invent data; say when evidence is missing.\nReply with JSON only: {"steps": [{"technique": "", "finding": ""}], "verdict": "holds | weakened | refuted | undetermined", "probability": 0.0, "why": "two sentences", "gaps": ["evidence that would settle it"], "facts": [{"text": "atomic fact you relied on", "section": "for | against | context"}]}', { model: 'claude-sonnet-4-5', tokens: 4000 });
      for (const st of (j.steps || []).slice(0, 8)) say({ k: 'step', text: (st.technique ? st.technique.toUpperCase() + ' · ' : '') + short(st.finding, 400) });
      const p = Math.max(0, Math.min(1, +j.probability || 0)); return { sections: S, stats, verdict: String(j.verdict || 'undetermined'), probability: p, why: short(j.why, 400), gaps: (j.gaps || []).slice(0, 5).map(x => short(x, 140)), live: true }; } catch (e) { say({ k: 'error', text: 'Claude could not finish the review: ' + e.message + '. Falling back to the offline review.' }); } }
  // offline review: weigh sections, sourced facts count double, contradictory numbers and wide spread lower confidence
  const w = f => /sourced|attached|source/.test(f.from) ? 2 : 1, F = S.for.reduce((a, f) => a + w(f), 0), A = S.against.reduce((a, f) => a + w(f), 0);
  let p = (F + 1) / (F + A + 2); const spreads = stats ? Object.values(stats.byUnit || {}).map(u => u.cv).filter(x => x != null) : []; if (spreads.some(x => x > 0.6)) p = 0.5 + (p - 0.5) * 0.7;
  let h = null; try { h = E.testHypothesis(g, n.id); } catch (e) {} if (h && h.verdict) p = (p + (/support|holds|confirm/i.test(h.verdict) ? 0.7 : /refut|reject/i.test(h.verdict) ? 0.25 : 0.5)) / 2;
  const verdict = F + A === 0 ? 'undetermined' : p >= 0.66 ? 'holds' : p <= 0.3 ? 'refuted' : p < 0.5 ? 'weakened' : 'undetermined';
  [['WEIGH', F + ' weight for, ' + A + ' against (sourced facts count double).'], ['SPREAD', spreads.length ? 'Numbers vary by up to ' + Math.round(Math.max(...spreads) * 100) + '% of their mean' + (spreads.some(x => x > 0.6) ? ', which lowers confidence.' : '.') : 'No numbers to compare.'], ['TEST', h ? 'The map\'s own hypothesis test says: ' + h.verdict + '.' : 'No hypothesis test available.']].forEach(([t, x]) => say({ k: 'step', text: t + ' · ' + x }));
  return { sections: S, stats, verdict, probability: +p.toFixed(2), why: 'Offline review from the map\'s own links and sources. Turn on Live AI for a reasoned review.', gaps: S.against.length ? [] : ['Look for the strongest counter-evidence: nothing on the map argues against this yet.'], live: false };
}
function runCodeOn(data) { return runCode('const D = ' + JSON.stringify(data) + ';\nreturn (function (map) {\n' + STATS_CODE + '\n})(D);', { seed: '', nodes: [], edges: [] }); }
