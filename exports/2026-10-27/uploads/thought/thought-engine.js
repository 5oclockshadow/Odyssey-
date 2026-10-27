// thought-engine.js — graph model, SELF-DISCOVER style expansion, optional live Claude, and layouts
// shared by the three Thought Graph prototypes. Business logic only; no styling.

export const PLANES = [
  { id: 'facts', label: 'Facts', hint: 'Grounded and checkable' },
  { id: 'concepts', label: 'Concepts', hint: 'Framings and models' },
  { id: 'principles', label: 'Principles', hint: 'Rules that would have to hold' },
  { id: 'wild', label: 'Wild', hint: 'Impossible until challenged' },
];
export const PLANE_OF = Object.fromEntries(PLANES.map(p => [p.id, p]));

const FALLBACK_MODULES = [
  { id: 3, type: 'Progress Measurement', description: 'How could I measure progress on this problem?' },
  { id: 5, type: 'Assumption Identification', description: 'What are the key assumptions underlying this problem?' },
  { id: 7, type: 'Perspectival Analysis', description: 'What are the alternative perspectives or viewpoints on this problem?' },
  { id: 9, type: 'Problem Decomposition', description: 'How can I break down this problem into smaller, more manageable parts?' },
  { id: 11, type: 'Creative Thinking', description: 'Try creative thinking, generate innovative and out-of-the-box ideas to solve the problem.' },
  { id: 13, type: 'Systems Thinking', description: 'Consider the problem as part of a larger system and understand the interconnectedness of various elements.' },
  { id: 16, type: 'Core Issue Identification', description: 'What is the core issue or problem that needs to be addressed?' },
  { id: 17, type: 'Root Cause Analysis', description: 'What are the underlying causes or factors contributing to the problem?' },
  { id: 18, type: 'Historical Solution Analysis', description: 'Are there any potential solutions or strategies that have been tried before?' },
  { id: 20, type: 'Data-Driven Insight Generation', description: 'Are there any relevant data or information that can provide insights into the problem?' },
  { id: 21, type: 'Stakeholder Analysis', description: 'Are there any stakeholders or individuals who are directly affected by the problem? What are their perspectives and needs?' },
  { id: 34, type: 'Alternative Solution Generation', description: 'Given the problem specification and the current best solution, have a guess about other possible solutions.' },
  { id: 35, type: 'Contrarian Thinking', description: "Let's imagine the current best solution is totally wrong, what other ways are there to think about the problem specification?" },
  { id: 37, type: 'Innovative Solution Creation', description: 'Ignoring the current best solution, create an entirely new solution to the problem.' },
];
let MODULES = FALLBACK_MODULES;
export async function loadModules(url) {
  try {
    const r = await fetch(url || new URL('./reasoning_modules.json', import.meta.url));
    const j = await r.json();
    if (Array.isArray(j.reasoning_modules) && j.reasoning_modules.length) MODULES = j.reasoning_modules;
  } catch (e) { /* keep the fallback set */ }
  return MODULES;
}
export const modules = () => MODULES;
export const moduleById = id => MODULES.find(m => m.id === id) || FALLBACK_MODULES.find(m => m.id === id) || { id, type: 'Reasoning', description: '' };

