// Extra canvas views for the six apps. Each view fills P (id -> {x, y, z, f}) and may draw its own guides.
// Returns flags the shared renderer honours: noEdges, noExpands, noLabels, curve(e), segs (edge hit lines), rects (treemap hit boxes).

export function hierarchy(N) {
  const ids = new Set(N.map(n => n.id)), kids = new Map(N.map(n => [n.id, []])), roots = [];
  for (const n of N) { if (n.parent && n.parent !== n.id && ids.has(n.parent)) kids.get(n.parent).push(n); else roots.push(n); }
  roots.sort((a, b) => (b.root ? 1 : 0) - (a.root ? 1 : 0));
  const depth = new Map(), order = [], leaves = new Map(), size = new Map(), seen = new Set();
  const dfs = (n, d) => { if (seen.has(n.id)) return [0, 0]; seen.add(n.id); depth.set(n.id, d); order.push(n); let L = 0, S = 1; for (const k of kids.get(n.id)) { const [l, s] = dfs(k, d + 1); L += l; S += s; } leaves.set(n.id, Math.max(1, L)); size.set(n.id, S); return [Math.max(1, L), S]; };
  for (const r of roots) dfs(r, 0); for (const n of N) if (!seen.has(n.id)) { roots.push(n); dfs(n, 0); }
  let maxD = 0; for (const d of depth.values()) maxD = Math.max(maxD, d);
  return { kids, roots, depth, order, leaves, size, maxD };
}
// Angular sectors proportional to leaf count, so big branches get room.
function sectors(T, start, span) {
  const ang = new Map(), wid = new Map();
  const rec = (n, a0, sp) => { ang.set(n.id, a0 + sp / 2); wid.set(n.id, sp); const ks = T.kids.get(n.id), tot = ks.reduce((s, c) => s + T.leaves.get(c.id), 0) || 1; let a = a0; for (const c of ks) { const w = sp * T.leaves.get(c.id) / tot; rec(c, a, w); a += w; } };
  const tot = T.roots.reduce((s, r) => s + T.leaves.get(r.id), 0) || 1; let a = start; for (const r of T.roots) { const w = span * T.leaves.get(r.id) / tot; rec(r, a, w); a += w; }
  return { ang, wid };
}
const hexA = (rgb, a) => 'rgba(' + rgb + ',' + a + ')';
const fit = (ctx, t, w) => { if (ctx.measureText(t).width <= w) return t; let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(t.slice(0, m) + '…').width <= w) lo = m; else hi = m - 1; } return lo > 1 ? t.slice(0, lo) + '…' : ''; };

// ── 4D hypersphere ──
// Each thought sits on a 3-sphere in four dimensions: depth in the hierarchy sets ψ (the seed at the pole, each generation one shell further out),
// its plane sets θ (a latitude band), its branch sets φ (sector by leaf count). The sphere turns in the x-w and z-w planes, so shells swell,
// pass through each other and fold back as you watch. Time is the slider: replay hides newer thoughts; newer thoughts glow brighter.
export function sphere(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), k = Math.max(1, o.PORDER.length), cx = W / 2 + cam.px, cy = H / 2 + cam.py, Rs = Math.min(W, H) * 0.34 * cam.k;
  const { ang } = sectors(T, 0, Math.PI * 2), a1 = o.alpha4, a2 = o.alpha4 * 0.618 + 0.7;
  const psiOf = d => 0.12 + (d / (T.maxD + 1)) * Math.PI * 0.78, thetaOf = pid => { const i = o.PORDER.indexOf(pid); return Math.PI * (0.22 + 0.56 * (k > 1 ? i / (k - 1) : 0.5)); };
  const yaw = cam.yaw, pit = cam.pitch - 0.46, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
  const pr = (psi, theta, phi) => {
    const sps = Math.sin(psi); let x = sps * Math.sin(theta) * Math.cos(phi), y = sps * Math.cos(theta), z = sps * Math.sin(theta) * Math.sin(phi), w = Math.cos(psi);
    [x, w] = [x * c1 - w * s1, x * s1 + w * c1]; [z, w] = [z * c2 - w * s2, z * s2 + w * c2];
    const d = 1 / (1.85 - w); x *= d; y *= d; z *= d;
    const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw, y1 = y * cp - z1 * sp, z3 = y * sp + z1 * cp, f = 3.2 / (3.2 + z3);
    return { x: cx + x1 * Rs * f, y: cy - y1 * Rs * f, z: z3, f: f * Math.min(1.6, d * 0.9), w };
  };
  // guides: plane bands on the equatorial shell, and one ring per generation
  ctx.lineWidth = 1;
  for (const pid of o.PORDER) { if (o.hidden[pid]) continue; const th = thetaOf(pid), pl = o.PL[pid]; ctx.beginPath(); for (let i = 0; i <= 72; i++) { const q = pr(Math.PI / 2, th, i / 72 * Math.PI * 2); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.strokeStyle = hexA(pl.rgb, 0.22); ctx.stroke(); }
  for (let d = 1; d <= T.maxD; d++) { const ps = psiOf(d); ctx.beginPath(); for (let i = 0; i <= 72; i++) { const q = pr(ps, Math.PI / 2, i / 72 * Math.PI * 2); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.strokeStyle = 'rgba(233,233,237,' + (0.07 - d * 0.006) + ')'; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]); }
  const born = new Map(o.g.nodes.map((n, i) => [n.id, i])), tot = Math.max(1, o.g.nodes.length - 1), coord = new Map();
  for (const n of N) { const c = [psiOf(T.depth.get(n.id) || 0), thetaOf(o.DP(n)), ang.get(n.id) || 0]; coord.set(n.id, c); const q = pr(...c), p = o.pos.get(n.id); P.set(n.id, { n, x: q.x, y: q.y, z: q.z, f: q.f, born: p ? p.born : 0, glow: (born.get(n.id) || 0) / tot }); }
  // edges as 4D geodesics: interpolate the angles, so links bend with the sphere
  const segs = [], ids = new Set(N.map(n => n.id)), sel = o.sel;
  for (const e of o.g.edges) { if (!ids.has(e.a) || !ids.has(e.b)) continue; const A = coord.get(e.a), B = coord.get(e.b); let dphi = B[2] - A[2]; if (dphi > Math.PI) dphi -= Math.PI * 2; if (dphi < -Math.PI) dphi += Math.PI * 2;
    const tree = e.kind === 'expands', hm = o.hopMap, ha = hm ? hm.get(e.a) : undefined, hb = hm ? hm.get(e.b) : undefined, on = ha != null && hb != null && Math.abs(ha - hb) <= 1, eh = on ? Math.max(ha, hb) : 9, pl = o.PL[o.DP(P.get(e.b).n)], pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, bow = tree ? 0 : Math.sin(t * Math.PI) * 0.35; pts.push(pr(A[0] + (B[0] - A[0]) * t + bow, A[1] + (B[1] - A[1]) * t, A[2] + dphi * t)); }
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.strokeStyle = on ? hexA(pl.rgb, [0.95, 0.85, 0.5, 0.32, 0.22][eh] || 0.2) : tree ? hexA(pl.rgb, sel ? 0.08 : 0.3) : 'rgba(233,233,237,' + (sel ? 0.04 : 0.14) + ')'; ctx.lineWidth = on ? (eh <= 1 ? 2 : 1.3) : tree ? 1.2 : 0.8; if (!tree) ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    const m = pts[7]; segs.push({ id: e.id, ax: pts[0].x, ay: pts[0].y, bx: pts[14].x, by: pts[14].y, mx: 2 * m.x - (pts[0].x + pts[14].x) / 2, my: 2 * m.y - (pts[0].y + pts[14].y) / 2 });
  }
  // newest thoughts glow: the fourth dimension made visible
  for (const q of P.values()) if (q.glow > 0.82) { ctx.beginPath(); ctx.arc(q.x, q.y, 9 * q.f + 4, 0, 7); ctx.fillStyle = hexA(o.PL[o.DP(q.n)].rgb, 0.12 + (q.glow - 0.82) * 0.8); ctx.fill(); }
  ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#75798c'; ctx.textBaseline = 'alphabetic'; ctx.fillText('ψ DEPTH · θ PLANE · φ BRANCH · W TURNS', 14, H - 14);
  return { noEdges: true, segs };
}

