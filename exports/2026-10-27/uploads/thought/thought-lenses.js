// Dynamic lenses: each thought gets a fresh set of ways to see it, picked from its own words,
// plane, grounding, neighbours and what has already been tried. Every result is a new thought
// that can be looked at again, so exploring keeps branching instead of repeating a fixed menu.
import * as E from './thought-engine.js';

const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/[.?!:;,\s]+$/, '').trim();
const lc = s => /^[A-Z](?:[a-z]|\s)/.test(s) && !/^I\s/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const core = n => clean(String(n.subject || n.label).split(/\s[—–-]\s/)[0]);
const cut = (t, k) => { if (t.length <= k) return t; const w = t.slice(0, k).replace(/\s+\S*$/, ''); return clean(w.length > k * 0.5 ? w : t.slice(0, k)) + '…'; };
const x = (n, k = 60) => lc(cut(core(n), k));
const isPlan = n => /^(to\s+)?(build|launch|teach|make|create|start|design|grow|reduce|increase|improve|fix|stop|help|scale|ship|run|change|get|give|let|turn|use|bring)\b/i.test(core(n));
const has = (n, re) => re.test(String(n.label + ' ' + n.detail).toLowerCase());

const RX = {
  people: /\b(people|user|customer|patient|student|citizen|city|team|staff|worker|parent|child|kid|community|public|voter|employee|client|reader|writer|founder|you|we|they)\b/,
  money: /\b(cost|price|money|budget|fund|pay|market|revenue|profit|cheap|expensive|invest|tax|fee|subsid)/,
  plan: /\b(build|launch|teach|make|create|start|design|grow|reduce|increase|improve|fix|stop|help|scale|ship|run|change)/,
  measure: /\b(\d+%?|rate|percent|more|less|fewer|faster|slower|better|worse|average|most|least)\b/,
  time: /\b(year|month|week|day|hour|night|sleep|morning|future|history|now|today|soon|late)\b/,
  absolute: /\b(always|never|all|every|none|must|only|everyone|nobody|cannot|impossible)\b/,
};

