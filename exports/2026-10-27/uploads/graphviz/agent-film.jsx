/* agent-film.jsx — "The agent is the graph" (v2), on lab-engine.js.
   Every frame is a pure function of authored time T. */
const FW = 1920, FH = 1080;
const MOTION = {
  enter: (T, a, d = 0.8) => Easing.easeOutCubic(clamp((T - a) / d, 0, 1)),
  draw: (T, a, d = 1.2) => Easing.easeInOutCubic(clamp((T - a) / d, 0, 1)),
  pop: (T, a, d = 0.5) => Easing.easeOutBack(clamp((T - a) / d, 0, 1)),
};
const fade = (T, a, b, d = 0.6) => Math.min(MOTION.enter(T, a, d), 1 - MOTION.enter(T, b - d, d));
const lerp = (a, b, u) => a + (b - a) * u;

// Query beat, seconds after CUES.Query
const Q = { type0: 0.6, type1: 2.6, parse: 2.8, seed: 3.8, spread0: 4.8, spread1: 7.8, reason: 8.2, lift: 10.4, answer: 12.4, metric: 15.0 };
const STEP_AT = [Q.parse, Q.seed, Q.spread0, Q.reason, Q.lift, Q.answer, Q.metric];

const CAPS = {
  Volume: ['01', 'Data is the graph', '119 concepts in 16 communities, linked by belongs-to, uses and analogy edges.'],
  Agent: ['02', 'The agent is the graph', 'A DSPy program is a graph of modules. Its eight modules sit in the same volume as the data.'],
  Force: ['03', 'Tool · Force 3D', 'Edges pull, nodes repel. Communities settle into clusters.'],
  Hypergraph: ['04', 'Tool · Hypergraph', 'Each hull is one hyperedge: a relation among all its members at once.'],
  Simplicial: ['05', 'Tool · Simplicial complex', 'Points within ε join; triples that all touch fill as triangles.'],
  Tesseract: ['06', 'Tool · Tesseract 4D', '16 communities on the 16 vertices of a hypercube, rotating through w.'],
  Hyperbolic: ['07', 'Tool · Hyperbolic ball', 'The belongs-to tree in a Poincaré ball. Depth pushes toward the rim.'],
  Query: ['08', 'A run is activation', 'The query lights seed nodes; activation spreads through data and modules alike.'],
  Compile: ['09', 'Compile', 'BootstrapFewShot-style search tunes the spreading weights against recall on the trainset.'],
  Coda: ['', '', ''],
};

function useWorld() {
  return React.useMemo(() => {
    const G = LabEngine.graph(AtlasCorpus), agent = LabEngine.agent(G);
    const cmp = agent.compile();
    const run = agent.run(AtlasCorpus.film.text, cmp.params);
    return { G, agent, cmp, run };
  }, []);
}

function buildPulses(W, CUES) {
  const { G, run } = W, nc = G.nc, hub = k => nc + k, P = [];
  const add = (a, b, ts, d = 0.6) => P.push({ a, b, ts, d });
  const A = CUES.Agent + 2.6;
  for (let k = 0; k < 7; k++) add(hub(k), hub(k + 1), A + k * 0.7 + 0.35, 0.55);
  [0, 3, 5].forEach(k => add(hub(7), hub(k), A + 5.4, 0.9));
  const q = CUES.Query;
  STEP_AT.slice(0, -1).forEach((t, k) => add(hub(k), hub(k + 1), q + STEP_AT[k + 1] - 0.5, 0.5));
  run.seeds.forEach(s => add(hub(1), s, q + Q.seed, 0.6));
  const H = run.hops.length - 1, hd = (Q.spread1 - Q.spread0) / H;
  for (let h = 1; h <= H; h++) {
    const prev = run.hops[h - 1], cur = run.hops[h]; let c = 0;
    for (let u = 0; u < nc && c < 70; u++) if (prev[u] > 0.3) G.adj[u].forEach(([v]) => { if (v < nc && cur[v] > 0.15 && c < 70) { add(u, v, q + Q.spread0 + (h - 1) * hd, 0.6); c++; } });
  }
  run.tool.ev.forEach(i => add(hub(3), i, q + Q.reason + 0.3, 0.8));
  run.sub.forEach(i => add(i, hub(4), q + Q.lift, 0.7));
  run.sub.slice(0, 4).forEach(i => add(i, hub(5), q + Q.answer, 0.7));
  const c = CUES.Compile;
  add(hub(6), hub(7), c + 0.3, 0.6);
  [1.2, 3.2, 5.2].forEach(t => [0, 3, 5].forEach(k => add(hub(7), hub(k), c + t, 0.9)));
  return P;
}

