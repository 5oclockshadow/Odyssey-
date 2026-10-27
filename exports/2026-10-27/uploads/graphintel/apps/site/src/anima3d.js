/* Anima 3D: the self-running hero and the query explorer. three r147 + OrbitControls as globals (loaded on demand).
   Colours come from the page's CSS tokens, so a theme change recolours the scene on the next set()/go(). */
(function () {
  const B = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';
  const add = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src)); document.head.appendChild(s); });
  const tok = n => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#9184d9');
  const ring = (el, cam, r) => { const W = () => el.clientWidth || 600, H = () => el.clientHeight || 400; r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(W(), H()); el.appendChild(r.domElement);
    const ro = new ResizeObserver(() => { r.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el); return ro; };
  const fib = (n, R) => Array.from({ length: n }, (_, i) => { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.39996; return new THREE.Vector3(Math.cos(t) * r * R, y * R, Math.sin(t) * r * R); });

  function hero(el) {
    const N = 96, cam = new THREE.PerspectiveCamera(50, 1, 1, 2000), r = new THREE.WebGLRenderer({ antialias: true, alpha: true }), ro = ring(el, cam, r);
    cam.position.set(0, 0, 330); const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    const home = fib(N, 120), scatter = home.map(() => new THREE.Vector3((Math.random() - .5) * 900, (Math.random() - .5) * 600, (Math.random() - .5) * 600));
    const branch = home.map(p => p.x < 0 ? 0 : 1), split = home.map((p, i) => p.clone().multiplyScalar(0.8).add(new THREE.Vector3(branch[i] ? 55 : -55, 0, 0)));
    const pos = scatter.map(p => p.clone()), geo = new THREE.SphereGeometry(2.6, 12, 8), A = tok('--color-accent'), L = tok('--color-accent-200'), G = tok('--color-neutral-500');
    const mats = [new THREE.MeshBasicMaterial({ color: A }), new THREE.MeshBasicMaterial({ color: L })], dots = home.map((_, i) => { const m = new THREE.Mesh(geo, mats[branch[i]]); root.add(m); return m; });
    const pairs = []; home.forEach((p, i) => home.map((q, j) => [j, p.distanceTo(q)]).filter(([j]) => j > i).sort((a, b) => a[1] - b[1]).slice(0, 3).forEach(([j]) => pairs.push([i, j])));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
    const lm = new THREE.LineBasicMaterial({ color: G, transparent: true, opacity: 0 }); root.add(new THREE.LineSegments(lg, lm));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(46, 1), new THREE.MeshBasicMaterial({ color: A, wireframe: true, transparent: true, opacity: .55 })); root.add(core);
    const pulses = Array.from({ length: 28 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: L, transparent: true, opacity: 0 })); root.add(m); return { m, e: 0, t: Math.random() }; });
    let slide = 0, coreTo = 1, edgeTo = 0, pulseTo = 0, alive = true, mx = 0, my = 0;
    el.addEventListener('pointermove', e => { const b = el.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width - .5; my = (e.clientY - b.top) / b.height - .5; });
    const loop = () => { if (!alive) return; requestAnimationFrame(loop);
      const tgt = slide === 0 ? home : slide === 1 ? split : home;
      pos.forEach((p, i) => { p.lerp(tgt[i], slide === 0 ? .025 : .05); dots[i].position.copy(p); });
      const a = lg.attributes.position.array; pairs.forEach(([i, j], k) => { a.set([pos[i].x, pos[i].y, pos[i].z, pos[j].x, pos[j].y, pos[j].z], k * 6); }); lg.attributes.position.needsUpdate = true;
      lm.opacity += (edgeTo - lm.opacity) * .04; const s = core.scale.x + (coreTo - core.scale.x) * .04; core.scale.setScalar(s); core.rotation.y += .006; core.rotation.x += .002;
      pulses.forEach(p => { p.t += .012; if (p.t > 1) { p.t = 0; p.e = (Math.random() * pairs.length) | 0; } const [i, j] = pairs[p.e]; p.m.position.lerpVectors(pos[i], pos[j], p.t); p.m.material.opacity += (pulseTo - p.m.material.opacity) * .05; });
      root.rotation.y += .0016; root.rotation.x += (my * .35 - root.rotation.x) * .03; cam.position.x += (mx * 80 - cam.position.x) * .03; cam.lookAt(0, 0, 0); r.render(scene, cam); };
    loop();
    return {
      go(i, rung = 1) { slide = i; edgeTo = i === 0 ? .35 : .5; pulseTo = i >= 3 ? 1 : 0; coreTo = i === 2 ? rung : i === 3 ? .14 : 1;
        const A2 = tok('--color-accent'), L2 = tok('--color-accent-200'); mats[0].color.copy(A2); mats[1].color.copy(i === 1 ? L2 : A2); core.material.color.copy(A2); },
      destroy() { alive = false; ro.disconnect(); r.dispose(); r.domElement.remove(); },
    };
  }

  function explorer(el, opts = {}) {
    const cam = new THREE.PerspectiveCamera(52, 1, 1, 3000), r = new THREE.WebGLRenderer({ antialias: true, alpha: true }), ro = ring(el, cam, r);
    cam.position.set(0, 90, 300); const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
    const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = .4;
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let picks = [], P = {}, meshes = {}, edgeLines = [], alive = true, timers = [];
    const loop = () => { if (!alive) return; requestAnimationFrame(loop); ctl.update(); Object.values(meshes).forEach(m => { const k = m.userData.lit ? 1.6 : 1; m.scale.setScalar(m.scale.x + (k - m.scale.x) * .12); }); r.render(scene, cam); }; loop();
    const hit = e => { const b = r.domElement.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(mouse, cam); const h = ray.intersectObjects(picks)[0]; return [h && h.object.userData, e.clientX - b.left, e.clientY - b.top]; };
    let down = null; r.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; ctl.autoRotate = false; });
    r.domElement.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) { const [u] = hit(e); u && opts.onPick && opts.onPick(u.id, u.grey); } });
    r.domElement.addEventListener('pointermove', e => { if (e.buttons || !opts.onHover) return; const [u, x, y] = hit(e); opts.onHover(u ? u.id : null, x, y); r.domElement.style.cursor = u ? 'pointer' : 'grab'; });
    function layout(nodes, edges) {
      const ids = nodes.map(n => n.id), Q = {}; nodes.forEach((n, i) => { const a = i * 2.4, rr = 40 + (n.ring || 0) * 55; Q[n.id] = new THREE.Vector3(Math.cos(a) * rr, (Math.random() - .5) * 70, Math.sin(a) * rr); });
      for (let it = 0; it < 160; it++) { const f = {}; ids.forEach(i => f[i] = new THREE.Vector3());
        for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const d = Q[ids[a]].clone().sub(Q[ids[b]]), l = Math.max(d.length(), 1); d.multiplyScalar(1100 / (l * l * l)); f[ids[a]].add(d); f[ids[b]].sub(d); }
        edges.forEach(([a, b]) => { if (!Q[a] || !Q[b]) return; const d = Q[b].clone().sub(Q[a]), l = Math.max(d.length(), 1); d.multiplyScalar((l - 55) * .02 / l); f[a].add(d); f[b].sub(d); });
        ids.forEach(i => { f[i].addScaledVector(Q[i], -.004); Q[i].add(f[i]); }); }
      return Q;
    }
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    return {
      set(data) { clear(); while (group.children.length) { const o = group.children.pop(); o.geometry && o.geometry.dispose(); }
        picks = []; meshes = {}; edgeLines = []; P = layout(data.nodes, data.edges);
        const A = tok('--color-accent'), C = { thesis: A, brain: A, branch: tok('--color-accent-300'), seed: tok('--color-accent-200'), substrate: tok('--color-neutral-200'), hypothesis: tok('--color-accent-400'), source: tok('--color-neutral-400'), private: tok('--color-neutral-300') }, GREY = tok('--color-neutral-700'), E = tok('--color-neutral-600');
        data.edges.forEach(([a, b]) => { if (!P[a] || !P[b]) return; const m = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P[a], P[b]]), new THREE.LineBasicMaterial({ color: E, transparent: true, opacity: .45 })); m.userData = { a, b }; group.add(m); edgeLines.push(m); });
        data.nodes.forEach(n => { const rad = n.grey ? 2.4 : 2.8 + (n.w || .4) * 4.5, m = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 12), new THREE.MeshBasicMaterial({ color: n.grey ? GREY : (C[n.type] || A) }));
          m.position.copy(P[n.id]); m.userData = { id: n.id, grey: !!n.grey, base: m.material.color.clone() }; group.add(m); picks.push(m); meshes[n.id] = m; }); },
      /* steps: [[ids...], [ids...]] lit one wave at a time; edges between lit nodes light too. */
      run(steps, ms = 520) { clear(); const lit = new Set(), A = tok('--color-accent'), D = tok('--color-neutral-700');
        Object.values(meshes).forEach(m => { m.userData.lit = false; m.material.color.copy(steps.length ? D : m.userData.base); }); edgeLines.forEach(l => { l.material.opacity = steps.length ? .12 : .45; l.material.color.copy(tok('--color-neutral-600')); });
        steps.forEach((wave, k) => timers.push(setTimeout(() => { wave.forEach(id => { lit.add(id); const m = meshes[id]; if (m) { m.userData.lit = true; m.material.color.copy(m.userData.base); } });
          edgeLines.forEach(l => { if (lit.has(l.userData.a) && lit.has(l.userData.b)) { l.material.opacity = .95; l.material.color.copy(A); } }); opts.onWave && opts.onWave(k); }, k * ms))); },
      focus(id) { if (P[id]) ctl.target.lerp(P[id], .6); },
      destroy() { alive = false; clear(); ro.disconnect(); r.dispose(); r.domElement.remove(); },
    };
  }
  window.Anima3D = { load: () => (window.Anima3D._p = window.Anima3D._p || (window.THREE ? Promise.resolve() : add(B + 'build/three.min.js')).then(() => THREE.OrbitControls ? 0 : add(B + 'examples/js/controls/OrbitControls.js'))), hero, explorer };
})();
