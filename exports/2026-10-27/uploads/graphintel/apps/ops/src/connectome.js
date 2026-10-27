/* Connectome: the institute's graph in four dimensions, three of space and one of time. Plain script; needs window.THREE (r158 global build).
   Connectome.mount(el, { onPick, onHover, theme, behaviour, font }) -> { setData, setTime, select, fire, setTheme, setBehaviour, hold, peek, motion, dispose }
   d = { nodes: [{ key, lane, label, t, size, hot, tip }], edges: [{ a, b, t, w }] }; lanes: agent, work, question, claim, source, tool, module, thought.
   Hovering a node holds the brain still (rotation, breathing, shell drift) while its signals, sparks and halos keep running.
   onHover(key, { x, y, w, h }) replaces the built-in tooltip; hold(true) keeps the brain still from outside, e.g. while the pointer is on a hover card.
   setInset(top, bottom) keeps the scene and its labels clear of overlays drawn over the canvas; tick(ms) advances one frame by hand (tests). */
(function () {
  var LOBES = { agent: [[0, 0.4, 0], 1.3], work: [[-3.8, 0.9, 0.9], 2.3], question: [[3.1, 1.5, -0.7], 1.9], claim: [[2.5, -1.9, 1.7], 1.9], source: [[-1.7, -2.3, -1.9], 2.3], tool: [[-0.5, 5.0, -3.8], 1.6], module: [[0.3, -4.8, 3.4], 2.0], thought: [[0.6, 2.4, 4.8], 1.7] };
  var HEX = { agent: 0xf6efe0, work: 0x7b93ff, question: 0xff7a59, claim: 0xc29bff, source: 0x6fe3a2, tool: 0xffc857, module: 0x8fb0d6, thought: 0xfff1c9 };
  var SIZE = { agent: 0.34, work: 0.13, question: 0.24, claim: 0.17, source: 0.19, tool: 0.15, module: 0.2, thought: 0.1 };
  var THEME = { bg: 0x06070b, fog: 0.04, shell: 0x33406a, shellOpacity: 0.07, halo: 0.12, haloSize: 2.6, flow: 0xffffff, spark: 0xfff1c9, labelBg: 'rgba(8,10,16,.74)', labelInk: '#cfd6e6', labelSel: '#ffffff', labelLine: 'rgba(255,255,255,.2)', lanes: null };
  var MOTION = { autoRotate: true, rotateSpeed: 1, breathe: 1, flowSpeed: 1, flowDensity: 1, sparks: true, hoverPause: true, idleResume: 8, labels: 'agents', shell: true, halo: true, edges: 1 };
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) if (b[k] != null) o[k] = b[k]; return o; }
  function h32(s, k) { var h = 2166136261 ^ k; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
  function mount(el, opts) {
    var T = window.THREE; opts = opts || {};
    if (!T) { el.innerHTML = '<div style="padding:20px;color:#9aa3b8">The 4D view needs three.js, which did not load.</div>'; return null; }
    var pickCb = opts.onPick || function () {}, hoverCb = typeof opts.onHover === 'function' ? opts.onHover : null;
    var TH = merge(THEME, opts.theme), BH = merge(MOTION, opts.behaviour), PAL = merge(HEX, TH.lanes);
    var R = new T.WebGLRenderer({ antialias: true }); R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.setClearColor(new T.Color(TH.bg), 1);
    var cv = R.domElement; cv.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none;'; el.appendChild(cv);
    var ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:' + (opts.font || '500 11px "DM Sans",system-ui,sans-serif') + ';'; el.appendChild(ov);
    var S = new T.Scene(); S.fog = new T.FogExp2(new T.Color(TH.bg).getHex(), TH.fog);
    var C = new T.PerspectiveCamera(48, 1, 0.1, 300);
    var shell = new T.Mesh(new T.SphereGeometry(1, 48, 28), new T.MeshBasicMaterial({ color: new T.Color(TH.shell), wireframe: true, transparent: true, opacity: TH.shellOpacity, depthWrite: false }));
    shell.scale.set(7.6, 5.4, 6.2); S.add(shell);
    var G = new T.Group(); S.add(G);
    var geo = new T.SphereGeometry(1, 14, 10);
    var N = [], E = [], K = {}, core = null, halo = null, lines = null, pts = null, PMAX = 0, tNow = Infinity, selKey = '', hovKey = '', extHold = false, rel = null, BORN = 6 * 3600, spark = null, sparks = [], flash = [], SP = 48, bt = 0, ins = { t: 0, b: 0 };
    var st = { rx: 0.32, ry: 0.7, d: 17, auto: true, idle: 0, target: new T.Vector3() };
    var m4 = new T.Matrix4(), q = new T.Quaternion(), v3 = new T.Vector3(), sc = new T.Vector3(), col = new T.Color(), tgt = new T.Vector3();
    function lobe(n) { return n.home ? [n.home, n.hr || 1.8] : LOBES[n.lane] || LOBES.claim; }   // n.home: a cluster centre of the caller's choosing (e.g. one per app)
    function tint(lane, d) { var v = PAL[lane]; return v != null ? v : d; }
    function held() { return extHold || (BH.hoverPause && !!hovKey); }
    function place(nodes, edges) {
      var pos = nodes.map(function (n) { var L = lobe(n), c = L[0], r = L[1], a = h32(n.key, 1) * Math.PI * 2, b = Math.acos(2 * h32(n.key, 2) - 1), rr = r * Math.cbrt(h32(n.key, 3)); return [c[0] + rr * Math.sin(b) * Math.cos(a), c[1] + rr * Math.cos(b) * 0.8, c[2] + rr * Math.sin(b) * Math.sin(a)]; });
      var subs = nodes.map(function (n, i) { return n.lane === 'agent' && n.key !== 'a:sextant' ? i : -1; }).filter(function (i) { return i >= 0; });
      nodes.forEach(function (n, i) { if (n.key === 'a:sextant') pos[i] = [0, 0.6, 0]; });
      subs.forEach(function (i, k) { var ang = (k / Math.max(1, subs.length)) * Math.PI * 2; pos[i] = [Math.cos(ang) * 6.4, 3.6 + Math.sin(ang * 2) * 0.4, Math.sin(ang) * 6.4]; });
      var ix = {}; nodes.forEach(function (n, i) { ix[n.key] = i; });
      var pairs = edges.map(function (e) { return [ix[e.a], ix[e.b]]; }).filter(function (p) { return p[0] != null && p[1] != null; });
      for (var it = 0; it < 60; it++) {
        var f = pos.map(function () { return [0, 0, 0]; });
        pairs.forEach(function (p) { for (var k = 0; k < 3; k++) { var d = (pos[p[1]][k] - pos[p[0]][k]) * 0.012; f[p[0]][k] += d; f[p[1]][k] -= d; } });
        if (nodes.length < 500) for (var i = 0; i < pos.length; i++) for (var j = i + 1; j < pos.length; j++) {
          var dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], dz = pos[i][2] - pos[j][2], d2 = dx * dx + dy * dy + dz * dz + 0.01;
          if (d2 < 1.2) { var s = 0.02 / d2; f[i][0] += dx * s; f[i][1] += dy * s; f[i][2] += dz * s; f[j][0] -= dx * s; f[j][1] -= dy * s; f[j][2] -= dz * s; }
        }
        nodes.forEach(function (n, i) {
          if (n.lane === 'agent' && !n.home) return;
          var L = lobe(n), c = L[0], r = L[1] * 1.35;
          for (var k = 0; k < 3; k++) pos[i][k] += f[i][k] + (c[k] - pos[i][k]) * 0.01;
          var dx = pos[i][0] - c[0], dy = pos[i][1] - c[1], dz = pos[i][2] - c[2], d = Math.hypot(dx, dy, dz);
          if (d > r) { var s = r / d; pos[i] = [c[0] + dx * s, c[1] + dy * s, c[2] + dz * s]; }
        });
      }
      return pos;
    }
    function clear() { [core, halo, lines, pts, spark].forEach(function (o) { if (!o) return; G.remove(o); if (o.geometry !== geo) o.geometry.dispose(); o.material.dispose(); }); core = halo = lines = pts = spark = null; sparks = []; flash = []; }
    function vis(n) { return (n.t || 0) <= tNow; }
    function look() {
      R.setClearColor(new T.Color(TH.bg), 1); S.fog.color.set(TH.bg); S.fog.density = TH.fog;
      shell.material.color.set(TH.shell); shell.material.opacity = TH.shellOpacity; shell.visible = !!BH.shell;
      if (halo) halo.visible = !!BH.halo;
      if (lines) lines.material.opacity = Math.min(1, 0.9 * BH.edges);
      if (pts) pts.material.color.set(TH.flow);
      if (spark) spark.material.color.set(TH.spark);
    }
    function paint() {
      if (!core) return;
      N.forEach(function (n, i) {
        var on = vis(n), dim = rel && !rel.has(n.key), fresh = on && tNow !== Infinity && tNow - (n.t || 0) < BORN;
        var s = on ? n.s * (n.key === selKey ? 1.8 : n.key === hovKey ? 1.6 : fresh ? 1.3 : 1) : 0.0001;
        m4.compose(n.p, q, sc.set(s, s, s)); core.setMatrixAt(i, m4);
        m4.compose(n.p, q, sc.set(s * TH.haloSize, s * TH.haloSize, s * TH.haloSize)); halo.setMatrixAt(i, m4);
        col.set(tint(n.lane, 0xaaaaaa)).multiplyScalar(dim && n.key !== hovKey ? 0.16 : n.hot || n.key === hovKey ? 1.3 : 1); core.setColorAt(i, col); halo.setColorAt(i, col);
      });
      core.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true;
      if (core.instanceColor) core.instanceColor.needsUpdate = true; if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
      var lc = lines.geometry.attributes.color;
      E.forEach(function (e, i) {
        var a = N[K[e.a]], b = N[K[e.b]], k = 0;
        if (a && b && vis(a) && vis(b) && (e.t || 0) <= tNow) { k = rel ? (rel.has(e.a) && rel.has(e.b) ? 0.95 : 0.03) : 0.1 + 0.5 * Math.min(1, e.w == null ? 0.4 : e.w); if (hovKey && (e.a === hovKey || e.b === hovKey)) k = Math.max(k, 0.9); }
        col.set(tint((a || {}).lane, 0x888888)).multiplyScalar(k); lc.setXYZ(i * 2, col.r, col.g, col.b);
        col.set(tint((b || {}).lane, 0x888888)).multiplyScalar(k); lc.setXYZ(i * 2 + 1, col.r, col.g, col.b);
      });
      lc.needsUpdate = true;
    }
    var tags = [];
    function labels() {
      tags.forEach(function (t) { t.el.remove(); }); tags.length = 0;
      var mode = BH.labels;
      N.filter(function (n) { if (mode === 'none') return false; if (n.key === selKey) return true; if (rel && rel.has(n.key) && n.lane !== 'work') return true; return mode === 'agents' && n.lane === 'agent'; }).sort(function (a, b) { return ((b.key === selKey) - (a.key === selKey)) || ((a.lane === 'agent' ? 0 : 1) - (b.lane === 'agent' ? 0 : 1)); }).slice(0, 28).forEach(function (n) {
        var b = document.createElement('button'); b.textContent = n.label;
        b.style.cssText = 'display:none;position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis;padding:2px 8px;border-radius:999px;border:1px solid ' + TH.labelLine + ';background:' + TH.labelBg + ';font:inherit;color:' + (n.key === selKey ? TH.labelSel : TH.labelInk) + ';';
        b.onclick = function (ev) { ev.stopPropagation(); pickCb(n.key); };
        ov.appendChild(b); tags.push({ el: b, n: n });
      });
    }
    function setData(d) {
      clear(); hovKey = '';
      N = (d.nodes || []).map(function (n) { return Object.assign({}, n); });
      K = {}; N.forEach(function (n, i) { K[n.key] = i; });
      E = (d.edges || []).filter(function (e) { return e.a !== e.b && K[e.a] != null && K[e.b] != null; });
      var pos = place(N, E);
      N.forEach(function (n, i) { n.p = new T.Vector3(pos[i][0], pos[i][1], pos[i][2]); n.s = (SIZE[n.lane] || 0.16) * (n.size || 1); });
      var ext = 0; N.forEach(function (n) { ext = Math.max(ext, n.p.length()); }); if (!st.framed) { st.d = Math.max(14, Math.min(36, ext * 2.4)); st.framed = true; }
      var cnt = Math.max(1, N.length);
      core = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: 0xffffff }), cnt);
      halo = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: TH.halo, blending: T.AdditiveBlending, depthWrite: false }), cnt);
      core.count = halo.count = N.length; G.add(halo); G.add(core);
      var lp = new Float32Array(Math.max(1, E.length) * 6), lcol = new Float32Array(Math.max(1, E.length) * 6);
      E.forEach(function (e, i) { var a = N[K[e.a]].p, b = N[K[e.b]].p; lp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); });
      var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('color', new T.BufferAttribute(lcol, 3)); lg.setDrawRange(0, E.length * 2);
      lines = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); G.add(lines);
      PMAX = Math.min(360, E.length);
      var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(new Float32Array(Math.max(1, PMAX) * 3), 3));
      pts = new T.Points(pg, new T.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); G.add(pts);
      look(); paint(); labels();
    }
    function setTime(t) { tNow = t == null ? Infinity : t; paint(); }
    function select(key, related) {
      selKey = key || ''; rel = related && related.size ? related : null; paint(); labels();
      var n = N[K[selKey]]; if (n) { st.target.copy(n.p); st.auto = false; st.idle = 0; } else st.target.set(0, 0, 0);
    }
    function fire(keys, fromKey) {
      if (!core || !BH.sparks) return;
      if (!spark) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(SP * 3), 3)); spark = new T.Points(g, new T.PointsMaterial({ color: new T.Color(TH.spark), size: 0.34, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false })); G.add(spark); }
      var src = N[K[fromKey]], a = src ? src.p : new T.Vector3(0, 0.6, 0), t = performance.now();
      (keys || []).forEach(function (k, j) { var n = N[K[k]]; if (n && vis(n)) sparks.push({ a: a.clone(), b: n.p.clone(), t0: t + j * 90, i: K[k] }); });
      if (sparks.length > SP) sparks.splice(0, sparks.length - SP);
    }
    function screenOf(n) { G.updateMatrixWorld(); C.updateMatrixWorld(); var w = cv.clientWidth, h = cv.clientHeight; v3.copy(n.p).applyMatrix4(G.matrixWorld).project(C); return { x: Math.round((v3.x + 1) / 2 * w), y: Math.round((1 - v3.y) / 2 * h), w: w, h: h }; }
    function setHover(n) { var k = n ? n.key : ''; if (k === hovKey) return; hovKey = k; paint(); if (hoverCb) hoverCb(k, n ? screenOf(n) : null); }
    var drag = null, ray = new T.Raycaster(), mv = new T.Vector2();
    function hit(e) {
      if (!core) return null; var r = cv.getBoundingClientRect();
      mv.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mv, C);
      var h = ray.intersectObject(core)[0], n = h && h.instanceId != null ? N[h.instanceId] : null;
      return n && vis(n) ? n : null;
    }
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; st.auto = false; st.idle = 0; });
    cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; st.ry += dx * 0.006; st.rx = Math.max(-1.3, Math.min(1.3, st.rx + dy * 0.006)); if (drag.moved > 6 && hovKey) setHover(null); });
    cv.addEventListener('pointerup', function (e) { cv.style.cursor = 'grab'; var was = drag; drag = null; if (was && was.moved < 6) { var n = hit(e); pickCb(n ? n.key : ''); } });
    var tipEl = document.createElement('div'); tipEl.style.cssText = 'position:absolute;pointer-events:none;display:none;max-width:260px;padding:6px 9px;border-radius:8px;background:rgba(8,10,16,.92);border:1px solid rgba(255,255,255,.18);color:#e9ede0;font:500 11.5px/1.4 "DM Sans",system-ui,sans-serif;z-index:3;'; ov.appendChild(tipEl);
    function hover(e) {
      if (drag || !core) return;
      var n = hit(e); setHover(n); cv.style.cursor = n ? 'pointer' : 'grab';
      if (hoverCb) return;
      if (n) { var r = cv.getBoundingClientRect(); tipEl.textContent = n.label + (n.tip ? ' · ' + n.tip : ''); tipEl.style.display = 'block'; tipEl.style.left = Math.max(4, Math.min(r.width - 270, e.clientX - r.left + 14)) + 'px'; tipEl.style.top = Math.max(4, e.clientY - r.top + 14) + 'px'; } else tipEl.style.display = 'none';
    }
    cv.addEventListener('pointermove', hover); cv.addEventListener('pointerleave', function () { tipEl.style.display = 'none'; if (!drag) setHover(null); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); st.d = Math.max(5, Math.min(40, st.d * (1 + Math.sign(e.deltaY) * 0.08))); st.idle = 0; }, { passive: false });
    function view() { var w = el.clientWidth || 600, h = el.clientHeight || 420; R.setSize(w, h, false); C.aspect = w / h; if (ins.t || ins.b) C.setViewOffset(w, h, 0, -(ins.t - ins.b) / 2, w, h); else C.clearViewOffset(); C.updateProjectionMatrix(); }
    var ro = new ResizeObserver(view); ro.observe(el);
    var raf = 0, last = performance.now(), phase = 0;
    function frame(now) { raf = requestAnimationFrame(frame); advance(now); }
    function advance(now) {
      var dt = Math.min(0.05, (now - last) / 1000), still = held(); last = now; st.idle += dt; if (st.idle > BH.idleResume) st.auto = true;
      if (st.auto && BH.autoRotate && !still) st.ry += dt * 0.08 * BH.rotateSpeed;
      tgt.lerp(st.target, 0.06);
      C.position.set(tgt.x + st.d * Math.cos(st.rx) * Math.sin(st.ry), tgt.y + st.d * Math.sin(st.rx), tgt.z + st.d * Math.cos(st.rx) * Math.cos(st.ry)); C.lookAt(tgt);
      if (!still) { if (BH.autoRotate) shell.rotation.y += dt * 0.01 * BH.rotateSpeed; bt += dt; }
      var br = 1 + 0.016 * BH.breathe * Math.sin(bt * 1.1); G.scale.set(br, br, br); if (halo) halo.material.opacity = TH.halo + 0.06 * Math.sin(now * 0.0017);
      if (spark) { var sa = spark.geometry.attributes.position, j2 = 0; sparks = sparks.filter(function (sp) { var f = (now - sp.t0) / 900; if (f > 1) { flash.push({ i: sp.i, t0: now }); return false; } if (f >= 0 && j2 < SP) { var e = 1 - Math.pow(1 - f, 3); sa.setXYZ(j2++, sp.a.x + (sp.b.x - sp.a.x) * e, sp.a.y + (sp.b.y - sp.a.y) * e, sp.a.z + (sp.b.z - sp.a.z) * e); } return true; }); for (; j2 < SP; j2++) sa.setXYZ(j2, 0, -999, 0); sa.needsUpdate = true; }
      if (flash.length && core) { flash = flash.filter(function (fl) { var n = N[fl.i]; if (!n) return false; var age = (now - fl.t0) / 700, s = !vis(n) ? 0.0001 : n.s * (age < 1 ? 1 + 1.4 * (1 - age) : (n.key === selKey ? 1.8 : n.key === hovKey ? 1.6 : 1)); m4.compose(n.p, q, sc.set(s, s, s)); core.setMatrixAt(fl.i, m4); m4.compose(n.p, q, sc.set(s * TH.haloSize, s * TH.haloSize, s * TH.haloSize)); halo.setMatrixAt(fl.i, m4); core.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true; return age < 1; }); }
      if (pts && PMAX && E.length) {
        var Pn = Math.min(PMAX, Math.round(180 * BH.flowDensity)); phase += dt * 0.45 * BH.flowSpeed; var a = pts.geometry.attributes.position, j = 0;
        for (var i = 0; i < E.length && j < Pn; i++) {
          var e = E[Math.abs((i * 7 + Math.floor(phase)) | 0) % E.length]; if (!e) continue; var x = N[K[e.a]], y = N[K[e.b]]; if (!x || !y) continue;
          if (!vis(x) || !vis(y) || (rel && !(rel.has(e.a) && rel.has(e.b)))) continue;
          var f = (phase + i * 0.137) % 1; a.setXYZ(j++, x.p.x + (y.p.x - x.p.x) * f, x.p.y + (y.p.y - x.p.y) * f, x.p.z + (y.p.z - x.p.z) * f);
        }
        for (; j < PMAX; j++) a.setXYZ(j, 0, -999, 0); a.needsUpdate = true;
      }
      R.render(S, C);
      var w = cv.clientWidth, h = cv.clientHeight;
      var placed = [];
      tags.forEach(function (t) {
        v3.copy(t.n.p).applyMatrix4(G.matrixWorld).project(C); var x = (v3.x + 1) / 2 * w, y = (1 - v3.y) / 2 * h, show = vis(t.n) && v3.z < 1;
        if (show) { var bw = t.w || (t.w = t.el.offsetWidth) || 90; x = Math.max(bw / 2 + 4, Math.min(w - bw / 2 - 4, x)); y = Math.max(Math.max(34, ins.t + 30), Math.min(h - 4 - ins.b, y)); var r = [x - bw / 2 - 3, y - 30, x + bw / 2 + 3, y - 8]; if (t.n.lane !== 'agent' && t.n.key !== selKey && placed.some(function (p) { return r[0] < p[2] && p[0] < r[2] && r[1] < p[3] && p[1] < r[3]; })) show = false; else placed.push(r); }
        t.el.style.display = show ? '' : 'none'; if (show) t.el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-150%)';
      });
    }
    raf = requestAnimationFrame(frame);
    return {
      setData: setData, setTime: setTime, select: select, fire: fire,
      setTheme: function (t) { TH = merge(THEME, t); PAL = merge(HEX, TH.lanes); look(); paint(); labels(); },
      setBehaviour: function (b) { BH = merge(BH, b); look(); labels(); },
      hold: function (on) { extHold = !!on; },
      setInset: function (t, b) { ins = { t: Math.max(0, t || 0), b: Math.max(0, b || 0) }; view(); },
      tick: function (ms) { advance(last + (ms || 16)); },
      peek: function (key) { var n = N[K[key]]; n = n && vis(n) ? n : null; setHover(n); return n ? screenOf(n) : null; },
      motion: function () { return { held: held(), hover: hovKey, ry: st.ry, breath: G.scale.x, flow: phase, auto: st.auto && BH.autoRotate }; },
      dispose: function () { cancelAnimationFrame(raf); ro.disconnect(); clear(); geo.dispose(); shell.geometry.dispose(); shell.material.dispose(); R.dispose(); cv.remove(); ov.remove(); }
    };
  }
  window.Connectome = { mount: mount };
})();