function formAt(T, CUES, run) {
  const seq = [[0, 'force'], [CUES.Hypergraph, 'hyper'], [CUES.Simplicial, 'simplicial'], [CUES.Tesseract, 'tesseract'], [CUES.Hyperbolic, 'hyperbolic'], [CUES.Query, 'force'], [CUES.Query + Q.reason, run.form], [CUES.Query + Q.answer, 'force']];
  let i = 0; while (i + 1 < seq.length && T >= seq[i + 1][0]) i++;
  const to = seq[i][1], from = i ? seq[i - 1][1] : to;
  return { from, to, tw: from === to ? 1 : clamp((T - seq[i][0]) / 1.6, 0, 1) };
}

function activationAt(T, CUES, run, nc) {
  const q = T - CUES.Query, n = run.act.length, a = new Float32Array(n);
  if (q < Q.seed || T >= CUES.Coda + 4) return { act: a, sub: null };
  let sub = null;
  if (q < Q.spread0) { const u = MOTION.enter(T, CUES.Query + Q.seed, 0.6); run.seeds.forEach(s => a[s] = u); }
  else if (q < Q.spread1) {
    const H = run.hops.length - 1, x = (q - Q.spread0) / (Q.spread1 - Q.spread0) * H, h = Math.min(H - 1, Math.floor(x)), u = Easing.easeInOutCubic(x - h);
    for (let i = 0; i < n; i++) a[i] = lerp(run.hops[h][i], run.hops[h + 1][i], u);
  } else if (q < Q.lift) {
    const u = MOTION.draw(T, CUES.Query + Q.reason + 0.3, 1.0), last = run.hops[run.hops.length - 1];
    for (let i = 0; i < n; i++) a[i] = lerp(last[i], run.act[i], u);
  } else {
    const u = MOTION.draw(T, CUES.Query + Q.lift, 0.9); sub = run.sub;
    for (let i = 0; i < nc; i++) { const inS = run.sub.indexOf(i) >= 0; a[i] = lerp(run.act[i], inS ? Math.max(0.55, run.act[i]) : run.act[i] * 0.12, u); }
  }
  const out = 1 - MOTION.draw(T, CUES.Coda, 3);
  if (out < 1) for (let i = 0; i < n; i++) a[i] *= out;
  return { act: a, sub: out > 0.3 ? sub : null };
}

function hubOnAt(T, CUES, nc) {
  const a = T - (CUES.Agent + 2.6);
  if (T >= CUES.Agent && T < CUES.Force) return a >= 0 && a < 5.6 ? nc + Math.min(7, Math.floor(a / 0.7)) : -1;
  const q = T - CUES.Query;
  if (T >= CUES.Query && T < CUES.Compile) { let k = -1; STEP_AT.forEach((t, i) => { if (q >= t) k = i; }); return k >= 0 ? nc + k : -1; }
  if (T >= CUES.Compile && T < CUES.Coda) return nc + 7;
  return -1;
}

function Stage3D({ W, T, CUES }) {
  const host = React.useRef(null), lab = React.useRef(null), pulses = React.useMemo(() => buildPulses(W, CUES), [W, CUES]);
  React.useEffect(() => { lab.current = LabEngine.lab(host.current, W.G, { manual: true, size: [FW, FH], ui: 2.1 }); return () => lab.current.destroy(); }, [W]);
  React.useLayoutEffect(() => {
    if (!lab.current) return;
    const nc = W.G.nc, f = formAt(T, CUES, W.run), { act, sub } = activationAt(T, CUES, W.run, nc);
    const push = MOTION.draw(T, 0, 7), pull = MOTION.draw(T, CUES.Coda + 1, 5), qz = MOTION.draw(T, CUES.Query, 2) * (1 - MOTION.draw(T, CUES.Compile + 4, 3));
    const dist = lerp(5.6, 2.55, push) - 0.2 * qz + 1.4 * pull;
    const ox = lerp(200, 40, qz) + 300 * pull, oy = 30 * qz;
    const simp = T >= CUES.Simplicial && T < CUES.Tesseract ? lerp(0.12, 0.36, MOTION.draw(T, CUES.Simplicial + 0.8, 5.2)) : 0.26;
    lab.current.renderAt({
      from: f.from, to: f.to, tw: f.tw, ox, oy, yaw: 0.5 + T * 0.055, pitch: 0.26 + 0.07 * Math.sin(T * 0.11), dist,
      theta: T * 0.3, eps: simp, act, sub, hubOn: hubOnAt(T, CUES, nc), hubA: MOTION.draw(T, CUES.Agent + 0.3, 2),
      running: T >= CUES.Query + Q.parse && T < CUES.Coda + 2,
      pulses: pulses.filter(p => T >= p.ts && T < p.ts + p.d).map(p => ({ a: p.a, b: p.b, u: (T - p.ts) / p.d })),
    });
  });
  return <div ref={host} style={{ position: 'absolute', inset: 0 }} />;
}

