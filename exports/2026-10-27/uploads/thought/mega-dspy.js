// A DSPy-style program for the agents: a signature, a ReAct module over the app's tools, assertions that
// backtrack with feedback, and an optimizer that keeps what worked.
//   Signature   question, map  ->  answer (written onto the map), evidence
//   Module      ReAct = the agent loop in mega-agent.js, with the program's instructions and few-shot demos
//   Assertions  wrote_answer (hard), matches_data (hard when the answer is known), safe_for_children (hard)
//               A failed assertion retries the module with the failure fed back, as dspy.Assert does.
//   Optimizer   BootstrapFewShot with retrieval: every passing trace becomes a demo; the closest three are shown next time.
//               Instruction proposal: after failures, Sonnet proposes a sharper instruction; versions are scored and the best one is used.
// The known answer is never shown to the agent. Feedback names which check failed and why, not what the answer is.
import * as AI from './suite-ai.js';

const KEY = 'mega-dspy-program';
const BASE = 'Answer the question from the map. For anything that counts, ranks or compares many thoughts, run one js_run over `records` (or map), print the result, and check it makes sense. Then write the answer with node_add: a short label and a detail that gives the numbers and how you got them, under the thought it is about. Finish with done and a two-sentence answer.';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const store = P => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* a full store keeps the program in memory */ } };
let P = load() || { version: 1, instructions: [{ v: 1, text: BASE, pass: 0, n: 0, by: 'seed' }], current: 1, demos: [] };
export const program = () => P;
export const reset = () => { P = { version: 1, instructions: [{ v: 1, text: BASE, pass: 0, n: 0, by: 'seed' }], current: 1, demos: [] }; store(P); };
const instr = () => P.instructions.find(i => i.v === P.current) || P.instructions[0];
const toks = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
const sim = (a, b) => { const A = toks(a), B = toks(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };
const demosFor = q => P.demos.map(d => [d, sim(d.q, q)]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1] > 0.02).map(x => x[0]);
const demoText = D => !D.length ? '' : 'Worked examples from earlier runs (same kind of question, different data):\n' + D.map((d, i) => (i + 1) + '. Q: ' + d.q + '\n   steps: ' + d.steps + (d.code ? '\n   js_run: ' + d.code : '') + '\n   answer written: ' + d.answer).join('\n');

// Assertions. Each returns null when it holds, or feedback for the retry.
function check(ctx) {
  const { added, said, meets, expect, kid } = ctx;
  if (!added.length) return { name: 'wrote_answer', feedback: 'You did not write your answer onto the map. Use node_add before you finish; reading more thoughts is not needed.' };
  if (expect != null && !meets(said, expect)) return { name: 'matches_data', feedback: 'Your answer does not agree with the records. Recompute it with one js_run over `records`: filter to the rows the question is about, group by the field it names, count or average, sort, and print the top results with their numbers. Then correct the thought you added (node_update) or add a corrected one.' };
  if (kid && /\b(kill|killed|blood|dead|death|die|gun|weapon|sex|drug|suicide|murder|war)\b/i.test(said)) return { name: 'safe_for_children', feedback: 'This is for a six-year-old. Rewrite it without frightening or adult words.' };
  return null;
}

// Run the module with backtracking. kit = a container from mega-agent.spawn(); onAttempt reports each try.
export async function answer(kit, agent, question, judge, o = {}) {
  const tries = [], maxTries = o.retries ?? 2, inst = instr(), demos = demosFor(question);
  let feedback = '', n0 = judge.size(), last = null;
  for (let t = 0; t <= maxTries; t++) {
    const trace = [], extra = 'Program v' + inst.v + ' instructions: ' + inst.text + (demos.length ? '\n\n' + demoText(demos) : '') + (feedback ? '\n\nYour previous attempt failed a check (' + last.name + '): ' + feedback + ' Fix that now.' : '');
    const fin = await kit.runAgent({ ...agent, maxSteps: agent.maxSteps || 8 }, question, { extra, trace });
    const added = judge.added(n0), said = fin + ' ' + added.map(n => n.label + ' ' + n.detail).join(' ');
    last = check({ added, said, meets: judge.meets, expect: judge.expect, kid: judge.kid });
    tries.push({ attempt: t + 1, ok: !last, failed: last && last.name, steps: trace.map(x => x.tool + (x.ok ? '' : ' (failed)')).join(', '), final: fin });
    if (o.onAttempt) o.onAttempt(tries[tries.length - 1]);
    if (!last) { learn(question, trace, added, inst); return { ok: true, tries, fin, added }; }
    feedback = last.feedback;
  }
  inst.n++; store(P); return { ok: false, tries, fin: tries[tries.length - 1].final, added: judge.added(n0), failed: last.name };
}
function learn(q, trace, added, inst) {
  const code = (trace.find(x => x.tool === 'js_run' && x.ok) || {}).args;
  P.demos = [{ q: q.slice(0, 200), steps: trace.filter(x => x.ok).map(x => x.tool).join(' → '), code: code ? String(code.code || '').slice(0, 500) : '', answer: added.map(n => n.label).join('; ').slice(0, 160), at: Date.now() }, ...P.demos.filter(d => d.q !== q.slice(0, 200))].slice(0, 60);
  inst.pass++; inst.n++; store(P);
}

// Instruction proposal (COPRO-style): show Sonnet the current instruction and recent failures; keep the proposal as a new version.
// The best-scoring version (with at least 4 runs) becomes current; an untested one gets tried next.
export async function propose(failures) {
  if (!failures.length || !AI.available()) return null;
  const cur = instr(), fails = failures.slice(0, 6).map(f => '- question: ' + f.q.slice(0, 160) + '\n  failed check: ' + f.failed + '\n  steps taken: ' + f.steps).join('\n');
  let j = null; try { j = await AI.ask('direct', 'Current instruction for an agent that answers questions over a large thought graph using tools (node_search, node_get, node_add, edge_add, js_run over `records`):\n"' + cur.text + '"\n\nRecent failures:\n' + fails + '\n\nWrite one improved instruction, at most 90 words, that would prevent these failures without naming any particular answer. Reply as JSON {"instruction": string, "why": string}.', { model: 'sonnet', tokens: 600 }); } catch (e) { return null; }
  if (!j || !j.instruction) return null;
  const v = Math.max(...P.instructions.map(i => i.v)) + 1; P.instructions.push({ v, text: String(j.instruction).slice(0, 700), why: String(j.why || '').slice(0, 300), pass: 0, n: 0, by: 'proposed after ' + failures.length + ' failures' }); P.current = v; store(P); return P.instructions[P.instructions.length - 1];
}
export function choose() { const tested = P.instructions.filter(i => i.n >= 4); if (!tested.length) return; const best = tested.sort((a, b) => b.pass / b.n - a.pass / a.n)[0], fresh = P.instructions.find(i => i.n < 4 && i.v !== best.v); P.current = fresh ? fresh.v : best.v; store(P); }
export const summary = () => { const i = instr(); return { version: i.v, instruction: i.text, passRate: i.n ? i.pass / i.n : null, runs: i.n, demos: P.demos.length, versions: P.instructions.map(x => ({ v: x.v, rate: x.n ? Math.round(x.pass / x.n * 100) + '%' : '—', n: x.n, by: x.by })) }; };