// fit(n, c) returns 0..1, how much this lens is likely to reveal something new about n.
export const LENSES = [
  { id: 'invert', fam: 'challenge', label: 'Invert it', plane: 'principles', fit: (n, c) => 0.35 + n.g * 0.4 + (n.plane === 'principles' ? 0.2 : 0),
    why: n => 'It reads as settled (' + Math.round(n.g * 100) + '% grounded); flipping it tests that.',
    ask: (n) => isPlan(n) ? ({ label: 'The surest ways to make sure we never ' + x(n, 46), detail: 'Name three moves that would guarantee the opposite. Any already happening is the real problem.' }) : ({ label: 'Suppose the reverse of: ' + x(n, 52), detail: 'Argue the opposite as well as you can. What evidence would you point to, and is it already out there?' }) },
  { id: 'premortem', fam: 'challenge', label: 'Pre-mortem', plane: 'concepts', fit: (n) => has(n, RX.plan) ? 0.75 : 0.3,
    why: () => 'It is a plan, and plans hide their failure modes.',
    ask: (n) => ({ label: 'A year on, the attempt to ' + lc(x(n, 46)).replace(/^to\s+/i, '') + ' failed. Why?', detail: 'Write the post-mortem first. The most believable cause is the next thing to test.' }) },
  { id: 'boundary', fam: 'challenge', label: 'Find the edge', plane: 'principles', fit: (n) => (has(n, RX.absolute) ? 0.8 : 0.25) + (n.plane === 'facts' ? 0.15 : 0),
    why: n => has(n, RX.absolute) ? 'It uses absolute words; every rule has an edge.' : 'Facts hold inside a range. Where does it end?',
    ask: (n) => ({ label: 'Where ' + x(n, 54) + ' stops being true', detail: 'Find the place, group or scale where this breaks. The edge says what it depends on.' }) },
  { id: 'evidence', fam: 'ground', label: 'What would prove it', plane: 'facts', fit: (n) => 0.9 - n.g * 0.7,
    why: n => 'Only ' + Math.round(n.g * 100) + '% grounded. One observation would settle a lot.',
    ask: (n) => ({ label: 'The observation that would settle ' + x(n, 44), detail: 'What could someone go and look at, count or ask that would show this is right or wrong?' }) },
  { id: 'measure', fam: 'ground', label: 'Put a number on it', plane: 'facts', fit: (n) => (has(n, RX.measure) ? 0.7 : 0.35) + (n.plane === 'wild' ? -0.1 : 0),
    why: n => has(n, RX.measure) ? 'It compares amounts without saying how much.' : 'A number makes it testable.',
    ask: (n) => ({ label: isPlan(n) ? 'The one number that shows ' + x(n, 40) + ' is working' : 'The one number that moves if ' + x(n, 44), detail: 'Pick the metric, its value today and the value that would count as success.' }) },
  { id: 'mechanism', fam: 'ground', label: 'Ask how it works', plane: 'concepts', fit: (n) => n.plane === 'facts' ? 0.7 : 0.35,
    why: () => 'It states an outcome; the cause underneath is unstated.',
    ask: (n) => ({ label: 'The mechanism behind ' + x(n, 52), detail: 'Trace cause to effect step by step. The weakest step is where to dig.' }) },
  { id: 'first', fam: 'ground', label: 'First principles', plane: 'principles', fit: (n) => n.plane === 'wild' || n.plane === 'concepts' ? 0.65 : 0.25,
    why: () => 'It is a framing. Strip it to what must physically or logically hold.',
    ask: (n) => ({ label: 'What must be true for ' + x(n, 50), detail: 'List only the conditions that cannot be argued away. Everything else is a choice.' }) },
  { id: 'loser', fam: 'people', label: 'Who loses', plane: 'concepts', fit: (n) => has(n, RX.people) ? 0.75 : 0.35,
    why: () => 'It names people. Someone gains, someone pays.',
    ask: (n) => ({ label: 'Who loses if ' + x(n, 54), detail: 'Name the people or groups who are worse off, and what they will do about it.' }) },
  { id: 'incentive', fam: 'people', label: 'Follow the money', plane: 'concepts', fit: (n) => has(n, RX.money) ? 0.85 : 0.3,
    why: n => has(n, RX.money) ? 'Money is already in it.' : 'Someone is paid to keep things as they are.',
    ask: (n) => ({ label: 'Who is paid to keep things as they are, against ' + x(n, 34), detail: 'Map who funds the current state. Change usually means changing what they earn.' }) },
  { id: 'feel', fam: 'people', label: 'Live it for a day', plane: 'concepts', fit: (n) => has(n, RX.people) ? 0.6 : 0.3,
    why: () => 'It is abstract. Seen from one person, it gets concrete.',
    ask: (n) => ({ label: 'One ordinary day inside ' + x(n, 50), detail: 'Walk through it hour by hour for one person. Note the moment it goes wrong for them.' }) },
  { id: 'newcomer', fam: 'people', label: 'Explain to a newcomer', plane: 'concepts', fit: (n) => 0.25 + Math.min(0.4, n.label.length / 160),
    why: () => 'Long or jargon-heavy. Plain words expose the gaps.',
    ask: (n) => ({ label: x(n, 56) + ', in words a twelve-year-old would use', detail: 'Rewrite it with no jargon. Anything you cannot say plainly is not yet understood.' }) },
  { id: 'future', fam: 'time', label: 'Ten years on', plane: 'wild', fit: (n) => has(n, RX.plan) ? 0.55 : 0.35,
    why: () => 'Time changes what matters. Look back from later.',
    ask: (n) => ({ label: 'Ten years on, ' + x(n, 50) + ' looks obvious or foolish', detail: 'Which one, and what changed in between? That change is worth watching now.' }) },
  { id: 'past', fam: 'time', label: 'How was it done before', plane: 'facts', fit: (n) => has(n, RX.time) ? 0.55 : 0.35,
    why: () => 'Most problems have a history. Old answers explain the current one.',
    ask: (n) => ({ label: 'How people handled ' + x(n, 50) + ' fifty years ago', detail: 'Find the older answer and why it was abandoned. The reason may still apply.' }) },
  { id: 'next', fam: 'time', label: 'And then what', plane: 'concepts', fit: (n) => n.g > 0.5 ? 0.6 : 0.35,
    why: () => 'It is a first-order effect. The second order is where surprises live.',
    ask: (n) => ({ label: 'If ' + x(n, 50) + ' works, what follows', detail: 'Write the next effect, then the one after. The third link is usually the unexpected one.' }) },
  { id: 'small', fam: 'scale', label: 'Smallest test', plane: 'facts', fit: (n) => n.plane === 'wild' ? 0.85 : 0.5 - n.g * 0.2,
    why: n => n.plane === 'wild' ? 'Wild ideas need a cheap first contact with reality.' : 'A small test beats more thinking.',
    ask: (n) => ({ label: isPlan(n) ? 'Try ' + x(n, 52) + ' on one street, this week' : 'A one-week check of whether ' + x(n, 46), detail: 'Shrink it to one place, a few people and a few days. What result would change your mind?' }) },
  { id: 'big', fam: 'scale', label: 'At 100x the scale', plane: 'wild', fit: (n) => n.plane === 'facts' ? 0.5 : 0.35,
    why: () => 'What works small often breaks at scale, and the reverse.',
    ask: (n) => ({ label: x(n, 56) + ', for a hundred times as many', detail: 'What breaks first: people, money, time or trust? That is the real constraint.' }) },
  { id: 'free', fam: 'scale', label: 'Remove the constraint', plane: 'wild', fit: (n) => has(n, RX.money) || has(n, RX.absolute) ? 0.6 : 0.35,
    why: () => 'Removing the limit shows whether the limit is the problem.',
    ask: (n) => ({ label: x(n, 54) + ', with unlimited money and time', detail: 'If it still fails without limits, the problem is the idea, not the budget.' }) },
  { id: 'tight', fam: 'scale', label: 'Half the resources', plane: 'concepts', fit: (n) => has(n, RX.plan) ? 0.55 : 0.3,
    why: () => 'Tight limits force the essential part to the surface.',
    ask: (n) => ({ label: x(n, 54) + ', with half the time and no budget', detail: 'What do you keep? That is the core. Everything you drop was optional.' }) },
  { id: 'far', fam: 'connect', label: 'Borrow from far away', plane: 'wild', fit: (n, c) => c.far ? 0.7 : 0,
    why: (n, c) => 'Nothing connects it to "' + E.short(c.far.label, 40) + '" yet. Distant pairs make new ideas.',
    ask: (n, c) => ({ label: 'What ' + x(n, 40) + ' could borrow from ' + x(c.far, 40), detail: 'Take the mechanism from "' + E.short(c.far.label, 60) + '" and apply it here. What survives the transfer?' }), link: c => c.far },
  { id: 'same', fam: 'connect', label: 'Same problem?', plane: 'concepts', fit: (n, c) => c.near ? 0.55 : 0,
    why: (n, c) => 'It sits close to "' + E.short(c.near.label, 40) + '". They may be one problem.',
    ask: (n, c) => ({ label: x(n, 40) + ' and ' + x(c.near, 40) + ' as one problem', detail: 'If both have the same root cause, solving one solves the other. What would that root be?' }), link: c => c.near },
  { id: 'tension', fam: 'connect', label: 'Resolve the clash', plane: 'principles', fit: (n, c) => c.clash ? 0.9 : 0,
    why: (n, c) => 'It pulls against "' + E.short(c.clash.label, 40) + '". The resolution is a new idea.',
    ask: (n, c) => ({ label: 'How ' + x(n, 40) + ' and ' + x(c.clash, 40) + ' both hold', detail: 'Find the condition under which both are true. That condition is the insight.' }), link: c => c.clash },
  { id: 'seed', fam: 'connect', label: 'Back to the goal', plane: 'concepts', fit: (n, c) => c.depth >= 3 ? 0.75 : 0,
    why: (n, c) => 'It is ' + c.depth + ' steps from the goal. Check it still serves it.',
    ask: (n, c) => ({ label: 'How ' + x(n, 44) + ' serves ' + lc(E.short(clean(c.seed), 40)), detail: 'Draw the line back to the goal. If the line is weak, this branch has drifted.' }) },
];
const BY = Object.fromEntries(LENSES.map(l => [l.id, l]));