// ── radial tree ──
export function radial(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), cx = W / 2 + cam.px, cy = H / 2 + cam.py, multi = T.roots.length > 1 ? 1 : 0, ring = Math.min(W, H) * 0.45 * cam.k / (T.maxD + 1 + multi);
  const { ang, wid } = sectors(T, -Math.PI / 2, Math.PI * 2);
  ctx.lineWidth = 1; for (let d = 1; d <= T.maxD + multi; d++) { ctx.beginPath(); ctx.arc(cx, cy, d * ring, 0, 7); ctx.strokeStyle = 'rgba(233,233,237,0.05)'; ctx.stroke(); }
  for (const r of T.roots) for (const c of (multi ? [r] : T.kids.get(r.id))) { const a = ang.get(c.id), w = wid.get(c.id), pl = o.PL[o.DP(c)]; ctx.beginPath(); ctx.arc(cx, cy, (T.maxD + multi + 0.35) * ring, a - w / 2 + 0.01, a + w / 2 - 0.01); ctx.strokeStyle = hexA(pl.rgb, 0.55); ctx.lineWidth = 4; ctx.stroke(); }
  for (const n of N) { const d = (T.depth.get(n.id) || 0) + multi, a = ang.get(n.id) || 0, p = o.pos.get(n.id); P.set(n.id, { n, x: cx + Math.cos(a) * d * ring, y: cy + Math.sin(a) * d * ring, z: 0, f: 1, born: p ? p.born : 0 }); }
  return { curve: e => e.kind === 'expands' ? 0 : 0.18 };
}

// ── tidy tree, left to right, elbow connectors ──
export function tree(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), leafN = T.roots.reduce((s, r) => s + T.leaves.get(r.id), 0) || 1, left = 40 + cam.px, top = 48 + cam.py, col = Math.max(120, (W - 260) / Math.max(1, T.maxD)) * cam.k, row = Math.max(3, (H - 80) / leafN) * cam.k;
  let next = 0; const y = new Map(); const place = n => { const ks = T.kids.get(n.id); if (!ks.length) { y.set(n.id, top + (next++ + 0.5) * row); return; } ks.forEach(place); y.set(n.id, (y.get(ks[0].id) + y.get(ks[ks.length - 1].id)) / 2); };
  T.roots.forEach(place);
  for (const n of N) { const p = o.pos.get(n.id); P.set(n.id, { n, x: left + (T.depth.get(n.id) || 0) * col, y: y.get(n.id) || top, z: 0, f: 1, born: p ? p.born : 0 }); }
  ctx.lineWidth = 1.2; for (const n of N) for (const c of T.kids.get(n.id)) { const A = P.get(n.id), B = P.get(c.id), mx = A.x + col * 0.5, pl = o.PL[o.DP(c)]; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(mx - 8, A.y); ctx.quadraticCurveTo(mx, A.y, mx, A.y + Math.sign(B.y - A.y) * Math.min(8, Math.abs(B.y - A.y))); ctx.lineTo(mx, B.y - Math.sign(B.y - A.y) * Math.min(8, Math.abs(B.y - A.y))); ctx.quadraticCurveTo(mx, B.y, mx + 8, B.y); ctx.lineTo(B.x, B.y); ctx.strokeStyle = hexA(pl.rgb, o.sel && o.sel !== n.id && o.sel !== c.id ? 0.12 : 0.45); ctx.stroke(); }
  return { noExpands: true, curve: () => 0.25 };
}

