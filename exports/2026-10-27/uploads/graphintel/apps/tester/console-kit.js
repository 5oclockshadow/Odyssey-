/* Console kit v2 — a TigerGraph-grade generative console engine for a graph-intelligence institute.
   ConsoleKit.build(spec) -> one standalone, self-contained HTML console.
   ConsoleKit.plan(n, seed) -> n specs, every one a STRUCTURALLY UNIQUE archetype (frame × primary × aux × aux2).
   No frameworks, no network, no web fonts. Nocturne palette; graph-console IA and polish. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rng = seed => { let x = (seed * 2654435761) >>> 0; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; };

  // Palettes — all within Nocturne's family (blurple accent, desaturated ground), tuned to graph-console contrast. [name,bg,surface,line,text,mut,accent,accentHi]
  const PAL = [
    ['Midnight', '#12131d', '#1a1c2b', '#2a2d44', '#e9e9ed', '#8a8fa6', '#9184d9', '#d2cefd'],
    ['Graphite', '#0f1016', '#171922', '#262a38', '#e8eaf0', '#878ca0', '#9184d9', '#d2cefd'],
    ['Slate', '#10131c', '#181d2a', '#273044', '#e6edf6', '#7e8ca3', '#9690e0', '#d2cefd'],
    ['Nocturne', '#161826', '#232532', '#3f424d', '#e9e9ed', '#9397ab', '#9184d9', '#d2cefd'],
    ['Indigo ink', '#0d0e1a', '#151733', '#272c55', '#e9e7fb', '#8a88b5', '#a79bff', '#e7e5fe'],
    ['Paper', '#eef0f5', '#ffffff', '#dfe3ec', '#1b1e29', '#6a7182', '#5a4fd0', '#3a2fb0']
  ];
  // Categorical vertex-type colours (data encoding, not decoration): held muted and consistent across every console.
  const CAT = ['#9184d9', '#5bbfb0', '#d8a657', '#cf7d9c', '#6fa8dc', '#86b97f'];

  // Modern palette set — deliberately NOT Nocturne: varied hues, moods and contrast. [name,bg,surface,line,text,mut,accent,accentHi]
  const MODERN_PAL = [
    ['Nord', '#2e3440', '#3b4252', '#4c566a', '#eceff4', '#9aa5b5', '#88c0d0', '#d8dee9'],
    ['Solar', '#002b36', '#073642', '#0f4a58', '#eee8d5', '#93a1a1', '#b58900', '#fdf6e3'],
    ['Terminal', '#0a0e0a', '#101810', '#1c2a1c', '#d6f5d6', '#7fae7f', '#49e06b', '#b9ffce'],
    ['Amber CRT', '#140f00', '#1e1600', '#33260a', '#ffe9b3', '#b79a63', '#ffb000', '#fff0cc'],
    ['Cyber', '#0b0712', '#140b22', '#291646', '#f3e9ff', '#9d84c7', '#ff3df0', '#8be9fd'],
    ['Mint', '#f2f7f4', '#ffffff', '#d7e6dd', '#13261c', '#577065', '#0e9f6e', '#06603f'],
    ['Clay', '#f5efe8', '#fffdfa', '#e6dccf', '#2a211a', '#7a6b5a', '#c2532a', '#8a3415'],
    ['Oled', '#000000', '#0b0b0d', '#1b1b20', '#f4f4f6', '#8a8a93', '#ffffff', '#c9c9d2'],
    ['Brutal', '#ffffff', '#ffffff', '#111111', '#111111', '#555555', '#111111', '#000000'],
    ['Ocean', '#071a26', '#0c2838', '#13415a', '#e4f4fb', '#7da8bd', '#19b6d9', '#bdeefb'],
    ['Grape', '#17091f', '#241233', '#3a1f52', '#f4e9fb', '#a988c0', '#b06bff', '#e9d2ff'],
    ['Steel', '#14171c', '#1d222b', '#2d3542', '#eef2f7', '#8b96a6', '#e06a4f', '#ffd6cc'],
    ['Paper+', '#f6f6f4', '#ffffff', '#e4e4df', '#17171a', '#6c6c72', '#2b2b30', '#e0533b'],
    ['Lagoon', '#04201e', '#063330', '#0b514b', '#dff7f2', '#73b3ab', '#2fd3b4', '#bff6ea']
  ];
  // Skins — form/style systems applied on top of a palette. r:radius bw:border px pat:bg pattern ff:font head:heading treatment nav:accent
  const SKINS = [
    { id: 'clean', name: 'Clean', r: 10, bw: 1, pat: 'none', ff: null, head: 'tight', chrome: 'soft' },
    { id: 'sharp', name: 'Sharp', r: 0, bw: 1, pat: 'none', ff: null, head: 'upper', chrome: 'line' },
    { id: 'round', name: 'Pill', r: 18, bw: 1, pat: 'none', ff: null, head: 'tight', chrome: 'soft' },
    { id: 'grid', name: 'Grid', r: 6, bw: 1, pat: 'grid', ff: null, head: 'tight', chrome: 'line' },
    { id: 'dots', name: 'Dotfield', r: 12, bw: 1, pat: 'dots', ff: null, head: 'tight', chrome: 'soft' },
    { id: 'mono', name: 'Monospace', r: 4, bw: 1, pat: 'none', ff: 'ui-monospace,"SF Mono",Menlo,monospace', head: 'mono', chrome: 'line' },
    { id: 'brutal', name: 'Brutalist', r: 0, bw: 2, pat: 'none', ff: null, head: 'upper', chrome: 'hard' },
    { id: 'glass', name: 'Glass', r: 16, bw: 1, pat: 'scan', ff: null, head: 'tight', chrome: 'glass' }
  ];

  const DATA = {
    graph: 'bridago', node: 2089, edge: 5114, warn: 11, ready: 86, uptime: '14d', seedId: 'seed-0x9f', model: 'LSTM-cpu ↔ 30B',
    vtx: [['File', 812, 0], ['Function', 1044, 1], ['Route', 46, 2], ['Service', 9, 3], ['Test', 158, 4], ['Finding', 20, 5]],
    edg: [['calls', 2210], ['imports', 1180], ['tests', 640], ['raises', 210], ['cites', 540], ['depends_on', 334]],
    gsql: [['CREATE QUERY blastRadius(VERTEX<Function> f) {', 'k'], ['  Seed = {f};', 't'], ['  Reach = SELECT t FROM Seed:s -(calls>:e)- :t', 't'], ['    ACCUM t.@depth += s.@depth + 1', 't'], ['    WHILE Reach.size() > 0 LIMIT 300;', 't'], ['  PRINT Reach.size() AS blast;', 't'], ['}', 'k'], ['INSTALL QUERY blastRadius   → 31 reached', 'ok']],
    rows: [['fn:ingest.build_graph', 'Function', '31', 'tested'], ['fn:agent.blast', 'Function', '31', 'FAILING'], ['route:/files/revert', 'Route', '0', 'dead'], ['svc:serve.py', 'Service', '14', 'ok'], ['fn:qa.render_page', 'Function', '6', 'tested']],
    triage: [
      { sev: 'TEST', s: 1, t: 'blast() exceeds cap 300 on the root node', w: 'test_tester_graph.py', b: '31 downstream' },
      { sev: 'QA', s: 1, t: 'Explorer overflows its container at 390px', w: 'ops/src/Explorer.dc.html', b: '6 downstream' },
      { sev: 'WARN', s: 0, t: 'serve.py: 3 functions with no test linked', w: 'tester/serve.py', b: 'isolated' },
      { sev: 'DEAD', s: 0, t: 'route /files/revert has no caller', w: 'tester/serve.py', b: 'isolated' }
    ],
    runs: [3, 2, 4, 1, 2, 0, 1, 0, 0, 2, 0, 0],
    agents: [
      ['MetaGPT', 'multi-agent SWE company', 'module', 1], ['OpenHands', 'autonomous dev + browser', 'standalone', 1],
      ['OpenClaude', 'Claude-style tool loop', 'api', 1], ['Hermes', 'function-calling router', 'module', 1],
      ['Odysseus', 'long-horizon planner', 'standalone', 0], ['Agent Zero', 'self-extending shell', 'standalone', 1],
      ['Neurite', 'fractal graph-of-thought', 'module', 1], ['SEXTANT', 'house tester / fixer', 'module', 1]
    ],
    labs: [['30B dense', 98, 'ref'], ['8B', 97, 'run'], ['1.5B', 95, 'run'], ['410M', 93, 'run'], ['LSTM · CPU', 91, 'live']],
    ledger: [['round 4821', 'repair', 'cited 3', 'signed'], ['round 4820', 'research', 'cited 5', 'signed'], ['round 4819', 'publish', 'cited 2', 'held'], ['round 4818', 'reflect', 'cited 0', 'signed']],
    gates: [['Ship ops/Explorer rebuild', 'sandbox green', 'await owner'], ['Publish landscape-2026', 'drafted', 'await owner'], ['Live-fix serve.py route', 'reverted once', 'blocked']]
  };

  // ── base stylesheet (one per console) ──────────────────────────────────
  const base = (P, d, mono, sk) => {
    sk = sk || SKINS[0];
    const light = ['Paper', 'Mint', 'Clay', 'Brutal', 'Paper+'].includes(P[0]), fs = [12, 12.5, 13.5][d], pad = [10, 12, 15][d];
    const hf = mono || sk.ff ? (sk.ff || 'ui-monospace,"SF Mono",Menlo,monospace') : 'Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    const r = sk.r, bw = sk.bw, shadow = sk.chrome === 'hard' ? `4px 4px 0 ${P[3]}` : sk.chrome === 'glass' ? `0 8px 30px rgba(0,0,0,.35)` : 'none';
    const headCss = sk.head === 'upper' ? 'text-transform:uppercase;letter-spacing:.04em;' : sk.head === 'mono' ? 'font-family:ui-monospace,Menlo,monospace;letter-spacing:-.02em;' : 'letter-spacing:-.02em;';
    const pat = sk.pat === 'grid' ? `background-image:linear-gradient(${P[3]} 1px,transparent 1px),linear-gradient(90deg,${P[3]} 1px,transparent 1px);background-size:26px 26px;background-blend-mode:overlay;opacity:1;` :
      sk.pat === 'dots' ? `background-image:radial-gradient(${P[3]} 1.1px,transparent 1.2px);background-size:20px 20px;` :
      sk.pat === 'scan' ? `background-image:repeating-linear-gradient(0deg,transparent,transparent 3px,color-mix(in srgb,${P[4]} 4%,transparent) 3px,color-mix(in srgb,${P[4]} 4%,transparent) 4px);` : '';
    return `*{box-sizing:border-box}html,body{margin:0;height:100%}body{background:${P[1]};${pat}color:${P[4]};font:${fs}px/1.5 ${hf};-webkit-font-smoothing:antialiased;letter-spacing:-.005em}
    ::selection{background:color-mix(in srgb,${P[6]} 30%,transparent)}
    .mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}.mut{color:${P[5]}}.ac{color:${P[6]}}
    .num{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
    .dot{width:7px;height:7px;border-radius:50%;flex:none}
    .panel{background:${P[1]};border:${bw}px solid ${P[3]};border-radius:${r}px;${shadow !== 'none' ? 'box-shadow:' + shadow : ''}}
    .soft{background:${light ? 'color-mix(in srgb,' + P[3] + ' 18%,transparent)' : 'color-mix(in srgb,#000 18%,transparent)'}}
    .hd{display:flex;align-items:center;gap:9px;padding:${pad - 1}px ${pad + 3}px;border-bottom:${bw}px solid ${P[3]};flex:none}
    .hd b{font-weight:600;${headCss}}
    .kick{font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.11em;text-transform:uppercase;color:${P[5]}}
    .tag{display:inline-flex;align-items:center;gap:5px;font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.03em;padding:2px 8px;border-radius:${Math.min(r, 999) && r >= 14 ? 999 : r ? 6 : 0}px;border:${bw}px solid ${P[3]};color:${P[5]};white-space:nowrap}
    .tag.a{color:${P[6]};border-color:color-mix(in srgb,${P[6]} 50%,transparent);background:color-mix(in srgb,${P[6]} 10%,transparent)}
    .tag.warn{color:#e3b34f;border-color:#e3b34f55}.tag.bad{color:#e08a6e;border-color:#e08a6e55}.tag.ok{color:#71c08e;border-color:#71c08e55}
    .btn{display:inline-flex;align-items:center;gap:6px;font:600 ${fs - 1}px ${hf};padding:6px 11px;border-radius:${r ? Math.max(r - 2, 6) : 0}px;border:${bw}px solid ${P[3]};background:transparent;color:${P[4]};cursor:pointer;white-space:nowrap;${headCss.includes('upper') ? 'text-transform:uppercase;letter-spacing:.04em;' : ''}}
    .btn.p{border-color:${P[6]};color:${P[6]};${sk.chrome === 'hard' ? 'box-shadow:3px 3px 0 ' + P[6] : ''}}.btn.p:hover{background:color-mix(in srgb,${P[6]} 12%,transparent)}
    .btn:hover{border-color:${P[5]}}
    .ico{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:${Math.max(r - 2, 0)}px;border:1px solid transparent;color:${P[5]}}
    .bar{height:4px;border-radius:${r ? 4 : 0}px;background:${P[3]};overflow:hidden}.bar>span{display:block;height:100%;background:${P[6]}}
    .row{display:flex;align-items:center;gap:10px;padding:8px ${pad + 3}px;border-top:${bw}px solid ${P[3]}}
    .glyph{width:16px;height:16px;flex:none;display:inline-block;border-radius:3px}
    h1,h2,h3,h4{margin:0;font-weight:600;${headCss};line-height:1.1}
    input,.chip{font:inherit}
    .chip{padding:5px 10px;border:${bw}px solid ${P[3]};border-radius:${Math.max(r - 3, 0)}px;color:${P[5]}}
    .scroll{overflow:auto}.scroll::-webkit-scrollbar{width:8px;height:8px}.scroll::-webkit-scrollbar-thumb{background:${P[3]};border-radius:6px}`;
  };

  const svgIcon = (p, c) => `<svg class=glyph viewBox="0 0 24 24" fill=none stroke="${c}" stroke-width=1.7 stroke-linecap=round stroke-linejoin=round style="width:17px;height:17px">${p}</svg>`;
  const ICON = {
    home: '<path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>',
    schema: '<rect x=3 y=3 width=7 height=7 rx=1/><rect x=14 y=14 width=7 height=7 rx=1/><path d="M10 6h6v8"/>',
    graph: '<circle cx=6 cy=6 r=2.4/><circle cx=18 cy=7 r=2.4/><circle cx=12 cy=17 r=2.4/><path d="M8 7l8 .5M7.5 8l4 7M16.5 9l-4 6.5"/>',
    query: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M15 15l3 3 3-5"/>',
    load: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
    insight: '<path d="M4 19V5M9 19v-7M14 19V9M19 19v-4"/>',
    agent: '<circle cx=12 cy=8 r=4/><path d="M4 20a8 8 0 0116 0"/>',
    brain: '<path d="M9 4a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 002 4 3 3 0 005 1V5a2 2 0 00-3-1zM15 4a3 3 0 013 3 3 3 0 011 5 3 3 0 01-2 4 3 3 0 01-5 1"/>',
    gate: '<rect x=5 y=11 width=14 height=9 rx=1.5/><path d="M8 11V8a4 4 0 018 0v3"/>',
    media: '<rect x=3 y=5 width=18 height=14 rx=2/><path d="M10 9l5 3-5 3z"/>',
    cog: '<circle cx=12 cy=12 r=3/><path d="M12 3v3M12 18v3M4.5 7l2 1M17.5 16l2 1M4.5 17l2-1M17.5 8l2-1"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
  };

  // ── building blocks (regions) ──────────────────────────────────────────
  const rail = (P, active) => { const items = [['home', 'Home'], ['schema', 'Schema'], ['graph', 'Explore'], ['query', 'GSQL'], ['load', 'Load'], ['insight', 'Insights'], ['agent', 'Agents'], ['gate', 'Oversight']];
    return `<nav style="width:56px;flex:none;border-right:1px solid ${P[3]};display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0;background:${P[1]}">
      <div style="width:30px;height:30px;border-radius:9px;background:${P[6]};display:grid;place-items:center;color:${P[1]};font:800 14px Inter;margin-bottom:8px">B</div>
      ${items.map((it, i) => `<div class=ico title="${it[1]}" style="${i === active ? `color:${P[6]};border-color:color-mix(in srgb,${P[6]} 45%,transparent);background:color-mix(in srgb,${P[6]} 12%,transparent)` : ''}">${svgIcon(ICON[it[0]], i === active ? P[6] : P[5])}</div>`).join('')}
      <div class=ico style="margin-top:auto">${svgIcon(ICON.cog, P[5])}</div></nav>`; };

  const topbar = (P, crumb, right) => `<header class=hd style="gap:12px">
    <div style="display:flex;align-items:center;gap:8px;min-width:0"><span class=dot style="background:${P[6]}"></span><b class=num style="font-size:13px">${esc(DATA.graph)}</b><span class=mut style="font-size:11px">graph</span>
    <span class=mut style="font-size:11px">›</span><span style="font-size:12px;font-weight:600">${esc(crumb)}</span></div>
    <span style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="tag"><span class=num>${DATA.node.toLocaleString()}</span> V</span><span class="tag"><span class=num>${DATA.edge.toLocaleString()}</span> E</span>
      <span class="tag a">Hebbian on</span>${right || `<button class="btn p">Run</button>`}</span></header>`;

  const metrics = (P) => { const m = [['Vertices', DATA.node.toLocaleString(), P[6]], ['Edges', DATA.edge.toLocaleString(), P[6]], ['Readiness', DATA.ready + '%', '#71c08e'], ['Warnings', DATA.warn, '#e3b34f'], ['Open fails', '2', '#e08a6e'], ['Seed', DATA.seedId, P[5]]];
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:${P[3]}">${m.map(x => `<div style="background:${P[1]};padding:13px 15px;display:grid;gap:3px"><span class=kick>${x[0]}</span><b class=num style="font-size:22px;color:${x[2]}">${x[1]}</b></div>`).join('')}</div>`; };

  function canvas(P, d, seed) {
    const r = rng(seed || 7), W = 760, H = 460, hubs = [];
    for (let i = 0; i < 7; i++) hubs.push({ x: 90 + r() * (W - 180), y: 70 + r() * (H - 140), c: CAT[i % CAT.length], big: i < 3 });
    const sats = [];
    for (let i = 0; i < 46; i++) { const h = hubs[(r() * hubs.length) | 0]; const a = r() * 6.28, d2 = 22 + r() * 70; sats.push({ x: h.x + Math.cos(a) * d2, y: h.y + Math.sin(a) * d2, c: h.c, hx: h.x, hy: h.y }); }
    const edges = sats.map(s => `<path d="M${s.hx.toFixed(0)} ${s.hy.toFixed(0)} Q ${((s.hx + s.x) / 2 + (r() - .5) * 22).toFixed(0)} ${((s.hy + s.y) / 2 + (r() - .5) * 22).toFixed(0)} ${s.x.toFixed(0)} ${s.y.toFixed(0)}" fill=none stroke="${P[3]}" stroke-width=1 opacity=.8/>`).join('');
    const hubEdges = hubs.map((h, i) => i ? `<path d="M${hubs[0].x.toFixed(0)} ${hubs[0].y.toFixed(0)} Q ${((hubs[0].x + h.x) / 2).toFixed(0)} ${((hubs[0].y + h.y) / 2 - 30).toFixed(0)} ${h.x.toFixed(0)} ${h.y.toFixed(0)}" fill=none stroke="${P[3]}" stroke-width=1.3 opacity=.9/>` : '').join('');
    const satDots = sats.map(s => `<circle cx=${s.x.toFixed(0)} cy=${s.y.toFixed(0)} r=3 fill="${s.c}" opacity=.72/>`).join('');
    const hubDots = hubs.map((h, i) => `<g><circle cx=${h.x.toFixed(0)} cy=${h.y.toFixed(0)} r=${h.big ? 9 : 6} fill="${P[1]}" stroke="${h.c}" stroke-width=2.2/><circle cx=${h.x.toFixed(0)} cy=${h.y.toFixed(0)} r=${h.big ? 4 : 3} fill="${h.c}"/>${h.big ? `<text x=${(h.x + 13).toFixed(0)} y=${(h.y + 4).toFixed(0)} fill="${P[4]}" font-size=11 font-family="ui-monospace,Menlo,monospace">${DATA.vtx[i % DATA.vtx.length][0]}</text>` : ''}</g>`).join('');
    const legend = DATA.vtx.map(v => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px" class=mut><span class=dot style="background:${CAT[v[2]]}"></span>${v[0]} <span class=num>${v[1]}</span></span>`).join('');
    return `<div style="position:relative;flex:1;min-height:0;min-width:0;background:radial-gradient(70% 70% at 50% 42%,${P[1]},color-mix(in srgb,${P[1]} 82%,#000));overflow:hidden">
      <svg width=100% height=100% viewBox="0 0 ${W} ${H}" preserveAspectRatio=xMidYMid slice>${edges}${hubEdges}${satDots}${hubDots}</svg>
      <div style="position:absolute;left:14px;top:12px;display:flex;gap:6px"><span class="chip">◎ fit</span><span class="chip">neighbours 2</span><span class="chip">path</span></div>
      <div style="position:absolute;left:14px;bottom:12px;right:14px;display:flex;flex-wrap:wrap;gap:13px;padding:9px 12px;border-radius:9px;background:color-mix(in srgb,${P[1]} 82%,transparent);border:1px solid ${P[3]};backdrop-filter:blur(4px)">${legend}</div></div>`;
  }

  const schema = (P, d) => `<div class="scroll" style="flex:1;min-height:0;padding:14px;display:grid;gap:12px;align-content:start">
    <div><span class=kick>Vertex types</span><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;margin-top:9px">
    ${DATA.vtx.map(v => `<div class=panel style="padding:12px;display:grid;gap:5px"><span style="display:flex;align-items:center;gap:7px"><span class=dot style="background:${CAT[v[2]]};width:9px;height:9px"></span><b>${v[0]}</b></span><b class=num style="font-size:20px;color:${CAT[v[2]]}">${v[1].toLocaleString()}</b></div>`).join('')}</div></div>
    <div><span class=kick>Edge types</span><div style="display:grid;gap:1px;margin-top:9px;background:${P[3]};border-radius:8px;overflow:hidden">
    ${DATA.edg.map(e => `<div style="background:${P[1]};display:flex;align-items:center;gap:10px;padding:9px 12px"><span class=mono style="color:${P[6]};font-size:12px">${e[0]}</span><span class=bar style="flex:1"><span style="width:${(e[1] / 2210 * 100).toFixed(0)}%"></span></span><span class="num mut" style="font-size:11px">${e[1].toLocaleString()}</span></div>`).join('')}</div></div></div>`;

  const gsql = (P, d) => `<div style="flex:1;min-height:0;display:flex;flex-direction:column">
    <div class=hd style="gap:8px"><span class=kick>GSQL query</span><span class="tag" style="margin-left:auto">blastRadius.gsql</span><button class="btn p">Install &amp; run</button></div>
    <div class="scroll mono" style="flex:1;min-height:0;padding:14px 10px;background:color-mix(in srgb,${P[1]} 88%,#000);font-size:12.5px;display:grid;gap:3px;align-content:start">
    ${DATA.gsql.map((l, i) => `<div style="display:flex;gap:12px"><span class=mut style="width:18px;text-align:right;opacity:.6">${i + 1}</span><span style="white-space:pre;color:${l[1] === 'k' ? P[6] : l[1] === 'ok' ? '#71c08e' : P[4]}">${esc(l[0])}</span></div>`).join('')}
    <div style="display:flex;gap:12px;margin-top:4px"><span class=mut style="width:18px"></span><span style="color:${P[6]}">▌</span></div></div></div>`;

  const resultTable = (P, d, head) => `<div style="flex:1;min-height:0;display:flex;flex-direction:column">
    <div class=hd><span class=kick>${head || 'Result set'}</span><span class="tag" style="margin-left:auto">${DATA.rows.length} rows · 42ms</span></div>
    <div class="scroll" style="flex:1;min-height:0"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr>${['Vertex', 'Type', 'Blast', 'State'].map(h => `<th style="text-align:left;padding:9px 14px;border-bottom:1px solid ${P[3]}" class=kick>${h}</th>`).join('')}</tr></thead>
    <tbody>${DATA.rows.map(r => `<tr style="border-bottom:1px solid ${P[3]}"><td class=mono style="padding:9px 14px;color:${P[4]}">${esc(r[0])}</td><td style="padding:9px 14px"><span style="display:inline-flex;align-items:center;gap:6px"><span class=dot style="background:${CAT[DATA.vtx.findIndex(v => v[0] === r[1]) % CAT.length]}"></span>${r[1]}</span></td><td class="num" style="padding:9px 14px">${r[2]}</td><td style="padding:9px 14px"><span class="tag ${r[3] === 'FAILING' ? 'bad' : r[3] === 'dead' ? 'warn' : 'ok'}">${r[3]}</span></td></tr>`).join('')}</tbody></table></div></div>`;

  const inspector = (P, d) => `<div class="scroll" style="padding:14px;display:grid;gap:12px;align-content:start">
    <span class=kick>Inspector</span><div class=panel style="padding:13px;display:grid;gap:8px"><span style="display:flex;align-items:center;gap:8px"><span class=dot style="background:${CAT[1]};width:10px;height:10px"></span><b class=mono>fn:agent.blast</b></span>
    <div style="display:grid;gap:6px;font-size:12px">${[['type', 'Function'], ['in-degree', '4'], ['out-degree', '31'], ['tests', '1 (failing)'], ['weight', '0.94'], ['last round', '4821']].map(k => `<div style="display:flex;justify-content:space-between"><span class=mut>${k[0]}</span><span class=num>${k[1]}</span></div>`).join('')}</div>
    <div style="display:flex;gap:6px;margin-top:2px"><button class="btn p" style="flex:1">Open</button><button class=btn style="flex:1">Trace</button></div></div>
    <div class=panel style="padding:13px;display:grid;gap:7px"><span class=kick>Provenance</span>${DATA.ledger.slice(0, 3).map(l => `<div style="display:flex;align-items:center;gap:8px;font-size:11.5px"><span class=dot style="background:${l[3] === 'signed' ? '#71c08e' : '#e3b34f'}"></span><span class=num>${l[0]}</span><span class=mut style="margin-left:auto">${l[2]}</span></div>`).join('')}</div></div>`;

  const agents = (P, d) => `<div class="scroll" style="padding:14px;display:grid;gap:9px;align-content:start">
    <div style="display:flex;align-items:center;gap:8px"><span class=kick>Agent registry</span><span class="tag a" style="margin-left:auto">${DATA.agents.filter(a => a[3]).length} awake</span></div>
    ${DATA.agents.map(a => `<div class=panel style="padding:11px 12px;display:flex;align-items:center;gap:10px"><span class=dot style="background:${a[3] ? '#71c08e' : P[5]};width:9px;height:9px;${a[3] ? '' : 'opacity:.6'}"></span>
    <div style="flex:1;min-width:0"><b style="font-size:12.5px">${a[0]}</b><div class=mut style="font-size:11px">${a[1]}</div></div>
    <span class="tag ${a[2] === 'api' ? 'a' : ''}">${a[2]}</span><span class="tag" title="${a[3] ? 'asleep → wake' : 'wake'}">${a[3] ? 'sleep' : 'wake'}</span></div>`).join('')}</div>`;

  const plasticity = (P, d) => { const ctl = (lab, val, pct, on) => `<div class=panel style="padding:12px 13px;display:grid;gap:8px"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:12.5px">${lab}</b><span class="tag ${on ? 'a' : ''}" style="margin-left:auto">${val}</span></div><div class=bar><span style="width:${pct}%"></span></div></div>`;
    return `<div class="scroll" style="padding:14px;display:grid;gap:10px;align-content:start"><div style="display:flex;align-items:center;gap:8px"><span class=kick>Plasticity &amp; memory</span><span class="tag a" style="margin-left:auto">Hebbian on</span></div>
    ${ctl('Learning rate α', '0.30', 30, 1)}${ctl('Exploration ε', '0.10', 10, 1)}${ctl('Telemetry decay / night', '0.50', 50, 1)}${ctl('Prune below', '0.05', 5, 1)}
    <div class=panel style="padding:12px 13px;display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12.5px">Sleep agent</b><div class=mut style="font-size:11px">pause rounds, keep graph warm</div></div><button class=btn>Sleep</button></div>
    <div class=panel style="padding:12px 13px;display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12.5px">Plasticity</b><div class=mut style="font-size:11px">freeze weights (no learning)</div></div><span class="tag a">on</span></div></div>`; };

  const labs = (P, d) => `<div class="scroll" style="padding:14px;display:grid;gap:12px;align-content:start">
    <div style="display:flex;align-items:center;gap:8px"><span class=kick>Substrate bench</span><span class="tag" style="margin-left:auto">${DATA.seedId} · held constant</span></div>
    <p class=mut style="margin:0;font-size:12px;max-width:52ch">One seed, every substrate. Quality holds from a 30B dense model down to an LSTM on CPU — the cognition is in the seeded graph, not the weights.</p>
    <div style="display:grid;gap:9px">${DATA.labs.map(l => `<div style="display:flex;align-items:center;gap:11px"><span style="width:92px;font-size:12px">${l[0]}</span><span class=bar style="flex:1;height:7px"><span style="width:${l[1]}%;background:${l[2] === 'live' ? '#71c08e' : l[2] === 'ref' ? P[5] : P[6]}"></span></span><span class="num" style="width:38px;text-align:right">${l[1]}%</span><span class="tag ${l[2] === 'live' ? 'ok' : ''}" style="width:46px;justify-content:center">${l[2]}</span></div>`).join('')}</div></div>`;

  const ledger = (P, d) => `<div style="flex:1;min-height:0;display:flex;flex-direction:column"><div class=hd><span class=kick>Round ledger · provenance</span><span class="tag a" style="margin-left:auto">every claim cited</span></div>
    <div class="scroll" style="flex:1;min-height:0"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>${['Round', 'Kind', 'Citations', 'Signature'].map(h => `<th class=kick style="text-align:left;padding:9px 14px;border-bottom:1px solid ${P[3]}">${h}</th>`).join('')}</tr></thead>
    <tbody>${DATA.ledger.concat([['round 4817', 'repair', 'cited 1', 'signed'], ['round 4816', 'research', 'cited 4', 'signed']]).map(l => `<tr style="border-bottom:1px solid ${P[3]}"><td class="num" style="padding:9px 14px;color:${P[6]}">${l[0]}</td><td style="padding:9px 14px">${l[1]}</td><td class="num mut" style="padding:9px 14px">${l[2]}</td><td style="padding:9px 14px"><span class="tag ${l[3] === 'signed' ? 'ok' : 'warn'}">${l[3]}</span></td></tr>`).join('')}</tbody></table></div></div>`;

  const oversight = (P, d) => `<div class="scroll" style="padding:14px;display:grid;gap:10px;align-content:start"><div style="display:flex;align-items:center;gap:8px"><span class=kick>Oversight gates</span><span class="tag warn" style="margin-left:auto">2 await owner</span></div>
    ${DATA.gates.map(g => `<div class=panel style="padding:12px 13px;display:grid;gap:9px"><b style="font-size:12.5px">${g[0]}</b><div style="display:flex;align-items:center;gap:8px"><span class="tag">${g[1]}</span><span class="tag ${g[2] === 'blocked' ? 'bad' : 'warn'}">${g[2]}</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn p">Approve</button><button class=btn>Hold</button></span></div></div>`).join('')}</div>`;

  const media = (P, d) => `<div style="flex:1;min-height:0;display:flex;flex-direction:column">
    <div style="display:flex;gap:2px;padding:0 10px;border-bottom:1px solid ${P[3]};flex:none">${['Browser', 'serve.py', 'landscape-2026', 'graph.png', '+ new tab'].map((t, i) => `<div style="padding:11px 13px;font-size:12px;font-weight:600;${i === 0 ? `color:${P[6]};box-shadow:inset 0 -2px ${P[6]}` : `color:${P[5]}`}">${t}</div>`).join('')}</div>
    <div style="flex:1;min-height:0;display:grid;place-items:center;background:color-mix(in srgb,${P[1]} 88%,#000);padding:16px"><div style="text-align:center;display:grid;gap:10px;justify-items:center"><div class=panel style="width:min(420px,70%);aspect-ratio:16/10;display:grid;place-items:center;background:${P[1]}">${svgIcon(ICON.media, P[5])}</div><span class=mut style="font-size:12px">agent can switch tabs and load any media — pages, images, video, audio, PDFs</span><button class="btn p">Open in agent browser</button></div></div></div>`;

  const logStream = (P, d) => `<div style="flex:1;min-height:0;display:flex;flex-direction:column"><div class=hd><span class=kick>Console</span><span class="tag" style="margin-left:auto">pytest · audit · js · qa</span></div>
    <div class="scroll mono" style="flex:1;min-height:0;padding:12px;background:color-mix(in srgb,${P[1]} 88%,#000);font-size:11.5px;display:grid;gap:2px;align-content:start">
    ${[['$ tester run --all', P[6]], ['syncing repo → graph (2089 V / 5114 E)', P[5]], ['PASSED test_round_trace_cites_findings', '#71c08e'], ['FAILED test_blast_radius_bounds', '#e08a6e'], ['  AssertionError: blast(root) exceeded cap 300', '#e3b34f'], ['audit: 0 errors · 11 warnings (3.1s)', '#71c08e'], ['qa 6 sizes: 1 overflow @390px', '#e3b34f'], ['266 passed · 3 failed · 12.9s', P[4]]].map(l => `<div style="white-space:pre-wrap;color:${l[1]}">${esc(l[0])}</div>`).join('')}<div style="color:${P[6]}">▌</div></div></div>`;

  const timeline = (P, d) => { const mx = Math.max(...DATA.runs, 1), pts = DATA.runs.map((v, i) => `${(i / (DATA.runs.length - 1) * 260).toFixed(0)},${(40 - v / mx * 34).toFixed(0)}`).join(' ');
    return `<div class="scroll" style="padding:14px;display:grid;gap:12px;align-content:start"><div style="display:flex;align-items:center;gap:8px"><span class=kick>Deep pass · ${DATA.runs.length} rounds</span><span class="tag ok" style="margin-left:auto">last 4 clean</span></div>
    <div class=panel style="padding:14px"><svg width=100% height=52 viewBox="0 0 260 44" preserveAspectRatio=none><polyline points="${pts}" fill=none stroke="${P[6]}" stroke-width=1.6/></svg></div>
    <div style="display:grid;gap:5px">${DATA.runs.map((v, i) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 11px;border-bottom:1px solid ${P[3]}"><span class="num mut" style="width:56px">round ${i + 1}</span><span class=dot style="background:${v ? '#e08a6e' : '#71c08e'}"></span><span style="flex:1;font-size:12px">${v ? v + ' failing' : 'all clean'}</span><span class="num mut" style="font-size:11px">${(5 + i % 3).toFixed(1)}s</span></div>`).join('')}</div></div>`; };

  const triage = (P, d) => `<div class="scroll" style="padding:14px;display:grid;gap:10px;align-content:start"><div style="display:flex;align-items:center;gap:8px"><span class=kick>Verdict · severity × blast</span><span class="tag a" style="margin-left:auto">${DATA.ready}%</span></div>
    ${DATA.triage.map((t, i) => `<div class=panel style="padding:12px 13px;display:flex;gap:11px"><span class=num style="width:22px;height:22px;flex:none;display:grid;place-items:center;border-radius:6px;background:color-mix(in srgb,${P[6]} 14%,transparent);color:${P[6]};font-weight:700">${i + 1}</span>
    <div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${t.s ? 'bad' : 'warn'}">${t.sev}</span><b style="font-size:12.5px">${esc(t.t)}</b></div><div class="num mut" style="font-size:11px;margin-top:3px">${esc(t.w)} · ${t.b}</div></div>
    <button class=btn style="flex:none;align-self:center">Open</button></div>`).join('')}</div>`;

  const readiness = (P, d) => { const pct = DATA.ready, R = 34, C = 2 * Math.PI * R;
    return `<div class="scroll" style="padding:16px;display:grid;gap:14px;align-content:start"><div class=panel style="padding:18px;display:flex;gap:18px;align-items:center">
    <svg width=92 height=92 viewBox="0 0 92 92"><circle cx=46 cy=46 r=${R} fill=none stroke="${P[3]}" stroke-width=9/><circle cx=46 cy=46 r=${R} fill=none stroke="${P[6]}" stroke-width=9 stroke-linecap=round stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 46 46)"/><text x=46 y=51 text-anchor=middle fill="${P[4]}" font-size=19 font-weight=700 font-family="ui-monospace,Menlo,monospace">${pct}%</text></svg>
    <div><h3 style="font-size:19px">Nearly launch-ready</h3><p class=mut style="margin:6px 0 0;font-size:12.5px;max-width:48ch">Stack 99% · sites 97% · ${DATA.warn} warnings. Start with the blast-radius test — 31 nodes downstream depend on it.</p></div></div>
    <div style="display:grid;gap:8px">${['Browser QA never run on Marketing · 7 pages', 'Sites at 97%, under the 98% bar', DATA.warn + ' warnings over the 10 budget'].map(g => `<div class=panel style="padding:11px 13px;display:flex;align-items:center;gap:10px"><span class=dot style="background:#e3b34f"></span><span style="flex:1;font-size:12.5px">${g}</span><button class=btn>Fill</button></div>`).join('')}</div></div>`; };

  const BLOCKS = { canvas, schema, gsql, resultTable, inspector, agents, plasticity, labs, ledger, oversight, media, logStream, timeline, triage, readiness, metrics };
  const sep = P => `<div style="width:1px;background:${P[3]};flex:none"></div>`;
  const wrap = (P, h) => `<div style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:${P[1]}">${h}</div>`;
  const topTabs = (P, crumb, active) => { const tabs = ['Explore', 'Schema', 'GSQL', 'Insights', 'Agents', 'Oversight'];
    return `<header class=hd style="gap:14px;padding-top:0;padding-bottom:0">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0"><div style="width:26px;height:26px;border-radius:8px;background:${P[6]};display:grid;place-items:center;color:${P[1]};font:800 13px Inter">B</div><b class=num style="font-size:13px">${esc(DATA.graph)}</b></div>
      <nav style="display:flex;gap:2px;align-self:stretch">${tabs.map((t, i) => `<div style="display:flex;align-items:center;padding:0 13px;font-size:12.5px;font-weight:600;${i === active ? `color:${P[6]};box-shadow:inset 0 -2px ${P[6]}` : `color:${P[5]}`}">${t}</div>`).join('')}</nav>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center"><span class="tag"><span class=num>${DATA.node.toLocaleString()}</span> V</span><span class="tag a">Hebbian on</span><button class="btn p">Run</button></span></header>`; };
  const cell = (P, h, span) => `<div class=panel style="overflow:hidden;min-height:0;display:flex;flex-direction:column;${span ? 'grid-column:span ' + span : ''}">${h}</div>`;

  // ── frames: arrange a primary + aux (+ aux2) into a full-height console ──
  const FRAMES = [
    ['rail-split', 'Explore workspace', 2, (P, d, b, crumb) => `<div style="display:flex;height:100vh">${rail(P, 2)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${topbar(P, crumb)}<div style="flex:1;min-height:0;display:flex">${wrap(P, b[0])}${sep(P)}<div style="width:320px;flex:none;display:flex;flex-direction:column;background:${P[1]}">${b[1]}</div></div></main></div>`],
    ['rail-split-wide', 'Query workspace', 3, (P, d, b, crumb) => `<div style="display:flex;height:100vh">${rail(P, 3)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${topbar(P, crumb)}<div style="flex:1;min-height:0;display:grid;grid-template-rows:1.2fr 1fr">${wrap(P, b[0])}<div style="border-top:1px solid ${P[3]};display:flex;flex-direction:column">${b[1]}</div></div></main></div>`],
    ['rail-triptych', 'Full workspace', 2, (P, d, b, crumb) => `<div style="display:flex;height:100vh">${rail(P, 2)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${topbar(P, crumb)}<div style="flex:1;min-height:0;display:flex"><div style="width:300px;flex:none;display:flex;flex-direction:column;border-right:1px solid ${P[3]}">${b[1]}</div>${wrap(P, b[0])}${sep(P)}<div style="width:300px;flex:none;display:flex;flex-direction:column">${b[2]}</div></div></main></div>`],
    ['top-split', 'Operations', 5, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh"><main style="flex:1;display:flex;flex-direction:column">${topbar(P, crumb)}<div style="flex:1;min-height:0;display:flex">${wrap(P, b[0])}${sep(P)}<div style="width:340px;flex:none;display:flex;flex-direction:column">${b[1]}</div></div></main></div>`],
    ['top-metrics-split', 'Monitor', 5, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topbar(P, crumb)}${metrics(P)}<div style="flex:1;min-height:0;display:flex;border-top:1px solid ${P[3]}">${wrap(P, b[0])}${sep(P)}<div style="width:360px;flex:none;display:flex;flex-direction:column">${b[1]}</div></div></div>`],
    ['rail-stack', 'Control', 6, (P, d, b, crumb) => `<div style="display:flex;height:100vh">${rail(P, 6)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${topbar(P, crumb)}<div class=scroll style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:${P[3]}"><div style="background:${P[1]};display:flex;flex-direction:column">${b[0]}</div><div style="background:${P[1]};display:flex;flex-direction:column">${b[1]}</div></div></main></div>`],
    ['canvas-hero', 'Graph', 2, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topbar(P, crumb)}<div style="flex:1;min-height:0;position:relative;display:flex">${wrap(P, b[0])}<div style="position:absolute;top:14px;right:14px;width:300px;border-radius:10px;overflow:hidden;background:${P[1]};border:1px solid ${P[3]};max-height:calc(100% - 28px);display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.5)">${b[1]}</div></div></div>`],
    ['governance', 'Governance', 7, (P, d, b, crumb) => `<div style="display:flex;height:100vh">${rail(P, 7)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${topbar(P, crumb)}<div style="flex:1;min-height:0;display:flex">${wrap(P, b[0])}${sep(P)}<div style="flex:1;min-width:0;display:flex;flex-direction:column">${b[1]}</div></div></main></div>`],
    ['top-tabs', 'Workbench', 0, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topTabs(P, crumb, 0)}<div style="flex:1;min-height:0;display:flex">${wrap(P, b[0])}${sep(P)}<div style="width:330px;flex:none;display:flex;flex-direction:column">${b[1]}</div></div></div>`],
    ['bento', 'Bento board', 0, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topTabs(P, crumb, 3)}<div class=scroll style="flex:1;min-height:0;padding:14px;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(190px,1fr);gap:14px">${cell(P, b[0], 2)}${cell(P, b[1], 1)}${cell(P, b[2], 1)}${cell(P, BLOCKS.metrics(P), 2)}</div></div>`],
    ['islands', 'Islands', 0, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topTabs(P, crumb, 0)}<div class=scroll style="flex:1;min-height:0;position:relative;padding:16px;display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-content:start"><div class=panel style="grid-row:span 2;overflow:hidden;min-height:460px;display:flex;flex-direction:column">${b[0]}</div><div class=panel style="overflow:hidden;min-height:220px;display:flex;flex-direction:column">${b[1]}</div><div class=panel style="overflow:hidden;min-height:220px;display:flex;flex-direction:column">${b[2]}</div></div></div>`],
    ['command-bar', 'Command', 0, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh"><div style="padding:14px 16px;border-bottom:1px solid ${P[3]};display:flex;gap:12px;align-items:center"><div style="width:26px;height:26px;border-radius:8px;background:${P[6]};display:grid;place-items:center;color:${P[1]};font:800 13px Inter">B</div><div class=panel style="flex:1;display:flex;align-items:center;gap:10px;padding:9px 14px"><span class=ac style="font-size:15px">⌕</span><span class=mut style="flex:1;font-size:13px">run blastRadius · explain fail · wake OpenHands · load media…</span><span class=tag>⌘K</span></div><button class="btn p">Run</button></div><div style="flex:1;min-height:0;display:flex">${wrap(P, b[0])}${sep(P)}<div style="width:340px;flex:none;display:flex;flex-direction:column">${b[1]}</div></div></div>`],
    ['dock', 'Dock', 0, (P, d, b, crumb) => `<div style="display:flex;flex-direction:column;height:100vh">${topbar(P, crumb)}<div style="flex:1;min-height:0;position:relative;display:flex">${wrap(P, b[0])}<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:16px;width:min(680px,92%);max-height:46%;display:flex;gap:12px"><div class=panel style="flex:1;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(6px)">${b[1]}</div><div class=panel style="flex:1;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(6px)">${b[2]}</div></div></div></div>`]
  ];

  const PRIMARIES = ['canvas', 'gsql', 'schema', 'media', 'labs', 'ledger', 'logStream', 'readiness', 'resultTable'];
  const AUXES = ['inspector', 'agents', 'plasticity', 'triage', 'timeline', 'oversight', 'ledger', 'schema'];
  const THIRDS = ['inspector', 'agents', 'triage', 'timeline', 'plasticity'];

  function build(spec) {
    const pals = spec.modern ? MODERN_PAL : PAL;
    const P = pals[spec.pal % pals.length], F = FRAMES[spec.frame % FRAMES.length], d = spec.density || 0;
    const sk = SKINS[spec.skin || 0];
    const prim = BLOCKS[PRIMARIES[spec.primary % PRIMARIES.length]];
    const aux = BLOCKS[AUXES[spec.aux % AUXES.length]];
    const third = BLOCKS[THIRDS[spec.aux2 % THIRDS.length]];
    const b = [prim(P, d, spec.seed), aux(P, d), third(P, d)];
    const body = F[3](P, d, b, F[1]);
    const css = base(P, d, spec.mono, sk);
    return `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(DATA.graph)} · ${esc(F[1])}</title><style>${css}</style><body>${body}</body></html>`;
  }

  // Unique archetypes. Batch A (graph-console): first 8 frames, Nocturne family, one clean skin.
  // Batch B (modern): all frames, modern palettes, all skins — uniqueness keyed on form+style so no two repeat.
  function plan(n, seed = 0, modern = false) {
    const out = [], sig = new Set();
    const frameN = modern ? FRAMES.length : 8, palN = (modern ? MODERN_PAL : PAL).length, skinN = modern ? SKINS.length : 1;
    let i = 0, guard = 0;
    while (out.length < n && guard < n * 80) {
      guard++;
      const frame = (i * (modern ? 1 : 1) + seed) % frameN;
      const primary = (i * 3 + seed) % PRIMARIES.length;
      const aux = (i * 5 + Math.floor(i / frameN) + seed) % AUXES.length;
      const aux2 = (i * 7 + seed) % THIRDS.length;
      const skin = modern ? (i * 2 + Math.floor(i / frameN)) % skinN : 0;
      i++;
      const k = modern ? [frame, primary, aux, aux2, skin].join('|') : [frame, primary, aux, aux2].join('|');
      if (sig.has(k)) continue;
      sig.add(k);
      out.push({ modern, frame, primary, aux, aux2, skin, pal: (out.length * 3 + Math.floor(out.length / 17) + seed) % palN, density: (out.length + seed) % 3, mono: modern ? 0 : Math.floor(out.length / 7) % 2, seed: 1000 + out.length * 13 + seed });
    }
    return out;
  }
  function label(spec) { const sk = SKINS[spec.skin || 0]; return FRAMES[spec.frame % FRAMES.length][1] + ' · ' + PRIMARIES[spec.primary % PRIMARIES.length] + (spec.modern ? ' · ' + sk.name : ''); }
  function meta(spec) { const pals = spec.modern ? MODERN_PAL : PAL; return pals[spec.pal % pals.length][0] + ' · +' + AUXES[spec.aux % AUXES.length]; }
  window.ConsoleKit = { build, plan, label, meta, FRAMES, PRIMARIES, AUXES, SKINS, PAL, MODERN_PAL, DATA };
})();
