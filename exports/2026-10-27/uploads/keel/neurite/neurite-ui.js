/* Neurite UI · DOM chrome, rendering, input, node windows, panels, menus
   Ported from satellitecomponent/Neurite: interface.js, nodeclass.js (draw), edgeclass.js (EdgeView), window.js,
   togglenodestate.js (collapse + drag box), nodestep.js (mouse path), handledrop.js, neuritepanel.js,
   tabs (fractal, notes, ai, help), functioncallingpanel.js, displaysavedcoords.js, customcontextmenu.js, bundlecode.js. */
(function () {
'use strict';
const NS = window.Neurite, C = NS.core, G = NS.graph, vec2 = C.vec2, clamp = C.clamp, esc = C.esc, ZK = C.ZK, P = NS.Surface.prototype;
if (NS.mount) return;
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const CSS = `
.nrt{position:relative;overflow:hidden;background:var(--color-bg,#161826);touch-action:none;outline:none;font-family:var(--font-body,Inter,system-ui,sans-serif);color:var(--color-text,#e9e9ed);-webkit-user-select:none;user-select:none}
.nrt>canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.nrt-layer{position:absolute;left:0;top:0;width:0;height:0}
.nrt.grab{cursor:grabbing}.nrt.wire{cursor:crosshair}.nrt.hoverable{cursor:pointer}
.nrt-node{position:absolute;left:0;top:0;transform-origin:50% 50%;will-change:transform}
.nrt-win{position:absolute;inset:0;display:flex;flex-direction:column;border-radius:14px;background:color-mix(in srgb,var(--nrt-tint,var(--color-surface)) 14%,var(--color-surface,#20223a));box-shadow:0 0 0 1px color-mix(in srgb,var(--nrt-ic,var(--color-neutral-400)) 30%,transparent),var(--shadow-md);overflow:hidden;font-size:13px;line-height:1.45;transition:box-shadow .18s,opacity .18s}
.nrt-node.sel .nrt-win,.nrt-node.sel .nrt-chipc{box-shadow:0 0 0 2px var(--color-accent),var(--shadow-md)}
.nrt-node.lit .nrt-win,.nrt-node.match .nrt-win,.nrt-node.lit .nrt-chipc,.nrt-node.match .nrt-chipc{box-shadow:0 0 0 1.5px var(--color-accent),0 0 28px color-mix(in srgb,var(--color-accent) 55%,transparent)}
.nrt-node.prev .nrt-win,.nrt-node.prev .nrt-chipc{box-shadow:0 0 0 2px var(--color-accent),0 0 0 7px color-mix(in srgb,var(--color-accent) 22%,transparent)}
.nrt-node.dim{opacity:.32}.nrt-node.nomatch{opacity:.22}
.nrt-head{flex:none;display:flex;align-items:center;gap:6px;padding:7px 6px 5px 10px;cursor:grab}
.nrt-head>i{flex:none;font-size:15px;color:var(--nrt-ic,var(--color-neutral-300))}
.nrt-title{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:500 13.5px/1.2 var(--font-body);padding:2px 0;text-overflow:ellipsis;-webkit-user-select:text;user-select:text}
.nrt-btn{flex:none;display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--color-neutral-500);cursor:pointer;font-size:13px;padding:0}
.nrt-btn:hover{background:color-mix(in srgb,var(--color-text) 9%,transparent);color:var(--color-text)}
.nrt-btn:focus-visible,.nrt-chip:focus-visible,.nrt-send:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
.nrt-node.anch .nrt-btn[data-act=anchor]{color:var(--color-accent)}
.nrt-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:0 9px 9px}
.nrt-ta{flex:1;min-height:0;width:100%;box-sizing:border-box;border:0;outline:0;resize:none;border-radius:10px;padding:7px 9px;background:rgba(255,255,255,.04);color:var(--color-neutral-100);font:inherit;font-size:12.5px;line-height:1.6;-webkit-user-select:text;user-select:text}
.nrt-in{min-width:0;border:1px solid var(--color-divider);outline:0;border-radius:9px;padding:5px 9px;background:rgba(255,255,255,.045);color:var(--color-text);font:inherit;font-size:12.5px;-webkit-user-select:text;user-select:text}
.nrt-ta:focus-visible,.nrt-in:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px}
.nrt-mono{font-family:var(--font-mono,ui-monospace,monospace)}
.nrt-resize{position:absolute;right:3px;bottom:3px;width:12px;height:12px;cursor:nwse-resize;border-right:2px solid var(--color-neutral-600);border-bottom:2px solid var(--color-neutral-600);border-radius:0 0 5px 0;opacity:.75}
.nrt-circle,.nrt-ctitle{display:none}
.nrt-node.col .nrt-win{display:none}
.nrt-node.col .nrt-circle{display:grid;place-items:center;position:absolute;inset:0;border-radius:50%;background:color-mix(in srgb,var(--nrt-tint,var(--color-surface)) 16%,var(--color-surface));box-shadow:0 0 0 1px color-mix(in srgb,var(--nrt-ic,var(--color-neutral-400)) 40%,transparent),0 0 22px color-mix(in srgb,var(--nrt-ic,var(--color-accent)) 22%,transparent);font-size:22px;color:var(--nrt-ic,var(--color-neutral-300));cursor:pointer}
.nrt-node.col.anch .nrt-circle{box-shadow:0 0 0 2px var(--color-accent),0 0 22px color-mix(in srgb,var(--color-accent) 30%,transparent)}
.nrt-node.col .nrt-ctitle{display:block;position:absolute;top:66px;left:50%;transform:translateX(-50%);font-size:12px;white-space:nowrap;color:var(--color-neutral-300)}
.nrt-chipc{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1px;padding:7px 12px;border-radius:12px;background:color-mix(in srgb,var(--nrt-tint,var(--color-surface)) 13%,var(--color-surface));box-shadow:0 0 0 1px color-mix(in srgb,var(--nrt-ic,var(--color-neutral-400)) 40%,transparent),0 0 20px color-mix(in srgb,var(--nrt-ic,var(--color-neutral-400)) 18%,transparent);overflow:hidden;cursor:pointer;transition:box-shadow .18s}
.nrt-chipc .k{display:flex;align-items:center;gap:6px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--nrt-ic,var(--color-neutral-400));white-space:nowrap}
.nrt-chipc .t{font-size:14px;font-weight:500;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nrt-chipc .s{font-size:11.5px;color:var(--color-neutral-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nrt-msgs{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:2px 1px}
.nrt-msg{display:flex;flex-direction:column;gap:3px;max-width:88%;align-self:flex-start}
.nrt-msg.you{align-self:flex-end;align-items:flex-end}
.nrt-who{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-neutral-500);padding:0 4px}
.nrt-bub{padding:7px 11px;border-radius:14px 14px 14px 4px;background:rgba(255,255,255,.05);color:var(--color-neutral-100);font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text}
.nrt-msg.you .nrt-bub{border-radius:14px 14px 4px 14px;background:color-mix(in srgb,var(--color-accent) 20%,transparent);color:var(--color-accent-100)}
.nrt-empty{flex:1;min-height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;color:var(--color-neutral-500);font-size:12px;line-height:1.45;text-wrap:pretty}
.nrt-empty i{font-size:22px;color:color-mix(in srgb,var(--color-accent) 70%,transparent)}
.nrt-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nrt-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--color-divider);background:transparent;color:var(--color-neutral-300);font-size:11.5px;cursor:pointer;white-space:nowrap}
.nrt-chip:hover{background:color-mix(in srgb,var(--color-text) 7%,transparent)}
.nrt-chip.on{border-color:color-mix(in srgb,var(--color-accent) 55%,transparent);background:color-mix(in srgb,var(--color-accent) 16%,transparent);color:var(--color-text)}
.nrt-send{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--color-accent);background:transparent;color:var(--color-accent);cursor:pointer}
.nrt-send:hover{background:color-mix(in srgb,var(--color-accent) 16%,transparent)}
.nrt-node.busy .nrt-send i{animation:nrt-spin 1s linear infinite}
@keyframes nrt-spin{to{transform:rotate(360deg)}}
.nrt-meta{font-size:11px;color:var(--color-neutral-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nrt-pre{flex:1;min-height:0;overflow:auto;margin:0;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.28);font:11.5px/1.55 var(--font-mono,ui-monospace,monospace);color:var(--color-neutral-300);white-space:pre;tab-size:4;-webkit-user-select:text;user-select:text}
.nrt-frame{flex:1;min-height:0;width:100%;border:0;border-radius:10px;background:var(--color-neutral-100)}
.nrt-img{flex:1;min-height:0;width:100%;object-fit:contain;border-radius:10px}
.nrt-hud{position:absolute;z-index:5;display:flex;align-items:center;gap:8px;padding:3px 4px 3px 12px;border-radius:999px;border:1px solid var(--color-divider);background:color-mix(in srgb,var(--color-surface) 84%,transparent);backdrop-filter:blur(10px);font-size:11.5px;color:var(--color-neutral-400);max-width:calc(100% - 24px);overflow:hidden}
.nrt-hud input{width:150px;border:0;outline:0;background:transparent;color:var(--color-neutral-200);font:11.5px var(--font-mono,ui-monospace,monospace);padding:2px 0}
.nrt-hud input.z{width:70px}
.nrt-hud .sep{width:1px;height:14px;background:var(--color-divider)}
.nrt-hud .st{font-variant-numeric:tabular-nums;white-space:nowrap}
.nrt-dock{position:absolute;top:10px;right:10px;bottom:10px;width:min(370px,calc(100% - 20px));z-index:7;display:flex;flex-direction:column;gap:12px;padding:14px 15px;border-radius:16px;background:color-mix(in srgb,var(--color-surface) 95%,transparent);backdrop-filter:blur(14px);box-shadow:var(--shadow-lg);overflow:auto;-webkit-user-select:text;user-select:text}
.nrt-dock[hidden]{display:none}
.nrt-h2{font:400 22px/1 var(--font-heading,var(--font-body))}
.nrt-lab{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-neutral-500)}
.nrt-help{font-size:12px;line-height:1.5;color:var(--color-neutral-400);text-wrap:pretty}
.nrt-grid{display:grid;grid-template-columns:auto minmax(0,1fr) 58px;align-items:center;gap:8px 10px;font-size:12px}
.nrt-grid>span:first-child,.nrt-grid .l{color:var(--color-neutral-400)}
.nrt-grid input[type=range]{width:100%;margin:0;accent-color:var(--color-accent)}
.nrt-grid .v{font:11px var(--font-mono,ui-monospace,monospace);color:var(--color-neutral-300);text-align:right}
.nrt-seg{display:flex;flex-wrap:wrap;padding:2px;gap:2px;border-radius:8px;background:rgba(255,255,255,.07)}
.nrt-seg button{flex:1 1 auto;border:0;padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;background:transparent;color:var(--color-neutral-400)}
.nrt-seg button:hover{color:var(--color-text)}
.nrt-seg button.on{background:color-mix(in srgb,var(--color-accent) 24%,transparent);color:var(--color-text)}
.nrt-zk{position:relative;flex:1;min-height:260px}
.nrt-zk pre,.nrt-zk textarea{position:absolute;inset:0;margin:0;padding:10px 12px;border-radius:10px;font:12.5px/1.6 var(--font-mono,ui-monospace,monospace);white-space:pre-wrap;word-break:break-word;overflow:auto;box-sizing:border-box;tab-size:4}
.nrt-zk pre{background:rgba(0,0,0,.25);color:var(--color-neutral-300);pointer-events:none}
.nrt-zk textarea{background:transparent;color:transparent;caret-color:var(--color-text);border:0;outline:0;resize:none}
.nrt-zk textarea:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px}
.nrt-zk .t{color:var(--color-accent-200)}.nrt-zk .r{color:oklch(0.8 0.09 205)}.nrt-zk .a{color:var(--color-accent)}
.nrt-list{display:flex;flex-direction:column;gap:2px}
.nrt-li{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--color-text);font-size:12.5px;cursor:pointer;text-align:left}
.nrt-li:hover{background:rgba(255,255,255,.07)}
.nrt-li .x{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nrt-li .m{flex:none;font-size:11px;color:var(--color-neutral-500)}
.nrt-log{flex:1;min-height:140px;overflow:auto;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.28);font:11.5px/1.55 var(--font-mono,ui-monospace,monospace);color:var(--color-neutral-300);white-space:pre-wrap;word-break:break-word}
.nrt-log .e{color:oklch(0.74 0.12 25)}.nrt-log .c{color:var(--color-accent-300)}
.nrt-menu{position:fixed;z-index:300;min-width:212px;max-width:280px;padding:6px;border-radius:12px;background:var(--color-surface);box-shadow:var(--shadow-lg)}
.nrt-menu .h{padding:4px 10px 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-neutral-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nrt-mi{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--color-text);font-size:13px;cursor:pointer;text-align:left}
.nrt-mi:hover{background:rgba(255,255,255,.07)}.nrt-mi.danger{color:oklch(0.74 0.12 25)}
.nrt-box{position:absolute;z-index:4;border:1px solid var(--color-accent);background:color-mix(in srgb,var(--color-accent) 12%,transparent);border-radius:4px;pointer-events:none}
.nrt-toast{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:8;padding:7px 14px;border-radius:999px;background:var(--color-surface);box-shadow:var(--shadow-md);font-size:12.5px;color:var(--color-text);pointer-events:none;transition:opacity .25s}
.nrt-pad{position:relative;width:132px;height:132px;border-radius:10px;background:rgba(0,0,0,.28);cursor:crosshair}
.nrt-pad span{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--color-accent);box-shadow:0 0 10px var(--color-accent)}
.nrt-eq{font:13px var(--font-mono,ui-monospace,monospace);color:var(--color-accent-300)}
`;
function injectCSS() { if (document.getElementById('nrt-css')) return; const st = mk('style'); st.id = 'nrt-css'; st.textContent = CSS; document.head.appendChild(st); }

/* ───────────── chrome ───────────── */
P.buildChrome = function () {
  injectCSS();
  const h = this.host; h.classList.add('nrt'); if (!h.hasAttribute('tabindex')) h.tabIndex = 0;
  this.cvBg = mk('canvas'); this.cvFg = mk('canvas'); this.layer = mk('div', 'nrt-layer'); this.box = mk('div', 'nrt-box'); this.box.style.display = 'none';
  h.append(this.cvBg, this.layer, this.cvFg, this.box);
  this.gBg = this.cvBg.getContext('2d'); this.gFg = this.cvFg.getContext('2d');
  this.cvFg.style.zIndex = '3';
  this.resolveTheme();
  const ui = this.o.ui || {};
  if (ui.hud !== false) this.buildHUD(ui.hudPos || 'bl');
  this.dock = mk('div', 'nrt-dock'); this.dock.hidden = true; h.appendChild(this.dock);
  this.toastEl = mk('div', 'nrt-toast'); this.toastEl.style.opacity = '0'; h.appendChild(this.toastEl);
  const size = () => { const r = h.getBoundingClientRect(); this.W = Math.max(10, r.width); this.H = Math.max(10, r.height); const dpr = Math.min(2, window.devicePixelRatio || 1); this.dpr = dpr; [this.cvBg, this.cvFg].forEach(c => { c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr); }); this.updateXform(); this._camDirty = true; };
  size(); this.ro = new ResizeObserver(size); this.ro.observe(h);
};
P.resolveTheme = function () {
  const cs = getComputedStyle(this.host), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
  this.theme = { accent: v('--color-accent', '#9184d9'), accent300: v('--color-accent-300', '#b9b0ee'), accent200: v('--color-accent-200', '#cfc8f5'), text: v('--color-text', '#e9e9ed'), n300: v('--color-neutral-300', '#b3b5c4'), n400: v('--color-neutral-400', '#8f92a6'), n500: v('--color-neutral-500', '#6d7086'), n600: v('--color-neutral-600', '#505368'), teal: 'oklch(0.8 0.09 205)', bg: v('--color-bg', '#161826') };
};
P.toast = function (text) { if (!this.toastEl) return; this.toastEl.textContent = text; this.toastEl.style.opacity = '1'; clearTimeout(this._toT); this._toT = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 2200); this.emit('toast', text); };
P.buildHUD = function (pos) {
  const hud = this.hud = mk('div', 'nrt-hud');
  const at = { bl: 'left:12px;bottom:12px', br: 'right:12px;bottom:12px', tl: 'left:12px;top:12px', tr: 'right:12px;top:12px' }[pos] || 'left:12px;bottom:12px';
  hud.style.cssText = at;
  const btn = (act, icon, title) => '<button class="nrt-btn" data-act="' + act + '" title="' + title + '"><i class="ph ' + icon + '"></i></button>';
  hud.innerHTML = '<i class="ph ph-crosshair-simple" title="Coordinates (Neurite)"></i><input class="p" spellcheck="false" title="Pan · x+iy"><input class="z" spellcheck="false" title="Zoom magnitude"><span class="sep"></span><span class="st"></span><span class="sep"></span>' +
    btn('panel-zettel', 'ph-notebook', 'Zettelkasten') + btn('panel-fractal', 'ph-spiral', 'Fractal') + btn('panel-search', 'ph-magnifying-glass', 'Search') + btn('panel-functions', 'ph-terminal-window', 'Neural API') + btn('panel-saves', 'ph-floppy-disk', 'Saves') + btn('automata', 'ph-atom', 'Cellular automata') + btn('panel-help', 'ph-question', 'Controls');
  this.host.appendChild(hud);
  const pin = hud.querySelector('.p'), zin = hud.querySelector('.z');
  pin.addEventListener('input', () => { const m = pin.value.match(/([+-]?(?:\d*\.\d*|\d+)(?:[eE][+-]?\d+)?)\s*,?\s*([+-]?i?(?:\d*\.\d*|\d+)(?:[eE][+-]?\d+)?)/); if (!m) return; this.autopilot.reset(); this.pan = new vec2(parseFloat(m[1]), parseFloat(m[2].replace(/[iI]/, ''))); this.camMoved(); this._coordsEdit = true; });
  zin.addEventListener('input', () => { const z = parseFloat(zin.value); if (z > 0) { this.autopilot.reset(); this.zoom = this.zoom.scale(z / this.zoom.mag()); this.camMoved(); this._coordsEdit = true; } });
  [pin, zin].forEach(i => { i.addEventListener('blur', () => { this._coordsEdit = false; }); i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); }); });
};
P.uiHud = function () {
  if (!this.hud) return;
  const pin = this.hud.querySelector('.p'), zin = this.hud.querySelector('.z'), st = this.hud.querySelector('.st'), f = x => (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(4) : x.toFixed(6));
  if (!this._coordsEdit && document.activeElement !== pin && document.activeElement !== zin) { pin.value = f(this.pan.x) + (this.pan.y < 0 ? '-i' : '+i') + f(Math.abs(this.pan.y)); zin.value = this.zoom.mag().toExponential(2); }
  let n = 0; this.nodes.forEach(x => { if (!x.hidden) n++; });
  st.textContent = Math.round(this.fps) + ' fps · ' + n + ' nodes · ' + this.edges.size + ' edges';
  const ab = this.hud.querySelector('[data-act=automata]'); if (ab) ab.style.color = this.automata.running ? 'var(--color-accent)' : '';
};

