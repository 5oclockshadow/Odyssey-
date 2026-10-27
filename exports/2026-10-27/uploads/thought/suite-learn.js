// Learning for the suite: Hebbian plasticity on links and a Q-table over moves.
// Hebbian: links between thoughts that are active together get stronger (classic, Oja or BCM rule).
// Q-learning: each move (an expansion module, or a research source) is scored per kind of thought;
// rewards arrive later, from what happened to the thoughts it made (kept, linked, grounded, deleted).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function learnState(g) {
  g.learn = g.learn || {};
  const L = g.learn;
  L.q = L.q || {}; L.n = L.n || {}; L.names = L.names || {}; L.pending = L.pending || []; L.co = L.co || {};
  L.updates = L.updates || 0; L.rewardSum = L.rewardSum || 0; L.rewardN = L.rewardN || 0;
  L.hebb = L.hebb || { ticks: 0, updates: 0, wired: 0, rule: '' };
  return L;
}

export function stateOf(g, n, E) {
  if (!n) return 'none';
  let depth = 0; try { depth = E.depthOf(g, n); } catch (e) {}
  const deg = n.deg || 0, gr = n.g ?? 0.5;
  return [n.plane || 'concepts', 'd' + Math.min(depth, 4), deg < 2 ? 'leaf' : deg < 6 ? 'mid' : 'hub', gr < 0.35 ? 'weak' : gr < 0.7 ? 'some' : 'firm'].join('|');
}
const qOf = (L, s, a) => (L.q[s] && L.q[s][a]) || 0;
const nOf = (L, s, a) => (L.n[s] && L.n[s][a]) || 0;
const maxQ = (L, s) => { const r = L.q[s]; if (!r) return 0; let m = -Infinity; for (const v of Object.values(r)) m = Math.max(m, v); return m === -Infinity ? 0 : m; };

// ε-greedy with a UCB bonus, over candidates the app's own temperament proposes.
const coarse = s => String(s).split('|')[0];
const qBack = (L, s, a) => nOf(L, s, a) ? qOf(L, s, a) : ((L.qc && L.qc[coarse(s)] && L.qc[coarse(s)][a]) || 0) * 0.6; // an untried move borrows what it earned on this plane in general
export function chooseAction(g, s, candidates, cfg) {
  const L = learnState(g); if (!candidates.length) return null;
  if (Math.random() < (cfg.eps ?? 0.15)) return { key: candidates[Math.floor(Math.random() * candidates.length)], why: 'explore' };
  const total = candidates.reduce((t, a) => t + nOf(L, s, a), 0) + 1;
  let best = null, bv = -Infinity;
  for (const a of candidates) { const v = qBack(L, s, a) + (cfg.ucb ?? 0.35) * Math.sqrt(Math.log(total + 1) / (nOf(L, s, a) + 1)); if (v > bv) { bv = v; best = a; } }
  return { key: best, why: nOf(L, s, best) ? 'learned' : 'untried' };
}

// Pick an expansion module for a target thought. Sampling E.pickModule keeps each app's temperament.
export function pickModule(g, target, cfg, E) {
  const s = stateOf(g, target, E), byId = new Map();
  for (let i = 0; i < 6; i++) { const m = E.pickModule(cfg.wild ?? 40); if (m) byId.set(String(m.id), m); }
  const L = learnState(g);
  for (const k of Object.keys(L.q[s] || {})) if (!byId.has(k) && L.mods && L.mods[k]) byId.set(k, L.mods[k]); // moves that paid off here before stay in the running
  const c = chooseAction(g, s, [...byId.keys()], cfg); if (!c) return null;
  const m = byId.get(c.key); L.last = { s, a: c.key, why: c.why, name: m.type }; return m;
}

export function record(g, target, actionKey, name, ids, E, mod) {
  const L = learnState(g), s = stateOf(g, target, E);
  L.names[actionKey] = name; if (mod) { L.mods = L.mods || {}; L.mods[actionKey] = { id: mod.id, type: mod.type }; }
  L.pending.push({ s, a: String(actionKey), ids: (ids || []).slice(0, 6), step: g.step || 0, at: Date.now(), r0: ids && ids.length ? 0 : -0.3 });
  if (L.pending.length > 200) L.pending.splice(0, L.pending.length - 200);
}

