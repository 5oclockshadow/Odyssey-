/* Saltline suite navigation — one top bar for every page.
   Put <div data-suite-nav="observatory"></div> where the bar goes. Elements marked data-nav-extra move into the bar.
   Pages report status with SuiteNav.status(text, tone) where tone is 'ok' | 'warn' | 'bad' | 'busy'. */
(function () {
  if (window.SuiteNav) return;
  var ITEMS = [
    ['console', 'Console', 'Command Center.html'], ['observatory', 'Observatory', 'Observatory.dc.html'], ['agency', 'Agency', 'Agency.dc.html'], ['resilience', 'Resilience', 'Resilience.dc.html'],
    ['dossiers', 'Dossiers', 'Dossier.html'], ['onboarding', 'Onboarding', 'Onboarding.html'], ['tools', 'Field tools', 'Field Tools.html'],
    ['tester', 'Tester', 'Tester.html'], ['market', 'Market', 'Market.dc.html']
  ];
  var CSS = '.sn{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--color-bg) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 1px 0 var(--color-neutral-800);font-family:var(--font-body)}' +
    '.sn-in{display:flex;align-items:center;gap:12px;padding:9px 22px;max-width:1560px;margin:0 auto;min-height:54px}' +
    '.sn-brand{display:flex;align-items:center;gap:9px;color:var(--color-text);text-decoration:none;font-weight:600;font-size:14.5px;flex:none}' +
    '.sn-brand small{display:block;font-size:11px;font-weight:400;color:var(--color-neutral-500);line-height:1.2;white-space:nowrap}.sn-brand span{line-height:1.15}' +
    '.sn-mk{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--color-accent);color:var(--color-on-accent);font-size:15px}' +
    '.sn-nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;min-width:0}.sn-nav::-webkit-scrollbar{display:none}' +
    '.sn-nav a{padding:6px 10px;border-radius:8px;font-size:13px;font-weight:500;color:var(--color-neutral-400);text-decoration:none;white-space:nowrap}' +
    '.sn-nav a:hover{background:var(--color-neutral-900);color:var(--color-text)}.sn-nav a[aria-current=page]{background:var(--color-accent-900);color:var(--color-accent-200)}' +
    '.sn-sp{flex:1;min-width:8px}.sn-extra{display:flex;align-items:center;gap:10px;min-width:0}' +
    '.sn-st{display:none;align-items:center;gap:7px;font-size:12.5px;color:var(--color-neutral-400);max-width:340px;min-width:0}.sn-st.on{display:flex}.sn-st b{font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sn-st i{width:7px;height:7px;border-radius:50%;flex:none;background:var(--color-neutral-600)}.sn-st.ok i{background:var(--ok)}.sn-st.warn i{background:var(--warn)}.sn-st.bad i{background:var(--bad)}.sn-st.busy i{background:var(--warn);animation:snp 1s ease-in-out infinite}' +
    '@keyframes snp{50%{opacity:.35}}' +
    '.sn-ic{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:var(--color-neutral-300);font:500 12.5px var(--font-body);cursor:pointer;flex:none}' +
    '.sn-ic:hover{background:var(--color-neutral-900);color:var(--color-text)}.sn-ic i.ph{font-size:16px}' +
    '@media(max-width:1240px){.sn-in{flex-wrap:wrap;row-gap:4px}.sn-nav{order:5;flex-basis:100%;overflow:visible;flex-wrap:wrap;margin:0 -6px}.sn-brand small{display:none}.sn-extra .clock,.sn-extra .feeds{display:none}}' +
    '@media(max-width:860px){.sn-in{gap:6px 10px;padding:8px 14px}.sn-nav a{padding:5px 8px;font-size:12.5px}.sn-st{max-width:180px}.sn-ic span{display:none}}' +
    '#slk-btn{display:none!important}';
  function current(el) { var k = el && el.getAttribute('data-suite-nav'); if (k) return k; var f = decodeURIComponent(location.pathname.split('/').pop() || ''); for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i][2] === f) return ITEMS[i][0]; return ''; }
  function build(el) {
    var cur = current(el), item = ITEMS.filter(function (x) { return x[0] === cur; })[0];
    var h = document.createElement('header'); h.className = 'sn'; h.setAttribute('data-sn', '1');
    h.innerHTML = '<div class="sn-in"><a class="sn-brand" href="Command Center.html"><span class="sn-mk"><i class="ph ph-plant"></i></span><span>Saltline<small data-sn-sub>' + (item ? item[1] : 'Suite') + '</small></span></a>' +
      '<nav class="sn-nav" aria-label="Suite">' + ITEMS.map(function (x) { return '<a href="' + encodeURI(x[2]) + '"' + (x[0] === cur ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('') + '</nav>' +
      '<span class="sn-sp"></span><span class="sn-extra"></span><span class="sn-st"><i></i><b></b></span>' +
      '<button class="sn-ic" data-theme-toggle title="Theme"></button><button class="sn-ic" data-sn-search title="Search the suite (Ctrl K)"><i class="ph ph-magnifying-glass"></i></button></div>';
    el.replaceWith(h);
    h.querySelector('[data-sn-search]').onclick = function () { var b = document.getElementById('slk-btn'); if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true })); };
    var cur2 = h.querySelector('[aria-current]'); if (cur2 && cur2.scrollIntoViewIfNeeded) { var n = h.querySelector('.sn-nav'); n.scrollLeft = cur2.offsetLeft - 40; }
    adopt(); try { window.dispatchEvent(new StorageEvent('storage', { key: 'saltline.theme' })); } catch (e) {}
    import(new URL('suite-core.js', document.baseURI).href).then(function (C) { var s = h.querySelector('[data-sn-sub]'); if (s && C.SUITE) s.textContent = (item ? item[1] : 'Suite') + ' · v' + C.SUITE.version; }, function () {});
    if (pending) api.status(pending[0], pending[1]);
  }
  function adopt() { var bar = document.querySelector('header.sn .sn-extra'); if (!bar) return; document.querySelectorAll('[data-nav-extra]').forEach(function (x) { if (!bar.contains(x)) bar.appendChild(x); }); }
  function scan() { if (!document.getElementById('sn-css')) { var st = document.createElement('style'); st.id = 'sn-css'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); } document.querySelectorAll('[data-suite-nav]').forEach(function (el) { if (!document.querySelector('header.sn')) build(el); else el.remove(); }); adopt(); }
  var pending = null, api = {
    items: ITEMS,
    status: function (text, tone) { var s = document.querySelector('header.sn .sn-st'); if (!s) { pending = [text, tone]; return; } s.className = 'sn-st' + (text ? ' on' : '') + (tone ? ' ' + tone : ''); s.querySelector('b').textContent = text || ''; s.title = text || ''; }
  };
  window.SuiteNav = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  new MutationObserver(function () { if (document.querySelector('[data-suite-nav]') || document.querySelector('[data-nav-extra]:not(.sn-extra *)')) scan(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
