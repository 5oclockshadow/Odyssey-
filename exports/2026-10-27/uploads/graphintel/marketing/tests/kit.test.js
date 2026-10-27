// QA/QC suite for the Studio kit. Run: cd marketing/tests && npm ci && npm test
// Needs only Node 20+ and jsdom. It builds every brief, structure, look, motion and navigation, and parses each result as a browser would.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const win = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', 'studio-kit.js'), 'utf8'))(win);
const K = win.SiteKit, parse = (html) => new JSDOM(html).window.document;

function inspect(html, S, tag) {
  const d = parse(html);
  assert.ok(html.length < 450000, `${tag}: page is ${html.length} bytes`);
  assert.ok(d.getElementById('app'), `${tag}: #app missing`);
  assert.equal(d.querySelectorAll('[onerror],[onload],img').length, 0, `${tag}: injected element or handler`);
  d.querySelectorAll('script').forEach(s => {
    if (s.src) assert.match(s.src, /cdn\.jsdelivr\.net\/npm\/three@/, `${tag}: foreign script ${s.src}`);
    else assert.doesNotThrow(() => new Function(s.textContent), `${tag}: inline script does not compile`);
  });
  if (!/script|style|title/i.test(S.name)) assert.equal(d.title.replace(/\s+/g, ' ').trim(), String(S.name).replace(/\s+/g, ' ').trim(), `${tag}: title`);
  else if (/<\/title>/i.test(S.name)) assert.equal(d.querySelectorAll('title').length, 1, `${tag}: title element split`);
}

test('50 stress briefs: 24 samples each, thumbnail and full, all build and are safe', () => {
  assert.equal(K.STRESS.length, 50);
  K.STRESS.forEach(([name, brief], bi) => {
    const specs = K.plan(brief, name, 24, 5); assert.equal(specs.length, 24);
    specs.forEach((s, si) => [false, true].forEach(th => inspect(K.build(s, { thumb: th }), s, `brief ${bi + 1} sample ${si + 1} ${K.ARCHS[s.arch]} ${th ? 'thumb' : 'full'}`)));
  });
});

test('every structure x look x motion x navigation survives hostile text', () => {
  const nasty = K.plan('<img src=x onerror=alert(1)> Hello. "q" \'s\' ${x} </script>', '</title><script>alert(1)</script>', 1, 0)[0];
  for (let a = 0; a < 12; a++) for (let l = 0; l < 8; l++) for (const m of K.MOTIFS) for (const n of K.NAVS)
    inspect(K.build({ ...nasty, arch: a, look: l, motif: m, nav: n }), nasty, `arch ${a} look ${l} ${m} ${n}`);
});

test('12 samples use 12 different structures; 50 samples are at least 90% unique designs', () => {
  assert.equal(new Set(K.plan('A coffee roaster. Small batches.', 'Harbor', 12, 3).map(s => s.arch)).size, 12);
  const p = K.plan('A coffee roaster. Small batches.', 'Harbor', 50, 3);
  assert.ok(new Set(p.map(s => [s.arch, s.look, s.motif, s.nav, s.pal, s.font].join())).size >= 45);
});

test('planner is deterministic and tolerates empty input', () => {
  assert.deepEqual(K.plan('a.', 'b', 9, 4), K.plan('a.', 'b', 9, 4));
  for (const v of ['', ' ', null, undefined]) K.plan(v, v, 3, 0).forEach(s => K.build(s, { thumb: true }));
});

test('name and brief steer structure and look', () => {
  [['A CLI tool for developers', 2], ['newspaper editorial journal', 7], ['api documentation manual', 10], ['poster brand campaign', 6], ['portfolio gallery photos', 4], ['launch waitlist teaser', 8]]
    .forEach(([b, a]) => assert.equal(K.plan(b, 'X', 12, 1)[0].arch, a, b));
  [['raw brutal punk', 1], ['premium luxury glass', 2], ['retro arcade neon', 6], ['fun kids playful', 7]]
    .forEach(([b, l]) => assert.ok(K.plan(b, 'X', 12, 1).slice(0, 2).some(s => s.look === l), b));
});

test('every palette meets contrast: text 7:1, muted text 4.5:1, button label 4.5:1', () => {
  K.PAL.forEach(([n, bg, fg, ac]) => {
    const on = K.cr(fg, ac) > K.cr(bg, ac) ? fg : bg;
    assert.ok(K.cr(bg, fg) >= 7, `${n} text`); assert.ok(K.cr(bg, K.mix(bg, fg, .78)) >= 4.5, `${n} muted`); assert.ok(K.cr(on, ac) >= 4.5, `${n} button`);
  });
});