const K = { fontFamily: 'var(--font-body)', color: 'var(--color-text)' };

function Caption({ T, CUES }) {
  const names = Object.keys(CAPS), i = names.reduce((k, n, j) => (T >= CUES[n] ? j : k), 0), nm = names[i], c = CAPS[nm];
  if (!c[1]) return null;
  const start = CUES[nm], end = i + 1 < names.length ? CUES[names[i + 1]] : start + 10, o = fade(T, start + 0.2, end, 0.5), y = (1 - MOTION.enter(T, start + 0.2, 0.9)) * 18;
  return (
    <div style={{ ...K, position: 'absolute', left: 96, top: 84, maxWidth: 760, opacity: o, transform: `translateY(${y}px)`, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 24, letterSpacing: '0.12em', color: 'var(--color-accent)' }}>{c[0]}</span>
      <span style={{ fontSize: 60, fontWeight: 500, lineHeight: 1.05 }}>{c[1]}</span>
      <span style={{ fontSize: 28, lineHeight: 1.4, color: 'var(--color-neutral-200)', textWrap: 'pretty' }}>{c[2]}</span>
    </div>
  );
}

function QueryBar({ T, CUES, W }) {
  const q0 = CUES.Query, o = fade(T, q0 + 0.2, CUES.Compile, 0.6);
  if (o <= 0) return null;
  const text = AtlasCorpus.film.text, n = Math.round(text.length * clamp((T - q0 - Q.type0) / (Q.type1 - Q.type0), 0, 1));
  const N = W.G.nodes, seeds = W.run.seeds.map(i => N[i].name);
  return (
    <div style={{ ...K, position: 'absolute', left: 96, bottom: 96, width: 820, opacity: o, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 26px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)', boxShadow: '0 0 40px color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
        <span style={{ fontSize: 24, color: 'var(--color-accent)' }}>query</span>
        <span style={{ fontSize: 32 }}>{text.slice(0, n)}<span style={{ opacity: n < text.length && Math.floor(T * 2.5) % 2 ? 1 : 0, color: 'var(--color-accent)' }}>|</span></span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {seeds.map((s, k) => { const u = MOTION.pop(T, q0 + Q.seed + k * 0.15); return (
          <span key={s} style={{ fontSize: 24, padding: '6px 16px', borderRadius: 6, background: 'var(--color-accent-800)', color: 'var(--color-accent-100)', opacity: clamp(u, 0, 1), transform: `scale(${0.7 + 0.3 * u})` }}>seed · {s}</span>
        ); })}
      </div>
    </div>
  );
}

function Trace({ T, CUES, W }) {
  const q0 = CUES.Query, o = fade(T, q0 + 2.2, CUES.Coda, 0.6);
  if (o <= 0) return null;
  const prog = AtlasCorpus.program, q = T - q0;
  let k = -1; STEP_AT.forEach((t, i) => { if (q >= t) k = i; }); if (T >= CUES.Compile) k = 7;
  return (
    <div style={{ ...K, position: 'absolute', right: 96, top: 84, width: 560, opacity: o, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 22, letterSpacing: '0.12em', color: 'var(--color-accent)', paddingBottom: 6 }}>AGENT TRACE</span>
      {prog.map((p, i) => { const on = i === k, done = i < k; return (
        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 16, alignItems: 'baseline', opacity: on || done ? 1 : 0.38 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, border: '2px solid var(--color-accent)', background: on || done ? 'var(--color-accent)' : 'transparent', boxShadow: on ? '0 0 16px var(--color-accent)' : 'none', alignSelf: 'center' }} />
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
            <span style={{ fontSize: 28, fontWeight: 500 }}>{p.id}</span>
            <span style={{ fontSize: 24, color: 'var(--color-accent-300)' }}>{p.cls}</span>
          </div>
        </div>
      ); })}
    </div>
  );
}