// ── flow: generations top to bottom, ordered to cut crossings ──
export function flow(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), layers = []; for (const n of T.order) { const d = T.depth.get(n.id) || 0; (layers[d] = layers[d] || []).push(n); }
  const nb = new Map(N.map(n => [n.id, []])); for (const e of o.g.edges) if (nb.has(e.a) && nb.has(e.b)) { nb.get(e.a).push(e.b); nb.get(e.b).push(e.a); }
  const xs = new Map(); layers.forEach(L => L.forEach((n, i) => xs.set(n.id, i / Math.max(1, L.length - 1))));
  for (let pass = 0; pass < 3; pass++) for (let d = 1; d < layers.length; d++) { const L = layers[d]; for (const n of L) { const ns = nb.get(n.id).filter(id => xs.has(id)); n._bc = ns.length ? ns.reduce((s, id) => s + xs.get(id), 0) / ns.length : xs.get(n.id); } L.sort((a, b) => a._bc - b._bc); L.forEach((n, i) => { xs.set(n.id, L.length > 1 ? i / (L.length - 1) : 0.5); delete n._bc; }); }
  const top = 60 + cam.py, rowH = Math.max(70, (H - 110) / Math.max(1, layers.length - 1)) * cam.k, padX = 70;
  layers.forEach((L, d) => { const y = top + d * rowH; ctx.fillStyle = 'rgba(233,233,237,' + (d % 2 ? 0.0 : 0.025) + ')'; ctx.fillRect(0, y - rowH / 2, W, rowH); ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#595d6c'; ctx.textBaseline = 'middle'; ctx.fillText(d === 0 ? 'SEED' : 'GEN ' + d, 12, y);
    L.forEach(n => { const p = o.pos.get(n.id), x = padX + cam.px + (L.length > 1 ? xs.get(n.id) : 0.5) * (W - padX * 2) * cam.k; P.set(n.id, { n, x, y, z: 0, f: 1, born: p ? p.born : 0 }); }); });
  return { curve: e => e.kind === 'expands' ? 0 : 0.3 };
}

// ── treemap: each branch is a box sized by everything inside it ──
function squarify(items, x, y, w, h, out) {
  items = items.filter(i => i.v > 0).sort((a, b) => b.v - a.v); const total = items.reduce((s, i) => s + i.v, 0); if (!total || w < 2 || h < 2) return;
  const worst = (row, side) => { const s = row.reduce((a, r) => a + r.a, 0); let mx = 0, mn = Infinity; for (const r of row) { mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); } return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
  let rest = items.map(i => ({ ...i, a: i.v * w * h / total }));
  while (rest.length) { const side = Math.min(w, h); let row = [rest[0]], best = worst(row, side), i = 1; while (i < rest.length) { const nr = row.concat([rest[i]]), nw = worst(nr, side); if (nw > best) break; row = nr; best = nw; i++; }
    const sum = row.reduce((s, r) => s + r.a, 0), th = sum / side; let off = 0; for (const r of row) { const len = r.a / th; out.push(w >= h ? { id: r.id, x, y: y + off, w: th, h: len } : { id: r.id, x: x + off, y, w: len, h: th }); off += len; } if (w >= h) { x += th; w -= th; } else { y += th; h -= th; } rest = rest.slice(row.length); }
}
export function treemap(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), rects = [], byId = new Map(N.map(n => [n.id, n]));
  const lay = (list, x, y, w, h, d) => { const out = []; squarify(list.map(n => ({ id: n.id, v: T.size.get(n.id) })), x, y, w, h, out);
    for (const r of out) { const n = byId.get(r.id), pl = o.PL[o.DP(n)], pad = 2; const R = { ...r, x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2, depth: d }; if (R.w < 4 || R.h < 4) continue; rects.push(R);
      const isSel = o.sel === n.id, hp = o.hopMap ? o.hopMap.get(n.id) : undefined, lit = hp != null && hp > 0 ? 0.14 / hp : 0; ctx.fillStyle = hexA(pl.rgb, (o.hopMap && hp == null ? 0.03 : 0.06 + Math.min(0.16, d * 0.035)) + (isSel ? 0.18 : lit)); ctx.fillRect(R.x, R.y, R.w, R.h); ctx.strokeStyle = isSel ? '#ffffff' : hexA(pl.rgb, 0.45); ctx.lineWidth = isSel ? 1.6 : 1; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
      const head = R.h > 34 && R.w > 50 ? 18 : 0; if (R.w > 36 && R.h > 14) { ctx.font = (d === 0 ? '600 ' : '500 ') + '11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = d === 0 ? '#ffffff' : '#cfd3e5'; ctx.fillText(fit(ctx, n.label, R.w - 10), R.x + 5, R.y + Math.min(9, R.h / 2)); }
      const p = o.pos.get(n.id); P.set(n.id, { n, x: R.x + R.w - 8, y: R.y + 9, z: 0, f: 0.6, born: p ? p.born : 0 });
      const ks = T.kids.get(n.id); if (ks.length && head && d < 5) lay(ks, R.x + 3, R.y + head, R.w - 6, R.h - head - 3, d + 1); } };
  lay(T.roots, 8 + cam.px, 52 + cam.py, (W - 16) * cam.k, (H - 62) * cam.k, 0);
  return { noEdges: !o.sel, noExpands: true, noLabels: true, rects };
}

// ── arc diagram: hierarchy order on a line, parent links above, other links below ──
export function arcs(ctx, N, P, o) {
  const { W, H, cam } = o, T = hierarchy(N), y = H * 0.56 + cam.py, left = 30 + cam.px, span = (W - 60) * cam.k, n0 = Math.max(1, T.order.length - 1);
  ctx.strokeStyle = 'rgba(233,233,237,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + span, y); ctx.stroke();
  T.order.forEach((n, i) => { const p = o.pos.get(n.id); P.set(n.id, { n, x: left + (i / n0) * span, y, z: 0, f: 0.85, born: p ? p.born : 0 }); });
  ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#595d6c'; ctx.textBaseline = 'middle'; ctx.fillText('PARENT → CHILD', 14, 64); ctx.fillText('OTHER LINKS', 14, H - 24);
  return { curve: e => e.kind === 'expands' ? 0.5 : -0.5 };
}


