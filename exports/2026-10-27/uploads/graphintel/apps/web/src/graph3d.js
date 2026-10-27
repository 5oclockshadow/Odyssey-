/* Shared 3D graph view for the public site, the research place and the agent space. Needs three.js r147 and OrbitControls (globals).
   Graph3D.mount(el, {onFocus}) → {set(data), destroy()}. data is /public/graph or /owner/graph. Distance from the centre is the fourth axis:
   strong edges pull nodes close, weak ones let them drift out. Grey nodes (not approved for the public) have no label and cannot be focused. */
(function () {
  const COLORS = { agent: 0xc8f43a, organisation: 0xc8f43a, goal: 0xffb02e, question: 0x4cc9f0, claim: 0x3fd68f, source: 0x98a08a, constraint: 0xff5b4a };
  const GREY = 0x4a4f44, DEFAULT = 0xcfd5c2;
  function label(text) {
    const c = document.createElement('canvas'), x = c.getContext('2d'); c.width = 512; c.height = 64;
    x.font = '500 26px "IBM Plex Sans", sans-serif'; x.fillStyle = '#e9ede0'; x.textBaseline = 'middle'; x.fillText(text.length > 34 ? text.slice(0, 33) + '…' : text, 4, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(80, 10, 1); s.center.set(0, 0.5); return s;
  }
  function layout(nodes, edges) {
    const P = {}, ids = nodes.map(n => n.id);
    nodes.forEach((n, i) => { const a = i * 2.4, r = 30 + (n.hop || 0) * 60; P[n.id] = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 80, Math.sin(a) * r); });
    const pairs = []; edges.forEach(e => { for (let i = 1; i < e.members.length; i++) pairs.push([e.members[0], e.members[i], e.w || 0]); });
    for (let it = 0; it < 140; it++) {
      const f = {}; ids.forEach(i => f[i] = new THREE.Vector3());
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const d = P[ids[a]].clone().sub(P[ids[b]]), l = Math.max(d.length(), 1); d.multiplyScalar(900 / (l * l * l)); f[ids[a]].add(d); f[ids[b]].sub(d); }
      pairs.forEach(([a, b, w]) => { if (!P[a] || !P[b]) return; const d = P[b].clone().sub(P[a]), l = Math.max(d.length(), 1), rest = 30 + (1 - Math.min(w, 1)) * 110; d.multiplyScalar((l - rest) * 0.02 / l); f[a].add(d); f[b].sub(d); });
      ids.forEach(i => { f[i].addScaledVector(P[i], -0.004); P[i].addScaledVector(f[i], 1); });
    }
    return P;
  }
  window.Graph3D = {
    load() {
      const add = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src)); document.head.appendChild(s); });
      const B = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';
      return (window.Graph3D._p = window.Graph3D._p || (window.THREE ? Promise.resolve() : add(B + 'build/three.min.js')).then(() => window.THREE.OrbitControls ? 0 : add(B + 'examples/js/controls/OrbitControls.js')));
    },
    mount(el, opts = {}) {
      const W = () => el.clientWidth || 600, H = () => el.clientHeight || 400;
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(W(), H()); el.appendChild(r.domElement);
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, W() / H(), 1, 3000); cam.position.set(0, 120, 260);
      const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.autoRotate = !!opts.autoRotate; ctl.autoRotateSpeed = 0.5;
      const group = new THREE.Group(); scene.add(group); const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let picks = [], alive = true, down = null;
      const loop = () => { if (!alive) return; ctl.update(); r.render(scene, cam); requestAnimationFrame(loop); }; loop();
      const ro = new ResizeObserver(() => { r.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);
      r.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
      r.domElement.addEventListener('pointerup', e => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
        const b = r.domElement.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(mouse, cam);
        const hit = ray.intersectObjects(picks)[0]; if (hit && !hit.object.userData.grey && opts.onFocus) opts.onFocus(hit.object.userData.id);
      });
      let hv = null, tick = 0;
      r.domElement.addEventListener('pointermove', e => {
        if (!opts.onHover || e.buttons || performance.now() - tick < 40) return; tick = performance.now();
        const b = r.domElement.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(mouse, cam);
        const hit = ray.intersectObjects(picks)[0], id = hit ? hit.object.userData.id : null;
        if (id !== hv || id) { hv = id; opts.onHover(id, e.clientX - b.left, e.clientY - b.top, hit ? !!hit.object.userData.grey : false); }
        r.domElement.style.cursor = id && !hit.object.userData.grey ? 'pointer' : 'grab';
      });
      r.domElement.addEventListener('pointerleave', () => { if (opts.onHover && hv) { hv = null; opts.onHover(null); } });
      return {
        set(data) {
          while (group.children.length) { const o = group.children.pop(); o.geometry && o.geometry.dispose(); }
          picks = []; if (!data || !data.nodes) return;
          const P = layout(data.nodes, data.edges), pts = [], gpts = [];
          data.edges.forEach(e => { const t = e.grey ? gpts : pts; for (let i = 1; i < e.members.length; i++) { const a = P[e.members[0]], b = P[e.members[i]]; if (a && b) t.push(a, b); } });
          const lines = (p, c, o) => { if (p.length) group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o }))); };
          lines(gpts, GREY, 0.25); lines(pts, 0x98a08a, 0.55);
          data.nodes.forEach(n => {
            const focus = n.id === data.focus, rad = n.grey ? 2.5 : 3 + Math.min(n.w || 0, 1) * 4 + (focus ? 3 : 0);
            const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 14, 10), new THREE.MeshBasicMaterial({ color: n.grey ? GREY : (COLORS[n.type] || DEFAULT), transparent: !!n.grey, opacity: n.grey ? 0.55 : 1 }));
            m.position.copy(P[n.id]); m.userData = { id: n.id, grey: !!n.grey }; group.add(m); picks.push(m);
            if (!n.grey && (focus || n.hop <= 1 || opts.allLabels)) { const s = label(n.label || n.id); s.position.copy(P[n.id]).add(new THREE.Vector3(rad + 3, 0, 0)); group.add(s); }
          });
          if (P[data.focus]) ctl.target.copy(P[data.focus]);
        },
        destroy() { alive = false; ro.disconnect(); r.dispose(); r.domElement.remove(); },
      };
    },
  };
})();