function context(g, n) {
  const fam = new Set([n.id, n.lensOf, ...g.nodes.filter(m => m.lensOf === n.id || (n.lensOf && m.lensOf === n.lensOf)).map(m => m.id)].filter(Boolean));
  const near = E.neighborsOf(g, n.id).map(m => m.id), nearSet = new Set([...fam, ...near]);
  const sim = E.similar(g, n, 12).filter(s => !nearSet.has(s.node.id) && !s.node.lensOf);
  const others = g.nodes.filter(m => !nearSet.has(m.id) && !m.lensOf);
  let far = null; if (others.length > 3) { const sc = new Map(E.similar(g, n, g.nodes.length).map(s => [s.node.id, s.score])); far = others.slice().sort((a, b) => (sc.get(a.id) || 0) - (sc.get(b.id) || 0) || b.deg - a.deg)[Math.floor(Math.random() * Math.min(3, others.length))]; }
  let clash = null; try { const t = E.tensions(g).find(t => t.a === n.id || t.b === n.id); if (t) { const o2 = g.byId.get(t.a === n.id ? t.b : t.a); if (o2 && !fam.has(o2.id)) clash = o2; } } catch (e) { clash = null; }
  return { seed: g.seed, depth: E.depthOf(g, n), near: sim[0] && sim[0].score > 0.12 ? sim[0].node : null, far, clash, used: new Set([...g.nodes.filter(m => m.lensOf === n.id).map(m => m.lens), ...(n.lensOf && n.lens ? [n.lens] : [])]) };
}

