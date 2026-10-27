/* graph-film.jsx — "Graph Atlas": one continuous composition on animations-v3.
   The 3D frame paints to a canvas from T; while paused or exporting it is also
   mirrored into an <img> so the exported SVG carries the pixels. All text is DOM. */
const FW = 1920, FH = 1080, RES = 2 / 3;
const BAR = { x: 96, yLow: 904, yHigh: 84, w: 980, h: 76, text: 166 };
const CARD = { x: 1170, y: 330, w: 670, row: 64, first: 446 };
const PH_SEARCH = 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z';
const END_LINES = ['Graph about data', 'Data is the graph', 'The agent is the graph'];

function useChipAnchors() {
  const [anchors, setAnchors] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    const measure = () => {
      const q = window.GraphEngine.QUERY, m = document.createElement('canvas').getContext('2d');
      m.font = '400 32px Inter, system-ui, sans-serif';
      const out = q.chips.map((word) => {
        const i = q.text.indexOf(word);
        return { x: BAR.text + m.measureText(q.text.slice(0, i)).width + m.measureText(word).width / 2, y: BAR.yLow + 16 };
      });
      if (live) setAnchors(out);
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    return () => { live = false; };
  }, []);
  return anchors;
}

function NodeLabel({ L, tk, G }) {
  const left = L.side === 'left';
  return (
    <div style={{
      position: 'absolute', top: (L.ly == null ? L.y : L.ly) - 34, left: left ? undefined : L.x + 24, right: left ? FW - L.x + 24 : undefined,
      opacity: L.a, display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box',
      paddingTop: 8, paddingBottom: 9, paddingLeft: 14, paddingRight: 16,
      background: G.rgba(tk.surface, 0.8), borderRadius: tk.radiusMd, boxShadow: tk.shadowSm,
    }}>
      {L.num && (
        <div style={{ fontSize: 24, lineHeight: 1, color: tk.a[100], background: tk.a[800], borderRadius: tk.radiusSm + 2, paddingTop: 5, paddingBottom: 5, paddingLeft: 9, paddingRight: 9, fontVariantNumeric: 'tabular-nums' }}>{L.num}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 26, lineHeight: 1.12, color: tk.n[100], whiteSpace: 'nowrap', fontWeight: 500 }}>{L.name}</div>
        <div style={{ fontSize: 24, lineHeight: 1.12, color: tk.a[300], whiteSpace: 'nowrap' }}>{L.kind}</div>
      </div>
    </div>
  );
}

function QueryBar({ F, tk, G }) {
  const q = G.QUERY, Qs = F.q, typed = q.text.slice(0, Qs.chars);
  const top = BAR.yLow + (BAR.yHigh - BAR.yLow) * Qs.up;
  const parts = [];
  let i = 0;
  const spans = q.chips.map((w) => ({ s: q.text.indexOf(w), e: q.text.indexOf(w) + w.length })).sort((a, b) => a.s - b.s);
  spans.forEach((sp, k) => {
    if (sp.s > i) parts.push(<span key={'t' + k}>{typed.slice(i, Math.min(sp.s, typed.length))}</span>);
    const word = typed.slice(sp.s, Math.min(sp.e, typed.length));
    if (word) parts.push(
      <span key={'c' + k} style={{ borderRadius: tk.radiusSm + 2, background: G.rgba(tk.a[800], Qs.chips), boxShadow: '0 0 0 6px ' + G.rgba(tk.a[800], Qs.chips), color: Qs.chips > 0.5 ? tk.a[100] : tk.text }}>{word}</span>
    );
    i = sp.e;
  });
  if (typed.length > i) parts.push(<span key="tail">{typed.slice(i)}</span>);
  return (
    <div style={{
      position: 'absolute', left: BAR.x, top, width: BAR.w, height: BAR.h, opacity: Qs.bar, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 24, paddingRight: 24,
      background: G.rgba(tk.surface, 0.92), border: '1px solid ' + tk.divider, borderRadius: tk.radiusLg, boxShadow: tk.shadowMd,
    }}>
      <svg width="30" height="30" viewBox="0 0 256 256" fill={tk.n[400]} style={{ flex: 'none' }}><path d={PH_SEARCH} /></svg>
      <div style={{ fontSize: 32, lineHeight: 1, color: tk.text, whiteSpace: 'pre', display: 'flex', alignItems: 'center' }}>
        {parts}
        <span style={{ display: 'inline-block', width: 3, height: 38, marginLeft: 3, background: tk.accent, opacity: Qs.caret ? 1 : 0 }} />
      </div>
    </div>
  );
}

