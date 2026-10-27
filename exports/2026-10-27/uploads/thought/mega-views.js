// 13 more canvas views for Mega Graph, bringing the total to 30. Same contract as suite-views.js:
// fill P (id -> {n,x,y,z,f,born}), draw guides, return flags (noEdges, noLabels, curve, rects).
import { hierarchy } from './suite-views.js';

const put = (P, o, n, x, y) => { const p = o.pos.get(n.id); P.set(n.id, { n, x, y, z: 0, f: 1, born: p ? p.born : 0 }); };
const rgb = (o, n) => (o.PL[o.DP(n)] || { rgb: '145,132,217' }).rgb;
const INK = 'rgba(233,233,237,';
const txt = (ctx, s, x, y, c = INK + '0.5)', al = 'left', f = '500 10px "IBM Plex Mono", monospace') => { ctx.font = f; ctx.fillStyle = c; ctx.textAlign = al; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); ctx.textAlign = 'left'; };
const fit = (ctx, t, w) => { if (w < 14) return ''; if (ctx.measureText(t).width <= w) return t; let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(t.slice(0, m) + '…').width <= w) lo = m; else hi = m - 1; } return lo > 1 ? t.slice(0, lo) + '…' : ''; };
const born = (o, N) => { const m = new Map(o.g.nodes.map((n, i) => [n.id, i])); return n => m.get(n.id) || 0; };
const center = o => ({ cx: o.W / 2 + o.cam.px, cy: o.H / 2 + o.cam.py });
const label = (n, k = 30) => String(n.label || '').length > k ? String(n.label).slice(0, k - 1) + '…' : String(n.label || '');

// Repulsion: exact up to 300 points; above that a grid with a cutoff keeps each frame near-linear.
function repelAll(PS, k, cut) {
  const rep = (a, b) => { let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 0.01; if (cut && d2 > cut * cut) return; const d = Math.sqrt(d2), f = k / d2; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; };
  if (PS.length <= 300 || !cut) { for (let i = 0; i < PS.length; i++) for (let j = i + 1; j < PS.length; j++) rep(PS[i], PS[j]); return; }
  const grid = new Map();
  for (const p of PS) { const cx = Math.floor(p.x / cut), cy = Math.floor(p.y / cut), key = cx + ',' + cy; let c = grid.get(key); if (!c) grid.set(key, c = { cx, cy, A: [] }); c.A.push(p); }
  for (const c of grid.values()) for (const [ox, oy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { const o = ox || oy ? grid.get((c.cx + ox) + ',' + (c.cy + oy)) : c; if (!o) continue; const A = c.A, B = o.A; for (let i = 0; i < A.length; i++) for (let j = o === c ? i + 1 : 0; j < B.length; j++) rep(A[i], B[j]); }
}
export function force(ctx, N, P, o) {
  const M = o.mem.force || (o.mem.force = { p: new Map() }), ids = new Set(N.map(n => n.id));
  for (const n of N) if (!M.p.has(n.id)) { const a = M.p.size * 2.4, r = 20 + M.p.size * 3; M.p.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }); }
  const E = o.g.edges.filter(e => ids.has(e.a) && ids.has(e.b));
  for (let it = 0; it < 2; it++) {
    const PS = N.map(n => M.p.get(n.id)); repelAll(PS, 900, N.length > 300 ? 140 : 0); for (const a of PS) { a.vx -= a.x * 0.004; a.vy -= a.y * 0.004; }
    for (const e of E) { const a = M.p.get(e.a), b = M.p.get(e.b), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 70) * 0.02 * (0.5 + (e.weight ?? 0.5)); a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; }
    for (const p of M.p.values()) { p.x += Math.max(-8, Math.min(8, p.vx)) * 0.5; p.y += Math.max(-8, Math.min(8, p.vy)) * 0.5; p.vx *= 0.6; p.vy *= 0.6; }
  }
  let R = 60; for (const n of N) { const p = M.p.get(n.id); R = Math.max(R, Math.abs(p.x), Math.abs(p.y)); }
  const { cx, cy } = center(o), s = Math.min(o.W, o.H) * 0.44 / R * o.cam.k;
  for (const n of N) { const p = M.p.get(n.id); put(P, o, n, cx + p.x * s, cy + p.y * s); }
  return { curve: () => 0.02 };
}