/* ───────────── rendering (mandelbrot.js hairs · EdgeView · Node.draw) ───────────── */
P.render = function (t) {
  const g = this.gBg, f = this.gFg, dpr = this.dpr || 1, W = this.W, H = this.H, S = this.S, now = performance.now(), zm = this.zoom.mag();
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const pxz = this.pxz, keep = [];
  for (const hh of this.hairs) {
    const r = hh.kz / zm, age = now - hh.t; let a = hh.a * Math.min(1, age / 320);
    if (!hh.keep && (r > 7 || r < 0.12)) continue;
    if (!hh.keep && (r > 3.5 || r < 0.25)) a *= 0.45;
    keep.push(hh);
    const p = hh.p, lw = clamp(hh.w * pxz, 0.35, 5);
    let x = this.sx(p[0], p[1]), y = this.sy(p[0], p[1]);
    const ex = this.sx(p[p.length - 2], p[p.length - 1]), ey = this.sy(p[p.length - 2], p[p.length - 1]);
    if ((x < -60 && ex < -60) || (x > W + 60 && ex > W + 60) || (y < -60 && ey < -60) || (y > H + 60 && ey > H + 60)) continue;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 2; i < p.length; i += 2) g.lineTo(this.sx(p[i], p[i + 1]), this.sy(p[i], p[i + 1]));
    const c = hh.c, cs = c[0] + ',' + c[1] + ',' + c[2];
    if (S.glow > 0.02 && lw > 0.6) { g.strokeStyle = 'rgba(' + cs + ',' + (a * 0.09 * S.glow).toFixed(3) + ')'; g.lineWidth = lw * 5; g.stroke(); }
    g.strokeStyle = 'rgba(' + cs + ',' + (a * 0.85).toFixed(3) + ')'; g.lineWidth = lw; g.stroke();
  }
  this.hairs = keep; g.globalCompositeOperation = 'source-over';
  /* foreground: edges, LOD dots, orbit path, wire */
  f.setTransform(dpr, 0, 0, dpr, 0, 0); f.clearRect(0, 0, W, H);
  const T = this.theme, litOn = this.lit.size > 0, focus = this.focusNode, adj = focus ? new Set([focus.uuid].concat(focus.edges.map(e => e.other(focus).uuid))) : null;
  const dots = []; this._dots = dots;
  this.nodes.forEach(n => this.placeNode(n, dots, litOn, adj));
  for (const e of this.edges.values()) this.drawEdge(f, e, now, litOn, adj);
  this.drawPulses(f, now);
  if (dots.length) {
    const labels = dots.length < 700;
    f.font = '500 11px ' + (getComputedStyle(this.host).fontFamily || 'sans-serif'); f.textBaseline = 'middle';
    for (const d of dots) {
      const n = d.n, col = n.color || (n.isLLM ? T.accent : T.n300);
      f.globalAlpha = n.hidden ? 0 : (litOn && !this.lit.has(n.uuid)) || (adj && !adj.has(n.uuid)) || (this.matches && !this.matches.has(n.uuid)) ? 0.25 : 1;
      f.beginPath(); f.arc(d.x, d.y, d.r, 0, 6.283); f.fillStyle = col; f.fill();
      if (this.selected.has(n.uuid) || this.lit.has(n.uuid) || (this.matches && this.matches.has(n.uuid))) { f.lineWidth = 1.5; f.strokeStyle = T.accent; f.stroke(); f.beginPath(); f.arc(d.x, d.y, d.r + 5, 0, 6.283); f.fillStyle = 'rgba(145,132,217,.14)'; f.fill(); }
      if ((labels && d.r >= 3.2) || this.hoverDot === n) { f.fillStyle = T.n300; f.fillText(n.title.length > 34 ? n.title.slice(0, 33) + '…' : n.title, d.x + d.r + 5, d.y); }
    }
    f.globalAlpha = 1;
  }
  if (this.mousePath.length > 1) { f.beginPath(); this.mousePath.forEach((z, i) => { const x = this.sx(z.x, z.y), y = this.sy(z.x, z.y); i ? f.lineTo(x, y) : f.moveTo(x, y); }); f.strokeStyle = 'rgba(207,200,245,.55)'; f.lineWidth = 1; f.stroke(); }
  if (this.prev && !this.prev.removed) { const a = this.fromZ(this.prev.pos); f.setLineDash([6, 5]); f.beginPath(); f.moveTo(a.x, a.y); f.lineTo(this.mouse.x, this.mouse.y); f.strokeStyle = T.accent; f.lineWidth = 2; f.stroke(); f.setLineDash([]); }
};
P.placeNode = function (n, dots, litOn, adj) {
  let e = n.el;
  if (n.hidden) { if (e && n._vis !== 0) { e.style.display = 'none'; n._vis = 0; } return; }
  const s = this.nodeScale(n), w = n.dispW(), hgt = n.dispH(), x = this.sx(n.pos.x, n.pos.y), y = this.sy(n.pos.x, n.pos.y), sw = w * s, sh = hgt * s;
  const off = x + sw / 2 < -40 || x - sw / 2 > this.W + 40 || y + sh / 2 < -40 || y - sh / 2 > this.H + 40;
  const tiny = sw < this.S.lodPx && !n.followingMouse;
  if (off || tiny || s > 60) {
    if (e && n._vis !== 0) { e.style.display = 'none'; n._vis = 0; }
    if (!off && tiny && sw > 0.4) dots.push({ n, x, y, r: clamp(sw * 0.16, 1.4, 7) });
    return;
  }
  if (!e) { this.buildNodeEl(n); e = n.el; }
  if (n._vis !== 1) { e.style.display = ''; n._vis = 1; }
  if (n._w !== w || n._h !== hgt) { e.style.width = w + 'px'; e.style.height = hgt + 'px'; n._w = w; n._h = hgt; }
  const tr = 'translate3d(' + (x - w / 2).toFixed(1) + 'px,' + (y - hgt / 2).toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
  if (tr !== n._tr) { e.style.transform = tr; n._tr = tr; }
  const dim = (litOn && !this.lit.has(n.uuid)) || (adj && !adj.has(n.uuid));
  if (dim !== n._dim) { e.classList.toggle('dim', dim); n._dim = dim; }
};
P.edgeColor = function (e) {
  const st = e.style || {}, T = this.theme;
  if (st.color) return st.color;
  return e.kind === 'ref' ? T.accent300 : e.kind === 'ai' ? T.accent : e.kind === 'repo' ? T.n500 : 'rgba(200,196,240,0.85)';
};
P.edgeWidthScale = function (e) { const st = e.style || {}, base = st.width || this.S.edgeWidth; let w = base / (0.5 + Math.max(e.stress(), 0.01)) * (e.hover ? 2 : 1.6); return Math.min(w, 0.05); };
P.drawEdge = function (f, e, now, litOn, adj) {
  const [A, B] = e.pts; if (A.hidden || B.hidden) { e._poly = null; return; }
  const ax = this.sx(A.pos.x, A.pos.y), ay = this.sy(A.pos.x, A.pos.y), bx = this.sx(B.pos.x, B.pos.y), by = this.sy(B.pos.x, B.pos.y), W = this.W, H = this.H;
  if ((ax < -50 && bx < -50) || (ax > W + 50 && bx > W + 50) || (ay < -50 && by < -50) || (ay > H + 50 && by > H + 50)) { e._poly = null; return; }
  const st = e.style || {}, ws = this.edgeWidthScale(e), pxz = this.pxz, d = e.directionality, directed = d.start && d.end;
  const on = litOn && this.lit.has(A.uuid) && this.lit.has(B.uuid), hot = this.selected.has(A.uuid) || this.selected.has(B.uuid) || (adj && adj.has(A.uuid) && adj.has(B.uuid));
  let alpha = st.alpha ?? 0.55; if (on || hot || e.hover) alpha = 1; else if (litOn) alpha = 0.12; else if (adj) alpha = 0.15; if (this.matches && !(this.matches.has(A.uuid) || this.matches.has(B.uuid))) alpha *= 0.35;
  const col = on ? this.theme.accent : this.edgeColor(e);
  f.globalAlpha = alpha; f.fillStyle = col; f.strokeStyle = col;
  const sp = A.pos, ep = B.pos, hw0 = A.scale * ws * pxz, hw1 = B.scale * ws * pxz;
  let poly;
  if (directed) {
    const c = e.center(), dA = sp.minus(c).rot90(), dB = ep.minus(c).rot90();
    const la = dA.mag() ? dA.normed(A.scale * ws) : new vec2(0, 0), lb = dB.mag() ? dB.normed(B.scale * ws) : new vec2(0, 0);
    const q = [sp.minus(la), sp.plus(la), ep.minus(lb), ep.plus(lb)];
    if (hw0 < 0.7 && hw1 < 0.7) { f.lineWidth = 0.8; f.beginPath(); f.moveTo(ax, ay); f.lineTo(bx, by); f.stroke(); }
    else { f.beginPath(); q.forEach((z, i) => { const x = this.sx(z.x, z.y), y = this.sy(z.x, z.y); i ? f.lineTo(x, y) : f.moveTo(x, y); }); f.closePath(); f.fill(); }
    this.drawArrow(f, d.start, d.end, ws, alpha, col);
    poly = [ax, ay, (ax + bx) / 2, (ay + by) / 2, bx, by];
  } else {
    const hz = (sp.x - ep.x) / 1.1, vt = sp.y - ep.y, dist = Math.hypot(hz, vt), perp = new vec2(vt, -hz), pm = perp.mag() || 1e-300;
    const sP = perp.scale(A.scale * ws / pm), eP = perp.scale(B.scale * ws / pm), sL = sp.minus(sP), sR = sp.plus(sP), eL = ep.minus(eP), eR = ep.plus(eP);
    const curve = Math.min(1, Math.abs(vt)) / 2, vL = new vec2(0, (vt > 0 ? 1 : -1) * curve * dist), vR = new vec2(0, (vt > 0 ? -1 : 1) * curve * dist), vB = new vec2(hz, 0);
    const cL1 = sL.minus(vB).minus(vL), cL2 = eL.plus(vB).plus(vL), cR1 = sR.minus(vB).plus(vR), cR2 = eR.plus(vB).minus(vR);
    const X = z => this.sx(z.x, z.y), Y = z => this.sy(z.x, z.y);
    const c1 = cL1.plus(cR1).scale(0.5), c2 = cL2.plus(cR2).scale(0.5), c1x = X(c1), c1y = Y(c1), c2x = X(c2), c2y = Y(c2);
    if (st.dash) { f.setLineDash(st.dash); f.lineWidth = Math.max(1, hw0 + hw1); f.beginPath(); f.moveTo(ax, ay); f.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); f.stroke(); f.setLineDash([]); }
    else if (hw0 < 0.7 && hw1 < 0.7) { f.lineWidth = Math.max(0.6, hw0 + hw1); f.beginPath(); f.moveTo(ax, ay); f.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); f.stroke(); }
    else { f.beginPath(); f.moveTo(X(sL), Y(sL)); f.bezierCurveTo(X(cL1), Y(cL1), X(cL2), Y(cL2), X(eL), Y(eL)); f.lineTo(X(eR), Y(eR)); f.bezierCurveTo(X(cR2), Y(cR2), X(cR1), Y(cR1), X(sR), Y(sR)); f.closePath(); f.fill(); }
    poly = []; for (let i = 0; i <= 10; i++) { const t = i / 10, u = 1 - t; poly.push(u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx, u * u * u * ay + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * by); }
  }
  e._poly = poly; e._hw = Math.max(hw0, hw1);
  if (st.signal || on) {
    const sp2 = on ? 1.4 : st.signal, ph = ((now / 1000) * sp2 + (e._ph ?? (e._ph = Math.random()))) % 1, k = Math.min(poly.length / 2 - 1, Math.floor(ph * (poly.length / 2 - 1))), tt = ph * (poly.length / 2 - 1) - k;
    const px = poly[k * 2] + (poly[k * 2 + 2] - poly[k * 2]) * tt || poly[0], py = poly[k * 2 + 1] + (poly[k * 2 + 3] - poly[k * 2 + 1]) * tt || poly[1];
    f.globalAlpha = on ? 1 : Math.min(1, alpha + 0.25); f.beginPath(); f.arc(px, py, on ? 3.2 : 2.2, 0, 6.283); f.fillStyle = on ? this.theme.accent : col; f.fill();
  }
  f.globalAlpha = 1;
};
P.drawArrow = function (f, a, b, ws, alpha, col) {
  const sp = a.pos, ep = b.pos, ss = a.scale, es = b.scale, pf = 0.5, as = 1 + (ss - 1) * pf, ae = 1 + (es - 1) * pf, tot = as + ae;
  const mid = sp.scale(ae / tot).plus(ep.scale(as / tot)), len = ((ss + es) / 2 * ws * 5) * 1.5, wid = ((ss + es) / 2 * ws * 3) * 1.5;
  const dir = ep.minus(sp); if (!(dir.mag() > 0)) return;
  const dn = dir.normed(len), perp = new vec2(-dn.y, dn.x).normed(wid);
  let b1 = mid.minus(perp), b2 = mid.plus(perp), tip = mid.plus(dn);
  const bc = b1.plus(b2).scale(0.5), ctr = bc.scale(0.85).plus(tip.scale(0.15)), rp = p => new vec2(2 * ctr.x - p.x, 2 * ctr.y - p.y);
  b1 = rp(b1); b2 = rp(b2); tip = rp(tip);
  const m = b1.plus(b2).plus(tip).scale(1 / 3), sc = p => m.plus(p.minus(m).scale(1.4)), path = (pts, fill) => { f.beginPath(); pts.forEach((z, i) => { const x = this.sx(z.x, z.y), y = this.sy(z.x, z.y); i ? f.lineTo(x, y) : f.moveTo(x, y); }); f.closePath(); f.fillStyle = fill; f.fill(); };
  f.globalAlpha = alpha * 0.9; path([sc(b1), sc(tip), sc(b2)], this.theme.bg); f.globalAlpha = alpha; path([b1, tip, b2], col);
};
P.drawPulses = function (f, now) {
  this.pulses = this.pulses.filter(p => now < p.t0 + p.dur && this.edges.has(p.e.edgeKey));
  for (const p of this.pulses) {
    const poly = p.e._poly; if (!poly || now < p.t0) continue;
    let t = (now - p.t0) / p.dur; if (p.e.pts[0] !== p.from) t = 1 - t;
    const n = poly.length / 2 - 1, k = Math.min(n - 1, Math.floor(t * n)), tt = t * n - k, x = poly[k * 2] + (poly[k * 2 + 2] - poly[k * 2]) * tt, y = poly[k * 2 + 1] + (poly[k * 2 + 3] - poly[k * 2 + 1]) * tt;
    const gr = f.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    f.globalAlpha = 0.9; f.fillStyle = gr; f.beginPath(); f.arc(x, y, 14, 0, 6.283); f.fill(); f.globalAlpha = 1; f.beginPath(); f.arc(x, y, 3, 0, 6.283); f.fillStyle = this.theme.text; f.fill();
  }
};
P.screenshot = function (name) {
  const c = document.createElement('canvas'); c.width = this.cvBg.width; c.height = this.cvBg.height; const g = c.getContext('2d');
  g.fillStyle = this.theme.bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(this.cvBg, 0, 0); g.drawImage(this.cvFg, 0, 0);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = (name || 'NeuriteSVG' + new Date().toISOString()) + '.png'; document.body.appendChild(a); a.click(); a.remove();
};
P.edgeAt = function (x, y) {
  let best = null, bd = 7;
  for (const e of this.edges.values()) {
    const p = e._poly; if (!p) continue;
    for (let i = 0; i + 3 < p.length; i += 2) { const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), d = Math.hypot(x - ax - t * dx, y - ay - t * dy) - (e._hw || 0); if (d < bd) { bd = d; best = e; } }
  }
  return best;
};
P.dotAt = function (x, y) { let best = null, bd = 9; (this._dots || []).forEach(d => { const k = Math.hypot(d.x - x, d.y - y) - d.r; if (k < bd) { bd = k; best = d.n; } }); return best; };