// Score what a move's thoughts became. Deleted thoughts count as rejected.
function outcome(g, ids) {
  if (!ids.length) return -0.3;
  let t = 0;
  for (const id of ids) {
    const n = g.byId.get(id);
    if (!n) { t -= 0.4; continue; }
    t += (g.comms && g.comms.length > 1 && isBridge(g, n) ? 0.12 : 0) + 0.15 + 0.45 * (n.g ?? 0.5) + 0.1 * Math.min(3, Math.max(0, (n.deg || 1) - 1)) + (n.recalls ? 0.25 : 0) + ((n.evidence || []).length ? 0.2 : 0) - (n.refuted ? 0.6 : 0);
  }
  return clamp(t / ids.length, -1, 1.5);
}

function bumpCoarse(L, s, a, r, cfg) { L.qc = L.qc || {}; const c = coarse(s), row = L.qc[c] = L.qc[c] || {}; row[a] = +((row[a] || 0) + (cfg.alpha ?? 0.3) * 0.5 * (r - (row[a] || 0))).toFixed(4); }
export function settle(g, cfg, E, force) {
  const L = learnState(g); let done = 0;
  const horizon = cfg.horizon ?? 4, now = Date.now();
  L.pending = L.pending.filter(p => {
    if (!force && (g.step || 0) - p.step < horizon && now - p.at < 45000) return true;
    const r = p.r0 + outcome(g, p.ids), alive = p.ids.map(id => g.byId.get(id)).find(Boolean), s2 = alive ? stateOf(g, alive, E) : p.s;
    L.q[p.s] = L.q[p.s] || {}; L.n[p.s] = L.n[p.s] || {};
    const q = qOf(L, p.s, p.a), a = cfg.alpha ?? 0.3, gm = cfg.gamma ?? 0.8;
    L.q[p.s][p.a] = +(q + a * (r + gm * maxQ(L, s2) - q)).toFixed(4); L.n[p.s][p.a] = nOf(L, p.s, p.a) + 1;
    bumpCoarse(L, p.s, p.a, r, cfg); L.updates++; L.rewardSum += r; L.rewardN++; done++;
    return false;
  });
  const keys = Object.keys(L.q); if (keys.length > 500) { const seen = k => Object.values(L.n[k] || {}).reduce((t, v) => t + v, 0); for (const k of keys.sort((x, y) => seen(x) - seen(y)).slice(0, keys.length - 500)) { delete L.q[k]; delete L.n[k]; } }
  return done;
}

// Reward a research action right away: evidence found and grounding gained.
export function rewardNow(g, s, a, r, s2, cfg, name) {
  const L = learnState(g); L.names[a] = name || a; L.q[s] = L.q[s] || {}; L.n[s] = L.n[s] || {};
  const q = qOf(L, s, a), al = cfg.alpha ?? 0.3, gm = cfg.gamma ?? 0.8;
  L.q[s][a] = +(q + al * (r + gm * maxQ(L, s2 || s) - q)).toFixed(4); L.n[s][a] = nOf(L, s, a) + 1; bumpCoarse(L, s, a, r, cfg); L.updates++; L.rewardSum += r; L.rewardN++;
}

