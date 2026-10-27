/* Backtest: a million deterministic backtests on real public price series, in a worker pool, and the means to check them.
   Verified: every result is computed twice, by a fast implementation (prefix sums) and an independent naive one, on a sample the Merkle root chooses.
   Verifiable: the manifest holds the SHA-256 of every data file, the sampler, the code hashes and a Merkle root over the result batches; anyone can regenerate config j and rerun it.
   Research only: long/flat, 10 bps per position change, first 60% of bars in-sample, last 40% out-of-sample. Past performance predicts nothing; this exists to measure how much edge survives.
   window.Backtest = { SERIES, FAMILIES, load, run, analyze, verify, recheck, curve, config, bh } */
(function () {
  'use strict';
  var RAW = 'https://raw.githubusercontent.com/datasets/';
  var SERIES = [
    { id: 'gas', label: 'Henry Hub natural gas', unit: 'USD/MMBtu', url: RAW + 'natural-gas/main/data/daily.csv', col: 'Price', week: true, ppy: 52, why: 'the power cost behind data centres' },
    { id: 'brent', label: 'Brent crude', unit: 'USD/bbl', url: RAW + 'oil-prices/main/data/brent-daily.csv', col: 'Price', week: true, ppy: 52, why: 'the energy price behind power and logistics' },
    { id: 'wti', label: 'WTI crude', unit: 'USD/bbl', url: RAW + 'oil-prices/main/data/wti-daily.csv', col: 'Price', week: true, ppy: 52, why: 'the US energy benchmark' },
    { id: 'spx', label: 'S&P 500, monthly', unit: 'index', url: RAW + 's-and-p-500/main/data/data.csv', col: 'SP500', week: false, ppy: 12, why: 'the broad market the AI build-out sits in' },
    { id: 'gold', label: 'Gold, monthly', unit: 'USD/oz', url: RAW + 'gold-prices/main/data/monthly.csv', col: 'Price', week: false, ppy: 12, why: 'a store-of-value reference' },
    { id: 'btc', label: 'Bitcoin, daily, last year', unit: 'USD', url: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily', json: true, week: false, ppy: 365, why: 'miners re-pointing hash capacity to AI hosting' }];
  var FAMILIES = ['SMA crossover', 'Momentum', 'Mean reversion (z-score)'];

  // ---- shared by the main thread and every worker: injected by source text ----
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function config(j, seed, nSeries) {
    var r = mulberry32((seed ^ Math.imul(j + 1, 2654435761)) | 0), s = Math.floor(r() * nSeries), f = Math.floor(r() * 3), a, b, c;
    if (f === 0) { a = 2 + Math.floor(r() * 118); b = a + 2 + Math.floor(r() * (400 - a - 2)); c = 0; }
    else if (f === 1) { a = 2 + Math.floor(r() * 299); b = Math.floor(r() * 121) / 1000; c = Math.floor(r() * 3); }
    else { a = 5 + Math.floor(r() * 246); b = (2 + Math.floor(r() * 68)) / 20; c = Math.floor(r() * 4) / 4; }
    return [s, f, a, b, c];
  }
  function sharpe(n, s, q, ppy) { if (n < 20) return NaN; var m = s / n, v = q / n - m * m; return v > 1e-14 ? m / Math.sqrt(v) * Math.sqrt(ppy) : 0; }
  function evalFast(S, f, a, b, c) {
    var P = S.P, R = S.R, c1 = S.c1, c2 = S.c2, n = S.n, split = S.split, start = f === 0 ? b - 1 : f === 1 ? a + c : a - 1, pos = 0, prev = 0, trades = 0, ni = 0, si = 0, qi = 0, no = 0, so = 0, qo = 0, eq = 1, sig, m, v, z, r;
    for (var t = start; t < n - 1; t++) {
      if (f === 0) sig = (c1[t + 1] - c1[t + 1 - a]) / a > (c1[t + 1] - c1[t + 1 - b]) / b * 1.000000001 ? 1 : 0;
      else if (f === 1) sig = P[t - c] / P[t - c - a] - 1 > b ? 1 : 0;
      else { m = (c1[t + 1] - c1[t + 1 - a]) / a; v = (c2[t + 1] - c2[t + 1 - a]) / a - m * m; z = (P[t] - m) / Math.sqrt(v > 1e-9 ? v : 1e-9); sig = pos === 0 && z < -b ? 1 : pos === 1 && z > c + 1e-5 ? 0 : pos; }
      r = sig * R[t + 1] - (sig !== prev ? 0.001 : 0); if (sig !== prev) trades++; prev = sig; pos = sig;
      if (t + 1 < split) { ni++; si += r; qi += r * r; } else { no++; so += r; qo += r * r; eq *= 1 + r; }
    }
    return [sharpe(ni, si, qi, S.ppy), sharpe(no, so, qo, S.ppy), eq - 1, trades];
  }
  function evalRef(S, f, a, b, c) {      // naive windows, two-pass statistics: an independent implementation
    var n = S.n, P = S.P, start = f === 0 ? b - 1 : f === 1 ? a + c : a - 1, sig = [], pos = 0, t, i, s;
    for (t = 0; t < n - 1; t++) {
      if (t < start) { sig.push(0); continue; }
      if (f === 0) { var x = 0, y = 0; for (i = t - a + 1; i <= t; i++) x += P[i]; for (i = t - b + 1; i <= t; i++) y += P[i]; s = x / a > y / b * 1.000000001 ? 1 : 0; }
      else if (f === 1) s = P[t - c] / P[t - c - a] - 1 > b ? 1 : 0;
      else { var m = 0, v = 0; for (i = t - a + 1; i <= t; i++) m += P[i]; m /= a; for (i = t - a + 1; i <= t; i++) v += (P[i] - m) * (P[i] - m); v /= a; var z = (P[t] - m) / Math.sqrt(Math.max(v, 1e-9)); s = pos === 0 && z < -b ? 1 : pos === 1 && z > c + 1e-5 ? 0 : pos; }
      sig.push(s); pos = s;
    }
    var isR = [], osR = [], prev = 0, trades = 0, eq = 1;
    for (t = start; t < n - 1; t++) { var r = sig[t] * (P[t + 1] / P[t] - 1) - (sig[t] !== prev ? 0.001 : 0); if (sig[t] !== prev) trades++; prev = sig[t]; if (t + 1 < S.split) isR.push(r); else { osR.push(r); eq *= 1 + r; } }
    var sh = function (xs) { if (xs.length < 20) return NaN; var mu = 0, k; for (k = 0; k < xs.length; k++) mu += xs[k]; mu /= xs.length; var q = 0; for (k = 0; k < xs.length; k++) q += (xs[k] - mu) * (xs[k] - mu); q /= xs.length; return q > 1e-14 ? mu / Math.sqrt(q) * Math.sqrt(S.ppy) : 0; };
    return [sh(isR), sh(osR), eq - 1, trades];
  }
  var SHARED = [mulberry32, config, sharpe, evalFast].map(String).join('\n');
  var WORKER = SHARED + "\nvar SER, SEED;\nself.onmessage = function (e) { var m = e.data; if (m.init) { SER = m.series; SEED = m.seed; self.postMessage({ ready: 1 }); return; }\n var out = new Float32Array((m.to - m.from) * 6), k = 0, j, cf, r;\n for (j = m.from; j < m.to; j++, k += 6) { cf = config(j, SEED, SER.length); r = evalFast(SER[cf[0]], cf[1], cf[2], cf[3], cf[4]); out[k] = cf[0]; out[k + 1] = cf[1]; out[k + 2] = r[0]; out[k + 3] = r[1]; out[k + 4] = r[2]; out[k + 5] = r[3]; }\n self.postMessage({ id: m.id, from: m.from, out: out }, [out.buffer]); };";

  var hex = function (buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
  var sha = async function (data) { return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data)); };
  function prepare(dates, vals, ppy) {
    var n = vals.length, P = new Float64Array(n), R = new Float64Array(n), c1 = new Float64Array(n + 1), c2 = new Float64Array(n + 1), i;
    for (i = 0; i < n; i++) { P[i] = vals[i] / vals[0]; R[i] = i ? P[i] / P[i - 1] - 1 : 0; c1[i + 1] = c1[i] + P[i]; c2[i + 1] = c2[i] + P[i] * P[i]; }
    return { P: P, R: R, c1: c1, c2: c2, n: n, split: Math.floor(n * 0.6), ppy: ppy, first: dates[0], last: dates[n - 1] };
  }
  function parse(def, text) {
    var d = [], v = [], rows;
    if (def.json) { JSON.parse(text).prices.forEach(function (p) { d.push(new Date(p[0]).toISOString().slice(0, 10)); v.push(p[1]); }); }
    else { rows = text.trim().split(/\r?\n/); var head = rows[0].split(',').map(function (h) { return h.trim().toLowerCase(); }), ci = head.indexOf(def.col.toLowerCase()); if (ci < 0) throw new Error('column ' + def.col + ' not found'); rows.slice(1).forEach(function (l) { var c = l.split(','), x = parseFloat(c[ci]); if (c[0] && isFinite(x) && x > 0) { d.push(c[0].slice(0, 10)); v.push(x); } }); }
    if (def.week) { var D = [], V = [], last = -1; d.forEach(function (s, i) { var k = Math.floor(Date.parse(s) / 6048e5); if (k === last) { V[V.length - 1] = v[i]; D[D.length - 1] = s; } else { D.push(s); V.push(v[i]); last = k; } }); d = D; v = V; }
    if (v.length < 120) throw new Error('only ' + v.length + ' bars');
    return { d: d, v: v };
  }
  async function load(onSeries) {
    var out = [];
    await Promise.all(SERIES.map(async function (def, i) {
      var rec = { id: def.id, label: def.label, unit: def.unit, why: def.why, url: def.url, ok: false, err: '' };
      try { var r = await fetch(def.url); if (!r.ok) throw new Error('HTTP ' + r.status); var buf = await r.arrayBuffer(), p = parse(def, new TextDecoder().decode(buf)); rec.sha256 = await sha(buf); rec.bytes = buf.byteLength; rec.bars = p.v.length; rec.first = p.d[0]; rec.last = p.d[p.d.length - 1]; rec.ppy = def.ppy; rec.S = prepare(p.d, p.v, def.ppy); rec.raw = p; rec.ok = true; } catch (e) { rec.err = String(e.message || e); }
      out[i] = rec; if (onSeries) onSeries(rec);
    }));
    return out;
  }
  function bh(S) { var no = 0, so = 0, qo = 0, eq = 1; for (var t = S.split; t < S.n; t++) { no++; so += S.R[t]; qo += S.R[t] * S.R[t]; eq *= 1 + S.R[t]; } return { sharpe: sharpe(no, so, qo, S.ppy), ret: eq - 1 }; }

  async function run(series, o) {
    var live = series.filter(function (s) { return s.ok; }), total = o.total || 1000000, batch = o.batch || 25000, seed = o.seed || 20261021, nw = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    if (!live.length) throw new Error('no series loaded');
    var ser = live.map(function (s) { return s.S; }), ALL = new Float32Array(total * 6), blob = new Blob([WORKER], { type: 'text/javascript' }), url = URL.createObjectURL(blob), workers = [], leaves = [], next = 0, doneN = 0, t0 = performance.now(), pend = [];
    var cells = live.map(function () { return [0, 1, 2].map(function () { return { n: 0, win: 0, hold: 0, sumOos: 0 }; }); });
    await Promise.all(Array.from({ length: nw }, function () { return new Promise(function (res) { var w = new Worker(url); w.onmessage = function (e) { if (e.data.ready) res(); }; w.postMessage({ init: 1, series: ser, seed: seed }); workers.push(w); }); }));
    await new Promise(function (resolve, reject) {
      var give = function (w) { if (o.cancel && o.cancel()) { workers.forEach(function (x) { x.terminate(); }); return reject(new Error('stopped')); } if (next >= total) return; var from = next, to = Math.min(total, next + batch); next = to; w.postMessage({ id: from / batch, from: from, to: to }); };
      workers.forEach(function (w) {
        w.onmessage = async function (e) {
          var m = e.data, out = m.out, k, row;
          ALL.set(out, m.from * 6); leaves[m.id] = null; pend.push(sha(out.buffer.slice(0)).then(function (h) { leaves[m.id] = h; }));
          for (k = 0; k < out.length; k += 6) { var c = cells[out[k]][out[k + 1]], is = out[k + 2], oo = out[k + 3]; if (is === is && oo === oo) { c.n++; if (is >= 0.5) { c.win++; if (oo > 0) c.hold++; c.sumOos += oo; } } }
          doneN += out.length / 6; give(w);
          if (o.onProgress) o.onProgress({ done: doneN, total: total, rate: doneN / ((performance.now() - t0) / 1000), cells: cells, live: live });
          if (doneN >= total) resolve();
        };
        give(w);
      });
    });
    workers.forEach(function (w) { w.terminate(); }); URL.revokeObjectURL(url); await Promise.all(pend);
    var level = leaves.slice(); while (level.length > 1) { var nx = []; for (var i = 0; i < level.length; i += 2) nx.push(await sha(level[i] + (level[i + 1] || level[i]))); level = nx; }
    var codeHash = await sha(WORKER + String(evalRef));
    return { ALL: ALL, live: live, seed: seed, total: total, batch: batch, seconds: (performance.now() - t0) / 1000, manifest: { version: 1, kind: 'threshold-backtest', total: total, seed: seed, sampler: 'config(j, seed, nSeries): mulberry32(seed ^ imul(j+1, 2654435761)); series, family, params drawn in that order', families: FAMILIES, split: '0.6 in-sample / 0.4 out-of-sample', cost_per_position_change: 0.001, rules: 'sma: fast mean > slow mean x (1 + 1e-9); z-score variance floor 1e-9, exit when z > c + 1e-5; momentum: P[t-c]/P[t-c-a] - 1 > b; long or flat', series: live.map(function (s) { return { id: s.id, url: s.url, sha256: s.sha256, bytes: s.bytes, bars: s.bars, first: s.first, last: s.last }; }), batches: leaves.length, batch_size: batch, merkle_root: level[0], code_sha256: codeHash, created: new Date().toISOString(), workers: nw } };
  }

  function analyze(res) {
    var A = res.ALL, N = res.total, live = res.live, bhs = live.map(function (s) { return bh(s.S); }), isv = [], k, j;
    for (j = 0; j < N; j++) { var a = A[j * 6 + 2], b = A[j * 6 + 3]; if (a === a && b === b) isv.push(a); }
    var sorted = Float32Array.from(isv).sort(), thr = sorted[Math.floor(sorted.length * 0.99)], thr10 = sorted[Math.floor(sorted.length * 0.9)], nValid = isv.length;
    var mean = function (xs) { var s = 0; for (var i = 0; i < xs.length; i++) s += xs[i]; return s / xs.length; }, mIs = 0, mOos = 0, sq = 0;
    for (j = 0; j < N; j++) { a = A[j * 6 + 2]; b = A[j * 6 + 3]; if (a === a && b === b) { mIs += a; mOos += b; sq += a * a; } }
    mIs /= nValid; mOos /= nValid; var sd = Math.sqrt(sq / nValid - mIs * mIs);
    var top = { n: 0, pos: 0, beat: 0, sumOos: 0 }, surv = [], cells = live.map(function () { return [0, 1, 2].map(function () { return { n: 0, win: 0, hold: 0, sumOos: 0 }; }); });
    var hIs = new Array(30).fill(0), hOos = new Array(30).fill(0), bin = function (x) { return Math.max(0, Math.min(29, Math.floor((x + 3) / 0.2))); }, rng = mulberry32(7), scatter = [], best = { is: -9, oos: 0, j: -1 };
    for (j = 0; j < N; j++) {
      var s = A[j * 6], f = A[j * 6 + 1], is = A[j * 6 + 2], oo = A[j * 6 + 3], rt = A[j * 6 + 4], tr = A[j * 6 + 5];
      if (!(is === is && oo === oo)) continue;
      var c = cells[s][f]; c.n++; if (is >= 0.5) { c.win++; if (oo > 0) c.hold++; c.sumOos += oo; }
      hIs[bin(is)]++; hOos[bin(oo)]++; if (rng() < 3000 / nValid) scatter.push([is, oo]);
      if (is > best.is) best = { is: is, oos: oo, j: j };
      if (is >= thr) { top.n++; top.sumOos += oo; if (oo > 0) top.pos++; if (oo > bhs[s].sharpe) top.beat++; if (oo > 0 && oo > bhs[s].sharpe && tr >= 5) surv.push({ j: j, s: s, f: f, is: is, oos: oo, ret: rt, trades: tr }); }
    }
    surv.sort(function (x, y) { return y.oos - x.oos; });
    var sx = [], sy = []; for (var q = 0; q < scatter.length; q++) { sx.push(scatter[q][0]); sy.push(scatter[q][1]); }
    var rank = function (xs) { var idx = xs.map(function (_, i) { return i; }).sort(function (p, r) { return xs[p] - xs[r]; }), rk = new Array(xs.length); idx.forEach(function (i, r) { rk[i] = r; }); return rk; }, rx = rank(sx), ry = rank(sy), mx = mean(rx), my = mean(ry), nu = 0, dx = 0, dy = 0;
    for (q = 0; q < rx.length; q++) { nu += (rx[q] - mx) * (ry[q] - my); dx += (rx[q] - mx) * (rx[q] - mx); dy += (ry[q] - my) * (ry[q] - my); }
    var win = 0, hold = 0; cells.forEach(function (r) { r.forEach(function (c) { win += c.win; hold += c.hold; }); });
    return { valid: nValid, total: N, meanIs: mIs, meanOos: mOos, sdIs: sd, top1: { thr: thr, n: top.n, pos: top.pos / top.n, beat: top.beat / top.n, meanOos: top.sumOos / top.n }, top10thr: thr10, best: best, luckMax: sd * Math.sqrt(2 * Math.log(nValid)), spearman: nu / Math.sqrt(dx * dy), winners: win, holdRate: hold / win, survivors: surv.slice(0, 12), survivorCount: surv.length, hist: { is: hIs, oos: hOos }, scatter: scatter, cells: cells.map(function (r, i) { return r.map(function (c, f) { return { series: live[i].id, family: f, n: c.n, win: c.win, hold: c.hold, holdRate: c.win ? c.hold / c.win : null, meanOos: c.win ? c.sumOos / c.win : null }; }); }), bh: bhs.map(function (b, i) { return { series: live[i].id, sharpe: b.sharpe, ret: b.ret }; }) };
  }
  async function verify(res, n, onProgress) {
    var root = res.manifest.merkle_root, rng = mulberry32(parseInt(root.slice(0, 8), 16)), ser = res.live.map(function (s) { return s.S; }), ok = 0, maxErr = 0, bad = [];
    for (var i = 0; i < n; i++) {
      var j = Math.floor(rng() * res.total), cf = config(j, res.seed, ser.length), S = ser[cf[0]], fast = evalFast(S, cf[1], cf[2], cf[3], cf[4]), ref = evalRef(S, cf[1], cf[2], cf[3], cf[4]), st = res.ALL.subarray(j * 6, j * 6 + 6), good = true;
      [[st[2], ref[0], fast[0]], [st[3], ref[1], fast[1]], [st[4], ref[2], fast[2]]].forEach(function (t) { if (t[0] !== t[0] && t[1] !== t[1]) return; var e = Math.max(Math.abs(t[0] - Math.fround(t[1])), Math.abs(Math.fround(t[1]) - Math.fround(t[2]))); if (e > maxErr) maxErr = e; if (!(e < 2e-5 * Math.max(1, Math.abs(t[1])))) good = false; });
      if (good) ok++; else bad.push(j);
      if (i % 100 === 99) { if (onProgress) onProgress(i + 1, n); await new Promise(function (r) { setTimeout(r); }); }
    }
    return { checked: n, matched: ok, maxErr: maxErr, bad: bad.slice(0, 5) };
  }
  async function recheck(manifest, series) {
    return Promise.all(manifest.series.map(async function (m) { try { var r = await fetch(m.url), buf = await r.arrayBuffer(), h = await sha(buf); return { id: m.id, same: h === m.sha256, now: h.slice(0, 12), then: m.sha256.slice(0, 12) }; } catch (e) { return { id: m.id, same: false, err: String(e.message || e) }; } }));
  }
  function curve(S, f, a, b, c) {      // equity of the strategy and of buy-and-hold over the whole series, for plotting
    var P = S.P, R = S.R, c1 = S.c1, c2 = S.c2, n = S.n, start = f === 0 ? b - 1 : f === 1 ? a + c : a - 1, eq = 1, bq = 1, pos = 0, prev = 0, sig, m, v, z, E = [], B = [];
    for (var t = start; t < n - 1; t++) {
      if (f === 0) sig = (c1[t + 1] - c1[t + 1 - a]) / a > (c1[t + 1] - c1[t + 1 - b]) / b * 1.000000001 ? 1 : 0;
      else if (f === 1) sig = P[t - c] / P[t - c - a] - 1 > b ? 1 : 0;
      else { m = (c1[t + 1] - c1[t + 1 - a]) / a; v = (c2[t + 1] - c2[t + 1 - a]) / a - m * m; z = (P[t] - m) / Math.sqrt(v > 1e-9 ? v : 1e-9); sig = pos === 0 && z < -b ? 1 : pos === 1 && z > c + 1e-5 ? 0 : pos; }
      eq *= 1 + sig * R[t + 1] - (sig !== prev ? 0.001 : 0); bq *= 1 + R[t + 1]; prev = sig; pos = sig; E.push(eq); B.push(bq);
    }
    return { eq: E, bh: B, start: start + 1, split: S.split };
  }
  window.Backtest = { evalFast: evalFast, evalRef: evalRef, SERIES: SERIES, FAMILIES: FAMILIES, load: load, run: run, analyze: analyze, verify: verify, recheck: recheck, curve: curve, config: config, bh: bh };
})();