// ── shared 4D projection: rotate in the x-w, y-w and z-w planes, perspective from w, then the 3D camera ──
function proj4(o) {
  const { W, H, cam } = o, cx = W / 2 + cam.px, cy = H / 2 + cam.py, R = Math.min(W, H) * 0.3 * cam.k, a = o.alpha4, A = [[Math.cos(a), Math.sin(a)], [Math.cos(a * 0.61 + 0.4), Math.sin(a * 0.61 + 0.4)], [Math.cos(a * 0.37 + 1.1), Math.sin(a * 0.37 + 1.1)]];
  const yaw = cam.yaw, pit = cam.pitch - 0.46, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  return (x, y, z, w) => { [x, w] = [x * A[0][0] - w * A[0][1], x * A[0][1] + w * A[0][0]]; [y, w] = [y * A[2][0] - w * A[2][1], y * A[2][1] + w * A[2][0]]; [z, w] = [z * A[1][0] - w * A[1][1], z * A[1][1] + w * A[1][0]];
    const d = 1 / (2.4 - w); x *= d; y *= d; z *= d; const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw, y1 = y * cp - z1 * sp, z3 = y * sp + z1 * cp, f = 3 / (3 + z3);
    return { x: cx + x1 * R * 2.2 * f, y: cy - y1 * R * 2.2 * f, z: z3, f: f * Math.min(1.6, d * 1.6), w }; };
}
function place4(N, P, o, pr, coord) { const out = new Map(); for (const n of N) { const c = coord(n); out.set(n.id, c); const q = pr(...c), p = o.pos.get(n.id); P.set(n.id, { n, x: q.x, y: q.y, z: q.z, f: q.f, born: p ? p.born : 0 }); } return out; }
function edges4(ctx, o, P, C, pr, steps = 10) { const segs = [], hm = o.hopMap, big = o.g.edges.length > 1500, batch = big ? new Map() : null; if (big) steps = 2; for (const e of o.g.edges) { const A = C.get(e.a), B = C.get(e.b); if (!A || !B) continue; if (o.minW && (e.weight ?? 0.5) * 100 < o.minW) continue; const pts = []; for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push(pr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t)); }
  const ha = hm ? hm.get(e.a) : undefined, hb = hm ? hm.get(e.b) : undefined, on = ha != null && hb != null, eh = on ? Math.max(ha, hb) : 9, pl = o.PL[o.DP(P.get(e.b).n)];
  const ss = on ? hexA(pl.rgb, [0.95, 0.85, 0.5, 0.32, 0.22][eh] || 0.2) : hexA(e.kind === 'expands' ? pl.rgb : '233,233,237', hm ? 0.04 : e.kind === 'expands' ? 0.28 : 0.13), lw = on && eh <= 1 ? 2 : 1, dash = e.kind !== 'expands';
  if (batch) { const k = ss + '|' + lw + '|' + dash; let b = batch.get(k); if (!b) batch.set(k, b = { p: new Path2D(), ss, lw, dash: dash ? [3, 4] : [] }); pts.forEach((q, i) => i ? b.p.lineTo(q.x, q.y) : b.p.moveTo(q.x, q.y)); if (on && dash) arrow(ctx, pts[steps - 1], pts[steps], hexA(pl.rgb, 0.9)); }
  else { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.strokeStyle = ss; ctx.lineWidth = lw; if (dash) ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); if (dash && (!hm || on)) arrow(ctx, pts[steps - 1], pts[steps], on ? hexA(pl.rgb, 0.9) : 'rgba(233,233,237,0.35)'); }
  const m = pts[steps >> 1]; segs.push({ id: e.id, ax: pts[0].x, ay: pts[0].y, bx: pts[steps].x, by: pts[steps].y, mx: 2 * m.x - (pts[0].x + pts[steps].x) / 2, my: 2 * m.y - (pts[0].y + pts[steps].y) / 2 }); } if (batch) { for (const b of batch.values()) { ctx.strokeStyle = b.ss; ctx.lineWidth = b.lw; ctx.setLineDash(b.dash || []); ctx.stroke(b.p); } ctx.setLineDash([]); } return segs; }
const caption = (ctx, o, t) => { ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#75798c'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, 14, o.H - 14); };

// Tesseract: four axes, four meanings. x plane, y depth, z branch order, w time. The frame is a real hypercube turning through w.
export function tesseract(ctx, N, P, o) {
  const T = hierarchy(N), pr = proj4(o), k = Math.max(1, o.PORDER.length - 1), born = new Map(o.g.nodes.map((n, i) => [n.id, i])), tot = Math.max(1, o.g.nodes.length - 1), ord = new Map(T.order.map((n, i) => [n.id, i])), on = Math.max(1, T.order.length - 1);
  const V = []; for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]); const Q = V.map(v => pr(...v));
  ctx.lineWidth = 1; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j < i) continue; ctx.beginPath(); ctx.moveTo(Q[i].x, Q[i].y); ctx.lineTo(Q[j].x, Q[j].y); ctx.strokeStyle = b === 3 ? 'rgba(181,171,252,0.22)' : 'rgba(233,233,237,0.09)'; ctx.stroke(); }
  const C = place4(N, P, o, pr, n => [(o.PORDER.indexOf(o.DP(n)) / k) * 1.8 - 0.9, ((T.depth.get(n.id) || 0) / Math.max(1, T.maxD)) * 1.8 - 0.9, ((ord.get(n.id) || 0) / on) * 1.8 - 0.9, ((born.get(n.id) || 0) / tot) * 1.8 - 0.9]);
  const segs = edges4(ctx, o, P, C, pr, 6); caption(ctx, o, 'TESSERACT · X PLANE · Y DEPTH · Z BRANCH · W TIME'); return { noEdges: true, segs };
}
// Clifford torus: a flat torus that only exists in 4D. One circle carries the branches, the other carries planes and depth.
export function torus(ctx, N, P, o) {
  const T = hierarchy(N), pr = proj4(o), { ang } = sectors(T, 0, Math.PI * 2), k = Math.max(1, o.PORDER.length), r = Math.SQRT1_2 * 1.3;
  const phiOf = n => (o.PORDER.indexOf(o.DP(n)) / k) * Math.PI * 2 + ((T.depth.get(n.id) || 0) / (T.maxD + 1)) * (Math.PI * 2 / k) * 0.8;
  ctx.lineWidth = 1; for (let i = 0; i < k; i++) { const ph = i / k * Math.PI * 2, pl = o.PL[o.PORDER[i]]; ctx.beginPath(); for (let j = 0; j <= 64; j++) { const th = j / 64 * Math.PI * 2, q = pr(r * Math.cos(th), r * Math.sin(th), r * Math.cos(ph), r * Math.sin(ph)); j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.strokeStyle = hexA(pl.rgb, 0.2); ctx.stroke(); }
  const C = place4(N, P, o, pr, n => { const th = ang.get(n.id) || 0, ph = phiOf(n); return [r * Math.cos(th), r * Math.sin(th), r * Math.cos(ph), r * Math.sin(ph)]; });
  const segs = edges4(ctx, o, P, C, pr, 12); caption(ctx, o, 'CLIFFORD TORUS · ONE CIRCLE BRANCHES · THE OTHER PLANES AND DEPTH'); return { noEdges: true, segs };
}
// Spacetime: the map's own layout in x and z, planes in y, and birth order in w. Turning through w slides older thoughts away.
export function spacetime(ctx, N, P, o) {
  const pr = proj4(o), born = new Map(o.g.nodes.map((n, i) => [n.id, i])), tot = Math.max(1, o.g.nodes.length - 1), k = Math.max(1, o.PORDER.length - 1); let R = 1; for (const n of N) { const p = o.pos.get(n.id); if (p) R = Math.max(R, Math.abs(p.x), Math.abs(p.z)); }
  for (let t = 0; t <= 4; t++) { const w = t / 4 * 1.8 - 0.9, c = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, z]) => pr(x, -1, z, w)); ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.strokeStyle = 'rgba(181,171,252,' + (0.05 + t * 0.03) + ')'; ctx.stroke(); }
  const C = place4(N, P, o, pr, n => { const p = o.pos.get(n.id) || { x: 0, z: 0 }; return [p.x / R, (o.PORDER.indexOf(o.DP(n)) / k) * 1.6 - 0.8, p.z / R, ((born.get(n.id) || 0) / tot) * 1.8 - 0.9]; });
  const segs = edges4(ctx, o, P, C, pr, 8); caption(ctx, o, 'SPACETIME · X Z LAYOUT · Y PLANE · W WHEN IT WAS BORN'); return { noEdges: true, segs };
}
// Core: k-core shells. The most mutually connected thoughts sit in the middle; link width is strength.
export function coreness(N, edges) { const ids = new Set(N.map(n => n.id)), adj = new Map(N.map(n => [n.id, new Set()])); for (const e of edges) if (ids.has(e.a) && ids.has(e.b) && e.a !== e.b) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
  const deg = new Map([...adj].map(([k, s]) => [k, s.size])), core = new Map(), left = new Set(ids); let kk = 0; while (left.size) { let m = null; for (const id of left) if (m === null || deg.get(id) < deg.get(m)) m = id; kk = Math.max(kk, deg.get(m)); core.set(m, kk); left.delete(m); for (const nb of adj.get(m)) if (left.has(nb)) deg.set(nb, deg.get(nb) - 1); } return core; }