export function matrix(ctx, N, P, o) {
  const T = hierarchy(N), L = T.order.slice(0, 70), n = L.length || 1, top = 60, left = Math.min(260, o.W * 0.32), sz = Math.max(6, Math.min(26, Math.min(o.H - top - 24, o.W - left - 24) / n)) * o.cam.k, ox = left + o.cam.px, oy = top + o.cam.py, idx = new Map(L.map((x, i) => [x.id, i]));
  ctx.strokeStyle = INK + '0.05)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= n; i++) { ctx.moveTo(ox, oy + i * sz); ctx.lineTo(ox + n * sz, oy + i * sz); ctx.moveTo(ox + i * sz, oy); ctx.lineTo(ox + i * sz, oy + n * sz); } ctx.stroke();
  for (const e of o.g.edges) { const i = idx.get(e.a), j = idx.get(e.b); if (i == null || j == null) continue; const c = 'rgba(' + rgb(o, L[i]) + ',' + (0.35 + (e.weight ?? 0.5) * 0.5) + ')'; ctx.fillStyle = c; ctx.fillRect(ox + j * sz + 1, oy + i * sz + 1, sz - 2, sz - 2); ctx.fillRect(ox + i * sz + 1, oy + j * sz + 1, sz - 2, sz - 2); }
  ctx.font = '400 11px Inter, sans-serif'; L.forEach((x, i) => { put(P, o, x, ox - 8, oy + i * sz + sz / 2); const d = T.depth.get(x.id) || 0, t = fit(ctx, label(x, 60), left - 20 - d * 6); if (t && sz > 9) { ctx.fillStyle = INK + (x.id === o.sel ? '1)' : '0.7)'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(t, ox - 16, oy + i * sz + sz / 2); ctx.textAlign = 'left'; } });
  txt(ctx, 'ROW AND COLUMN = THOUGHT · CELL = LINK', ox, oy - 12);
  return { noEdges: true, noLabels: true };
}

export function chord(ctx, N, P, o) {
  const T = hierarchy(N), L = T.order, n = L.length || 1, { cx, cy } = center(o), R = Math.min(o.W, o.H) * 0.38 * o.cam.k, ang = new Map(L.map((x, i) => [x.id, -Math.PI / 2 + i / n * Math.PI * 2]));
  for (const x of L) put(P, o, x, cx + Math.cos(ang.get(x.id)) * R, cy + Math.sin(ang.get(x.id)) * R);
  for (const e of o.g.edges) { const A = P.get(e.a), B = P.get(e.b); if (!A || !B) continue; const on = o.sel && (e.a === o.sel || e.b === o.sel); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(cx + (A.x + B.x - 2 * cx) * 0.12, cy + (A.y + B.y - 2 * cy) * 0.12, B.x, B.y); ctx.strokeStyle = 'rgba(' + rgb(o, A.n) + ',' + (on ? 0.85 : (o.sel ? 0.05 : 0.14 + (e.weight ?? 0.5) * 0.2)) + ')'; ctx.lineWidth = on ? 1.8 : 1; ctx.stroke(); }
  return { noEdges: true };
}

export function sunburst(ctx, N, P, o) {
  const T = hierarchy(N), { cx, cy } = center(o), R = Math.min(o.W, o.H) * 0.46 * o.cam.k, ring = R / (T.maxD + 1.4), tot = T.roots.reduce((s, r) => s + T.leaves.get(r.id), 0) || 1, a0 = new Map();
  const rec = (n, s, sp) => { const d = T.depth.get(n.id) || 0, r0 = (d + 0.4) * ring, r1 = (d + 1.4) * ring; ctx.beginPath(); ctx.arc(cx, cy, r1, s, s + Math.max(0.002, sp - 0.006)); ctx.arc(cx, cy, r0, s + Math.max(0.002, sp - 0.006), s, true); ctx.closePath(); ctx.fillStyle = 'rgba(' + rgb(o, n) + ',' + (n.id === o.sel ? 0.55 : 0.2) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(22,24,38,0.9)'; ctx.lineWidth = 1; ctx.stroke(); const m = s + sp / 2, rm = (r0 + r1) / 2; put(P, o, n, cx + Math.cos(m) * rm, cy + Math.sin(m) * rm); let a = s; const ks = T.kids.get(n.id), kt = ks.reduce((q, c) => q + T.leaves.get(c.id), 0) || 1; for (const c of ks) { const w = sp * T.leaves.get(c.id) / kt; rec(c, a, w); a += w; } };
  let a = -Math.PI / 2; for (const r of T.roots) { const w = Math.PI * 2 * T.leaves.get(r.id) / tot; rec(r, a, w); a += w; }
  return { noEdges: true };
}

export function clusters(ctx, N, P, o) {
  const ids = o.PORDER.filter(p => !o.hidden[p]), k = Math.max(1, ids.length), { cx, cy } = center(o), R = Math.min(o.W, o.H) * 0.3 * o.cam.k, bn = born(o, N), gp = 7.5 * Math.min(1.6, o.cam.k);
  ids.forEach((pid, pi) => { const a = -Math.PI / 2 + pi / k * Math.PI * 2, px = k > 1 ? cx + Math.cos(a) * R : cx, py = k > 1 ? cy + Math.sin(a) * R : cy, mem = N.filter(n => o.DP(n) === pid).sort((x, y) => bn(x) - bn(y)), pl = o.PL[pid] || { rgb: '145,132,217', c: '#9184d9' }, rad = gp * Math.sqrt(mem.length + 1) * 1.9 + 14;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fillStyle = 'rgba(' + pl.rgb + ',0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(' + pl.rgb + ',0.25)'; ctx.stroke(); txt(ctx, ((o.PN[pid] || {}).label || pid).toUpperCase() + '  ' + mem.length, px, py - rad - 8, pl.c, 'center');
    mem.forEach((n, i) => { const r = gp * 1.9 * Math.sqrt(i + 0.5), t = i * 2.39996; put(P, o, n, px + Math.cos(t) * r, py + Math.sin(t) * r); }); });
  return { curve: () => 0.2 };
}

export function icicle(ctx, N, P, o) {
  const T = hierarchy(N), left = 20 + o.cam.px, top = 56 + o.cam.py, cw = Math.max(110, (o.W - 40) / (T.maxD + 1)) * o.cam.k, H = (o.H - 80) * o.cam.k, tot = T.roots.reduce((s, r) => s + T.leaves.get(r.id), 0) || 1, rects = [];
  ctx.font = '400 11px Inter, sans-serif';
  const rec = (n, y, h) => { const d = T.depth.get(n.id) || 0, x = left + d * cw; rects.push({ id: n.id, x, y, w: cw - 2, h: h - 1, depth: d }); ctx.fillStyle = 'rgba(' + rgb(o, n) + ',' + (n.id === o.sel ? 0.5 : 0.17) + ')'; ctx.fillRect(x, y, cw - 2, h - 1); ctx.strokeStyle = 'rgba(' + rgb(o, n) + ',0.4)'; ctx.strokeRect(x + 0.5, y + 0.5, cw - 3, h - 2); put(P, o, n, x + 8, y + Math.min(h / 2, 10)); if (h > 13) { ctx.fillStyle = INK + '0.85)'; ctx.textBaseline = 'middle'; ctx.fillText(fit(ctx, label(n, 80), cw - 22), x + 16, y + Math.min(h / 2, 10)); } let yy = y; const ks = T.kids.get(n.id), kt = ks.reduce((q, c) => q + T.leaves.get(c.id), 0) || 1; for (const c of ks) { const hh = h * T.leaves.get(c.id) / kt; rec(c, yy, hh); yy += hh; } };
  let y = top; for (const r of T.roots) { const h = H * T.leaves.get(r.id) / tot; rec(r, y, h); y += h; }
  return { noEdges: true, noLabels: true, rects };
}

export function timeline(ctx, N, P, o) {
  const T = hierarchy(N), bn = born(o, N), left = 50 + o.cam.px, top = 70 + o.cam.py, n = Math.max(1, o.g.nodes.length - 1), w = (o.W - 100) * o.cam.k, rh = Math.max(40, (o.H - 130) / (T.maxD + 1)) * o.cam.k;
  for (let d = 0; d <= T.maxD; d++) { ctx.beginPath(); ctx.moveTo(left, top + d * rh); ctx.lineTo(left + w, top + d * rh); ctx.strokeStyle = INK + '0.05)'; ctx.stroke(); txt(ctx, d ? 'DEPTH ' + d : 'SEED', left - 44, top + d * rh + 3); }
  for (const x of N) { const j = ((bn(x) * 7919) % 13) / 13 - 0.5; put(P, o, x, left + bn(x) / n * w, top + (T.depth.get(x.id) || 0) * rh + j * rh * 0.6); }
  txt(ctx, 'OLDEST', left, top - 22); txt(ctx, 'NEWEST', left + w, top - 22, INK + '0.5)', 'right');
  return { curve: () => 0.12 };
}

export function spiral(ctx, N, P, o) {
  const { cx, cy } = center(o), bn = born(o, N), c = Math.min(o.W, o.H) * 0.46 * o.cam.k / Math.sqrt(Math.max(8, o.g.nodes.length));
  for (const x of N) { const i = bn(x), r = c * Math.sqrt(i + 0.6), t = i * 2.39996; put(P, o, x, cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
  txt(ctx, 'SEED AT THE CENTRE · EACH NEW THOUGHT SPIRALS OUT', cx, o.H - 18, INK + '0.35)', 'center');
  return { curve: () => 0.15 };
}

export function board(ctx, N, P, o) {
  const ids = o.PORDER.filter(p => !o.hidden[p]), k = Math.max(1, ids.length), cw = (o.W - 40) / k * Math.min(1.4, o.cam.k), bn = born(o, N), left = 20 + o.cam.px, top = 72 + o.cam.py;
  ids.forEach((pid, i) => { const pl = o.PL[pid] || { rgb: '145,132,217', c: '#9184d9' }, mem = N.filter(n => o.DP(n) === pid).sort((a, b) => bn(a) - bn(b)), x = left + i * cw; ctx.fillStyle = 'rgba(' + pl.rgb + ',0.05)'; ctx.fillRect(x, top - 30, cw - 8, o.H); txt(ctx, ((o.PN[pid] || {}).label || pid).toUpperCase() + '  ' + mem.length, x + 10, top - 12, pl.c); mem.forEach((n, j) => put(P, o, n, x + 16, top + 10 + j * 28)); });
  return { noEdges: true };
}

export function heat(ctx, N, P, o) {
  const T = hierarchy(N), ids = o.PORDER.filter(p => !o.hidden[p]), cols = T.maxD + 1, left = 90 + o.cam.px, top = 70 + o.cam.py, cw = (o.W - 120) / cols * o.cam.k, rh = Math.max(46, (o.H - 110) / Math.max(1, ids.length)) * o.cam.k, cell = new Map();
  for (const n of N) { const key = o.DP(n) + '|' + (T.depth.get(n.id) || 0); (cell.get(key) || cell.set(key, []).get(key)).push(n); }
  let mx = 1; for (const v of cell.values()) mx = Math.max(mx, v.length);
  ids.forEach((pid, r) => { const pl = o.PL[pid] || { rgb: '145,132,217', c: '#9184d9' }; txt(ctx, ((o.PN[pid] || {}).label || pid).toUpperCase(), left - 10, top + r * rh + rh / 2, pl.c, 'right'); for (let d = 0; d < cols; d++) { const m = cell.get(pid + '|' + d) || [], x = left + d * cw, y = top + r * rh; ctx.fillStyle = 'rgba(' + pl.rgb + ',' + (m.length ? 0.06 + 0.3 * m.length / mx : 0.02) + ')'; ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4); const per = Math.max(1, Math.floor((cw - 16) / 16)); m.forEach((n, i) => put(P, o, n, x + 14 + (i % per) * 16, y + 14 + Math.floor(i / per) * 16)); } });
  for (let d = 0; d < cols; d++) txt(ctx, d ? 'DEPTH ' + d : 'SEED', left + d * cw + 6, top - 12);
  return { noEdges: true, noLabels: N.length > 60 };
}

export function orbit(ctx, N, P, o) {
  const { cx, cy } = center(o), deg = new Map(N.map(n => [n.id, 0])); for (const e of o.g.edges) { if (deg.has(e.a)) deg.set(e.a, deg.get(e.a) + 1); if (deg.has(e.b)) deg.set(e.b, deg.get(e.b) + 1); }
  const L = N.slice().sort((a, b) => deg.get(b.id) - deg.get(a.id)), rings = []; let i = 0, k = 0; while (i < L.length) { const cap = k === 0 ? 1 : k * 6; rings.push(L.slice(i, i + cap)); i += cap; k++; }
  const gap = Math.min(o.W, o.H) * 0.46 * o.cam.k / Math.max(1, rings.length - 0.4);
  rings.forEach((m, r) => { if (r) { ctx.beginPath(); ctx.arc(cx, cy, r * gap, 0, 7); ctx.strokeStyle = INK + '0.05)'; ctx.stroke(); } m.forEach((n, j) => { const a = -Math.PI / 2 + (j + (r % 2) * 0.5) / m.length * Math.PI * 2; put(P, o, n, cx + Math.cos(a) * r * gap, cy + Math.sin(a) * r * gap); }); });
  txt(ctx, 'MOST LINKED IN THE MIDDLE', cx, o.H - 18, INK + '0.35)', 'center');
  return { curve: () => 0.12 };
}

export function hex(ctx, N, P, o) {
  const bn = born(o, N), L = N.slice().sort((a, b) => o.PORDER.indexOf(o.DP(a)) - o.PORDER.indexOf(o.DP(b)) || bn(a) - bn(b)), cols = Math.max(3, Math.ceil(Math.sqrt(L.length * 1.4))), dx = Math.min(70, (o.W - 80) / (cols + 0.5)) * o.cam.k, dy = dx * 0.87, left = (o.W - cols * dx) / 2 + o.cam.px, top = 80 + o.cam.py;
  L.forEach((n, i) => { const c = i % cols, r = Math.floor(i / cols), x = left + (c + (r % 2) * 0.5) * dx, y = top + r * dy; ctx.beginPath(); for (let q = 0; q < 6; q++) { const a = Math.PI / 6 + q * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * dx * 0.55, y + Math.sin(a) * dx * 0.55); } ctx.closePath(); ctx.fillStyle = 'rgba(' + rgb(o, n) + ',0.1)'; ctx.fill(); ctx.strokeStyle = 'rgba(' + rgb(o, n) + ',0.3)'; ctx.stroke(); put(P, o, n, x, y); });
  return { noEdges: true, noLabels: N.length > 40 };
}

export function ego(ctx, N, P, o) {
  const { cx, cy } = center(o), ids = new Set(N.map(n => n.id)), adj = new Map(N.map(n => [n.id, []])); for (const e of o.g.edges) if (ids.has(e.a) && ids.has(e.b)) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
  const start = (o.sel && ids.has(o.sel) ? o.sel : (N.find(n => n.root) || N[0] || {}).id), ring = new Map([[start, 0]]), q = [start], par = new Map();
  for (let h = 0; h < q.length; h++) { const a = q[h]; for (const b of adj.get(a) || []) if (!ring.has(b)) { ring.set(b, ring.get(a) + 1); par.set(b, a); q.push(b); } }
  const far = Math.max(0, ...ring.values()) + 1, layers = []; for (const n of N) { const r = ring.has(n.id) ? ring.get(n.id) : far; (layers[r] = layers[r] || []).push(n); }
  const gap = Math.min(o.W, o.H) * 0.46 * o.cam.k / Math.max(1, layers.length - 0.5), A = new Map();
  layers.forEach((m, r) => { if (!m) return; m.sort((a, b) => (A.get(par.get(a.id)) ?? 0) - (A.get(par.get(b.id)) ?? 0)); if (r) { ctx.beginPath(); ctx.arc(cx, cy, r * gap, 0, 7); ctx.strokeStyle = INK + '0.05)'; ctx.stroke(); txt(ctx, r === far && !ring.has((m[0] || {}).id) ? 'UNLINKED' : r + (r === 1 ? ' HOP' : ' HOPS'), cx + 6, cy - r * gap - 4, INK + '0.3)'); } m.forEach((n, j) => { const a = r ? -Math.PI / 2 + (j + 0.5) / m.length * Math.PI * 2 : 0; A.set(n.id, a); put(P, o, n, cx + Math.cos(a) * r * gap, cy + Math.sin(a) * r * gap); }); });
  return { curve: () => 0.1 };
}

export const VIEWS3 = { force, matrix, chord, sunburst, clusters, icicle, timeline, spiral, board, heat, orbit, hex, ego };
export const VIEW_LIST3 = [
  ['ego', 'Ego', 'Hops outward from the selected thought'],
  ['force', 'Force', 'Classic force-directed network, always settling'],
  ['clusters', 'Clusters', 'One cluster per plane'],
  ['sunburst', 'Sunburst', 'The hierarchy as concentric arcs'],
  ['icicle', 'Icicle', 'The hierarchy as nested bars, sized by what each holds'],
  ['matrix', 'Matrix', 'Who links to whom, as a grid'],
  ['chord', 'Chord', 'Every thought on a circle, links as chords'],
  ['orbit', 'Orbit', 'Most linked in the middle, in rings'],
  ['timeline', 'Timeline', 'Birth order left to right, depth top to bottom'],
  ['spiral', 'Spiral', 'Growth order as a sunflower spiral'],
  ['board', 'Board', 'One column per plane, newest last'],
  ['heat', 'Heat', 'Plane by depth, shaded by how much sits there'],
  ['hex', 'Honeycomb', 'Every thought as a cell, grouped by plane'],
];