function AnswerCard({ T, CUES, W }) {
  const a0 = CUES.Query + Q.answer, o = fade(T, a0, CUES.Coda + 1.2, 0.7);
  if (o <= 0) return null;
  const N = W.G.nodes, run = W.run, form = LabEngine.FORMS.find(f => f.id === run.form).label;
  const sc = run.score;
  return (
    <div style={{ ...K, position: 'absolute', right: 96, bottom: 96, width: 760, opacity: o, transform: `translateY(${(1 - MOTION.enter(T, a0, 0.9)) * 24}px)`, padding: 32, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 22, letterSpacing: '0.12em', color: 'var(--color-accent)' }}>ANSWER · VIA {form.toUpperCase()} TOOL</span>
      {run.answer.slice(0, 3).map((s, i) => { const u = MOTION.enter(T, a0 + 0.4 + i * 0.6, 0.6); const [name, ...rest] = s.text.split(': '); return (
        <div key={i} style={{ fontSize: 26, lineHeight: 1.4, opacity: u, textWrap: 'pretty' }}><span style={{ fontWeight: 500 }}>{name}</span> <span style={{ color: 'var(--color-neutral-200)' }}>{rest.join(': ')}</span> <span style={{ color: 'var(--color-accent-300)' }}>[{s.cites[0]}]</span></div>
      ); })}
      {sc != null && <span style={{ fontSize: 24, color: 'var(--color-neutral-300)', opacity: MOTION.enter(T, CUES.Query + Q.metric, 0.6) }}>metric · recall@{run.params.k} = {sc.toFixed(2)} against {run.gold.gold.length} gold concepts</span>}
    </div>
  );
}

function CompileCard({ T, CUES, W }) {
  const c0 = CUES.Compile, o = fade(T, c0 + 0.6, CUES.Coda + 0.8, 0.6);
  if (o <= 0) return null;
  const cm = W.cmp, u = MOTION.draw(T, c0 + 1.2, 4.8);
  const row = (l, a, b) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 20, alignItems: 'center' }}>
      <span style={{ fontSize: 24, color: 'var(--color-neutral-300)' }}>{l}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--color-neutral-800)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lerp(a, b, u) * 100}%`, borderRadius: 5, background: 'var(--color-accent)', boxShadow: '0 0 14px var(--color-accent)' }} />
        </div>
        <span style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums', width: 70 }}>{lerp(a, b, u).toFixed(2)}</span>
      </div>
    </div>
  );
  return (
    <div style={{ ...K, position: 'absolute', left: 96, bottom: 96, width: 820, opacity: o, padding: 32, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <span style={{ fontSize: 22, letterSpacing: '0.12em', color: 'var(--color-accent)' }}>RECALL@{cm.params.k} · {cm.tried} CONFIGURATIONS</span>
      {row('train', cm.trainBefore, cm.trainAfter)}
      {row('dev', cm.devBefore, cm.devAfter)}
      <span style={{ fontSize: 24, color: 'var(--color-neutral-300)', opacity: MOTION.enter(T, c0 + 5.4, 0.6) }}>decay {cm.params.decay} · {cm.params.hops} hops · analogy weight {cm.params.w.analog} · {cm.demos.length} traces kept as demos</span>
    </div>
  );
}

function EndTitle({ T, CUES }) {
  const o = MOTION.enter(T, CUES.Coda + 1.6, 1.2);
  if (o <= 0) return null;
  return (
    <div style={{ ...K, position: 'absolute', left: 96, top: 380, opacity: o, transform: `translateY(${(1 - o) * 20}px)`, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <span style={{ fontSize: 96, fontWeight: 500, lineHeight: 1 }}>Graph Lab</span>
      <span style={{ fontSize: 32, lineHeight: 1.4, color: 'var(--color-neutral-200)' }}>One graph holds the data, the agent and its tools. The same program exports to JavaScript and to DSPy.</span>
      <div style={{ width: 360, height: 1, marginTop: 12, background: 'linear-gradient(90deg, var(--color-accent), transparent)' }} />
    </div>
  );
}

function AgentPiece() {
  const { T, CUES } = useComposition();
  const W = useWorld();
  const root = React.useRef(null);
  React.useEffect(() => { const el = root.current && root.current.closest('[data-om-exportable-video-with-duration-secs]'); if (el) el.setAttribute('data-screen-label', `t=${Math.floor(T)}s`); }, [Math.floor(T)]);
  return (
    <div ref={root} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(90% 90% at 55% 50%, var(--color-neutral-900) 0%, var(--color-bg) 70%)' }}>
      <Stage3D W={W} T={T} CUES={CUES} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 70%, transparent) 0%, transparent 38%, transparent 66%, color-mix(in srgb, var(--color-bg) 55%, transparent) 100%)', pointerEvents: 'none' }} />
      <Caption T={T} CUES={CUES} />
      <QueryBar T={T} CUES={CUES} W={W} />
      <Trace T={T} CUES={CUES} W={W} />
      <AnswerCard T={T} CUES={CUES} W={W} />
      <CompileCard T={T} CUES={CUES} W={W} />
      <EndTitle T={T} CUES={CUES} />
    </div>
  );
}

function AgentFilm() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true });
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || undefined;
  return (
    <React.Fragment>
      <CompositionStage width={FW} height={FH} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={bg}>
        <AgentPiece />
      </CompositionStage>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.AgentFilm = AgentFilm;
