// A free-running mind for Thought Graph. Each step it reads the whole map, decides what it is
// curious about from its own drives and the map's state, picks a move, and writes thoughts built
// from the map's own words. With Live AI, Claude chooses the focus, the move and the content
// itself, carrying an agenda of open questions from step to step.
import * as E from './thought-engine.js';

const STOP = new Set('a an the and or but if then so of to in on at by for with from into onto over under about as is are was were be been being has have had do does did can could will would should must may might this that these those it its their there here what which who whom whose when where why how not no more less most least very just only also than too each every any some all one two three new our your his her they them we you i me my us out up down off via per such own same other another between through during before after while because until'.split(' '));
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/[.?!:;,\s…]+$/, '').trim();
const core = s => clean(String(s).split(/\s[—–]\s|:\s/)[0]);
const lc = s => s && /^[A-Z](?:[a-z]|\s)/.test(s) && !/^I\s/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const cut = (t, k) => { t = clean(t); if (t.length <= k) return t; let w = t.slice(0, k).replace(/\s+\S*$/, ''); w = clean(w.length > k * 0.5 ? w : t.slice(0, k)); for (let i = 0; i < 3; i++) w = w.replace(/\s+(and|or|of|the|a|an|to|in|on|for|with|via|by|at|as|is|are|but|not)$/i, ''); return w; };
const pick = (arr, r) => arr.length ? arr[Math.floor(r() * arr.length)] : null;
const words = s => (String(s).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter(w => !STOP.has(w));

// Concepts: content words and adjacent pairs, scored by how many thoughts share them.
function concepts(g) {
  const df = new Map(), of = new Map();
  for (const n of g.nodes) {
    const w = words(n.label + ' ' + (n.detail || '').slice(0, 120)), set = new Set(w);
    for (let i = 0; i + 1 < w.length; i++) set.add(w[i] + ' ' + w[i + 1]);
    of.set(n.id, set); for (const c of set) df.set(c, (df.get(c) || 0) + 1);
  }
  return { df, of };
}

const VERB = /\s(is|are|was|were|has|have|can|could|will|would|should|must|may|might|makes?|harms?|drives?|needs?|causes?|reduces?|raises?|lowers?|follows?|shifts?|beats?|hides?|depends?|matters?|works?|fails?|helps?|hurts?|costs?|creates?|keeps?|becomes?|means?|turns?|sets?|shapes?|blocks?|feeds?|predicts?|explains?|changes?|limits?|improves?|worsens?|spreads?|signals?|protects?|needs?|wins?|loses?|outlasts?|triggers?|tracks?|resets?)\s/i;
function clause(label) { const s = core(label), m = VERB.exec(' ' + s + ' '); if (!m || m.index < 3) return null; const at = m.index; const subj = s.slice(0, at - 1 < 0 ? 0 : at - 1).trim(), pred = s.slice(at).trim(); if (subj.length < 3 || pred.split(' ').length < 2) return null; return { subj, verb: m[1].toLowerCase(), pred }; }
const WH = /^(how|why|what|when|where|who|which|whether|should|could|would|can|do|does|did|is|are|maybe|perhaps|something|someone|one|the core problem|baseline)\b/i;
const fits = (t, k) => t && t.length <= k && !/\b(and|or|of|the|a|an|to|in|on|for|with|not|but|as|is)$/i.test(t);
const own = (g, n) => !n.members && !n.lensOf && !/^G\d+$/.test(n.id) && !/^Mind/.test(n.via || '') && !(g.seed && n !== g.nodes[0] && n.label.toLowerCase().includes(g.seed.toLowerCase().slice(0, 24)));
const subjOf = n => { const c = clause(n.label); const t = c ? c.subj : core(n.label); return !WH.test(t) && t.split(' ').length <= 7 && fits(t, 48) ? t : null; };
const usable = g => g.nodes.filter(n => own(g, n));
const sentence = n => { const t = core(n.label); return t.split(' ').length >= 3 && !!clause(n.label) && fits(t, 56) && !WH.test(t); };

// Reasoning mechanisms, applied to the map's own subjects.
const MECH = [
  { id: 'loop', cue: /\b(more|grow|spread|habit|trust|use|demand|attention|learn)/, make: s => `${cap(s)} may feed itself: each gain makes the next one easier`, why: 'looks for a reinforcing loop' },
  { id: 'threshold', cue: /\b(\d|level|dose|limit|above|below|enough|db|hours?)\b/, make: s => `${cap(s)} may do nothing until it crosses a threshold`, why: 'asks whether the effect is linear' },
  { id: 'bottleneck', cue: /\b(build|make|deliver|run|process|supply|flow|step)/, make: s => `One slow step may limit ${lc(s)} more than everything else`, why: 'hunts for the constraint' },
  { id: 'route', cue: /\b(rule|ban|cost|price|tax|curfew|limit|block)/, make: s => `Make ${lc(s)} harder and people will route around it`, why: 'expects people to adapt' },
  { id: 'proxy', cue: /\b(measure|score|rate|track|count|metric|index|data)/, make: s => `What we measure about ${lc(s)} may not be what matters`, why: 'questions the measure' },
  { id: 'timing', cue: /\b(night|day|time|hour|morning|season|late|early|schedule)/, make: s => `${cap(s)} may matter more by when it happens than by how much`, why: 'looks at timing' },
  { id: 'unequal', cue: /\b(city|people|public|workers?|residents?|users?|groups?|households?)/, make: s => `${cap(s)} probably lands very differently on different people`, why: 'looks at who carries it' },
  { id: 'side', cue: /./, make: s => `Fixing ${lc(s)} may create a problem nobody is watching`, why: 'looks for side effects' },
  { id: 'hidden', cue: /./, make: s => `Something unnamed may drive both ${lc(s)} and what it seems to cause`, why: 'suspects a hidden common cause' },
  { id: 'signal', cue: /\b(light|noise|sound|signal|cue|message|sign)/, make: s => `${cap(s)} may work as a signal more than as a force`, why: 'reads it as information' },
  { id: 'stack', cue: /./, make: s => `${cap(s)} may only work stacked with two smaller changes`, why: 'thinks in combinations' },
  { id: 'reverse', cue: /./, make: s => s.length > 34 ? `${cap(s)} may be an effect, not a cause` : `Perhaps the arrow runs the other way, and ${lc(s)} is the result`, why: 'flips cause and effect' },
];

const DRIVES = ['novelty', 'coherence', 'doubt', 'depth'];
export function mindOf(g) {
  if (!g.mind) g.mind = { drives: { novelty: 0.6, coherence: 0.4, doubt: 0.4, depth: 0.5 }, agenda: [], recent: [], steps: 0 };
  for (const d of DRIVES) if (typeof g.mind.drives[d] !== 'number') g.mind.drives[d] = 0.5;
  g.mind.agenda = (g.mind.agenda || []).filter(q => q && q.text).slice(-12); g.mind.recent = (g.mind.recent || []).slice(-10);
  return g.mind;
}

// The map's state pushes drives: disconnected branches raise coherence, weak grounding raises doubt, a small or shallow map raises depth.
function pressures(g, C) {
  const N = g.nodes.filter(n => !n.members), avgG = N.reduce((s, n) => s + (n.g || 0), 0) / Math.max(1, N.length);
  const roots = new Set(N.filter(n => n.parent === (N[0] && N[0].id)).map(n => n.id)), branchOf = new Map();
  const top = id => { let n = g.byId.get(id), k = 0; while (n && n.parent && !roots.has(n.id) && k++ < 30) n = g.byId.get(n.parent); return n ? n.id : id; };
  for (const n of N) branchOf.set(n.id, top(n.id));
  let cross = 0; for (const e of g.edges) if (branchOf.get(e.a) !== branchOf.get(e.b)) cross++;
  const maxD = Math.max(0, ...N.map(n => E.depthOf(g, n)));
  return { coherence: Math.max(0, 0.6 - cross / Math.max(1, roots.size * 2)), doubt: Math.max(0, 0.65 - avgG), depth: Math.max(0, 0.5 - maxD / 10), novelty: N.length < 12 ? 0.3 : 0.1, branchOf };
}

// Moves. Each returns { intent, specs:[{label,detail,plane,g,attach,links:[[id,rel]]}] } or null.
const MOVES = {
  cross: { drive: 'novelty', run(g, ctx) {
    const { r, P } = ctx; const cl = usable(g).map(n => ({ n, c: clause(n.label) })).filter(x => x.c && subjOf(x.n) && fits(x.c.pred, 54) && x.c.pred.split(' ').length <= 9);
    for (let t = 0; t < 12; t++) { const A = pick(cl, r), B = pick(cl, r); if (!A || !B || A.n.id === B.n.id || P.branchOf.get(A.n.id) === P.branchOf.get(B.n.id)) continue; if (A.c.subj.toLowerCase() === B.c.subj.toLowerCase()) continue;
      if (B.c.pred.toLowerCase().includes(B.c.subj.toLowerCase().split(' ')[0])) continue; const label = cap(A.c.subj) + ' ' + (/^(is|are|has|have|was|were|can|could|will|would|should|must|may|might)$/.test(B.c.verb) ? B.c.pred : 'may ' + B.c.pred.replace(/^(\w+?)(e?s)\b/, (m, a, b) => /ss$/.test(m) ? m : (b === 'es' && /(sh|ch|x|z|ss)$/.test(a) ? a : a + (b === 'es' ? 'e' : ''))));
      return { intent: `wondering whether what holds for "${cut(B.c.subj, 30)}" also holds for "${cut(A.c.subj, 30)}"`, specs: [{ label, detail: `Took the claim "${core(B.n.label)}" and moved it onto "${A.c.subj}". Nobody has checked this transfer.`, plane: 'wild', g: Math.min(A.n.g, B.n.g) * 0.45, attach: A.n.id, links: [[B.n.id, 'borrows from']] }] }; }
    return null; } },
  mechanism: { drive: 'depth', run(g, ctx) {
    const { r } = ctx; const cand = usable(g).filter(n => subjOf(n) && (n.mindMoves || []).length < 3);
    for (let t = 0; t < 10; t++) { const n = pick(cand, r); if (!n) return null; const txt = (n.label + ' ' + (n.detail || '')).toLowerCase(); const fits = MECH.filter(m => m.cue.test(txt) && !(n.mindMoves || []).includes(m.id)); const m = fits.length ? (r() < 0.7 ? pick(fits.filter(f => f.cue.source !== '.') .length ? fits.filter(f => f.cue.source !== '.') : fits, r) : pick(fits, r)) : null; if (!m) continue;
      n.mindMoves = [...(n.mindMoves || []), m.id];
      return { intent: `${m.why} in "${cut(core(n.label), 40)}"`, specs: [{ label: m.make(subjOf(n)), detail: `Reading "${core(n.label)}" as a ${m.id === 'loop' ? 'feedback loop' : m.id} pattern. If true, it changes where to push.`, plane: 'concepts', g: Math.max(0.15, n.g * 0.55), attach: n.id, links: [] }], ask: { text: 'What would show whether ' + lc(m.make(subjOf(n))) + '?', about: n.id } }; }
    return null; } },
  pattern: { drive: 'coherence', run(g, ctx) {
    const { C, r } = ctx; const parents = g.nodes.filter(n => g.nodes.filter(m => m.parent === n.id && !m.lensOf).length >= 3 && !(n.mindMoves || []).includes('pattern'));
    const p = pick(parents, r); if (!p) return null; const kids = g.nodes.filter(m => m.parent === p.id && own(g, m)), mine = C.of.get(p.id) || new Set();
    const cnt = new Map(); for (const k of kids) for (const c of C.of.get(k.id) || []) if (!mine.has(c) && c.length > 4 && !STOP.has(c)) cnt.set(c, (cnt.get(c) || 0) + 1);
    const best = [...cnt.entries()].filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]; p.mindMoves = [...(p.mindMoves || []), 'pattern'];
    if (best) { const holders = kids.filter(k => (C.of.get(k.id) || new Set()).has(best[0])); return { intent: `noticed "${best[0]}" keeps returning under "${cut(core(p.label), 34)}"`, specs: [{ label: `"${cap(best[0])}" runs through ${holders.length} of these: it may be the real lever`, detail: 'Shared by: ' + holders.map(h => '"' + cut(core(h.label), 40) + '"').join(', ') + '.', plane: 'principles', g: Math.min(0.7, holders.reduce((s, h) => s + h.g, 0) / holders.length), attach: p.id, links: holders.slice(0, 4).map(h => [h.id, 'generalises']) }] }; }
    const pair = kids.filter(k => subjOf(k)).sort(() => r() - 0.5); const [a, b] = pair; if (!a || !b) return null; return { intent: `looking for what "${cut(core(a.label), 28)}" and "${cut(core(b.label), 28)}" have in common`, specs: [{ label: `${cap(subjOf(a))} and ${lc(subjOf(b))} may share one cause`, detail: `Both sit under "${core(p.label)}". If one root drives both, they are one problem.`, plane: 'principles', g: Math.min(a.g, b.g) * 0.6, attach: p.id, links: [[a.id, 'generalises'], [b.id, 'generalises']] }] }; } },
  why: { drive: 'doubt', run(g, ctx) {
    const { C, r } = ctx; const firm = usable(g).filter(n => n.g >= 0.55 && core(n.label).split(' ').length >= 3 && fits(core(n.label), 56) && !WH.test(core(n.label)) && !(n.mindMoves || []).includes('why'));
    for (let t = 0; t < 8; t++) { const A = pick(firm, r); if (!A) return null; const ca = C.of.get(A.id) || new Set(), linked = new Set(E.neighborsOf(g, A.id).map(m => m.id));
      const B = usable(g).filter(n => n.id !== A.id && !linked.has(n.id) && sentence(n) && core(A.label).length + core(n.label).length <= 76).map(n => ({ n, s: [...(C.of.get(n.id) || [])].filter(c => ca.has(c)).length })).filter(x => x.s > 0).sort((x, y) => y.s - x.s || r() - 0.5)[0]; if (!B) continue;
      A.mindMoves = [...(A.mindMoves || []), 'why'];
      return { intent: `asking why "${cut(core(A.label), 36)}" is true`, specs: [{ label: `${cap(core(A.label))}: partly because ${lc(core(B.n.label))}?`, detail: `A candidate explanation joining two thoughts that share words but were never connected. Untested.`, plane: 'concepts', g: Math.min(A.g, B.n.g) * 0.5, attach: A.id, links: [[B.n.id, 'might explain']] }] }; }
    return null; } },
  doubt: { drive: 'doubt', run(g, ctx) {
    const { r } = ctx; let ts = []; try { ts = E.tensions(g); } catch (e) { ts = []; } const okT = t => { const a = g.byId.get(t.a), b = g.byId.get(t.b); return a && b && own(g, a) && own(g, b) && subjOf(a) && subjOf(b); }; const t0 = ts.find(t => okT(t) && !(g.mind.recent || []).includes('t:' + t.a + t.b)) || null;
    if (t0) { const a = g.byId.get(t0.a), b = g.byId.get(t0.b); if (a && b) { g.mind.recent.push('t:' + t0.a + t0.b); return { intent: `"${cut(core(a.label), 30)}" and "${cut(core(b.label), 30)}" pull against each other`, specs: [{ label: `${cap(subjOf(a))} and ${lc(subjOf(b))} can't both be fully right`, detail: `Tension found (${t0.why}). Either one is wrong, or each holds under different conditions. Which conditions?`, plane: 'principles', g: Math.min(a.g, b.g) * 0.6, attach: a.id, links: [[b.id, 'pulls against']] }], ask: { text: 'Under what conditions do both ' + lc(subjOf(a)) + ' and ' + lc(subjOf(b)) + ' hold?', about: a.id } }; } }
    const weak = usable(g).filter(n => n.g < 0.4 && subjOf(n) && n !== g.nodes[0] && !(n.mindMoves || []).includes('doubt')).sort((x, y) => x.g - y.g); const n = weak[Math.floor(r() * Math.min(4, weak.length))]; if (!n) return null; n.mindMoves = [...(n.mindMoves || []), 'doubt'];
    return { intent: `doubting "${cut(core(n.label), 40)}" (${Math.round(n.g * 100)}% grounded)`, specs: [{ label: `${cap(subjOf(n))} may not hold outside one case`, detail: `Only ${Math.round(n.g * 100)}% grounded. One counter-example would be enough to retire it.`, plane: 'facts', g: 0.2, attach: n.id, links: [] }], ask: { text: 'Where has ' + lc(subjOf(n)) + ' been tried, and what happened?', about: n.id } }; } },
  answer: { drive: 'coherence', run(g, ctx) {
    const { C, r } = ctx; const m = g.mind; const open = m.agenda.filter(q => !q.done && g.byId.has(q.about)); const q = pick(open, r); if (!q) return null;
    const qw = new Set(words(q.text)), about = g.byId.get(q.about), near = new Set([q.about, ...E.neighborsOf(g, q.about).map(x => x.id)]);
    const best = usable(g).filter(n => !near.has(n.id) && sentence(n)).map(n => ({ n, s: [...(C.of.get(n.id) || [])].filter(c => qw.has(c)).length + n.g * 0.5 })).sort((a, b) => b.s - a.s)[0];
    q.done = true; if (!best || best.s < 2) return null;
    return { intent: `thinks "${cut(core(best.n.label), 34)}" may answer "${cut(q.text, 40)}"`, specs: [{ label: `A lead: ${lc(core(best.n.label))}`, detail: `Question: ${q.text} Candidate answer from elsewhere in the map: "${core(best.n.label)}".`, plane: 'concepts', g: Math.min(0.6, best.n.g * 0.7), attach: q.about, links: [[best.n.id, 'answers']] }] }; } },
};

