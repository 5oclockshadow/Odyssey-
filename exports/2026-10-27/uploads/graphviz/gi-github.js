/* gi-github.js — LIVE GitHub research engine (no mock data).
   Runs in the browser. The research agent's main job: scour real repos,
   pull real source over the raw CDN, parse symbols, map them onto the
   knowledge-graph vocabulary, and gate-test the edges those real files
   imply. Everything shown here was fetched at runtime.

   Rate budget: api.github.com is 60 req/hr unauthenticated and is used
   ONLY to walk a repo's file tree (1 call/repo, cached in localStorage
   for 7 days). File contents come from raw.githubusercontent.com — a CDN
   with no rate limit — so pulling and re-pulling source is free.
   Every source, doc and notebook file of every repo is queued (no top-N
   cut), pulled 8 at a time round-robin across repos, most relevant first. */
(function () {
  'use strict';
  var API = 'https://api.github.com', RAW = 'https://raw.githubusercontent.com', LS = 'gi-gh-tree-v2:';
  var BATCH = 8, KEEP = 60, FAST = 320;
  var DAY = 86400000;

  function ts() { return new Date().toTimeString().slice(0, 8); }
  function lsGet(k) { try { var j = JSON.parse(localStorage.getItem(LS + k)); if (j && Date.now() - j.t < 7 * DAY) return j; } catch (e) {} return null; }
  function lsSet(k, v) { try { v.t = Date.now(); localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }

  /* domain-relevant repos — each maps to real concepts already in the graph */
  var REPOS = [
    { o: 'stanfordnlp', r: 'dspy', topic: 'DSPy modules, signatures, optimizers', tags: ['DSPy', 'Signature', 'Module', 'Predict', 'ChainOfThought', 'ReAct module', 'Optimizer', 'Metric', 'BootstrapFewShot', 'MIPROv2', 'RAG'], fallback: ['dspy/predict/predict.py', 'dspy/predict/react.py', 'dspy/predict/chain_of_thought.py', 'dspy/signatures/signature.py', 'dspy/teleprompt/bootstrap.py'] },
    { o: 'microsoft', r: 'graphrag', topic: 'graph-structured RAG: entities + community summaries', tags: ['GraphRAG', 'Knowledge graph', 'Community summary', 'Entity extraction', 'Text unit', 'Leiden algorithm', 'Community detection', 'RAG'], fallback: ['README.md'] },
    { o: 'OSU-NLP-Group', r: 'HippoRAG', topic: 'spreading activation over a KG with personalized PageRank', tags: ['HippoRAG', 'PageRank', 'Knowledge graph', 'Associative memory', 'RAG', 'Spreading activation'], fallback: ['README.md'] },
    { o: 'networkx', r: 'networkx', topic: 'graph algorithms: centrality, communities, paths', tags: ['Graph', 'Centrality', 'PageRank', 'Community detection', 'Modularity', 'Path', 'Degree', 'Adjacency matrix', 'Clustering coefficient', 'Link prediction', 'Preferential attachment', 'Small world'], fallback: ['networkx/algorithms/link_analysis/pagerank_alg.py', 'networkx/algorithms/community/louvain.py'] },
    { o: 'pyg-team', r: 'pytorch_geometric', topic: 'graph neural networks & message passing', tags: ['Graph neural network', 'Message passing', 'node2vec', 'DeepWalk', 'Node', 'Edge'], fallback: ['torch_geometric/nn/conv/message_passing.py'] },
    { o: 'facebookresearch', r: 'faiss', topic: 'similarity search / kNN over dense vectors', tags: ['kNN graph', 'HNSW index', 'Embedding'], fallback: ['README.md'] },
    { o: 'karpathy', r: 'nanoGPT', topic: 'a small readable GPT: attention + training loop', tags: ['Attention', 'Transformer', 'Neural network', 'Metric'], fallback: ['model.py', 'train.py'] },
    { o: 'karpathy', r: 'micrograd', topic: 'reverse-mode autodiff over a graph of Value nodes', tags: ['Backpropagation', 'Neural network', 'Node', 'Hebbian learning', 'Message passing'], fallback: ['micrograd/engine.py', 'micrograd/nn.py'] },
    { o: 'karpathy', r: 'makemore', topic: 'char-level models: bigram counts up to an MLP', tags: ['Word2vec', 'Embedding', 'Neural network', 'node2vec'], fallback: ['makemore.py'] },
    { o: 'sapientinc', r: 'HRM', topic: 'Hierarchical Reasoning Model — latent multi-step reasoning', tags: ['ReAct', 'Planning', 'Reflexion', 'Neural network', 'Transformer', 'Attention', 'Memory', 'Trace', 'Backpropagation'], fallback: ['README.md'] },
    { o: 'HKUDS', r: 'LightRAG', topic: 'simple & fast graph-based RAG', tags: ['GraphRAG', 'Knowledge graph', 'RAG', 'Entity extraction', 'Community summary', 'Embedding'], fallback: ['README.md'] },
    { o: 'run-llama', r: 'llama_index', topic: 'data framework for RAG over your data', tags: ['RAG', 'Embedding', 'Knowledge graph', 'kNN graph', 'HNSW index', 'Entity extraction', 'Transformer'], fallback: ['README.md'] },
    { o: 'langchain-ai', r: 'langchain', topic: 'framework for agents & tool use over LLMs', tags: ['Agent', 'Tool use', 'ReAct', 'RAG', 'Memory', 'Planning', 'Reflexion'], fallback: ['README.md'] }
  ];

  /* words too generic to match inside file bodies (still matchable via tags/symbols) */
  var COMMON = 'graph node edge path agent trace memory layer degree module metric simplex triple snapshot churn planning tool use'.split(' ').reduce(function (o, w) { o[w] = 1; return o; }, {});

  var KW = ['retriev', 'rank', 'pagerank', 'graph', 'embed', 'vector', 'hnsw', 'faiss', 'attention', 'transform', 'walk', 'node2vec', 'deepwalk', 'hyper', 'message', 'passing', 'communit', 'leiden', 'modular', 'central', 'signature', 'module', 'predict', 'react', 'optim', 'metric', 'bootstrap', 'mipro', 'agent', 'knn', 'rag', 'entity', 'summary', 'backprop', 'neuron', 'hebb', 'index', 'search', 'chain'];

  /* every source, doc and notebook file, ordered by relevance; never cut to a top-N sample */
  var SRC_EXT = /\.(py|pyi|ipynb|js|mjs|cjs|ts|tsx|jsx|md|mdx|rst|c|cc|cpp|cxx|h|hpp|cu|cuh|java|kt|scala|go|rs|rb|jl|lua|php|cs|swift|r|sh)$/i;
  var SKIP_DIR = /(^|\/)(node_modules|dist|build|vendor|third_party|site-packages|__pycache__|\.venv|venv|\.git|coverage|\.next)\//i;
  var SKIP_FILE = /\.min\.|\.bundle\.|-lock\.|\.lock$/i;
  function eligible(e) { return e.type === 'blob' && SRC_EXT.test(e.path) && !SKIP_DIR.test(e.path) && !SKIP_FILE.test(e.path) && (e.size == null || e.size < 400000); }
  function scoreFiles(repo, tree) {
    var files = tree.filter(eligible);
    files.forEach(function (f) {
      var p = f.path.toLowerCase(); f._s = 0;
      KW.forEach(function (k) { if (p.indexOf(k) >= 0) f._s += 2; });
      (repo.tags || []).forEach(function (t) { if (p.indexOf(t.toLowerCase().split(' ')[0]) >= 0) f._s += 3; });
      if (/\.py$/.test(p)) f._s += 1;
      if (/readme/.test(p)) f._s += 4;
      if (/(^|\/)(tests?|testing)\/|test_|_test\.|\.test\.|\.spec\./.test(p)) f._s -= 3;
      if (/(^|\/)(docs?|examples?|benchmarks?|scripts?)\//.test(p)) f._s -= 1;
      f._s -= Math.min(2, p.split('/').length * 0.25);
    });
    files.sort(function (a, b) { return b._s - a._s || (a.path < b.path ? -1 : 1); });
    return files.map(function (f) { return f.path; });
  }
  function packTree(tree) {
    var fs = tree.filter(eligible).map(function (e) { return [e.path, e.size || 0]; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }), prev = '', out = [];
    fs.forEach(function (f) { var p = f[0], k = 0, m = Math.min(p.length, prev.length); while (k < m && p.charCodeAt(k) === prev.charCodeAt(k)) k++; out.push(k + ':' + f[1] + ':' + p.slice(k)); prev = p; });
    return out.join('\n');
  }
  function unpackTree(s) {
    var prev = '', out = [];
    (s || '').split('\n').forEach(function (ln) { if (!ln) return; var a = ln.indexOf(':'), b = ln.indexOf(':', a + 1), p = prev.slice(0, +ln.slice(0, a)) + ln.slice(b + 1); out.push({ type: 'blob', path: p, size: +ln.slice(a + 1, b) }); prev = p; });
    return out;
  }

  function symbolsFor(path, text) {
    var out = [], m, re;
    if (/\.ipynb$/i.test(path)) { try { var nb = JSON.parse(text); text = (nb.cells || []).map(function (c) { return [].concat(c.source || []).join(''); }).join('\n'); path += '.py'; } catch (e) {} }
    if (/\.pyi?$/.test(path)) { re = /^[ \t]*(?:class|def|async[ \t]+def)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/gm; while ((m = re.exec(text)) && out.length < 80) out.push(m[1]); }
    else if (/\.(js|mjs|cjs|ts|jsx|tsx)$/.test(path)) { re = /\b(?:class|function|interface)[ \t]+([A-Za-z_$][\w$]*)/g; while ((m = re.exec(text)) && out.length < 80) out.push(m[1]); }
    else if (/\.(c|cc|cpp|cxx|h|hpp|cu|cuh|java|kt|scala|go|rs|rb|jl|lua|php|cs|swift|r|sh)$/i.test(path)) { re = /\b(?:class|struct|interface|trait|enum|impl|fn|func|def|function|module)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/g; while ((m = re.exec(text)) && out.length < 80) out.push(m[1]); }
    else { re = /^#{1,3}[ \t]+(.{3,60})$/gm; while ((m = re.exec(text)) && out.length < 40) out.push(m[1].replace(/[#*`]/g, '').trim()); }
    var seen = {}; return out.filter(function (s) { if (!s || seen[s]) return false; seen[s] = 1; return true; });
  }

  function mapNodes(core, repo, path, text, syms) {
    var hits = {};
    (repo.tags || []).forEach(function (t) { var i = core.find ? core.find(t) : -1; if (i >= 0) hits[i] = 3; });
    var sh = (path + ' ' + syms.join(' ')).toLowerCase();
    core._ghMatchers.forEach(function (mm) {
      if (hits[mm.i]) return;
      if (mm.name.length > 4 && sh.indexOf(mm.name) >= 0) hits[mm.i] = 2;
      else if (mm.toks.length >= 2 && mm.toks.every(function (tk) { return sh.indexOf(tk) >= 0; })) hits[mm.i] = 2;
    });
    var body = text.slice(0, 6000).toLowerCase();
    core._ghMatchers.forEach(function (mm) { if (hits[mm.i] || mm.common) return; if (mm.name.length > 6 && body.indexOf(mm.name) >= 0) hits[mm.i] = 1; });
    return Object.keys(hits).map(Number).sort(function (a, b) { return hits[b] - hits[a]; }).slice(0, 10);
  }

  function attach(core) {
    if (core.gh) return core.gh;
    core._ghMatchers = core.N.map(function (d, i) {
      var nm = d.name.toLowerCase(), toks = nm.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3; });
      return { i: i, name: nm, toks: toks, common: !!COMMON[nm] };
    });
    var repos = REPOS.concat((window.GI_DOMAINS && window.GI_DOMAINS.repos) || []).map(function (r) { return { o: r.o, r: r.r, slug: r.o + '/' + r.r, topic: r.topic, tags: r.tags, branch: null, paths: null, pull: 0, scoured: false, fallback: r.fallback || [], retry: [] }; });
    try { JSON.parse(localStorage.getItem('gi-gh-added-v1') || '[]').forEach(function (a) { if (!a || !a.slug || repos.some(function (r) { return r.slug.toLowerCase() === a.slug.toLowerCase(); })) return; var p = a.slug.split('/'); repos.unshift({ o: p[0], r: p[1], slug: a.slug, topic: a.topic || 'added on request', tags: a.tags || [], branch: a.branch || null, paths: null, pull: 0, scoured: false, fallback: ['README.md'], retry: [], added: a.by || 'you', stars: a.stars }); }); } catch (e) {}
    var gh = core.gh = { _core: core, repos: repos, feed: [], sources: {}, order: [], stats: { scoured: 0, pulled: 0, bytes: 0, symbols: 0, linked: 0, attempts: 0, read: 0, total: 0, failed: 0 }, phase: 'idle', busy: false, rate: null, rateLimited: false, done: false, lastEvt: null, timer: null };

    function emit(kind, repo, path, msg, src) {
      var ev = { t: ts(), kind: kind, slug: repo ? repo.slug : '', path: path || '', msg: msg, src: src || null };
      gh.lastEvt = ev; gh.feed.unshift(ev); if (gh.feed.length > 80) gh.feed.pop();
      core.log((kind === 'learn' || kind === 'comprehend') ? 'research' : 'github', (repo ? repo.slug + (path ? '/' + path : '') + ' · ' : '') + msg);
    }
    gh.emit = emit;

    async function scour(repo) {
      gh.phase = 'scour'; emit('scour', repo, null, 'scouring file tree…');
      var cached = lsGet('tree:' + repo.slug);
      if (cached && cached.packed) { repo.branch = cached.branch; repo.paths = scoreFiles(repo, unpackTree(cached.packed)); emit('scour', repo, null, 'tree cache hit · ' + repo.paths.length + ' files · walked ' + Math.round((Date.now() - cached.t) / 3600000) + 'h ago'); }
      else {
        var branches = repo.branch && repo.branch !== 'main' && repo.branch !== 'master' ? [repo.branch, 'main', 'master'] : ['main', 'master'];
        for (var bi = 0; bi < branches.length && !(repo.paths && repo.paths.length); bi++) {
          try {
            var res = await fetch(API + '/repos/' + repo.slug + '/git/trees/' + branches[bi] + '?recursive=1');
            var rem = res.headers.get('x-ratelimit-remaining'); if (rem != null) gh.rate = +rem;
            if (res.status === 403) { gh.rateLimited = true; continue; }
            if (!res.ok) continue;
            var j = await res.json(); repo.branch = branches[bi]; repo.paths = scoreFiles(repo, j.tree || []);
            lsSet('tree:' + repo.slug, { branch: repo.branch, packed: packTree(j.tree || []) });
            emit('scour', repo, null, 'walked ' + (j.tree || []).length + ' tree entries on ' + repo.branch + (j.truncated ? ' (GitHub truncated the tree)' : '') + ' → ' + repo.paths.length + ' source / doc / notebook files');
          } catch (e) {}
        }
      }
      if (!repo.paths || !repo.paths.length) {
        for (var bj = 0; bj < 2 && !(repo.paths && repo.paths.length); bj++) {
          try {
            var br = ['main', 'master'][bj], jr = await fetch('https://data.jsdelivr.com/v1/packages/gh/' + repo.slug + '@' + br + '?structure=flat');
            if (!jr.ok) continue;
            var jj = await jr.json(), list = (jj.files || []).map(function (f) { return { type: 'blob', path: String(f.name || '').replace(/^\//, ''), size: f.size }; });
            if (!list.length) continue;
            repo.branch = br; repo.paths = scoreFiles(repo, list); repo.via = 'jsdelivr';
            lsSet('tree:' + repo.slug, { branch: br, packed: packTree(list) });
            emit('scour', repo, null, 'GitHub API unavailable — listed ' + list.length + ' files through the jsDelivr mirror on ' + br + ' → ' + repo.paths.length + ' source / doc / notebook files');
          } catch (e) {}
        }
      }
      if (!repo.paths || !repo.paths.length) { repo.branch = repo.branch || 'main'; repo.paths = (repo.fallback || []).slice(); if (gh.rateLimited) emit('rate', repo, null, 'api rate-limited — using curated paths over the CDN'); }
      repo.scoured = true; gh.stats.scoured++;
      gh.stats.total += repo.paths.length;
      emit('scour', repo, null, repo.paths.length + ' files queued, every one of them · queue now ' + gh.stats.total + (gh.rate != null ? ' · api ' + gh.rate + '/60' : ''));
    }

    function nextBatch(k) {
      var live = gh.repos.filter(function (r) { return r.paths && (r.pull < r.paths.length || (r.retry && r.retry.length)); }), out = [], guard = 0;
      var pri = live.filter(function (r) { return r.priority; }); if (pri.length) live = pri;
      while (live.length && out.length < k && guard++ < k * live.length + 4) {
        var r = live[(gh.rr = (gh.rr || 0) + 1) % live.length], rq = r.retry || (r.retry = []);
        if (rq.length) out.push([r, rq.shift()]); else if (r.pull < r.paths.length) out.push([r, r.paths[r.pull++]]);
      }
      return out;
    }
    gh.pending = function () { return gh.repos.some(function (r) { return r.paths && (r.pull < r.paths.length || (r.retry && r.retry.length)); }); };
    async function pullBatch(batch) {
      gh.phase = 'pull';
      emit('pull', batch[0][0], null, 'pulling ' + batch.length + ' files in parallel over the raw CDN (' + gh.stats.pulled + '/' + gh.stats.total + ' done): ' + batch.map(function (b) { return b[0].r + '/' + b[1].split('/').pop(); }).join(', '));
      await Promise.all(batch.map(function (b) { return pullOne(b[0], b[1]); }));
    }
    async function pullOne(repo, path) {
      var text = '', status = 0, t0 = performance.now();
      try { var res = await fetch(RAW + '/' + repo.slug + '/' + repo.branch + '/' + path); status = res.status; if (res.ok) text = await res.text(); } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 0); });
      if (status === 429 || status === 403) { (repo.retry || (repo.retry = [])).push(path); gh.backoff = Date.now() + 60000; emit('rate', repo, path, 'CDN answered ' + status + ' — backing off 60s, file re-queued'); return; }
      if (!text) { gh.stats.failed++; emit('err', repo, path, 'HTTP ' + (status || 'network error') + ' — skipping'); return; }
      ingest(repo, path, text, performance.now() - t0);
    }
    function ingest(repo, path, text, ms) {
      gh.phase = 'ingest';
      var syms = symbolsFor(path, text), nodes = mapNodes(core, repo, path, text, syms);
      var key = repo.slug + '/' + path;
      var src = { key: key, slug: repo.slug, path: path, bytes: text.length, lines: text.split('\n').length, symbols: syms.slice(0, 28), nodes: nodes, nodeNames: nodes.map(function (i) { return core.N[i].name; }), content: text.length > 60000 ? text.slice(0, 60000) + '\n\n… truncated …' : text, t: ts() };
      gh.sources[key] = src; gh.order.unshift(key); gh.stats.pulled++; gh.stats.bytes += text.length; gh.stats.symbols += syms.length;
      var old = gh.order.length > KEEP && gh.sources[gh.order[KEEP]];
      if (old && old.content) { old.content = null; old.symbols = old.symbols.slice(0, 8); }
      emit('ingest', repo, path, (text.length / 1024).toFixed(1) + 'kb · ' + src.lines + ' lines · ' + (ms ? Math.round(ms) + 'ms · ' : '') + syms.length + ' symbols' + (syms.length ? ' (' + syms.slice(0, 5).join(', ') + ')' : '') + ' · ' + nodes.length + ' concepts' + (nodes.length ? ' (' + src.nodeNames.slice(0, 5).join(', ') + ')' : '') + ' · ' + gh.stats.pulled + '/' + gh.stats.total, src);
    }

    function mineStep(k) { var n = 0; while (n < (k || 1) && mineOne()) n++; return n > 0; }
    function mineOne() {
      var I = core._int;
      for (var ki = 0; ki < gh.order.length; ki++) {
        var src = gh.sources[gh.order[ki]]; if (src._mined) continue;
        var ns = src.nodes || [];
        for (var a = 0; a < ns.length; a++) for (var b = a + 1; b < ns.length; b++) {
          var x = ns[a], y = ns[b];
          if (I.edgeIndex(x, y) != null || (I.tried && I.tried[I.k2(x, y)])) continue;
          gh.phase = 'gate'; gh.stats.attempts++; if (I.tried) I.tried[I.k2(x, y)] = 1;
          var v = core.commit({ op: 'add-edge', a: x, b: y, type: 'uses', src: 'github:' + src.slug });
          var ok = /accepted/.test(v); if (ok) gh.stats.linked++;
          emit('gate', { slug: src.slug }, src.path, 'mining ' + core.N[x].name + ' — ' + core.N[y].name + ' · ' + v);
          return true;
        }
        src._mined = true;
      }
      return false;
    }

    function pickComprehend() {
      for (var i = 0; i < gh.order.length; i++) { var s = gh.sources[gh.order[i]]; if (s && !s._read && s.content && s.nodes && s.nodes.length >= 3) return s; }
      return null;
    }
    async function comprehend(src) {
      gh.phase = 'comprehend'; src._read = true; gh.stats.read = (gh.stats.read || 0) + 1;
      var names = src.nodeNames;
      if (!(window.claude && window.claude.complete)) { emit('learn', { slug: src.slug }, src.path, 'read · ' + names.length + ' concepts (LM offline)', src); return; }
      emit('comprehend', { slug: src.slug }, src.path, 'reading the code to learn what it implements…', src);
      var prompt = 'You are a research agent reading a REAL source file to learn what it implements and how its concepts relate.\nFile: ' + src.slug + '/' + src.path + '\nConcepts it mentions (use these names EXACTLY): ' + names.join(', ') + '\nCode (truncated):\n' + src.content.slice(0, 1800) + '\n\nReturn ONLY JSON: {"capability":"one concise sentence on what this code does","links":[["ConceptA","uses","ConceptB"]]} — 0-3 links the code genuinely supports, each concept EXACTLY from the list above, relation "uses" or "analog".';
      try {
        var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out);
        src.capability = j.capability || ''; src.learned = [];
        emit('learn', { slug: src.slug }, src.path, 'learned: ' + (src.capability || '(no summary)'), src);
        (j.links || []).slice(0, 3).forEach(function (l) {
          var a = core.find(l[0]), b = core.find(l[2]); if (a < 0 || b < 0 || a === b) return;
          var I = core._int; if (I.edgeIndex(a, b) != null || (I.tried && I.tried[I.k2(a, b)])) return;
          I.tried[I.k2(a, b)] = 1; gh.stats.attempts++;
          var v = core.commit({ op: 'add-edge', a: a, b: b, type: (l[1] === 'analog' ? 'analog' : 'uses'), src: 'github:' + src.slug });
          var ok = /accepted/.test(v); if (ok) gh.stats.linked++;
          src.learned.push(core.N[a].name + ' —' + (l[1] || 'uses') + '→ ' + core.N[b].name + (ok ? ' ✓' : ' ✗'));
          emit('learn', { slug: src.slug }, src.path, 'code-grounded link ' + core.N[a].name + ' — ' + core.N[b].name + ' · ' + v);
        });
      } catch (e) { emit('err', { slug: src.slug }, src.path, 'comprehend failed'); }
    }

    gh.step = async function () {
      if (gh.busy || core._expBusy) return null; gh.busy = true;
      try {
        var canRead = !!(window.claude && window.claude.complete) && (gh.stats.read || 0) < 12;
        var unsc = gh.repos.filter(function (r) { return !r.scoured; });
        if (unsc.length) { for (var u = 0; u < unsc.length; u++) await scour(unsc[u]); return gh.lastEvt; }
        if (canRead && (gh.stats.read || 0) < Math.floor((gh.stats.pulled || 0) / 3)) { var cs = pickComprehend(); if (cs) { await comprehend(cs); return gh.lastEvt; } }
        if (Date.now() < (gh.backoff || 0)) { gh.phase = 'rate'; mineStep(3); return gh.lastEvt; }
        var batch = nextBatch(BATCH);
        if (batch.length) { await pullBatch(batch); mineStep(3); return gh.lastEvt; }
        if (canRead) { var c2 = pickComprehend(); if (c2) { await comprehend(c2); return gh.lastEvt; } }
        if (!mineStep(3)) { if (core.raptorStep && (!core.taxonomy || core.taxonomy.length < 16)) { await core.raptorStep(); return gh.lastEvt; } gh.phase = 'idle'; gh.done = true; }
        return gh.lastEvt;
      } catch (e) { emit('err', null, null, 'research error: ' + (e && e.message || e)); return null; }
      finally { gh.busy = false; }
    };
    gh.comprehendNext = async function () { var s = pickComprehend(); if (s) { await comprehend(s); } return s ? s.slug : null; };
    gh.discoverStarred = async function (user) {
      user = user || 'yetmens';
      try {
        var res = await fetch(API + '/users/' + encodeURIComponent(user) + '/starred?per_page=40&sort=updated');
        var rem = res.headers.get('x-ratelimit-remaining'); if (rem != null) gh.rate = +rem;
        if (!res.ok) { emit('scour', { slug: 'stars/' + user }, null, 'no stars for ' + user + ' (' + res.status + ')'); return 0; }
        var arr = await res.json(), added = 0, KWD = /graph|rag|retriev|embed|vector|agent|reason|dspy|knowledge|neural|transform|attention|gnn|network|\bllm\b|memory|rank|hyper|node2vec/i;
        (arr || []).forEach(function (repo) {
          var txt = (repo.full_name || '') + ' ' + (repo.description || '') + ' ' + (repo.language || '') + ' ' + ((repo.topics || []).join(' '));
          if (!KWD.test(txt)) return;
          if (gh.repos.some(function (r) { return r.slug === repo.full_name; })) return;
          gh.repos.push({ o: repo.owner.login, r: repo.name, slug: repo.full_name, topic: (repo.description || 'starred repo').slice(0, 80), tags: [], branch: repo.default_branch || null, paths: null, pull: 0, scoured: false, fallback: ['README.md'], starred: true });
          added++;
        });
        emit('scour', { slug: 'stars/' + user }, null, 'discovered ' + added + ' relevant repos from ' + user + '\u2019s stars (' + (arr ? arr.length : 0) + ' scanned)');
        return added;
      } catch (e) { return 0; }
    };
    /* user- or agent-added repos: resolve (owner/name, URL, or a bare name via GitHub search), queue first, persist */
    function saveAdded() { try { localStorage.setItem('gi-gh-added-v1', JSON.stringify(gh.repos.filter(function (r) { return r.added; }).map(function (r) { return { slug: r.slug, topic: r.topic, branch: r.branch, by: r.added, stars: r.stars, tags: r.tags }; }))); } catch (e) {} }
    gh.parseRepo = function (input) {
      var s = String(input || '').trim().replace(/^git@github\.com:/i, '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/[#?].*$/, '').replace(/\/(tree|blob)\/.*$/, '').replace(/\/+$/, '');
      var p = s.split('/').filter(Boolean);
      return p.length >= 2 ? { slug: p[0] + '/' + p[1] } : p.length === 1 ? { name: p[0] } : null;
    };
    gh.addRepo = async function (input, by) {
      var q = gh.parseRepo(input), meta = null, slug = q && q.slug ? q.slug : null;
      if (!q) return { ok: false, msg: 'Which repo? Give owner/name, a GitHub URL, or a name to search for.' };
      var known = gh.repos.filter(function (r) { return (slug && r.slug.toLowerCase() === slug.toLowerCase()) || (q.name && r.r.toLowerCase() === q.name.toLowerCase()); })[0];
      if (known) { known.priority = true; gh.done = false; return { ok: true, slug: known.slug, msg: known.slug + ' is already in the research queue (' + (known.scoured ? known.pull + '/' + (known.paths ? known.paths.length : '?') + ' files pulled' : 'queued') + '); moved it to the front.' }; }
      try {
        var res = await fetch(API + (slug ? '/repos/' + slug : '/search/repositories?q=' + encodeURIComponent(q.name + ' in:name') + '&sort=stars&per_page=8'));
        var rem = res.headers.get('x-ratelimit-remaining'); if (rem != null) gh.rate = +rem;
        if (res.ok) { var j = await res.json(); if (slug) meta = j; else { var items = j.items || [], nm = q.name.toLowerCase(); meta = items.filter(function (it) { return String(it.name || '').toLowerCase() === nm; })[0] || items[0] || null; } }
        else if (res.status === 404 && slug) return { ok: false, msg: slug + ' was not found on GitHub.' };
        else if (res.status === 403 && !slug) return { ok: false, msg: 'GitHub search is rate-limited right now. Give the full owner/name and I can add it without searching.' };
      } catch (e) {}
      if (meta && meta.full_name) slug = meta.full_name;
      if (!slug) return { ok: false, msg: 'No GitHub repo matches \u201c' + q.name + '\u201d. Give owner/name or a URL.' };
      var pp = slug.split('/');
      var repo = { o: pp[0], r: pp[1], slug: slug, topic: String((meta && meta.description) || 'added on request').slice(0, 80), tags: (meta && meta.topics) || [], branch: (meta && meta.default_branch) || null, paths: null, pull: 0, scoured: false, fallback: ['README.md'], retry: [], priority: true, added: by || 'you', stars: meta ? meta.stargazers_count : null };
      gh.repos.unshift(repo); gh.done = false; saveAdded();
      emit('scour', repo, null, 'added to the research queue' + (repo.stars != null ? ' \u00b7 \u2605' + repo.stars : '') + ' \u00b7 by ' + repo.added);
      if (!gh.busy) { gh.busy = true; try { await scour(repo); } catch (e) {} finally { gh.busy = false; } saveAdded(); }
      return { ok: true, slug: slug, msg: 'Added ' + slug + (repo.stars != null ? ' (\u2605' + repo.stars + ')' : '') + ' \u00b7 ' + (repo.paths && repo.paths.length ? repo.paths.length + ' source/doc files queued, pulling first' : 'queued; it is scoured on the next cycle') + (meta && meta.description ? ' \u00b7 ' + repo.topic : '') };
    };
    gh.removeRepo = function (input) { var q = gh.parseRepo(input); if (!q) return { ok: false, msg: 'Which repo?' }; var i = gh.repos.findIndex(function (r) { return q.slug ? r.slug.toLowerCase() === q.slug.toLowerCase() : r.r.toLowerCase() === String(q.name || '').toLowerCase(); }); if (i < 0) return { ok: false, msg: 'not in the research queue' }; var r = gh.repos.splice(i, 1)[0]; saveAdded(); emit('scour', r, null, 'removed from the research queue'); return { ok: true, msg: 'Removed ' + r.slug }; };
    gh.start = function (ms) {
      if (gh.timer) return; gh.ms = ms || 3600;
      gh.discoverStarred('yetmens').then(function (n) { if (!n) gh.discoverStarred('karpathy'); });
      var tick = function () { gh.timer = setTimeout(function () { Promise.resolve(gh.step()).then(next, next); }, gh.pending() && Date.now() >= (gh.backoff || 0) ? FAST : gh.ms); };
      var next = function () { if (gh.timer) tick(); };
      gh.timer = -1; gh.step(); tick();
      if (core.science && core.science.start) core.science.start(2600);
    };
    gh.stop = function () { if (gh.timer && gh.timer !== -1) clearTimeout(gh.timer); gh.timer = null; if (core.science && core.science.stop) core.science.stop(); };
    gh.reset = function () { gh.repos.forEach(function (r) { r.scoured = false; r.paths = null; r.pull = 0; r.retry = []; }); gh.sources = {}; gh.order = []; gh.done = false; gh.stats.total = 0; };
    return gh;
  }

  window.GIGitHub = { attach: attach, repos: REPOS };
})();
