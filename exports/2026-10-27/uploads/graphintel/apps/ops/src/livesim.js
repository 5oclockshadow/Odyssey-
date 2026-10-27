/* LiveSim: the browser's stand-in for the engine when none answers. Nothing here is a fixture. Claude plays two roles, the outside world and SEXTANT, so the institute
   reads, records, links, hires, reprices and states its own limits; real sources (news index, papers, discussion, spot prices) are read wherever the browser can reach them,
   and every item, claim and price carries its basis (real or simulated). Same shapes as the engine's provenance input; saved in localStorage; never published.
   LiveSim.create({ onChange }) -> sim */
(function () {
  'use strict';
  var KEY = 'threshold_livesim_v2', MAXCALLS = 9, PACE = { calm: 90000, normal: 45000, fast: 20000 };
  var now = function () { return Date.now() / 1000; };
  var clip = function (s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  var slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var enc = encodeURIComponent;
  var num = function (v, name, lo, hi) { var x = Number(v); if (v === null || v === '' || v === undefined || !isFinite(x)) throw new Error(name + ' must be a number'); if ((lo != null && x < lo) || (hi != null && x > hi)) throw new Error(name + ' must be between ' + lo + ' and ' + hi); return x; };
  var STOP = new Set('a an and are as at be by for from in is it of on or that the this to was were with will has have had its into over under than then their there these those about after before between'.split(' '));
  var words = function (t) { var m = String(t).toLowerCase().match(/[a-z0-9][a-z0-9.%$-]*/g) || [], o = new Set(); m.forEach(function (x) { x = x.replace(/^[.-]+|[.-]+$/g, ''); if (x && !STOP.has(x) && (x.length > 2 || /^\d+$/.test(x))) o.add(x); }); return o; };
  var jacc = function (a, b) { var i = 0; a.forEach(function (x) { if (b.has(x)) i++; }); return i / (a.size + b.size - i); };
  var novel = function (t, seen, lim) { var w = words(t); if (!w.size) return false; return seen.every(function (s) { var v = words(s); return !v.size || jacc(w, v) < lim; }); };
  var wpick = function (a) { var t = a.reduce(function (s, x) { return s + x[1]; }, 0), r = Math.random() * t; for (var i = 0; i < a.length; i++) { r -= a[i][1]; if (r <= 0) return a[i][0]; } return a[0][0]; };

  // Mirrors apps/engine/institute.yaml: the seed, the watchlist and the limitations the institute starts out holding.
  var SEED = [
    ['g-gpu', 'goal', 'Work out whether the GPU build-out is priced ahead of the revenue it can earn, and reprice what it touches under explicit scenarios', '', 'AI data center GPU bubble capex'],
    ['q-gpu-rent', 'question', 'What do GPU-hours rent for by model and contract type, how fast are they falling, and what utilisation does the rent imply?', 'rental prices per GPU-hour stop falling for two quarters while utilisation stays high', 'GPU rental price per hour H100'],
    ['q-gpu-life', 'question', 'How long do AI accelerators really earn their keep, and what does a 3-versus-6-year depreciation life do to reported earnings?', 'resale and rental data show accelerators earning full price after year five', 'GPU depreciation useful life data center'],
    ['q-gpu-debt', 'question', 'How much of the data-centre build-out is financed by debt, leases and off-balance-sheet vehicles, and what covers the payments?', 'disclosed contracted revenue covers debt service across the main borrowers', 'data center debt financing private credit'],
    ['q-gpu-commod', 'question', 'Which commodities (copper, aluminium, gallium, power, gas, uranium) are priced for the build-out continuing, and which are not?', 'commodity prices move with data-centre capex announcements in neither direction', 'copper demand data centers'],
    ['q-gpu-fair', 'question', 'Under three scenarios (small models suffice, the build-out continues, a credit event), what is a fair range for each GPU-linked asset?', 'the scenario-weighted ranges fail to bracket realised prices over the next two quarters', 'AI stocks valuation bubble'],
    ['q-energy', 'question', 'Which energy forecasts in circulation are stale, and who still cites them?', 'the IEA restates the 1,000 TWh figure for 2026', 'data center electricity demand forecast'],
    ['H0', 'hypothesis', 'H0 · seeded, quality holds from a 30B model down to an LSTM on a CPU', 'the LSTM rung falls more than 5 points below 30B on the frozen split', 'small language models agentic tasks'],
    ['H5', 'hypothesis', 'H5 · a shuffled seed removes at least 80% of the gain', 'the shuffled seed keeps more than 20% of the gain', 'knowledge graph memory agents ablation']];
  var SEED_EDGES = [['investigates', ['g-gpu', 'q-gpu-rent', 'q-gpu-life', 'q-gpu-debt', 'q-gpu-commod', 'q-gpu-fair']], ['investigates', ['g-gpu', 'q-energy']], ['bears_on', ['q-gpu-fair', 'q-gpu-rent', 'q-gpu-life', 'q-gpu-debt', 'q-gpu-commod']], ['part_of', ['H5', 'H0']]];
  var WATCH = [
    ['H100 on-demand rental', 'rental', 'USD/GPU-hr', 'public cloud and marketplace listings; compare list price with spot and reserved contracts'], ['B200 on-demand rental', 'rental', 'USD/GPU-hr', 'newer parts reprice the older ones; look at the spread between generations'],
    ['NVDA', 'equity', 'USD/share', 'data-centre revenue share, gross margin, customer concentration, purchase commitments'], ['AMD', 'equity', 'USD/share', 'data-centre GPU guidance and customer commitments'],
    ['TSM', 'equity', 'USD/share', 'advanced-node and packaging capacity, utilisation, capex guidance'], ['CRWV', 'equity', 'USD/share', 'contracted backlog, debt and lease schedule, depreciation policy'],
    ['ORCL', 'equity', 'USD/share', 'capex against free cash flow, debt issuance, remaining performance obligations'], ['MSFT', 'equity', 'USD/share', 'capex, lease commitments not yet commenced, AI revenue disclosures'],
    ['SMCI', 'equity', 'USD/share', 'inventory, gross margin, customer concentration'], ['VST', 'equity', 'USD/share', 'power sold to data centres: contract prices and tenor'],
    ['Copper', 'commodity', 'USD/t', 'exchange stocks, grid and data-centre wiring demand'], ['Aluminium', 'commodity', 'USD/t', 'smelter power costs, inventories, structure demand'],
    ['Natural gas (Henry Hub)', 'commodity', 'USD/MMBtu', 'gas-fired power for data centres'], ['Uranium', 'commodity', 'USD/lb', 'nuclear power purchase agreements signed by hyperscalers'],
    ['Gallium', 'commodity', 'USD/kg', 'export controls and the share used in power and RF chips'], ['US retail electricity', 'power', 'USD/kWh', 'regional load growth and capacity-market prices'],
    ['US high-yield spread', 'credit', 'bp', 'AI-linked issuance and private-credit exposure'], ['Bitcoin', 'crypto', 'USD', 'miners re-pointing hash capacity to AI hosting']
  ].map(function (a) { return { asset: a[0], kind: a[1], unit: a[2], hint: a[3] }; });
  var LIMITS = [
    ['No live equity quotes: only pages the browser can reach are read and no licensed market-data feed is connected, so equities are repriced as scenario-weighted re-rates against the last cited price, not as absolute values.', 'access', 3, 'a permitted quote source, or a licensed feed', 'a market-data key, or approval to use a free quote source'],
    ['GPU rental prices come from public listings and secondary reports; contract-level enterprise lease terms and utilisation are not public.', 'coverage', 3, 'several independent listing sources tracked over time', ''],
    ['The useful life of AI accelerators is contested between about three and six years; it enters as a scenario variable, not a measured fact.', 'method', 2, 'resale and rental-price curves by GPU generation across several quarters', ''],
    ['Debt held by private credit and special-purpose vehicles is not fully disclosed; estimates rest on filings and press reports.', 'coverage', 2, 'filings that name the vehicles, lenders and covenants', ''],
    ['The language model can misread a source or produce a figure that sounds right; every number must trace to a source in the graph, or be marked as an estimate.', 'model', 3, 'an automatic check that re-fetches each cited figure', ''],
    ['In this browser, articles are read by headline or abstract only; full texts and filings are not fetched.', 'access', 2, 'run the engine, where the agent fetches full pages and filings', ''],
    ['The thesis experiment (H0, H5) has not finished, so the weight on small models suffice is a prior that moves as results land, not a measurement.', 'method', 2, 'results of phases P3 and P4, published either way', ''],
    ['Repricing is analysis, not advice: the Institute does not manage money and cannot know a reader\'s circumstances.', 'method', 1, 'not lifted by design', '']];
  var WILD = { id: 'wildcard', label: 'Something nobody here is watching yet that bears on the GPU build-out: money, power, supply chain, law or science.', q: 'AI data center bubble' };
  var KINDS = [['paper', 35], ['feed', 30], ['trend', 15], ['filing', 10], ['dataset', 10]], STANCES = [['supports', 40], ['complicates', 30], ['contradicts', 20], ['unrelated', 10]];
  var FRED = { 'Copper': ['PCOPPUSDM', 'USD/t', 1], 'Aluminium': ['PALUMUSDM', 'USD/t', 1], 'Natural gas (Henry Hub)': ['DHHNGSP', 'USD/MMBtu', 1], 'Uranium': ['PURANUSDM', 'USD/lb', 1], 'US high-yield spread': ['BAMLH0A0HYM2', 'bp', 100] };

  var WORLD_SYS = 'You are the outside world as a small research institute meets it: papers, filings, feed items, trending searches and datasets that appear while it works. You are not the institute and do not know what it will conclude. Write items that could plausibly exist on the date given, with specific names, numbers and dates, one concrete figure in every summary, and the requested stance toward what the institute currently believes. Never repeat or paraphrase anything in "already". Vary the angle, the publisher and the scale. The institute’s current focus is the GPU and AI-infrastructure build-out and how it is priced (rental rates, depreciation, capex, debt, power, commodities, supply chain, credit): unless the beat says otherwise, write what a reader of that world would see, about named companies, series and filings. Do not invent URLs. Return only JSON: {"items":[{"kind":"paper|filing|feed|trend|dataset","title":"under 110 characters","source":"publisher","summary":"one or two sentences","stance":"supports|complicates|contradicts|unrelated"}]}';
  var SEXTANT_SYS = 'You are SEXTANT, the single agent that runs The Threshold Institute, a self-running think tank studying whether the GPU build-out is priced ahead of the revenue it can earn and what happens to commodities and assets if small, cheap models suffice. You read what arrives and record only what it supports; contested points stay contested; you give no personalised financial advice. The item is real (a headline or abstract from a live source; you did not read the page) or simulated (written by a world agent). Record it as a claim with its source, never as established fact, and say in the claim whether it rests on a headline or an abstract. Return only JSON: {"answer":"2-3 sentences: what you conclude, what is uncertain, what to look at next","claims":[up to 2 of {"label":"one sentence claim","relation":"supports|complicates|contradicts (toward what the beat currently holds)","against":["existing claim ids it conflicts with"]}],"new_question":null or {"label":"...","falsifier":"how it could be wrong"},"touches":["existing node ids you reread"],"limits":[] unless you hit a gap that would affect many records (a kind of source you cannot read, a figure you cannot check), then one {"text":"...","area":"data|method|model|coverage|access","severity":1-3,"lifts_by":"what would remove it"}; never a caveat about this one item}';
  var REPRICE_SYS = 'You are SEXTANT repricing one asset or commodity that the GPU build-out touches, fairly: you owe the reader the case against your view as much as the case for it. Use only the sources you are given and cite them by their short ids (S1, S2, …) exactly as written; a driver with no given source id is refused. Name three scenarios with probabilities summing to 1: (a) small, cheap models suffice for most paid work so accelerator demand and rental prices fall, (b) the build-out continues on current economics, (c) a credit event forces sales and write-downs. Move the weights with the evidence in the graph and say what moved them; do not choose weights to match a conclusion. rerate_pct is the move in percent against the sourced market price (or the last cited price when none is given) and the scenarios must span both directions unless you give one_sided_reason. If a market price is given, also give fair_low and fair_high in its unit; your scenario-weighted re-rate must fall inside that range. State what you could not see in limits. This is analysis, not advice. Keep it compact: notes under 100 characters, why under 500 characters, at most 4 drivers. Return only JSON: {"scenarios":[{"name","p","rerate_pct","note"}],"drivers":[{"name","direction":1|-1,"weight":0-1,"evidence":["source ids"]}],"why":"what moves the price, in a few sentences","confidence":"low|medium|high","limits":["..."],"fair_low":number|null,"fair_high":number|null,"one_sided_reason":""}';
  var STAFF_SYS = 'You are SEXTANT in a staffing round. You are the only permanent member of the institute; every other post exists because a piece of the research needed watching. Decide whether any unwatched question deserves a standing sub-agent: only where a continuous watch would settle something a single round cannot. Create at most one. Retire a post only if its question is settled or it has found nothing. Return only JSON: {"hire":null or {"name":"a-z0-9-","role":"a few words","prompt":"what is worth sending you and what to skip","from_node":"question id","why":"one sentence"},"retire":null or "agent name","note":"what you considered and why"}';
  var LIMITS_SYS = 'You are SEXTANT working down the limitations the institute holds. Choose the one whose removal would most change the repricing and say the smallest real step you can take toward lifting it. In this browser you cannot add code or sources; if only the operator can lift it, say exactly what is needed. Never claim it is lifted. Return only JSON: {"id":"limitation id","plan":"the next real step","owner_needed":"what only the operator can give, or empty","status":"open|working"}';

  var SEGMENTS = { cities: 'Cities and municipalities', universities: 'Universities', schools: 'Schools and school boards', enterprise: 'Fortune 500 companies', projects: 'Random projects and small teams' };
  var OPP_SYS = 'You are SEXTANT proposing work the institute should seek out and do for outside organisations: cities, universities, schools, Fortune 500 companies and small projects. The aim is two things at once: money for the institute and a real benefit to the world around it. Ground each proposal in nodes from the graph you are given (cite their short ids N1, N2, …), say who would pay and why, what the institute would deliver and how it would be priced, give a value range with the assumption behind it (an estimate, never a promise), say how it helps people beyond the buyer, the risks, and the first small step. No personalised financial advice; the institute does not manage money. Return only JSON: {"segment":"cities|universities|schools|enterprise|projects","title":"...","buyer":"who exactly","problem":"the problem, in terms of the evidence","evidence":["N1","N2"],"offer":"what the institute would do","deliverable":"what the buyer receives","price_model":"how it is priced","value_low":number,"value_high":number,"value_basis":"the assumption behind the range","public_good":"how it elevates people beyond the buyer","risks":["..."],"first_step":"the smallest real next step"}';
  function fresh() {
    var S = { v: 2, born: now(), turns: 0, cycles: 0, calls: 0, errors: 0, rejected: 0, seq: 0, eseq: 0, nodes: {}, edges: {}, agents: [], tasks: [], reprice: [], opps: [], pubs: {}, limits: {}, seen: [], seenLinks: [], recent: [], beats: {}, feed: [], log: [], src: {}, paused: false, pace: 'calm' };
    SEED.forEach(function (n) { S.nodes[n[0]] = { id: n[0], type: n[1], label: n[2], falsifier: n[3], q: n[4], pub: n[1] !== 'goal', core: true }; });
    SEED_EDGES.forEach(function (e, i) { S.edges['s' + i] = { id: 's' + i, relation: e[0], members: e[1], w: 0.5, core: true }; });
    LIMITS.forEach(function (l, i) { S.limits['lim-' + (i + 1)] = { id: 'lim-' + (i + 1), text: l[0], area: l[1], severity: l[2], lifts_by: l[3], plan: '', owner_needed: l[4], status: 'open', ts: now(), by: 'seed', history: [] }; });
    return S;
  }
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.v === 2 && j.nodes) { j.opps = j.opps || []; return j; } } catch (e) {} return fresh(); }

  function create(opts) {
    opts = opts || {};
    var S = load(); S.tasks.forEach(function (t) { if (t.state === 'ongoing') { t.state = 'failed'; t.ts = now(); t.note = 'Interrupted: the page was closed mid-round.'; } });
    var pendingReprice = '', pendingPropose = '', busy = false, timer = 0, bucket = [], mode = 'sim', phase = { name: 'idle', detail: '', since: now() }, nextAt = 0, saveT = 0;
    var uid = function (p) { S.seq++; return p + S.seq.toString(36) + Math.random().toString(36).slice(2, 5); };
    var emit = function (evt) { save(); try { if (opts.onChange) opts.onChange(evt || {}); } catch (e) {} };
    function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { S.tasks = S.tasks.slice(-220); S.feed = S.feed.slice(0, 90); S.reprice = S.reprice.slice(-140); S.log = S.log.slice(0, 80); S.seen = S.seen.slice(-600); S.seenLinks = S.seenLinks.slice(-600); S.recent = S.recent.slice(-40); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 500); }
    function log(kind, text) { S.log.unshift({ ts: now(), kind: kind, text: clip(text, 240) }); }
    function setPhase(name, detail, task) { phase = { name: name, detail: detail, since: now(), task: task || '' }; emit({ type: 'phase' }); }
    function ready() { return !!(window.claude && typeof window.claude.complete === 'function'); }
    function gate() { return new Promise(function (res) { (function t() { var n = Date.now(); bucket = bucket.filter(function (x) { return n - x < 60000; }); if (bucket.length < MAXCALLS) { bucket.push(n); res(); } else setTimeout(t, 2000); })(); }); }
    async function call(system, user, max) {
      if (!ready()) throw new Error('no model is available in this page');
      await gate(); S.calls++;
      return String(await window.claude.complete({ system: system, messages: [{ role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }], max_tokens: max || 1000 }));
    }
    async function model(system, user, max) { try { return await modelOnce(system, user, max); } catch (e) { if (!/JSON/.test(e.message)) throw e; return await modelOnce(system, user, Math.round((max || 1000) * 1.6)); } }
    async function modelOnce(system, user, max) {
      var s = await call(system, user, max), i = s.indexOf('{'), j = s.lastIndexOf('}');
      if (i < 0 || j < i) throw new Error('the model did not return JSON');
      var txt = s.slice(i, j + 1).replace(/:\s*\+(\d)/g, ': $1').replace(/,(\s*[}\]])/g, '$1'); return JSON.parse(txt);
    }
    async function http(url, kind) { var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 9000); try { var r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return kind === 'text' ? await r.text() : await r.json(); } finally { clearTimeout(t); } }

    function track(id, label, ok, err) {
      var s = S.src[id] = S.src[id] || { id: id, label: label, ok: null, n: 0, fail: 0, last: 0, err: '' }, lid = 'lim-src-' + id, cur = S.limits[lid];
      s.ok = ok; s.last = now();
      if (ok) { s.n++; s.err = ''; } else { s.fail++; s.err = clip(err, 120); }
      if (!ok && s.n === 0 && !cur) S.limits[lid] = { id: lid, text: label + ' is not reachable from this browser (' + clip(err, 80) + '), so nothing from it can be read or cited.', area: 'access', severity: 2, lifts_by: 'run the engine, where the agent fetches it server-side', plan: '', owner_needed: '', status: 'open', ts: now(), by: 'livesim', history: [] };
      if (ok && cur && cur.status !== 'lifted') { cur.status = 'lifted'; cur.plan = label + ' returned data at ' + new Date().toLocaleTimeString() + ' (' + s.n + ' reads)'; cur.history.push({ ts: now(), by: 'livesim', status: 'lifted', plan: cur.plan }); }
    }
    var G = {
      gdelt: ['GDELT news index', function (b) { return http('https://api.gdeltproject.org/api/v2/doc/doc?query=' + enc(b.q) + '&mode=artlist&maxrecords=10&format=json&sort=datedesc&timespan=7d').then(function (j) { return (j.articles || []).map(function (a) { return { kind: 'feed', title: clip(a.title, 140), source: a.domain, link: a.url, published: a.seendate || '', summary: a.domain + ' · ' + (a.seendate || '') + ' · headline only, the page was not read' }; }); }); }],
      scholar: ['Semantic Scholar', function (b) { return http('https://api.semanticscholar.org/graph/v1/paper/search?query=' + enc(b.q) + '&year=2024-&limit=8&fields=title,year,abstract,url,venue,publicationDate').then(function (j) { return (j.data || []).map(function (p) { return { kind: 'paper', title: clip(p.title, 140), source: p.venue || 'Semantic Scholar', link: p.url || '', published: p.publicationDate || String(p.year || ''), summary: clip(p.abstract || 'No abstract returned.', 360) }; }); }); }],
      hn: ['Hacker News', function (b) { return http('https://hn.algolia.com/api/v1/search_by_date?query=' + enc(b.q.split(' ').slice(0, 3).join(' ')) + '&tags=story&hitsPerPage=10').then(function (j) { return (j.hits || []).filter(function (h) { return h.title; }).map(function (h) { return { kind: 'feed', title: clip(h.title, 140), source: 'Hacker News · ' + h.points + ' points', link: h.url || 'https://news.ycombinator.com/item?id=' + h.objectID, published: h.created_at || '', summary: h.num_comments + ' comments · title only' }; }); }); }]
    };
    function relevant(it, b) { var w = words(it.title + ' ' + (it.summary || '')), n = 0; words(b.q).forEach(function (x) { if (w.has(x)) n++; }); return n >= 1; }
    async function gatherReal(beat) {
      var order = ['gdelt', 'scholar', 'hn'], out = [];
      for (var i = 0; i < 3 && !out.length; i++) {
        var id = order[(S.turns + i) % 3], st = S.src[id];
        if (st && st.ok === false && now() - st.last < 600) continue;
        try { var items = await G[id][1](beat); track(id, G[id][0], true); out = items.filter(function (it) { return it.title && relevant(it, beat) && novel(it.title, S.seen, 0.6) && (!it.link || S.seenLinks.indexOf(it.link) < 0); }); } catch (e) { track(id, G[id][0], false, e.message); }
      }
      return out.slice(0, 2).map(function (it) { it.real = true; return it; });
    }
    async function market(asset) {
      var f = FRED[asset];
      if (f) { try { var t = await http('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + f[0], 'text'), rows = t.trim().split('\n').slice(1).map(function (l) { return l.split(','); }).filter(function (r) { return r[1] && r[1] !== '.' && isFinite(+r[1]); }), last = rows[rows.length - 1]; track('fred', 'FRED (St. Louis Fed)', true); return { value: +last[1] * f[2], unit: f[1], as_of: last[0], source: { id: 'fred-' + f[0].toLowerCase(), label: 'FRED series ' + f[0], url: 'https://fred.stlouisfed.org/series/' + f[0], basis: 'real', as_of: last[0] } }; } catch (e) { track('fred', 'FRED (St. Louis Fed)', false, e.message); } }
      if (asset === 'Bitcoin') { try { var j = await http('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true'), d = new Date(j.bitcoin.last_updated_at * 1000).toISOString().slice(0, 10); track('coingecko', 'CoinGecko', true); return { value: j.bitcoin.usd, unit: 'USD', as_of: d, source: { id: 'coingecko-btc', label: 'CoinGecko spot price', url: 'https://www.coingecko.com/en/coins/bitcoin', basis: 'real', as_of: d } }; } catch (e) { track('coingecko', 'CoinGecko', false, e.message); } }
      if (asset === 'Natural gas (Henry Hub)') { try { var g = (await http('https://raw.githubusercontent.com/datasets/natural-gas/main/data/daily.csv', 'text')).trim().split('\n'), r = g[g.length - 1].split(','); track('datasets-gas', 'datahub Henry Hub daily', true); return { value: +r[1], unit: 'USD/MMBtu', as_of: r[0], source: { id: 'datahub-henry-hub', label: 'datahub.io Henry Hub daily (EIA)', url: 'https://datahub.io/core/natural-gas', basis: 'real', as_of: r[0] } }; } catch (e) { track('datasets-gas', 'datahub Henry Hub daily', false, e.message); } }
      return null;
    }

    function beats() {
      var sup = {}; Object.keys(S.edges).forEach(function (k) { var e = S.edges[k]; e.members.forEach(function (m) { sup[m] = (sup[m] || 0) + e.w; }); });
      return Object.keys(S.nodes).map(function (k) { return S.nodes[k]; }).filter(function (n) { return n.type === 'question' || n.type === 'hypothesis' || n.type === 'goal'; }).map(function (n) { return { id: n.id, label: n.label, q: n.q || n.label, support: sup[n.id] || 0, stale: (now() - (S.beats[n.id] || 0)) / 3600 }; });
    }
    function pick(bs) { var ws = bs.map(function (b) { return (1 + Math.min(b.stale, 48)) / (1 + b.support) * (/^(g-gpu|q-gpu|q-energy)/.test(b.id) ? 3 : 1); }), r = Math.random() * ws.reduce(function (a, b) { return a + b; }, 0); for (var i = 0; i < bs.length; i++) { r -= ws[i]; if (r <= 0) return bs[i]; } return bs[0]; }
    function claimsFor(id) { var out = []; Object.keys(S.edges).forEach(function (k) { var e = S.edges[k]; if (e.relation === 'bears_on' && e.members[1] === id && S.nodes[e.members[0]] && S.nodes[e.members[0]].type === 'claim') out.push({ id: e.members[0], label: clip(S.nodes[e.members[0]].label, 120), basis: S.nodes[e.members[0]].basis || '' }); }); return out.slice(-6); }
    function eid() { return 'e' + (++S.eseq).toString(36); }
    function link(rel, members, w) { var id = eid(); S.edges[id] = { id: id, relation: rel, members: members, w: w }; return id; }
    function node(id, type, label, extra) { S.nodes[id] = Object.assign({ id: id, type: type, label: clip(label, 170), pub: false }, extra || {}); return S.nodes[id]; }
    function uniq(base) { var id = base, i = 2; while (S.nodes[id]) id = base + '-' + i++; return id; }
    function addLimit(l, by) { var id = 'lim-' + (Object.keys(S.limits).length + 1); while (S.limits[id]) id += 'x'; S.limits[id] = { id: id, text: clip(l.text, 300), area: ['data', 'method', 'model', 'coverage', 'access'].indexOf(l.area) >= 0 ? l.area : 'data', severity: Math.max(1, Math.min(3, Number(l.severity) || 2)), lifts_by: clip(l.lifts_by, 300), plan: '', owner_needed: '', status: 'open', ts: now(), by: by, history: [] }; }

    function merge(out, it, beat) {
      var ids = [], real = !!it.real, sid = uniq((real ? 'src-' : 'sim:src-') + slug(it.title).slice(0, 36)), bn = S.nodes[beat.id], prior = bn ? claimsFor(beat.id).length : 0, dE = 0, made = [];
      node(sid, it.kind === 'paper' ? 'paper' : it.kind === 'dataset' ? 'dataset' : 'source', it.title, { sim: !real, link: it.link || '', basis: real ? 'real' : 'simulated', as_of: it.published || '', from: it.source }); ids.push(sid);
      (out.claims || []).filter(function (c) { return c && typeof c.label === 'string' && c.label.length > 8; }).slice(0, 2).forEach(function (c) {
        var rel = ['supports', 'complicates', 'contradicts'].indexOf(c.relation) >= 0 ? c.relation : 'supports', cid = uniq((real ? 'claim-' : 'sim:claim-') + slug(c.label).slice(0, 32));
        node(cid, 'claim', c.label, { sim: !real, basis: real ? 'real' : 'simulated', stance: rel }); link('supports', [sid, cid], 0.5); if (bn) link('bears_on', [cid, beat.id], 0.4);
        (c.against || []).forEach(function (o) { if (S.nodes[o] && S.nodes[o].type === 'claim') link('contradicts', [cid, o], 0.5); });
        dE += rel === 'supports' ? (prior + made.length ? -0.03 : -0.01) : rel === 'complicates' ? 0.01 : 0.04; made.push(cid); ids.push(cid);
      });
      if (bn) Object.keys(S.edges).forEach(function (k) { var e = S.edges[k]; if (e.relation === 'bears_on' && e.members[1] === beat.id) e.w = Math.min(1, e.w + 0.04); });
      var nq = out.new_question;
      if (nq && typeof nq.label === 'string' && nq.label.length > 12 && Object.keys(S.nodes).filter(function (k) { return S.nodes[k].type === 'question'; }).length < 24) { var qid = uniq('q-' + slug(nq.label).slice(0, 28)); node(qid, 'question', nq.label, { falsifier: clip(nq.falsifier, 200), q: nq.label }); link('raises', [made[0] || sid, qid], 0.3); ids.push(qid); }
      (out.touches || []).forEach(function (t) { if (S.nodes[t] && ids.indexOf(t) < 0) ids.push(t); }); if (bn && ids.indexOf(beat.id) < 0) ids.push(beat.id);
      (out.limits || []).slice(0, 1).forEach(function (l) { if (l && l.text && l.text.length > 12 && Object.keys(S.limits).length < 30 && novel(l.text, Object.keys(S.limits).map(function (k) { return S.limits[k].text; }), 0.5)) addLimit(l, 'sextant'); });
      return { ids: ids, energy: Math.max(-0.08, Math.min(0.06, Math.round(dE * 100) / 100)) };
    }
    function pushTask(who, kind, title, state, ids, extra) { var t = Object.assign({ id: uid('t'), who: who, origin: '', kind: kind, title: title, state: state, started: now(), ts: now(), note: '', node_ids: ids || [] }, extra || {}); S.tasks.push(t); return t; }
    function finishTask(t, state, note, ids, energy) { t.state = state; t.ts = now(); t.note = clip(note, 500); if (ids) t.node_ids = ids; if (energy != null) t.energy = energy; if (state === 'failed') { S.errors++; log('error', t.title + ': ' + clip(note, 140)); } emit({ type: state === 'done' ? 'done' : 'failed', task: t, ids: t.node_ids }); }

    async function simulate(beat, retry) {
      var out = await model(WORLD_SYS, { clock: new Date().toUTCString(), beat: beat.id + ': ' + beat.label, standing: claimsFor(beat.id).map(function (c) { return c.label; }).join('\n'), kind: wpick(KINDS), stance: wpick(STANCES), count: 2, already: S.recent.slice(-30).join('\n') + (retry ? '\n(your last attempt only repeated earlier items: write about a different angle, publisher and scale)' : '') || 'none yet' }, 900), kept = [];
      (out.items || []).forEach(function (it) { var t = clip(it.title, 140); if (t && novel(t, S.seen.concat(kept.map(function (k) { return k.title; })), 0.6)) kept.push({ kind: ['paper', 'filing', 'feed', 'trend', 'dataset'].indexOf(it.kind) >= 0 ? it.kind : 'feed', title: t, source: clip(it.source || 'unknown', 60), summary: clip(it.summary, 320), stance: it.stance || 'supports', real: false, link: '' }); else S.rejected++; });
      return kept;
    }
    async function ingest(it, beat) {
      var agent = S.agents.filter(function (a) { return a.enabled && a.from_node === beat.id; })[0], t0 = now();
      S.feed.unshift({ id: uid('f'), ts: t0, kind: it.kind, title: it.title, source: it.source, summary: it.summary, stance: it.stance || '', beat: beat.id, agent: agent ? agent.id : '', real: !!it.real, link: it.link || '' });
      if (it.link) S.seenLinks.push(it.link); S.seen.push(it.title); S.recent.push(it.title);
      if (agent) { agent.items++; agent.last_seen = t0; S.tasks.push({ id: uid('t'), who: agent.id, origin: '', kind: 'find', title: 'Found: ' + clip(it.title, 90), state: 'done', started: t0, ts: t0 + 1, note: it.source, node_ids: [], sim: !it.real }); }
      var t = pushTask('sextant', 'ingest', 'Read an item: ' + clip(it.title, 90), 'ongoing', S.nodes[beat.id] ? [beat.id] : [], { origin: agent ? agent.id : '', sim: !it.real });
      setPhase('round', 'SEXTANT is reading: ' + clip(it.title, 80), t.id); emit({ type: 'start', task: t });
      try {
        var out = await model(SEXTANT_SYS, { item: { kind: it.kind, title: it.title, source: it.source, summary: it.summary, published: it.published || '' }, basis: it.real ? 'real: fetched from a live source, headline or abstract only' : 'simulated: written by the world agent, does not exist outside this simulation', beat: { id: beat.id, label: beat.label }, existing_claims: claimsFor(beat.id), other_nodes: beats().filter(function (b) { return b.id !== beat.id; }).slice(0, 8).map(function (b) { return { id: b.id, label: clip(b.label, 80) }; }) }, 1500);
        var r = merge(out, it, beat); finishTask(t, 'done', out.answer, r.ids, r.energy);
      } catch (e) { finishTask(t, 'failed', e.message); }
    }

    function lastRecord(asset) { var r = S.reprice.filter(function (e) { return e.asset === asset; }); return r[r.length - 1]; }
    function due(n) { var last = {}; S.reprice.forEach(function (e) { last[e.asset.toLowerCase()] = e.ts; }); return WATCH.slice().sort(function (a, b) { return (last[a.asset.toLowerCase()] || 0) - (last[b.asset.toLowerCase()] || 0); }).slice(0, n); }
    function srcOf(cid) { var out = []; Object.keys(S.edges).forEach(function (k) { var e = S.edges[k]; if (e.relation === 'supports' && e.members[1] === cid && S.nodes[e.members[0]]) out.push(e.members[0]); }); return out; }
    function evidence(mk) {
      var out = mk ? [mk.source] : [], seen = {}, add = function (n) { if (n && !seen[n.id] && (n.type === 'source' || n.type === 'paper' || n.type === 'dataset')) { seen[n.id] = 1; out.push({ id: n.id, label: clip(n.label, 110), url: n.link || '', basis: n.sim ? 'simulated' : 'real', as_of: n.as_of || '' }); } };
      ['q-gpu-rent', 'q-gpu-life', 'q-gpu-debt', 'q-gpu-commod', 'q-gpu-fair', 'q-energy', 'H0', 'H5'].forEach(function (q) { claimsFor(q).forEach(function (c) { srcOf(c.id).forEach(function (id) { add(S.nodes[id]); }); }); });
      Object.keys(S.nodes).map(function (k) { return S.nodes[k]; }).slice(-12).forEach(add);
      return out.slice(0, 11);
    }
    function validate(e, provided) {
      var ids = {}; provided.forEach(function (s) { ids[s.id] = s; });
      var why = clip(e.why, 900); if (why.length < 40) throw new Error('why must say what moves the price, in a sentence or two');
      var conf = ['low', 'medium', 'high'].indexOf(String(e.confidence).toLowerCase()) >= 0 ? String(e.confidence).toLowerCase() : 'low';
      var drivers = (e.drivers || []).map(function (d) { var ev = (d.evidence || []).map(String); if (!ev.length || ev.some(function (x) { return !ids[x]; })) throw new Error('driver "' + clip(d.name, 40) + '" must cite source ids from the list you were given'); return { name: clip(d.name, 100), direction: Number(d.direction) > 0 ? 1 : -1, weight: num(d.weight == null ? 0.5 : d.weight, 'weight', 0, 1), evidence: ev }; });
      if (drivers.length < 2) throw new Error('give at least two drivers, each citing your sources');
      var cited = {}; drivers.forEach(function (d) { d.evidence.forEach(function (x) { cited[x] = 1; }); });
      var srcs = Object.keys(cited).map(function (k) { return ids[k]; }); if (srcs.length < 2) throw new Error('cite at least two different sources');
      var sc = (e.scenarios || []).map(function (s) { return { name: clip(s.name, 100), p: num(s.p, 'scenario p', 0, 1), rerate_pct: num(s.rerate_pct, 'scenario rerate_pct', -100, 1000), note: clip(s.note, 240) }; });
      if (sc.length < 2) throw new Error('give at least two scenarios');
      var tot = sc.reduce(function (a, s) { return a + s.p; }, 0); if (Math.abs(tot - 1) > 0.02) throw new Error('scenario probabilities sum to ' + tot.toFixed(2) + '; they must sum to 1');
      sc.forEach(function (s) { s.p = Math.round(s.p / tot * 10000) / 10000; });
      var rr = sc.map(function (s) { return s.rerate_pct; }), lo = Math.min.apply(null, rr), hi = Math.max.apply(null, rr), one = clip(e.one_sided_reason, 240);
      if (!(lo < 0 && hi > 0) && !one) throw new Error('scenarios must span both directions (one raises the value, one lowers it) or say why not in one_sided_reason');
      var expected = Math.round(sc.reduce(function (a, s) { return a + s.p * s.rerate_pct; }, 0) * 100) / 100, market = e.market == null ? null : num(e.market, 'market', 1e-9), fl = null, fh = null;
      if (market != null) { if (e.fair_low == null || e.fair_high == null) throw new Error('with a sourced market price, give fair_low and fair_high in the same unit'); fl = num(e.fair_low, 'fair_low', 0); fh = num(e.fair_high, 'fair_high', 0); if (fl > fh) throw new Error('fair_low is above fair_high'); var a = (fl / market - 1) * 100, b = (fh / market - 1) * 100; if (!(a - 5 <= expected && expected <= b + 5)) throw new Error('your scenario-weighted re-rate (' + expected.toFixed(1) + '%) falls outside the fair range you stated (' + a.toFixed(1) + '% to ' + b.toFixed(1) + '%); reconcile them'); }
      var limits = (e.limits || []).map(function (x) { return clip(x, 240); }).filter(Boolean); if (!limits.length) throw new Error('every repricing states what it cannot see: give at least one limit');
      var real = srcs.filter(function (s) { return s.basis === 'real'; }).length; if (conf === 'high' && real < 3) throw new Error('high confidence needs three real sources');
      var basis = real === srcs.length ? 'real' : real === 0 ? 'simulated' : 'mixed';
      return { id: 'px-' + slug(e.asset).slice(0, 24) + '-' + uid('').slice(-5), ts: now(), by: 'sextant', asset: e.asset, kind: e.kind, unit: e.unit, market: market, as_of: market != null ? e.as_of : '', fair_low: fl, fair_high: fh, scenarios: sc, drivers: drivers, sources: srcs, limits: limits, why: why, confidence: conf, one_sided_reason: one, rerate_low: lo, rerate_high: hi, expected_rerate: expected, net_drivers: Math.round(drivers.reduce(function (s, d) { return s + d.direction * d.weight; }, 0) * 100) / 100, basis: basis, publishable: basis === 'real' };
    }
    async function repriceRound(asset) {
      var a = asset ? WATCH.filter(function (w) { return w.asset === asset; })[0] : due(1)[0]; if (!a) return;
      var t = pushTask('sextant', 'reprice', 'Reprice: ' + a.asset, 'ongoing', ['q-gpu-fair']); setPhase('reprice', 'Repricing ' + a.asset, t.id); emit({ type: 'start', task: t });
      try {
        var mk = await market(a.asset), srcs = evidence(mk).map(function (s, i) { return Object.assign({}, s, { alias: 'S' + (i + 1) }); });
        if (srcs.length < 2) { finishTask(t, 'failed', 'Not enough sourced evidence in the graph to price ' + a.asset + ' yet; the next world turns will lean toward the GPU questions.'); S.beats['q-gpu-commod'] = 0; S.beats['q-gpu-rent'] = 0; return; }
        var aliasOf = {}; srcs.forEach(function (s) { aliasOf[s.id] = s.alias; });
        var prior = lastRecord(a.asset), lastOut = null, req = { asset: a, market: mk ? { value: mk.value, unit: mk.unit, as_of: mk.as_of, source_id: mk.source.id } : null, sources: srcs.map(function (s) { return { id: s.alias, label: s.label, basis: s.basis, as_of: s.as_of }; }), claims_on_gpu_questions: ['q-gpu-rent', 'q-gpu-life', 'q-gpu-debt', 'q-gpu-commod', 'q-gpu-fair', 'q-energy', 'H0', 'H5'].map(function (q) { return { question: q, claims: claimsFor(q).map(function (c) { return { text: c.label, basis: c.basis, cite: srcOf(c.id).map(function (id) { return aliasOf[id]; }).filter(Boolean) }; }) }; }), prior: prior ? { expected_rerate: prior.expected_rerate, range: [prior.rerate_low, prior.rerate_high], why: clip(prior.why, 200) } : null, limits_held: limits().filter(function (l) { return l.status !== 'lifted'; }).slice(0, 8).map(function (l) { return l.text; }) }, rec = null, err = '';
        for (var k = 0; k < 2 && !rec; k++) {
          try { var out = await model(REPRICE_SYS, k ? Object.assign({ refused_because: err }, req) : req, 2600); lastOut = out; rec = validate(Object.assign({}, out, { asset: a.asset, kind: a.kind, unit: a.unit, market: mk ? mk.value : null, as_of: mk ? mk.as_of : '' }), srcs.map(function (s) { return Object.assign({}, s, { id: s.alias, orig: s.id }); })); } catch (e) { err = e.message; }
        }
        if (!rec) { finishTask(t, 'failed', 'Refused by the repricing gate: ' + err + (lastOut ? ' (it cited ' + clip(JSON.stringify((lastOut.drivers || []).map(function (d) { return d.evidence; })), 90) + '; allowed ' + srcs.map(function (s) { return s.alias; }).join(', ') + ')' : '')); return; }
        var back = {}; srcs.forEach(function (s) { back[s.alias] = s.id; }); rec.sources.forEach(function (s) { s.id = s.orig || s.id; delete s.orig; delete s.alias; }); rec.drivers.forEach(function (d) { d.evidence = d.evidence.map(function (e) { return back[e] || e; }); });
        S.reprice.push(rec);
        var vid = 'val:' + slug(a.asset), cited = rec.sources.map(function (s) { return s.id; }).filter(function (id) { return S.nodes[id]; });
        node(vid, 'valuation', a.asset + ': expected ' + (rec.expected_rerate > 0 ? '+' : '') + rec.expected_rerate + '% re-rate', { sim: rec.basis !== 'real', basis: rec.basis }); link('bears_on', [vid, 'q-gpu-fair'], 0.5); cited.forEach(function (id) { link('supports', [id, vid], 0.4); });
        finishTask(t, 'done', rec.why, [vid, 'q-gpu-fair'].concat(cited));
      } catch (e) { finishTask(t, 'failed', e.message); }
    }
    function limits() { var o = { open: 0, working: 1, lifted: 2 }; return Object.keys(S.limits).map(function (k) { return S.limits[k]; }).sort(function (a, b) { return o[a.status] - o[b.status] || b.severity - a.severity || (a.id < b.id ? -1 : 1); }); }
    async function proposeRound(segment) {
      var segs = Object.keys(SEGMENTS), count = {}; segs.forEach(function (k) { count[k] = 0; }); S.opps.forEach(function (o) { count[o.segment] = (count[o.segment] || 0) + 1; });
      var seg = segs.indexOf(segment) >= 0 ? segment : segs.sort(function (a, b) { return count[a] - count[b]; })[0];
      var t = pushTask('sextant', 'reprice', 'Propose work for ' + SEGMENTS[seg].toLowerCase(), 'ongoing', []); setPhase('propose', 'Looking for work to offer ' + SEGMENTS[seg].toLowerCase(), t.id); emit({ type: 'start', task: t });
      try {
        var nodes = Object.keys(S.nodes).map(function (k) { return S.nodes[k]; }).filter(function (n) { return n.type === 'claim' || n.type === 'question' || n.type === 'valuation'; }).slice(-14).map(function (n, i) { return { alias: 'N' + (i + 1), id: n.id, label: clip(n.label, 140), type: n.type, basis: n.basis || (n.sim ? 'simulated' : 'real') }; });
        if (nodes.length < 4) { finishTask(t, 'failed', 'Not enough in the graph yet to ground a proposal; it will try again after more reading.'); return; }
        var req = { segment: seg, segment_name: SEGMENTS[seg], graph: nodes.map(function (n) { return { id: n.alias, type: n.type, text: n.label, basis: n.basis }; }), already_proposed: S.opps.map(function (o) { return o.title; }).slice(-8), repricing: board(false).slice(0, 6).map(function (r) { return r.asset + ' ' + r.expected_rerate + '% (' + r.basis + ')'; }), limits: limits().filter(function (l) { return l.status !== 'lifted'; }).slice(0, 4).map(function (l) { return l.text; }) }, rec = null, err = '';
        for (var k = 0; k < 2 && !rec; k++) { try { var out = await model(OPP_SYS, k ? Object.assign({ refused_because: err }, req) : req, 1600); rec = validateOpp(out, seg, nodes); } catch (e) { err = e.message; } }
        if (!rec) { finishTask(t, 'failed', 'Refused by the proposal gate: ' + err); return; }
        S.opps.push(rec); finishTask(t, 'done', rec.title + ': ' + rec.public_good, rec.evidence.map(function (e) { return e.id; }));
      } catch (e) { finishTask(t, 'failed', e.message); }
    }
    function validateOpp(o, seg, nodes) {
      var by = {}; nodes.forEach(function (n) { by[n.alias] = n; });
      var title = clip(o.title, 120); if (title.length < 8) throw new Error('give the proposal a title');
      if (!novel(title, S.opps.map(function (x) { return x.title; }), 0.6)) throw new Error('that proposal repeats an earlier one; propose something different');
      var ev = (o.evidence || []).map(String).filter(function (x) { return by[x]; }); if (!ev.length) throw new Error('cite at least one node id (N1, N2, …) from the graph you were given');
      var pg = clip(o.public_good, 400); if (pg.length < 40) throw new Error('say how it helps people beyond the buyer, in a sentence or two');
      var lo = num(o.value_low, 'value_low', 0), hi = num(o.value_high, 'value_high', 0); if (lo > hi) throw new Error('value_low is above value_high');
      var vb = clip(o.value_basis, 300); if (vb.length < 20) throw new Error('state the assumption behind the value range');
      var risks = (o.risks || []).map(function (x) { return clip(x, 200); }).filter(Boolean); if (!risks.length) throw new Error('state at least one risk');
      ['offer', 'deliverable', 'price_model', 'first_step', 'buyer', 'problem'].forEach(function (f) { if (clip(o[f], 400).length < 10) throw new Error('fill in ' + f); });
      var ids = ev.map(function (x) { return by[x]; }), sim = ids.filter(function (n) { return n.basis === 'simulated'; }).length;
      return { id: uid('o'), ts: now(), segment: seg, title: title, buyer: clip(o.buyer, 200), problem: clip(o.problem, 400), evidence: ids.map(function (n) { return { id: n.id, label: n.label, basis: n.basis }; }), offer: clip(o.offer, 400), deliverable: clip(o.deliverable, 300), price_model: clip(o.price_model, 240), value_low: lo, value_high: hi, value_basis: vb, public_good: pg, risks: risks, first_step: clip(o.first_step, 240), basis: sim === 0 ? 'real' : sim === ids.length ? 'simulated' : 'mixed', status: 'proposed' };
    }
    async function limitsRound() {
      var open = limits().filter(function (l) { return l.status !== 'lifted' && l.by !== 'livesim'; }).slice(0, 8); if (!open.length) return;
      var t = pushTask('sextant', 'reprice', 'Work down the limitations', 'ongoing', []); setPhase('limits', 'Choosing which limitation to work on', t.id); emit({ type: 'start', task: t });
      try {
        var out = await model(LIMITS_SYS, { limitations: open.map(function (l) { return { id: l.id, text: l.text, area: l.area, severity: l.severity, lifts_by: l.lifts_by, plan: l.plan, owner_needed: l.owner_needed, status: l.status }; }) }, 500), l = S.limits[out.id];
        if (!l || !out.plan || String(out.plan).length < 12) throw new Error('the plan did not name a limitation and a real step');
        l.plan = clip(out.plan, 300); l.owner_needed = clip(out.owner_needed || l.owner_needed, 200); l.status = out.status === 'working' ? 'working' : l.status; l.history.push({ ts: now(), by: 'sextant', status: l.status, plan: l.plan });
        finishTask(t, 'done', l.id + ': ' + l.plan, []);
      } catch (e) { finishTask(t, 'failed', e.message); }
    }
    function hire(from, name, role, prompt, why, by) {
      var q = S.nodes[from]; if (!q || (q.type !== 'question' && q.type !== 'hypothesis')) throw new Error('a post must serve a question in the graph');
      var id = slug(name).slice(0, 28) || 'watch-' + slug(from); if (S.agents.some(function (a) { return a.id === id; })) id += '-' + (S.agents.length + 1);
      if (S.agents.length >= 6) throw new Error('the fleet is full (6)');
      var a = { id: id, role: clip(role, 80) || 'watcher', where: 'child', parent: '', from_node: from, why: clip(why, 240), prompt: clip(prompt, 400), created: now(), status: 'running', items: 0, errors: 0, enabled: true, by: by, sources: [], every: 900, last_seen: now() };
      S.agents.push(a); link('staffs', [from, 'g-gpu'].filter(function (x) { return S.nodes[x]; }), 0.4); return a;
    }
    async function staffRound() {
      var un = beats().filter(function (b) { return S.nodes[b.id].type === 'question' && !S.agents.some(function (a) { return a.from_node === b.id; }); }).sort(function (x, y) { return x.support - y.support; }).slice(0, 6);
      if (!un.length || S.agents.length >= 6) return;
      var t = pushTask('sextant', 'staff', 'Decide whether the research needs a new post', 'ongoing', []); setPhase('staff', 'Deciding whether any question deserves a standing watch', t.id); emit({ type: 'start', task: t });
      try {
        var out = await model(STAFF_SYS, { unwatched: un.map(function (b) { return { id: b.id, label: clip(b.label, 100), support: Math.round(b.support * 100) / 100 }; }), fleet: S.agents.map(function (a) { return { name: a.id, role: a.role, watches: a.from_node, items: a.items }; }), sources: Object.keys(S.src).map(function (k) { return { id: k, ok: S.src[k].ok }; }) }, 700), note = clip(out.note, 300), ids = [];
        if (out.retire) { var ri = S.agents.findIndex(function (a) { return a.id === out.retire; }); if (ri >= 0) { S.agents.splice(ri, 1); note += ' Retired ' + out.retire + '.'; } }
        if (out.hire && un.some(function (b) { return b.id === out.hire.from_node; })) { var a = hire(out.hire.from_node, out.hire.name || 'watch', out.hire.role, out.hire.prompt, out.hire.why, 'sextant'); ids = [out.hire.from_node]; note = 'Hired ' + a.id + ' for ' + a.from_node + ': ' + a.why + ' ' + note; }
        finishTask(t, 'done', note, ids);
      } catch (e) { finishTask(t, 'failed', e.message); }
    }

    async function cycle() {
      if (busy) return; busy = true; S.cycles++;
      try {
        var bs = beats(), wild = S.turns % 6 === 5, beat = wild || !bs.length ? WILD : pick(bs), items = [];
        setPhase('world', 'Looking for news on ' + clip(beat.label, 70)); items = await gatherReal(beat);
        if (!items.length && mode !== 'live') { setPhase('world', 'The world agent is writing items for ' + beat.id); try { items = await simulate(beat, false); if (!items.length) items = await simulate(beat, true); } catch (e) { S.errors++; log('error', 'world: ' + e.message); } }
        S.turns++; S.beats[beat.id] = now();
        for (var k = 0; k < items.length; k++) await ingest(items[k], beat);
        var c = S.cycles; if (c % 3 === 2) await repriceRound(); else if (c % 5 === 4) await limitsRound(); else if (c % 4 === 3) await staffRound(); else if (c % 7 === 6) await proposeRound();
      } catch (e) { S.errors++; log('error', e.message); } finally { busy = false; setPhase('idle', ''); emit({ type: 'cycle' }); drain(); }
    }
    function schedule(ms) { clearTimeout(timer); nextAt = Date.now() + ms; timer = setTimeout(async function () { if (!S.paused && ready()) await cycle(); schedule(S.cycles < 2 ? 6000 : PACE[S.pace] * (0.7 + Math.random() * 0.6)); }, ms); }
    function board(pub) { var latest = {}, hist = {}; S.reprice.forEach(function (e) { var k = e.asset.toLowerCase(); latest[k] = e; (hist[k] = hist[k] || []).push([e.ts, e.expected_rerate]); }); return Object.keys(latest).map(function (k) { return Object.assign({}, latest[k], { pub: !!S.pubs[latest[k].id], history: hist[k].slice(-24), age_h: Math.round((now() - latest[k].ts) / 360) / 10 }); }).filter(function (r) { return !pub || r.pub; }).sort(function (a, b) { return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.asset < b.asset ? -1 : 1; }); }

    function drain() { if (pendingReprice && !busy) { var pa = pendingReprice; pendingReprice = ''; setTimeout(function () { api.repriceNow(pa); }, 50); } else if (pendingPropose && !busy) { var ps = pendingPropose; pendingPropose = ''; setTimeout(function () { api.proposeNow(ps === ' ' ? '' : ps); }, 50); } }
    var api = {
      ready: ready, due: due, opps: function () { return S.opps; }, proposeNow: function (seg) { if (busy) { pendingPropose = seg || ' '; return; } busy = true; (async function () { try { await proposeRound(seg); } finally { busy = false; setPhase('idle', ''); emit({ type: 'cycle' }); drain(); } })(); }, board: board, limits: limits, watchlist: function () { return WATCH; }, srcHealth: function () { return S.src; }, feed: function (n) { return S.feed.slice(0, n || 12); }, log: function (n) { return S.log.slice(0, n || 12); },
      publicLimits: function () { return limits().map(function (l) { return { id: l.id, text: l.text, area: l.area, severity: l.severity, status: l.status, lifts_by: l.lifts_by }; }); },
      snapshot: function () { return { nodes: S.nodes, edges: S.edges, agents: S.agents, tasks: S.tasks }; },
      status: function () { var f = S.feed; return { ready: ready(), mode: mode, phase: phase.name, detail: phase.detail, since: phase.since, task: phase.task || '', paused: S.paused, pace: S.pace, busy: busy, turns: S.turns, cycles: S.cycles, items: f.length, real: f.filter(function (x) { return x.real; }).length, rejected: S.rejected, calls: S.calls, errors: S.errors, nextIn: Math.max(0, Math.round((nextAt - Date.now()) / 1000)), born: S.born, src: S.src }; },
      setMode: function (m) { mode = m === 'live' ? 'live' : 'sim'; emit({ type: 'mode' }); }, setPace: function (p) { if (PACE[p]) { S.pace = p; if (timer) schedule(PACE[p]); emit({ type: 'pace' }); } },
      pause: function () { S.paused = true; emit({ type: 'pause' }); }, resume: function () { S.paused = false; if (!timer) schedule(800); emit({ type: 'pause' }); },
      start: function () { if (!timer) schedule(1200); }, stop: function () { clearTimeout(timer); timer = 0; },
      turnNow: function () { if (!busy) { clearTimeout(timer); (async function () { await cycle(); schedule(PACE[S.pace]); })(); } },
      repriceNow: function (asset) { if (busy) { pendingReprice = asset || (due(1)[0] || {}).asset || ''; return; } if (!busy) { busy = true; (async function () { try { await repriceRound(asset); } finally { busy = false; setPhase('idle', ''); emit({ type: 'cycle' }); drain(); } })(); } },
      hire: function (from, by) { var q = S.nodes[from], a = hire(from, 'watch-' + slug(from).slice(0, 20), 'watcher for ' + clip(q ? q.label : from, 40), 'Send anything that bears on this question; skip repeats.', 'The owner asked for a standing watch on this question.', by || 'owner'); S.tasks.push({ id: uid('t'), who: 'sextant', origin: '', kind: 'staff', title: 'Hired ' + a.id + ' for ' + from, state: 'done', started: now(), ts: now(), note: a.why, node_ids: [from], sim: false }); emit({ type: 'hire' }); return a; },
      fire: function (id) { var i = S.agents.findIndex(function (a) { return a.id === id; }); if (i >= 0) { S.agents.splice(i, 1); emit({ type: 'hire' }); } },
      setPub: function (id, on) { var e = S.reprice.filter(function (x) { return x.id === id; })[0]; if (!e) throw new Error('no such record'); if (on && !e.publishable) throw new Error('an entry that rests on simulated sources can never be published'); S.pubs[id] = !!on; emit({ type: 'pub' }); },
      publishNode: function (id) { var n = S.nodes[id]; if (!n) throw new Error('no such node'); if (n.sim) throw new Error('a simulated node can never be published'); n.pub = true; emit({ type: 'pub' }); },
      noteLimit: function (id, patch) { var l = S.limits[id]; if (!l) return; if (patch.status && patch.status !== 'lifted') l.status = patch.status; if (patch.plan != null) l.plan = clip(patch.plan, 300); l.history.push({ ts: now(), by: 'owner', status: l.status, plan: l.plan }); emit({ type: 'limit' }); },
      ask: async function (q, context) {
        var digest = beats().slice(0, 10).map(function (b) { return b.id + ': ' + clip(b.label, 90) + ' (' + claimsFor(b.id).length + ' claims)'; }).join('\n'), board_ = board(false).map(function (r) { return r.asset + ' ' + (r.expected_rerate > 0 ? '+' : '') + r.expected_rerate + '% (' + r.basis + ')'; }).join('; ');
        var s = await call('You are SEXTANT, the agent that runs The Threshold Institute. Answer the operator in under 120 words, from the graph digest, repricing board and limitations given; cite node ids; say what you do not know. You give no personalised financial advice.', 'GRAPH\n' + digest + '\n\nREPRICING BOARD\n' + (board_ || 'empty') + '\n\nOPEN LIMITATIONS\n' + limits().filter(function (l) { return l.status !== 'lifted'; }).slice(0, 5).map(function (l) { return l.text; }).join('\n') + '\n\nCONTEXT\n' + (context || 'none') + '\n\nQUESTION\n' + q, 450);
        log('chat', 'Asked: ' + q); emit({ type: 'chat' }); return s;
      },
      reset: function () { clearTimeout(timer); timer = 0; try { localStorage.removeItem(KEY); } catch (e) {} S = fresh(); busy = false; emit({ type: 'reset' }); schedule(1200); }
    };
    setInterval(function () { try { var raw = localStorage.getItem('threshold_livesim_cmd'); if (raw) { localStorage.removeItem('threshold_livesim_cmd'); var cm = JSON.parse(raw); if (cm.type === 'propose') api.proposeNow(cm.segment || ''); if (cm.type === 'reprice') api.repriceNow(cm.asset || ''); } } catch (e) {} }, 4000);
    return api;
  }
  window.LiveSim = { create: create };
})();