function choose(g, P, r, live) {
  const m = mindOf(g), d = m.drives; const w = {};
  for (const [id, mv] of Object.entries(MOVES)) { let s = (d[mv.drive] || 0.3) + (P[mv.drive] || 0); if (m.recent.slice(-3).includes(id)) s *= 0.35; if (id === 'answer' && !m.agenda.some(q => !q.done)) s = 0; w[id] = Math.max(0, s); }
  const tot = Object.values(w).reduce((s, v) => s + v * v, 0); let x = r() * tot; for (const [id, v] of Object.entries(w)) { x -= v * v; if (x <= 0) return id; } return 'mechanism';
}
function settle(g, move, ok) {
  const d = mindOf(g).drives, used = MOVES[move] ? MOVES[move].drive : null;
  for (const k of DRIVES) d[k] = Math.max(0.05, Math.min(1, d[k] + (k === used ? (ok ? -0.25 : -0.1) : 0.07 + Math.random() * 0.05)));
}

function isNew(g, label) { if (clean(label).length > 96) return false; const k = label.trim().toLowerCase(); if (g.nodes.some(n => n.label.trim().toLowerCase() === k)) return false; const near = E.similar(g, label, 1)[0]; return !(near && near.score > 0.72); }

function commit(g, res, via) {
  const added = [];
  for (const s of res.specs || []) {
    if (!s.label || !isNew(g, s.label)) continue; const at = g.byId.has(s.attach) ? s.attach : g.nodes[0] && g.nodes[0].id;
    const n = E.addNodeRaw(g, { label: cap(E.short(clean(s.label), 96)), detail: E.short(String(s.detail || ''), 260), plane: E.PLANE_OF[s.plane] ? s.plane : 'concepts', g: Math.max(0, Math.min(1, +s.g || 0.3)), parent: at, via, evidence: s.evidence ? [{ src: String(s.evidence), year: '' }] : [], challenge: s.challenge || '' });
    n.mind = res.intent; E.addEdgeRaw(g, at, n.id, null, 'expands'); const e0 = g.edges[g.edges.length - 1]; if (e0 && e0.b === n.id && s.rel) e0.relation = s.rel;
    for (const [id, rel] of s.links || []) if (g.byId.has(id) && id !== at && id !== n.id) E.link(g, n.id, id, rel);
    added.push(n);
  }
  return added;
}