function AnswerCard({ F, tk, G }) {
  const Qs = F.q, q = G.QUERY;
  return (
    <div style={{
      position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, opacity: Qs.card, transform: 'translateY(' + (1 - Qs.card) * 16 + 'px)',
      boxSizing: 'border-box', paddingTop: 32, paddingBottom: 28, paddingLeft: 36, paddingRight: 36,
      background: G.rgba(tk.surface, 0.94), borderRadius: tk.radiusLg, boxShadow: tk.shadowMd,
    }}>
      <div style={{ height: 30, fontSize: 24, letterSpacing: '0.14em', color: tk.a[300], fontWeight: 500 }}>ANSWER</div>
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column' }}>
        {q.answer.map((ln, k) => (
          <div key={k} style={{ height: CARD.row, display: 'flex', alignItems: 'center', gap: 14, opacity: Qs.lines[k] > 0 ? 1 : 0 }}>
            <div style={{ width: 84, flex: 'none', display: 'flex', gap: 6 }}>
              {ln.cites.map((c) => (
                <div key={c} style={{ fontSize: 24, lineHeight: 1, color: tk.a[100], background: tk.a[800], borderRadius: tk.radiusSm + 2, paddingTop: 5, paddingBottom: 5, paddingLeft: 9, paddingRight: 9, fontVariantNumeric: 'tabular-nums' }}>{c + 1}</div>
              ))}
            </div>
            <div style={{ fontSize: 28, color: tk.n[100], whiteSpace: 'nowrap' }}>{ln.text.slice(0, Math.round(Qs.lines[k] * ln.text.length))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Overlay({ F, tk, tw }) {
  const G = window.GraphEngine, Qs = F.q, ti = F.title, showLabels = tw.labels !== false;
  const labels = showLabels ? F.labels.slice() : [];
  if (showLabels && F.hyperTag && F.hyperTag.a > 0.01) labels.push({ x: F.hyperTag.x, y: F.hyperTag.y, name: F.hyperTag.name, kind: F.hyperTag.kind, a: F.hyperTag.a, side: 'right', tag: true });
  return (
    <React.Fragment>
      {ti.key && ti.a > 0.001 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1560, height: 640, opacity: ti.a, background: 'radial-gradient(ellipse 72% 78% at 0% 0%, ' + G.rgba(tk.bg, 0.9) + ' 0%, ' + G.rgba(tk.bg, 0.78) + ' 52%, ' + G.rgba(tk.bg, 0.4) + ' 76%, ' + G.rgba(tk.bg, 0) + ' 96%)' }} />
      )}
      <svg width={FW} height={FH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {labels.map((L, k) => {
          const dir = L.side === 'left' ? -1 : 1;
          return (
            <g key={k} opacity={L.tag ? 0 : L.a}>
              <circle cx={L.x} cy={L.y} r={11} fill="none" stroke={tk.a[400]} strokeWidth={1.5} />
              <line x1={L.x + dir * 11} y1={L.y} x2={L.x + dir * 24} y2={L.ly == null ? L.y : L.ly} stroke={tk.a[400]} strokeWidth={1.5} />
            </g>
          );
        })}
        {Qs.card > 0.01 && G.QUERY.answer.map((ln, k) => ln.cites.map((c) => {
          const sp = Qs.slots[c], p = Qs.lines[k];
          if (!sp || !sp.ok || p <= 0) return null;
          const y = CARD.first + k * CARD.row, x = CARD.x;
          return (
            <g key={k + '-' + c} opacity={0.7 * Math.min(1, p * 2) * Qs.card}>
              <path d={'M' + x + ' ' + y + ' C' + (x - 150) + ' ' + y + ' ' + (sp.x + 150) + ' ' + sp.y + ' ' + (sp.x + 12) + ' ' + sp.y} fill="none" stroke={tk.a[400]} strokeWidth={1.6} />
              <circle cx={sp.x} cy={sp.y} r={12} fill="none" stroke={tk.a[300]} strokeWidth={1.6} />
            </g>
          );
        }))}
      </svg>
      {labels.map((L, k) => <NodeLabel key={k} L={L} tk={tk} G={G} />)}
      {ti.key && ti.a > 0.001 && (
        <div style={{ position: 'absolute', left: 96, top: 84 + ti.dy, opacity: ti.a, maxWidth: 900 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 28, height: 2, background: tk.accent }} />
            <div style={{ fontSize: 24, letterSpacing: '0.14em', color: tk.a[300], fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{ti.n} / 12</div>
          </div>
          <div style={{ marginTop: 14, fontSize: 64, lineHeight: 1.08, fontWeight: 500, letterSpacing: '-0.015em', color: tk.text, whiteSpace: 'nowrap', textShadow: '0 0 18px ' + G.rgba(tk.bg, 0.95) + ', 0 0 4px ' + G.rgba(tk.bg, 0.9) }}>{ti.label}</div>
          <div style={{ marginTop: 16, fontSize: 30, lineHeight: 1.4, color: tk.n[200], maxWidth: 820, textWrap: 'pretty', textShadow: '0 0 18px ' + G.rgba(tk.bg, 0.95) + ', 0 0 4px ' + G.rgba(tk.bg, 0.9) }}>{ti.cap}</div>
        </div>
      )}
      {Qs.bar > 0.001 && <QueryBar F={F} tk={tk} G={G} />}
      {Qs.card > 0.001 && <AnswerCard F={F} tk={tk} G={G} />}
      {F.ruler.a > 0.001 && (
        <div style={{ position: 'absolute', left: 96, top: 944, width: 640, height: 70, opacity: F.ruler.a }}>
          <div style={{ fontSize: 24, letterSpacing: '0.14em', color: tk.n[400], fontWeight: 500 }}>TIME</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 52, height: 1, background: 'linear-gradient(to right, transparent, ' + tk.divider + ' 48px, ' + tk.divider + ' calc(100% - 48px), transparent)' }} />
          <div style={{ position: 'absolute', left: F.ruler.g * 640 - 1, top: 40, width: 2, height: 24, background: tk.accent }} />
        </div>
      )}
      {F.end[0] > 0.001 && (
        <div style={{ position: 'absolute', left: 96, top: 372, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {END_LINES.map((s, k) => (
            <div key={k} style={{ fontSize: 76, lineHeight: 1.12, fontWeight: 500, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color: [tk.n[500], tk.n[200], tk.a[300]][k], opacity: F.end[k], transform: 'translateY(' + (1 - F.end[k]) * 14 + 'px)' }}>{s}</div>
          ))}
        </div>
      )}
      {F.fade > 0.001 && <div style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH, background: tk.bg, opacity: F.fade }} />}
    </React.Fragment>
  );
}

function GraphPiece({ tw }) {
  const { T, CUES, playing, authoredTotal } = useComposition();
  const G = window.GraphEngine;
  const world = React.useMemo(() => G.build({ n: 1400 }), []);
  const Q = React.useMemo(() => G.cues(CUES, authoredTotal), [CUES, authoredTotal]);
  const anchors = useChipAnchors();
  const tk = G.tokens();
  const F = G.evaluate(world, T, Q, { width: FW, height: FH, dof: tw.depthOfField !== false, glow: tw.glow == null ? 1 : tw.glow });
  const cv = React.useRef(null), im = React.useRef(null);
  React.useLayoutEffect(() => {
    const c = cv.current, i = im.current;
    if (!c || !i) return;
    if (!G.render(c.getContext('2d'), world, F, { anchors: anchors, scale: RES })) return;
    if (!playing) { i.src = c.toDataURL('image/jpeg', 0.92); i.style.visibility = 'visible'; }
    else if (i.style.visibility !== 'hidden') i.style.visibility = 'hidden';
  });
  return (
    <div data-screen-label={Math.floor(T) + 's · ' + F.section} style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif', background: tk ? tk.bg : undefined }}>
      <canvas ref={cv} width={Math.round(FW * RES)} height={Math.round(FH * RES)} style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH }} />
      <img ref={im} alt="" style={{ position: 'absolute', left: 0, top: 0, width: FW, height: FH, visibility: 'hidden' }} />
      {tk && <Overlay F={F} tk={tk} tw={tw} />}
    </div>
  );
}

function GraphFilm() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true, depthOfField: true, glow: 1, labels: true });
  const tk = window.GraphEngine.tokens();
  return (
    <React.Fragment>
      <CompositionStage width={FW} height={FH} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={tk ? tk.bg : undefined}>
        <GraphPiece tw={t} />
      </CompositionStage>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
        <TweakSection label="Look" />
        <TweakToggle label="Depth of field" value={t.depthOfField} onChange={(v) => setTweak('depthOfField', v)} />
        <TweakSlider label="Glow" value={t.glow} min={0.4} max={1.6} step={0.05} onChange={(v) => setTweak('glow', v)} />
        <TweakToggle label="Node labels" value={t.labels} onChange={(v) => setTweak('labels', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.GraphFilm = GraphFilm;