// Weighted pick: strong fits come first, but each call varies, already-used lenses sink,
// and no two picks share a family, so a set never repeats the same angle.
export function suggest(g, id, k = 4, o = {}) {
  const n = g.byId.get(id); if (!n) return [];
  const c = context(g, n), rand = o.rand || Math.random, skip = new Set(o.skip || []);
  const pool = LENSES.map(l => { let f = 0; try { f = l.fit(n, c); } catch (e) { f = 0; } return { l, f: f * (c.used.has(l.id) ? 0.15 : 1) * (skip.has(l.id) ? 0.3 : 1) }; }).filter(p => p.f > 0.05);
  const out = [], fams = new Set();
  while (out.length < k && pool.length) {
    const cand = pool.filter(p => !fams.has(p.l.fam)); const list = cand.length ? cand : pool;
    let pick = list[0];
    if (out.length < 2 && !o.skip) { const top = list.reduce((b, p) => p.f > b.f ? p : b, list[0]); if (top.f >= 0.7) pick = top; else pick = null; } else pick = null;
    if (!pick) { const tot = list.reduce((s, p) => s + p.f * p.f, 0); let r = rand() * tot; pick = list[0]; for (const p of list) { r -= p.f * p.f; if (r <= 0) { pick = p; break; } } }
    pool.splice(pool.indexOf(pick), 1); fams.add(pick.l.fam);
    let why = ''; try { why = pick.l.why(n, c); } catch (e) { why = ''; }
    out.push({ id: pick.l.id, label: pick.l.label, why, fit: +pick.f.toFixed(2), used: c.used.has(pick.l.id) });
  }
  return out;
}

async function liveJSON(prompt) {
  if (!E.liveAvailable()) return null;
  try { const t = await window.claude.complete(prompt); const a = t.indexOf('['), b = t.indexOf('{'); const s = a >= 0 && (b < 0 || a < b) ? t.slice(a, t.lastIndexOf(']') + 1) : t.slice(b, t.lastIndexOf('}') + 1); return JSON.parse(s); } catch (e) { return null; }
}

// Live: Claude invents lenses for this exact thought. Falls back to suggest() offline.
export async function invent(g, id, k = 4) {
  const n = g.byId.get(id); if (!n) return [];
  const near = E.neighborsOf(g, id).slice(0, 5).map(m => '- ' + m.label).join('\n');
  const j = await liveJSON(`A user is exploring the goal "${g.seed}". Help them see this thought in a new light: "${n.label}" (${n.detail || 'no detail'}).\nNearby thoughts:\n${near || '- none'}\nInvent ${k} lenses specific to THIS thought, each a different angle (not generic like "pros and cons"). Return ONLY a JSON array of {"label": string (2-4 words), "question": string (<= 110 chars, the question the lens asks of this thought), "plane": "facts"|"concepts"|"principles"|"wild"}.`);
  if (!Array.isArray(j) || !j.length) return suggest(g, id, k);
  return j.slice(0, k).filter(l => l && l.label && l.question).map((l, i) => ({ id: 'live:' + i + ':' + clean(l.label).toLowerCase().slice(0, 30), label: E.short(clean(l.label), 32), why: E.short(clean(l.question), 140) + '?', question: E.short(clean(l.question), 140), plane: E.PLANE_OF[l.plane] ? l.plane : 'concepts', live: true }));
}

