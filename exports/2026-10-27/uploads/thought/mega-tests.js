// Simulated sessions for Mega Graph: eight people, real-sized maps, every feature exercised against the real code.
// Each step returns what it saw; budgets turn slow steps into findings. Network and Live AI steps are reported apart.
import * as E from './thought-engine.js';
import * as C from './mega-corpus.js';
import * as LR from './suite-learn.js';
import * as SH from './thought-shake.js';
import * as LZ from './thought-lenses.js';
import * as MIND from './thought-mind.js';
import * as RW from './thought-rewrite.js';
import * as TR from './thought-trust.js';
import * as SC from './suite-core.js';
import * as SV from './suite-views.js';
import * as MV from './mega-views.js';
import * as M from './mega-agent.js';
import * as K from './mega-cases.js';
import * as DS from './mega-dspy.js';
export { DS };

Object.assign(SV.VIEWS, MV.VIEWS3);
export const VIEWS = SV.VIEWS;
export { M, E };
const CFG = { rule: 'oja', eta: 0.05, decay: 0.002, q: true, alpha: 0.3, gamma: 0.8, eps: 0.15, ucb: 0.35, horizon: 4 };
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const exText = ex => ex == null ? 'none' : ex instanceof RegExp ? ex.source.replace(/\\b/g, '').slice(0, 60) : Array.isArray(ex) ? ex.map(exText).join(' + ') : ex.num != null ? '≈ ' + (Math.round(ex.num * 10) / 10) : String(ex);
const short = (s, n = 70) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const find = (g, label) => g.nodes.find(n => n.label === label) || g.nodes.find(n => n.label.startsWith(label));
const protectedIds = g => new Set(g.nodes.filter(n => !E.isGenerated(n)).map(n => n.id));

const CAT_C = { Students: '#7fb2e5', Work: '#e5c46f', Science: '#5fd0c9', Creative: '#e57f9b', 'Home and life': '#b6d97f' };
const OLD = { journalist: 'journalist', teacher: 'teacher', baker: 'baker', surgeon: 'surgeon', 'law-patent': 'law', novelist: 'novelist', 'chem-library': 'grad', 'kid-dragons': 'child' };
export const PEOPLE = K.CASES.map(c => ({ ...c, c: CAT_C[c.cat] || '#9184d9', tasks: OLD[c.id] || null }));
export const CATS = [...new Set(K.CASES.map(c => c.cat))];
const BLOCK = /\b(kill|killed|blood|dead|death|die|gun|weapon|sex|drug|suicide|murder|war)\b/i;
const INBOX = {
  child: [{ source: 'Family tablet', text: 'Mina says the dragon lives behind the moon. Call grandma on 555-0142 about Saturday.', at: '18:02' }],
  novelist: [{ source: 'Email · editor', text: 'Can you send chapter 12 by Friday? My direct line is +1 415 555 0199. jane.editor@example.com', at: '09:12' }],
  law: [{ source: 'Slack · seminar', text: 'Office hours moved; email prof.ito@lawschool.example.edu or call (617) 555-0123.', at: '11:40' }],
  surgeon: [{ source: 'Pager export', text: 'Bed 14 post-op check, MRN 00482913, call 555 0177 if GCS drops.', at: '02:31' }],
  journalist: [{ source: 'Tip line', text: 'Look at fleet overtime. Contact me at tipster@example.org, 202-555-0148.', at: '16:05' }],
  teacher: [{ source: 'Parent email', text: 'My son in period 4 was sick Tuesday. Reach me at parent.k@example.com.', at: '07:50' }],
  baker: [{ source: 'Supplier text', text: 'Flour invoice due; card on file ending 4242 4242 4242 4242 will be charged.', at: '05:10' }],
  grad: [{ source: 'Lab Slack', text: 'Ordering the boronic acid; PO goes to purchasing@uni.example.edu, ext. 555-0100.', at: '14:22' }],
};

function host(state) {
  return { g: () => state.g, E, sel: () => state.sel, mark: () => { state.marks++; }, changed: () => {}, select: id => { state.sel = id; }, setView: v => { state.view = v; }, expand: async id => E.expand(state.g, id, E.pickModule(40).id, { wild: 40 }) };
}
export function viewCtx(g, W, H, mem, sel) {
  const PL = { facts: { c: '#7fb2e5', rgb: '127,178,229', y: 0 }, concepts: { c: '#9184d9', rgb: '145,132,217', y: 1 }, principles: { c: '#c79be0', rgb: '199,155,224', y: 2 }, wild: { c: '#e8956f', rgb: '232,149,111', y: 3 } };
  const pos = new Map(g.nodes.map((n, i) => { const a = i * 2.4, r = 30 + Math.sqrt(i) * 22; return [n.id, { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, born: 0 }]; }));
  return { W, H, cam: { px: 0, py: 0, k: 1, yaw: 0.6, pitch: 0.46, cx: 0, cy: 0, cz: 0 }, DP: n => (PL[n.plane] ? n.plane : 'concepts'), PL, PN: { facts: { label: 'Facts' }, concepts: { label: 'Concepts' }, principles: { label: 'Principles' }, wild: { label: 'Wild' } }, PORDER: ['facts', 'concepts', 'principles', 'wild'], hidden: {}, g, pos, mem, rel: e => e.relation || e.kind, minW: 0, sel, hover: null, hopMap: null, alpha4: 0.8 };
}
// One frame of every canvas view on the full map. Returns per-view milliseconds and any that threw.
export function drawViews(g, canvasFor, sel) {
  const res = [], N = g.nodes.filter(n => !n.dormant);
  for (const name of Object.keys(VIEWS)) {
    const c = canvasFor(name), ctx = c.getContext('2d'), mem = {};
    try {
      const o = viewCtx(g, c.width, c.height, mem, sel);
      ctx.fillStyle = '#1b1d2c'; ctx.fillRect(0, 0, c.width, c.height); VIEWS[name](ctx, N, new Map(), o); // warm-up: layouts that settle get one frame first
      ctx.fillStyle = '#1b1d2c'; ctx.fillRect(0, 0, c.width, c.height);
      const P = new Map(), t0 = performance.now(), flags = VIEWS[name](ctx, N, P, o) || {}, ms = performance.now() - t0;
      if (!flags.noEdges) { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(233,233,237,0.07)'; ctx.beginPath(); let k = 0; for (const e of g.edges) { const A = P.get(e.a), B = P.get(e.b); if (!A || !B) continue; ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); if (++k > 6000) break; } ctx.stroke(); }
      for (const p of P.values()) { ctx.fillStyle = 'rgba(' + o.PL[o.DP(p.n)].rgb + ',0.85)'; ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); }
      res.push({ name, ms, placed: P.size });
    } catch (e) { res.push({ name, ms: 0, placed: 0, error: e.message }); }
  }
  return res;
}

