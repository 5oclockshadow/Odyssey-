/* RepoFactory: how TESTER packages the institute's hundred repos. pack() turns a registry entry and the sources it names into a
   repo's files; bar() checks files against the release bar; zip() bundles them. Finding and Hypothesis are SEXTANT's to write: the
   factory leaves them empty on purpose, so the bar fails until they are written. window.RepoFactory; no build step. */
(function factoryMain() {
  'use strict';
  var F = {};
  F.config = { site: 'http://localhost/', graph: 'http://localhost/#/graph', org: 'anima', year: 2026,
    needsOwner: ['Set the public domain: links.site and links.graph in repos/registry.json (or INSTITUTE_SITE / INSTITUTE_GRAPH in the container). TESTER rewrites every README on the next round.', 'Confirm the GitHub organisation for anima/<name>.'] };
  F.module = function (e) { return e.id.replace(/[^a-z0-9]+/g, '_'); };
  var MIT = ['MIT License', '', 'Copyright (c) YEAR The Threshold Institute (working name)', '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:', '',
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.', '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.', ''].join('\n');
  F.licence = function () { return MIT.replace('YEAR', F.config.year); };
  F.readme = function (e, s) {
    s = s || {}; var c = F.config, L = [];
    L.push('# ' + e.name, '', e.what, '', 'One of the hundred repos from one seeded brain at [The Threshold Institute](' + c.site + '). ' + e.cat + ' · wave W' + e.wave + ' · ' + e.line + '.', '');
    L.push('## Finding', '', s.finding || '', '', '## Hypothesis', '', s.hypothesis || '', '');
    L.push('## Quickstart', '', '```', 'docker compose up', '```', '', 'Without docker:', '', '```', s.local || (e.lang === 'js' ? 'node --test && node examples/serve.mjs' : 'pip install -r requirements.txt -e . && python examples/quickstart.py'), '```', '');
    if (s.use) L.push('## Use', '', s.use, '');
    L.push('## Tests', '', (e.lang === 'js' ? '`node --test`' : '`pytest -q`') + ' runs everything with no network and no model.', '');
    L.push('## Links', '', '- The institute: ' + c.site, '- The public graph: ' + c.graph);
    (e.sources || []).forEach(function (p) { L.push('- Packaged from `' + p + '` in the institute repository'); });
    (e.research || []).forEach(function (p) { L.push('- Research: `' + p + '`'); });
    L.push('', '## Licence', '', 'MIT. See LICENSE.', '');
    return L.join('\n');
  };
  F.compose = function (e) { return e.lang === 'js' ? 'services:\n  quickstart:\n    build: .\n    ports: ["8080:8080"]\n' : 'services:\n  quickstart:\n    build: .\n    command: python examples/quickstart.py\n'; };
  F.dockerfile = function (e, o) {
    o = o || {};
    if (e.lang === 'js') return 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nEXPOSE 8080\nCMD ["node", "examples/serve.mjs"]\n';
    return 'FROM python:3.12-slim\n' + (o.git ? 'RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*\n' : '') + 'WORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir --no-deps .\nCMD ["python", "examples/quickstart.py"]\n';
  };
  F.ci = function (e) {
    var head = 'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
    if (e.lang === 'js') return head + '      - uses: actions/setup-node@v4\n        with: { node-version: "22" }\n      - run: node --test\n';
    return head + '      - uses: actions/setup-python@v5\n        with: { python-version: "3.12" }\n      - run: pip install -r requirements.txt -r requirements-dev.txt && pip install --no-deps -e .\n      - run: pytest -q\n      - run: timeout 60 python examples/quickstart.py\n';
  };
  F.pyproject = function (e, deps, scripts) {
    var m = F.module(e), L = ['[build-system]', 'requires = ["setuptools==75.6.0"]', 'build-backend = "setuptools.build_meta"', '', '[project]', 'name = "anima-' + e.id.replace(/^anima-/, '') + '"', 'version = "0.1.0"',
      'description = ' + JSON.stringify(e.what), 'readme = "README.md"', 'license = { text = "MIT" }', 'requires-python = ">=3.10"', 'dependencies = [' + (deps || []).map(function (d) { return JSON.stringify(d); }).join(', ') + ']', ''];
    if (scripts) { L.push('[project.scripts]'); Object.keys(scripts).forEach(function (k) { L.push(k + ' = ' + JSON.stringify(scripts[k])); }); L.push(''); }
    L.push('[tool.setuptools]', 'packages = ["' + m + '"]', '');
    return L.join('\n');
  };
  F.conftest = '"""Run the tests from a fresh checkout: the package sits one folder up."""\nimport sys\nfrom pathlib import Path\n\nsys.path.insert(0, str(Path(__file__).resolve().parents[1]))\n';
  F.serve = "import { createServer } from 'node:http';\nimport { readFile } from 'node:fs/promises';\nimport { extname, join, normalize } from 'node:path';\n\nconst root = new URL('..', import.meta.url).pathname, types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };\ncreateServer(async (req, res) => {\n  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([.][.][/\\\\])+/, '');\n  try { const body = await readFile(join(root, path === '/' ? 'examples/quickstart.html' : path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html' }); res.end(body); }\n  catch { res.writeHead(404); res.end('not found'); }\n}).listen(8080, () => console.log('http://localhost:8080'));\n";
  F.brief = function (e) {
    var m = F.module(e);
    return ['# Brief for SEXTANT: ' + e.name, '', '**What:** ' + e.what, '', '**From:** ' + e.from + ((e.research || []).length ? ' (' + e.research.join(', ') + ')' : ''), '', '**Line · wave · category:** ' + e.line + ' · W' + e.wave + ' · ' + e.cat, '',
      'Write, in this folder:', '',
      '1. The code: ' + (e.lang === 'js' ? 'an ES module in `src/`' : 'a standalone Python package `' + m + '/`') + ' that does what the line above says, importing nothing from the institute engine.',
      '2. `tests/` that run with no network and no model, and pass.',
      '3. `examples/quickstart.' + (e.lang === 'js' ? 'html' : 'py') + '` that runs in under 60 seconds and shows the finding.',
      '4. `## Finding` and `## Hypothesis` in README.md from the research it comes from, with the falsifier.', '',
      'TESTER runs the bar after every write and sends back what fails. The repo ships when all six checks pass and the owner approves.', ''].join('\n');
  };
  F.pack = function (e, src) {
    src = src || {}; var files = {}, m = F.module(e);
    files['LICENSE'] = F.licence(); files['docker-compose.yml'] = F.compose(e); files['Dockerfile'] = F.dockerfile(e); files['.github/workflows/ci.yml'] = F.ci(e); files['README.md'] = F.readme(e, {});
    var have = (e.sources || []).filter(function (p) { return src[p] != null; });
    if (!have.length) { files['BRIEF.md'] = F.brief(e); return files; }
    if (e.lang === 'js') {
      files['package.json'] = JSON.stringify({ name: '@anima/' + e.id, version: '0.1.0', description: e.what, license: 'MIT', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n';
      var js = [];
      have.forEach(function (p) { var b = p.split('/').pop(); files['src/' + b] = src[p]; if (/\.m?js$/.test(b)) js.push(b); });
      files['examples/serve.mjs'] = F.serve;
      if (js.length) files['tests/smoke.test.mjs'] = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\n\nfor (const name of " + JSON.stringify(js) + ") {\n  test(name + ' parses', async () => {\n    const src = await readFile(new URL('../src/' + name, import.meta.url), 'utf8');\n    assert.doesNotThrow(() => new Function(src));\n  });\n}\n";
      return files;
    }
    files['requirements.txt'] = '# pinned runtime dependencies; TESTER adds what the packaged source imports\n';
    files['requirements-dev.txt'] = 'pytest==8.3.3\n';
    files['pyproject.toml'] = F.pyproject(e, []);
    var names = [];
    have.forEach(function (p) { var b = p.split('/').pop(); if (/\.py$/.test(b)) { files[m + '/' + b] = src[p]; names.push(b.replace(/\.py$/, '')); } else files[m + '/data/' + b] = src[p]; });
    files[m + '/__init__.py'] = '"""' + e.name + ': ' + e.what.replace(/"/g, "'") + '"""\n__version__ = "0.1.0"\n';
    files['tests/conftest.py'] = F.conftest;
    files['tests/test_smoke.py'] = 'import importlib\n\nimport pytest\n\n\n@pytest.mark.parametrize("name", ' + JSON.stringify(names) + ')\ndef test_module_imports_standalone(name):\n    importlib.import_module("' + m + '." + name)\n';
    return files;
  };
  F.BAN_PY = /^\s*(import|from)\s+(requests|httpx|urllib3?|socket|aiohttp|anthropic|openai|websockets?)\b/m;
  F.BAN_JS = /\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\(|from\s+['"]node:(https?|net|dgram)['"]/;
  F.SECRETS = [/anma_[0-9a-f]{32}/, /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{36}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/];
  F.PLACEHOLDER = /\b(TODO|TBD|lorem|placeholder|coming soon)\b/i;
  // The same reply format and rules as factory.py's REPLY_FORMAT and take_files: an agent's `--- file:` blocks become files.
  F.REPLY = 'Reply with each file you write or change as a block: a line `--- file: <path inside the repo>`, the whole file, then a line `--- end`. TESTER lays the blocks over its own copy and re-tests on the next round; nothing reaches the repository until the bar passes.';
  F.take = function (text, cap, maxBytes) {
    cap = cap || 40; maxBytes = maxBytes || 400000;
    var re = /^--- file: *(\S+)[ \t]*\n([\s\S]*?)^--- end[ \t]*$/gm, out = {}, n = 0, total = 0, m, src = String(text || '');
    while ((m = re.exec(src)) !== null) {
      var rel = m[1].replace(/^[`'"]+|[`'"]+$/g, ''), body = m[2], parts = rel.split('/');
      var safe = /^[A-Za-z0-9_.@+\/-]+$/.test(rel) && parts.every(function (p, i) { return p && p !== '.' && p !== '..' && (p.charAt(0) !== '.' || (i === 0 && p === '.github')); });
      if (!safe) continue;
      var lines = body.replace(/\n+$/, '').split('\n');
      if (lines.length >= 2 && /^```/.test(lines[0]) && lines[lines.length - 1].trim() === '```') body = lines.slice(1, -1).join('\n') + '\n';
      total += new TextEncoder().encode(body).length;
      if (n >= cap || total > maxBytes) break;
      out[rel] = body; n++;
    }
    return out;
  };
  // The links every README carries come from repos/registry.json, as they do for the container (where INSTITUTE_SITE overrides).
  F.configure = function (reg) { var l = (reg && reg.links) || {}; if (l.site) F.config.site = l.site; if (l.graph) F.config.graph = l.graph; return F.config; };
  F.section = function (md, h) { var lines = String(md || '').split('\n'), i = lines.indexOf('## ' + h), out = []; if (i < 0) return ''; for (var j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) out.push(lines[j]); return out.join('\n').trim(); };
  F.bar = function (files, e) {
    var names = Object.keys(files), py = e.lang !== 'js', out = [];
    var tests = names.filter(function (n) { return py ? /^tests\/test_[^/]+\.py$/.test(n) : /^tests?\/[^/]+\.test\.m?js$/.test(n); });
    var net = tests.filter(function (n) { return (py ? F.BAN_PY : F.BAN_JS).test(files[n]) || /dspy\.LM\(|anthropic\.|openai\./.test(files[n]); });
    var ci = files['.github/workflows/ci.yml'] || '';
    out.push({ id: 'tests', ok: tests.length > 0 && !net.length && (py ? /pytest/.test(ci) : /node --test/.test(ci)), why: !tests.length ? 'no tests yet' : net.length ? net[0] + ' reaches the network or a model' : !ci ? 'no CI workflow' : 'CI does not run the tests' });
    var comp = files['docker-compose.yml'] || '', svc = (comp.split('services:')[1] || '').split('\n').filter(function (l) { return /^  [A-Za-z0-9_.-]+:\s*$/.test(l); }).length;
    out.push({ id: 'compose', ok: svc === 1 && !!files['Dockerfile'], why: !comp ? 'no docker-compose.yml' : svc !== 1 ? svc + ' services; one line should start one' : 'no Dockerfile' });
    var rd = files['README.md'] || '', fi = F.section(rd, 'Finding'), hy = F.section(rd, 'Hypothesis');
    out.push({ id: 'readme', ok: fi.length >= 60 && hy.length >= 60 && !F.PLACEHOLDER.test(fi + hy), why: !rd ? 'no README' : fi.length < 60 ? 'Finding not written yet (SEXTANT)' : hy.length < 60 ? 'Hypothesis not written yet (SEXTANT)' : 'placeholder text in Finding or Hypothesis' });
    var secret = null; names.forEach(function (n) { if (!secret && F.SECRETS.some(function (re) { return re.test(files[n]); })) secret = n; });
    var req = (files['requirements.txt'] || '').split('\n').map(function (l) { return l.replace(/#.*/, '').trim(); }).filter(Boolean);
    var unpinned = req.filter(function (l) { return !/==\d|@\s*git\+\S+@v?[\w.-]+$/.test(l); });
    var pkg = {}; try { pkg = files['package.json'] ? JSON.parse(files['package.json']) : {}; } catch (x) { pkg = { bad: true }; }
    var deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {}), loose = Object.keys(deps).filter(function (k) { return !/^\d+\.\d+\.\d+$/.test(deps[k]); });
    out.push({ id: 'hygiene', ok: !!files['LICENSE'] && !secret && !unpinned.length && !loose.length && !pkg.bad, why: !files['LICENSE'] ? 'no LICENSE' : secret ? 'a key-shaped string in ' + secret : unpinned.length ? 'unpinned: ' + unpinned[0] : loose.length ? 'unpinned: ' + loose[0] : 'package.json does not parse' });
    out.push({ id: 'example', ok: names.some(function (n) { return /^examples\/quickstart\.(py|m?js|html)$/.test(n); }), why: 'no examples/quickstart yet' });
    out.push({ id: 'links', ok: rd.indexOf(F.config.site) >= 0 && rd.indexOf(F.config.graph) >= 0, why: 'README does not link the site and the public graph' });
    out.forEach(function (c) { if (c.ok) c.why = ''; });
    return out;
  };
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  F.crc32 = function (b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  F.zip = function (files, prefix) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0, keys = Object.keys(files).sort();
    keys.forEach(function (name) {
      var path = enc.encode((prefix ? prefix + '/' : '') + name), data = enc.encode(files[name]), crc = F.crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, path.length, true);
      parts.push(new Uint8Array(h.buffer), path, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, path.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), path);
      off += 30 + path.length + data.length;
    });
    var size = central.reduce(function (s, p) { return s + p.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, keys.length, true); e.setUint16(10, keys.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  };
  window.RepoFactory = F;
})();
