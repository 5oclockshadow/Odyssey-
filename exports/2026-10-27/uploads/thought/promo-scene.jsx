// Map Graph promo, 30 seconds. One element tree keyed to the authored clock T.
const { CompositionStage, useComposition, Shot, Captions, Easing, animate } = window;
const INK = '#eef1ff', BG = '#0b0e17', CY = '#27d3ff', PK = '#ff3ea5', MUTE = '#9aa3c4', PANEL = '#131827', LINE = '#3a4468';
const SYNE = "'Syne', sans-serif", SANS = "'Instrument Sans', sans-serif", MONO = "'DM Mono', monospace";
// Three motion helpers. Nothing below uses another easing.
const MOTION = {
  enter: (T, s, d = 0.6) => animate({ from: 0, to: 1, start: s, end: s + d, ease: Easing.easeOutCubic })(T),
  draw: (T, s, d = 0.9) => animate({ from: 0, to: 1, start: s, end: s + d, ease: Easing.easeInOutCubic })(T),
  pop: (T, s, d = 0.5) => animate({ from: 0, to: 1, start: s, end: s + d, ease: Easing.easeOutBack })(T),
};
const typed = (text, p) => text.slice(0, Math.round(text.length * Math.max(0, Math.min(1, p))));

// Node layout on the map canvas (canvas is 1500 x 760, origin top-left).
const NODES = {
  net: { x: 750, y: 120, label: 'Northwind Distribution', kind: 'Network', c: '#4a5d7a', at: 3.0 },
  rot: { x: 330, y: 330, label: 'Rotterdam Hub', kind: 'Site', c: '#b5651d', at: 3.4 },
  lyo: { x: 750, y: 360, label: 'Lyon Depot', kind: 'Site', c: '#b5651d', at: 3.6 },
  mil: { x: 1170, y: 330, label: 'Milan Depot', kind: 'Site', c: '#b5651d', at: 3.8 },
  trk: { x: 540, y: 600, label: 'Truck 12', kind: 'Vehicle', c: '#2a7f7f', at: 4.0 },
  rte: { x: 960, y: 610, label: 'R1 Rotterdam to Lyon', kind: 'Route', c: '#8a4f7d', at: 4.2 },
  dock: { x: 150, y: 570, label: 'Dock C', kind: 'Warehouse', c: '#6b7d2c', at: 8.4 },
  car: { x: 1330, y: 600, label: 'Haulage Vance', kind: 'Carrier', c: '#5a4a8a', at: 14.6 },
};
const LINKS = [['net', 'rot', 3.5], ['net', 'lyo', 3.7], ['net', 'mil', 3.9], ['rot', 'dock', 9.0], ['trk', 'rte', 14.0], ['rte', 'lyo', 4.6], ['trk', 'car', 15.0]];
const LIT = { Into: ['net', 'rot', 'lyo', 'mil', 'dock'], For: ['trk', 'rte', 'lyo'], From: ['trk', 'rte', 'lyo', 'mil'], Reverse: ['rte', 'trk', 'car'] };