export async function runPerson(p, opts, emit) {
  const kit = M.spawn({ policy: { files: 'ask', terminal: 'ask' } }); // a container: its own map, brain, files, chat, log and approvals
  const state = { g: null, sel: null, marks: 0, view: null }, rows = [], call = (n, a) => kit.callTool(n, a, { direct: true, who: p.name });
  const push = r => { const row = { person: p.name, pid: p.id, ...r }; rows.push(row); emit && emit(row); return row; };
  const approve = async (who, name, args, yes = true) => { const before = kit.S.approvals.length, pr = kit.callTool(name, args, { who }); await sleepMs(40); const req = kit.S.approvals[kit.S.approvals.length - 1]; if (kit.S.approvals.length !== before + 1 || !req) throw new Error(name + ' ran without asking first'); req.res(yes); if (yes) return await pr; try { await pr; } catch (e) { if (/denied/.test(e.message)) return 'paused, asked, and denying it stopped it'; throw e; } throw new Error('denying did not stop ' + name); };
  const step = async (area, label, fn, o = {}) => {
    if (o.net && !opts.net) return push({ area, label, verdict: 'skip', out: 'Network steps are off.' });
    if (o.live && !opts.live) return push({ area, label, verdict: 'skip', out: 'Live AI steps are off.' });
    if (o.live && !E.liveAvailable()) return push({ area, label, verdict: 'note', out: 'Needs Live AI, which this viewer does not provide. Open the app in a session with Live AI to run it.' });
    await sleepMs(0); const t0 = performance.now();
    try { const out = await fn(); const ms = Math.round(performance.now() - t0); return push({ area, label, said: o.said, verdict: o.budget && ms > o.budget ? 'slow' : 'pass', out: String(out == null ? '' : out).slice(0, 1400), ms, budget: o.budget }); }
    catch (e) { const ms = Math.round(performance.now() - t0), net = o.net || /Failed to fetch|NetworkError|CORS|HTTP \d{3}|network/i.test(e.message); return push({ area, label, said: o.said, verdict: net ? 'note' : 'fail', out: (net ? 'Needs the network, or the source refused: ' : '') + e.message, ms, budget: o.budget, dspy: e.dspy || null }); }
  };

  // ── open the map ──
  let built = null;
  await step('scale', 'Opens the map: ' + p.who.split(' · ')[1], async () => { built = p.build ? p.build(E) : C.build(p.id, E); state.g = built.g; state.sel = built.g.nodes[0].id; kit.attach(host(state)); return built.g.nodes.length + ' thoughts, ' + built.g.edges.length + ' links · ' + built.source; }, { budget: 1500 });
  if (!state.g) return { rows, g: null };
  const g = () => state.g, id = label => { const n = find(g(), label); if (!n) throw new Error('no thought "' + label + '" on the map'); return n.id; };

  // ── the question this person actually has, answered with the terminal, checked against the known answer ──
  if (p.an) await step('question', 'Asks: ' + p.ask, async () => { const ex = K.expectation(p, g()), out = await call('js_run', { code: K.PRE + 'log((() => {' + p.an + '})());' }); if (!K.meets(out, ex)) throw new Error('expected ' + exText(ex) + ', the analysis said: ' + out); return out + '\n✓ matches the known answer (' + exText(ex) + ')'; }, { budget: 5000 });
  // ── what this person actually does ──
  for (const t of TASKS[p.tasks || p.id] || []) await step(t[0], t[1], () => t[2]({ g, id, call, approve, state, p, kit }), t[3] || {});

  // ── every feature, at this size ──
  if (opts.battery !== false) {
  await step('graph', 'Reads the overview: size, hubs, selection', () => call('graph_overview', {}), { budget: 400 });
  await step('intel', 'Finds hubs, bridges and communities', () => { const t0 = performance.now(), Mx = E.metrics(g()), a = performance.now() - t0, lv = LR.louvain(g()), top = (g().comms || []).slice(0, 3).map(c => c.size).join(', '); return 'centrality ' + Math.round(a) + ' ms' + (Mx.sampled ? ' (sampled sources)' : '') + ' · hubs: ' + Mx.hubs.map(h => short(g().byId.get(h).label, 30)).join('; ') + '\nLouvain: ' + lv.count + ' communities, modularity ' + lv.q + ' · largest ' + top; }, { budget: 600 });
  await step('intel', 'Asks what to do next', () => { const s = E.suggestions(g(), 4); return s.length ? s.map(x => x.label + ' (' + x.why + ')').join('\n') : 'no suggestions'; }, { budget: 900 });
  await step('intel', 'Looks for tensions and unexplored pairs', () => { const t = E.tensions(g()), v = E.venues(g(), 3); return t.length + ' tensions' + (t[0] ? ', strongest: "' + short(g().byId.get(t[0].a).label, 40) + '" vs "' + short(g().byId.get(t[0].b).label, 40) + '" (' + t[0].why + ')' : '') + '\n' + v.length + ' venues' + (v[0] ? ', first: ' + short(v[0].question, 110) : ''); }, { budget: 900 });
  await step('learn', 'Plasticity: a walk of 25 thoughts, then 60 brain ticks', () => {
    const G = g(), B = E.brainState(G), s0 = B.synapses, w0 = G.edges.reduce((s, e) => s + (e.weight ?? 0.5), 0), walk = G.nodes.filter(n => !n.root).sort((a, b) => b.deg - a.deg).slice(0, 25); let learned = 0;
    walk.forEach((n, i) => { n.act = 1; if (i && LR.coFire(G, walk[i - 1].id, n.id, CFG, E)) learned++; });
    const t0 = performance.now(); for (let i = 0; i < 60; i++) E.brainTick(G, {}); const per = (performance.now() - t0) / 60;
    let hc = 0; for (let i = 0; i < 10; i++) hc += LR.hebbStep(G, CFG, E).changed || 0;
    const w1 = G.edges.reduce((s, e) => s + (e.weight ?? 0.5), 0);
    return per.toFixed(1) + ' ms per tick · ' + (B.synapses - s0) + ' new synapses · total link weight ' + w0.toFixed(1) + ' → ' + w1.toFixed(1) + '\nHebbian (Oja): ' + hc + ' weight updates in 10 steps · co-firing touched ' + learned + ' links';
  }, { budget: 2500 });
  await step('learn', 'Q-table: 10 learning-guided expansions, then settle', async () => {
    const G = g(), o = { wild: 45, graphIntel: true, pickModule: (gg, t) => LR.pickModule(gg, t, { ...CFG, wild: 45 }, E), onOutcome: (gg, t, mod, added) => { LR.record(gg, t, String(mod.id), mod.type, (added || []).map(n => n.id), E, mod); LR.settle(gg, CFG, E); } };
    const n0 = G.nodes.length; for (let i = 0; i < 10; i++) await E.autoTick(G, o); LR.settle(G, CFG, E, true);
    const L = LR.learnState(G), states = Object.keys(L.q).length, best = Object.entries(L.q).flatMap(([s, row]) => Object.entries(row).map(([a, q]) => [L.names[a] || a, q])).sort((a, b) => b[1] - a[1])[0];
    return '+' + (G.nodes.length - n0) + ' thoughts · ' + states + ' states, ' + L.updates + ' updates, mean reward ' + (L.rewardN ? (L.rewardSum / L.rewardN).toFixed(2) : '0') + (best ? '\nbest move so far: ' + best[0] + ' (q ' + best[1].toFixed(2) + ')' : '');
  }, { budget: 4000 });
  await step('shuffle', 'Shakes the map: 12 thoughts across the bridges', async () => { const ps = SH.parseShake('a dozen wild thoughts across the bridges, densely linked'), rep = await SH.shake(g(), { ...ps.settings, count: 12 }); return 'parsed "' + ps.say.join(', ') + '" · +' + rep.nodes.length + ' thoughts, +' + rep.edges.length + ' links in ' + rep.ms + ' ms · ' + Object.entries(rep.did).filter(x => x[1]).map(x => x.join(' ')).join(', '); }, { budget: 4000 });
  await step('shuffle', 'Lens shuffle: four angles, then four different ones', async () => { const target = state.sel || g().nodes[1].id, a = LZ.suggest(g(), target, 4), b = LZ.suggest(g(), target, 4, { skip: a.map(x => x.id) }), same = a.filter(x => b.some(y => y.id === x.id)).length, seen = a[0] ? await LZ.see(g(), target, a[0]) : null, w = await LZ.wander(g(), {}); return 'first: ' + a.map(x => x.label).join(', ') + '\nshuffled: ' + b.map(x => x.label).join(', ') + (same ? ' (' + same + ' repeated)' : ' (no repeats)') + '\nlooked through "' + (a[0] ? a[0].label : '-') + '": ' + (seen ? short(seen.label, 80) : 'nothing new') + (w ? '\nwandered: ' + short(w.from.label, 30) + ' through ' + w.lens.label : ''); }, { budget: 2500 });
  await step('mind', 'Lets the mind think four times on its own', async () => { const out = []; for (let i = 0; i < 4; i++) { const w = await MIND.think(g(), { wild: 45 }); out.push(w ? w.intent + ' → ' + short(w.added && w.added[0] ? w.added[0].label : '', 50) : 'nothing new'); } const d = MIND.describe(g()); return out.join('\n') + '\nleaning: ' + d.leaning; }, { budget: 3000 });
  await step('reason', 'Challenges a hub, attacks it, verifies a fact, re-frames a thought', async () => {
    const G = g(), Mx = E.metrics(G), hub = G.byId.get(Mx.hubs.find(h => !G.byId.get(h).root) || Mx.hubs[0]), fact = G.nodes.find(n => n.plane === 'facts' && !n.root), other = G.nodes.find(n => !n.root && n.plane === 'concepts');
    const ch = await E.challenge(G, hub.id, {}), at = E.attack(G, hub.id), ver = fact ? E.verify(G, fact.id, 'verified', 'checked in the test') : [], pr = other ? await E.project(G, other.id, 'principles', {}) : null;
    return 'challenge: ' + short(ch && ch.label, 80) + '\nattack: ' + (at ? (at.verdict || at.status || 'ran') : 'nothing to attack') + '\nverified "' + short(fact && fact.label, 40) + '" (touched ' + ver.length + ')\nre-framed as a principle: ' + short(pr && pr.label, 80);
  }, { budget: 2500 });
  await step('sleep', 'Sleeps after a long idle: forget, prune, merge, dream', () => {
    const G = g(), keep = protectedIds(G), B = E.brainState(G), before = G.nodes.length; B.tick = Math.ceil((B.tick + 1000) / 90) * 90 - 1; E.brainTick(G, {});
    const r = E.sleep(G, { wild: 45 }), lost = [...keep].filter(x => !G.byId.has(x));
    if (lost.length) throw new Error(lost.length + ' imported or typed thoughts disappeared in sleep, e.g. "' + short(keep.size && lost[0], 30) + '"');
    let back = ''; if (G.archive && G.archive.length) { const n = E.recall(G, G.archive[0].node.id); back = n ? '\nrecalled from the archive: "' + short(n.label, 50) + '"' : ''; }
    return before + ' → ' + G.nodes.length + ' thoughts · ' + r.strengthened + ' strengthened, ' + r.merged + ' merged, ' + r.pruned + ' pruned, ' + r.dreams.length + ' dream(s), ' + r.archived + ' archived' + (r.dreams[0] ? '\ndream: "' + short(r.dreams[0].label, 90) + '"' : '') + '\nall ' + keep.size + ' imported or typed thoughts still there' + back;
  }, { budget: 2000 });
  await step('evolve', 'Evolves two generations', async () => { const G = g(), keep = protectedIds(G), a = await E.evolve(G, { wild: 45 }), b = await E.evolve(G, { wild: 45 }), lost = [...keep].filter(x => !G.byId.has(x)); if (lost.length) throw new Error(lost.length + ' imported thoughts culled by evolution'); const born = [...a.born, ...b.born]; return 'generation ' + b.gen + ' · ' + born.length + ' born, ' + (a.culled.length + b.culled.length) + ' culled (machine-made only)' + (born[0] ? '\ncrossover: "' + short(born[0].label, 90) + '"' : ''); }, { budget: 2500 });
  await step('planes', 'Re-sorts the map into planes', () => { const P = SC.makePlanes(p.mode, g().seed), props = SC.evolve(P, g(), { force: true }) || []; return P.list.map(x => x.label).join(', ') + ' · ' + props.length + ' proposed change(s)' + (props[0] ? ': ' + short(props[0].label || props[0].text || props[0].kind || JSON.stringify(props[0]), 90) : ''); }, { budget: 2000 });
  await step('trust', 'Pulls in an inbox note and redacts it first', () => { const raw = INBOX[p.tasks] || [{ source: 'Email', text: 'Following up on ' + short(g().seed, 40) + '. Call me on 555-0147 or write to sam.reyes@example.com.', at: '09:00' }], red = TR.redactItems(raw), items = Array.isArray(red) ? red : red.items, left = items.map(x => x.text).join(' '); if (/\d{3}[-.\s]\d{4}|[\w.+-]+@[\w-]+\.\w/.test(left)) throw new Error('personal details got through redaction: "' + short(left, 120) + '"'); const added = E.ingest(g(), items, {}), chain = TR.verifyChain(); return 'redacted: "' + short(items[0].text, 120) + '"\ningested ' + (added && added.length != null ? added.length : 'the note') + ' · no phone number, email or record id left · audit chain ' + (chain && chain.ok === false ? 'BROKEN' : 'intact'); }, { budget: 600 });
  await step('reason', 'Tidies the wording of five thoughts (offline)', async () => { const L = g().nodes.filter(n => !n.root).slice(-5), out = []; for (const n of L) { const r = await RW.rewrite(g(), n.id, { live: false }); if (r && r.changed) out.push('"' + short(n.label, 34) + '" → "' + short(r.label, 34) + '"'); } return out.length ? out.join('\n') : 'all five already read cleanly'; }, { budget: 800 });
  await step('views', 'Draws every view at full size', () => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 560; const res = drawViews(g(), () => cv, state.sel), bad = res.filter(r => r.error), slow = res.filter(r => r.ms > 200).sort((a, b) => b.ms - a.ms), total = res.reduce((s, r) => s + r.ms, 0); if (bad.length) throw new Error('these views threw: ' + bad.map(r => r.name + ' (' + r.error + ')').join(', ')); const worst = res.slice().sort((a, b) => b.ms - a.ms).slice(0, 3); return res.length + ' canvas views drew ' + g().nodes.length + ' thoughts · slowest: ' + worst.map(r => r.name + ' ' + r.ms.toFixed(0) + ' ms').join(', ') + (slow.length ? '\nover 200 ms a frame: ' + slow.map(r => r.name).join(', ') : '\nevery view under 200 ms a frame'); }, { budget: 6000 });
  await step('save', 'Saves and reopens: nothing lost', () => { const G = g(), keep = protectedIds(G), d = E.serialize(G), js = JSON.stringify(d), g2 = E.restore(JSON.parse(js)), lost = [...keep].filter(x => !g2.byId.has(x)); if (g2.nodes.length !== G.nodes.length) throw new Error('reopened with ' + g2.nodes.length + ' thoughts, saved ' + G.nodes.length + (lost.length ? '; lost "' + short(G.byId.get(lost[0]).label, 40) + '"' : '')); if (g2.edges.length !== G.edges.length) throw new Error('reopened with ' + g2.edges.length + ' links, saved ' + G.edges.length); return Math.round(js.length / 1024) + ' KB · ' + g2.nodes.length + ' thoughts and ' + g2.edges.length + ' links back, every label intact'; }, { budget: 1200 });
  await step('docs', 'Drafts the five documents from the map and keeps a note', async () => {
    const D = await import('./mega-docs.js'), G = g(), ctx = { name: p.name, searches: [{ id: 'lab', at: Date.now(), kind: 'map', query: short(G.seed, 24), n: 1, results: [{ title: G.nodes[1].label, nodeId: G.nodes[1].id, sub: 'facts' }] }] };
    const t0 = performance.now(), parts = D.SCOPES.map(sc => { const md = D.live(G, sc.live, ctx); if (md.length < 60) throw new Error(sc.title + ' came out empty'); const r = D.render(md, { byLabel: D.labelIndex(G) }); if (r.html.indexOf('<h1') < 0) throw new Error(sc.title + ' has no title'); return sc.title + ' ' + (Math.round(md.length / 102.4) / 10) + ' KB'; }), ms = Math.round(performance.now() - t0);
    if (D.live(G, 'live:topic', ctx).indexOf(G.seed) < 0) throw new Error('the brief does not name the question');
    const topic = 'lab-' + p.id + '-' + Date.now(), n = await D.saveNote(topic, { title: 'Lab note', body: '# Lab\n[[' + G.nodes[1].label + ']]', scope: 'source', about: '1' }), back = await D.getNote(n.id); await D.removeNote(n.id);
    if (!back || back.body.indexOf('[[') < 0) throw new Error('the note did not come back'); return parts.join(' · ') + ' · ' + ms + ' ms · a note was written, read back and deleted';
  }, { budget: 4000 });
  await step('save', 'Exports Markdown', () => { const md = E.exportMarkdown(g()); return Math.round(md.length / 1024) + ' KB of Markdown, ' + md.split('\n').length + ' lines'; }, { budget: 1500 });

  }
  // ── live AI and network ──
  for (const t of NET[p.tasks] || []) await step('net', t[0], () => call(t[1], t[2]), { net: true, budget: 15000 });
  await step('ai', (p.model === 'sonnet' ? 'Sonnet' : 'Haiku') + ' agent answers, with self-repair: ' + short(p.goal, 70), async () => {
    const L0 = { ...kit.S.ledger }, ex = K.expectation(p, g()), e0 = g().edges.length, ag = { id: 'test-' + p.id, name: p.name.split(',')[0] + ' agent', model: p.model, color: p.c, maxSteps: 8, packs: ['graph', 'terminal', 'brain'], directive: 'You help ' + p.name + '.' };
    let ok = 0; const auto = setInterval(() => { for (const a of kit.S.approvals.slice()) { ok++; a.res(true); } }, 60);
    const judge = { size: () => g().nodes.length, added: n0 => g().nodes.slice(n0), meets: K.meets, expect: ex, kid: p.id === 'kid-dragons' };
    let r; try { r = await DS.answer(kit, ag, p.goal, judge, { retries: opts.retries ?? 2 }); } finally { clearInterval(auto); }
    const calls = (kit.S.ledger.haiku - L0.haiku) + ' Haiku and ' + (kit.S.ledger.sonnet - L0.sonnet) + ' Sonnet calls' + (ok ? ' · ' + ok + ' sandbox run' + (ok === 1 ? '' : 's') + ' approved' : ''), log = r.tries.map(x => 'attempt ' + x.attempt + ': ' + (x.ok ? 'passed' : 'failed ' + x.failed) + ' · ' + (x.steps || 'no tools')).join('\n');
    if (!r.ok) { const err = new Error('failed all ' + r.tries.length + ' attempts (last check: ' + r.failed + ')\n' + log + '\n' + calls + ' · last answer: ' + short(r.fin, 200)); err.dspy = { q: p.goal, failed: r.failed, steps: r.tries[r.tries.length - 1].steps }; throw err; }
    return short(r.fin, 360) + '\n✓ ' + (ex ? 'matches the known answer (' + exText(ex) + ')' : 'safe for a six-year-old') + (r.tries.length > 1 ? ' after repairing itself' : '') + '\n' + log + '\n' + calls + ' · +' + r.added.length + ' thoughts, +' + (g().edges.length - e0) + ' links';
  }, { live: true, budget: 400000 });
  await step('ai', 'Live expansion of the selected thought', async () => { const target = state.sel || g().nodes[0].id, n0 = g().nodes.length, added = await E.expand(g(), target, E.pickModule(40).id, { live: true, wild: 40 }); const viaAI = g().trace.slice(-12).some(t => /CLAUDE/.test(t.text || t.msg || '')); return '+' + (g().nodes.length - n0) + ' thoughts' + (viaAI ? ' from Claude' : ' (fell back to the offline engine)') + (added[0] ? ': "' + short(added[0].label, 80) + '"' : ''); }, { live: true, budget: 60000 });

  // ── keep it so it can be opened and continued ──
  const pass = rows.filter(r => r.verdict === 'pass').length, bad = rows.filter(r => r.verdict === 'fail').length, slow = rows.filter(r => r.verdict === 'slow').length;
  await step('save', 'Keeps the session so it can be opened in the app', async () => { const G = g(), sid = await M.saveSession({ id: 'test-' + p.id, mode: p.mode, name: p.name, who: p.who, note: 'Simulated session', brain: kit.S.brain, vfs: kit.S.vfs, chat: kit.S.chat, logs: kit.S.logs, counts: pass + ' passed' + (slow ? ', ' + slow + ' slow' : '') + (bad ? ', ' + bad + ' failed' : '') }, E.serialize(G)); const s = kit.S.sessions.find(x => x.id === sid); return 'saved as "' + p.name + '" · ' + (s ? s.kb + ' KB in ' + (s.where === 'idb' ? 'IndexedDB' : 'local storage') : ''); }, { budget: 3000 });
  return { rows, g: state.g };
}

