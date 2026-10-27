/* Saltline suite launcher — a shared ⌘K command palette on every page.
   Self-contained: own styles + inline icons, no dependency on suite-theme or Phosphor,
   adapts to [data-theme="dark"] when present. Lazy-loads the product list and the 200
   field tools so you can search and jump to anything from anywhere. */
(function () {
  if (window.__slk) return; window.__slk = 1;
  var D = document, root, inp, listEl, items = [], flat = [], sel = 0, open = false, lastFocus = null;
  var CATALOG = null, dyn = { products: [], tools: [] };

  var ICON = {
    grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
    product: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5z"/>',
    action: '<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>',
    client: '<path d="M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/>',
    test: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    ret: '<path d="M9 10l-5 5 5 5M4 15h12a4 4 0 0 0 4-4V5"/>'
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON[k] || ICON.grid) + '</svg>'; };

  var PAGES = [
    ['Console', 'Live operations picture', 'Command Center.html', 'home dashboard map feeds'],
    ['Observatory', 'Live global hazards and site exposure', 'Observatory.dc.html', 'hazard earthquake seismic volcano cyclone storm drought flood wildfire air quality pollution conflict war famine hunger food outbreak schumann space weather kp exposure'],
    ['Agency', 'Self-improving agent: tests, patches, posts, research', 'Agency.dc.html', 'agent agency builder self improve patch code graph audit journal blog post research fire forecast competitor intel device test'],
    ['Resilience', 'Control checks, chaos and stress tests on this codebase', 'Resilience.dc.html', 'soc 2 security audit chaos fuzz stress test resilience compliance controls tester'],
    ['Market & competition', 'Competitors and how Saltline wins', 'Market.dc.html', 'erm competitor competition market share wsp aecom jacobs sphera moodys positioning'],
    ['Dossier Suite', 'Client SaaS home', 'Dossier.html', 'saas product home'],
    ['AI onboarding', 'Conversational client setup', 'Onboarding.html', 'start new client setup typeform interview'],
    ['Intake & documents', 'Upload and ingest files', 'Dossier.html#/intake', 'upload documents files ingest graph'],
    ['Dossier builder', 'Draft the cited dossier', 'Dossier.html#/dossier', 'build generate report'],
    ['Tester agent', 'QA runs, connectome, chat', 'Tester.html', 'test qa quality connectome graph'],
    ['Field tools', '200 working tools', 'Field Tools.html', 'calculator live data ai tools'],
    ['ESIA workspace', 'Full impact assessment draft', 'Impact Assessment.html', 'environmental social impact assessment'],
    ['Sitemap', 'Everything in the suite', 'Dossier.html#/sitemap', 'map links routes pages']
  ].map(function (p) { return { t: p[0], s: p[1], h: p[2], kw: p[3], g: 'Pages', i: 'grid' }; });

  var ACTIONS = [
    { t: 'Toggle theme', s: 'Light · Dark · Auto', act: 'theme', g: 'Quick actions', i: 'action', kw: 'dark light mode appearance' },
    { t: 'Onboard a client', s: 'Start the AI onboarding', h: 'Onboarding.html', g: 'Quick actions', i: 'action', kw: 'new client add typeform' },
    { t: 'Build a dossier', s: 'Open the dossier builder', h: 'Dossier.html#/dossier', g: 'Quick actions', i: 'action', kw: 'generate report' },
    { t: 'Run the tester', s: 'Open the tester agent', h: 'Tester.html', g: 'Quick actions', i: 'action', kw: 'qa test' },
    { t: 'Browse 200 field tools', s: 'Calculators, live data, AI', h: 'Field Tools.html', g: 'Quick actions', i: 'action', kw: 'tools' }
  ];

  function recents() {
    var out = [];
    try {
      var c = JSON.parse(localStorage.getItem('saltline.client') || 'null');
      if (c && c.intake && (c.intake.project || (c.client && c.client.org))) {
        var proj = c.intake.project || (c.client && c.client.project) || 'Current client';
        out.push({ t: proj, s: 'Continue client' + (c.dossier ? ' · dossier ready' : ' · in progress'), h: 'Dossier.html#/' + (c.dossier ? 'dossier' : 'intake'), g: 'Recent', i: 'client', kw: 'client current ' + proj });
      }
      var ds = JSON.parse(localStorage.getItem('saltline.dossiers') || '[]');
      ds.slice(0, 3).forEach(function (d) { out.push({ t: d.project || 'Untitled dossier', s: (d.product || 'Dossier') + ' · ' + Math.round((d.coverage || 0) * 100) + '% coverage', h: 'Dossier.html#/dossier', g: 'Recent', i: 'doc', kw: 'dossier ' + (d.product || '') }); });
      var ts = JSON.parse(localStorage.getItem('saltline.tests') || '[]');
      if (ts.length) { var pass = ts.filter(function (x) { return x.pass; }).length; out.push({ t: 'QA results', s: ts.length + ' runs · ' + Math.round(pass / ts.length * 100) + '% pass', h: 'Tester.html', g: 'Recent', i: 'test', kw: 'tests qa results' }); }
    } catch (e) {}
    return out;
  }

  async function lazy() {
    if (CATALOG) return;
    CATALOG = true;
    try {
      var core = await import('./suite-core.js');
      dyn.products = (core.PRODUCTS || []).map(function (p) { return { t: p.name, s: p.short.slice(0, 64), h: 'Dossier.html#/products', g: 'Products', i: 'product', kw: 'product ' + p.id + ' ' + p.for }; });
    } catch (e) {}
    try {
      var fd = await import('./features-data.js');
      (fd.DOMAINS || []).forEach(function (d, di) { var dom = d[0]; (d[1] || []).forEach(function (t, ti) { dyn.tools.push({ t: t.n, s: dom + ' · ' + ({ calc: 'Calculator', live: 'Live data', ai: 'AI tool' }[t.k] || 'Tool'), h: 'Field Tools.html#t=' + di + '-' + ti, g: 'Field tools', i: 'tool', kw: dom + ' ' + t.k }); }); });
    } catch (e) {}
    if (open) render();
  }

  function all() { return ACTIONS.concat(recents(), PAGES, dyn.products, dyn.tools); }

  function score(it, q) {
    var hay = (it.t + ' ' + (it.s || '') + ' ' + (it.kw || '')).toLowerCase();
    if (hay.indexOf(q) < 0) return -1;
    var s = 0, t = it.t.toLowerCase();
    if (t === q) s += 100; else if (t.indexOf(q) === 0) s += 60; else if (t.indexOf(q) > -1) s += 30;
    if ((it.kw || '').toLowerCase().indexOf(q) > -1) s += 8;
    if (it.g === 'Quick actions' || it.g === 'Recent') s += 6;
    return s;
  }

  var ORDER = ['Quick actions', 'Recent', 'Pages', 'Products', 'Field tools'];
  function render() {
    var q = inp.value.trim().toLowerCase(), pool = all(), groups = {};
    if (!q) {
      ACTIONS.forEach(add); recents().forEach(add); PAGES.forEach(add);
      if (!dyn.products.length) { /* still loading */ }
    } else {
      pool.map(function (it) { return [it, score(it, q)]; }).filter(function (p) { return p[1] >= 0; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 40).forEach(function (p) { add(p[0]); });
    }
    function add(it) { (groups[it.g] = groups[it.g] || []).push(it); }
    var html = '', idx = 0; flat = [];
    var gk = Object.keys(groups).sort(function (a, b) { return (ORDER.indexOf(a) + 99) % 100 - (ORDER.indexOf(b) + 99) % 100; });
    gk.forEach(function (g) {
      html += '<div class="slk-g">' + g + (g === 'Field tools' && !dyn.tools.length ? ' · loading…' : '') + '</div>';
      groups[g].forEach(function (it) {
        var my = idx++; flat.push(it);
        html += '<div class="slk-i" data-i="' + my + '"><span class="slk-ic">' + svg(it.i) + '</span><span class="slk-tx"><b>' + esc(it.t) + '</b><em>' + esc(it.s || '') + '</em></span><span class="slk-rt">' + svg('ret') + '</span></div>';
      });
    });
    if (!flat.length) html = '<div class="slk-empty">No matches. Try “dossier”, “salinity”, “tester”, “theme”.</div>';
    listEl.innerHTML = html;
    sel = 0; mark();
    Array.prototype.forEach.call(listEl.querySelectorAll('.slk-i'), function (el) {
      el.addEventListener('mousemove', function () { sel = +el.dataset.i; mark(); });
      el.addEventListener('click', function () { go(flat[+el.dataset.i]); });
    });
  }
  function mark() {
    Array.prototype.forEach.call(listEl.querySelectorAll('.slk-i'), function (el) {
      var on = +el.dataset.i === sel; el.className = 'slk-i' + (on ? ' on' : '');
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }
  function go(it) {
    if (!it) return;
    if (it.act === 'theme') { var b = D.querySelector('[data-theme-toggle]'); if (b) b.click(); return; }
    if (it.h) { if (it.h.indexOf(location.pathname.split('/').pop()) === 0 && it.h.indexOf('#') > -1) { location.hash = it.h.split('#')[1]; close(); } else { location.href = it.h; } }
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function show() { open = true; lastFocus = D.activeElement; root.classList.add('on'); inp.value = ''; render(); lazy(); setTimeout(function () { inp.focus(); }, 20); }
  function close() { open = false; root.classList.remove('on'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  function build() {
    var css = D.createElement('style'); css.textContent =
      '#slk-root{--slk-bg:#fff;--slk-panel:#fff;--slk-ink:#121a16;--slk-dim:#65726b;--slk-line:#e3e8e5;--slk-soft:#f1f4f2;--slk-acc:#0d8670;--slk-accbg:#e5f5f1;position:fixed;inset:0;z-index:2147483000;display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;background:rgba(14,20,17,.44);backdrop-filter:blur(3px);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}' +
      'html[data-theme="dark"] #slk-root{--slk-bg:#141c19;--slk-panel:#141c19;--slk-ink:#e7edea;--slk-dim:#8a958f;--slk-line:#2c3531;--slk-soft:#1c2421;--slk-acc:#34d3b1;--slk-accbg:#0c362e}' +
      '#slk-root.on{display:flex;animation:slkf .14s ease-out}@keyframes slkf{from{opacity:0}to{opacity:1}}' +
      '#slk-panel{width:100%;max-width:620px;background:var(--slk-panel);color:var(--slk-ink);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4),0 0 0 1px var(--slk-line);overflow:hidden;display:flex;flex-direction:column;max-height:72vh;animation:slkp .16s cubic-bezier(.3,0,.2,1)}@keyframes slkp{from{transform:translateY(-8px) scale(.99)}to{transform:none}}' +
      '#slk-top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--slk-line)}' +
      '#slk-top svg{width:18px;height:18px;color:var(--slk-dim);flex:none}' +
      '#slk-inp{flex:1;border:0;outline:none;background:transparent;color:var(--slk-ink);font-size:16px;font-family:inherit}#slk-inp::placeholder{color:var(--slk-dim)}' +
      '#slk-esc{font-size:11px;color:var(--slk-dim);border:1px solid var(--slk-line);border-radius:6px;padding:2px 6px;white-space:nowrap}' +
      '#slk-list{overflow:auto;padding:6px}' +
      '.slk-g{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--slk-dim);padding:10px 10px 4px}' +
      '.slk-i{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;cursor:pointer}' +
      '.slk-i.on{background:var(--slk-soft)}' +
      '.slk-ic{width:30px;height:30px;border-radius:8px;background:var(--slk-accbg);color:var(--slk-acc);display:grid;place-items:center;flex:none}.slk-ic svg{width:16px;height:16px}' +
      '.slk-tx{flex:1;min-width:0}.slk-tx b{display:block;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slk-tx em{font-style:normal;font-size:12px;color:var(--slk-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}' +
      '.slk-rt{opacity:0;color:var(--slk-dim)}.slk-rt svg{width:15px;height:15px}.slk-i.on .slk-rt{opacity:1}' +
      '.slk-empty{padding:28px 16px;text-align:center;color:var(--slk-dim);font-size:14px}' +
      '#slk-btn{position:fixed;left:16px;bottom:16px;z-index:2147482000;display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border-radius:999px;border:1px solid var(--slk-line,#e3e8e5);background:var(--slk-bg,#fff);color:var(--slk-ink,#121a16);box-shadow:0 6px 20px rgba(0,0,0,.14);cursor:pointer;font:600 12.5px ui-sans-serif,system-ui,sans-serif}' +
      'html[data-theme="dark"] #slk-btn{--slk-bg:#141c19;--slk-ink:#e7edea;--slk-line:#2c3531}' +
      '#slk-btn svg{width:15px;height:15px;color:var(--slk-acc,#0d8670)}#slk-btn kbd{font:600 11px ui-monospace,monospace;background:var(--slk-soft,#f1f4f2);border-radius:5px;padding:1px 5px}' +
      '@media(max-width:560px){#slk-btn kbd{display:none}}' +
      '@media print{#slk-root,#slk-btn{display:none!important}}';
    D.head.appendChild(css);

    root = D.createElement('div'); root.id = 'slk-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Command palette');
    root.innerHTML = '<div id="slk-panel"><div id="slk-top">' + svg('search') + '<input id="slk-inp" placeholder="Search the suite — pages, products, 200 tools, actions…" autocomplete="off" spellcheck="false"><span id="slk-esc">Esc</span></div><div id="slk-list"></div></div>';
    D.body.appendChild(root);
    inp = D.getElementById('slk-inp'); listEl = D.getElementById('slk-list');
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    inp.addEventListener('input', render);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(flat[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    var btn = D.createElement('button'); btn.id = 'slk-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Open command palette');
    btn.innerHTML = svg('search') + '<span>Search</span><kbd>' + (navigator.platform.indexOf('Mac') > -1 ? '⌘K' : 'Ctrl K') + '</kbd>';
    btn.addEventListener('click', show); D.body.appendChild(btn);
  }

  D.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (!root) build(); open ? close() : show(); }
  });
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', build); else build();
})();