function Card({ n, T, hot, dim }) {
  const a = MOTION.pop(T, n.at, 0.55), sc = 0.7 + 0.3 * a, op = Math.min(1, a * 1.6) * (dim ? 0.2 : 1);
  return <div style={{ position: 'absolute', left: n.x - 130, top: n.y - 38, width: 260, height: 76, opacity: op, transform: `scale(${sc})`, background: '#fffdf6', color: '#1c1f1a', borderLeft: `8px solid ${n.c}`, border: hot ? `3px solid ${PK}` : '1px solid #1c1f1a', borderLeftWidth: 8, borderLeftColor: n.c, boxShadow: hot ? `0 0 0 8px rgba(255,62,165,0.25)` : 'none', padding: '10px 16px', fontFamily: SANS }}>
    <div style={{ fontWeight: 600, fontSize: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.label}</div>
    <div style={{ fontFamily: MONO, fontSize: 16, color: '#6a7066' }}>{n.kind}</div>
  </div>;
}
function Links({ T, litSet }) {
  return <svg width="1500" height="760" style={{ position: 'absolute', left: 0, top: 0 }}>
    {LINKS.map(([a, b, at], i) => { const A = NODES[a], B = NODES[b], p = MOTION.draw(T, at, 0.7); const on = litSet ? litSet.includes(a) && litSet.includes(b) : false; return <line key={i} x1={A.x} y1={A.y} x2={A.x + (B.x - A.x) * p} y2={A.y + (B.y - A.y) * p} stroke={on ? PK : '#c9d0ee'} strokeWidth={on ? 6 : 3} strokeOpacity={litSet && !on ? 0.15 : 0.8} />; })}
  </svg>;
}
function Cursor({ x, y, show }) {
  return <svg width="46" height="46" viewBox="0 0 24 24" style={{ position: 'absolute', left: x, top: y, opacity: show, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}><path d="M5 3l14 8-6 2 4 7-3 1-4-7-5 4z" fill="#ffffff" stroke="#0b0e17" strokeWidth="1.2" /></svg>;
}
function Key({ label, T, s, e }) {
  const o = MOTION.enter(T, s, 0.3) * (1 - MOTION.enter(T, e, 0.3));
  return <div style={{ position: 'absolute', left: 1180, top: 72, opacity: o, padding: '10px 22px', borderRadius: 12, background: '#0b0e17', border: `2px solid ${CY}`, color: CY, fontFamily: MONO, fontSize: 30 }}>{label}</div>;
}

function Piece() {
  const { T, CUES } = useComposition(), S = CUES;
  const seed = typed('Opening a bakery chain', MOTION.draw(T, 0.5, 1.6)), seedOut = MOTION.enter(T, 2.5, 0.8);
  const canvasIn = MOTION.enter(T, 2.6, 0.8), canvasOut = 1 - MOTION.enter(T, S.Twins - 0.2, 0.7);
  // camera moves: wide, push to the new dock, push to the truck, wide again
  const camZ = 1 + 0.55 * (MOTION.draw(T, 7.6, 1.0) - MOTION.draw(T, 11.4, 1.0)) + 0.5 * (MOTION.draw(T, 12.0, 1.0) - MOTION.draw(T, 16.8, 1.0)) * 1;
  const camX = -160 * (MOTION.draw(T, 7.6, 1.0) - MOTION.draw(T, 11.4, 1.0)) + 60 * (MOTION.draw(T, 12.0, 1.0) - MOTION.draw(T, 16.8, 1.0));
  const camY = -110 * (MOTION.draw(T, 7.6, 1.0) - MOTION.draw(T, 11.4, 1.0)) - 160 * (MOTION.draw(T, 12.0, 1.0) - MOTION.draw(T, 16.8, 1.0));
  const dropTxt = typed('Dock C at Rotterdam Hub', MOTION.draw(T, 6.4, 1.4)), dropBox = MOTION.enter(T, 6.0, 0.4) * (1 - MOTION.enter(T, 9.4, 0.4));
  const ask = MOTION.pop(T, 12.4, 0.5) * (1 - MOTION.enter(T, 16.0, 0.4)), ansTxt = typed('R1 Rotterdam to Lyon', MOTION.draw(T, 13.0, 1.0));
  const modes = ['Into', 'For', 'From', 'Reverse'], mi = Math.max(0, Math.min(3, Math.floor((T - S.Submap - 0.4) / 1.5))), inSub = T >= S.Submap + 0.4 && T < S.Twins - 0.3, litSet = inSub ? LIT[modes[mi]] : null;
  const twins = MOTION.enter(T, S.Twins - 0.1, 0.7) * (1 - MOTION.enter(T, S.Close - 0.2, 0.6)), count = Math.floor(MOTION.draw(T, S.Twins + 0.4, 3.0) * 24);
  const closeIn = MOTION.enter(T, S.Close, 0.8);
  const curX = 520 + 560 * MOTION.draw(T, 5.2, 1.0) - 260 * MOTION.draw(T, 9.6, 1.2) + 260 * MOTION.draw(T, 11.6, 1.0), curY = 300 + 70 * MOTION.draw(T, 5.2, 1.0) + 200 * MOTION.draw(T, 9.6, 1.2) + 20 * MOTION.draw(T, 11.6, 1.0);
  return <div data-screen-label={`t=${Math.floor(T)}s`} style={{ position: 'absolute', inset: 0, background: BG, color: INK, fontFamily: SANS, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(238,241,255,0.09) 2px, transparent 2px)', backgroundSize: '48px 48px', transform: `translate(${-(T * 6) % 48}px, ${-(T * 3) % 48}px)` }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 360, textAlign: 'center', opacity: 1 - seedOut, transform: `scale(${1 + 0.04 * T / 4})` }}>
      <div style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 136, letterSpacing: '-0.035em', lineHeight: 1 }}>{seed}<span style={{ color: CY }}>|</span></div>
      <div style={{ marginTop: 28, fontSize: 38, color: MUTE, opacity: MOTION.enter(T, 1.2, 0.6) }}>Start with any idea.</div>
    </div>
    <div style={{ position: 'absolute', left: 210, top: 150, width: 1500, height: 760, opacity: canvasIn * canvasOut, transform: `translate(${camX}px, ${camY}px) scale(${camZ})`, transformOrigin: '50% 50%', background: '#f7f8f5', border: '2px solid #1c1f1a', boxShadow: '12px 12px 0 rgba(39,211,255,0.5)' }}>
      <div style={{ position: 'absolute', left: 24, top: 18, display: 'flex', gap: 14, alignItems: 'center', fontFamily: SYNE, fontWeight: 800, fontSize: 34, color: '#1c1f1a' }}>Atlas<span style={{ fontFamily: MONO, fontWeight: 400, fontSize: 20, padding: '5px 14px', border: '1px solid #1c1f1a', background: '#fff', opacity: MOTION.enter(T, 3.0, 0.5) }}>CONTEXT  Logistics</span></div>
      <Links T={T} litSet={litSet} />
      {Object.entries(NODES).map(([k, n]) => <Card key={k} n={n} T={T} dim={litSet ? !litSet.includes(k) : false} hot={(k === 'dock' && T > 9.0 && T < 10.6) || (k === 'trk' && T > 12.0 && T < 16)} />)}
      <Key label="Ctrl + click" T={T} s={5.4} e={6.6} />
    </div>
    <div style={{ position: 'absolute', left: 520, top: 420, width: 860, opacity: dropBox, transform: `translateY(${(1 - dropBox) * 20}px)`, padding: 22, background: '#fffdf6', color: '#1c1f1a', border: '3px solid #1c1f1a', boxShadow: '8px 8px 0 #1c1f1a' }}>
      <div style={{ fontSize: 40, fontWeight: 600, padding: '10px 16px', border: '2px solid #1c1f1a' }}>{dropTxt}<span style={{ color: PK }}>|</span></div>
      <div style={{ marginTop: 14, fontSize: 28, lineHeight: 1.35, opacity: MOTION.enter(T, 7.8, 0.4) }}>Warehouse, inside Rotterdam Hub. 71% sure. It names a hub that is already on the map.</div>
    </div>
    <div style={{ position: 'absolute', left: 640, top: 150 + 600 - 260, width: 700, opacity: ask, transform: `scale(${0.85 + 0.15 * ask})`, padding: 24, background: '#fff7f3', color: '#1c1f1a', border: `3px solid ${PK}`, boxShadow: '8px 8px 0 #1c1f1a' }}>
      <div style={{ fontFamily: MONO, fontSize: 22, color: PK, letterSpacing: '0.1em' }}>THIS NODE ASKS</div>
      <div style={{ fontFamily: SYNE, fontWeight: 600, fontSize: 40, margin: '6px 0 14px' }}>What does Truck 12 run on?</div>
      <div style={{ fontSize: 32, padding: '8px 14px', border: '2px solid #1c1f1a', background: '#fff' }}>{ansTxt}<span style={{ color: PK }}>|</span></div>
    </div>
    <Cursor x={curX + 210} y={curY + 150} show={MOTION.enter(T, 5.0, 0.4) * (1 - MOTION.enter(T, 16.0, 0.4))} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 70, display: 'flex', justifyContent: 'center', gap: 20, opacity: MOTION.enter(T, S.Submap, 0.5) * (1 - MOTION.enter(T, S.Twins - 0.3, 0.4)) }}>
      {modes.map((m, i) => <div key={m} style={{ padding: '12px 34px', borderRadius: 999, fontFamily: SYNE, fontWeight: 800, fontSize: 46, border: `3px solid ${i === mi ? PK : LINE}`, background: i === mi ? PK : 'transparent', color: i === mi ? '#0b0e17' : INK }}>{m}</div>)}
    </div>
    <div style={{ position: 'absolute', inset: 0, opacity: twins, background: BG, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, padding: '150px 120px 160px' }}>
      {[['Thoughts', CY, 'thoughts', 'Auto · live AI'], ['Atlas', PK, 'entities', 'Auto · researching']].map(([n, c, u, b], i) => <div key={n} style={{ border: `3px solid ${c}`, borderRadius: 20, background: PANEL, padding: 36, display: 'grid', alignContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 64, color: c }}>{n}</div><div style={{ fontFamily: MONO, fontSize: 24, padding: '6px 16px', border: `2px solid ${c}`, borderRadius: 999, opacity: 0.6 + 0.4 * Math.abs(Math.sin(T * 3 + i)) }}>{b}</div></div>
        <div style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 200, lineHeight: 1 }}>{12 + count + i * 3}</div>
        <div style={{ fontSize: 38, color: MUTE }}>{u}, growing in a background tab</div>
      </div>)}
    </div>
    <div style={{ position: 'absolute', inset: 0, opacity: closeIn, background: BG, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 34, textAlign: 'center' }}>
      <svg width="260" height="168" viewBox="0 0 34 22"><circle cx="11" cy="11" r="9" fill="none" stroke={CY} strokeWidth="1.6" /><circle cx="23" cy="11" r="9" fill="none" stroke={PK} strokeWidth="1.6" /></svg>
      <div style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 168, letterSpacing: '-0.04em', lineHeight: 1 }}>Map Graph</div>
      <div style={{ fontSize: 52, color: '#c9d0ee' }}>Map anything, in the <span style={{ color: CY }}>context</span> you steer.</div>
      <div style={{ padding: '22px 56px', borderRadius: 999, background: CY, color: BG, fontWeight: 700, fontSize: 44, transform: `scale(${0.9 + 0.1 * MOTION.pop(T, S.Close + 1.0, 0.6)})` }}>Join the waitlist</div>
    </div>
    <Captions items={[{ at: 0.6, until: 2.6, text: 'Start with any idea.' }, { at: S.Drop + 0.3, until: S.Drop + 3.0, text: 'Steer the context. Drop a node.' }, { at: S.Drop + 3.4, until: S.Ask - 0.2, text: 'It finds its place, and tells you why.' }, { at: S.Ask + 0.3, until: S.Submap - 0.2, text: 'Nodes ask what is missing.' }, { at: S.Submap + 0.3, until: S.Twins - 0.3, text: 'Sub-map any idea: into, for, from, reverse.' }, { at: S.Twins + 0.3, until: S.Close - 0.2, text: 'Two engines, working while you do something else.' }]} />
  </div>;
}
window.PromoRoot = function PromoRoot() {
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);
  return <>
    <CompositionStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#0b0e17"><Piece /></CompositionStage>
    <window.TweaksPanel><window.TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} /></window.TweaksPanel>
  </>;
};