// ── Louvain communities ──
// Groups thoughts that are linked more tightly to each other than chance would give, weighting links by their learned strength.
// Plasticity uses it (links inside a community learn faster, bridges keep a novelty bonus) and so does the reward for a move.
function pass(n, adj, k, m2) {
  const comm = Array.from({ length: n }, (_, i) => i), tot = k.slice(); let moved = false;
  for (let it = 0; it < 12; it++) {
    let any = false;
    for (let i = 0; i < n; i++) {
      const ci = comm[i], w = new Map(); for (const [j, x] of adj[i]) if (j !== i) w.set(comm[j], (w.get(comm[j]) || 0) + x);
      tot[ci] -= k[i]; let best = ci, bg = (w.get(ci) || 0) - tot[ci] * k[i] / m2;
      for (const [c, x] of w) { const gain = x - tot[c] * k[i] / m2; if (gain > bg + 1e-9) { bg = gain; best = c; } }
      tot[best] += k[i]; if (best !== ci) { comm[i] = best; any = moved = true; }
    }
    if (!any) break;
  }
  return { comm, moved };
}
export function louvain(g) {
  const nodes = g.nodes.filter(n => !n.dormant && !n.members), idx = new Map(nodes.map((n, i) => [n.id, i])), N = nodes.length;
  if (N < 3) { for (const n of g.nodes) n.comm = 0; g.comms = []; return { count: N ? 1 : 0, q: 0 }; }
  let adj = nodes.map(() => new Map()), m2 = 0;
  for (const e of g.edges) { const a = idx.get(e.a), b = idx.get(e.b); if (a == null || b == null || a === b) continue; const w = Math.max(0.02, e.weight ?? 0.5); adj[a].set(b, (adj[a].get(b) || 0) + w); adj[b].set(a, (adj[b].get(a) || 0) + w); m2 += 2 * w; }
  if (!m2) { nodes.forEach((n, i) => { n.comm = i; }); return { count: N, q: 0 }; }
  const adj0 = adj; let member = nodes.map((_, i) => i), size = N;
  for (let lvl = 0; lvl < 5; lvl++) {
    const k = adj.map(r => { let s = 0; for (const x of r.values()) s += x; return s; }), { comm, moved } = pass(size, adj, k, m2); if (!moved) break;
    const ids = [...new Set(comm)], re = new Map(ids.map((c, i) => [c, i])), na = ids.map(() => new Map());
    for (let i = 0; i < size; i++) for (const [j, x] of adj[i]) { const a = re.get(comm[i]), b = re.get(comm[j]); na[a].set(b, (na[a].get(b) || 0) + x); }
    member = member.map(c => re.get(comm[c])); adj = na; size = ids.length; if (size <= 1) break;
  }
  const kk = adj0.map(r => { let s = 0; for (const x of r.values()) s += x; return s; }), tot = new Map(), inn = new Map();
  member.forEach((c, i) => { tot.set(c, (tot.get(c) || 0) + kk[i]); for (const [j, x] of adj0[i]) if (member[j] === c) inn.set(c, (inn.get(c) || 0) + x); });
  let q = 0; for (const [c, t2] of tot) q += (inn.get(c) || 0) / m2 - (t2 / m2) * (t2 / m2);
  const csize = new Map(); for (const c of member) csize.set(c, (csize.get(c) || 0) + 1);
  const order = [...tot.keys()].sort((a, b) => (csize.get(b) || 0) - (csize.get(a) || 0)), rank = new Map(order.map((c, i) => [c, i]));
  nodes.forEach((n, i) => { n.comm = rank.get(member[i]); });
  g.comms = order.map((c, i) => ({ id: i, size: csize.get(c) || 0 }));
  g._louvAt = { n: N, e: g.edges.length };
  return { count: order.length, q: +q.toFixed(3) };
}
// A thought is a bridge when its links reach other communities.
export function isBridge(g, n) { if (n.comm == null) return false; for (const e of g.edges) { const o = e.a === n.id ? g.byId.get(e.b) : e.b === n.id ? g.byId.get(e.a) : null; if (o && o.comm != null && o.comm !== n.comm) return true; } return false; }