// Person-specific work: [area, what they do, fn, {budget, said, net}]
const js = code => ({ call }) => call('js_run', { code });
const TASKS = {
  child: [
    ['graph', 'Presses Shake again and again', async ({ g }) => { const t0 = performance.now(); let k = 0; while (g().nodes.length < 520 && k < 18) { await SH.shake(g(), { count: 40, wild: 85, links: 1.2 }); k++; } return k + ' shakes · ' + g().nodes.length + ' thoughts, ' + g().edges.length + ' links · ' + Math.round((performance.now() - t0) / k) + ' ms a shake'; }, { budget: 30000, said: 'Again! Again!' }],
    ['graph', 'Adds her own dragon and links it', async ({ g, call, state }) => { const r = await call('node_add', { label: 'A dragon who never sleeps', detail: 'Mina typed this.', plane: 'wild', grounding: 0.1 }); state.mina = r.replace('added ', ''); await call('edge_add', { a: state.mina, b: g().nodes[0].id, relation: 'resembles' }); return r + ', linked to the seed'; }, { said: 'Put my dragon in!' }],
    ['graph', 'Taps it and the map grows it', async ({ g, call, state }) => { const n0 = g().nodes.length; await call('node_expand', { id: state.mina }); return 'grew by ' + (g().nodes.length - n0) + ' thoughts'; }],
    ['graph', 'Deletes one by accident, and an undo point is kept', async ({ g, call, state }) => { const n0 = g().nodes.length, m0 = state.marks; await call('node_delete', { id: state.mina }); if (g().nodes.length !== n0 - 1) throw new Error('nothing was deleted'); if (state.marks <= m0) throw new Error('no undo point was taken'); return 'deleted; undo point recorded first'; }],
    ['graph', 'The seed refuses to be deleted', async ({ g, call }) => { try { await call('node_delete', { id: g().nodes[0].id }); } catch (e) { if (/cannot be deleted/.test(e.message)) return 'refused: ' + e.message; throw e; } throw new Error('it let her delete the seed'); }],
  ],
  novelist: [
    ['graph', 'Finds the scenes that echo the handwriting motif', async ({ g, id }) => { const m = id('handwriting she does not recognise'), n = g().edges.filter(e => e.b === m && e.relation === 'echoes').length; return n + ' scenes echo it (she planned one per act, so this is ' + (n > 6 ? 'far too many' : 'about right') + ')'; }],
    ['term', 'Continuity check: who vanishes for more than 8 chapters', js(`const by = new Map(map.nodes.map(n => [n.id, n])), ch = n => +n.label.match(/^Ch (\\d+)/)[1], cast = new Map();
for (const e of map.edges) if (e.relation === 'features') { const s = by.get(e.a), c = by.get(e.b); if (!s || !c || !/^Ch \\d+/.test(s.label)) continue; (cast.get(c.label) || cast.set(c.label, new Set()).get(c.label)).add(ch(s)); }
const gaps = []; for (const [name, chs] of cast) { const a = [...chs].sort((x, y) => x - y); let worst = 0, at = 0; for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > worst) { worst = a[i] - a[i - 1]; at = a[i - 1]; } if (worst > 8) gaps.push(name + ' is off stage after chapter ' + at + ' for ' + worst + ' chapters'); }
log(cast.size + ' characters appear across ' + map.nodes.filter(n => /^Ch \\d+ · Sc/.test(n.label)).length + ' scenes'); log(gaps.length ? gaps.slice(0, 5).join('\\n') : 'nobody disappears for more than 8 chapters');`), { budget: 4000 }],
    ['patterns', 'Saves chapter 7 as a scene-and-beat pattern', ({ call, id }) => call('pattern_save', { name: 'chapter-shape', description: 'Scenes with three beats each', root: id('Chapter 7') })],
    ['patterns', 'Reuses it for a new subplot chapter', async ({ g, call, id }) => { const r = await call('node_add', { label: 'Chapter 31 (Anneli\'s crossing)', detail: 'New subplot chapter', parent: id('Act III') }), n0 = g().nodes.length, a = await call('pattern_apply', { name: 'chapter-shape', under: r.replace('added ', '') }); return a + ' · map ' + n0 + ' → ' + g().nodes.length; }],
    ['brain', 'Leaves herself a rule about the motif', async ({ call, id }) => call('brain_remember', { text: 'Handwriting motif: once per act, never explained. Cut the extra echoes in act II.', refs: [id('handwriting she does not recognise')] })],
    ['views', 'Reads the book as a timeline', async ({ call, state }) => { await call('view_set', { view: 'timeline' }); return 'view: ' + state.view; }],
  ],
  law: [
    ['term', 'Builds a claim chart for claim 1 in the sandbox', js(`const by = new Map(map.nodes.map(n => [n.id, n])), need = new Set(map.nodes.filter(n => /^Claim 1 element: /.test(n.label)).map(n => n.id)), cover = new Map();
for (const e of map.edges) if (e.relation === 'discloses' && need.has(e.b)) { const p = by.get(e.a); if (!p || !/^A\\d{3} ¶/.test(p.label)) continue; (cover.get(p.parent) || cover.set(p.parent, new Set()).get(p.parent)).add(e.b); }
const full = [...cover].filter(([r, s]) => s.size === need.size).map(([r]) => by.get(r).label.slice(0, 9)), refs = [...cover.keys()]; let pairs = 0;
for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) { const u = new Set([...cover.get(refs[i]), ...cover.get(refs[j])]); if (u.size === need.size) pairs++; }
log('claim 1 has ' + need.size + ' elements; ' + cover.size + ' of the references disclose at least one'); log('anticipation candidates (one reference, every element): ' + (full.join(', ') || 'none')); log('two-reference combinations that cover every element: ' + pairs);`), { budget: 4000 }],
    ['graph', 'Asks where a holding came from', ({ call, id }) => call('node_get', { id: id('KSR Int') }).then(s => s.slice(0, 420))],
    ['mcp', 'An agent tries to write a file: it stops and asks, and she says no', ({ approve }) => approve('Scout', 'fs_write', { path: '/work/claim-chart.md', content: 'draft' }, false)],
    ['files', 'Approves the claim-chart memo, then edits, moves and deletes it', async ({ call, approve }) => { await approve('Scout', 'fs_write', { path: '/work/claim-chart.md', content: '# Claim 1 chart\nA087 and A174 disclose every element.\nNew to PubChem is not a novelty opinion.\n' }); await call('fs_edit', { path: '/work/claim-chart.md', find: 'not a novelty opinion', replace: 'not a novelty or freedom-to-operate opinion' }); const hit = await call('fs_search', { query: 'freedom-to-operate' }); await call('fs_move', { from: '/work/claim-chart.md', to: '/work/memos/claim-chart.md' }); await call('fs_delete', { path: '/work/memos' }); return 'written, edited (' + hit.split('\n')[0] + '), moved, deleted'; }],
    ['mcp', 'Confirms /project cannot be written from the browser', ({ kit }) => { try { kit.fs.write('/project/github.md', 'x'); } catch (e) { if (/read-only/.test(e.message)) return 'refused: ' + e.message; throw e; } throw new Error('it wrote into the project'); }],
    ['chat', 'Checks the log kept the whole trail', ({ kit }) => { const l = kit.S.logs.filter(x => x.k === 'tool' || x.k === 'sys').slice(-5); if (l.length < 4) throw new Error('the log is missing steps'); return l.map(x => x.t + '  ' + String(x.text).split('\n')[0].slice(0, 90)).join('\n'); }],
  ],
  surgeon: [
    ['term', 'Complication rate by fatigue band, from her case log', js(`const by = new Map(map.nodes.map(n => [n.id, n])), band = new Map(), out = new Map(), rows = {};
for (const e of map.edges) { if (e.relation === 'in band') band.set(e.a, by.get(e.b).label); if (e.relation === 'ended in') out.set(e.a, by.get(e.b).label); }
for (const [c, b] of band) { const r = rows[b] = rows[b] || { n: 0, k: 0 }; r.n++; if (!/^No complication/.test(out.get(c) || '')) r.k++; }
for (const b of ['Under 8 h awake', '8 to 16 h awake', '16 to 24 h awake', 'Over 24 h awake']) { const r = rows[b] || { n: 0, k: 0 }; log(b + ': ' + r.n + ' cases, ' + (r.n ? (r.k / r.n * 100).toFixed(1) : 0) + '% with any complication'); }
log('(simulated log: the gradient is built into the test data, so this tests the tool, not the medicine)');`), { budget: 4000 }],
    ['term', 'Night starts versus day starts', js(`let n = 0, d = 0, nk = 0, dk = 0; for (const x of map.nodes) { const m = x.label.match(/^Case \\d+ · .* · (\\d\\d):\\d\\d · /); if (!m) continue; const night = +m[1] >= 22 || +m[1] < 7, bad = !/no complication/.test(x.detail); if (night) { n++; if (bad) nk++; } else { d++; if (bad) dk++; } } log('night starts: ' + n + ' (' + (nk / Math.max(1, n) * 100).toFixed(1) + '% complications)'); log('day starts: ' + d + ' (' + (dk / Math.max(1, d) * 100).toFixed(1) + '%)');`), { budget: 4000 }],
    ['brain', 'Writes the finding into the brain, pointing at the bands', ({ call, id }) => call('brain_remember', { text: 'In my log the share of cases with any complication rises with hours awake; check against the literature before acting on it.', refs: [id('16 to 24 h awake'), id('Over 24 h awake')] })],
    ['patterns', 'Saves her measures checklist and reuses it for the next audit', async ({ g, call, id }) => { await call('pattern_save', { name: 'fatigue-measures', description: 'Measures to collect in a fatigue audit', root: id('Measures') }); const r = await call('node_add', { label: 'Next audit: night cases 2026', detail: 'Planned audit' }), n0 = g().nodes.length, a = await call('pattern_apply', { name: 'fatigue-measures', under: r.replace('added ', '') }); return a + ' · ' + n0 + ' → ' + g().nodes.length; }],
  ],
  journalist: [
    ['term', 'Ranks overtime growth across 66 divisions', js(`const rows = map.nodes.filter(n => n.label === 'Overtime').map(n => { const m = n.detail.match(/^(.*?) · (.*?) · Overtime\\..*\\(([+-]?\\d+)% a year\\)/); return m ? { d: m[1], v: m[2], g: +m[3] } : null; }).filter(Boolean).sort((a, b) => b.g - a.g);
log(rows.length + ' overtime line items'); for (const r of rows.slice(0, 5)) log(r.v + ': ' + (r.g >= 0 ? '+' : '') + r.g + '% a year');`), { budget: 4000 }],
    ['term', 'Lists the claims the budget contradicts', js(`const by = new Map(map.nodes.map(n => [n.id, n])), bad = map.edges.filter(e => e.relation === 'contradicts' && /^Claim \\d+:/.test((by.get(e.a) || {}).label || ''));
log(bad.length + ' of 45 claims are contradicted by their own line item'); for (const e of bad.slice(0, 3)) log(by.get(e.a).label.slice(0, 80) + '  ✗  ' + by.get(e.b).detail.slice(0, 70));`), { budget: 4000 }],
    ['save', '"Overtime" under Police and under Fire stay separate through sleep and reopening', ({ g }) => { const count = G => G.nodes.filter(n => n.label === 'Overtime').length, a = count(g()); E.sleep(g(), { wild: 30 }); const b = count(g()), c = count(E.restore(JSON.parse(JSON.stringify(E.serialize(g()))))); if (b !== a || c !== a) throw new Error('"Overtime" line items: ' + a + ' before, ' + b + ' after sleep, ' + c + ' after reopening'); return a + ' separate "Overtime" line items before, after sleep and after reopening'; }],
    ['learn', 'Lets the map find its own clusters', ({ g }) => { const lv = LR.louvain(g()), by = new Map(); for (const n of g().nodes) if (n.comm != null) (by.get(n.comm) || by.set(n.comm, []).get(n.comm)).push(n); const top = [...by.values()].sort((a, b) => b.length - a.length).slice(0, 4).map(a => a.slice().sort((x, y) => y.deg - x.deg)[0].label + ' (' + a.length + ')'); return lv.count + ' communities, modularity ' + lv.q + ' · biggest: ' + top.join('; '); }],
    ['views', 'Reads the cross-links in the chord view', async ({ call, state }) => { await call('view_set', { view: 'chord' }); return 'view: ' + state.view; }],
  ],
  teacher: [
    ['term', 'Finds the most common misconception in each class', js(`const by = new Map(map.nodes.map(n => [n.id, n])), per = {};
for (const e of map.edges) if (e.relation === 'shows') { const r = by.get(e.a), m = by.get(e.b); const p = r.label.split('-')[0]; (per[p] = per[p] || {})[m.label] = (per[p][m.label] || 0) + 1; }
for (const p of Object.keys(per).sort()) { const t = Object.entries(per[p]).sort((a, b) => b[1] - a[1])[0]; log('Period ' + p.slice(1) + ': "' + t[0] + '" (' + t[1] + ' answers)'); }`), { budget: 4000 }],
    ['term', 'Searches the unit from the terminal', async ({ kit }) => '$ graph search oxygen\n' + (await kit.term('graph search oxygen')).split('\n').slice(0, 4).join('\n')],
    ['term', 'Measures the longest prerequisite chain', js(`const dep = new Map(); for (const e of map.edges) if (e.relation === 'depends on') (dep.get(e.a) || dep.set(e.a, []).get(e.a)).push(e.b); const memo = new Map(), by = new Map(map.nodes.map(n => [n.id, n]));
const deep = id => { if (memo.has(id)) return memo.get(id); memo.set(id, [id]); let best = []; for (const d of dep.get(id) || []) { const p = deep(d); if (p.length > best.length) best = p; } const r = [id, ...best]; memo.set(id, r); return r; };
let top = []; for (const id of dep.keys()) { const p = deep(id); if (p.length > top.length) top = p; } log('longest chain: ' + top.length + ' concepts'); log(top.map(id => by.get(id).label).reverse().join(' → '));`), { budget: 4000 }],
    ['files', 'An agent writes the reteach plan and she approves it', ({ approve }) => approve('Builder', 'fs_write', { path: '/work/reteach-oxygen.md', content: '# Reteach: where the oxygen comes from\n1. Elodea in light, then in the dark\n2. Water, not CO2, is split\n3. Exit ticket\n' })],
    ['views', 'Shows the class the ego view around photolysis', async ({ call, id, state }) => { state.sel = id('Photolysis of water'); await call('view_set', { view: 'ego' }); return 'centred on Photolysis of water'; }],
    ['patterns', 'Saves the activities for next year', ({ call, id }) => call('pattern_save', { name: 'photosynthesis-activities', description: 'Labs and discussions for the unit', root: id('Activities') })],
  ],
  baker: [
    ['term', 'Finds the critical path to the grand opening', js(`const by = new Map(map.nodes.map(n => [n.id, n])), dur = id => +((by.get(id).detail.match(/Estimate (\\d+) days/) || [0, 0])[1]), dep = new Map();
for (const e of map.edges) if (e.relation === 'depends on') (dep.get(e.a) || dep.set(e.a, []).get(e.a)).push(e.b);
const memo = new Map(), fin = id => { if (memo.has(id)) return memo.get(id); let b = { t: 0, p: [] }; for (const d of dep.get(id) || []) { const f = fin(d); if (f.t > b.t) b = f; } const r = { t: b.t + dur(id), p: [...b.p, id] }; memo.set(id, r); return r; };
const end = map.nodes.find(n => n.label === 'Grand opening'), r = fin(end.id); log('critical path: ' + r.t + ' working days, ' + r.p.length + ' tasks'); log(r.p.map(id => by.get(id).label).join(' → '));`), { budget: 4000 }],
    ['term', 'Top sellers over 24 weeks', js(`const t = {}; for (const n of map.nodes) { const m = n.label.match(/^Week \\d+ · (.+): (\\d+) sold$/); if (m) t[m[1]] = (t[m[1]] || 0) + +m[2]; } const top = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5); log(Object.keys(t).length + ' products tracked'); for (const [k, v] of top) log(k + ': ' + v.toLocaleString() + ' sold');`), { budget: 4000 }],
    ['brain', 'Puts the plan into the brain', ({ call }) => call('brain_plan', { goal: 'Open shop two by spring', steps: ['Sign the lease', 'Architect drawings', 'Building permit', 'Build-out', 'Final inspection', 'Soft opening'] })],
    ['files', 'Approves an agent saving the plan as a file', ({ approve }) => approve('Planner', 'fs_write', { path: '/work/shop-two-plan.md', content: '# Shop two\nCritical path runs through the lease, drawings, permit and build-out.\n' })],
    ['patterns', 'Saves the opening plan as a pattern for shop three', ({ call, id }) => call('pattern_save', { name: 'new-location', description: 'Lease, permits, build-out, hiring, opening', root: id('Opening plan') })],
    ['views', 'Reads it as a timeline', async ({ call, state }) => { await call('view_set', { view: 'timeline' }); return 'view: ' + state.view; }],
  ],
  grad: [
    ['term', 'Counts the library and its matched pairs', js(`const by = {}; let pairs = 0; for (const n of map.nodes) { const m = n.label.match(/^(S\\d) · /); if (m) by[m[1]] = (by[m[1]] || 0) + 1; } for (const e of map.edges) if (/^matched pair/.test(e.relation)) pairs++; log(Object.entries(by).map(([k, v]) => k + ': ' + v).join(', ')); log(pairs + ' matched-pair links');`), { budget: 4000 }],
    ['term', 'Checks the sandbox is sealed', ({ call }) => call('js_run', { code: 'log(typeof fetch, typeof localStorage, typeof document, typeof XMLHttpRequest);' }).then(s => { if (/function/.test(s.split('\n')[0])) throw new Error('fetch was reachable: ' + s); return s + ' → no network, no storage, no page'; })],
    ['tools', 'Writes a tool that flags compounds over 22 heavy atoms, then runs it on all 1,024', async ({ call }) => { await call('tool_create', { name: 'heavy_atoms', desc: 'Compounds above a heavy-atom count', code: `const lim = (args && args.over) || 22; const hits = map.nodes.filter(n => { const m = /Heavy atoms (\\d+)/.exec(n.detail); return m && +m[1] > lim; }); log(hits.length + ' compounds over ' + lim + ' heavy atoms'); log(hits.slice(0, 3).map(n => n.label).join('\\n'));` }); return await call('custom_heavy_atoms', { over: 22 }); }],
  ],
};
const NET = {
  child: [['Looks up dragons on Wikipedia', 'wikipedia_search', { query: 'dragon folklore' }]],
  novelist: [['Checks lighthouse history on Wikipedia', 'wikipedia_search', { query: 'lighthouse keeper history' }]],
  law: [['Looks up KSR v. Teleflex on Crossref', 'crossref_search', { query: 'KSR Teleflex obviousness' }]],
  surgeon: [['Searches Europe PMC', 'europepmc_search', { query: 'sleep deprivation surgeons complications' }], ['Cross-checks in PubMed', 'pubmed_search', { query: 'sleep deprivation surgical outcomes', k: 3 }]],
  journalist: [['Background from Wikipedia', 'wikipedia_search', { query: 'municipal budget overtime' }], ['Research on Crossref', 'crossref_search', { query: 'police overtime municipal budget' }]],
  teacher: [['Finds research on the misconception', 'europepmc_search', { query: 'photosynthesis misconceptions students' }]],
  baker: [['Checks bakery licensing background', 'wikipedia_search', { query: 'food safety permit restaurant' }]],
  grad: [['Grades the parent compound with RDKit', 'rdkit_grade', { smiles: 'Cc1ccc(Cl)cc1C(=O)N' }], ['Looks up benzamide in PubChem', 'pubchem_lookup', { name: 'benzamide' }]],
};