export function core(ctx, N, P, o) {
  const { W, H, cam } = o, top = 52, bot = 30, cx = W / 2 + cam.px, cy = top + (H - top - bot) / 2 + cam.py, cr = coreness(N, o.g.edges), mx = Math.max(1, ...cr.values()), R = Math.max(40, (Math.min(W - 40, H - top - bot) / 2 - 44)) * cam.k, k = Math.max(1, o.PORDER.length);
  for (let s = mx; s >= 1; s--) { const r = R * (1 - (s - 1) / mx) * 0.92 + 18; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.strokeStyle = 'rgba(233,233,237,' + (0.03 + (s / mx) * 0.07) + ')'; ctx.lineWidth = 1; ctx.stroke(); }
  const byPlane = new Map(); for (const n of N) { const p = o.DP(n); (byPlane.get(p) || byPlane.set(p, []).get(p)).push(n); }
  o.PORDER.forEach((pid, i) => { const ns = (byPlane.get(pid) || []).sort((a, b) => (cr.get(b.id) || 0) - (cr.get(a.id) || 0)), a0 = i / k * Math.PI * 2 - Math.PI / 2, span = Math.PI * 2 / k; const pl = o.PL[pid]; ctx.beginPath(); ctx.arc(cx, cy, R + 14, a0 + 0.02, a0 + span - 0.02); ctx.strokeStyle = hexA(pl.rgb, 0.6); ctx.lineWidth = 3; ctx.stroke(); const la = a0 + span / 2; ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillStyle = pl.c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const lt = fit(ctx, o.PN[pid].label.toUpperCase(), 110), lw = ctx.measureText(lt).width; ctx.fillText(lt, Math.max(8 + lw / 2, Math.min(W - 8 - lw / 2, cx + Math.cos(la) * (R + 28))), Math.max(top + 8, Math.min(H - bot - 6, cy + Math.sin(la) * (R + 28)))); ctx.textAlign = 'left';
    ns.forEach((n, j) => { const s = cr.get(n.id) || 0, r = R * (1 - (s - 1) / mx) * 0.92 + 18 - (j % 3) * 6, a = a0 + span * ((j + 0.5) / Math.max(1, ns.length)), p = o.pos.get(n.id); P.set(n.id, { n, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: 0, f: 0.8 + (s / mx) * 0.6, born: p ? p.born : 0 }); }); });
  caption(ctx, o, 'CORE ' + mx + ' · CENTRE = MOST MUTUALLY LINKED · WIDTH = STRENGTH');
  return { curve: () => 0.1, widthByWeight: true };
}
export const VIEWS2 = { tesseract, torus, spacetime, core };


