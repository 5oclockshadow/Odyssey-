/* agent-film-v3.jsx — HUD + stage for "The Agent Is the Graph". */
const FW = 1920, FH = 1080;
const MOTION = {
  enter: (T, a, d = 0.8) => Easing.easeOutCubic(clamp((T - a) / d, 0, 1)),
  draw: (T, a, d = 1.2) => Easing.easeInOutCubic(clamp((T - a) / d, 0, 1)),
  pop: (T, a, d = 0.5) => Easing.easeOutBack(clamp((T - a) / d, 0, 1)),
};
const win = (T, a, b, d = 0.6) => Math.min(MOTION.enter(T, a, d), 1 - MOTION.enter(T, b - d, d));
const ICE = 'rgb(214,236,255)', MOLT = 'rgb(255,106,26)', GOLD = 'rgb(255,190,110)';
const MONO = '"Geist Mono", ui-monospace, monospace', SORA = '"Sora", system-ui, sans-serif';
const GLYPHS = '01<>/[]{}#*+=-_:;∴∵∆∇λΣ';
const hsh = (i) => { const x = Math.sin(i * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };

function Scramble({ text, T, at, dur = 0.9 }) {
  const n = text.length, out = [];
  for (let i = 0; i < n; i++) {
    const r = at + (i / n) * dur * 0.7 + hsh(i) * dur * 0.3, ch = text[i];
    if (T < r - 0.35) out.push(' ');
    else if (T < r && ch !== ' ') out.push(GLYPHS[Math.floor(hsh(i * 13 + Math.floor(T * 24)) * GLYPHS.length)]);
    else out.push(ch);
  }
  return out.join('');
}

const SECT = {
  Ignition: ['§01', 'IGNITION', 'Data is the graph', '119 concepts · 16 communities · belongs-to, uses and analogy edges'],
  Agent: ['§02', 'BINDING', 'The agent is the graph', 'Its eight DSPy modules are nodes of this graph. The program is a route through the data.'],
  Force: ['§03', 'TOOL / FORCE 3D', 'Force', 'Edges pull, nodes repel. The route bends with the clusters.'],
  Hypergraph: ['§04', 'TOOL / HYPERGRAPH', 'Hypergraph', 'One edge holds a whole group. Fourteen hyperedges over the same nodes.'],
  Simplicial: ['§05', 'TOOL / SIMPLICIAL', 'Simplicial', 'As ε grows, neighbours join and triples fill into triangles.'],
  Tesseract: ['§06', 'TOOL / TESSERACT 4D', 'Tesseract', '16 communities on 16 hypercube vertices, rotating through w.'],
  Hyperbolic: ['§07', 'TOOL / HYPERBOLIC', 'Hyperbolic', 'The belongs-to tree in a Poincaré ball. Depth pushes toward the rim.'],
  Query: ['§08', 'RUN', 'Ask it about itself', 'A query is heat moving through modules and data along the same edges.'],
  Compile: ['§09', 'COMPILE', 'Compile', 'Search tunes the spreading weights against recall. The route thickens where it pays off.'],
  Coda: ['§10', 'END', '', ''],
};
const NAMES = Object.keys(SECT);

function Title({ T, C }) {
  const i = NAMES.reduce((k, n, j) => (T >= C[n] ? j : k), 0), nm = NAMES[i], s = SECT[nm];
  if (!s[2]) return null;
  const a0 = C[nm] + 0.25, end = i + 1 < NAMES.length ? C[NAMES[i + 1]] : a0 + 10, o = win(T, a0, end - 0.1, 0.4);
  const big = nm === 'Ignition' || nm === 'Agent';
  return (
    <div style={{ position: 'absolute', left: 120, top: 128, maxWidth: big ? 1100 : 820, opacity: o, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', gap: 18, font: `500 22px ${MONO}`, letterSpacing: '0.18em', color: MOLT }}>
        <span>{s[0]}</span><span style={{ color: ICE, opacity: 0.6 }}>{Scramble({ text: s[1], T, at: a0, dur: 0.6 })}</span>
      </div>
      <div style={{ font: `600 ${big ? 128 : 112}px/0.95 ${SORA}`, letterSpacing: '-0.04em', color: ICE, textShadow: `-3px 0 rgba(255,106,26,0.55), 3px 0 rgba(120,200,255,0.45), 0 0 60px rgba(214,236,255,0.18)` }}>
        {Scramble({ text: s[2], T, at: a0 + 0.1, dur: 1.0 })}
      </div>
      <div style={{ font: `400 28px/1.45 ${MONO}`, color: ICE, opacity: 0.72 * MOTION.enter(T, a0 + 0.9, 0.8), maxWidth: 780, textWrap: 'pretty' }}>{s[3]}</div>
    </div>
  );
}

function Frame({ T, C, S, W }) {
  const corner = (st) => <div style={{ position: 'absolute', width: 34, height: 34, ...st }} />;
  const b = `1.5px solid rgba(214,236,255,0.45)`;
  const total = C.Coda + 7, rail = NAMES.map((n, i) => ({ n, a: C[n], b: i + 1 < NAMES.length ? C[NAMES[i + 1]] : total }));
  const cur = rail.findIndex((r) => T >= r.a && T < r.b);
  const ts = `${String(Math.floor(T / 60)).padStart(2, '0')}:${(T % 60).toFixed(2).padStart(5, '0')}`;
  const live = T >= C.Query && T < C.Coda + 2;
  const stepName = S.step >= 0 ? AtlasCorpus.program[S.step] : null;
  const rows = [['T+', ts], ['FORM', S.f.tw < 1 ? `${S.f.from} → ${S.f.to}` : S.f.to], ['GRAPH', `${W.nc} N · ${W.edges.length} E · ${W.G.hyper.length} H`], ['AGENT', `8 modules ⊂ graph`]];
  if (live) rows.push(['ACTIVE', String(S.activeN).padStart(3, '0')], ['Σ HEAT', S.heat.toFixed(2)]);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(214,236,255,0.022) 0 1px, transparent 1px 4px)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 95% at 50% 50%, transparent 55%, rgba(2,3,6,0.85) 100%)' }} />
      {corner({ left: 56, top: 56, borderLeft: b, borderTop: b })}{corner({ right: 56, top: 56, borderRight: b, borderTop: b })}
      {corner({ left: 56, bottom: 56, borderLeft: b, borderBottom: b })}{corner({ right: 56, bottom: 56, borderRight: b, borderBottom: b })}
      <div style={{ position: 'absolute', left: 120, top: 74, font: `500 20px ${MONO}`, letterSpacing: '0.3em', color: ICE, opacity: 0.55 }}>GRAPH/LAB</div>
      <div style={{ position: 'absolute', right: 120, top: 74, display: 'grid', gridTemplateColumns: 'auto auto', gap: '8px 28px', font: `400 20px ${MONO}`, letterSpacing: '0.08em', color: ICE, textAlign: 'right' }}>
        {rows.map(([k, v]) => <React.Fragment key={k}><span style={{ opacity: 0.45 }}>{k}</span><span style={{ color: k === 'Σ HEAT' || k === 'ACTIVE' ? GOLD : ICE, fontVariantNumeric: 'tabular-nums' }}>{v}</span></React.Fragment>)}
      </div>
      {live && stepName && (
        <div style={{ position: 'absolute', right: 120, top: 330, font: `500 24px ${MONO}`, letterSpacing: '0.1em', color: GOLD, textAlign: 'right', opacity: MOTION.enter(T, C.Query + 2.8, 0.4) }}>
          STEP {String(S.step + 1).padStart(2, '0')}/08 · {stepName.id.toUpperCase()}
          <div style={{ font: `400 22px ${MONO}`, color: ICE, opacity: 0.65, marginTop: 8 }}>{stepName.cls} · {stepName.sig}</div>
        </div>
      )}
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 78, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {rail.map((r, i) => {
          const u = clamp((T - r.a) / (r.b - r.a), 0, 1);
          return (
            <div key={r.n} style={{ flex: r.b - r.a, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ font: `500 18px ${MONO}`, letterSpacing: '0.12em', color: i === cur ? MOLT : ICE, opacity: i === cur ? 1 : 0.32, whiteSpace: 'nowrap', overflow: 'hidden' }}>{String(i + 1).padStart(2, '0')}{i === cur ? ' ' + r.n.toUpperCase() : ''}</span>
              <div style={{ height: 3, background: 'rgba(214,236,255,0.14)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${u * 100}%`, background: i === cur ? MOLT : 'rgba(214,236,255,0.5)', boxShadow: i === cur ? '0 0 12px rgba(255,106,26,0.9)' : 'none' }} />
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

function Console({ T, C, S, W }) {
  const Q = NeuralFilm.Q, q0 = C.Query, o = win(T, q0 + 0.2, C.Compile + 0.4, 0.5);
  if (o <= 0) return null;
  const text = AtlasCorpus.film.text, n = Math.round(text.length * clamp((T - q0 - Q.type0) / (Q.type1 - Q.type0), 0, 1));
  const run = W.run, N = W.N, tool = LabEngine.FORMS.find((f) => f.id === run.form);
  const toolA = win(T, q0 + Q.reason, q0 + Q.lift + 0.6, 0.4);
  const obs = run.tool.obs.length > 110 ? run.tool.obs.slice(0, 108) + '…' : run.tool.obs;
  return (
    <div style={{ position: 'absolute', left: 120, bottom: 150, width: 860, opacity: o, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {toolA > 0 && (
        <div style={{ opacity: toolA, font: `400 22px/1.5 ${MONO}`, color: ICE }}>
          <span style={{ color: GOLD }}>reason.call → {run.form}.{tool.tool}({run.seeds.map((s) => N[s].name).join(', ')})</span>
          <div style={{ opacity: 0.7 }}>obs: {obs}</div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, padding: '22px 0', borderTop: '1px solid rgba(255,106,26,0.6)', borderBottom: '1px solid rgba(214,236,255,0.15)' }}>
        <span style={{ font: `500 24px ${MONO}`, color: MOLT, letterSpacing: '0.1em' }}>&gt;_</span>
        <span style={{ font: `500 44px ${SORA}`, letterSpacing: '-0.02em', color: ICE }}>{text.slice(0, n)}<span style={{ color: MOLT, opacity: Math.floor(T * 2.6) % 2 ? 1 : 0 }}>▍</span></span>
      </div>
    </div>
  );
}

function Answer({ T, C, S, W }) {
  const Q = NeuralFilm.Q, a0 = C.Query + Q.answer, o = win(T, a0, C.Coda + 1.0, 0.6);
  if (o <= 0) return null;
  const run = W.run;
  return (
    <div style={{ position: 'absolute', right: 120, bottom: 170, width: 700, opacity: o, transform: `translateX(${(1 - MOTION.enter(T, a0, 0.9)) * 40}px)`, display: 'flex', flexDirection: 'column', gap: 18, padding: '26px 30px', background: 'linear-gradient(180deg, rgba(10,12,20,0.88), rgba(4,5,9,0.7))', borderTop: '1px solid rgba(255,106,26,0.8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: `500 20px ${MONO}`, letterSpacing: '0.14em', color: MOLT }}>
        <span>ANSWER</span><span style={{ color: ICE, opacity: 0.55 }}>{run.sub.length} NODES LIFTED</span>
      </div>
      {run.answer.slice(0, 3).map((s, i) => {
        const u = MOTION.enter(T, a0 + 0.5 + i * 0.7, 0.6), [name, ...rest] = s.text.split(': ');
        return <div key={i} style={{ opacity: u, transform: `translateY(${(1 - u) * 10}px)`, font: `400 26px/1.42 ${SORA}`, color: ICE, textWrap: 'pretty' }}><span style={{ color: GOLD, font: `500 22px ${MONO}` }}>[{s.cites[0]}] </span><span style={{ fontWeight: 600 }}>{name}.</span> <span style={{ opacity: 0.78 }}>{rest.join(': ')}</span></div>;
      })}
      {run.score != null && <div style={{ font: `400 22px ${MONO}`, color: ICE, opacity: 0.7 * MOTION.enter(T, C.Query + Q.metric, 0.5) }}>metric · recall@{run.params.k} = <span style={{ color: GOLD }}>{run.score.toFixed(2)}</span> vs {run.gold.gold.length} gold</div>}
    </div>
  );
}

function CompileBars({ T, C, W }) {
  const c0 = C.Compile, o = win(T, c0 + 0.8, C.Coda + 0.8, 0.5);
  if (o <= 0) return null;
  const cm = W.cmp, u = MOTION.draw(T, c0 + 1.0, 5);
  const bar = (l, a, b) => { const v = a + (b - a) * u; return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 20, alignItems: 'center' }}>
      <span style={{ font: `400 22px ${MONO}`, color: ICE, opacity: 0.6 }}>{l}</span>
      <div style={{ height: 6, background: 'rgba(214,236,255,0.12)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: `${a * 100}%`, top: -6, bottom: -6, width: 1.5, background: ICE, opacity: 0.5 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${v * 100}%`, background: `linear-gradient(90deg, rgba(255,106,26,0.3), ${MOLT})`, boxShadow: '0 0 18px rgba(255,106,26,0.8)' }} />
      </div>
      <span style={{ font: `500 28px ${MONO}`, color: GOLD, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v.toFixed(2)}</span>
    </div>
  ); };
  return (
    <div style={{ position: 'absolute', left: 120, bottom: 160, width: 860, opacity: o, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ font: `500 20px ${MONO}`, letterSpacing: '0.14em', color: MOLT }}>RECALL@{cm.params.k} · {cm.tried} CONFIGS SEARCHED</div>
      {bar('TRAIN', cm.trainBefore, cm.trainAfter)}
      {bar('DEV', cm.devBefore, cm.devAfter)}
      <div style={{ font: `400 22px ${MONO}`, color: ICE, opacity: 0.65 * MOTION.enter(T, c0 + 5.4, 0.6) }}>decay {cm.params.decay} · hops {cm.params.hops} · analogy {cm.params.w.analog} · {cm.demos.length} demos kept</div>
    </div>
  );
}

function End({ T, C }) {
  const a0 = C.Coda + 1.4, o = MOTION.enter(T, a0, 1.0);
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 120, top: 330, opacity: o, display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div style={{ font: `600 150px/0.92 ${SORA}`, letterSpacing: '-0.05em', color: ICE, textShadow: '-4px 0 rgba(255,106,26,0.55), 4px 0 rgba(120,200,255,0.45), 0 0 80px rgba(214,236,255,0.2)' }}>
        <div>{Scramble({ text: 'The agent', T, at: a0, dur: 1 })}</div>
        <div>{Scramble({ text: 'is the graph.', T, at: a0 + 0.3, dur: 1.1 })}</div>
      </div>
      <div style={{ font: `400 28px/1.5 ${MONO}`, color: ICE, opacity: 0.7 * MOTION.enter(T, a0 + 1.4, 0.8) }}>Graph Lab · one graph for data, modules and tools · exports to JavaScript and DSPy</div>
    </div>
  );
}

function Canvas3D({ W, S }) {
  const ref = React.useRef(null), R = React.useRef(null);
  React.useLayoutEffect(() => { if (!R.current) R.current = NeuralFilm.Renderer(ref.current, W, FW, FH); R.current.draw(S); });
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: FW, height: FH }} />;
}

function Piece() {
  const { T, CUES } = useComposition();
  const W = React.useMemo(() => NeuralFilm.World(), []);
  const S = NeuralFilm.stateAt(W, T, CUES);
  const root = React.useRef(null);
  const sec = Math.floor(T);
  React.useEffect(() => { const el = root.current && root.current.closest('[data-om-exportable-video-with-duration-secs]'); if (el) el.setAttribute('data-screen-label', `t=${sec}s`); }, [sec]);
  return (
    <div ref={root} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#040509' }}>
      <Canvas3D W={W} S={S} />
      <Title T={T} C={CUES} />
      <Console T={T} C={CUES} S={S} W={W} />
      <Answer T={T} C={CUES} S={S} W={W} />
      <CompileBars T={T} C={CUES} W={W} />
      <End T={T} C={CUES} />
      <Frame T={T} C={CUES} S={S} W={W} />
    </div>
  );
}

function AgentFilmV3() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true });
  return (
    <React.Fragment>
      <CompositionStage width={FW} height={FH} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#040509">
        <Piece />
      </CompositionStage>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.AgentFilmV3 = AgentFilmV3;