/* ───────────── node windows (window.js · nodetypes/*) ───────────── */
P.buildNodeEl = function (n) {
  const e = mk('div', 'nrt-node nrt-t-' + n.type); e.dataset.uuid = n.uuid; n.el = e; n._vis = -1;
  const ic = n.color || (this.o.nodeColor && this.o.nodeColor(n)) || (n.isLLM ? 'var(--color-accent)' : n.isLink ? 'oklch(0.8 0.09 205)' : n.type === 'file' || n.type === 'code' ? 'var(--color-accent-300)' : 'var(--color-neutral-400)');
  e.style.setProperty('--nrt-ic', ic); if (n.isLLM || n.isLink || n.data.tint) e.style.setProperty('--nrt-tint', n.data.tint || ic);
  if (n.chrome === 'chip') { e.innerHTML = '<div class="nrt-chipc"></div>'; n.body = e.firstChild; this.renderChip(n); }
  else {
    e.innerHTML = '<div class="nrt-win"><div class="nrt-head"><i class="ph ' + n.icon + '"></i><input class="nrt-title" spellcheck="false" aria-label="Title"><button class="nrt-btn" data-act="anchor" title="Anchor · double click"><i class="ph ph-push-pin"></i></button><button class="nrt-btn" data-act="collapse" title="Collapse"><i class="ph ph-minus"></i></button><button class="nrt-btn" data-act="delete" title="Delete"><i class="ph ph-x"></i></button></div><div class="nrt-body"></div><div class="nrt-resize" title="Resize"></div></div><div class="nrt-circle"><i class="ph ' + n.icon + '"></i></div><div class="nrt-ctitle"></div>';
    n.titleEl = e.querySelector('.nrt-title'); n.body = e.querySelector('.nrt-body'); n.ctitle = e.querySelector('.nrt-ctitle');
    n.titleEl.value = n.title; n.ctitle.textContent = n.title;
    n.titleEl.addEventListener('input', () => { if (this.zk.wraps.get(n.title) === n) { clearTimeout(n._tT); n._tT = setTimeout(() => { const t = this.zk.onNodeTitle(n, n.titleEl.value); if (t !== n.titleEl.value && document.activeElement !== n.titleEl) n.titleEl.value = t; n.ctitle.textContent = t; }, 260); } else { n.title = n.titleEl.value; n.ctitle.textContent = n.title; this.changed(); } });
    n.titleEl.addEventListener('blur', () => { n.titleEl.value = n.title; });
    this.renderBody(n);
  }
  this.layer.appendChild(e); this.viewClasses(n);
};
P.renderChip = function (n) { const d = n.data; n.body.innerHTML = '<span class="k"><i class="ph ' + n.icon + '" style="font-size:13px"></i>' + esc(n.kind || n.type) + '</span><span class="t">' + esc(n.title) + '</span><span class="s">' + esc(d.sub || '') + '</span>'; };
P.renderBody = function (n) {
  const b = n.body, d = n.data, T = n.type;
  if (this.o.renderNode && this.o.renderNode(n, b, this) === true) return;
  if (T === 'text') { b.innerHTML = '<textarea class="nrt-ta" spellcheck="false" placeholder="Write. ' + esc(this.S.refTag) + 'Title' + esc(C.BRACKETS[this.S.refTag] || '') + ' links another note."></textarea>'; const ta = b.firstChild; ta.value = n.text; ta.addEventListener('input', () => { n.text = ta.value; clearTimeout(n._bT); n._bT = setTimeout(() => { this.zk.onNodeBody(n, ta.value); this.changed(); }, 220); }); n.ta = ta; return; }
  if (T === 'ai') {
    const acts = (this.o.aiActions ? this.o.aiActions(n) : []) || [];
    b.innerHTML = '<div class="nrt-msgs"></div><div class="nrt-meta nrt-ctx"></div><div class="nrt-row"><button class="nrt-chip" data-act="ai-zk" title="Reply as linked notes (FractalGPT)"><i class="ph ph-tree-structure"></i>Notes</button><button class="nrt-chip" data-act="ai-auto" title="Auto mode: the AI writes its next prompt"><i class="ph ph-infinity"></i>Auto</button><button class="nrt-chip" data-act="ai-memory" title="Long-term memory: vector search over every note"><i class="ph ph-brain"></i>Memory</button><button class="nrt-chip" data-act="ai-loop" title="Message looping with connected AI nodes"><i class="ph ph-chats-circle"></i>Loop</button><button class="nrt-chip" data-act="ai-wiki" title="Top 3 Wikipedia results as notes"><i class="ph ph-books"></i>Wiki</button>' + acts.map((a, i) => '<button class="nrt-chip" data-act="ai-custom" data-i="' + i + '"><i class="ph ' + (a.icon || 'ph-lightning') + '"></i>' + esc(a.label) + '</button>').join('') + '</div><div class="nrt-row" style="flex-wrap:nowrap"><textarea class="nrt-in nrt-prompt" rows="1" style="flex:1;resize:none;min-height:32px;max-height:90px" placeholder="Ask with the linked context"></textarea><button class="nrt-send" data-act="ai-send" title="Send · Enter"><i class="ph ph-arrow-up"></i></button></div>';
    n.msgsEl = b.querySelector('.nrt-msgs'); n.ctxEl = b.querySelector('.nrt-ctx'); n.ta = b.querySelector('.nrt-prompt'); n._acts = acts;
    n.ta.value = d.draft || ''; n.ta.addEventListener('input', () => { d.draft = n.ta.value; });
    n.ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.aiSend(n); } });
    this.viewMsgs(n); return;
  }
  if (T === 'link') {
    b.innerHTML = '<input class="nrt-in nrt-mono nrt-url" placeholder="https://" spellcheck="false"><div class="nrt-row"><span class="nrt-meta" style="flex:1"></span><button class="nrt-chip" data-act="link-display"><i class="ph ph-browser"></i>Display</button><button class="nrt-chip" data-act="link-open"><i class="ph ph-arrow-square-out"></i>Open</button></div><div class="nrt-fwrap" style="flex:1;min-height:0;display:none"></div>';
    const u = b.querySelector('.nrt-url'), meta = b.querySelector('.nrt-meta'), host = () => { try { meta.textContent = d.url ? new URL(d.url).hostname : 'Paste a URL'; } catch (e) { meta.textContent = 'Not a valid URL yet'; } };
    u.value = d.url || ''; host(); u.addEventListener('input', () => { d.url = u.value.trim(); host(); this.changed(); }); return;
  }
  if (T === 'image') { b.innerHTML = '<img class="nrt-img" alt="">'; b.firstChild.src = d.src || ''; b.firstChild.alt = n.title; return; }
  if (T === 'code') {
    b.innerHTML = '<div class="nrt-seg">' + ['html', 'css', 'js', 'python'].map(l => '<button data-act="code-lang" data-l="' + l + '" class="' + (d.lang === l ? 'on' : '') + '">' + l + '</button>').join('') + '</div><textarea class="nrt-ta nrt-mono" spellcheck="false" placeholder="Code. Connected code nodes are bundled when you run."></textarea><div class="nrt-row"><button class="nrt-chip" data-act="code-run"><i class="ph ph-play"></i>Run</button><button class="nrt-chip" data-act="code-hide"><i class="ph ph-eye-slash"></i>Hide output</button><span class="nrt-meta" style="flex:1"></span></div><div class="nrt-out" style="flex:1;min-height:0;display:none"></div>';
    n.ta = b.querySelector('textarea'); n.ta.value = d.code || ''; n.ta.addEventListener('input', () => { d.code = n.ta.value; this.changed(); }); return;
  }
  if (T === 'file') {
    const sym = (d.symbols || []).slice(0, 8).map(s => s.n).join(' · ');
    b.innerHTML = '<div class="nrt-meta nrt-mono">' + esc(d.path || n.title) + '</div><div class="nrt-row"><span class="tag tag-accent">' + esc(d.lang || 'text') + '</span><span class="nrt-meta">' + (d.loc || 0).toLocaleString() + ' lines · ' + ((d.size || 0) / 1024).toFixed(1) + ' KB · ' + (d.nChunks || 0) + ' chunks</span></div>' + (sym ? '<div class="nrt-meta" title="Symbols">' + esc(sym) + '</div>' : '') + '<pre class="nrt-pre"></pre>';
    b.querySelector('pre').textContent = String(d.preview || n.text || '').split('\n').slice(0, 120).join('\n'); return;
  }
  if (T === 'repo') {
    b.innerHTML = '<div class="nrt-help" style="color:var(--color-neutral-300)">' + esc(d.desc || 'No description.') + '</div><div class="nrt-row">' + (d.lang ? '<span class="tag tag-neutral">' + esc(d.lang) + '</span>' : '') + (d.stars != null ? '<span class="nrt-meta">★ ' + Number(d.stars).toLocaleString() + '</span>' : '') + '<span class="nrt-meta nrt-rs">' + esc(d.status || '') + '</span></div><div class="nrt-row" style="margin-top:auto">' + (d.url ? '<button class="nrt-chip" data-act="link-open"><i class="ph ph-github-logo"></i>GitHub</button>' : '') + ((this.o.repoActions ? this.o.repoActions(n) : []) || []).map((a, i) => '<button class="nrt-chip" data-act="repo-custom" data-i="' + i + '"><i class="ph ' + (a.icon || 'ph-lightning') + '"></i>' + esc(a.label) + '</button>').join('') + '</div>';
    return;
  }
  b.innerHTML = '<div class="nrt-help">' + esc(d.sub || n.text || '') + '</div>';
};
P.viewTitle = function (n) { if (n.titleEl && document.activeElement !== n.titleEl) n.titleEl.value = n.title; if (n.ctitle) n.ctitle.textContent = n.title; if (n.chrome === 'chip' && n.body) this.renderChip(n); };
P.viewText = function (n) { if (n.ta && document.activeElement !== n.ta) n.ta.value = n.type === 'ai' ? (n.data.draft || '') : n.type === 'code' ? (n.data.code || '') : n.text; };
P.viewMsgs = function (n) {
  if (!n.msgsEl) return; const d = n.data, msgs = d.msgs || [];
  n.msgsEl.innerHTML = msgs.length ? msgs.map(m => { const you = m.role !== 'ai'; return '<div class="nrt-msg' + (you ? ' you' : '') + '"><span class="nrt-who">' + esc(you ? (m.who || 'You') : (m.who || n.title)) + '</span><div class="nrt-bub">' + esc(m.text) + '</div>' + (m.notes && m.notes.length ? '<div class="nrt-row">' + m.notes.map(id => { const x = this.nodes.get(id); return x ? '<button class="nrt-chip" data-act="goto" data-id="' + esc(id) + '"><i class="ph ph-note-pencil"></i>' + esc(x.title) + '</button>' : ''; }).join('') + '</div>' : '') + '</div>'; }).join('')
    : '<div class="nrt-empty"><i class="ph ph-sparkle"></i><span>Shift + click a node to link it, then ask. I read whatever I am linked to.</span></div>';
  n.msgsEl.scrollTop = n.msgsEl.scrollHeight;
  const k = n.edges.length; if (n.ctxEl) n.ctxEl.textContent = k ? 'Reads ' + k + ' linked node' + (k > 1 ? 's' : '') + ' as context' + (d.memory ? ' + memory' : '') : 'Nothing linked yet. Shift + click to link context.';
  const set = (a, on) => { const x = n.body.querySelector('[data-act=' + a + ']'); if (x) x.classList.toggle('on', !!on); };
  set('ai-zk', d.zkReplies); set('ai-auto', d.auto); set('ai-memory', d.memory); set('ai-loop', d.loop);
  n.el && n.el.classList.toggle('busy', !!d.busy);
};
P.viewClasses = function (n) {
  const e = n.el; if (!e) return;
  e.classList.toggle('sel', this.selected.has(n.uuid)); e.classList.toggle('lit', this.lit.has(n.uuid)); e.classList.toggle('anch', n.anchorForce === 1); e.classList.toggle('col', !!n.collapsed); e.classList.toggle('prev', this.prev === n);
  e.classList.toggle('match', !!(this.matches && this.matches.has(n.uuid))); e.classList.toggle('nomatch', !!(this.matches && !this.matches.has(n.uuid)));
  if (n.hidden) { e.style.display = 'none'; n._vis = 0; }
};
P.toggleCollapse = function (n, cascade) { n.collapsed = !n.collapsed; this.viewClasses(n); if (cascade) n.getAllConnectedNodes().forEach(x => { x.collapsed = n.collapsed; this.viewClasses(x); }); this.changed(); };
P.toggleAnchor = function (n) { if (n.anchorForce) { n.anchorForce = 0; } else { n.anchorForce = 1; n.anchor = n.pos; } this.viewClasses(n); this.changed(); };
P.runCode = async function (n) {
  const out = n.body.querySelector('.nrt-out'), meta = n.body.querySelector('.nrt-meta'); out.style.display = ''; const d = n.data;
  if (d.lang === 'python') {
    out.innerHTML = '<pre class="nrt-pre">Loading Python (Pyodide)…</pre>'; const pre = out.firstChild;
    try { if (!window.loadPyodide) await new Promise((r, j) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'; s.onload = r; s.onerror = j; document.head.appendChild(s); }); NS._py = NS._py || await window.loadPyodide(); let buf = ''; NS._py.setStdout({ batched: x => { buf += x + '\n'; } }); NS._py.setStderr({ batched: x => { buf += x + '\n'; } }); const r = await NS._py.runPythonAsync(d.code || ''); pre.textContent = buf + (r !== undefined ? String(r) : ''); meta.textContent = 'Ran in Pyodide'; }
    catch (e) { pre.textContent = String(e); meta.textContent = 'Python error'; }
    return;
  }
  const parts = { html: [], css: [], js: [] }, add = x => { if (x.type === 'code') parts[x.data.lang === 'python' ? 'js' : x.data.lang].push(x.data.code || ''); };
  add(n); n.forEachConnectedNode(add);
  n.forEachConnectedNode(x => { if (x.isTextNode) [...String(x.text).matchAll(/```(html|css|js|javascript)\s*\n([\s\S]*?)```/g)].forEach(m => parts[m[1] === 'javascript' ? 'js' : m[1]].push(m[2])); });
  const doc = '<!doctype html><html><head><style>body{margin:12px;font:14px system-ui;color:#222}' + parts.css.join('\n') + '</style></head><body>' + parts.html.join('\n') + '<script>' + parts.js.join('\n;\n').replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
  out.innerHTML = '<iframe class="nrt-frame" sandbox="allow-scripts"></iframe>'; out.firstChild.srcdoc = doc;
  meta.textContent = 'Bundled ' + (parts.html.length + parts.css.length + parts.js.length) + ' block' + (parts.html.length + parts.css.length + parts.js.length === 1 ? '' : 's');
};

/* ───────────── input (interface.js · nodeclass.js · edgeclass.js · nodemode.js · handledrop.js) ───────────── */
P.bindInput = function () {
  const h = this.host, on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); (this._unbind = this._unbind || []).push(() => t.removeEventListener(ev, fn, o)); };
  on(h, 'mouseenter', () => { this.hot = true; }); on(h, 'mouseleave', () => { this.hot = false; this.hoverEdge && (this.hoverEdge.hover = false); this.hoverEdge = null; this.hoverDot = null; });
  on(h, 'mousedown', e => this.onDown(e)); on(window, 'mousemove', e => this.onMove(e)); on(window, 'mouseup', e => this.onUp(e));
  on(h, 'wheel', e => this.onWheel(e), { passive: false }); on(h, 'dblclick', e => this.onDbl(e)); on(h, 'contextmenu', e => this.onContext(e));
  on(h, 'click', e => this.onClickAct(e));
  on(window, 'keydown', e => this.onKey(e, true)); on(window, 'keyup', e => this.onKey(e, false));
  on(window, 'blur', () => { this.keyState = {}; this.nodeMode = 0; this.nodeModeChanged(); });
  on(window, 'mousedown', e => { if (this.menu && !this.menu.contains(e.target)) this.menuClose(); }, true);
  on(h, 'dragover', e => { e.preventDefault(); }); on(h, 'drop', e => this.onDrop(e));
  on(window, 'paste', e => { if (!this.hot || this.typing()) return; this.onPaste(e); });
  const tt = new Map();
  on(h, 'touchstart', e => { for (const t of e.changedTouches) tt.set(t.identifier, { prev: t, now: t }); }, { passive: true });
  const end = e => { for (const t of e.changedTouches) tt.delete(t.identifier); };
  on(h, 'touchend', end); on(h, 'touchcancel', end);
  on(h, 'touchmove', e => {
    if (e.target.closest('.nrt-node,.nrt-dock,.nrt-hud')) return;
    for (const t of e.changedTouches) tt.set(t.identifier, { prev: (tt.get(t.identifier) || {}).now || t, now: t });
    const r = h.getBoundingClientRect(), L = t => ({ x: t.clientX - r.left, y: t.clientY - r.top });
    if (tt.size === 1) { const t = [...tt.values()][0], p = L(t.prev), q = L(t.now); this.autopilot.reset(); this.pan = this.pan.plus(this.toDZ(p.x - q.x, p.y - q.y)); this.camMoved(); e.preventDefault(); }
    else if (tt.size === 2) {
      const [a, b] = [...tt.values()], p1 = L(a.prev), p2 = L(b.prev), n1 = L(a.now), n2 = L(b.now);
      const zPrev = this.xyToZ((p1.x + p2.x) / 2, (p1.y + p2.y) / 2), zNow = this.xyToZ((n1.x + n2.x) / 2, (n1.y + n2.y) / 2), zc = zNow.minus(this.pan);
      const zf = Math.hypot(p2.x - p1.x, p2.y - p1.y) / (Math.hypot(n2.x - n1.x, n2.y - n1.y) || 1), ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(n2.y - n1.y, n2.x - n1.x), r2 = new vec2(Math.cos(ang), Math.sin(ang)), dz = new vec2(zf, 0);
      this.zoom = this.zoom.cmult(r2).scale(zf); this.pan = this.pan.plus(zc.cmult(new vec2(1, 0).minus(r2.cmult(dz)))).minus(zNow.minus(zPrev)); this.camMoved(); this.regenAmount += 40; e.preventDefault();
    }
  }, { passive: false });
};
P.nodeModeChanged = function () { this.host.classList.toggle('wire', !!(this.nodeMode || this.prev || this.connectMode)); this.nodes.forEach(n => { if (n.el && n.el.classList.contains('prev') !== (this.prev === n)) this.viewClasses(n); }); this.emit('nodemode', this.nodeMode); };
P.onDown = function (e) {
  const t = e.target; if (t.closest('.nrt-hud,.nrt-dock,.nrt-menu')) return;
  const p = this.local(e); this.mouse = p; this.mouseZ = this.xyToZ(p.x, p.y);
  const nodeEl = t.closest('.nrt-node'), n = nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : this.dotAt(p.x, p.y);
  if (n) return this.onNodeDown(e, n, !nodeEl);
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey) { this.boxSel = { x: p.x, y: p.y }; Object.assign(this.box.style, { display: 'block', left: p.x + 'px', top: p.y + 'px', width: '0px', height: '0px' }); e.preventDefault(); return; }
  if (this.prev && !this.connectMode) { this.prev = null; this.nodeModeChanged(); }
  if (document.activeElement && this.host.contains(document.activeElement)) document.activeElement.blur();
  this.host.focus({ preventScroll: true });
  this.downEdge = this.hoverEdge; this.pan0 = { x: p.x, y: p.y, moved: false }; this.autopilot.reset(); e.preventDefault();
};
P.onNodeDown = function (e, n, isDot) {
  const t = e.target;
  if (e.button !== 0) return;
  if (!isDot && t.closest('.nrt-resize')) { this.resizing = { n, x: e.clientX, y: e.clientY, w: n.w, h: n.h, s: this.nodeScale(n) }; e.preventDefault(); e.stopPropagation(); return; }
  if (!isDot && !e.altKey && t.closest('textarea,input,select,button,a,iframe,.nrt-msgs,.nrt-pre,.nrt-seg,.nrt-bub')) return;
  e.preventDefault(); e.stopPropagation();
  if (document.activeElement && this.host.contains(document.activeElement)) document.activeElement.blur();
  if (e.ctrlKey || e.metaKey) { this.toggleSelect(n); return; }
  if (this.prev && this.prev !== n) { const a = this.prev; this.prev = null; const ed = this.connectNodes(n, a); this.nodeModeChanged(); this.emit('connect', { a, b: n, edge: ed }); this.toast('Linked ' + (a.title || 'node') + ' and ' + (n.title || 'node') + '.'); if (this.connectMode) { this.prev = null; } return; }
  if (this.nodeMode || this.connectMode || e.shiftKey) { this.prev = n; this.nodeModeChanged(); }
  n.mouseAnchor = this.mouseZ.minus(n.pos); n.followingMouse = 1; this.dragged = n; this.drag0 = { x: e.clientX, y: e.clientY, moved: false };
};
P.onMove = function (e) {
  const p = this.local(e); this.mouse = p;
  if (this.resizing) { const r = this.resizing, dx = (e.clientX - r.x) / r.s, dy = (e.clientY - r.y) / r.s; r.n.w = Math.max(160, r.w + dx); r.n.h = Math.max(80, r.h + dy); return; }
  if (this.boxSel) { const b = this.boxSel; Object.assign(this.box.style, { left: Math.min(b.x, p.x) + 'px', top: Math.min(b.y, p.y) + 'px', width: Math.abs(p.x - b.x) + 'px', height: Math.abs(p.y - b.y) + 'px' }); return; }
  if (this.pan0) { const dx = p.x - this.pan0.x, dy = p.y - this.pan0.y; if (Math.abs(dx) + Math.abs(dy) > 1) this.pan0.moved = true; this.pan = this.pan.minus(this.toDZ(dx, dy)); this.regenAmount += Math.hypot(dx, dy) * 0.25; this.pan0.x = p.x; this.pan0.y = p.y; this.camMoved(); this.host.classList.add('grab'); return; }
  if (this.dragged) { if (!this.drag0.moved && Math.abs(e.clientX - this.drag0.x) + Math.abs(e.clientY - this.drag0.y) > 3) { this.drag0.moved = true; this.host.classList.add('grab'); } return; }
  if (!this.hot) return;
  const overNode = e.target.closest && e.target.closest('.nrt-node,.nrt-hud,.nrt-dock');
  const ed = overNode ? null : this.edgeAt(p.x, p.y), dot = overNode ? null : this.dotAt(p.x, p.y);
  if (ed !== this.hoverEdge) { if (this.hoverEdge) this.hoverEdge.hover = false; this.hoverEdge = ed; if (ed) ed.hover = true; }
  this.hoverDot = dot; this.host.classList.toggle('hoverable', !!(ed || dot));
  const nodeEl = e.target.closest && e.target.closest('.nrt-node'), hov = dot || (nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : null);
  if (this.o.focusOnHover && hov !== this.focusNode) { this.focusNode = hov || null; }
  if (hov !== this._hov) { this._hov = hov; this.emit('hover', hov || null); }
};
P.onUp = function (e) {
  if (this.resizing) { this.resizing = null; this.changed(); return; }
  if (this.boxSel) {
    const r = this.box.getBoundingClientRect(); this.box.style.display = 'none'; this.boxSel = null; let any = false;
    const hr = this.host.getBoundingClientRect();
    this.nodes.forEach(n => { if (n.hidden) return; const s = this.nodeScale(n), x = this.sx(n.pos.x, n.pos.y) + hr.left, y = this.sy(n.pos.x, n.pos.y) + hr.top, w = n.dispW() * s / 2, hh = n.dispH() * s / 2; if (x - w < r.right && x + w > r.left && y - hh < r.bottom && y + hh > r.top) { this.toggleSelect(n); any = true; } });
    if (!any) this.select(null); return;
  }
  if (this.pan0) { const moved = this.pan0.moved; this.pan0 = null; this.host.classList.remove('grab'); if (!moved) { if (this.downEdge && this.edges.has(this.downEdge.edgeKey)) { if (!this.nodeMode) { this.downEdge.toggleDirection(); this.emit('edge:click', this.downEdge); } } else { this.select(null); this.emit('background:click', { z: this.mouseZ }); } } this.downEdge = null; return; }
  if (this.dragged) {
    const n = this.dragged, moved = this.drag0.moved; n.followingMouse = 0; this.dragged = null; this.host.classList.remove('grab');
    if (!moved) { if (n.collapsed && !this.nodeMode) this.toggleCollapse(n); if (!this.prev || this.prev !== n || !this.nodeMode) this.select(n); this.emit('node:click', n); }
    else this.changed();
  }
};
P.onWheel = function (e) {
  const t = e.target; if (t.closest('.nrt-dock,.nrt-hud,.nrt-menu')) return;
  const dy = e.deltaY || e.deltaX, unit = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 400 : 1, d = dy * unit;
  const nodeEl = t.closest('.nrt-node'), n = nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : null;
  if (n && (this.nodeMode || e.shiftKey)) {
    e.preventDefault(); const amount = Math.exp(-d * this.S.zoomSpeed);
    const list = this.selected.has(n.uuid) ? this.selectedNodes() : [n];
    list.forEach(x => { x.scale *= amount; if (x.anchorForce !== 1) x.pos = x.pos.lerpto(this.mouseZ, 1 - amount); G.updateNodeEdgesLength(x); });
    return;
  }
  if (this.hoverEdge && this.nodeMode) { e.preventDefault(); this.hoverEdge.scaleLength(Math.exp(-d * this.S.zoomSpeed)); return; }
  if (n) { const sc = t.closest('textarea,.nrt-msgs,.nrt-pre,iframe'); if (sc && (sc.tagName === 'IFRAME' || (sc.scrollHeight > sc.clientHeight + 1 && ((dy < 0 && sc.scrollTop > 0) || (dy > 0 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1))))) return; }
  e.preventDefault(); this.autopilot.reset(); this.menuClose && this.menuClose();
  const p = this.local(e), dest = this.xyToZ(p.x, p.y);
  if (e.altKey) { this.rotateAt(d * this.S.rotateModifierSpeed, dest); return; }
  this.regenAmount += Math.abs(d);
  this.performZoom(Math.exp((this.S.neuriteScroll ? 1 : -1) * d * this.S.zoomSpeed * this.S.zoomSpeedMultiplier), dest);
};
P.onDbl = function (e) {
  const t = e.target; if (t.closest('.nrt-hud,.nrt-dock,.nrt-menu')) return;
  const p = this.local(e), nodeEl = t.closest('.nrt-node'), n = nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : this.dotAt(p.x, p.y);
  if (n) {
    if (t.closest('textarea,input,button,select,.nrt-msgs,.nrt-pre')) return;
    e.preventDefault();
    if (n.collapsed) { if (this.nodeMode) this.toggleCollapse(n); else this.toggleAnchor(n); return; }
    this.toggleAnchor(n); this.toast(n.anchorForce ? 'Anchored in place.' : 'Released to the fractal.'); return;
  }
  if (this.hoverEdge) { if (this.nodeMode || e.shiftKey) { const ed = this.hoverEdge; this.removeEdge(ed); this.toast('Edge removed.'); } return; }
  const z = this.xyToZ(p.x, p.y), type = e.shiftKey ? 'text' : e.altKey ? 'ai' : (e.ctrlKey || e.metaKey) ? 'link' : null;
  if (!type) { this.emit('background:dblclick', { z, x: p.x, y: p.y }); return; }
  e.preventDefault(); this.createAt(type, z, { focus: true });
};
P.createAt = function (type, z, o = {}) {
  const n = this.createNode(type, { title: type === 'ai' ? 'AI node' : type === 'link' ? 'Link' : type === 'code' ? 'Code' : 'New note', pos: z || this.viewCenter(), anchored: o.anchored });
  this.select(n); if (o.focus && n.titleEl) setTimeout(() => { n.titleEl.focus(); n.titleEl.select(); }, 30);
  return n;
};
P.onKey = function (e, down) {
  if (!this.hot && !this.host.contains(document.activeElement)) { if (!down) this.keyState[e.key] = false; return; }
  const S = this.S, typing = this.typing();
  if (e.key === S.nodeModeKey) { if (S.nodeModeTrigger === 'toggle') { if (down && !e.repeat) this.nodeMode = 1 - this.nodeMode; } else this.nodeMode = down ? 1 : 0; this.nodeModeChanged(); }
  this.keyState[e.key] = down; if (!down) return;
  if (e.key === 'Escape') { this.nodes.forEach(n => { n.followingMouse = 0; }); this.prev = null; this.connectMode = false; this.menuClose(); this.nodeModeChanged(); this.emit('escape'); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey) { const k = e.code; if (k === 'KeyF') { e.preventDefault(); this.preserveHairs(); return; } if (k === 'KeyC') { e.preventDefault(); this.clearPreserved(); this.toast('Frozen lines cleared.'); return; } if (k === 'KeyS') { e.preventDefault(); this.screenshot(); return; } }
  if (typing) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected.size) { e.preventDefault(); this.selectedNodes().forEach(n => this.removeNode(n)); return; }
  if (e.key.startsWith('Arrow') && this.selected.size) e.preventDefault();
};
P.onDrop = async function (e) {
  e.preventDefault(); const p = this.local(e), z = this.xyToZ(p.x, p.y), files = [...(e.dataTransfer.files || [])], txt = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (files.length) { files.forEach((f, i) => this.dropFile(f, z.plus(this.toDZ(i * 30, i * 30)))); return; }
  if (txt) this.dropText(txt, z);
};
P.onPaste = function (e) {
  const items = [...(e.clipboardData && e.clipboardData.items || [])], z = this.mouseZ;
  const img = items.find(i => i.type.startsWith('image/')); if (img) { this.dropFile(img.getAsFile(), z); e.preventDefault(); return; }
  const t = e.clipboardData.getData('text/plain'); if (t) { this.dropText(t, z); e.preventDefault(); }
};
P.dropText = function (t, z) {
  t = String(t).trim(); if (!t) return;
  if (/^https?:\/\/\S+$/.test(t)) { const n = this.createNode('link', { title: (() => { try { return new URL(t).hostname; } catch (e) { return 'Link'; } })(), pos: z, data: { url: t } }); this.select(n); return n; }
  const first = t.split('\n')[0].slice(0, 48); return this.zk.addNote(first || 'Pasted note', t.length > 4000 ? t.slice(0, 4000) : t, { pos: z, scale: this.defaultScale() });
};
P.dropFile = async function (f, z) {
  if (!f) return;
  if (f.type.startsWith('image/')) { const url = URL.createObjectURL(f); return this.createNode('image', { title: f.name || 'Image', pos: z, data: { src: url } }); }
  if (f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type === 'application/pdf') { const url = URL.createObjectURL(f); return this.createNode('link', { title: f.name, pos: z, data: { url } }); }
  const text = await f.text().catch(() => null); if (text == null) return;
  if (C.isTextPath(f.name) && !/\.(md|txt)$/i.test(f.name)) { const a = C.analyzeCode(f.name, text); return this.createNode('file', { title: f.name, pos: z, data: { path: f.name, lang: a.lang, loc: a.loc, size: a.size, symbols: a.symbols, imports: a.imports, preview: text.slice(0, 12000), chunks: a.chunks, nChunks: a.chunks.length, key: 'drop:' + f.name } }); }
  return this.zk.addNote(f.name.replace(/\.\w+$/, ''), text.slice(0, 6000), { pos: z, scale: this.defaultScale() });
};
P.onClickAct = function (e) {
  const b = e.target.closest('[data-act]'); if (!b || !this.host.contains(b)) return;
  const act = b.dataset.act, nodeEl = b.closest('.nrt-node'), n = nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : null;
  if (act.startsWith('panel-')) { this.openPanel(act.slice(6)); return; }
  if (act === 'automata') { this.automata.toggle(); this.toast(this.automata.running ? 'Cellular automata running: nodes keep their distance.' : 'Automata stopped.'); this.uiHud(); return; }
  if (!n) return; e.stopPropagation();
  if (act === 'delete') return this.removeNode(n);
  if (act === 'collapse') return this.toggleCollapse(n, e.altKey);
  if (act === 'anchor') return this.toggleAnchor(n);
  if (act === 'goto') return this.zoomTo(b.dataset.id);
  if (act === 'ai-send') return this.aiSend(n);
  if (act === 'ai-zk' || act === 'ai-auto' || act === 'ai-memory' || act === 'ai-loop') { const k = { 'ai-zk': 'zkReplies', 'ai-auto': 'auto', 'ai-memory': 'memory', 'ai-loop': 'loop' }[act]; n.data[k] = !n.data[k]; this.viewMsgs(n); this.changed(); if (act === 'ai-loop' && n.data.loop) { const ps = this.aiTalk(n); this.toast(ps.length ? 'Looping with ' + ps.map(p => p.title).join(', ') + '.' : 'Link another AI node to loop with it.'); } return; }
  if (act === 'ai-wiki') { b.disabled = true; this.wiki(n, n.data.draft || (n.data.msgs || []).filter(m => m.role === 'you').slice(-1).map(m => m.text)[0] || n.title, { novelty: e.shiftKey }).then(r => this.toast(r.length ? 'Added ' + r.length + ' Wikipedia notes.' : 'No Wikipedia results.')).catch(() => this.toast('Wikipedia is unreachable.')).finally(() => { b.disabled = false; }); return; }
  if (act === 'ai-custom') { const a = (n._acts || [])[+b.dataset.i]; if (a && a.run) a.run(n, this); return; }
  if (act === 'repo-custom') { const a = ((this.o.repoActions ? this.o.repoActions(n) : []) || [])[+b.dataset.i]; if (a && a.run) a.run(n, this); return; }
  if (act === 'link-open') { const u = n.data.url; if (u) window.open(u, '_blank', 'noopener'); return; }
  if (act === 'link-display') { const w = n.body.querySelector('.nrt-fwrap'), showing = w.style.display !== 'none'; if (showing) { w.style.display = 'none'; w.innerHTML = ''; n.h = n._h0 || n.h; } else if (n.data.url) { w.style.display = ''; w.innerHTML = '<iframe class="nrt-frame" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerpolicy="no-referrer"></iframe>'; w.firstChild.src = n.data.url; n._h0 = n.h; n.h = Math.max(n.h, 360); n.w = Math.max(n.w, 420); } return; }
  if (act === 'code-lang') { n.data.lang = b.dataset.l; n.body.querySelectorAll('[data-act=code-lang]').forEach(x => x.classList.toggle('on', x === b)); this.changed(); return; }
  if (act === 'code-run') return this.runCode(n);
  if (act === 'code-hide') { const o = n.body.querySelector('.nrt-out'); o.style.display = 'none'; o.innerHTML = ''; return; }
};