// ── relation-directed 4D: each kind of relation points one way in four dimensions ──
export const DIRS = [[/caus|lead|result|drive|trigger/, [1, 0, 0, 0], 'CAUSES →'], [/depend|requir|need/, [-1, 0, 0, 0], '← DEPENDS ON'], [/support|explain|evidence|confirm/, [0, 1, 0, 0], 'SUPPORTS ↑'], [/contradict|challenge|against|refut|attack/, [0, -1, 0, 0], 'CONTRADICTS ↓'], [/refin|example|instance|part|specif/, [0, 0, 1, 0], 'REFINES ⊙'], [/resembl|borrow|analog|lens|like|bridge/, [0, 0, -1, 0], 'RESEMBLES ⊗'], [/expand|child|grow/, [0, 0, 0, 1], 'GROWS INTO W']];
const dirOf = (o, e) => { const r = String((o.rel ? o.rel(e) : e.relation) || e.kind || '').toLowerCase(); for (const [re, d] of DIRS) if (re.test(r) || re.test(e.kind || '')) return d; return null; };
function axes(ctx, o, pr, scale = 1.15) { ctx.font = '500 9px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle'; for (const [, d, label] of DIRS.slice(0, 7)) { const a = pr(0, 0, 0, 0), b = pr(d[0] * scale, d[1] * scale, d[2] * scale, d[3] * scale); ctx.strokeStyle = 'rgba(233,233,237,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = 'rgba(181,171,252,0.7)'; ctx.fillText(label, b.x + 4, b.y); } }
function arrow(ctx, a, b, col) { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, x = b.x - ux * 7, y = b.y - uy * 7; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + ux * 6, y + uy * 6); ctx.lineTo(x - uy * 3.5, y + ux * 3.5); ctx.lineTo(x + uy * 3.5, y - ux * 3.5); ctx.closePath(); ctx.fill(); }
function degrees(N, g) { const d = new Map(N.map(n => [n.id, 0])); for (const e of g.edges) { if (d.has(e.a)) d.set(e.a, d.get(e.a) + 1); if (d.has(e.b)) d.set(e.b, d.get(e.b) + 1); } return d; }
function edgesDir(ctx, o, P, C, pr) { const segs = [], hm = o.hopMap, big = o.g.edges.length > 1500, ST = big ? 2 : 8, batch = big ? new Map() : null; for (const e of o.g.edges) { const A = C.get(e.a), B = C.get(e.b); if (!A || !B) continue; if (o.minW && (e.weight ?? 0.5) * 100 < o.minW && e.kind !== 'expands') continue; const pts = []; for (let i = 0; i <= ST; i++) { const t = i / ST; pts.push(pr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t)); }
  const ha = hm ? hm.get(e.a) : undefined, hb = hm ? hm.get(e.b) : undefined, on = ha != null && hb != null, eh = on ? Math.max(ha, hb) : 9, d = dirOf(o, e), col = d === DIRS[3][1] ? '232,149,111' : d === DIRS[2][1] ? '127,207,182' : d === DIRS[0][1] ? '229,196,111' : e.kind === 'expands' ? o.PL[o.DP(P.get(e.b).n)].rgb : '199,155,224', al = on ? [0.95, 0.85, 0.5, 0.32, 0.22][eh] || 0.2 : hm ? 0.05 : e.kind === 'expands' ? 0.22 : 0.45;
  const ss = 'rgba(' + col + ',' + al + ')', lw = (e.kind === 'expands' ? 0.9 : 0.8 + (e.weight ?? 0.5) * 2.2) * (on && eh <= 1 ? 1.5 : 1);
  if (batch) { const w = Math.round(lw * 2) / 2, k = ss + '|' + w; let b = batch.get(k); if (!b) batch.set(k, b = { p: new Path2D(), ss, lw: w }); pts.forEach((q, i) => i ? b.p.lineTo(q.x, q.y) : b.p.moveTo(q.x, q.y)); if (on && e.kind !== 'expands') arrow(ctx, pts[ST - 1], pts[ST], 'rgba(' + col + ',' + Math.min(1, al + 0.2) + ')'); }
  else { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.strokeStyle = ss; ctx.lineWidth = lw; ctx.stroke(); if (e.kind !== 'expands' && al > 0.1) arrow(ctx, pts[6], pts[8], 'rgba(' + col + ',' + Math.min(1, al + 0.2) + ')'); }
  segs.push({ id: e.id, ax: pts[0].x, ay: pts[0].y, bx: pts[ST].x, by: pts[ST].y, mx: 2 * pts[ST >> 1].x - (pts[0].x + pts[ST].x) / 2, my: 2 * pts[ST >> 1].y - (pts[0].y + pts[ST].y) / 2 }); } if (batch) { for (const b of batch.values()) { ctx.strokeStyle = b.ss; ctx.lineWidth = b.lw; ctx.setLineDash(b.dash || []); ctx.stroke(b.p); } ctx.setLineDash([]); } return segs; }