const FACT_MODS = new Set([3, 18, 20, 22, 23, 24, 26, 32]);
const WILD_MODS = new Set([11, 35, 37]);
const PRINCIPLE_MODS = new Set([1, 2, 4, 5, 6, 8, 10, 12, 14, 15, 19, 31]);
export function planeForModule(id) {
  return FACT_MODS.has(id) ? 'facts' : WILD_MODS.has(id) ? 'wild' : PRINCIPLE_MODS.has(id) ? 'principles' : 'concepts';
}
const LOW = [20, 17, 5, 3, 18, 9], MID = [7, 13, 34, 21, 30, 16], HIGH = [11, 35, 37];
export function pickModule(wild = 40) {
  const w = wild / 100, r = Math.random();
  const pool = r < w * 0.7 ? HIGH : r < w * 0.7 + (1 - w) * 0.6 ? LOW : MID;
  return moduleById(pool[Math.floor(Math.random() * pool.length)]);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function short(s, n = 56) {
  s = String(s || '');
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + '…';
}
// A clause that can sit inside a sentence: cut at a word boundary, drop trailing punctuation and any inherited ellipsis, no "…" added.
export function stem(s, n = 42) {
  s = String(s || '').replace(/\s*[—–-]\s*(check|checked against)[^]*$/i, '').replace(/…+/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > n) { const cut = s.slice(0, n), sp = cut.lastIndexOf(' '); s = (sp > n * 0.5 ? cut.slice(0, sp) : cut); }
  s = s.replace(/[\s:;,.—–-]+$/, '');
  for (let i = 0; i < 2; i++) s = s.replace(/\s+(or|and|the|of|a|an|to|in|on|for|with|via|by|at|as|is|are|but)$/i, ''); // never end on a dangling stop-word
  return s;
}
const lc = s => (s && !(s[1] && s[1] === s[1].toUpperCase() && /[A-Z]/.test(s[1]))) ? s[0].toLowerCase() + s.slice(1) : s;
export const timeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function groundWord(g) { return g >= 0.75 ? 'grounded' : g >= 0.5 ? 'plausible' : g >= 0.3 ? 'speculative' : 'wild'; }
export function groundColor(g) {
  return g >= 0.75 ? 'var(--color-accent-300)' : g >= 0.5 ? 'var(--color-accent-500)' : g >= 0.3 ? 'var(--color-accent-600)' : 'var(--color-accent-700)';
}
export function adaptQuestion(mod, subject) {
  let q = (mod.description || '').split(/(?<=[.?!])\s/)[0];
  q = q.replace(/^(Use|Try) [^:]+:\s*/i, '').replace(/^Use /i, '');
  q = q.replace(/\b(this|that|the) problem( specification)?\b/gi, `"${short(subject, 48)}"`);
  return short(q, 150);
}

// ── Seed bank ─────────────────────────────────────────────────────────────
const ev = s => s ? s.split(';').map(x => { const [src, year] = x.split('|'); return { src: src.trim(), year: (year || '').trim() }; }) : [];
const B = (id, parent, plane, module, g, label, detail, via, evidence, challenge) =>
  ({ id, parent, plane, module, g, label, detail, via: via || 'Typed', evidence: ev(evidence), challenge: challenge || '' });

const SLEEP_BANK = [
  B('S0', null, 'concepts', null, 0.5, 'Teach a city to sleep better', 'A city-scale intervention: light, noise, heat, schedules and habits treated as one system.', 'Typed'),
  B('C1', 'S0', 'concepts', 13, 0.62, 'A city has a circadian rhythm you can measure', 'Traffic, light, noise and delivery volumes all follow a 24-hour curve. Treat the curve itself as the patient.'),
  B('F1', 'S0', 'facts', 20, 0.93, 'Night noise above 40 dB Lnight harms health', "WHO Europe's night noise guideline sets 40 dB Lnight outdoors as the threshold above which health effects begin.", 'Gmail · council newsletter', 'WHO Europe — Night Noise Guidelines for Europe|2009'),
  B('F2', 'S0', 'facts', 17, 0.9, 'Blue-rich light at night suppresses melatonin', 'Short-wavelength light in the evening delays the circadian clock; the effect scales with intensity and duration.', 'Typed', 'Harvard Health — Blue light has a dark side|2020'),
  B('P1', 'S0', 'principles', 16, 0.55, 'Remove the cause before treating the symptom', 'Light and noise first; sleep aids and apps last. The city controls the causes, not the symptoms.'),
  B('W1', 'S0', 'wild', 35, 0.12, 'A city that legally ends at midnight', 'Every non-emergency service, shop and screen goes dark at 00:00. Night becomes a shared, enforced silence.', 'Typed', '', 'Challenge: roughly one in five workers does shift work — that is why cities run after midnight at all.'),
  B('C2', 'S0', 'concepts', 7, 0.58, 'Sleep debt is an externality of nightlife, logistics and lighting', 'Nobody pays for the sleep they cost others. Price it like noise or carbon and the incentives move.', 'Slack · #urbanism'),
  B('C6', 'C1', 'concepts', 24, 0.5, 'A Sleep Score for streets, like Walk Score', 'One number per block from night light, noise, heat and late traffic. Renters would check it; landlords would fix it.'),
  B('P3', 'C1', 'principles', 3, 0.5, 'Measure at the pillow, not at the lamp post', 'The only metric that counts is sleep in bedrooms. Street sensors are proxies; wearables and surveys are the truth.', 'iOS · Health'),
  B('F9', 'C1', 'facts', 15, 0.8, 'My own sleep dips 40 minutes on weekends', 'Health data from the last eight weeks: weekend nights average 40 minutes shorter, mostly from later bedtimes.', 'iOS · Health', 'iOS Health export|8 weeks'),
  B('F7', 'C1', 'facts', 26, 0.75, 'Bedrooms above roughly 24°C fragment sleep', 'Heat is the third cause after light and noise, and the one climbing fastest.', 'Typed', 'Reviews of ambient temperature and sleep|2010s–2020s'),
  B('F6', 'F1', 'facts', 9, 0.7, 'Late-night noise clusters along a few corridors', 'The exported strategic noise map puts most Lnight exceedances on a handful of arterial roads and one rail line.', 'Windows · noise-map.csv', 'Municipal strategic noise map (exported)|2025'),
  B('F10', 'F1', 'facts', 21, 0.6, 'Scooter alarms are the top complaint in three neighbour chats', 'Three group chats, same pattern: shared-scooter alarms between 01:00 and 03:00, mostly on the same two streets.', 'Telegram · neighbours group', 'Telegram group messages, Aug–Sep|2026'),
  B('C3', 'F1', 'concepts', 30, 0.55, 'Quiet hours as infrastructure, not etiquette', 'Enforced by street design and delivery windows rather than signs asking nicely.'),
  B('F3', 'F2', 'facts', 18, 0.9, 'AMA recommends LED streetlights at 3000K or warmer', 'The 2016 AMA guidance asks for warm-white LEDs and shielding to limit glare and circadian disruption.', 'Typed', 'AMA — Community guidance on street lighting|2016'),
  B('F11', 'F2', 'facts', 32, 0.85, 'The LED retrofit tender closes in six weeks', 'A lever with a date: the spec still allows 4000K fixtures. Amend the spec and the whole city warms by default.', 'Gmail · council newsletter', 'Council procurement newsletter|Sep 2026'),
  B('P2', 'F2', 'principles', 5, 0.45, 'Default to dark: light is opt-in after midnight', 'Assumes streets need constant light for safety. Motion-triggered dimming keeps the safety and drops the dose.'),
  B('P4', 'P1', 'principles', 21, 0.5, 'Design for the worst sleeper on the block', 'Shift workers, infants, the elderly. If it works for them it works for everyone.'),
  B('P5', 'P1', 'principles', 26, 0.45, 'Nothing new after 22:00 — no new noise source gets a permit', 'A hard constraint is easier to enforce than a hundred exceptions.'),
  B('C8', 'P1', 'concepts', 18, 0.65, 'Hospitals and hotels already run sleep-first design', 'Quiet-hours protocols, dimmable corridors, blackout rooms. Borrow the playbook.'),
  B('W2', 'W1', 'wild', 37, 0.18, 'Dim the whole grid to candlelight for one hour a night', 'A civic ritual: from 23:00 to 00:00 every light in the city drops to 10%. Sleep starts with a shared signal.', 'Typed', '', 'Challenge: grid-wide dimming needs per-fixture control most cities do not have yet.'),
  B('W4', 'W1', 'wild', 35, 0.1, 'Pay people to sleep: a municipal sleep dividend', 'Health costs of short sleep are public. Pay residents whose blocks hit the Sleep Score target.', 'Typed', '', 'Challenge: outcomes cannot be verified without surveillance; pilots pay for bedtimes, not sleep.'),
  B('C7', 'C2', 'concepts', 7, 0.55, 'The last mile of deliveries is the first mile of insomnia', 'Store data shows most orders are picked and driven between 23:00 and 05:00. That is the noise floor of the city.', 'Shopify · 40% of orders ship overnight'),
  B('F5', 'C2', 'facts', 21, 0.8, 'About one in five workers in industrialised economies does shift work', 'Any sleep policy has to serve people who sleep in daylight.', 'Typed', 'ILO / Eurofound working-time surveys|2020s'),
  B('C9', 'C2', 'concepts', 7, 0.6, 'Night-shift workers want daytime dark, not night-time quiet', 'A thread of sixty replies: blackout blinds, daytime construction and doorbells matter more than 2am noise.', 'Discord · #nightshift'),
  B('W3', 'C3', 'wild', 11, 0.2, 'Sleep passports: a night of silence you can spend anywhere', 'A civic right: book a guaranteed-quiet room in any district when your street hosts an event.', 'Typed', '', 'Challenge: who supplies the rooms, and who pays when demand spikes on match nights?'),
  B('C5', 'C3', 'concepts', 11, 0.35, 'Chronotype zoning: night-owl blocks and lark blocks', 'Let districts declare their rhythm. Nightlife clusters where people are awake; quiet clusters where they are not.'),
  B('W5', 'F7', 'wild', 30, 0.25, 'Buildings that breathe cooler air at 2am', "Night-purge ventilation on every residential block, tied to the city's heat sensors.", 'Typed', '', 'Challenge: retrofitting ventilation at block scale costs more than most cooling programmes.'),
  B('F8', 'P4', 'facts', 18, 0.9, 'School start times after 8:30 improve teen sleep', "The AAP's 2014 policy statement; districts that moved start times saw longer sleep and better attendance.", 'Typed', 'American Academy of Pediatrics policy statement|2014'),
  B('F4', 'C6', 'facts', 3, 0.85, 'About a third of adults report under seven hours of sleep', 'CDC surveillance in the US; the AASM consensus recommends seven or more hours for adults.', 'Typed', 'CDC BRFSS sleep surveillance|2014–;AASM consensus statement|2015'),
  B('C4', 'P2', 'concepts', 11, 0.4, 'A darkness budget per district', 'Cap the lumens a district may emit after midnight, tradeable like parking permits.'),
  B('W7', 'P3', 'wild', 11, 0.08, 'An opt-in dream census as public data', 'Residents log dreams and sleep quality; the city reads the mood of its nights.', 'Typed', '', 'Challenge: self-reported dreams have no validated link to city-scale interventions.'),
  B('W6', 'C7', 'wild', 11, 0.1, 'A citywide lullaby on the tram network', 'Trams hum a pink-noise carrier after midnight, masking street noise along their corridors.', 'Typed', '', 'Challenge: masking only helps within a narrow loudness band; for many sleepers it is just more noise.'),
];

function genericBank(seed) {
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s, S = short(seed, 48), sl = lc(S);
  const terms = tokenize(seed).filter(t => t.length > 3), T1 = cap(terms[0] || 'this'), T2 = terms[1] ? cap(terms[1]) : null, t1 = terms[0] || 'this', t2 = terms[1] || t1;
  const verb = (seed.match(/^\s*(\w+)/) || [])[1] || '', imperative = /^(build|make|teach|grow|open|turn|start|stop|design|fix|move|cut|raise|lower|ship|write|learn|sell|find|create)$/i.test(verb);
  const root = B('S0', null, 'concepts', null, 0.5, seed, `Seed input. ${imperative ? 'A goal' : 'A thought'} about ${t1}${T2 ? ' and ' + t2 : ''}; the graph grows from here through the SELF-DISCOVER reasoning modules.`, 'Typed');
  const kids = [
    B('G1', 'S0', 'facts', 20, 0.66, `Someone has already tried ${sl}, somewhere`, `Nothing is wholly new. Find the closest precedent, what it cost, and why it stalled. That record is the first evidence this graph needs.`, 'Auto · module'),
    B('G2', 'S0', 'facts', 3, 0.62, `${T1} can be measured — fix the unit before the plan`, `Progress on "${S}" is only real once ${t1} has a number, a unit and a baseline. Choose them now so every later thought can be checked.`, 'Auto · module'),
    B('G3', 'S0', 'concepts', 16, 0.55, `The core problem under ${sl} is ${t2}, not ${t1}`, `Core Issue Identification: strip the stated goal to the constraint that actually binds. Here the pressure point looks like ${t2}.`, 'Auto · module'),
    B('G4', 'S0', 'concepts', 13, 0.52, `${S} sits inside a larger system that pushes back`, `Systems Thinking: every move on ${t1} shifts something upstream or downstream. Name the loop before acting on the part.`, 'Auto · module'),
    B('G5', 'S0', 'principles', 5, 0.48, `Nothing about ${t1} changes until the incentive changes`, `Assumption Identification: the plan assumes people will behave differently for free. Which incentive, for whom, pays for ${sl}?`, 'Auto · module'),
    B('G6', 'S0', 'principles', 21, 0.5, `Design ${sl} for whoever it serves worst`, `Stakeholder Analysis: pick the person this helps least and build for them first; if it works for them it works for everyone.`, 'Auto · module'),
    B('G7', 'S0', 'wild', 35, 0.14, `Do the opposite: make ${t1} impossible and see what survives`, `Contrarian Thinking: invert the goal completely. Whatever still matters once ${t1} is off the table is the real objective.`, 'Auto · module', '', `Challenge: inversions prove what is essential, not what is feasible.`),
    B('G8', 'S0', 'wild', 11, 0.18, `${S} — in one day, with no budget`, `Creative Thinking: remove time and money. The version that could happen tomorrow for nothing reveals which parts were never necessary.`, 'Auto · module', '', `Challenge: zero-budget versions tend to move the cost onto someone else's time.`),
    B('G9', 'G2', 'facts', 24, 0.6, `Baseline first: what ${t1} looks like today, in that unit`, `A measurement without a baseline cannot show change. Record the current state of ${t1} before anything is built.`, 'Auto · module'),
    B('G10', 'G2', 'principles', 26, 0.5, `A target for ${t1} needs a deadline or it is a wish`, `Constrain the metric in time. Without a date the number can always be met later.`, 'Auto · module'),
    B('G11', 'G1', 'facts', 18, 0.58, `The closest precedent stalled on ${t2}, not on ${t1}`, `Historical Solution Analysis: precedents rarely fail on the headline goal; they fail on the second constraint nobody budgeted for.`, 'Auto · module'),
    B('G12', 'G1', 'concepts', 34, 0.45, `What the precedent did not try: ${sl} from the ${t2} side`, `Alternative Solution Generation: take the untried angle on the same precedent.`, 'Auto · module'),
    B('G13', 'G7', 'wild', 37, 0.12, `A world where ${t1} is mandatory for everyone`, `Innovative Solution Creation: flip the inversion again — if ${t1} were compulsory, what infrastructure would have to exist? Build that, optionally.`, 'Auto · module', '', `Challenge: mandates create compliance, not the outcome; check the precedent on ${t2}.`),
    B('G14', 'G4', 'concepts', 17, 0.5, `${T1} is downstream of ${t2}; fix the source, not the symptom`, `Root Cause Analysis: trace the causal chain one step further back than the stated goal.`, 'Auto · module'),
  ];
  return [root, ...kids];
}
const pickBank = seed => (/sleep/i.test(seed) && /city|town|urban/i.test(seed)) ? SLEEP_BANK : genericBank(seed);

// ── Graph ─────────────────────────────────────────────────────────────────
let uid = 0;
export function createGraph(seed, o = {}) {
  return { seed, nodes: [], edges: [], hyper: [], byId: new Map(), trace: [], ti: 0, step: 0, revealed: new Set(), bank: pickBank(seed), cx: (o.w || 800) / 2, cy: (o.h || 600) / 2, focus: null, log: [], listeners: {}, rng: mulberry32(hashStr(seed)) };
}
// ── Hyperedges: one relation over many thoughts ──
let hid = 0;
export function addHyper(g, ids, o = {}) {
  const nodes = [...new Set(ids)].filter(id => g.byId.has(id)); if (nodes.length < 2) return null;
  const key = nodes.slice().sort().join('|');
  const existing = (g.hyper = g.hyper || []).find(h => h.nodes.slice().sort().join('|') === key); if (existing) return existing;
  const h = { id: 'h' + (++hid) + '-' + Date.now().toString(36) + '-' + nodes.length, nodes, label: short(o.label || 'bound together', 60), kind: o.kind || 'manual', module: o.module ?? null, relation: o.relation || (o.kind === 'reasoning' ? 'produced together' : o.kind === 'topic' ? 'share a topic' : o.kind === 'venue' ? 'open a venue' : o.kind === 'dream' ? 'dreamed together' : 'belong together'), weight: o.weight ?? 0.6, born: performance.now() };
  g.hyper.push(h); g._metrics = g._adj = null;
  if (!o.quiet) trace(g, 'graph', `HYPER · ${h.label} · ${nodes.length} thoughts ${h.relation}`);
  emit(g, 'hyper', h);
  return h;
}
export function removeHyper(g, id) { const i = (g.hyper || []).findIndex(h => h.id === id); if (i < 0) return false; const [h] = g.hyper.splice(i, 1); g._metrics = g._adj = null; trace(g, 'graph', `HYPER · dissolved "${short(h.label, 40)}"`); return true; }
export function updateHyper(g, id, patch) { const h = (g.hyper || []).find(x => x.id === id); if (!h) return null; if (patch.label != null) h.label = short(String(patch.label), 60); if (patch.relation) h.relation = patch.relation; if (patch.weight != null) h.weight = clamp(+patch.weight, 0, 1); return h; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function on(g, type, fn) { (g.listeners[type] = g.listeners[type] || []).push(fn); return () => { g.listeners[type] = g.listeners[type].filter(f => f !== fn); }; }
export function emit(g, type, payload) { for (const fn of g.listeners[type] || []) { try { fn(payload); } catch (e) { /* listener error must not break the graph */ } } }
export function log(g, op, data) { g.log.push({ i: g.log.length + 1, op, data, at: timeStr() }); if (g.log.length > 200) g.log.shift(); }
export function trace(g, kind, text) {
  g.trace.push({ i: ++g.ti, kind, text, t: timeStr() });
  if (g.trace.length > 80) g.trace.shift();
}
const TSTOP = new Set('the a an and or of to in on for with by at as is are be it its this that from into not no but if then than so do does did has have had was were will would can could should may might must'.split(' '));
const sentWords = s => new Set(String(s).toLowerCase().replace(/\d+(?:[.,]\d+)?/g, '#').split(/[^a-z#]+/).filter(w => w && !TSTOP.has(w)));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
export function nearDup(a, b) { const A = sentWords(a), B = sentWords(b); return A.size >= 3 && B.size >= 3 && jaccard(A, B) >= 0.6; }
// Clean generated text: drop repeated sentences (numbers ignored), doubled words, inner ellipses, stray spacing, unbalanced quotes.
export function tidy(s) {
  let t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (!t) return t;
  t = t.replace(/\s*…+(?=["”’')\]]\s*\S)/g, '').replace(/\s*…+(?=\s*[^\s"”’')\]])/g, ' ').replace(/\s+([,;:])/g, '$1');
  t = t.replace(/\b([A-Za-z]{3,})(\s+\1\b)+/gi, '$1');
  t = t.replace(/\s+([,.;:?!])/g, '$1').replace(/([!?.])\1+/g, '$1').replace(/,\s*,/g, ',').replace(/:\s*:/g, ':');
  const parts = t.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g) || [t], kept = [], out = [];
  for (const p of parts) { const w = sentWords(p); if (w.size >= 3 && kept.some(k => jaccard(k, w) >= 0.6)) continue; if (w.size) kept.push(w); out.push(p); }
  t = out.join('').replace(/\s+/g, ' ').trim();
  if ((t.match(/"/g) || []).length % 2) t = /[.!?]$/.test(t) ? t.slice(0, -1) + '"' + t.slice(-1) : t + '"';
  return t;
}
function addNode(g, s) {
  const id = s.id || ('n' + (++uid));
  const p = s.parent ? g.byId.get(s.parent) : null;
  const ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 50;
  const n = {
    id, label: tidy(s.label), detail: tidy(s.detail || ''), plane: PLANE_OF[s.plane] ? s.plane : 'concepts', g: clamp(s.g ?? 0.5, 0, 1),
    module: s.module ?? null, via: s.via || 'Auto', evidence: s.evidence || [], challenge: s.challenge || '',
    t: new Date(), born: performance.now(), parent: p ? p.id : null, act: 1, fatigue: 0, bornTick: g.brain ? g.brain.tick : 0,
    x: p ? p.x + Math.cos(ang) * dist : g.cx, y: p ? p.y + Math.sin(ang) * dist : g.cy, vx: 0, vy: 0, tx: 0, ty: 0, deg: 0, root: !s.parent && !g.nodes.length,
  };
  n.tx = n.x; n.ty = n.y;
  g.nodes.push(n); g.byId.set(id, n); g.revealed.add(id);
  g._metrics = g._adj = null; emit(g, 'node', n);
  return n;
}
function addEdge(g, a, b, module, kind = 'expands') {
  if (a === b || !g.byId.has(a) || !g.byId.has(b)) return;
  if (g.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
  g.edges.push({ id: a + '>' + b, a, b, module, kind, born: performance.now() });
  g.byId.get(a).deg++; g.byId.get(b).deg++; g._metrics = g._adj = null;
}
export function seedGraph(g, initial = 6) {
  const root = g.bank.find(b => !b.parent);
  const R = addNode(g, root); g.focus = R.id;
  trace(g, 'graph', `SEED · "${short(g.seed, 60)}"`);
  g.bank.filter(b => b.parent === root.id).slice(0, initial).forEach(k => { const n = addNode(g, k); addEdge(g, root.id, n.id, k.module); });
  trace(g, 'graph', `GRAPH · ${g.nodes.length} thoughts, ${g.edges.length} edges`);
  log(g, 'seed', { added: [] });
  return R;
}
function adjacency(g) {
  const sig = g.nodes.length + ':' + g.edges.length + ':' + (g.hyper ? g.hyper.length : 0);
  if (g._adj && g._adj.sig === sig) return g._adj.map; // rebuilt only when the map changes, so neighbour lookups stay cheap on big maps
  const adj = new Map(), has = id => g.byId.has(id);
  for (const e of g.edges) { if (!has(e.a) || !has(e.b)) continue; (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); }
  for (const h of g.hyper || []) for (const a of h.nodes) for (const b of h.nodes) if (a !== b && has(a) && has(b)) { const l = adj.get(a) || adj.set(a, []).get(a); if (!l.includes(b)) l.push(b); } // members of a hyperedge are mutually adjacent
  g._adj = { sig, map: adj };
  return adj;
}
// Drop references to thoughts that no longer exist (older saves, interrupted operations). Returns how many were repaired.
export function sanitize(g) {
  const has = id => g.byId.has(id); let fixed = 0;
  const edges = g.edges.filter(e => has(e.a) && has(e.b) && e.a !== e.b); fixed += g.edges.length - edges.length; g.edges = edges;
  if (g.hyper) { for (const h of g.hyper) { const keep = [...new Set(h.nodes.filter(has))]; fixed += h.nodes.length - keep.length; h.nodes = keep; } const hs = g.hyper.filter(h => h.nodes.length >= 2); fixed += g.hyper.length - hs.length; g.hyper = hs; }
  for (const n of g.nodes) { if (n.parent && !has(n.parent)) { n.parent = g.nodes[0] && g.nodes[0].id !== n.id ? g.nodes[0].id : null; fixed++; } if (n.parent === n.id) { n.parent = null; fixed++; } }
  for (const n of g.nodes) n.deg = 0; for (const e of g.edges) { g.byId.get(e.a).deg++; g.byId.get(e.b).deg++; }
  if (fixed) { g._metrics = g._adj = null; g._eff = null; }
  return fixed;
}
export function neighborsOf(g, id) { return (adjacency(g).get(id) || []).map(i => g.byId.get(i)); }
export function hops(g, from, max = 3) {
  const adj = adjacency(g), seen = new Map([[from, 0]]);
  let frontier = [from];
  for (let d = 1; d <= max && frontier.length; d++) {
    const next = [];
    for (const id of frontier) for (const m of adj.get(id) || []) if (!seen.has(m)) { seen.set(m, d); next.push(m); }
    frontier = next;
  }
  return seen;
}

// ── Expansion ─────────────────────────────────────────────────────────────
// The noun core of a thought: strip template openers, interrogatives and trailing punctuation so composed labels never nest ("What if what if…").
const OPENERS = /^(what if|where|when|why|how|whether|a hybrid of|a third way between|the trade-off between|the principle behind|in the dream,|a night where|push|invert:|baseline first:|do the opposite:|the closest precedent|someone has already tried|pattern behind|check:|rule:)\s*/i;
export function core(label, n = 40) {
  let s = String(label || '').replace(/\s*[—–]\s*.*$/, '').replace(/\?+\s*$/, '').replace(/\s+(to its extreme|run on .*|redesigned around .*)$/i, '').replace(/:\s*which gives way$/i, '').trim();
  for (let i = 0; i < 3; i++) { const t = s.replace(OPENERS, '').replace(/^(that|if|how)\s+/i, ''); if (t === s) break; s = t; }
  s = s.replace(/\s+(meets|borrowed from|seen through|through the lens of|vs|becomes|wakes up inside)\s+.*$/i, ''); // drop a previous template's second half
  const clause = s.match(/\s+(until|unless|because|so that|before|after|while|whereas|although|instead of)\s+/i); if (clause && clause.index >= 14) s = s.slice(0, clause.index); // cut at a clause boundary, never mid-clause
  return stem(s, n) || stem(label, n);
}
const BRIDGES = [
  (a, b) => `${a} could borrow from ${lc(b)}`,
  (a, b) => `${a}, read as a case of ${lc(b)}`,
  (a, b) => `${a} only works if ${lc(b)} holds`,
  (a, b) => `${a} and ${lc(b)} share one mechanism`,
];
function scriptedExpand(g, node, mod, o) {
  const pref = planeForModule(mod.id), grounding = mod.id === 20 || mod.id === 3;
  const all = g.bank.filter(b => b.parent === node.id && !g.revealed.has(b.id));
  let kids = all.filter(b => b.plane === pref);
  if (!kids.length && !WILD_MODS.has(mod.id) && !grounding) kids = all;
  if (kids.length) return kids.slice(0, 2).map(k => ({ ...k }));
  const others = g.nodes.filter(n => n.id !== node.id && n.plane !== node.plane && !n.members).sort(() => g.rng() - 0.5);
  if (!others.length) return [];
  const wild = o.wild ?? 40;
  const want = WILD_MODS.has(mod.id) ? ['wild', 'principles'] : grounding ? ['facts'] : wild > 50 ? ['wild', 'principles'] : ['facts', 'concepts'];
  const linked = new Set((adjacency(g).get(node.id) || []));
  const autoKids = new Set(g.nodes.filter(m => m.parent === node.id && m.via && m.via.startsWith('Auto')).map(m => m.id)), bridged = new Set();
  if (autoKids.size) for (const e of g.edges) { if (autoKids.has(e.a)) bridged.add(e.b); if (autoKids.has(e.b)) bridged.add(e.a); } // thoughts already bridged to one of this node's auto children
  const fresh = others.filter(n => !linked.has(n.id) && !bridged.has(n.id));
  const pool = fresh.length ? fresh : others;
  const b = pool.find(n => want.includes(n.plane)) || pool[0];
  const gr = +(Math.min(node.g, b.g) * 0.85).toFixed(2);
  if (grounding) return [{
    label: `${core(node.label, 40)} — checked against ${lc(core(b.label, 40))}`,
    detail: `Grounding attempt: does "${b.label}"${b.evidence[0] ? ` (${b.evidence[0].src})` : ' (no source yet)'} support "${node.label}"?`,
    plane: 'facts', g: gr, via: 'Auto · grounding', evidence: b.evidence.slice(0, 1),
    challenge: b.evidence.length ? '' : `Challenge: neither thought carries a source yet, so this check is only ${Math.round(gr * 100)}% grounded.`,
    link: b.id, kind: 'bridge',
  }];
  const tmpls = [...BRIDGES].sort(() => g.rng() - 0.5);
  let label = null;
  for (const t of tmpls) { const cand = t(core(node.label, 42), core(b.label, 42)); const near = similar(g, cand, 1)[0]; if (!g.nodes.some(n => n.label === cand) && !(near && near.score > 0.6)) { label = cand; break; } }
  if (!label) return [];
  return [{
    label,
    detail: `A bridge between "${node.label}" (${PLANE_OF[node.plane].label}) and "${b.label}" (${PLANE_OF[b.plane].label}), produced by ${mod.type}.`,
    plane: planeForModule(mod.id), g: gr, via: 'Auto · bridge', evidence: [],
    challenge: `Challenge: a bridge inherits its weakest grounding, here ${Math.round(gr * 100)}%. ${adaptQuestion(moduleById(20), node.label)}`,
    link: b.id, kind: 'bridge',
  }];
}
const hasClaude = () => typeof window !== 'undefined' && window.claude && typeof window.claude.complete === 'function';
export const liveAvailable = hasClaude;
async function liveExpand(g, node, mod, o) {
  if (!hasClaude()) return null;
  const near = neighborsOf(g, node.id).slice(0, 6).map(n => `- ${n.label}`).join('\n');
  const prompt = `You expand a thought graph. Seed: "${g.seed}".
Current thought: "${node.label}" — ${node.detail}
Plane: ${node.plane}. Grounding: ${node.g}. Neighbours:
${near || '- (none yet)'}
Reasoning module to apply: ${mod.type} — ${mod.description}
Wildness: ${o.wild ?? 40}/100 (0 = only checkable facts, 100 = impossible ideas).
This thought is ${depthOf(g, node)} steps from the seed. Go one step further: build on THIS thought's specifics, do not restate or re-answer the seed.
Return ONLY a JSON array of 2 objects shaped {"label": string (<= 70 chars, a concrete thought, not a question), "detail": string (<= 180 chars), "plane": "facts"|"concepts"|"principles"|"wild", "grounding": number 0-1, "evidence": string (a real source name and year, or ""), "challenge": string (one-sentence fact-check challenge)}.`;
  try {
    const text = await window.claude.complete(prompt);
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    const arr = JSON.parse(text.slice(s, e + 1));
    return arr.slice(0, 3).map(x => ({
      label: short(String(x.label || 'Untitled thought'), 90), detail: short(String(x.detail || ''), 240),
      plane: PLANE_OF[x.plane] ? x.plane : planeForModule(mod.id), g: clamp(+x.grounding || 0.4, 0, 1),
      via: 'Claude · live', evidence: x.evidence ? [{ src: String(x.evidence), year: '' }] : [], challenge: x.challenge ? String(x.challenge) : '',
    }));
  } catch (e) { return null; }
}
export async function expand(g, nodeId, moduleId, o = {}) {
  const node = g.byId.get(nodeId); if (!node) return [];
  const mod = moduleById(moduleId), question = adaptQuestion(mod, node.label);
  trace(g, 'select', `SELECT · ${mod.type}`);
  trace(g, 'adapt', `ADAPT · ${question}`);
  let specs = null;
  if (o.live) {
    specs = await liveExpand(g, node, mod, o);
    if (specs) {
      const seen = new Set(g.nodes.map(n => n.label.trim().toLowerCase())), kept = [];
      for (const sp of specs) { const k = sp.label.trim().toLowerCase(); if (seen.has(k)) continue; const near = similar(g, sp.label, 1)[0]; if (near && near.score > 0.85) continue; seen.add(k); kept.push(sp); } // a live thought that restates an existing one is not a new thought
      if (kept.length < specs.length) trace(g, 'ai', `CLAUDE · ${specs.length - kept.length} duplicate${specs.length - kept.length === 1 ? '' : 's'} dropped`);
      specs = kept.length ? kept : null;
    }
    if (specs) trace(g, 'ai', `CLAUDE · ${specs.length} candidate thoughts`);
  }
  if (!specs) specs = scriptedExpand(g, node, mod, o);
  const added = specs.map(s => {
    const n = addNode(g, { ...s, parent: node.id, module: s.module ?? mod.id });
    addEdge(g, node.id, n.id, mod.id, s.kind || 'expands');
    if (s.link) addEdge(g, n.id, s.link, mod.id, 'bridge');
    return n;
  });
  for (const n of added) { const e = g.edges.find(x => x.a === node.id && x.b === n.id); if (e) e.structure = { select: mod.type, adapt: question, implement: `${added.length} thought${added.length === 1 ? '' : 's'}` }; }
  if (added.length >= 2) addHyper(g, [node.id, ...added.map(n => n.id)], { kind: 'reasoning', module: mod.id, label: mod.type, weight: 0.7, quiet: true }); // one reasoning act, many thoughts
  for (const n of added) if (n.evidence.length && !(o.servers && o.servers.internet === false)) trace(g, 'internet', `INTERNET · ${n.evidence[0].src}${n.evidence[0].year ? ' (' + n.evidence[0].year + ')' : ''}`);
  trace(g, 'implement', `IMPLEMENT · ${added.length} thought${added.length === 1 ? '' : 's'} from "${short(node.label, 40)}"`);
  if (added.length && o.autoLink !== false) autoLink(g, { threshold: 0.3, cap: 1, only: added.map(n => n.id) });
  log(g, 'expand', { id: nodeId, module: mod.id, added: added.map(n => n.id) });
  emit(g, 'expand', { node, added });
  return added;
}
export function depthOf(g, n) { let d = 0, c = n; while (c && c.parent && d < 64) { d++; c = g.byId.get(c.parent); } return d; }
export function pickFrontier(g, o = {}) {
  if (o.graphIntel && g.nodes.length) {
    const w = (o.wild ?? 40) / 100, N = g.nodes.length, M = metrics(g).by, scored = [];
    const children = new Map(); for (const n of g.nodes) if (n.parent) children.set(n.parent, (children.get(n.parent) || 0) + 1);
    g.nodes.forEach((n, i) => {
      // the scripted bank only matters when the scripted engine will use it; in live mode it must not pull the frontier back to the seed
      const kids = o.live ? 0 : g.bank.filter(b => b.parent === n.id && !g.revealed.has(b.id)).length, m = M.get(n.id) || { betweenness: 0, pagerank: 0 };
      const depth = depthOf(g, n), kidsNow = children.get(n.id) || 0;
      const tip = kidsNow === 0 ? 0.6 : kidsNow === 1 ? 0.35 : 0, saturated = n.deg > 8 ? -Math.min(2.5, (n.deg - 8) * 0.15) : 0;
      const dm = o.depthMode === 'deep' ? 1.8 : o.depthMode === 'wide' ? 0.4 : 1, cap = o.depthMode === 'deep' ? 9 : 6;
      const reach = Math.min(depth, 4) * 0.22 * dm - (depth > cap ? (depth - cap) * 0.35 : 0) + (o.depthMode === 'wide' && depth <= 1 ? 0.5 : 0); // reward reaching out, then push back toward branching
      const s = kids * 1.5 + 1 / (n.deg + 1) + (w > 0.5 ? 1 - n.g : n.g) * 0.8 + (i / N) * 0.2 + (1 - m.betweenness) * 0.4 + (n.act || n.heat || 0) * 1.2 + reach + tip + saturated + (n.status === 'refuted' ? -2 : 0) + (n.dormant ? -1 : 0) + g.rng() * 0.35;
      scored.push({ n, s, depth });
    });
    // weighted draw among the strongest candidates: branching instead of one straight drill
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 6), base = top[top.length - 1].s, weights = top.map(x => Math.exp((x.s - base) * 1.4));
    let r = g.rng() * weights.reduce((a, b) => a + b, 0), pick = top[0];
    for (let k = 0; k < top.length; k++) { r -= weights[k]; if (r <= 0) { pick = top[k]; break; } }
    const best = pick.n, bd = pick.depth;
    const m = M.get(best.id);
    trace(g, 'graph', `GRAPH · frontier "${short(best.label, 34)}" · depth ${bd} · degree ${best.deg} · bridge ${Math.round((m ? m.betweenness : 0) * 100)}% · community ${m ? m.community : '-'} of ${metrics(g).communities}`);
    return best;
  }
  const withKids = o.live ? [] : g.nodes.filter(n => g.bank.some(b => b.parent === n.id && !g.revealed.has(b.id)));
  if (withKids.length && Math.random() < 0.85) return withKids[Math.floor(Math.random() * withKids.length)];
  const tips = g.nodes.filter(n => n.deg <= 2 && !n.root), pool = tips.length ? tips : g.nodes.filter(n => n.deg <= 3);
  const src = pool.length ? pool : g.nodes;
  return src[Math.floor(Math.random() * src.length)];
}
export async function autoTick(g, o = {}) {
  g.step++; cool(g);
  const target = pickFrontier(g, o);
  const kids = g.bank.filter(b => b.parent === target.id && !g.revealed.has(b.id));
  let mod = kids.length && !o.live ? moduleById(kids[0].module) : null;
  if (!mod && o.pickModule) { try { mod = o.pickModule(g, target); } catch (er) { mod = null; } }
  if (!mod) mod = pickModule(o.wild ?? 40);
  if (g.step % 3 === 1 && !(o.servers && o.servers.time === false)) trace(g, 'time', `TIME · ${timeStr()} · step ${g.step}`);
  const added = await expand(g, target.id, mod.id, o);
  if (o.onOutcome) { try { o.onOutcome(g, target, mod, added); } catch (er) {} }
  if (o.servers && o.servers.papers && g.step % 2 === 0) groundingPass(g);
  let cycle = null;
  if (o.brain) { if (g.step % 12 === 0) { sleep(g, o); cycle = 'sleep'; } else if (g.step % 6 === 0) { await evolve(g, o); cycle = 'evolve'; } else if (g.step % 4 === 2) { const f = await emergentFusion(g, o); if (f) cycle = 'fusion'; } }
  return { target, mod, added, cycle };
}
export function paths(wild = 40) {
  return [
    { kind: 'ground', label: 'Ground it', module: moduleById(20) },
    { kind: 'branch', label: 'Branch', module: moduleById(wild > 50 ? 34 : 9) },
    { kind: 'wild', label: 'Go wild', module: moduleById(wild > 70 ? 37 : wild > 35 ? 35 : 11) },
  ];
}

// ── Chat ──────────────────────────────────────────────────────────────────
function scriptedReply(g, n, q) {
  const near = neighborsOf(g, n.id).map(m => m.label), ql = q.toLowerCase(), pct = Math.round(n.g * 100);
  if (/(source|evidence|true|proof|prove|real|fact|why)/.test(ql)) {
    return n.evidence.length
      ? `${pct}% grounded. What holds it up: ${n.evidence.map(e => e.src + (e.year ? ' (' + e.year + ')' : '')).join('; ')}. ${n.detail}`
      : `Only ${pct}% grounded and no source yet. ${n.challenge || 'Nothing checks this yet.'} Try "Ground it" to look for evidence.`;
  }
  if (/(wild|crazy|what if|impossible|imagine)/.test(ql)) {
    const far = g.nodes.filter(m => m.plane === 'wild' && m.id !== n.id), pick = far[Math.floor(Math.random() * far.length)];
    return pick ? `Push it: what if "${n.label}" ran on "${pick.label}"? Grounding would fall to about ${Math.round(Math.min(n.g, pick.g) * 85)}% — worth a challenge before building on it.`
      : 'Nothing wild nearby yet. Use "Go wild" and I will bridge this thought to something impossible.';
  }
  if (/(next|path|where|how)/.test(ql)) return `Three paths from here: ground it (${moduleById(20).type}), branch it (${moduleById(9).type}) or go wild (${moduleById(35).type}). Nearest thoughts: ${near.slice(0, 3).join('; ') || 'none yet'}.`;
  return `"${n.label}" sits on the ${PLANE_OF[n.plane].label} plane at ${pct}% grounding${n.via ? `, learned via ${n.via}` : ''}. ${n.detail}${near.length ? ` It touches ${near.length} thought${near.length === 1 ? '' : 's'}: ${near.slice(0, 3).join('; ')}.` : ''}`;
}
export async function chatReply(g, nodeId, text, o = {}) {
  const n = g.byId.get(nodeId); if (!n) return '';
  if (o.live && hasClaude()) {
    const H = hops(g, nodeId, 2);
    const ctx = g.nodes.filter(m => H.has(m.id) && m.id !== nodeId).slice(0, 10).map(m => `- (${H.get(m.id)} hop) ${m.label} [${m.plane}, grounding ${m.g}]`).join('\n');
    try {
      return await window.claude.complete({
        system: `You are the voice of one thought in a thought graph seeded by "${g.seed}". The thought: "${n.label}" — ${n.detail} Plane: ${n.plane}. Grounding ${n.g}. Evidence: ${n.evidence.map(e => e.src).join('; ') || 'none'}. ${n.challenge}\nNeighbours:\n${ctx}\nAnswer in under 80 words. Separate what is grounded from what is speculation. Offer one possible next path and one wild one.`,
        messages: [...(o.history || []).map(h => ({ role: h.role === 'me' ? 'user' : 'assistant', content: h.text })), { role: 'user', content: text }],
      });
    } catch (e) { /* fall through */ }
  }
  return scriptedReply(g, n, text);
}

// ── Persistence ───────────────────────────────────────────────────────────
export function serialize(g) {
  return { seed: g.seed, step: g.step, outer: g.outer || null, brain: g.brain || null, mind: g.mind || null, learn: g.learn ? JSON.parse(JSON.stringify(g.learn)) : null, archive: (g.archive || []).slice(0, 500), hyper: (g.hyper || []).map(h => ({ ...h })), trace: g.trace.slice(-80), log: (g.log || []).slice(-200), edges: g.edges.map(e => ({ ...e })), nodes: g.nodes.map(nodeData) };
}
// Re-add a saved edge with everything learned about it (weight, relation, note, structure).
function restoreEdge(g, e) {
  const before = g.edges.length; addEdge(g, e.a, e.b, e.module, e.kind);
  if (g.edges.length > before) { const ne = g.edges[g.edges.length - 1]; if (e.weight != null) ne.weight = e.weight; if (e.relation) ne.relation = e.relation; if (e.note) ne.note = e.note; if (e.structure) ne.structure = e.structure; }
}
export function restore(d, o = {}) {
  const NESTED = /^((?:what if|where|when|why|how|whether)\s+)(?:(?:what if|where|when|why|how|whether)\s+)+/i;
  const g = createGraph(d.seed, o);
  g.step = d.step || 0; g.trace = (d.trace || []).slice(); g.ti = g.trace.length ? g.trace[g.trace.length - 1].i : 0; g.log = (d.log || []).slice(); if (d.outer) g.outer = d.outer;
  if (d.brain) g.brain = { ...d.brain }; if (d.mind) g.mind = JSON.parse(JSON.stringify(d.mind)); if (d.learn) g.learn = JSON.parse(JSON.stringify(d.learn)); g.archive = Array.isArray(d.archive) ? d.archive.slice() : [];
  g.hyper = Array.isArray(d.hyper) ? d.hyper.filter(h => h && h.nodes && h.nodes.length >= 2).map(h => ({ ...h, born: 0 })) : [];
  for (const s of d.nodes) {
    const n = { ...s, label: tidy(s.label), detail: tidy(s.detail || ''), t: new Date(s.t), born: performance.now() - 5000, vx: 0, vy: 0, tx: s.x, ty: s.y, deg: 0, evidence: s.evidence || [] };
    g.nodes.push(n); g.byId.set(n.id, n); g.revealed.add(n.id);
    const m = /^n(\d+)$/.exec(n.id); if (m) uid = Math.max(uid, +m[1]);
  }
  { const ek = new Set(); for (const e of d.edges || []) { if (!e || e.a === e.b || !g.byId.has(e.a) || !g.byId.has(e.b)) continue; const k = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a; if (ek.has(k)) continue; ek.add(k); const ne = { id: e.a + '>' + e.b, a: e.a, b: e.b, module: e.module, kind: e.kind || 'expands', born: performance.now() }; if (e.weight != null) ne.weight = e.weight; if (e.relation) ne.relation = e.relation; if (e.note) ne.note = e.note; if (e.structure) ne.structure = e.structure; g.edges.push(ne); g.byId.get(e.a).deg++; g.byId.get(e.b).deg++; } g._metrics = g._adj = null; } // one Set, not a scan per edge: big maps reopen in milliseconds
  sanitize(g);
  for (const n of g.nodes) if (n.dormant && !isGenerated(n)) n.dormant = false; // only machine-made thoughts fade // older saves may carry references to thoughts that were merged away
  // Repair verdict damage from older saves: a node with no verdict should carry its original grounding.
  for (const n of g.nodes) {
    const p = n.parent ? g.byId.get(n.parent) : null, parentRefuted = !!(p && p.status === 'refuted');
    if (!n.status && n.g0 != null) { n.g = n.g0; delete n.g0; }
    if (!parentRefuted) {
      if (n.downgradedBy) { if (n.g0 != null) { n.g = n.g0; delete n.g0; } delete n.downgradedBy; }
      if (n.injectedChallenge || /^Challenge: its parent/.test(n.challenge || '')) { n.challenge = ''; delete n.injectedChallenge; }
    }
    const b = g.bank.find(x => x.id === n.id);
    if (b && !n.status && !n.downgradedBy && Math.abs(n.g - b.g) > 0.001) n.g = b.g;
    if (NESTED.test(n.label)) n.label = n.label.replace(NESTED, '$1'); // "What if what if where…" left by older composers
  }
  dedupe(g);
  g.focus = g.nodes[0] ? g.nodes[0].id : null;
  for (const x of d.nodes || []) { const n = x && g.byId.get(x.id); if (!n) continue; if (x.chem) n.chem = { ...x.chem, queue: (x.chem.queue || []).slice() }; if (x.mol) n.mol = { ...x.mol }; if (x.grade) n.grade = JSON.parse(JSON.stringify(x.grade)); }
  return g;
}

// ── Layout ────────────────────────────────────────────────────────────────
export function stepLayout(g, mode, o = {}) {
  const N = g.nodes, n = N.length; if (!n) return 0;
  const alpha = o.alpha ?? 1, repel = (o.repel ?? 2600) * alpha, link = o.link ?? 110, spring = (o.spring ?? 0.04) * alpha;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = N[i], b = N[j];
    let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
    const d = Math.sqrt(d2), f = repel / d2, fx = dx / d * f, fy = dy / d * f;
    a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
  }
  for (const e of g.edges) {
    const a = g.byId.get(e.a), b = g.byId.get(e.b);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - link) * spring, fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  if (mode === 'field') {
    for (const m of N) {
      const an = o.anchors && o.anchors[m.plane];
      const tx = an ? an.x : g.cx, ty = an ? an.y : g.cy, k = (an ? 0.007 : 0.012) * alpha;
      m.vx += (tx - m.x) * k; m.vy += (ty - m.y) * k;
      if (m.root) { m.vx += (g.cx - m.x) * 0.06; m.vy += (g.cy - m.y) * 0.06; }
    }
  } else if (mode === 'orbit') {
    const H = o.hops || new Map(), gap = o.ringGap || 120, maxHop = o.maxHop || 3;
    for (const m of N) {
      const h = H.has(m.id) ? H.get(m.id) : maxHop + 1;
      if (h === 0) { m.vx += (g.cx - m.x) * 0.25; m.vy += (g.cy - m.y) * 0.25; continue; }
      const dx = m.x - g.cx, dy = m.y - g.cy, r = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (h * gap - r) * 0.09 * alpha;
      m.vx += dx / r * f; m.vy += dy / r * f;
    }
  }
  let energy = 0; const damp = o.damp ?? 0.78, pad = o.pad ?? 28;
  for (const m of N) {
    m.vx *= damp; m.vy *= damp;
    const sp = Math.hypot(m.vx, m.vy); if (sp > 14) { m.vx *= 14 / sp; m.vy *= 14 / sp; }
    m.x += m.vx; m.y += m.vy;
    if (o.w) m.x = clamp(m.x, pad, o.w - pad);
    if (o.h) m.y = clamp(m.y, pad, o.h - pad);
    energy += m.vx * m.vx + m.vy * m.vy;
  }
  return energy / n;
}
// Deterministic lanes: x by hop from the root, y by plane lane. Nodes ease toward their targets.
export function layoutStrata(g, o) {
  const H = o.hops, lanes = o.lanes, laneH = (o.h - o.top) / lanes.length, maxHop = o.maxHop || 3;
  const groups = new Map();
  for (const m of g.nodes) {
    const h = H.has(m.id) ? H.get(m.id) : maxHop + 1, key = m.plane + ':' + h;
    (groups.get(key) || groups.set(key, []).get(key)).push(m);
  }
  for (const [key, arr] of groups) {
    const [plane, hs] = key.split(':'), li = Math.max(0, lanes.indexOf(plane)), h = +hs, count = arr.length;
    const yBase = o.top + laneH * li + laneH / 2, step = count > 1 ? clamp((laneH - 44) / (count - 1), 22, 36) : 0, spread = step * (count - 1);
    arr.forEach((m, i) => {
      m.tx = o.left + h * o.colGap + (i % 3) * 58;
      m.ty = yBase - spread / 2 + step * i;
    });
  }
  let e = 0;
  for (const m of g.nodes) { m.x += (m.tx - m.x) * 0.16; m.y += (m.ty - m.y) * 0.16; e += Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y); }
  return e / (g.nodes.length || 1);
}

// ── Text similarity & adjacency discovery ────────────────────────────────
const STOP = new Set('a an the and or of to in on for with at by from as is are be was were it its this that these those what how why when where who which can could would should will do does did not no yes if then than so such into over under after before about more most less least very just only also any all each per via but one two three'.split(' '));
export function tokenize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u017f\s-]/g, ' ').split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ''));
}
function setSim(A, B) { if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }
export function similarity(a, b) { return setSim(new Set(tokenize(a)), new Set(tokenize(b))); }
const nodeText = n => `${n.label} ${n.detail}`;
const TOK = new WeakMap(); // token set per thought, rebuilt only when its text changes — similarity over the whole graph stays cheap
function tokensOf(n) { const key = n.label + '\u0001' + n.detail; let c = TOK.get(n); if (!c || c.key !== key) { c = { key, set: new Set(tokenize(nodeText(n))) }; TOK.set(n, c); } return c.set; }
export const nodeSim = (a, b) => setSim(tokensOf(a), tokensOf(b));
export function similar(g, textOrNode, k = 5) {
  const isText = typeof textOrNode === 'string', T = isText ? new Set(tokenize(textOrNode)) : tokensOf(textOrNode), self = isText ? null : textOrNode.id;
  return g.nodes.filter(n => n.id !== self).map(n => ({ node: n, score: setSim(T, tokensOf(n)) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
export function autoLink(g, o = {}) {
  const th = o.threshold ?? 0.22, cap = o.cap ?? 2, pool = o.only ? o.only.map(id => g.byId.get(id)).filter(Boolean) : g.nodes, added = [];
  for (const n of pool) {
    const linked = new Set((adjacency(g).get(n.id) || [])); let made = 0;
    for (const { node: m, score } of similar(g, n, 6)) {
      if (made >= cap || score < th) break;
      if (linked.has(m.id)) continue;
      addEdge(g, n.id, m.id, null, 'adjacent'); added.push({ a: n.id, b: m.id, score }); made++;
    }
  }
  if (added.length) trace(g, 'graph', `GRAPH · ${added.length} adjacency link${added.length === 1 ? '' : 's'} found by similarity (${added.map(x => x.score.toFixed(2)).join(', ')})`);
  return added;
}

// ── Graph intelligence: centrality, communities, paths ───────────────────
// ── Scale: maps of thousands of thoughts ──
const BIG = 400; // above this, quadratic passes switch to indexed or sampled ones
// Machine-made thoughts (expansions, dreams, crossovers, shakes) may be merged or forgotten. Anything typed, imported,
// pinned, tagged or sourced may not: on a real map that is the data.
export const isGenerated = n => !!n && n.module != null && !n.pinned && !(n.tags && n.tags.length) && !(n.evidence && n.evidence.length);
const mergeable = (a, b) => isGenerated(a) && isGenerated(b); // two near-identical imported records (passages, fiscal years) are still two records
// Pairs whose token sets reach Jaccard t without comparing every pair. Prefix filtering: order tokens rarest first;
// two sets that reach t share a token within each one's first |A| - ceil(t|A|) + 1. Exact unless dfCap skips very common tokens.
export function similarPairs(g, t, keep = () => true, dfCap = 0) {
  const N = g.nodes.filter(keep), T = N.map(n => [...tokensOf(n)]), df = new Map(), post = new Map(), out = [];
  for (const ts of T) for (const x of ts) df.set(x, (df.get(x) || 0) + 1);
  for (let i = 0; i < N.length; i++) {
    const ts = T[i].sort((a, b) => df.get(a) - df.get(b) || (a < b ? -1 : a > b ? 1 : 0)), m = ts.length; if (!m) continue;
    const p = m - Math.ceil(t * m) + 1, cand = new Set();
    for (let k = 0; k < p && k < m; k++) {
      const x = ts[k]; if (dfCap && df.get(x) > dfCap) continue;
      let L = post.get(x); if (L) { for (const j of L) cand.add(j); } else { L = []; post.set(x, L); } L.push(i);
    }
    const A = tokensOf(N[i]); for (const j of cand) { const s = setSim(tokensOf(N[j]), A); if (s >= t) out.push([j, i, s]); }
  }
  out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return out.map(([j, i, s]) => [N[j].id, N[i].id, s]);
}
// Each thought's closest likeness to any other, through an index of its rarer tokens. Novelty for evolution on big maps.
function nearestLikeness(g) {
  const N = g.nodes, T = N.map(n => tokensOf(n)), df = new Map(), post = new Map(), cap = Math.max(30, Math.round(N.length * 0.02)), best = new Map();
  for (const ts of T) for (const x of ts) df.set(x, (df.get(x) || 0) + 1);
  N.forEach((n, i) => { for (const x of T[i]) if (df.get(x) <= cap) (post.get(x) || post.set(x, []).get(x)).push(i); });
  N.forEach((n, i) => { let b = 0; const seen = new Set([i]); for (const x of T[i]) for (const j of post.get(x) || []) if (!seen.has(j)) { seen.add(j); const s = setSim(T[i], T[j]); if (s > b) b = s; } best.set(n.id, b); });
  return best;
}
export function metrics(g) {
  const sig = g.nodes.length + ':' + g.edges.length;
  if (g._metrics && g._metrics.sig === sig) return g._metrics;
  const ids = g.nodes.map(n => n.id), n = ids.length, N = n || 1, ix = new Map(ids.map((id, i) => [id, i])), adj = adjacency(g);
  const nb = ids.map(id => { const o = []; for (const x of adj.get(id) || []) { const j = ix.get(x); if (j != null) o.push(j); } return o; });
  // Brandes betweenness on index arrays. Big maps sample their sources (Brandes and Pich 2007); scores are normalised, so the ranking is what counts.
  const K = n > 500 ? 128 : n, bet = new Float64Array(n), S = new Int32Array(n), Q = new Int32Array(n), dist = new Int32Array(n), sigma = new Float64Array(n), delta = new Float64Array(n), P = ids.map(() => []);
  for (let k = 0; k < K; k++) {
    const s = K === n ? k : Math.floor(k * n / K);
    dist.fill(-1); sigma.fill(0); delta.fill(0); for (const p of P) p.length = 0;
    dist[s] = 0; sigma[s] = 1; let qh = 0, qt = 0, sp = 0; Q[qt++] = s;
    while (qh < qt) { const v = Q[qh++], dv = dist[v] + 1; S[sp++] = v; for (const w of nb[v]) { if (dist[w] < 0) { dist[w] = dv; Q[qt++] = w; } if (dist[w] === dv) { sigma[w] += sigma[v]; P[w].push(v); } } }
    while (sp > 0) { const w = S[--sp]; for (const v of P[w]) delta[v] += sigma[v] / sigma[w] * (1 + delta[w]); if (w !== s) bet[w] += delta[w]; }
  }
  let pr = new Float64Array(n).fill(1 / N), nx = new Float64Array(n); // PageRank
  for (let it = 0; it < 30; it++) { for (let v = 0; v < n; v++) { let sum = 0; for (const u of nb[v]) sum += pr[u] / (nb[u].length || 1); nx[v] = 0.15 / N + 0.85 * sum; } const sw = pr; pr = nx; nx = sw; }
  const label = new Int32Array(n); for (let i = 0; i < n; i++) label[i] = i; // label-propagation communities
  for (let it = 0; it < 12; it++) {
    let changed = false;
    for (let v = 0; v < n; v++) { if (!nb[v].length) continue; const counts = new Map(); for (const u of nb[v]) counts.set(label[u], (counts.get(label[u]) || 0) + 1); let best = label[v], bc = -1; for (const [l, c] of counts) if (c > bc || (c === bc && l < best)) { best = l; bc = c; } if (best !== label[v]) { label[v] = best; changed = true; } }
    if (!changed) break;
  }
  const commIndex = new Map(); for (let v = 0; v < n; v++) if (!commIndex.has(label[v])) commIndex.set(label[v], commIndex.size + 1);
  let maxBet = 1e-9, maxPr = 1e-9; for (let i = 0; i < n; i++) { if (bet[i] > maxBet) maxBet = bet[i]; if (pr[i] > maxPr) maxPr = pr[i]; }
  const by = new Map(ids.map((id, i) => [id, { degree: nb[i].length, betweenness: bet[i] / maxBet, pagerank: pr[i] / maxPr, community: commIndex.get(label[i]) }]));
  const rank = key => [...by.entries()].sort((a, b) => b[1][key] - a[1][key]).map(([id]) => id);
  g._metrics = { sig, by, hubs: rank('pagerank').slice(0, 3), bridges: rank('betweenness').slice(0, 3), communities: commIndex.size, sampled: K < n };
  return g._metrics;
}
export function shortestPath(g, a, b) {
  const adj = adjacency(g), prev = new Map([[a, null]]), Q = [a];
  for (let h = 0; h < Q.length; h++) { const v = Q[h]; if (v === b) break; for (const w of adj.get(v) || []) if (!prev.has(w)) { prev.set(w, v); Q.push(w); } }
  if (!prev.has(b)) return null;
  const path = []; for (let v = b; v !== null; v = prev.get(v)) path.unshift(v); return path;
}
export function reasoningPath(g, id) {
  const chain = []; let n = g.byId.get(id);
  while (n && n.parent && g.byId.has(n.parent)) {
    const e = g.edges.find(x => x.a === n.parent && x.b === n.id);
    chain.unshift({ from: g.byId.get(n.parent).label, to: n.label, module: e && e.module != null ? moduleById(e.module).type : 'Seed', relation: e ? relation(e) : 'expands', kind: e ? e.kind : 'expands', structure: e ? e.structure : null });
    n = g.byId.get(n.parent);
  }
  return chain;
}

// ── Grounding: propagation and verification ──────────────────────────────
export function effectiveGrounding(g) {
  // cached per frame-stable signature: counts plus the grounding/verdict mass, so any verify, refute or learn invalidates it
  let mass = 0; for (const n of g.nodes) mass += n.g + (n.status === 'verified' ? 7 : n.status === 'refuted' ? 13 : 0) + n.evidence.length * 0.01;
  const sig = g.nodes.length + ':' + g.edges.length + ':' + mass.toFixed(4);
  if (g._eff && g._eff.sig === sig) return g._eff.out;
  const adj = adjacency(g), out = new Map();
  for (const n of g.nodes) {
    const nb = (adj.get(n.id) || []).map(i => g.byId.get(i));
    const support = nb.length ? nb.reduce((s, m) => s + m.g * (m.evidence.length ? 1 : 0.6), 0) / nb.length : n.g;
    let eff = 0.75 * n.g + 0.25 * support;
    if (n.status === 'verified') eff = Math.max(eff, 0.9);
    if (n.status === 'refuted') eff = Math.min(eff, 0.12);
    out.set(n.id, clamp(eff, 0, 1));
  }
  g._eff = { sig, out };
  return out;
}
export function verify(g, id, verdict, note = '') {
  const n = g.byId.get(id); if (!n) return [];
  const touched = [n];
  if (verdict === 'open') {
    if (n.g0 != null) { n.g = n.g0; delete n.g0; }
    for (const m of g.nodes) if (m.downgradedBy === id) { if (m.g0 != null) { m.g = m.g0; delete m.g0; } if (m.injectedChallenge) { m.challenge = ''; delete m.injectedChallenge; } delete m.downgradedBy; touched.push(m); }
    n.status = undefined; n.verdictNote = '';
  } else {
    if (n.g0 == null) n.g0 = n.g;
    n.status = verdict; n.verdictNote = note;
    if (verdict === 'verified') n.g = Math.max(n.g0, 0.9);
    if (verdict === 'refuted') n.g = Math.min(n.g0, 0.1);
    for (const m of g.nodes) if (m.downgradedBy === id) { if (m.g0 != null) { m.g = m.g0; delete m.g0; } if (m.injectedChallenge) { m.challenge = ''; delete m.injectedChallenge; } delete m.downgradedBy; }
    if (verdict === 'refuted') for (const m of g.nodes) if (m.parent === id && m.plane !== 'facts') { m.g0 = m.g; m.g = +(m.g * 0.6).toFixed(2); m.downgradedBy = id; if (!m.challenge) { m.challenge = `Challenge: its parent "${short(n.label, 40)}" was refuted.`; m.injectedChallenge = true; } touched.push(m); }
  }
  g._metrics = g._adj = null;
  trace(g, 'verify', `VERIFY · "${short(n.label, 40)}" ${verdict === 'open' ? 'reopened' : verdict}${note ? ' · ' + note : ''}${touched.length > 1 ? ` · ${touched.length - 1} dependent thought${touched.length === 2 ? '' : 's'} ${verdict === 'open' ? 'restored' : 'downgraded'}` : ''}`);
  log(g, 'verify', { id, verdict }); emit(g, 'verify', { node: n, verdict });
  return touched;
}

// ── Planes: re-express one thought on another plane ──────────────────────
const PROJECT = {
  facts: n => ({ label: `Check: ${lc(short(n.label, 60))}`, detail: `What would have to be measurably true for "${n.label}" to hold — a testable claim with a source to find.`, g: Math.min(0.6, n.g + 0.1), module: 20 }),
  concepts: n => ({ label: `Pattern behind ${lc(short(n.label, 56))}`, detail: `The general mechanism "${n.label}" is one instance of.`, g: n.g * 0.9, module: 13 }),
  principles: n => ({ label: `Rule: ${lc(short(n.label, 60))}`, detail: `If "${n.label}" matters, the rule the city would have to adopt and never break.`, g: n.g * 0.8, module: 5 }),
  wild: n => ({ label: `Push ${lc(short(n.label, 50))} to its extreme`, detail: `Take "${n.label}" past the point where it stops being reasonable, then ask what still works.`, g: Math.min(n.g, 0.25), module: 37 }),
};
async function liveJSON(prompt) {
  if (!hasClaude()) return null;
  try { const text = await window.claude.complete(prompt); return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (e) { return null; }
}
export async function project(g, id, plane, o = {}) {
  const n = g.byId.get(id); if (!n || !PLANE_OF[plane] || n.plane === plane) return null;
  const existing = g.nodes.find(m => m.projectionOf === id && m.plane === plane); if (existing) return existing;
  let spec = PROJECT[plane](n);
  if (o.live) {
    const j = await liveJSON(`Re-express this thought on the "${PLANE_OF[plane].label}" plane (${PLANE_OF[plane].hint}). Seed: "${g.seed}". Thought: "${n.label}" — ${n.detail}\nReturn ONLY JSON {"label": string (<= 70 chars), "detail": string (<= 160 chars), "grounding": number 0-1}.`);
    if (j && j.label) spec = { ...spec, label: short(String(j.label), 90), detail: short(String(j.detail || ''), 220), g: clamp(+j.grounding || spec.g, 0, 1) };
  }
  const p = addNode(g, { ...spec, plane, parent: id, via: 'Projection', evidence: [], challenge: plane === 'wild' ? `Challenge: a projection carries no evidence of its own; it inherits ${Math.round(n.g * 100)}% from "${short(n.label, 36)}".` : '' });
  p.projectionOf = id; addEdge(g, id, p.id, spec.module, 'projection');
  trace(g, 'plane', `PLANE · "${short(n.label, 36)}" re-expressed as ${PLANE_OF[plane].label}`);
  log(g, 'project', { id, plane, added: [p.id] });
  return p;
}

// ── Challenge: the strongest objection, grounded where possible ──────────
export async function challenge(g, id, o = {}) {
  const n = g.byId.get(id); if (!n) return null;
  let spec = null;
  if (o.live) {
    const j = await liveJSON(`Write the strongest one-line objection to this thought, grounded in a checkable fact if possible. Seed: "${g.seed}". Thought: "${n.label}" — ${n.detail}\nReturn ONLY JSON {"label": string (<= 70 chars, starts with "But "), "detail": string (<= 160 chars), "grounding": number 0-1, "evidence": string}.`);
    if (j && j.label) spec = { label: short(String(j.label), 90), detail: short(String(j.detail || ''), 220), g: clamp(+j.grounding || 0.5, 0, 1), evidence: j.evidence ? [{ src: String(j.evidence), year: '' }] : [], plane: j.evidence ? 'facts' : 'principles' };
  }
  if (!spec) {
    const fact = similar(g, n, 8).map(x => x.node).find(m => m.plane === 'facts' && m.evidence.length && m.id !== n.parent);
    spec = fact
      ? { label: `But ${lc(short(fact.label, 64))}`, detail: `Does "${fact.label}" leave room for "${n.label}"? If not, one of them gives.`, g: Math.min(0.8, fact.g), evidence: fact.evidence.slice(0, 1), plane: 'facts', link: fact.id }
      : { label: `But who pays, who enforces, and what breaks at 3am?`, detail: `The three objections every city idea meets first. "${n.label}" has to answer all of them.`, g: 0.45, evidence: [], plane: 'principles' };
  }
  const c = addNode(g, { ...spec, parent: id, module: 35, via: 'Challenge', challenge: '' });
  c.challengeOf = id; addEdge(g, id, c.id, 35, 'challenge'); if (spec.link) addEdge(g, c.id, spec.link, 35, 'bridge');
  trace(g, 'select', `SELECT · ${moduleById(35).type} · objection to "${short(n.label, 34)}"`);
  log(g, 'challenge', { id, added: [c.id] });
  return c;
}

// ── Learning from experience: ingest events from connected sources ───────
export function sampleInbox(seed) {
  if (/sleep/i.test(seed)) return [
    { source: 'Slack · #urbanism', text: 'Council confirmed the LED retrofit spec review stays open until Nov 12 and 3000K is on the table.', at: '09:14' },
    { source: 'Gmail · WHO newsletter', text: 'New environmental noise brief: night-time road traffic remains the top exposure in European cities.', at: '09:40' },
    { source: 'Telegram · neighbours', text: 'Scooter alarms again at 02:10 on Rua da Rosa; three people awake in the chat.', at: '02:12' },
    { source: 'Discord · #nightshift', text: 'Day sleepers asking for blackout blind subsidies; construction noise 08:00 to 12:00 is the real enemy.', at: '11:05' },
    { source: 'iOS · Health', text: 'Sleep last night 6h 02m with three wake-ups between 01:00 and 03:00.', at: '07:30' },
    { source: 'Shopify · orders', text: '41% of this week\u2019s orders shipped between 23:00 and 05:00 after the carrier moved to a night fleet.', at: '08:00' },
    { source: 'Windows · noise-map.csv', text: 'Updated Lnight layer: two new exceedance cells along the tram line near Alc\u00e2ntara.', at: '10:20' },
  ];
  return [
    { source: 'Gmail', text: `A newsletter mentions "${short(seed, 40)}" and asks who already does it well.`, at: '09:00' },
    { source: 'Slack', text: `The team asked what the first measurable step toward "${short(seed, 40)}" would be.`, at: '10:15' },
    { source: 'iOS · Notes', text: `A note from last night: "${short(seed, 40)}" — what if the opposite were true?`, at: '23:40' },
  ];
}
export function ingest(g, items, o = {}) {
  const added = [];
  for (const it of items) {
    const top = similar(g, it.text, 1)[0];
    if (top && top.score > 0.6) { trace(g, 'learn', `LEARN · ${it.source} · near-duplicate of "${short(top.node.label, 34)}" skipped`); continue; }
    const anchor = top && top.score > 0.08 ? top.node : g.nodes[0];
    const n = addNode(g, { label: short(it.text, 72), detail: `${it.text} Learned from ${it.source}${it.at ? ' at ' + it.at : ''}.`, plane: 'facts', g: 0.7, module: 20, via: it.source, evidence: [{ src: it.source, year: it.at || 'today' }], parent: anchor.id });
    n.learned = true; addEdge(g, anchor.id, n.id, 20, 'learned'); added.push(n);
    trace(g, 'learn', `LEARN · ${it.source} → attached to "${short(anchor.label, 32)}"${top ? ` (similarity ${top.score.toFixed(2)})` : ''}`);
  }
  if (added.length) { autoLink(g, { threshold: 0.25, cap: 1, only: added.map(n => n.id) }); log(g, 'ingest', { added: added.map(n => n.id) }); emit(g, 'learn', { added }); }
  return added;
}

// ── Ask the graph: retrieval over thoughts, scripted or Claude ───────────
export async function queryGraph(g, text, o = {}) {
  const hits = similar(g, text, 5), eff = effectiveGrounding(g), root = g.nodes[0];
  if (o.live && hasClaude() && hits.length) {
    try {
      const answer = await window.claude.complete({ system: `Answer only from this thought graph. Seed: "${g.seed}". Relevant thoughts:\n${hits.map(h => `- ${h.node.label} — ${h.node.detail} [${h.node.plane}, grounding ${eff.get(h.node.id).toFixed(2)}]`).join('\n')}\nUnder 90 words. Name the thoughts you used and flag which are speculative.`, messages: [{ role: 'user', content: text }] });
      return { hits, answer };
    } catch (e) { /* fall through */ }
  }
  const path = hits[0] && root ? shortestPath(g, root.id, hits[0].node.id) : null;
  const answer = hits.length
    ? `Closest: ${hits.slice(0, 3).map(h => `"${short(h.node.label, 40)}" (${PLANE_OF[h.node.plane].label}, ${Math.round(eff.get(h.node.id) * 100)}%)`).join('; ')}.${path && path.length > 1 ? ` From the seed it is ${path.length - 1} hop${path.length === 2 ? '' : 's'}: ${path.map(i => short(g.byId.get(i).label, 24)).join(' → ')}.` : ''}`
    : 'Nothing in the graph matches yet — expand, learn from the inbox, or let auto mode run, then ask again.';
  return { hits, answer };
}

// ── Command log: undo the last operation that added thoughts ─────────────
export function removeNodes(g, ids) {
  const S = new Set(ids);
  g.edges = g.edges.filter(e => { const drop = S.has(e.a) || S.has(e.b); if (drop) { const a = g.byId.get(e.a), b = g.byId.get(e.b); if (a && !S.has(a.id)) a.deg--; if (b && !S.has(b.id)) b.deg--; } return !drop; });
  g.nodes = g.nodes.filter(n => !S.has(n.id));
  for (const id of S) { g.byId.delete(id); g.revealed.delete(id); }
  if (g.hyper) { for (const h of g.hyper) { const lost = h.nodes.some(id => S.has(id)); h.nodes = h.nodes.filter(id => !S.has(id)); if (lost && (h.kind === 'fusion' || h.kind === 'reasoning')) h.nodes = []; } g.hyper = g.hyper.filter(h => h.nodes.length >= 2); } // a fusion or reasoning act is one event: losing any member dissolves it
  g._metrics = g._adj = null;
}
export function undo(g) {
  for (let i = g.log.length - 1; i >= 0; i--) {
    const e = g.log[i];
    if (e.undone || !e.data || !e.data.added || !e.data.added.length) continue;
    const ids = e.data.added.filter(id => g.byId.has(id)); e.undone = true;
    if (!ids.length) continue;
    removeNodes(g, ids);
    if (e.op === 'fuse' && e.data.parents) for (const pid of e.data.parents) { const p = g.byId.get(pid); if (!p) continue; p.fusions = Math.max(0, (p.fusions || 0) - 1); if (!p.fusions && p.tags) p.tags = p.tags.filter(t => t !== 'fused'); } // parents forget a reaction that never happened
    trace(g, 'graph', `UNDO · removed ${ids.length} thought${ids.length === 1 ? '' : 's'} added by ${e.op}`);
    emit(g, 'undo', { ids });
    return ids;
  }
  return [];
}

// ── Relations: what an edge means ────────────────────────────────────────
const RELATION_OF_MODULE = { 20: 'supports', 3: 'measures', 24: 'measures', 23: 'measures', 17: 'causes', 16: 'defines', 9: 'decomposes', 13: 'systematizes', 7: 'reframes', 34: 'alternative to', 35: 'contradicts', 37: 'reinvents', 11: 'imagines', 5: 'assumes', 21: 'affects', 18: 'precedent for', 26: 'constrains', 30: 'designs', 32: 'urges', 15: 'reflects on', 36: 'refines', 1: 'tests', 2: 'tests', 6: 'risks', 14: 'risks', 19: 'blocks', 22: 'resources', 8: 'follows from', 4: 'simplifies', 10: 'questions', 12: 'co-creates' };
export function relation(e) {
  if (e.kind === 'challenge') return 'contradicts';
  if (e.kind === 'projection') return 're-expresses';
  if (e.kind === 'adjacent') return 'resembles';
  if (e.kind === 'bridge') return 'bridges';
  if (e.kind === 'learned') return 'evidences';
  if (e.kind === 'synapse') return 'fires with';
  if (e.kind === 'dream') return 'dreamed with';
  if (e.kind === 'fold') return 'contains';
  if (e.kind === 'fusion') return 'emerged from';
  if (e.kind === 'venue') return 'opens onto';
  return RELATION_OF_MODULE[e.module] || 'expands';
}

// ── Tensions: thoughts that pull against each other ──────────────────────
const NEG = /\b(not|no|never|without|cannot|can't|won't|less|fewer|stop|ban|end|ends|opposite|against|refuted)\b/i;
const TEMPLATE_WORDS = /\b(what if|borrowed from|seen through|where|meets|but only if|instead|but)\b/gi;
const polarity = n => NEG.test(n.label.replace(TEMPLATE_WORDS, ' '));
const stripped = n => n.label.replace(TEMPLATE_WORDS, ' ');
const STRIPPED = new WeakMap(), strippedTokens = n => { let c = STRIPPED.get(n); if (!c || c.key !== n.label) { c = { key: n.label, set: new Set(tokenize(stripped(n))) }; STRIPPED.set(n, c); } return c.set; };
const derivative = n => !!(n.projectionOf || n.challengeOf || (n.via && (n.via.startsWith('Auto · bridge') || n.via.startsWith('Auto · grounding'))));
export function tensions(g) {
  const out = [], seen = new Set();
  const push = (a, b, why, score) => { const k = a < b ? a + '|' + b : b + '|' + a; if (seen.has(k)) return; seen.add(k); out.push({ a, b, why, score }); };
  for (const e of g.edges) if (e.kind === 'challenge') push(e.a, e.b, 'explicit objection', 1);
  const N = g.nodes, M = N.length > BIG ? metrics(g) : null; if (M && M._tensions) return M._tensions;
  const pairs = M ? similarPairs(g, 0.26, n => !n.members && !derivative(n), Math.max(50, Math.round(N.length * 0.03))).map(([a, b, s]) => [g.byId.get(a), g.byId.get(b), s]) : null;
  const each = fn => { if (pairs) { for (const [a, b, s] of pairs) fn(a, b, s); return; } for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) fn(N[i], N[j], null); };
  each((a, b, s0) => {
    if (a.members || b.members || derivative(a) || derivative(b)) return; // derivatives of one thought are not opposing claims
    if (a.parent === b.id || b.parent === a.id) return;
    const s = s0 ?? nodeSim(a, b); if (s < 0.26) return;
    if (setSim(strippedTokens(a), strippedTokens(b)) > 0.5) return; // same claim twice, not a tension
    const negA = polarity(a), negB = polarity(b), wildVsFact = (a.plane === 'wild' && b.plane === 'facts') || (b.plane === 'wild' && a.plane === 'facts');
    if (negA !== negB) push(a.id, b.id, 'same topic, opposite polarity', s);
    else if (wildVsFact) push(a.id, b.id, 'a wild claim beside a grounded fact', s * 0.9);
    else if (a.status && b.status && a.status !== b.status) push(a.id, b.id, 'one verified, one refuted', s);
  });
  const res = out.sort((x, y) => y.score - x.score).slice(0, 12); if (M) M._tensions = res; return res;
}

// ── Topics: name each community by its distinctive words ─────────────────
export function topics(g) {
  const M = metrics(g), groups = new Map(), df = new Map();
  for (const n of g.nodes) { const c = M.by.get(n.id).community; (groups.get(c) || groups.set(c, []).get(c)).push(n); for (const t of new Set(tokenize(nodeText(n)))) df.set(t, (df.get(t) || 0) + 1); }
  return [...groups.entries()].map(([c, arr]) => {
    const tf = new Map(); for (const n of arr) for (const t of tokenize(nodeText(n))) tf.set(t, (tf.get(t) || 0) + 1);
    const words = [...tf.entries()].map(([t, f]) => [t, f * Math.log(1 + g.nodes.length / (df.get(t) || 1))]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const hub = [...arr].sort((a, b) => M.by.get(b.id).pagerank - M.by.get(a.id).pagerank)[0];
    return { community: c, size: arr.length, label: words.join(' · ') || 'misc', ids: arr.map(n => n.id), hub: hub.id, grounding: arr.reduce((s, n) => s + n.g, 0) / arr.length };
  }).sort((a, b) => b.size - a.size);
}

// ── Hypothesis test: facts for and against one thought ───────────────────
export function testHypothesis(g, id) {
  const n = g.byId.get(id); if (!n) return null;
  const scored = g.nodes.filter(m => m.plane === 'facts' && m.id !== id).map(f => ({ f, s: nodeSim(n, f) })).filter(x => x.s > 0.1).sort((a, b) => b.s - a.s).slice(0, 5);
  const polarityN = polarity(n);
  const support = scored.filter(x => polarity(x.f) === polarityN && !(x.f.status === 'refuted')), against = scored.filter(x => !support.includes(x));
  const score = scored.length ? clamp(0.5 + support.reduce((s, x) => s + x.s * x.f.g, 0) - against.reduce((s, x) => s + x.s * x.f.g, 0), 0, 1) : 0.5;
  return { support: support.map(x => x.f), against: against.map(x => x.f), score, verdict: !scored.length ? 'untested — no facts nearby' : score > 0.62 ? 'leaning supported' : score < 0.38 ? 'leaning contradicted' : 'contested' };
}

// ── Attention: what the user touches gets followed ───────────────────────
export function touch(g, id) { activate(g, id, 1); }
export function cool(g) { for (const n of g.nodes) if (n.heat) n.heat = n.heat > 0.05 ? n.heat * 0.9 : 0; }

// ── What to look at next ─────────────────────────────────────────────────
export function interesting(g, k = 5) {
  const M = metrics(g), eff = effectiveGrounding(g), N = g.nodes.length || 1;
  return g.nodes.map((n, i) => {
    const m = M.by.get(n.id), near = similar(g, n, 1)[0], novelty = 1 - (near ? near.score : 0), e = eff.get(n.id);
    const parts = [['novel', novelty * 0.3], ['bridges communities', m.betweenness * 0.3], [n.plane === 'wild' ? 'wild yet grounded' : 'weakly grounded', (n.plane === 'wild' ? e : 1 - e) * 0.2], ['fresh', (i / N) * 0.12], ['active now', (n.act || n.heat || 0) * 0.15]];
    const score = parts.reduce((s, p) => s + p[1], 0), why = parts.sort((a, b) => b[1] - a[1])[0][0];
    return { node: n, score, why };
  }).sort((a, b) => b.score - a.score).slice(0, k);
}

// ── Fusion: two thoughts react and a third emerges ────────────────────────────────────
// Outcomes: merge (same idea twice), tension (they contradict; the child names the conflict), or emergence (a new possibility neither held alone).
const PLANE_RANK = { facts: 0, concepts: 1, principles: 2, wild: 3 };
const FUSIONS = {
  emergence: [(a, b) => `${a} × ${lc(b)}`, (a, b) => `${a} run on ${lc(b)}`, (a, b) => `${a}, redesigned around ${lc(b)}`, (a, b) => `A third way between ${lc(a)} and ${lc(b)}`],
  tension: [(a, b) => `${a} vs ${lc(b)}: which gives way`, (a, b) => `The trade-off between ${lc(a)} and ${lc(b)}`],
  lift: [(a, b) => `What ${lc(a)} and ${lc(b)} have in common`, (a, b) => `The principle behind ${lc(a)} and ${lc(b)}`],
};
export function fusionOutcome(g, a, b) {
  const sim = nodeSim(a, b);
  if (sim > 0.72) return 'merge';
  const conflict = g.edges.some(e => e.kind === 'challenge' && ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))) || tensions(g).some(t => (t.a === a.id && t.b === b.id) || (t.a === b.id && t.b === a.id));
  if (conflict) return 'tension';
  if (a.plane === b.plane && sim > 0.3) return 'lift';
  return 'emergence';
}
async function liveFuse(g, a, b, outcome, o) {
  if (!hasClaude()) return null;
  const prompt = `Two thoughts in a graph seeded by "${g.seed}" are being fused.
A: "${a.label}" — ${a.detail} (${a.plane}, grounding ${a.g})
B: "${b.label}" — ${b.detail} (${b.plane}, grounding ${b.g})
Outcome type: ${outcome} (${outcome === 'tension' ? 'name the conflict and what resolves it' : outcome === 'lift' ? 'name the shared principle one level up' : 'a genuinely new possibility neither thought holds alone'}).
Wildness ${o.wild ?? 40}/100. Return ONLY JSON {"label": string <= 70 chars (a concrete thought, not a question), "detail": string <= 200 chars, "plane": "facts"|"concepts"|"principles"|"wild", "grounding": 0-1, "challenge": one-sentence fact-check}.`;
  try { const text = await window.claude.complete(prompt); const x = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); return { label: short(String(x.label || ''), 90), detail: short(String(x.detail || ''), 260), plane: PLANE_OF[x.plane] ? x.plane : null, g: clamp(+x.grounding || 0.4, 0, 1), challenge: x.challenge ? String(x.challenge) : '' }; } catch (e) { return null; }
}
export async function fuse(g, aId, bId, o = {}) {
  const a = g.byId.get(aId), b = g.byId.get(bId); if (!a || !b || aId === bId) return null;
  const outcome = o.outcome || fusionOutcome(g, a, b);
  g.brain = g.brain || brainState(g); g.brain.fusions = (g.brain.fusions || 0) + 1;
  trace(g, 'fuse', `FUSE · "${short(a.label, 26)}" + "${short(b.label, 26)}" → ${outcome}`);
  if (outcome === 'merge') { const keep = a.g >= b.g ? a : b, drop = keep === a ? b : a; mergeNodes(g, keep.id, drop.id); keep.tags = [...new Set([...(keep.tags || []), 'fused'])]; log(g, 'fuse', { outcome, kept: keep.id }); emit(g, 'fuse', { outcome, node: keep, parents: [a, b] }); return { outcome, node: keep, parents: [a, b] }; }
  let spec = o.live ? await liveFuse(g, a, b, outcome, o) : null;
  const plane = spec && spec.plane ? spec.plane : outcome === 'lift' ? (PLANE_RANK[a.plane] >= 2 ? 'principles' : PLANE_RANK[a.plane] === 1 ? 'principles' : 'concepts') : outcome === 'tension' ? 'principles' : (PLANE_RANK[a.plane] >= PLANE_RANK[b.plane] ? a.plane : b.plane);
  const gr = spec ? spec.g : +(Math.min(a.g, b.g) * (outcome === 'lift' ? 0.95 : outcome === 'tension' ? 0.9 : 0.8)).toFixed(2);
  if (!spec) {
    const tmpls = [...FUSIONS[outcome]].sort(() => g.rng() - 0.5); let label = null;
    for (const t of tmpls) { const c = t(core(a.label, 34), core(b.label, 34)); if (!g.nodes.some(n => n.label === c)) { label = c; break; } }
    if (!label) return null;
    spec = { label, detail: outcome === 'tension' ? `"${a.label}" and "${b.label}" pull in different directions; this thought holds the trade-off so it can be decided rather than ignored.` : outcome === 'lift' ? `Both "${a.label}" and "${b.label}" are instances of one pattern; this names it one level up.` : `An emergent possibility: "${a.label}" (${PLANE_OF[a.plane].label}) reacting with "${b.label}" (${PLANE_OF[b.plane].label}) produces something neither holds alone.`, challenge: `Challenge: a fusion is only as sound as its weaker parent (${Math.round(Math.min(a.g, b.g) * 100)}%). ${adaptQuestion(moduleById(20), a.label)}` };
  }
  const parent = a.g >= b.g ? a : b;
  const n = addNode(g, { label: spec.label, detail: spec.detail, plane, g: gr, via: (o.live && spec.plane != null ? 'Claude · fusion' : o.auto ? 'Emergent · fusion' : 'Fusion · ' + outcome), module: outcome === 'lift' ? 13 : outcome === 'tension' ? 7 : 34, parent: parent.id, evidence: [], challenge: spec.challenge }); // no inherited evidence: an emergent thought is supported through its parents, never sourced by them
  n.fusedFrom = [a.id, b.id]; n.outcome = outcome; n.tags = ['emergent'];
  addEdge(g, a.id, n.id, n.module, 'fusion'); addEdge(g, b.id, n.id, n.module, 'fusion');
  addHyper(g, [a.id, b.id, n.id], { kind: 'fusion', label: `${outcome}: ${short(n.label, 40)}`, relation: outcome === 'tension' ? 'in tension, resolved by' : 'fused into', weight: 0.8, quiet: true });
  for (const p of [a, b]) { p.tags = [...new Set([...(p.tags || []), 'fused'])]; p.fusions = (p.fusions || 0) + 1; activate(g, p.id, 0.6); } // update: parents remember the reaction
  if (outcome === 'tension') { addEdge(g, a.id, b.id, 7, 'challenge'); }
  activate(g, n.id, 1);
  trace(g, 'fuse', `EMERGE · "${short(n.label, 54)}" · ${PLANE_OF[plane].label} · ${Math.round(gr * 100)}%`);
  log(g, 'fuse', { outcome, added: [n.id], parents: [a.id, b.id] }); emit(g, 'fuse', { outcome, node: n, parents: [a, b] });
  return { outcome, node: n, parents: [a, b] };
}
// Emergence on its own: the two most co-active unrelated thoughts fuse when their activity coincides strongly enough.
export async function emergentFusion(g, o = {}) {
  const hot = g.nodes.filter(n => !n.root && !n.members && !n.dormant && (n.act || 0) > 0.35).sort((x, y) => y.act - x.act).slice(0, 8);
  if (hot.length < 2) return null;
  const idx = new Set(g.edges.map(e => e.a + '|' + e.b)), M = metrics(g).by;
  for (let i = 0; i < hot.length; i++) for (let j = i + 1; j < hot.length; j++) {
    const a = hot[i], b = hot[j];
    if (a.parent === b.id || b.parent === a.id || (a.fusedFrom || []).includes(b.id) || (b.fusedFrom || []).includes(a.id)) continue;
    if (g.nodes.some(n => n.fusedFrom && n.fusedFrom.includes(a.id) && n.fusedFrom.includes(b.id))) continue;
    const linked = idx.has(a.id + '|' + b.id) || idx.has(b.id + '|' + a.id), sameCommunity = M.get(a.id) && M.get(b.id) && M.get(a.id).community === M.get(b.id).community;
    if (linked && sameCommunity) continue; // emergence wants distance
    if (a.act * b.act < 0.14) continue;
    return fuse(g, a.id, b.id, { ...o, auto: true });
  }
  return null;
}

// ── Rules engine: graph-intelligent suggestions the user can apply ───────
export function mergeNodes(g, keepId, dropId) {
  const keep = g.byId.get(keepId), drop = g.byId.get(dropId); if (!keep || !drop || keepId === dropId) return null;
  for (const e of g.edges) { if (e.a === dropId) e.a = keepId; if (e.b === dropId) e.b = keepId; }
  { const ks = new Set(); g.edges = g.edges.filter(e => { if (e.a === e.b) return false; const k = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a; if (ks.has(k)) return false; ks.add(k); return true; }); }
  keep.evidence = [...keep.evidence, ...drop.evidence.filter(x => !keep.evidence.some(y => y.src === x.src))];
  keep.g = Math.max(keep.g, drop.g); if (drop.detail && !keep.detail.includes(drop.detail) && !(keep.detail.match(/[^.!?]+[.!?]*/g) || []).some(x => (drop.detail.match(/[^.!?]+[.!?]*/g) || []).some(y => nearDup(x, y)))) keep.detail = short(tidy(keep.detail + ' ' + drop.detail), 300);
  for (const m of g.nodes) if (m.parent === dropId) m.parent = keepId;
  if (keep.parent === dropId) keep.parent = drop.parent === keepId ? null : drop.parent; // never let a thought become its own ancestor
  if (g.hyper) { for (const h of g.hyper) h.nodes = [...new Set(h.nodes.map(id => id === dropId ? keepId : id))]; g.hyper = g.hyper.filter(h => h.nodes.length >= 2); } // hyperedges follow the merge too
  g.nodes = g.nodes.filter(n => n.id !== dropId); g.byId.delete(dropId);
  for (const n of g.nodes) n.deg = 0; for (const e of g.edges) { g.byId.get(e.a).deg++; g.byId.get(e.b).deg++; }
  g._metrics = g._adj = null;
  trace(g, 'graph', `MERGE · "${short(drop.label, 30)}" folded into "${short(keep.label, 30)}"`);
  log(g, 'merge', { kept: keepId, dropped: dropId }); emit(g, 'merge', { keep, drop });
  return keep;
}
export function suggestions(g, limit = 8) {
  const out = [], M = metrics(g), adj = adjacency(g);
  for (const n of g.nodes) {
    if (n.plane !== 'wild' || n.status) continue;
    const facts = (adj.get(n.id) || []).map(i => g.byId.get(i)).filter(m => m.plane === 'facts' && m.g >= 0.7);
    if (facts.length >= 2) out.push({ id: 'promote:' + n.id, kind: 'promote', nodeId: n.id, label: `Promote "${short(n.label, 34)}" to Principles`, why: `${facts.length} grounded facts touch it`, apply: () => { n.plane = 'principles'; n.g = clamp(n.g + 0.2, 0, 1); n.via += ' · promoted'; g._metrics = g._adj = null; trace(g, 'graph', `RULE · promoted "${short(n.label, 34)}" to Principles`); } });
  }
  for (const [ai, bi, s] of similarPairs(g, 0.5, n => !n.root, g.nodes.length > BIG ? Math.max(60, Math.round(g.nodes.length * 0.04)) : 0)) {
    const a = g.byId.get(ai), b = g.byId.get(bi); if (!a || !b) continue;
    if (s > 0.5) out.push({ id: `merge:${a.id}:${b.id}`, kind: 'merge', score: s, nodeId: a.id, label: `Merge "${short(b.label, 28)}" into "${short(a.label, 28)}"`, why: `near-duplicates (${Math.round(s * 100)}% alike)`, apply: () => mergeNodes(g, a.id, b.id) });
  }
  for (const n of g.nodes) {
    if (n.plane === 'facts' || n.evidence.length || n.root) continue;
    const nb = (adj.get(n.id) || []).map(i => g.byId.get(i));
    if (nb.length >= 2 && !nb.some(m => m.plane === 'facts')) out.push({ id: 'ground:' + n.id, kind: 'ground', nodeId: n.id, moduleId: 20, label: `Ground "${short(n.label, 34)}"`, why: `${nb.length} links, no fact among them` });
  }
  if (M.communities > 1) {
    const T = topics(g);
    if (T.length >= 2 && !g.edges.some(e => (e.a === T[0].hub && e.b === T[1].hub) || (e.a === T[1].hub && e.b === T[0].hub))) out.push({ id: `bridge:${T[0].hub}:${T[1].hub}`, kind: 'bridge', nodeId: T[0].hub, label: `Bridge "${T[0].label}" ↔ "${T[1].label}"`, why: 'two communities with no direct link', apply: () => { addEdge(g, T[0].hub, T[1].hub, 11, 'bridge'); trace(g, 'graph', `RULE · bridged communities "${T[0].label}" and "${T[1].label}"`); } });
  }
  for (const n of g.nodes) if (n.plane === 'facts' && n.evidence.length && !n.status && n.deg >= 3) out.push({ id: 'verify:' + n.id, kind: 'verify', nodeId: n.id, label: `Verify "${short(n.label, 34)}"`, why: `${n.deg} thoughts depend on it`, apply: () => verify(g, n.id, 'verified', 'rule: load-bearing fact') });
  for (const v of venues(g, 2)) out.push({ id: `venue:${v.a}:${v.b}`, kind: 'venue', nodeId: v.a, label: `Open venue · ${short(v.question, 44)}`, why: `${v.licence} · possibility ${Math.round(v.possibility * 100)}% · novelty ${Math.round(v.novelty * 100)}%`, apply: () => openVenue(g, v) });
  for (const n of (g.nodes.length > BIG ? g.nodes.slice(-300) : g.nodes)) { const dd = !n.root && !n.attacks && n.deg >= 2 ? derive(g, n.id) : null; if (dd && (dd.open.length || dd.status === 'supported, not closed')) { out.push({ id: 'attack:' + n.id, kind: 'attack', nodeId: n.id, label: `Attack "${short(n.label, 32)}"`, why: `${dd.status} · confidence ${Math.round(dd.confidence * 100)}%`, apply: () => attack(g, n.id) }); break; } }
  for (const t of tensions(g).slice(0, 3)) {
    if (t.why === 'explicit objection') continue;
    const a = g.byId.get(t.a), b = g.byId.get(t.b); if (nodeSim(a, b) > 0.6) continue;
    out.push({ id: `tension:${t.a}:${t.b}`, kind: 'tension', nodeId: t.a, label: `Resolve "${short(a.label, 24)}" vs "${short(b.label, 24)}"`, why: t.why, moduleId: 35 });
  }
  const seenNode = new Set(), seenLabel = new Set(), dedup = [];
  for (const s of out) { const k = s.kind + ':' + s.nodeId; if (seenNode.has(k) || seenLabel.has(s.label)) continue; seenNode.add(k); seenLabel.add(s.label); dedup.push(s); }
  const order = s => s.kind === 'merge' && s.score >= 0.8 ? -1 : { tension: 0, venue: 0.5, promote: 1, attack: 1.5, verify: 2, bridge: 3, ground: 4, merge: 5 }[s.kind];
  return dedup.sort((a, b) => order(a) - order(b)).slice(0, limit);
}
// Collapse exact duplicates (labels identical) left behind by older saves.
export function dedupe(g) {
  const seen = new Map(); let merged = 0;
  for (const n of [...g.nodes]) { if (n.root || n.members) continue; const k = n.label.trim().toLowerCase() + '||' + (isGenerated(n) ? '*' : (n.parent || '')); if (seen.has(k)) { mergeNodes(g, seen.get(k), n.id); merged++; } else seen.set(k, n.id); }
  if (merged) trace(g, 'graph', `DEDUPE · ${merged} identical thought${merged === 1 ? '' : 's'} folded into their originals`);
  return merged;
}
export async function applySuggestion(g, s, o = {}) {
  if (s.apply) { s.apply(); log(g, 'rule', { kind: s.kind }); emit(g, 'rule', s); return []; }
  if (s.kind === 'ground' || s.kind === 'tension') return expand(g, s.nodeId, s.moduleId, o);
  return [];
}

// ── Merge a saved graph into this one ────────────────────────────────────
export function mergeGraph(g, d) {
  const idMap = new Map(), added = [];
  for (const s of d.nodes) {
    const near = similar(g, `${s.label} ${s.detail}`, 1)[0];
    if (near && near.score > 0.6) { idMap.set(s.id, near.node.id); continue; }
    const n = addNode(g, { ...s, id: undefined, parent: idMap.get(s.parent) || null, via: `${s.via || 'Auto'} · merged from "${short(d.seed, 22)}"` });
    if (s.t) n.t = new Date(s.t); n.root = false; idMap.set(s.id, n.id); added.push(n);
  }
  for (const e of d.edges) { const a = idMap.get(e.a), b = idMap.get(e.b); if (a && b) addEdge(g, a, b, e.module, e.kind); }
  const oldRoot = d.nodes.find(x => x.root);
  if (oldRoot && idMap.get(oldRoot.id) && g.nodes[0] && idMap.get(oldRoot.id) !== g.nodes[0].id) addEdge(g, g.nodes[0].id, idMap.get(oldRoot.id), 11, 'bridge');
  autoLink(g, { threshold: 0.25, cap: 2, only: added.map(n => n.id) });
  trace(g, 'graph', `MERGE · "${short(d.seed, 30)}" · ${added.length} new thought${added.length === 1 ? '' : 's'}, ${d.nodes.length - added.length} matched existing ones`);
  log(g, 'merge-graph', { added: added.map(n => n.id) }); emit(g, 'merge-graph', { added });
  return added;
}

// ── Session statistics ───────────────────────────────────────────────────
export function stats(g) {
  const eff = effectiveGrounding(g), byPlane = Object.fromEntries(PLANES.map(p => [p.id, g.nodes.filter(n => n.plane === p.id).length]));
  const sources = new Set(g.nodes.map(n => (n.via || '').split(' · ')[0]).filter(v => v && !['Typed', 'Auto', 'Projection', 'Challenge', 'Claude', 'Sleep', 'Evolve', 'Fold', 'Fusion', 'Emergent', 'Venue'].includes(v)));
  return { nodes: g.nodes.length, edges: g.edges.length, byPlane, avgGrounding: g.nodes.length ? [...eff.values()].reduce((a, b) => a + b, 0) / g.nodes.length : 0, verified: g.nodes.filter(n => n.status === 'verified').length, refuted: g.nodes.filter(n => n.status === 'refuted').length, evidence: g.nodes.filter(n => n.evidence.length).length, sources: [...sources], communities: metrics(g).communities, tensions: tensions(g).length, crossLinks: g.edges.filter(e => e.kind === 'bridge' || e.kind === 'adjacent' || e.kind === 'synapse' || e.kind === 'dream').length, dormant: g.nodes.filter(n => n.dormant).length };
}

// ── Node & edge model: types, tags, editing, weights, manual links ────────
export function nodeType(n) {
  if (n.members) return 'group';
  if (n.sub && n.subStats) return 'graph';
  if (n.venue || /\?\s*$/.test(n.label) || /^(what|how|why|when|where|who|which)\b/i.test(n.label)) return 'question';
  if (n.plane === 'facts' && n.evidence.length) return 'evidence';
  if ([3, 23, 24].includes(n.module)) return 'metric';
  if ([38, 39, 2].includes(n.module) || /^(build|make|pay|dim|ban|teach|measure|start|stop|design|move)\b/i.test(n.label)) return 'action';
  return n.plane === 'wild' ? 'idea' : 'claim';
}
export function updateNode(g, id, patch) {
  const n = g.byId.get(id); if (!n) return null;
  const before = { label: n.label, detail: n.detail, tags: n.tags, plane: n.plane };
  if (patch.label != null) n.label = short(tidy(patch.label) || n.label, 120);
  if (patch.detail != null) n.detail = short(tidy(patch.detail), 400);
  if (patch.tags != null) n.tags = String(patch.tags).split(/[,;]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  if (patch.plane && PLANE_OF[patch.plane]) n.plane = patch.plane;
  if (patch.g != null) n.g = clamp(+patch.g, 0, 1);
  g._metrics = g._adj = null;
  trace(g, 'graph', `EDIT · "${short(before.label, 30)}"${patch.label && patch.label !== before.label ? ` → "${short(n.label, 30)}"` : ''}${patch.plane && patch.plane !== before.plane ? ` · moved to ${PLANE_OF[n.plane].label}` : ''}`);
  log(g, 'edit', { id, before }); emit(g, 'edit', n);
  return n;
}
export const RELATIONS = ['supports', 'contradicts', 'causes', 'measures', 'refines', 'alternative to', 'resembles', 'bridges', 'assumes', 'constrains', 'evidences', 'expands', 'depends on'];
export function edgeWeight(e, g) {
  if (e.weight != null) return e.weight;
  if (e.kind === 'adjacent') return 0.35;
  if (e.kind === 'bridge') return 0.4;
  if (e.kind === 'challenge') return 0.6;
  if (e.kind === 'learned') return 0.8;
  if (e.kind === 'fusion') return 0.75;
  if (e.kind === 'synapse') return 0.25;
  if (e.kind === 'dream') return 0.3;
  if (e.kind === 'projection') return 0.5;
  const b = g && g.byId.get(e.b); return b ? clamp(0.5 + b.g * 0.4, 0.3, 0.95) : 0.7;
}
export function edgeRelation(e) { return e.relation || relation(e); }
export function updateEdge(g, id, patch) {
  const e = g.edges.find(x => x.id === id); if (!e) return null;
  if (patch.relation) e.relation = patch.relation;
  if (patch.weight != null) e.weight = clamp(+patch.weight, 0, 1);
  if (patch.note != null) e.note = short(String(patch.note), 200);
  if (patch.flip) { const a = e.a; e.a = e.b; e.b = a; }
  trace(g, 'graph', `EDGE · "${short(g.byId.get(e.a).label, 24)}" ${edgeRelation(e)} "${short(g.byId.get(e.b).label, 24)}"${patch.weight != null ? ` · weight ${Math.round(e.weight * 100)}%` : ''}`);
  log(g, 'edge', { id }); emit(g, 'edge', e);
  return e;
}
export function removeEdge(g, id) {
  const i = g.edges.findIndex(x => x.id === id); if (i < 0) return false;
  const [e] = g.edges.splice(i, 1); g.byId.get(e.a).deg--; g.byId.get(e.b).deg--; g._metrics = g._adj = null;
  trace(g, 'graph', `EDGE · unlinked "${short(g.byId.get(e.a).label, 24)}" and "${short(g.byId.get(e.b).label, 24)}"`);
  log(g, 'unlink', { edge: e }); return true;
}
export function link(g, a, b, rel = 'supports') {
  if (a === b || !g.byId.has(a) || !g.byId.has(b)) return null;
  const existing = g.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (existing) { existing.relation = rel; return existing; }
  addEdge(g, a, b, null, 'manual'); const e = g.edges[g.edges.length - 1]; e.relation = rel; e.weight = 0.7;
  trace(g, 'graph', `LINK · "${short(g.byId.get(a).label, 24)}" ${rel} "${short(g.byId.get(b).label, 24)}"`);
  log(g, 'link', { edge: e.id }); emit(g, 'edge', e);
  return e;
}
export function edgeStructure(g, e) {
  const a = g.byId.get(e.a), b = g.byId.get(e.b);
  return { from: a.label, to: b.label, relation: edgeRelation(e), kind: e.kind, module: e.module != null ? moduleById(e.module).type : null, weight: edgeWeight(e, g), structure: e.structure || null, note: e.note || '' };
}

// ── Graph within graph: fold communities into supernodes, unfold them ────
export function fold(g, ids, label) {
  const S = new Set(ids.filter(id => g.byId.has(id) && !g.byId.get(id).root)); if (S.size < 2) return null;
  const members = [...S].map(id => g.byId.get(id));
  const planes = {}; for (const m of members) planes[m.plane] = (planes[m.plane] || 0) + 1;
  const plane = Object.entries(planes).sort((a, b) => b[1] - a[1])[0][0];
  const outsideParent = members.map(m => m.parent).find(p => p && !S.has(p)) || (g.nodes[0] && g.nodes[0].id);
  const internal = g.edges.filter(e => S.has(e.a) && S.has(e.b)), external = g.edges.filter(e => S.has(e.a) !== S.has(e.b));
  const sup = addNode(g, { label: label || `${members.length} thoughts`, detail: `A folded group: ${members.slice(0, 3).map(m => short(m.label, 30)).join('; ')}${members.length > 3 ? ` and ${members.length - 3} more` : ''}.`, plane, g: members.reduce((s, m) => s + m.g, 0) / members.length, via: 'Fold', module: 9, parent: outsideParent });
  sup.members = { nodes: members.map(m => ({ ...m, t: m.t.toISOString() })), edges: internal.map(e => ({ ...e })), external: external.map(e => ({ ...e })), parents: g.nodes.filter(n => !S.has(n.id) && S.has(n.parent)).map(n => [n.id, n.parent]) };
  for (const n of g.nodes) if (!S.has(n.id) && S.has(n.parent)) n.parent = sup.id;
  const rewired = new Set();
  for (const e of external) { const other = S.has(e.a) ? e.b : e.a; if (other === sup.id || rewired.has(other)) continue; rewired.add(other); }
  removeNodes(g, [...S]);
  for (const other of rewired) addEdge(g, sup.id, other, 9, 'fold');
  if (outsideParent && g.byId.has(outsideParent)) addEdge(g, outsideParent, sup.id, 9, 'expands');
  trace(g, 'graph', `FOLD · ${members.length} thoughts → "${short(sup.label, 34)}" · ${internal.length} inner edges kept`);
  log(g, 'fold', { added: [sup.id] }); emit(g, 'fold', sup);
  return sup;
}
export function unfold(g, id) {
  const sup = g.byId.get(id); if (!sup || !sup.members) return [];
  const M = sup.members; removeNodes(g, [id]);
  const back = [];
  for (const s of M.nodes) { const n = { ...s, t: new Date(s.t), born: performance.now(), vx: 0, vy: 0, deg: 0 }; g.nodes.push(n); g.byId.set(n.id, n); g.revealed.add(n.id); back.push(n); }
  for (const e of M.edges) restoreEdge(g, e);
  for (const e of M.external) restoreEdge(g, e);
  for (const [nid, p] of M.parents) { const n = g.byId.get(nid); if (n) n.parent = p; }
  g._metrics = g._adj = null;
  trace(g, 'graph', `UNFOLD · "${short(sup.label, 34)}" → ${back.length} thoughts restored`);
  log(g, 'unfold', { added: back.map(n => n.id) }); emit(g, 'unfold', back);
  return back;
}
// A thought can hold its own inner graph. enterNode builds or restores it; leaveNode writes it back.
export function enterNode(outer, id, o = {}) {
  const n = outer.byId.get(id); if (!n) return null;
  let inner;
  if (n.sub) inner = restore(n.sub, o);
  else {
    inner = createGraph(n.label, o);
    inner.bank = genericBank(n.label); inner.bank[0].detail = n.detail || inner.bank[0].detail; inner.bank[0].plane = n.plane; inner.bank[0].g = n.g;
    seedGraph(inner, 5);
    inner.nodes[0].evidence = n.evidence.slice(); inner.nodes[0].via = n.via;
    trace(inner, 'graph', `GRAPH · inner graph of "${short(n.label, 40)}" opened from "${short(outer.seed, 30)}"`);
  }
  inner.outer = { seed: outer.seed, id, depth: (outer.outer ? outer.outer.depth : 0) + 1 };
  return inner;
}
export function leaveNode(outer, id, inner) {
  const n = outer.byId.get(id); if (!n) return null;
  n.sub = serialize(inner); const eff = effectiveGrounding(inner);
  n.subStats = { nodes: inner.nodes.length, edges: inner.edges.length, grounding: inner.nodes.length ? [...eff.values()].reduce((a, b) => a + b, 0) / inner.nodes.length : 0, verified: inner.nodes.filter(m => m.status === 'verified').length };
  const facts = inner.nodes.filter(m => m.plane === 'facts' && m.evidence.length && m.id !== inner.nodes[0].id);
  if (facts.length && n.plane !== 'facts') { n.g = clamp(Math.max(n.g, Math.min(0.85, n.g + 0.05 * facts.length)), 0, 1); }
  trace(outer, 'graph', `GRAPH · inner graph of "${short(n.label, 34)}" saved · ${inner.nodes.length} thoughts, ${Math.round(n.subStats.grounding * 100)}% grounded`);
  log(outer, 'inner', { id }); emit(outer, 'inner', n);
  return n;
}

// ── Paper search: an offline index of real references, plus live suggestions flagged unverified ──
const PAPERS = [
  { id: 'p1', authors: 'WHO Regional Office for Europe', year: 2009, title: 'Night Noise Guidelines for Europe', venue: 'WHO Europe', doi: '', tags: 'noise night sleep health guideline lnight 40 db' },
  { id: 'p2', authors: 'Basner M, Babisch W, Davis A, et al.', year: 2014, title: 'Auditory and non-auditory effects of noise on health', venue: 'The Lancet', doi: '10.1016/S0140-6736(13)61613-X', tags: 'noise health sleep cardiovascular annoyance' },
  { id: 'p3', authors: 'Chang A-M, Aeschbach D, Duffy JF, Czeisler CA', year: 2015, title: 'Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness', venue: 'PNAS', doi: '10.1073/pnas.1418490112', tags: 'light blue melatonin circadian screens evening' },
  { id: 'p4', authors: 'Falchi F, Cinzano P, Duriscoe D, et al.', year: 2016, title: 'The new world atlas of artificial night sky brightness', venue: 'Science Advances', doi: '10.1126/sciadv.1600377', tags: 'light pollution night sky brightness streetlight city dark' },
  { id: 'p5', authors: 'Hirshkowitz M, Whiton K, Albert SM, et al.', year: 2015, title: "National Sleep Foundation's sleep time duration recommendations", venue: 'Sleep Health', doi: '10.1016/j.sleh.2014.12.010', tags: 'sleep duration hours adults recommendation seven' },
  { id: 'p6', authors: 'Okamoto-Mizuno K, Mizuno K', year: 2012, title: 'Effects of thermal environment on sleep and circadian rhythm', venue: 'Journal of Physiological Anthropology', doi: '10.1186/1880-6805-31-14', tags: 'heat temperature bedroom thermal sleep circadian' },
  { id: 'p7', authors: 'Obradovich N, Migliorini R, Mednick SC, Fowler JH', year: 2017, title: 'Nighttime temperature and human sleep loss in a changing climate', venue: 'Science Advances', doi: '10.1126/sciadv.1601555', tags: 'heat temperature night climate sleep loss city' },
  { id: 'p8', authors: 'Wheaton AG, Chapman DP, Croft JB', year: 2016, title: 'School start times, sleep, behavioral, health, and academic outcomes: a review of the literature', venue: 'Journal of School Health', doi: '10.1111/josh.12388', tags: 'school start time teen adolescent sleep' },
  { id: 'p9', authors: 'Kecklund G, Axelsson J', year: 2016, title: 'Health consequences of shift work and insufficient sleep', venue: 'BMJ', doi: '10.1136/bmj.i5210', tags: 'shift work night worker health insufficient sleep daytime' },
  { id: 'p10', authors: 'Münzel T, Schmidt FP, Steven S, et al.', year: 2018, title: 'Environmental noise and the cardiovascular system', venue: 'Journal of the American College of Cardiology', doi: '10.1016/j.jacc.2017.12.015', tags: 'noise traffic cardiovascular health corridor road' },
  { id: 'p11', authors: 'Cho Y, Ryu S-H, Lee BR, et al.', year: 2015, title: 'Effects of artificial light at night on human health: a literature review of observational and experimental studies', venue: 'Chronobiology International', doi: '10.3109/07420528.2015.1073158', tags: 'artificial light night health melatonin led streetlight' },
  { id: 'p12', authors: 'Halperin D', year: 2014, title: 'Environmental noise and sleep disturbances: a threat to health?', venue: 'Sleep Science', doi: '10.1016/j.slsci.2014.11.003', tags: 'noise sleep disturbance awakening night' },
  { id: 'p13', authors: 'Grandner MA', year: 2017, title: 'Sleep, health, and society', venue: 'Sleep Medicine Clinics', doi: '10.1016/j.jsmc.2016.10.012', tags: 'sleep society public health policy city population' },
  { id: 'p14', authors: 'Czeisler CA', year: 2013, title: 'Perspective: casting light on sleep deficiency', venue: 'Nature', doi: '10.1038/497S13a', tags: 'light sleep deficiency circadian society electric' },
];
export function searchPapers(g, query, k = 5) {
  const q = tokenize(query);
  return PAPERS.map(p => { const T = new Set(tokenize(p.title + ' ' + p.tags)); let hits = 0; for (const t of q) if (T.has(t)) hits++; return { paper: p, score: q.length ? hits / Math.sqrt(q.length * 2) : 0 }; })
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
export async function livePapers(g, node) {
  if (!hasClaude()) return [];
  try {
    const text = await window.claude.complete(`Suggest up to 3 real, well-known peer-reviewed papers or official reports that bear on this thought. Seed: "${g.seed}". Thought: "${node.label}" — ${node.detail}\nReturn ONLY a JSON array of {"authors": string, "year": number, "title": string, "venue": string, "doi": string} and leave doi empty when unsure. Never invent titles.`);
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    return arr.slice(0, 3).map((p, i) => ({ paper: { id: 'live' + i, authors: String(p.authors || ''), year: +p.year || '', title: String(p.title || ''), venue: String(p.venue || ''), doi: String(p.doi || ''), unverified: true }, score: 0.5 }));
  } catch (e) { return []; }
}
export function attachPaper(g, nodeId, paper) {
  const n = g.byId.get(nodeId); if (!n || !paper) return null;
  const src = `${paper.authors} (${paper.year}) ${paper.title} · ${paper.venue}${paper.unverified ? ' · unverified' : ''}`;
  if (n.evidence.some(e => e.src === src)) return n;
  n.evidence.push({ src, year: String(paper.year), doi: paper.doi || '' });
  n.g = paper.unverified ? n.g : clamp(n.plane === 'facts' ? Math.max(n.g, 0.8) : n.g + 0.12, 0, 1);
  if (n.challenge && !n.injectedChallenge && n.plane !== 'wild') n.challenge = '';
  g._metrics = g._adj = null;
  trace(g, 'papers', `PAPERS · ${paper.authors.split(',')[0]} (${paper.year}) → "${short(n.label, 32)}"${paper.doi ? ' · doi:' + paper.doi : ''}`);
  log(g, 'paper', { id: nodeId, src }); emit(g, 'paper', { node: n, paper });
  return n;
}
// Graph-intelligent grounding pass: give the most load-bearing unsupported thought a paper.
export function groundingPass(g) {
  const M = metrics(g);
  const cand = g.nodes.filter(n => !n.root && !n.evidence.length && n.plane !== 'wild' && !n.status).sort((a, b) => (M.by.get(b.id).pagerank + b.deg * 0.1) - (M.by.get(a.id).pagerank + a.deg * 0.1))[0];
  if (!cand) return null;
  const hit = searchPapers(g, nodeText(cand), 1)[0];
  if (!hit || hit.score < 0.3) { trace(g, 'papers', `PAPERS · nothing in the index for "${short(cand.label, 30)}"`); return null; }
  return attachPaper(g, cand.id, hit.paper);
}

// ── Brain: activation, plasticity, consolidation, evolution ──────────────
export const BRAIN = { decay: 0.96, spread: 0.06, gate: 0.08, leak: 0.002, hebb: 0.05, hebbGate: 0.16, forget: 0.0005, pruneBelow: 0.06, dormantTicks: 900, maxNodes: 120, arousalCap: 0.2 };
const FLOOR = { expands: 0.35, learned: 0.5, projection: 0.3, challenge: 0.3, fold: 0.3, manual: 0.3, venue: 0.3, bridge: 0.15, dream: 0.1, adjacent: 0.05, synapse: 0 };
const pct = v => Math.round((v || 0) * 100) + '%';
export function brainState(g) {
  g.brain = g.brain || { tick: 0, synapses: 0, pruned: 0, dreams: 0, sleeps: 0, gen: 0, archived: 0, recalled: 0, arousal: 0, plasticity: 0, lastSleep: '' };
  g.archive = g.archive || [];
  return g.brain;
}
export function activate(g, id, amount = 1) {
  const n = g.byId.get(id); if (!n) return;
  const B = brainState(g);
  n.act = clamp((n.act || 0) + amount, 0, 1); n.heat = n.act; n.lastTick = B.tick; n.recalls = (n.recalls || 0) + (amount >= 1 ? 1 : 0);
  if (n.dormant && amount >= 0.5) { n.dormant = false; trace(g, 'brain', `WAKE · "${short(n.label, 36)}" active again`); }
}
function edgeIndex(g) { const idx = new Map(); for (const e of g.edges) { idx.set(e.a + '|' + e.b, e); idx.set(e.b + '|' + e.a, e); } return idx; }
export function brainTick(g, o = {}) {
  const B = brainState(g); B.tick++;
  const N = g.nodes; if (!N.length) return { arousal: 0, changed: false };
  const inflow = new Map();
  for (const e of g.edges) {
    const a = g.byId.get(e.a), b = g.byId.get(e.b); if (!a || !b) continue;
    const w = edgeWeight(e, g);
    if (b.act > 0.1) inflow.set(a.id, (inflow.get(a.id) || 0) + b.act * w);
    if (a.act > 0.1) inflow.set(b.id, (inflow.get(b.id) || 0) + a.act * w);
  }
  let sum = 0;
  for (const n of N) {
    const a = n.act || 0, f = n.fatigue || 0, inc = Math.max(0, (inflow.get(n.id) || 0) / Math.max(1, Math.sqrt(n.deg || 1)) - BRAIN.gate);
    n.act = clamp(a * BRAIN.decay * (1 - 0.3 * f) + BRAIN.spread * inc * (1 - a) * (1 - f) - BRAIN.leak, 0, 1);
    n.fatigue = clamp(f + Math.max(0, a - 0.05) * 0.015 - (a < 0.05 ? 0.004 : 0), 0, 1);
    sum += n.act;
  }
  const mean = sum / N.length;
  if (mean > BRAIN.arousalCap) { const inhibit = mean - BRAIN.arousalCap; for (const n of N) n.act = Math.max(0, n.act - inhibit); } // subtractive inhibition: weak activity drops out first
  B.arousal = Math.min(mean, BRAIN.arousalCap) / BRAIN.arousalCap;
  // Hebbian: co-active edges strengthen, idle ones drift toward their floor.
  let dw = 0;
  for (const e of g.edges) {
    const a = g.byId.get(e.a), b = g.byId.get(e.b); if (!a || !b) continue;
    const w = edgeWeight(e, g), co = (a.act || 0) * (b.act || 0), floor = FLOOR[e.kind] ?? 0.2;
    let nw = w;
    if (co > BRAIN.hebbGate) nw = w + BRAIN.hebb * co * (1 - w); else if (w > floor) nw = w - BRAIN.forget * (w - floor);
    if (nw !== w) { e.weight = +nw.toFixed(4); dw += Math.abs(nw - w); }
  }
  B.plasticity = B.plasticity * 0.9 + Math.min(1, dw * 8) * 0.1;
  let changed = false;
  if (B.tick % 15 === 0) { // synaptogenesis: fire together, wire together
    const hot = N.filter(n => n.act > 0.45 && !n.members).sort((a, b) => b.act - a.act).slice(0, 12), idx = edgeIndex(g);
    outer: for (let i = 0; i < hot.length; i++) for (let j = i + 1; j < hot.length; j++) {
      const a = hot[i], b = hot[j];
      if (idx.has(a.id + '|' + b.id) || a.parent === b.id || b.parent === a.id) continue;
      if (nodeSim(a, b) < 0.1) continue;
      addEdge(g, a.id, b.id, null, 'synapse'); g.edges[g.edges.length - 1].weight = 0.25; B.synapses++; changed = true;
      trace(g, 'brain', `SYNAPSE · "${short(a.label, 26)}" ⟷ "${short(b.label, 26)}" · fired together ${Math.round(a.act * b.act * 100)}%`);
      break outer;
    }
  }
  if (B.tick % 45 === 0) { const p = pruneWeak(g, BRAIN.pruneBelow); if (p) changed = true; }
  if (B.tick % 90 === 0) {
    let slept = 0;
    for (const n of N) if (isGenerated(n) && !n.root && !n.dormant && (n.act || 0) < 0.02 && n.deg <= 1 && n.g < 0.5 && !n.evidence.length && !n.status && B.tick - (n.lastTick || n.bornTick || 0) > BRAIN.dormantTicks) { n.dormant = true; slept++; }
    if (slept) { trace(g, 'brain', `DORMANT · ${slept} unused thought${slept === 1 ? '' : 's'} faded`); changed = true; }
    if (N.length > BRAIN.maxNodes) { const k = archiveDormant(g, BRAIN.maxNodes); if (k) changed = true; }
  }
  return { arousal: B.arousal, changed };
}
export function pruneWeak(g, below) {
  const drop = g.edges.filter(e => (e.kind === 'synapse' || e.kind === 'adjacent') && e.weight != null && e.weight < below);
  if (!drop.length) return 0;
  const S = new Set(drop.map(e => e.id)); g.edges = g.edges.filter(e => !S.has(e.id));
  for (const e of drop) { const a = g.byId.get(e.a), b = g.byId.get(e.b); if (a) a.deg--; if (b) b.deg--; }
  g._metrics = g._adj = null; brainState(g).pruned += drop.length;
  trace(g, 'brain', `PRUNE · ${drop.length} weak synapse${drop.length === 1 ? '' : 's'} removed`);
  return drop.length;
}
const nodeData = n => ({ mol: n.mol || undefined, grade: n.grade || undefined, chem: n.chem ? { runs: n.chem.runs || 0, found: n.chem.found || 0, at: n.chem.at || 0, queue: (n.chem.queue || []).slice(0, 6) } : undefined, id: n.id, label: n.label, detail: n.detail, plane: n.plane, g: n.g, module: n.module, via: n.via, evidence: n.evidence, challenge: n.challenge, t: n.t.toISOString(), parent: n.parent, root: !!n.root, x: n.x, y: n.y, status: n.status, verdictNote: n.verdictNote, projectionOf: n.projectionOf, challengeOf: n.challengeOf, learned: n.learned, g0: n.g0, downgradedBy: n.downgradedBy, injectedChallenge: n.injectedChallenge, tags: n.tags, sub: n.sub, subStats: n.subStats, members: n.members, act: n.act, fatigue: n.fatigue, dormant: n.dormant, gen: n.gen, fitness: n.fitness, recalls: n.recalls, lastTick: n.lastTick, bornTick: n.bornTick, attacks: n.attacks, attackedAt: n.attackedAt, venue: n.venue, fusedFrom: n.fusedFrom, outcome: n.outcome, fusions: n.fusions , ...(n.lensOf ? { lensOf: n.lensOf, lens: n.lens, lensLabel: n.lensLabel, subject: n.subject } : {}), ...(n.mind ? { mind: n.mind } : {}), ...(n.mindMoves ? { mindMoves: n.mindMoves } : {}) });
export function archiveNode(g, id, reason = 'archived') {
  const n = g.byId.get(id); if (!n || n.root) return null;
  const B = brainState(g);
  const entry = { node: nodeData(n), parent: n.parent, reason, at: timeStr(), edges: g.edges.filter(e => e.a === id || e.b === id).map(e => ({ ...e })) };
  g.archive.unshift(entry); if (g.archive.length > 500) g.archive.pop();
  for (const m of g.nodes) if (m.parent === id) m.parent = n.parent;
  removeNodes(g, [id]); B.archived++;
  return entry;
}
export function archiveDormant(g, target) {
  // the cap counts machine-made thoughts only: a 2,000-thought import is not too big, and none of it is ever forgotten
  let count = 0; for (const n of g.nodes) if (isGenerated(n) && !n.root && !n.members) count++;
  const cand = g.nodes.filter(n => n.dormant && isGenerated(n) && !n.root && !n.members).sort((a, b) => (a.lastTick || 0) - (b.lastTick || 0));
  let k = 0;
  for (const n of cand) { if (count <= target) break; archiveNode(g, n.id, 'forgotten'); k++; count--; }
  if (k) trace(g, 'brain', `FORGET · ${k} dormant thought${k === 1 ? '' : 's'} moved to the archive (recallable)`);
  return k;
}
export function recall(g, archivedId) {
  const i = g.archive.findIndex(a => a.node.id === archivedId); if (i < 0) return null;
  const [entry] = g.archive.splice(i, 1), s = entry.node;
  const n = { ...s, t: new Date(s.t), born: performance.now(), vx: 0, vy: 0, tx: s.x, ty: s.y, deg: 0, evidence: s.evidence || [], act: 1, fatigue: 0, dormant: false, parent: g.byId.has(entry.parent) ? entry.parent : (g.nodes[0] ? g.nodes[0].id : null) };
  g.nodes.push(n); g.byId.set(n.id, n); g.revealed.add(n.id); g._metrics = g._adj = null;
  for (const e of entry.edges) if (g.byId.has(e.a) && g.byId.has(e.b)) restoreEdge(g, e);
  if (n.parent && !g.edges.some(e => (e.a === n.parent && e.b === n.id) || (e.b === n.parent && e.a === n.id))) addEdge(g, n.parent, n.id, n.module, 'expands');
  brainState(g).recalled++; n.recalls = (n.recalls || 0) + 1;
  trace(g, 'brain', `RECALL · "${short(n.label, 36)}" back from the archive`);
  log(g, 'recall', { added: [n.id] }); emit(g, 'recall', n);
  return n;
}
const DREAMS = [(a, b) => `${a}, dreamed as ${lc(b)}`, (a, b) => `${a} inside ${lc(b)}`, (a, b) => `${a} and ${lc(b)}, places traded`, (a, b) => `${a}, remembered as ${lc(b)}`];
export function dream(g, o = {}, count = 1) {
  const B = brainState(g), M = metrics(g), born = [];
  const pool = g.nodes.filter(n => !n.root && !n.members && !n.dormant).sort((a, b) => ((b.recalls || 0) + (b.act || 0)) - ((a.recalls || 0) + (a.act || 0))).slice(0, 10);
  for (let k = 0; k < count; k++) {
    let pair = null;
    outer: for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      if (M.by.get(a.id).community === M.by.get(b.id).community) continue;
      const p = shortestPath(g, a.id, b.id); if (p && p.length <= 3) continue;
      pair = [a, b]; break outer;
    }
    if (!pair) { if (pool.length >= 2) pair = [pool[0], pool[pool.length - 1]]; else break; }
    const [a, b] = pair, tmpls = [...DREAMS].sort(() => g.rng() - 0.5);
    let label = null; for (const t of tmpls) { const c = t(core(a.label, 36), core(b.label, 36)); if (!g.nodes.some(n => n.label === c)) { label = c; break; } }
    if (!label) break;
    const gr = +(Math.min(a.g, b.g) * 0.5).toFixed(2);
    const d = addNode(g, { label, detail: `A recombination made during consolidation: "${a.label}" (${PLANE_OF[a.plane].label}) crossed with "${b.label}" (${PLANE_OF[b.plane].label}) from another community.`, plane: 'wild', g: gr, via: 'Sleep · dream', module: 11, parent: a.id, evidence: [], challenge: `Challenge: dreams carry no evidence; this one is ${pct(gr)} grounded until something checks it.` });
    d.gen = B.gen; addEdge(g, a.id, d.id, 11, 'dream'); addEdge(g, d.id, b.id, 11, 'dream'); B.dreams++; born.push(d);
    addHyper(g, [a.id, d.id, b.id], { kind: 'dream', module: 11, label: 'dream', weight: 0.3, quiet: true });
    trace(g, 'sleep', `DREAM · "${short(label, 50)}"`);
    pool.splice(pool.indexOf(a), 1); if (pool.includes(b)) pool.splice(pool.indexOf(b), 1);
  }
  return born;
}
export function sleep(g, o = {}) {
  const B = brainState(g); B.sleeps++; B.lastSleep = timeStr();
  trace(g, 'sleep', `SLEEP · cycle ${B.sleeps} · arousal ${pct(B.arousal)} · ${g.nodes.length} thoughts`);
  const idx = edgeIndex(g), root = g.nodes[0];
  const top = g.nodes.filter(n => !n.root).sort((a, b) => ((b.recalls || 0) + (b.act || 0) * 2) - ((a.recalls || 0) + (a.act || 0) * 2)).slice(0, 5);
  let strengthened = 0;
  for (const n of top) { const path = root ? shortestPath(g, root.id, n.id) || [] : []; for (let i = 1; i < path.length; i++) { const e = idx.get(path[i - 1] + '|' + path[i]); if (e) { e.weight = +clamp(edgeWeight(e, g) + 0.08, 0, 1).toFixed(4); strengthened++; } } }
  if (top.length) trace(g, 'sleep', `REPLAY · ${top.length} most-recalled thoughts replayed · ${strengthened} synapses strengthened`);
  let merged = dedupe(g);
  // near-duplicates through a token index, not every pair; only machine-made thoughts merge, so imported records survive
  const pairs = similarPairs(g, 0.7, n => !n.root && !n.members).filter(([a, b, s]) => s > 0.7 && mergeable(g.byId.get(a), g.byId.get(b)));
  for (const [a, b] of pairs.slice(0, 3)) if (g.byId.has(a) && g.byId.has(b)) { mergeNodes(g, a, b); merged++; }
  if (merged) trace(g, 'sleep', `CONSOLIDATE · ${merged} overlapping thought${merged === 1 ? '' : 's'} merged`);
  const pruned = pruneWeak(g, BRAIN.pruneBelow * 2);
  const dreams = dream(g, o, (o.wild ?? 40) > 60 ? 2 : 1);
  const archived = archiveDormant(g, Math.floor(BRAIN.maxNodes * 0.85));
  for (const n of g.nodes) { n.act = (n.act || 0) * 0.2; n.fatigue = 0; }
  trace(g, 'sleep', `SLEEP · done · ${merged} merged, ${pruned} pruned, ${dreams.length} dream${dreams.length === 1 ? '' : 's'}, ${archived} archived`);
  log(g, 'sleep', { added: dreams.map(d => d.id) }); emit(g, 'sleep', { strengthened, merged, pruned, dreams, archived });
  return { strengthened, merged, pruned, dreams, archived };
}
export function fitnessOf(g, n, M, eff, nov) {
  const near = nov ? null : similar(g, n, 1)[0], novelty = 1 - (nov ? (nov.get(n.id) || 0) : near ? near.score : 0), m = M.by.get(n.id) || { pagerank: 0 };
  return clamp(eff.get(n.id) * 0.35 + m.pagerank * 0.25 + novelty * 0.2 + (n.act || 0) * 0.1 + (n.evidence.length ? 0.1 : 0) - (n.status === 'refuted' ? 0.5 : 0) - (n.dormant ? 0.2 : 0), 0, 1);
}
export async function evolve(g, o = {}) {
  const B = brainState(g); B.gen++;
  const M = metrics(g), eff = effectiveGrounding(g);
  const nov = g.nodes.length > BIG ? nearestLikeness(g) : null;
  for (const n of g.nodes) n.fitness = n.root ? 1 : fitnessOf(g, n, M, eff, nov);
  const ranked = g.nodes.filter(n => !n.root && !n.members).sort((a, b) => b.fitness - a.fitness), parents = ranked.slice(0, 4), born = [], culled = [];
  if (!parents.length) return { gen: B.gen, born, culled };
  trace(g, 'evolve', `EVOLVE · generation ${B.gen} · fittest "${short(parents[0].label, 30)}" at ${pct(parents[0].fitness)}`);
  if (parents.length >= 2) {
    const [a, b] = parents, tmpls = [...BRIDGES].sort(() => g.rng() - 0.5);
    let label = null; for (const t of tmpls) { const c = t(core(a.label, 38), core(b.label, 38)); if (!g.nodes.some(n => n.label === c)) { label = c; break; } }
    if (label) {
      const gr = +(Math.min(a.g, b.g) * 0.85).toFixed(2);
      const child = addNode(g, { label, detail: `Crossover of the two fittest thoughts in generation ${B.gen}: "${a.label}" and "${b.label}".`, plane: (o.wild ?? 40) > 50 ? 'wild' : 'concepts', g: gr, via: 'Evolve · crossover', module: 34, parent: a.id, evidence: [], challenge: `Challenge: a crossover inherits the weaker parent's grounding (${pct(gr)}).` });
      child.gen = B.gen; addEdge(g, a.id, child.id, 34, 'expands'); addEdge(g, child.id, b.id, 34, 'bridge'); born.push(child);
      trace(g, 'evolve', `CROSSOVER · "${short(label, 50)}"`);
    }
  }
  const p = parents[2] || parents[0];
  const planes = PLANES.map(x => x.id).filter(x => x !== p.plane && !g.nodes.some(m => m.projectionOf === p.id && m.plane === x));
  if (planes.length) { const mut = await project(g, p.id, planes[Math.floor(g.rng() * planes.length)], o); if (mut) { mut.via = 'Evolve · mutation'; mut.gen = B.gen; born.push(mut); trace(g, 'evolve', `MUTATION · "${short(p.label, 30)}" re-expressed on ${PLANE_OF[mut.plane].label}`); } }
  const weak = ranked.slice().reverse().filter(n => isGenerated(n) && n.deg <= 1 && !n.evidence.length && n.fitness < 0.3 && !n.status && B.tick - (n.lastTick || n.bornTick || 0) > 200).slice(0, 2);
  for (const n of weak) { archiveNode(g, n.id, 'selection'); culled.push(n); }
  trace(g, 'evolve', `EVOLVE · ${born.length} born, ${culled.length} culled · population ${g.nodes.length}`);
  log(g, 'evolve', { added: born.map(n => n.id) }); emit(g, 'evolve', { born, culled });
  return { gen: B.gen, born, culled };
}

// ── Propositions: a typed, checkable body under any thought (domain-neutral) ──
const UNITS = [
  { dim: 'time', k: 1, u: ['s', 'sec', 'second', 'seconds'] }, { dim: 'time', k: 60, u: ['min', 'minute', 'minutes'] }, { dim: 'time', k: 3600, u: ['h', 'hr', 'hour', 'hours'] }, { dim: 'time', k: 86400, u: ['day', 'days'] }, { dim: 'time', k: 604800, u: ['week', 'weeks'] }, { dim: 'time', k: 2592000, u: ['month', 'months'] }, { dim: 'time', k: 31536000, u: ['year', 'years', 'yr'] },
  { dim: 'length', k: 0.001, u: ['mm'] }, { dim: 'length', k: 0.01, u: ['cm'] }, { dim: 'length', k: 1, u: ['m', 'metre', 'meter', 'metres', 'meters'] }, { dim: 'length', k: 1000, u: ['km'] }, { dim: 'length', k: 1609, u: ['mile', 'miles'] },
  { dim: 'mass', k: 0.001, u: ['g', 'gram', 'grams'] }, { dim: 'mass', k: 1, u: ['kg', 'kilo', 'kilos'] }, { dim: 'mass', k: 1000, u: ['t', 'tonne', 'tonnes', 'ton', 'tons'] },
  { dim: 'temperature', k: 1, u: ['°c', 'c', 'celsius', 'degrees'] }, { dim: 'temperature', k: 1, u: ['k', 'kelvin'] },
  { dim: 'sound', k: 1, u: ['db', 'dba', 'decibel', 'decibels'] }, { dim: 'light', k: 1, u: ['lux', 'lumen', 'lumens', 'nit', 'nits', 'k'] },
  { dim: 'energy', k: 1, u: ['j', 'joule', 'joules'] }, { dim: 'energy', k: 3600000, u: ['kwh'] }, { dim: 'power', k: 1, u: ['w', 'watt', 'watts'] }, { dim: 'power', k: 1000, u: ['kw'] }, { dim: 'power', k: 1e6, u: ['mw'] },
  { dim: 'money', k: 1, u: ['€', '$', '£', 'eur', 'usd', 'gbp', 'euro', 'euros', 'dollar', 'dollars'] },
  { dim: 'data', k: 1, u: ['kb'] }, { dim: 'data', k: 1000, u: ['mb'] }, { dim: 'data', k: 1e6, u: ['gb'] },
  { dim: 'share', k: 1, u: ['%', 'percent', 'pct'] }, { dim: 'rate', k: 1, u: ['per', 'each', 'ratio'] },
  { dim: 'count', k: 1, u: ['people', 'person', 'users', 'adults', 'workers', 'cases', 'times', 'x', 'units', 'items'] },
];
const UNIT_INDEX = (() => { const m = new Map(); for (const e of UNITS) for (const u of e.u) if (!m.has(u)) m.set(u, e); return m; })();
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000, million: 1e6, half: 0.5, third: 1 / 3, quarter: 0.25 };
const CMP = [[/\b(at least|no less than|minimum of|≥|>=|over|above|more than|exceed\w*)\b/i, '≥'], [[/\b(at most|no more than|maximum of|≤|<=|under|below|less than|within)\b/i], '≤'], [/\b(exactly|equals?|is|=)\b/i, '=']];
export function parseProposition(text) {
  const t = String(text || ''); if (!t) return null;
  const quantities = [];
  const re = /(-?\d[\d.,]*)\s*(%|°c|[a-zµ]{1,5}\b)?/gi; let m;
  while ((m = re.exec(t)) && quantities.length < 4) {
    const value = parseFloat(m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); if (!isFinite(value)) continue;
    const raw = (m[2] || '').toLowerCase().trim(), u = UNIT_INDEX.get(raw);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 18).toLowerCase().match(/^[\s-]*([a-z°%]{1,10})/);
    const u2 = u || (after && UNIT_INDEX.get(after[1]));
    quantities.push({ value, unit: raw || (after && u2 ? after[1] : ''), dim: u2 ? u2.dim : null, si: u2 ? value * u2.k : null });
  }
  if (!quantities.length) { const w = t.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|half|third|quarter)\b\s+(?:in\s+)?(?:[a-z]+\s+)?([a-z]{3,12})/); if (w) quantities.push({ value: WORD_NUM[w[1]], unit: w[2], dim: (UNIT_INDEX.get(w[2]) || {}).dim || null, si: null }); }
  let comparator = null;
  for (const [rx, sym] of CMP) { const r = Array.isArray(rx) ? rx[0] : rx; if (r.test(t)) { comparator = sym; break; } }
  const subject = (tokenize(t)[0] || '').trim(), predicate = tokenize(t).slice(1, 4).join(' ');
  const seenQ = new Set(), uniq = quantities.filter(q => { const k = q.value + '|' + q.unit; if (seenQ.has(k)) return false; seenQ.add(k); return true; });
  const typed = uniq.length > 0 && (!!comparator || uniq.some(q => q.dim));
  return { subject, predicate, quantities: uniq, comparator: comparator || (uniq.length ? '=' : null), dims: [...new Set(uniq.map(q => q.dim).filter(Boolean))], typed, text: short(t, 160) };
}
export function proposition(g, n) { if (!n) return null; if (n._prop && n._prop.src === n.label) return n._prop; const p = parseProposition(`${n.label} ${n.detail}`); if (p) p.src = n.label; n._prop = p; return p; }
export function typedShare(g) { const t = g.nodes.filter(n => { const p = proposition(g, n); return p && p.typed; }).length; return g.nodes.length ? t / g.nodes.length : 0; }

// ── Inference rules: what an edge licenses ───────────────────────────────
export const SOUNDNESS = { deductive: { factor: 1, label: 'truth-preserving' }, inductive: { factor: 0.82, label: 'from evidence' }, abductive: { factor: 0.62, label: 'best explanation' }, analogical: { factor: 0.45, label: 'by analogy' }, assumed: { factor: 0.3, label: 'assumed' } };
const RULE_OF_RELATION = { supports: 'inductive', evidences: 'inductive', measures: 'deductive', defines: 'deductive', decomposes: 'deductive', 'follows from': 'deductive', constrains: 'deductive', causes: 'abductive', 'precedent for': 'inductive', systematizes: 'abductive', refines: 'deductive', reframes: 'analogical', resembles: 'analogical', bridges: 'analogical', 'alternative to': 'abductive', 'dreamed with': 'analogical', 'fires with': 'analogical', 'emerged from': 'analogical', reinvents: 'assumed', imagines: 'assumed', assumes: 'assumed', questions: 'assumed', contradicts: 'deductive', 'depends on': 'deductive', contains: 'deductive', 're-expresses': 'analogical' };
export function soundness(g, e) {
  if (e.soundness) return e.soundness;
  const a = g.byId.get(e.a), b = g.byId.get(e.b), rel = edgeRelation(e);
  let cls = RULE_OF_RELATION[rel] || 'inductive';
  const pa = a && proposition(g, a), pb = b && proposition(g, b);
  if (cls === 'deductive' && !(pa && pa.typed && pb && pb.typed)) cls = 'inductive'; // a deduction needs two typed claims
  if (pa && pb && pa.dims.length && pb.dims.length && pa.dims.some(d => pb.dims.includes(d)) && cls === 'analogical') cls = 'inductive'; // shared dimension licenses more than analogy
  return cls;
}
export function leafStrength(g, n) { if (n.status === 'refuted') return 0; if (n.status === 'verified' && n.evidence.length) return 0.97; if (n.status === 'verified') return 0.92; if (n.evidence.length) return n.evidence.some(e => /unverified/.test(e.src)) ? 0.6 : 0.88; return Math.min(n.g, 0.55); }

// ── Derivation: the proof under one thought, and an honest number ────────
export function derive(g, id, o = {}) {
  const target = g.byId.get(id); if (!target) return null;
  const maxDepth = o.depth ?? 4, adj = adjacency(g), eidx = edgeIndex(g), seen = new Set([id]), leaves = [], open = [];
  // walk returns the node's confidence plus the chain that carries it: its own supports, then the strongest path deeper
  const walk = (nodeId, depth) => {
    if (depth > maxDepth) return { conf: 0, chain: [] };
    const supports = []; let best = null;
    for (const otherId of adj.get(nodeId) || []) {
      if (seen.has(otherId)) continue;
      const e = eidx.get(nodeId + '|' + otherId);
      if (!e || e.kind === 'challenge') continue;
      const other = g.byId.get(otherId); if (!other || other.status === 'refuted') continue;
      const cls = soundness(g, e), f = SOUNDNESS[cls].factor;
      seen.add(otherId);
      const sub = walk(otherId, depth + 1);
      const base = Math.max(sub.conf, leafStrength(g, other));
      const strength = base * f * (e.weight != null ? clamp(0.6 + e.weight * 0.4, 0.6, 1) : 0.9);
      const sourced = other.evidence.length > 0 || other.status === 'verified';
      const step = { from: otherId, to: nodeId, rule: cls, relation: edgeRelation(e), strength, depth, sourced };
      if (sourced) leaves.push({ id: otherId, label: other.label, src: other.evidence[0] ? other.evidence[0].src : 'verified by you', strength: leafStrength(g, other), depth });
      else if (depth === 1 && (cls === 'assumed' || sub.conf === 0)) open.push({ id: otherId, label: other.label, why: cls === 'assumed' ? 'assumed step' : 'no source behind it' }); // only the claim's own direct supports count as open
      supports.push(step);
      if (!best || strength > best.step.strength) best = { step, sub };
    }
    if (!supports.length) return { conf: 0, chain: [] };
    let q = 1; for (const sp of supports) q *= (1 - clamp(sp.strength, 0, 0.995)); // noisy-OR over independent supports
    const chain = depth === 1 ? supports.concat(best ? best.sub.chain : []) : (best ? [best.step].concat(best.sub.chain) : []);
    return { conf: clamp(1 - q, 0, 1), chain };
  };
  const walked = walk(id, 1), steps = walked.chain, onChain = new Set(steps.map(s => s.from));
  let conf = walked.conf;
  const ownLeaf = leafStrength(g, target);
  conf = Math.max(conf, ownLeaf);
  const direct = steps.filter(s => s.depth === 1), unsourced = direct.length ? open.length / direct.length : 1;
  const nonDeductive = steps.some(s => (s.rule === 'analogical' || s.rule === 'assumed') && s.strength > 0.05);
  const asks = !!(target.venue || /\?\s*$/.test(target.label) || nodeType(target) === 'question');
  const chainLeaves = leaves.filter(l => onChain.has(l.id)); // only sources that actually sit on the shown chain
  const cited = target.evidence.length > 0 || chainLeaves.some(l => l.depth === 1); // closure rests on the claim's own support, not a neighbour's sources
  const checkable = target.status === 'verified' || target.evidence.length > 0 || !!(proposition(g, target) || {}).typed;
  const speculative = target.plane === 'wild' || !!target.fusedFrom || /^(Sleep|Evolve|Projection|Venue|Challenge|Fusion|Emergent)/.test(target.via || '');
  if (open.length) conf = Math.min(conf, 1 - 0.55 * unsourced); // penalty scales with the share of its own supports left open
  if (nonDeductive) conf = Math.min(conf, 0.9);
  if (!cited) conf = Math.min(conf, 0.5);
  if (speculative || !checkable) conf = Math.min(conf, 0.7);
  if (target.status === 'refuted') conf = Math.min(conf, 0.05);
  const survived = (target.attacks || []).filter(a => a.survived).length, landed = (target.attacks || []).filter(a => !a.survived).length;
  if (landed) conf = Math.min(conf, 0.35);
  conf = clamp(conf * (1 + Math.min(0.06, survived * 0.02)), 0, 0.9899);
  const status = target.status === 'refuted' ? 'refuted' : asks ? 'open question' : !steps.length && !target.evidence.length ? 'no support' : landed ? 'counterexample stands' : open.length ? `${open.length} open assumption${open.length === 1 ? '' : 's'}` : speculative ? 'speculation' : !checkable ? 'not yet checkable' : cited && !nonDeductive ? 'proof closed' : cited ? 'supported, not closed' : 'ungrounded';
  return { id, confidence: conf, status, closed: status === 'proof closed', steps: steps.sort((a, b) => a.depth - b.depth || b.strength - a.strength).slice(0, 10), leaves: chainLeaves.sort((a, b) => a.depth - b.depth).slice(0, 6), open: open.slice(0, 6), survived, landed, typed: !!(proposition(g, target) || {}).typed };
}

// ── Adversarial verification: try to break the claim ─────────────────────
export function attack(g, id) {
  const n = g.byId.get(id); if (!n) return null;
  const p = proposition(g, n), found = [], near = similar(g, n, 10).map(x => x.node);
  for (const m of near) { // contradicting measurement on the same dimension
    const pm = proposition(g, m); if (!pm || !p || !pm.typed || !p.typed) continue;
    const shared = p.dims.find(d => pm.dims.includes(d)); if (!shared) continue;
    const a = p.quantities.find(q => q.dim === shared), b = pm.quantities.find(q => q.dim === shared);
    if (a && b && a.si != null && b.si != null && Math.abs(a.si - b.si) / Math.max(a.si, b.si, 1e-9) > 0.35 && m.evidence.length) found.push({ kind: 'measurement', id: m.id, text: `"${short(m.label, 44)}" reports ${b.value}${b.unit} where this needs ${a.value}${a.unit}`, survived: false });
  }
  for (const m of near) if (m.plane === 'facts' && m.evidence.length && polarity(m) !== polarity(n) && similarity(stripped(n), stripped(m)) > 0.3) found.push({ kind: 'polarity', id: m.id, text: `"${short(m.label, 44)}" states the opposite and carries a source`, survived: false });
  for (const m of near) if (m.plane === 'principles' && /\b(must|never|cannot|only if|requires)\b/i.test(m.label) && nodeSim(n, m) > 0.3) found.push({ kind: 'constraint', id: m.id, text: `constraint "${short(m.label, 44)}" may forbid it`, survived: false });
  for (const m of near) if (m.id !== n.id && similarity(stripped(n), stripped(m)) > 0.62) found.push({ kind: 'prior art', id: m.id, text: `"${short(m.label, 44)}" already claims this — not a new venue`, survived: false });
  const d = derive(g, id);
  if (!found.length) { const probes = [`no contradicting measurement on ${p && p.dims.length ? p.dims.join('/') : 'any shared dimension'}`, 'no sourced thought states the opposite', 'no principle in the graph forbids it', 'no prior art in the graph claims it']; for (const t of probes) found.push({ kind: 'probe', text: t, survived: true }); }
  n.attacks = found.map(a => ({ ...a, at: timeStr() })); n.attackedAt = timeStr(); g._metrics = g._adj = null;
  const landed = n.attacks.filter(a => !a.survived).length;
  trace(g, 'attack', `ATTACK · "${short(n.label, 34)}" · ${landed ? landed + ' counterexample' + (landed === 1 ? '' : 's') + ' found' : 'survived ' + n.attacks.length + ' probes'} · confidence ${Math.round(derive(g, id).confidence * 100)}%`);
  log(g, 'attack', { id }); emit(g, 'attack', { node: n, attacks: n.attacks });
  return { attacks: n.attacks, landed, derivation: derive(g, id), before: d.confidence };
}

// ── Venues: unexplored but licensed territory, in any field ──────────────
export function venues(g, k = 5) {
  const M = metrics(g); if (M._venues) return M._venues.slice(0, k);
  const eff = effectiveGrounding(g), out = [], N = g.nodes.filter(x => !x.members && !x.dormant);
  const splitByCommunity = M.communities > 1; // label propagation collapses to one community on dense graphs — then hop distance alone carries the novelty
  const big = N.length > BIG, props = new Map(N.map(n => [n.id, proposition(g, n)])), dist = big ? null : new Map(N.map(n => [n.id, hops(g, n.id, 12)]));
  // big maps: candidates through the token index, and "within two hops" from neighbour sets instead of a BFS table per thought
  const adj = big ? adjacency(g) : null, AS = new Map(), aset = id => { let s = AS.get(id); if (!s) AS.set(id, s = new Set(adj.get(id) || [])); return s; };
  const within2 = (a, b) => { const A = aset(a), B = aset(b); if (A.has(b)) return true; const [x, y] = A.size < B.size ? [A, B] : [B, A]; for (const v of x) if (y.has(v)) return true; return false; };
  const cand = big ? similarPairs(g, 0.12, x => !x.members && !x.dormant, Math.max(50, Math.round(N.length * 0.03))).filter(p => p[2] < 0.4).slice(0, 40000).map(([a, b]) => [g.byId.get(a), g.byId.get(b)]) : null;
  const visit = fn => { if (cand) { for (const [a, b] of cand) fn(a, b); return; } for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) fn(N[i], N[j]); };
  visit((a, b) => {
    if (splitByCommunity && M.by.get(a.id).community === M.by.get(b.id).community) return;
    const d = big ? (within2(a.id, b.id) ? 2 : null) : dist.get(a.id).get(b.id); if (d != null && d <= 2) return;
    const pa = props.get(a.id), pb = props.get(b.id);
    const dim = pa && pb ? pa.dims.find(x => pb.dims.includes(x)) : null;
    const sim = nodeSim(a, b);
    const licence = dim ? 'shared ' + dim : sim > 0.12 && sim < 0.4 ? 'shared vocabulary' : null;
    if (!licence) return;
    const possibility = Math.min(eff.get(a.id), eff.get(b.id)) * (dim ? 1 : 0.75);
    const novelty = 1 - sim, reach = (M.by.get(a.id).pagerank + M.by.get(b.id).pagerank) / 2;
    out.push({ a: a.id, b: b.id, aLabel: a.label, bLabel: b.label, licence, dim: dim || null, possibility, novelty, hops: d ?? null, score: possibility * 0.45 + novelty * 0.35 + reach * 0.2, question: dim ? `What holds when ${lc(short(a.label, 36))} and ${lc(short(b.label, 36))} are measured on the same ${dim}?` : `What connects ${lc(short(a.label, 36))} to ${lc(short(b.label, 36))}?` });
  });
  M._venues = out.sort((x, y) => y.score - x.score);
  return M._venues.slice(0, k);
}
export function openVenue(g, v) {
  const a = g.byId.get(v.a), b = g.byId.get(v.b); if (!a || !b) return null;
  const n = addNode(g, { label: short(v.question, 110), detail: `An unexplored venue the graph licenses: "${a.label}" and "${b.label}" sit ${v.hops ? v.hops + ' hops apart' : 'in unconnected regions'}, ${v.dim ? 'measured on the same ' + v.dim : 'sharing vocabulary but no path'}. Possibility ${Math.round(v.possibility * 100)}%, novelty ${Math.round(v.novelty * 100)}%.`, plane: 'concepts', g: +(v.possibility * 0.8).toFixed(2), module: 10, via: 'Venue', parent: a.id, evidence: [], challenge: 'Challenge: a venue is a question, not a result — attack it before building on it.' });
  n.venue = true; addEdge(g, a.id, n.id, 10, 'venue'); addEdge(g, n.id, b.id, 10, 'venue');
  addHyper(g, [a.id, n.id, b.id], { kind: 'venue', module: 10, label: v.licence, weight: 0.5, quiet: true });
  trace(g, 'venue', `VENUE · ${v.licence} · "${short(v.question, 60)}"`);
  log(g, 'venue', { added: [n.id] }); emit(g, 'venue', n);
  return n;
}

// ── Spec and satisfaction: did the proofs reach what you asked for? ──────
export function parseSpec(text) { return String(text || '').split(/[\n;]+/).map(s => s.trim()).filter(Boolean).slice(0, 8).map((s, i) => ({ id: 'spec' + i, text: s, prop: parseProposition(s) })); }
export function satisfaction(g, spec) {
  if (!spec || !spec.length) return { score: 0, items: [] };
  const items = spec.map(s => {
    const hits = similar(g, s.text, 3).map(h => ({ node: h.node, sim: h.score, d: derive(g, h.node.id) }));
    const best = hits.sort((x, y) => (y.sim * y.d.confidence) - (x.sim * x.d.confidence))[0];
    const covered = best ? best.sim * best.d.confidence : 0;
    return { ...s, covered, status: !best ? 'nothing in the graph' : best.d.closed ? 'met by a closed proof' : `${best.d.status} · ${Math.round(best.d.confidence * 100)}%`, nodeId: best ? best.node.id : null, nodeLabel: best ? best.node.label : '' };
  });
  return { score: items.reduce((s, i) => s + i.covered, 0) / items.length, items };
}

// ── Natural language: the engine explains itself, and reads directives from the seed ──────
export function explainLogic(o = {}) {
  const wild = o.wild ?? 40, lean = wild >= 70 ? 'strongly toward the impossible' : wild >= 50 ? 'toward wild ideas' : wild >= 25 ? 'balanced between evidence and imagination' : 'toward checkable facts';
  const P = [];
  P.push(`Seed. Everything grows from one input${o.seed ? `: "${o.seed}"` : ''}. The input is the only thing taken on faith; every other thought must earn its place.`);
  P.push(`Reasoning. Each step picks one of the 39 SELF-DISCOVER reasoning modules (SELECT), rewrites it for the thought at hand (ADAPT), and produces one or two concrete thoughts from it (IMPLEMENT). Wildness is ${wild}/100, so module choice leans ${lean}: ${wild >= 50 ? 'Creative, Contrarian and Innovative modules come up most' : 'Data-Driven, Root Cause, Assumption and Measurement modules come up most'}.`);
  P.push(`Where the frontier goes. The next thought to expand is chosen by graph intelligence${o.graphIntel === false ? ' (currently off: random tips)' : ''}: prefer tips with few children, reward depth up to four steps then push back toward branching, avoid saturated hubs, favour whatever is active in the brain, never a refuted thought. Thoughts do not pile up on the seed; they spider outward like hyphae.`);
  P.push(`Planes. Every thought sits on one of four planes — Facts, Concepts, Principles, Wild — and any thought can be re-expressed on another plane. Grounding runs from 0 to 1, propagates a little from sourced neighbours, and is capped hard for anything speculative.`);
  P.push(`Proof. A claim is "proof closed" only when its own supports are sourced and every inference step is deductive or inductive; analogies, dreams and fusions cap confidence and are labelled speculation. Verifying or refuting a thought is reversible and downgrades its dependents while it stands.`);
  P.push(`Fusion. Any two thoughts can react: the same idea twice merges; a contradiction yields a named tension; two instances of one pattern lift to a principle; anything else becomes an emergent third thought linked to both parents. In auto mode, two co-firing unrelated thoughts fuse on their own.`);
  P.push(`Brain${o.brain === false ? ' (off)' : ''}. Activation spreads along edges and decays; edges that fire together strengthen (Hebbian), idle ones fade toward their floor and the weakest are pruned; unused thoughts go dormant, then to a recallable archive. Every twelfth auto step sleeps: replay the most-recalled chains, merge duplicates, dream one cross-community recombination. Every sixth step evolves: crossover of the two fittest, one mutation across planes, cull weak leaves.`);
  P.push(`Trust. Processing is local; text leaves the device only when Live AI is on, and that is logged. Personal identifiers are masked on ingest, connectors need consent with a named scope, every action lands in a hash-chained audit trail, old records expire, and everything can be exported or erased.`);
  return P;
}
export function explainLogicMarkdown(o = {}) { return `# How this graph thinks\n\n${explainLogic(o).map(p => `- ${p}`).join('\n\n')}\n\n_Exported ${new Date().toLocaleString()} · wildness ${o.wild ?? 40} · ${o.live ? 'Live AI on' : 'scripted engine'}._\n`; }

// Plain-language directives inside the seed: "wild ideas about X", "ground X in facts", "go deep on X, auto", "from my gmail".
const DIRECTIVES = [
  { rx: /\b(wild(ly|est)?|crazy|impossible|moonshot|out there|sci[- ]?fi)\b/i, set: { wild: 80 }, say: 'lean wild' },
  { rx: /\b(ground(ed)?|facts? only|evidence|sources?|rigorous|prove|checkable)\b/i, set: { wild: 15 }, say: 'ground it in facts' },
  { rx: /\b(balanced|both ways|possible and impossible)\b/i, set: { wild: 45 }, say: 'balanced' },
  { rx: /\b(go deep|deep(ly|er)?|drill)\b/i, set: { depth: 'deep' }, say: 'go deep' },
  { rx: /\b(go wide|wide(ly|r)?|breadth|many angles)\b/i, set: { depth: 'wide' }, say: 'go wide' },
  { rx: /\b(auto(matically)?|on its own|by itself|self[- ]discover(y)?|keep going|explore for me)\b/i, set: { auto: true }, say: 'auto on' },
  { rx: /\b(principles?|first principles|rules?)\b/i, set: { plane: 'principles' }, say: 'principles first' },
  { rx: /\b(concepts?|framings?|models?)\b/i, set: { plane: 'concepts' }, say: 'concepts first' },
  { rx: /\b(from my (gmail|email|inbox))\b/i, set: { source: 'gmail' }, say: 'learn from Gmail' },
  { rx: /\b(from (my )?slack)\b/i, set: { source: 'slack' }, say: 'learn from Slack' },
  { rx: /\b(from (my )?(discord|telegram|notes|health))\b/i, set: { source: 'chat' }, say: 'learn from connectors' },
];
const STRIP = /\b(please|can you|could you|i want to|i'd like to|let's|lets|help me|explore|think about|map out|ideas? (about|for|on)|build a (thought )?graph (of|about|for)|a (thought )?graph (of|about|for))\b\s*/gi;
const STRIP_DIRECTIVE = /(\b(and )?(go )?(wild(ly)?|crazy|grounded|in facts|facts only|with evidence|with sources|deep(ly)?( on)?|wide(ly)?( on)?|balanced|auto(matically)?|on its own|by itself|keep going|from my (gmail|email|inbox|slack|discord|telegram|notes|health))\b[,.]?\s*)|(^ground\s+)/gi;
export function parseIntent(text) {
  const raw = String(text || '').trim(); if (!raw) return { seed: '', directives: [], settings: {} };
  const settings = {}, directives = [];
  for (const d of DIRECTIVES) if (d.rx.test(raw)) { Object.assign(settings, d.set); directives.push(d.say); }
  let seed = raw.replace(STRIP, '').replace(STRIP_DIRECTIVE, '').replace(/\s{2,}/g, ' ').replace(/^[,\s:–—-]+|[,\s:–—-]+$/g, '').trim();
  if (seed.length < 3 || /^(it|this|that)$/i.test(seed)) seed = raw; // never lose the user's words
  seed = seed.charAt(0).toUpperCase() + seed.slice(1);
  return { seed, directives, settings, changed: seed !== raw };
}
export function describeIntent(intent, o = {}) {
  if (!intent.seed) return '';
  const bits = [`seed "${short(intent.seed, 48)}"`];
  if (intent.settings.wild != null) bits.push(`wild ${intent.settings.wild}`); else bits.push(`wild ${o.wild ?? 40}`);
  if (intent.settings.depth) bits.push(intent.settings.depth === 'deep' ? 'depth first' : 'breadth first');
  if (intent.settings.plane) bits.push(`${PLANE_OF[intent.settings.plane].label} first`);
  if (intent.settings.auto) bits.push('auto on');
  if (intent.settings.source) bits.push('learn from connectors');
  return `Understood: ${bits.join(' · ')}`;
}

// ── Export ───────────────────────────────────────────────────────────────
export function exportMarkdown(g) {
  const eff = effectiveGrounding(g), root = g.nodes[0]; if (!root) return '';
  const lines = [`# ${g.seed}`, '', `${g.nodes.length} thoughts · ${g.edges.length} edges · exported ${new Date().toISOString()}`, ''];
  const walk = (n, depth) => {
    lines.push(`${'  '.repeat(depth)}- **${n.label}** _(${PLANE_OF[n.plane].label}, ${Math.round(eff.get(n.id) * 100)}%${n.status ? ', ' + n.status : ''})_${n.detail ? ' — ' + n.detail : ''}${n.evidence.length ? ` [${n.evidence.map(e => e.src).join('; ')}]` : ''}`);
    for (const k of g.nodes.filter(m => m.parent === n.id)) walk(k, depth + 1);
  };
  walk(root, 0);
  const cross = g.edges.filter(e => e.kind === 'bridge' || e.kind === 'adjacent');
  if (cross.length) { lines.push('', '## Cross-links', ''); for (const e of cross) lines.push(`- ${g.byId.get(e.a).label} ⟷ ${g.byId.get(e.b).label} _(${e.kind})_`); }
  return lines.join('\n');
}

export { addNode as addNodeRaw, addEdge as addEdgeRaw };