/* ───────────── context menu (customcontextmenu.js) ───────────── */
P.onContext = function (e) {
  const t = e.target; if (t.closest('textarea,input,.nrt-dock,.nrt-hud,iframe,img')) return;
  e.preventDefault();
  const p = this.local(e), nodeEl = t.closest('.nrt-node'), n = nodeEl ? this.nodes.get(nodeEl.dataset.uuid) : this.dotAt(p.x, p.y), z = this.xyToZ(p.x, p.y);
  const items = n ? this.nodeMenu(n) : this.edgeAt(p.x, p.y) ? this.edgeMenu(this.edgeAt(p.x, p.y)) : this.bgMenu(z);
  this.menuOpen(e.clientX, e.clientY, n ? n.title || n.type : 'Canvas', items);
};
P.nodeMenu = function (n) {
  const it = [
    { label: 'Zoom to node', icon: 'ph-magnifying-glass-plus', run: () => this.zoomTo(n) },
    { label: 'Connect from here', icon: 'ph-plugs', run: () => { this.prev = n; this.nodeModeChanged(); this.toast('Click another node to link it. Esc cancels.'); } },
    { label: n.anchorForce ? 'Release to the fractal' : 'Anchor in place', icon: 'ph-push-pin', run: () => this.toggleAnchor(n) },
    { label: n.collapsed ? 'Expand' : 'Collapse to a circle', icon: n.collapsed ? 'ph-arrows-out-simple' : 'ph-circle', run: () => this.toggleCollapse(n) },
    { label: 'Scale up', icon: 'ph-arrows-out', run: () => { n.scale *= 1.25; G.updateNodeEdgesLength(n); } }, { label: 'Scale down', icon: 'ph-arrows-in', run: () => { n.scale *= 0.8; G.updateNodeEdgesLength(n); } }
  ];
  if (n.isTextNode) { it.push({ label: 'Split into notes', icon: 'ph-scissors', run: () => this.splitNote(n) }); it.push({ label: 'Copy text', icon: 'ph-copy', run: () => navigator.clipboard && navigator.clipboard.writeText(n.text) }); }
  if (n.type === 'file' || n.type === 'text' || n.type === 'repo') it.push({ label: 'Ask an AI about it', icon: 'ph-sparkle', run: () => { const ai = this.createNode('ai', { title: 'Ask ' + (n.title || '').slice(0, 24), pos: n.pos.plus(new vec2(n.zWidth() * 1.2, 0)), scale: n.scale }); this.connectDistance(ai, n, { kind: 'ai' }); this.select(ai); } });
  it.push({ label: 'Duplicate', icon: 'ph-copy-simple', run: () => { const d = this.serialize().nodes.find(x => x.u === n.uuid); const c = this.createNode(n.type, { title: n.title + ' copy', text: n.text, pos: n.pos.plus(new vec2(n.zWidth() * 0.4, n.zWidth() * 0.3)), scale: n.scale, data: JSON.parse(JSON.stringify(d ? d.d : {})), w: n.w, h: n.h, kind: n.kind, icon: n.icon, chrome: n.chrome, color: n.color, group: n.group }); this.select(c); } });
  n.edges.slice(0, 6).forEach(ed => { const o = ed.other(n); it.push({ label: (ed.zk ? 'Remove reference to ' : 'Cut link to ') + (o.title || o.type), icon: 'ph-link-break', muted: true, run: () => this.removeEdge(ed) }); });
  if (this.o.nodeMenu) (this.o.nodeMenu(n) || []).forEach(x => it.push(x));
  it.push({ label: 'Delete', icon: 'ph-trash', danger: true, run: () => this.removeNode(n) });
  return it;
};
P.edgeMenu = function (ed) { return [{ label: 'Toggle direction', icon: 'ph-arrows-left-right', run: () => ed.toggleDirection() }, { label: 'Lengthen', icon: 'ph-arrows-out-line-horizontal', run: () => ed.scaleLength(1.3) }, { label: 'Shorten', icon: 'ph-arrows-in-line-horizontal', run: () => ed.scaleLength(0.77) }, { label: 'Remove edge', icon: 'ph-trash', danger: true, run: () => this.removeEdge(ed) }]; };
P.bgMenu = function (z) {
  const it = [
    { label: 'New note here', icon: 'ph-note-pencil', run: () => this.createAt('text', z, { focus: true }) },
    { label: 'New AI node here', icon: 'ph-sparkle', run: () => this.createAt('ai', z) },
    { label: 'New link node here', icon: 'ph-link', run: () => this.createAt('link', z) },
    { label: 'New code node here', icon: 'ph-code', run: () => this.createAt('code', z) },
    { label: 'Fit everything', icon: 'ph-corners-out', run: () => this.fit() },
    { label: 'Reset view', icon: 'ph-arrow-counter-clockwise', run: () => this.api.resetView(true, 1200) },
    { label: this.automata.running ? 'Stop automata' : 'Run cellular automata', icon: 'ph-atom', run: () => this.automata.toggle() },
    { label: 'Copy coordinates', icon: 'ph-crosshair', run: () => navigator.clipboard && navigator.clipboard.writeText(this.api.getCoords(true)) }
  ];
  if (this.o.bgMenu) (this.o.bgMenu(z) || []).forEach(x => it.push(x));
  return it;
};
P.splitNote = function (n) {
  const secs = new C.ZetSplit(5, 500, true).splitText(n.text, { node: this.S.nodeTag, ref: this.S.refTag }); if (secs.length < 2) { this.toast('This note is already short.'); return; }
  this.zk.text = this.zk.text + '\n\n' + secs.join('\n\n'); this.zk.commit('split'); this.toast('Split into ' + secs.length + ' linked notes.');
};
P.menuOpen = function (x, y, title, items) {
  this.menuClose(); const m = this.menu = mk('div', 'nrt-menu');
  m.innerHTML = '<div class="h">' + esc(title) + '</div>' + items.map((it, i) => '<button class="nrt-mi' + (it.danger ? ' danger' : '') + '" data-i="' + i + '"' + (it.muted ? ' style="color:var(--color-neutral-300)"' : '') + '><i class="ph ' + (it.icon || 'ph-dot') + '"></i>' + esc(it.label) + '</button>').join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(); m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i]; this.menuClose(); it && it.run && it.run(); });
};
P.menuClose = function () { if (this.menu) { this.menu.remove(); this.menu = null; } };