// 4D network: a force layout that runs in four dimensions. Links are springs that also point their target in the relation's direction,
// so chains of causes line up, contradictions push apart, and each generation steps further into w. Hubs are pulled to the centre.
function net4Layout(N, o) { const m = o.mem || (o.mem = {}), key = N.length + ':' + o.g.edges.length; let S = m.net4; if (!S) S = m.net4 = { pos: new Map(), key: '', heat: 1 };
  const deg = degrees(N, o.g); for (const n of N) if (!S.pos.has(n.id)) { const p = n.parent && S.pos.get(n.parent); S.pos.set(n.id, p ? p.map(x => x + (Math.random() - 0.5) * 0.2) : [0, 1, 2, 3].map(() => (Math.random() - 0.5) * 1.6)); }
  if (S.key !== key) { S.key = key; S.heat = Math.max(S.heat, 0.6); } if (S.heat < 0.01) return { S, deg };
  const ids = N.map(n => n.id), X = ids.map(id => S.pos.get(id)), F = X.map(() => [0, 0, 0, 0]), ix = new Map(ids.map((id, i) => [id, i])), L = ids.length, h = S.heat;
  // exact below 300 thoughts; above, a grid on the first two axes with a shorter reach, so a frame stays near-linear
  const big = L > 300, cut = big ? 0.32 : Math.sqrt(2.5), cut2 = cut * cut;
  const rep = (i, j) => { const A = X[i], B = X[j], e0 = A[0] - B[0], e1 = A[1] - B[1], e2 = A[2] - B[2], e3 = A[3] - B[3]; let d2 = e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3; if (d2 > cut2) return; d2 = Math.max(d2, 0.0025); const s = 0.0016 / d2, Fi = F[i], Fj = F[j]; Fi[0] += e0 * s; Fi[1] += e1 * s; Fi[2] += e2 * s; Fi[3] += e3 * s; Fj[0] -= e0 * s; Fj[1] -= e1 * s; Fj[2] -= e2 * s; Fj[3] -= e3 * s; };
  if (!big) { for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) rep(i, j); }
  else { const grid = new Map(); for (let i = 0; i < L; i++) { const cx = Math.floor(X[i][0] / cut), cy = Math.floor(X[i][1] / cut), k = cx + ',' + cy; let c = grid.get(k); if (!c) grid.set(k, c = { cx, cy, A: [] }); c.A.push(i); } for (const c of grid.values()) for (const [ox, oy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { const q = ox || oy ? grid.get((c.cx + ox) + ',' + (c.cy + oy)) : c; if (!q) continue; const A = c.A, B = q.A; for (let x = 0; x < A.length; x++) for (let y = q === c ? x + 1 : 0; y < B.length; y++) rep(A[x], B[y]); } }
  for (const e of o.g.edges) { const a = ix.get(e.a), b = ix.get(e.b); if (a == null || b == null || a === b) continue; const d = dirOf(o, e), len = e.kind === 'expands' ? 0.22 : 0.32, w = 0.06 * (0.5 + (e.weight ?? 0.5)); for (let k = 0; k < 4; k++) { const want = X[a][k] + (d ? d[k] * len : 0), diff = want - X[b][k]; F[b][k] += diff * w; F[a][k] -= diff * w * 0.6; } }
  for (let i = 0; i < L; i++) { const c = 0.012 * (1 + Math.min(8, deg.get(ids[i]) || 0) * 0.35); for (let k = 0; k < 4; k++) { F[i][k] -= X[i][k] * c; X[i][k] += Math.max(-0.08, Math.min(0.08, F[i][k] * h * 4)); } }
  let R = 0.001; for (const p of X) for (const x of p) R = Math.max(R, Math.abs(x)); if (R > 1.25) for (const p of X) for (let k = 0; k < 4; k++) p[k] *= 1.25 / R; S.heat *= 0.985; return { S, deg }; }
export function net4(ctx, N, P, o) { const pr = proj4(o), { S } = net4Layout(N, o); if (N.length <= 300) for (let i = 0; i < 2; i++) net4Layout(N, o); axes(ctx, o, pr); const C = place4(N, P, o, pr, n => S.pos.get(n.id)); const segs = edgesDir(ctx, o, P, C, pr); caption(ctx, o, '4D NETWORK · LINKS POINT THEIR RELATION · HUBS PULLED IN · GENERATIONS STEP INTO W'); return { noEdges: true, segs }; }

// 4D compass: every thought points the way its relations point. Direction = the sum of its links' directions (outgoing +, incoming −),
// distance from the centre falls with degree, so hubs sit in the middle and specialists sit far out on their heading.
export function compass(ctx, N, P, o) { const pr = proj4(o), deg = degrees(N, o.g), mx = Math.max(1, ...deg.values()), T = hierarchy(N), { ang } = sectors(T, 0, Math.PI * 2), vec = new Map(N.map(n => [n.id, [0, 0, 0, 0]]));
  for (const e of o.g.edges) { const d = dirOf(o, e); if (!d || !vec.has(e.a) || !vec.has(e.b)) continue; const w = e.weight ?? 0.5; for (let k = 0; k < 4; k++) { vec.get(e.b)[k] += d[k] * w; vec.get(e.a)[k] -= d[k] * w * 0.5; } }
  for (let r = 1; r <= 3; r++) { ctx.beginPath(); for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2, q = pr(Math.cos(t) * r / 3, Math.sin(t) * r / 3, 0, 0); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.strokeStyle = 'rgba(233,233,237,0.05)'; ctx.stroke(); }
  for (let a = 0; a < 360; a += 30) { const q = pr(Math.cos(a * Math.PI / 180) * 1.08, Math.sin(a * Math.PI / 180) * 1.08, 0, 0); ctx.font = '500 9px "IBM Plex Mono", monospace'; ctx.fillStyle = '#4b4f5c'; ctx.textBaseline = 'middle'; ctx.fillText(a + '°', q.x - 8, q.y); }
  axes(ctx, o, pr, 1.2);
  const C = place4(N, P, o, pr, n => { const v0 = vec.get(n.id), len = Math.hypot(...v0), rad = 0.15 + 0.85 * (1 - (deg.get(n.id) || 0) / mx); if (len < 1e-6) { const a = ang.get(n.id) || 0, d = (T.depth.get(n.id) || 0) / Math.max(1, T.maxD); return [Math.cos(a) * rad, Math.sin(a) * rad, 0, d * 0.8 - 0.4]; } return v0.map(x => x / len * rad); });
  const segs = edgesDir(ctx, o, P, C, pr); caption(ctx, o, '4D COMPASS · HEADING = WHERE ITS RELATIONS POINT · DISTANCE = 1 / DEGREE'); return { noEdges: true, segs }; }

// Gallery: four 4D readings of the same map at once. Click in the top-left panel; the others follow the selection.
export function gallery(ctx, N, P, o) { const { W, H } = o, top = 48, w2 = W / 2, h2 = (H - top) / 2, panels = [['4D network', net4], ['4D compass', compass], ['Hypersphere', sphere], ['Tesseract', tesseract]]; let segs = [];
  panels.forEach(([name, fn], i) => { const x0 = (i % 2) * w2, y0 = top + Math.floor(i / 2) * h2, sub = { ...o, W: w2, H: h2, cam: { ...o.cam, px: 0, py: 0, k: o.cam.k * 0.9 } }, Pm = i === 0 ? P : new Map();
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w2, h2); ctx.clip(); ctx.translate(x0, y0); const flags = fn(ctx, N, Pm, sub) || {};
    if (i === 0) { for (const q of P.values()) { q.x += x0; q.y += y0; } segs = (flags.segs || []).map(s => ({ ...s, ax: s.ax + x0, ay: s.ay + y0, bx: s.bx + x0, by: s.by + y0, mx: s.mx + x0, my: s.my + y0 })); }
    else for (const q of Pm.values()) { const pl = o.PL[o.DP(q.n)], hop = o.hopMap ? o.hopMap.get(q.n.id) : undefined; ctx.globalAlpha = o.hopMap && hop == null ? 0.2 : 1; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.6, 2.4 * q.f + (q.n.id === o.sel ? 2.5 : 0)), 0, 7); ctx.fillStyle = 'rgba(' + pl.rgb + ',' + (0.45 + q.n.g * 0.55) + ')'; ctx.fill(); if (q.n.id === o.sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); } ctx.globalAlpha = 1; }
    ctx.restore(); ctx.strokeStyle = 'rgba(233,233,237,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w2 - 1, h2 - 1); ctx.font = '600 10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#b5abfc'; ctx.textBaseline = 'top'; ctx.fillText(name.toUpperCase(), x0 + 10, y0 + 8); });
  return { noEdges: true, segs, noLabels: false }; }