// ── Hebbian plasticity ──
// x, y are the activities of the two ends. Weights stay in [0.02, 1].
export function hebbStep(g, cfg, E) {
  const rule = cfg.rule || 'oja'; if (rule === 'off' || !g.nodes.length) return { changed: 0 };
  const L = learnState(g), H = L.hebb; H.ticks++; H.rule = rule;
  const eta = cfg.eta ?? 0.05, lam = cfg.decay ?? 0.002;
  if (!cfg.brainOn) for (const n of g.nodes) n.act = (n.act || 0) * 0.9; // activity fades on its own when the brain loop is not running
  for (const n of g.nodes) n.theta = (n.theta ?? 0.1) * 0.95 + 0.05 * (n.act || 0) * (n.act || 0); // BCM sliding threshold
  const stale = !g._louvAt || g._louvAt.n !== g.nodes.length || g._louvAt.e !== g.edges.length;
  if (stale && (H.ticks % 8 === 1 || !g._louvAt)) { try { const r = louvain(g); H.comms = r.count; H.mod = r.q; } catch (e) { /* keep the old grouping */ } }
  let changed = 0;
  for (const e of g.edges) {
    const a = g.byId.get(e.a), b = g.byId.get(e.b); if (!a || !b) continue;
    const x = a.act || 0, y = b.act || 0;
    if (x < 0.04 && y < 0.04) { const w0 = e.weight ?? 0.5; if (w0 > 0.12 && !e.manual) { e.weight = +(w0 - lam * 0.25 * (w0 - 0.1)).toFixed(4); changed++; } continue; } // unused links forget slowly toward a floor
    const cm = a.comm != null && a.comm === b.comm ? 1.25 : a.comm != null && b.comm != null ? 0.85 : 1;
    let w = e.weight ?? 0.5, d = 0;
    if (rule === 'hebb') d = eta * x * y - lam * w * (x + y > 0.04 ? 1 : 0.1);
    else if (rule === 'oja') d = 0.5 * eta * (y * (x - y * w) + x * (y - x * w));
    else if (rule === 'bcm') d = 0.5 * eta * (x * y * (y - (b.theta || 0.1)) + x * y * (x - (a.theta || 0.1)));
    d *= d > 0 ? cm : 1; if (Math.abs(d) < 1e-4) continue;
    e.weight = +clamp(w + d, 0.02, 1).toFixed(4); changed++;
  }
  H.updates += changed; if (changed) g._metrics = null;
  return { changed };
}

// Two thoughts used one after the other fire together. Repeated co-use wires a new link.
export function coFire(g, a, b, cfg, E) {
  if (!a || !b || a === b || !g.byId.has(a) || !g.byId.has(b) || (cfg.rule || 'oja') === 'off') return null;
  const L = learnState(g), eta = cfg.eta ?? 0.05;
  try { E.activate(g, a, 0.5); E.activate(g, b, 0.5); } catch (e) {}
  const ed = g.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (ed) { ed.weight = +clamp((ed.weight ?? 0.5) + eta * 2, 0.02, 1).toFixed(4); L.hebb.updates++; return { strengthened: ed }; }
  const k = a < b ? a + '|' + b : b + '|' + a; L.co[k] = (L.co[k] || 0) + 1;
  if (L.co[k] >= 3) { delete L.co[k]; const ne = E.link(g, a, b, 'relates to'); if (ne) { ne.weight = 0.3; ne.kind = 'synapse'; L.hebb.wired++; return { wired: ne }; } }
  return null;
}

export function summary(g, E, selNode) {
  const L = learnState(g), states = Object.keys(L.q).length;
  const s = selNode ? stateOf(g, selNode, E) : null, row = s && L.q[s] ? Object.entries(L.q[s]).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([a, v]) => ({ name: L.names[a] || a, q: v, n: nOf(L, s, a) })) : [];
  const best = []; for (const [st, r] of Object.entries(L.q)) for (const [a, v] of Object.entries(r)) best.push({ st, name: L.names[a] || a, q: v, n: nOf(L, st, a) });
  best.sort((x, y) => y.q - x.q);
  const ws = g.edges.map(e => e.weight ?? 0.5);
  return { states, updates: L.updates, avgReward: L.rewardN ? L.rewardSum / L.rewardN : 0, pending: L.pending.length, state: s, row, best: best.slice(0, 4), last: L.last || null, hebb: L.hebb, comms: (g.comms || []).length, modularity: L.hebb.mod || 0, meanW: ws.length ? ws.reduce((t, v) => t + v, 0) / ws.length : 0 };
}
