(function () {
  var K = 'saltline.theme', d = document.documentElement;
  try { if (!localStorage.getItem('saltline.themeV2')) { localStorage.setItem(K, 'light'); localStorage.setItem('saltline.themeV2', '1'); } } catch (e) {}
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function mode() { try { return localStorage.getItem(K) || 'light'; } catch (e) { return 'light'; } }
  function apply() {
    var m = mode(), t = m === 'system' ? (mq.matches ? 'dark' : 'light') : m;
    d.dataset.theme = t; d.dataset.themeMode = m;
    var lab = { light: 'Light', dark: 'Dark', system: 'Auto' }[m] || 'Light', ic = m === 'system' ? 'circle-half' : t === 'dark' ? 'moon' : 'sun';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.innerHTML = '<i class="ph ph-' + ic + '"></i><span>' + lab + '</span>'; b.title = 'Theme: ' + lab + ' — click to switch'; });
  }
  apply();
  mq.addEventListener && mq.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]'); if (!b) return;
    var o = ['light', 'dark', 'system'], m = mode();
    try { localStorage.setItem(K, o[(o.indexOf(m) + 1) % 3]); } catch (err) {}
    apply(); window.dispatchEvent(new Event('themechange'));
  });
  window.addEventListener('storage', function (e) { if (e.key === K) apply(); });
})();