export const VIEWS = { evid4, doubt4, learn4, disc4, src4, gallery, net4, compass, sphere, tesseract, torus, spacetime, core, radial, tree, flow, treemap, arcs };

// ── data lenses in 4D: each one keeps only the thoughts that carry one kind of data, and gives its four axes a meaning ──
function axesL(ctx, o, pr, names) { ctx.font = '500 9px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle'; const D = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; D.forEach((d, i) => { const a = pr(-d[0] * 1.1, -d[1] * 1.1, -d[2] * 1.1, -d[3] * 1.1), b = pr(d[0] * 1.15, d[1] * 1.15, d[2] * 1.15, d[3] * 1.15); ctx.strokeStyle = 'rgba(233,233,237,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = 'rgba(181,171,252,0.75)'; ctx.fillText(names[i] + ' →', b.x + 4, b.y); }); }
const n01 = (v, a, b) => Math.max(0, Math.min(1, (v - a) / Math.max(1e-9, b - a)));
const yearOf = n => { let y = 0; for (const e of n.evidence || []) { const m = String(e.year || '').match(/(19|20)\d\d/); if (m) y = Math.max(y, +m[0]); } return y; };
function lens(ctx, N, P, o, keep, coord, names, cap, empty) {
  const pr = proj4(o), K = N.filter(keep); axesL(ctx, o, pr, names);
  if (!K.length) { ctx.font = '500 13px "IBM Plex Sans", system-ui, sans-serif'; ctx.fillStyle = '#9397ab'; ctx.textAlign = 'center'; ctx.fillText(empty, o.W / 2, o.H / 2); ctx.textAlign = 'start'; caption(ctx, o, cap); return { noEdges: true, segs: [] }; }
  const C = place4(K, P, o, pr, n => coord(n).map(x => x * 2 - 1)); const segs = edgesDir(ctx, o, P, C, pr); caption(ctx, o, cap + ' · ' + K.length + ' OF ' + N.length); return { noEdges: true, segs };
}
const PIDX = { facts: 0, concepts: 1, principles: 2, wild: 3 };
export function evid4(ctx, N, P, o) { return lens(ctx, N, P, o, n => (n.evidence || []).length > 0 || n.root, n => [n.g ?? 0.5, n01((n.evidence || []).length, 0, 6), yearOf(n) ? n01(yearOf(n), 1990, new Date().getFullYear()) : 0.5, (PIDX[n.plane] ?? 1) / 3], ['GROUNDING', 'SOURCES', 'RECENCY', 'PLANE'], '4D EVIDENCE · ONLY SOURCED THOUGHTS', 'No sources yet. Use Sources on a thought, or run the agents.'); }
export function doubt4(ctx, N, P, o) { const con = new Map(); for (const e of o.g.edges) if (/contradict|challenge|against|refut|attack/.test(String(e.relation || e.kind))) { con.set(e.a, (con.get(e.a) || 0) + 1); con.set(e.b, (con.get(e.b) || 0) + 1); } const T = hierarchy(N);
  return lens(ctx, N, P, o, n => (n.g ?? 0.5) < 0.6 || n.challenge || con.has(n.id) || n.status === 'refuted', n => [1 - (n.g ?? 0.5), n01((con.get(n.id) || 0) + (n.challenge ? 1 : 0), 0, 4), n01(T.depth.get(n.id) || 0, 0, Math.max(1, T.maxD)), n01(n.deg || 0, 0, 10)], ['UNCERTAINTY', 'PUSHBACK', 'DEPTH', 'LINKS'], '4D DOUBT · WEAK, CHALLENGED OR REFUTED', 'Nothing is in doubt. Run a challenge to find out.'); }
export function learn4(ctx, N, P, o) { const wsum = new Map(), wn = new Map(); for (const e of o.g.edges) for (const id of [e.a, e.b]) { wsum.set(id, (wsum.get(id) || 0) + (e.weight ?? 0.5)); wn.set(id, (wn.get(id) || 0) + 1); } const born = N.map(n => +new Date(n.t) || 0), b0 = Math.min(...born), b1 = Math.max(...born);
  return lens(ctx, N, P, o, () => true, n => [n.act || 0, wn.get(n.id) ? wsum.get(n.id) / wn.get(n.id) : 0, n01(n.recalls || 0, 0, 6), n01(+new Date(n.t) || 0, b0, b1)], ['ACTIVITY', 'LINK STRENGTH', 'RECALLS', 'AGE'], '4D LEARNING · HEBBIAN STRENGTH AND USE', ''); }
export function disc4(ctx, N, P, o) { return lens(ctx, N, P, o, n => !!n.grade, n => { const m = n.grade.metrics || {}; return [m.novel ?? 0.5, m.stab ?? 0, m.drug ?? 0, m.ev ?? 0]; }, ['NOVELTY', 'STABILITY', 'DRUG-LIKE', 'EVIDENCE'], '4D DISCOVERY · GRADED MOLECULES · FAR CORNER = NEW, STABLE, DRUG-LIKE, BACKED', 'No graded molecules yet. Run the agents, then Grade.'); }
export function src4(ctx, N, P, o) { const S = ['PubMed', 'Europe PMC', 'PubChem', 'UniProt', 'AlphaFold', 'PDB', 'Claude', 'MCP']; const kind = n => { const t = (n.via || '') + ' ' + (n.evidence || []).map(e => e.src).join(' '); const i = S.findIndex(s => t.includes(s)); return i < 0 ? -1 : i; };
  return lens(ctx, N, P, o, n => kind(n) >= 0, n => { const k = kind(n), a = k / S.length * Math.PI * 2; return [0.5 + 0.45 * Math.cos(a), 0.5 + 0.45 * Math.sin(a), n.g ?? 0.5, n01((n.evidence || []).length, 0, 6)]; }, ['SOURCE ↻', 'SOURCE ↻', 'GROUNDING', 'COUNT'], '4D SOURCES · EACH DATABASE ITS OWN HEADING', 'Nothing has come from a database yet.'); }