/* ───────────── panels (neuritepanel.js · tabs) ───────────── */
P.openPanel = function (name, force) {
  if (!this.dock) return;
  if (this.panel === name && force !== true) { this.closePanel(); return; }
  this.panel = name; this.dock.hidden = false; this.dock.innerHTML = '';
  const head = mk('div', null, '<div style="display:flex;align-items:center;gap:8px"><span class="nrt-h2"></span><span class="nrt-meta nrt-sub"></span><span style="flex:1"></span><button class="nrt-btn nrt-close" title="Close"><i class="ph ph-x"></i></button></div>');
  this.dock.appendChild(head); head.querySelector('.nrt-close').onclick = () => this.closePanel();
  const set = (t, sub) => { head.querySelector('.nrt-h2').textContent = t; head.querySelector('.nrt-sub').textContent = sub || ''; };
  const body = mk('div', null); body.style.cssText = 'display:flex;flex-direction:column;gap:12px;flex:1;min-height:0';
  this.dock.appendChild(body);
  (this['panel_' + name] || this.panel_help).call(this, body, set);
  this.emit('panel', name);
};
P.closePanel = function () { if (!this.dock) return; this.dock.hidden = true; this.dock.innerHTML = ''; this.panel = null; this._zkSync = null; this.emit('panel', null); };
P.panel_zettel = function (b, set) {
  const tags = this.zk.tags; set('Zettelkasten', this.zk.wraps.size + ' notes');
  b.innerHTML = '<div class="nrt-help"><span class="nrt-mono" style="color:var(--color-accent-300)">' + esc(tags.node) + ' Title</span> starts a note. <span class="nrt-mono" style="color:var(--color-accent-300)">' + esc(tags.ref) + 'Title' + esc(C.BRACKETS[tags.ref] || '') + '</span> links it to any node. <span class="nrt-mono" style="color:var(--color-accent-300)">' + esc(tags.llm) + ' Name</span> makes an AI node. The graph and this text edit each other.</div>' +
    '<div class="nrt-grid" style="grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr)"><span class="l">Note tag</span><input class="input nrt-tn" style="min-height:28px;padding:3px 8px;font-size:12px"><span class="l">Ref tag</span><input class="input nrt-tr" style="min-height:28px;padding:3px 8px;font-size:12px"></div>' +
    '<div style="display:flex;flex-direction:column;gap:6px"><span class="nrt-lab">Placement</span><div class="nrt-seg">' + ['Radial', 'Branching', 'Spiral', 'Random'].map(p => '<button data-p="' + p + '" class="' + (this.S.zetPath === p ? 'on' : '') + '">' + p + '</button>').join('') + '</div></div>' +
    '<div class="nrt-zk"><pre></pre><textarea spellcheck="false" aria-label="Zettelkasten text"></textarea></div><div class="nrt-row"><button class="btn btn-secondary nrt-split" style="font-size:12px;padding:3px 10px"><i class="ph ph-scissors"></i>Split selection into notes</button><button class="btn btn-ghost nrt-ask" style="font-size:12px;padding:3px 8px"><i class="ph ph-sparkle"></i>Ask the Zettelkasten AI</button></div>';
  const ta = b.querySelector('textarea'), pre = b.querySelector('pre'), tn = b.querySelector('.nrt-tn'), tr = b.querySelector('.nrt-tr');
  const paint = () => { pre.innerHTML = ZK.highlight(ta.value, this.zk.tags); pre.scrollTop = ta.scrollTop; };
  ta.value = this.zk.text; paint(); tn.value = tags.node; tr.value = tags.ref;
  ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; });
  ta.addEventListener('input', () => { paint(); clearTimeout(this._zkT); this._zkT = setTimeout(() => { this.zk.setText(ta.value, 'panel'); set('Zettelkasten', this.zk.wraps.size + ' notes'); }, 160); });
  ta.addEventListener('keydown', e => e.stopPropagation());
  const retag = () => { const n = tn.value.trim() || '##', r = tr.value.trim() || '[['; this.setSettings({ nodeTag: n, refTag: r }); this.zk.load(this.zk.text); paint(); };
  tn.addEventListener('change', retag); tr.addEventListener('change', retag);
  b.querySelectorAll('[data-p]').forEach(x => x.onclick = () => { this.setSettings({ zetPath: x.dataset.p }); b.querySelectorAll('[data-p]').forEach(y => y.classList.toggle('on', y === x)); });
  b.querySelector('.nrt-split').onclick = () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd) || ''; if (!s.trim()) { this.toast('Select some text in the Zettelkasten first.'); return; } const secs = new C.ZetSplit(5, 500, true).splitText(s, { node: this.S.nodeTag, ref: this.S.refTag }); ta.setRangeText(secs.join('\n\n')); this.zk.setText(ta.value, 'split'); paint(); };
  b.querySelector('.nrt-ask').onclick = async () => { const q = window.prompt('Prompt the Zettelkasten AI'); if (!q) return; await this.promptZettelkasten(q); ta.value = this.zk.text; paint(); };
  this._zkSync = () => { if (document.activeElement !== ta) { ta.value = this.zk.text; paint(); set('Zettelkasten', this.zk.wraps.size + ' notes'); } };
};
P.panel_fractal = function (b, set) {
  const S = this.S; set('Fractal', this.fr.itersFor(this.zoom.mag()).toLocaleString() + ' iterations');
  const seg = (key, opts) => '<div class="nrt-seg" data-k="' + key + '">' + opts.map(([v, l]) => '<button data-v="' + v + '" class="' + (String(S[key]) === String(v) ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
  const rng = (key, label, min, max, step, fmt) => '<span class="l">' + label + '</span><input type="range" data-r="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + S[key] + '"><span class="v" data-v="' + key + '">' + (fmt ? fmt(S[key]) : S[key]) + '</span>';
  b.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px"><span class="nrt-lab">Set</span>' + seg('fractal', Object.entries(C.FRACTALS).map(([k, v]) => [k, v.label])) + '<div class="nrt-eq"></div></div>' +
    '<div class="nrt-jul" style="display:none;gap:12px;align-items:center"><div class="nrt-pad" title="Drag to set the Julia constant"><span></span></div><div class="nrt-meta nrt-jv" style="white-space:normal"></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:6px"><span class="nrt-lab">Color</span>' + seg('palette', Object.entries(C.PALETTES).map(([k, v]) => [k, v.label])) + '</div>' +
    '<div class="nrt-grid">' + rng('exponent', 'Exponent', 1, 8, 1) + rng('maxLines', 'Lines', 64, 3000, 16) + rng('renderSteps', 'Length', 4, 80, 1) + rng('renderStepSize', 'Step', 0.02, 0.4, 0.01) + rng('renderWidthMult', 'Width', 0.05, 1.5, 0.05) + rng('iterations', 'Iterations', 32, 2000, 16) + rng('flashlight_stdev', 'Flashlight', 0.02, 1, 0.01) + rng('flashlight_fraction', 'Near cursor', 0, 1, 0.01, v => Math.round(v * 100) + '%') + rng('regenDebtAdjustmentFactor', 'Regrowth', 0, 8, 0.5) + rng('glow', 'Glow', 0, 1, 0.05, v => Math.round(v * 100) + '%') + rng('colorS', 'Contrast', 0, 160, 1) + rng('colorR', 'Desaturate', 0, 1, 0.05, v => Math.round(v * 100) + '%') + '</div>' +
    '<div class="nrt-row"><button class="nrt-chip" data-t="autoIterations">Deeper iterations with zoom</button><button class="nrt-chip" data-t="fractalForce">Nodes fall into the fractal</button><button class="nrt-chip" data-t="useFlowDirection">Flow direction</button><button class="nrt-chip" data-t="neuriteScroll">Neurite scroll direction</button></div>' +
    '<div class="nrt-row"><button class="btn btn-secondary" data-a="freeze" style="font-size:12px;padding:3px 10px"><i class="ph ph-snowflake"></i>Freeze · Alt F</button><button class="btn btn-ghost" data-a="thaw" style="font-size:12px;padding:3px 8px">Clear frozen · Alt C</button><button class="btn btn-ghost" data-a="shot" style="font-size:12px;padding:3px 8px"><i class="ph ph-camera"></i>PNG · Alt S</button><button class="btn btn-ghost" data-a="regrow" style="font-size:12px;padding:3px 8px"><i class="ph ph-arrows-clockwise"></i>Regrow</button></div>' +
    '<div class="nrt-help">Hairs trace the level sets of the escape-time distance, sampled around your cursor (the flashlight) and across the view. Inside the set they flow to the attracting basin. Shift freezes time and shows the cursor’s orbit.</div>';
  const eq = b.querySelector('.nrt-eq'), jul = b.querySelector('.nrt-jul'), pad = b.querySelector('.nrt-pad'), dot = pad.firstChild, jv = b.querySelector('.nrt-jv');
  const sync = () => { const f = C.FRACTALS[S.fractal] || C.FRACTALS.mandelbrot; eq.innerHTML = f.eq.replace('n', String(S.exponent)).replace('−n', '−' + S.exponent); jul.style.display = S.fractal === 'julia' ? 'flex' : 'none'; dot.style.left = ((S.juliaX + 2) / 4 * 100) + '%'; dot.style.top = ((S.juliaY + 2) / 4 * 100) + '%'; jv.textContent = 'k = ' + S.juliaX.toFixed(3) + (S.juliaY < 0 ? ' − ' : ' + ') + Math.abs(S.juliaY).toFixed(3) + 'i'; b.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', !!S[x.dataset.t])); b.querySelectorAll('[data-r]').forEach(x => { if (document.activeElement !== x) x.value = S[x.dataset.r]; }); set('Fractal', this.fr.itersFor(this.zoom.mag()).toLocaleString() + ' iterations'); };
  sync();
  b.querySelectorAll('.nrt-seg[data-k]').forEach(sg => sg.querySelectorAll('button').forEach(x => x.onclick = () => { this.setSettings({ [sg.dataset.k]: x.dataset.v }); sg.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); sync(); }));
  b.querySelectorAll('[data-r]').forEach(x => x.oninput = () => { const k = x.dataset.r, v = parseFloat(x.value); this.setSettings({ [k]: v }); const o = b.querySelector('[data-v="' + k + '"].v'); if (o) o.textContent = k === 'flashlight_fraction' || k === 'glow' || k === 'colorR' ? Math.round(v * 100) + '%' : v; sync(); });
  b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { this.setSettings({ [x.dataset.t]: !S[x.dataset.t] }); sync(); });
  let dragging = false; const jset = e => { const r = pad.getBoundingClientRect(); this.setSettings({ juliaX: clamp((e.clientX - r.left) / r.width, 0, 1) * 4 - 2, juliaY: clamp((e.clientY - r.top) / r.height, 0, 1) * 4 - 2 }); sync(); };
  pad.onmousedown = e => { dragging = true; jset(e); }; window.addEventListener('mousemove', e => { if (dragging) jset(e); }); window.addEventListener('mouseup', () => { dragging = false; });
  b.querySelector('[data-a=freeze]').onclick = () => this.preserveHairs(); b.querySelector('[data-a=thaw]').onclick = () => this.clearPreserved(); b.querySelector('[data-a=shot]').onclick = () => this.screenshot(); b.querySelector('[data-a=regrow]').onclick = () => { this.hairs = this.hairs.filter(h => h.keep); };
};
P.panel_search = function (b, set) {
  set('Search', '');
  b.innerHTML = '<input class="input nrt-q" placeholder="Search titles, text, code and chats" style="min-height:32px;font-size:13px"><div class="nrt-seg"><button data-m="keyword" class="on">Keyword</button><button data-m="semantic">Semantic</button><button data-m="code">Code chunks</button></div><div class="nrt-list"></div>';
  const q = b.querySelector('.nrt-q'), list = b.querySelector('.nrt-list'); let mode = 'keyword';
  const run = () => {
    const term = q.value.trim(); list.innerHTML = '';
    if (mode === 'code') { const hits = term ? this.vdb.search(term, 12) : []; set('Search', hits.length + ' chunks · ' + this.vdb.size.toLocaleString() + ' indexed'); hits.forEach(h => { const x = mk('button', 'nrt-li', '<span class="x"></span><span class="m"></span>'); x.firstChild.textContent = h.key.split('/').slice(-2).join('/') + ' · ' + h.text.replace(/\s+/g, ' ').slice(0, 70); x.lastChild.textContent = h.relevanceScore.toFixed(2); x.onclick = () => { const n = h.meta && h.meta.node && this.nodes.get(h.meta.node); if (n) { if (n.hidden && this.o.reveal) this.o.reveal(n); this.zoomTo(n); } }; list.appendChild(x); }); return; }
    const ns = this.searchNodes(term, { mode, max: 40 }); set('Search', term ? ns.length + ' matches' : '');
    ns.forEach(n => { const x = mk('button', 'nrt-li', '<span class="x"></span><span class="m"></span>'); x.firstChild.textContent = n.title || n.type; x.lastChild.textContent = n.type + (mode === 'semantic' ? ' · ' + n._score.toFixed(2) : ''); x.onclick = () => this.zoomTo(n); x.ondblclick = () => this.zoomTo(n, { skip: true }); list.appendChild(x); });
  };
  q.addEventListener('input', () => { clearTimeout(this._sT); this._sT = setTimeout(run, 140); }); q.addEventListener('keydown', e => e.stopPropagation());
  b.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { mode = x.dataset.m; b.querySelectorAll('[data-m]').forEach(y => y.classList.toggle('on', y === x)); run(); });
  setTimeout(() => q.focus(), 30);
};
P.panel_functions = function (b, set) {
  set('Neural API', this.api.functionNames.length + ' functions');
  b.innerHTML = '<div class="nrt-help">A terminal for Neurite’s own functions. Every call returns a promise, so <span class="nrt-mono">await</span> sequences them. Ctrl + Enter runs.</div><div class="nrt-row">' +
    ['zoomToNodeTitle("' + ((this.nodes.values().next().value || {}).title || 'Title').replace(/"/g, '') + '")', "movement(['zoomIn','rotateClockwise'])", 'setMandelbrotCoords(0.0005, -0.7453, 0.1127)', 'exploreBoundaryPoints({ numPoints: 4, zoomLevel: 0.002 })', 'await searchAndZoom("retry", 3)', 'addNote("Idea", "Linked to [[Retry jitter]]")', 'resetView()'].map(x => '<button class="nrt-chip nrt-mono" style="font-size:11px">' + esc(x) + '</button>').join('') +
    '</div><textarea class="nrt-ta nrt-mono nrt-code" spellcheck="false" style="flex:none;height:120px" placeholder="await zoom(2); await rotate(45);"></textarea><div class="nrt-row"><button class="btn btn-primary nrt-run" style="font-size:12px;padding:3px 12px"><i class="ph ph-play"></i>Run</button><button class="btn btn-ghost nrt-doc" style="font-size:12px;padding:3px 8px"><i class="ph ph-book-open"></i>Docs</button><button class="btn btn-ghost nrt-clr" style="font-size:12px;padding:3px 8px">Clear</button></div><div class="nrt-log"></div>';
  const ta = b.querySelector('.nrt-code'), log = b.querySelector('.nrt-log'), out = (cls, t) => { const d = mk('div', cls); d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; };
  (this._fnLog || []).forEach(([c, t]) => out(c, t));
  const run = async () => {
    const code = ta.value.trim(); if (!code) return; out('c', '› ' + code); (this._fnLog = this._fnLog || []).push(['c', '› ' + code]);
    const scope = Object.assign({}, this.api.registry, { api: this.api, nrt: this, Neurite: NS, neuralApiPrompt: this.api.neuralApiPrompt, console: { log: (...a) => { const t = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); out('', t); this._fnLog.push(['', t]); } } });
    try { const fn = new (Object.getPrototypeOf(async function () {}).constructor)(...Object.keys(scope), code.includes('return') || code.includes(';') || code.includes('\n') ? code : 'return (' + code + ')'); const r = await fn(...Object.values(scope)); const t = r === undefined ? 'done' : (r && r.uuid ? 'node ' + r.title : Array.isArray(r) ? r.map(x => x && x.title || x).join(', ') : typeof r === 'object' ? JSON.stringify(r) : String(r)); out('', t); this._fnLog.push(['', t]); }
    catch (e) { out('e', String(e)); this._fnLog.push(['e', String(e)]); }
  };
  b.querySelector('.nrt-run').onclick = run; b.querySelector('.nrt-doc').onclick = () => out('', this.api.neuralApiPrompt()); b.querySelector('.nrt-clr').onclick = () => { log.innerHTML = ''; this._fnLog = []; };
  b.querySelectorAll('.nrt-chip').forEach(x => x.onclick = () => { ta.value = x.textContent; ta.focus(); });
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
};
P.panel_saves = function (b, set) {
  const paint = () => {
    const list = this.listSaves(); set('Saves', list.length + ' saved');
    b.innerHTML = '<div class="nrt-row" style="flex-wrap:nowrap"><input class="input nrt-name" placeholder="Name this graph" style="flex:1;min-height:30px;font-size:12.5px"><button class="btn btn-primary nrt-save" style="font-size:12px;padding:3px 12px"><i class="ph ph-floppy-disk"></i>Save</button></div><div class="nrt-list">' +
      (list.length ? list.map(s => '<div class="nrt-li" style="cursor:default"><span class="x">' + esc(s.name) + '</span><span class="m">' + s.nodes + ' nodes · ' + new Date(s.at).toLocaleDateString() + '</span><button class="nrt-btn" data-l="' + esc(s.name) + '" title="Load"><i class="ph ph-upload-simple"></i></button><button class="nrt-btn" data-d="' + esc(s.name) + '" title="Delete"><i class="ph ph-trash"></i></button></div>').join('') : '<div class="nrt-help">Nothing saved yet. The current graph also autosaves locally.</div>') +
      '</div><div class="nrt-row"><button class="btn btn-secondary nrt-exp" style="font-size:12px;padding:3px 10px"><i class="ph ph-download-simple"></i>Export JSON</button><label class="btn btn-ghost" style="font-size:12px;padding:3px 8px;cursor:pointer"><i class="ph ph-upload-simple"></i>Import<input type="file" accept="application/json,.json" hidden></label><span style="flex:1"></span><button class="btn btn-ghost nrt-clear" style="font-size:12px;padding:3px 8px;color:oklch(0.74 0.12 25)">Clear graph</button></div>';
    const nm = b.querySelector('.nrt-name'); nm.addEventListener('keydown', e => e.stopPropagation());
    b.querySelector('.nrt-save').onclick = () => { if (this.save(nm.value || 'Graph ' + new Date().toLocaleString())) { this.toast('Saved.'); paint(); } else this.toast('Storage is full.'); };
    b.querySelectorAll('[data-l]').forEach(x => x.onclick = () => { this.load(x.dataset.l); this.toast('Loaded ' + x.dataset.l + '.'); });
    b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { this.removeSave(x.dataset.d); paint(); });
    b.querySelector('.nrt-exp').onclick = () => this.exportJSON();
    b.querySelector('input[type=file]').onchange = e => { const f = e.target.files[0]; if (f) this.importJSON(f).then(() => this.toast('Imported.')).catch(er => this.toast(String(er.message || er))); };
    b.querySelector('.nrt-clear').onclick = () => { if (window.confirm('Remove every node and edge from this graph?')) { this.clear(); this.toast('Cleared.'); } };
  };
  paint();
};
P.panel_help = function (b, set) {
  set('Controls', 'Neurite');
  const rows = [['Drag the canvas', 'Move around'], ['Scroll', 'Zoom through the fractal'], ['Alt + scroll', 'Rotate the view'], ['Shift + double click', 'New text node'], ['Alt + double click', 'New AI node'], ['Ctrl + double click', 'New link node'], ['Hold Shift', 'Freeze time, show the cursor orbit'], ['Shift + click two nodes', 'Connect them'], ['Click an edge', 'Change its direction'], ['Shift + double click an edge', 'Delete it'], ['Shift + scroll an edge', 'Change its length'], ['Double click a node', 'Anchor or release it'], ['Shift + scroll a node', 'Scale it'], ['Ctrl + click', 'Select nodes'], ['Ctrl + drag', 'Box select'], ['Arrow keys', 'Move selected nodes'], ['f / d', 'Scale selected up / down'], ['Alt + drag', 'Drag through text fields'], ['Right click', 'Node methods'], ['Alt + F / C / S', 'Freeze / clear / save fractal lines'], ['Drop or paste', 'Files, images, links and text become nodes']];
  b.innerHTML = '<div class="nrt-grid" style="grid-template-columns:auto minmax(0,1fr)">' + rows.map(([k, v]) => '<span style="color:var(--color-accent-300);white-space:nowrap">' + esc(k) + '</span><span>' + esc(v) + '</span>').join('') + '</div>';
};
P.uiDirty = function () { if (this.panel === 'zettel' && this._zkSync) { clearTimeout(this._zsT); this._zsT = setTimeout(() => this._zkSync && this._zkSync(), 120); } };
P.uiSettings = function () {};

/* ───────────── mount ───────────── */
NS.mount = function (host, o = {}) { return new NS.Surface(host, o); };
NS.headless = function (o = {}) { return new NS.Surface(null, Object.assign({ headless: true, autosave: false, restore: false, persistSettings: false }, o)); };
NS.version = '1.0.0';
if (!customElements.get('neurite-surface')) customElements.define('neurite-surface', class extends HTMLElement { connectedCallback() { if (this.nrt) return; this.style.display = this.style.display || 'block'; this.nrt = NS.mount(this, { id: this.getAttribute('storage-id') || 'element' }); } disconnectedCallback() { if (this.nrt) { this.nrt.destroy(); this.nrt = null; } } });
})();