function snapshot(g, max = 34) {
  const N = g.nodes.filter(n => !n.members), ids = new Map(); const keep = N.length <= max ? N : [N[0], ...N.slice(1).sort((a, b) => (b.heat || 0) + b.deg * 0.1 + Math.random() * 0.6 - ((a.heat || 0) + a.deg * 0.1 + Math.random() * 0.6)).slice(0, max - 1)];
  keep.forEach((n, i) => ids.set(n.id, 't' + (i + 1)));
  const lines = keep.map(n => `${ids.get(n.id)} [${n.plane}, ${Math.round(n.g * 100)}%${n.parent && ids.has(n.parent) ? ', under ' + ids.get(n.parent) : ''}] ${core(n.label)}`);
  const edges = g.edges.filter(e => ids.has(e.a) && ids.has(e.b) && e.kind !== 'expands').slice(-20).map(e => `${ids.get(e.a)} -${e.relation || e.kind}-> ${ids.get(e.b)}`);
  return { ids, back: new Map([...ids].map(([k, v]) => [v, k])), text: lines.join('\n') + (edges.length ? '\nCross-links:\n' + edges.join('\n') : '') };
}

async function liveThink(g, o) {
  if (!E.liveAvailable()) return null; const m = mindOf(g), S = snapshot(g);
  const agenda = m.agenda.filter(q => !q.done).slice(-6).map(q => '- ' + q.text).join('\n'), recent = m.recent.slice(-5).join(', ');
  const prompt = `You are the free-thinking mind of a thought map about "${g.seed}". You decide what to think about next. Nobody tells you which thought to expand.
The map (id [plane, grounding, parent] thought):
${S.text}
Your open questions:
${agenda || '- none yet'}
Your recent moves: ${recent || 'none'}. Do something different from them.
Wildness ${o.wild ?? 40}/100. Look at the whole map. Follow what genuinely interests you: an unexplained gap, two distant thoughts that might connect, something that seems wrong, a consequence nobody followed, a question worth answering. Be concrete and specific to this topic; use real names, numbers, places and mechanisms where you know them. Never restate an existing thought.
Return ONLY JSON: {"intent": string (<= 100 chars, first person, what you are curious about and why), "move": string (1-3 words, your own name for the move), "thoughts": [1-3 of {"label": string (<= 80 chars, a statement), "detail": string (<= 200 chars), "plane": "facts"|"concepts"|"principles"|"wild", "grounding": number 0-1, "evidence": string (real source and year, or ""), "under": id of the thought it grows from, "links": [{"to": id, "relation": string (your own words, <= 3 words)}]}], "questions": [0-2 strings, questions you want to come back to], "answered": [0-2 strings copied from your open questions that this step answers]}`;
  let j = null; try { const t = await window.claude.complete(prompt); j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (e) { return null; }
  if (!j || !Array.isArray(j.thoughts) || !j.thoughts.length) return null;
  const res = { intent: E.short(clean(j.intent || 'following a hunch'), 110), move: E.short(clean(j.move || 'free'), 24).toLowerCase(), specs: j.thoughts.slice(0, 3).filter(t => t && t.label).map(t => ({ label: t.label, detail: t.detail, plane: t.plane, g: t.grounding, evidence: t.evidence || '', attach: S.back.get(String(t.under || '').trim()), links: (Array.isArray(t.links) ? t.links : []).slice(0, 3).map(l => [S.back.get(String(l && l.to || '').trim()), E.short(clean(l && l.relation || 'relates to'), 24)]).filter(l => l[0]) })) };
  for (const a of (Array.isArray(j.answered) ? j.answered : [])) { const q = m.agenda.find(x => !x.done && x.text.toLowerCase() === String(a).toLowerCase()); if (q) q.done = true; }
  res.ask = (Array.isArray(j.questions) ? j.questions : []).slice(0, 2).map(q => ({ text: E.short(clean(q), 140) + '?', about: res.specs[0] && res.specs[0].attach }));
  return res;
}

// One free step. Returns { intent, move, added } or null when nothing new came out.
export async function think(g, o = {}) {
  const m = mindOf(g), r = o.rand || Math.random; m.steps++;
  if (!g.nodes.length) return null;
  let res = null, move = 'live';
  if (o.live) { res = await liveThink(g, o); if (res) move = res.move || 'live'; }
  if (!res) {
    const C = concepts(g), P = pressures(g, C), tried = new Set();
    for (let t = 0; t < 6 && !res; t++) { move = choose(g, P, r); if (tried.has(move)) continue; tried.add(move); try { const x = MOVES[move].run(g, { C, P, r }); if (x && x.specs.some(s => s.label && isNew(g, s.label))) res = x; } catch (e) { console.warn('mind move failed:', move, e.message); } if (!res) settle(g, move, false); }
  }
  if (!res) return null;
  const added = commit(g, res, o.live && move !== 'live' && res.move ? 'Mind · ' + res.move : 'Mind · ' + move);
  for (const q of [].concat(res.ask || [])) if (q && q.text && !m.agenda.some(x => x.text === q.text)) m.agenda.push({ text: q.text, about: q.about || (added[0] && added[0].id), t: Date.now() });
  m.agenda = m.agenda.slice(-12); m.recent.push(move); m.recent = m.recent.slice(-10); settle(g, move, added.length > 0);
  if (!added.length) return null;
  E.trace(g, 'ai', `MIND · ${res.intent}`); E.log(g, 'mind', { move, added: added.map(n => n.id) });
  return { intent: res.intent, move, added };
}

export function describe(g) { const m = mindOf(g); const top = DRIVES.slice().sort((a, b) => m.drives[b] - m.drives[a]); return { leaning: top[0], drives: { ...m.drives }, open: m.agenda.filter(q => !q.done).map(q => q.text), steps: m.steps }; }