// Look at a thought through a lens. Adds a linked thought, never edits the original.
export async function see(g, id, lens, o = {}) {
  const n = g.byId.get(id); if (!n) return null;
  const L = typeof lens === 'string' ? BY[lens] : lens && BY[lens.id] ? BY[lens.id] : lens; if (!L || !L.label) return null;
  const lid = L.id || 'custom';
  const dup = g.nodes.find(m => m.lensOf === id && m.lens === lid); if (dup && !o.again) return { node: dup, existed: true };
  const c = context(g, n);
  let spec; try { spec = L.ask ? L.ask(n, c) : { label: E.short(clean(L.question || L.label) + ': ' + x(n, 50), 90), detail: (L.question || '') + '?' }; } catch (e) { spec = { label: L.label + ': ' + x(n, 50), detail: '' }; }
  let plane = L.plane || 'concepts', grounding = Math.max(0.15, Math.min(0.6, n.g * 0.6));
  if (o.live) {
    const j = await liveJSON(`Goal: "${g.seed}". Thought: "${n.label}" (${n.detail || ''}). Look at it through the lens "${L.label}"${L.question ? ': ' + L.question : ''}. Write the specific new thought this lens reveals, using concrete names, numbers or examples from this topic. Return ONLY JSON {"label": string (<= 80 chars, a statement not a question), "detail": string (<= 200 chars), "grounding": number 0-1, "next": string (<= 90 chars, the question this raises)}.`);
    if (j && j.label) { spec = { label: E.short(clean(j.label), 90), detail: E.short(String(j.detail || ''), 220) + (j.next ? ' Next: ' + E.short(clean(j.next), 100) + '?' : '') }; grounding = Math.max(0, Math.min(1, +j.grounding || grounding)); }
  }
  const m = E.addNodeRaw(g, { label: cap(E.short(spec.label, 96)), detail: spec.detail, plane, g: grounding, parent: id, via: 'Lens · ' + L.label, evidence: [], challenge: '' });
  m.lensOf = id; m.lens = lid; m.lensLabel = L.label; m.subject = core(n);
  E.addEdgeRaw(g, id, m.id, null, 'lens'); const e = g.edges[g.edges.length - 1]; if (e && e.b === m.id) e.relation = 'seen as';
  const other = L.link ? L.link(c) : null; if (other && other.id !== id) E.link(g, m.id, other.id, 'draws on');
  E.trace(g, 'plane', `LENS · ${L.label} → "${E.short(m.label, 40)}"`); E.log(g, 'lens', { node: m.id, of: id, lens: lid });
  return { node: m, existed: false };
}

// Pick where a lens would reveal the most: weakly grounded, rarely viewed, not itself a lens result twice over.
export function frontier(g) {
  const cand = g.nodes.filter(n => !n.archived && !n.lensOf);
  if (!cand.length) return null;
  const views = new Map(); for (const n of g.nodes) if (n.lensOf) views.set(n.lensOf, (views.get(n.lensOf) || 0) + 1);
  const sc = n => (1 - n.g) * 0.5 + (n.plane === 'wild' ? 0.2 : 0) + Math.random() * 0.35 - (views.get(n.id) || 0) * 0.25 + (n.root ? -0.1 : 0);
  return cand.sort((a, b) => sc(b) - sc(a))[0];
}

// One exploration step: choose a thought, choose a lens for it, look.
export async function wander(g, o = {}) {
  const n = o.id ? g.byId.get(o.id) : frontier(g); if (!n) return null;
  const opts = suggest(g, n.id, 3, o).filter(s => !s.used); if (!opts.length) return null;
  const pick = opts[Math.floor((o.rand || Math.random)() * opts.length)]; const r = await see(g, n.id, pick.id, o); return r ? { ...r, from: n, lens: pick } : null;
}

export function views(g, id) { return g.nodes.filter(m => m.lensOf === id).map(m => ({ id: m.id, lens: m.lensLabel || m.lens, label: m.label })); }
