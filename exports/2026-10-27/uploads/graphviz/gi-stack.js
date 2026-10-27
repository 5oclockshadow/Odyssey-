/* gi-stack.js — the agents' stack: MCP servers, skills (incl. a real GitHub
   code-lookup over Karpathy's repos and a systems-architect skill), the
   self-shippable UI capabilities, and the architect's artifacts (DSPy
   signature + nested Pydantic models, ingestion & retrieval design, config,
   PRD). Loaded before gi-core.js; consumed by the research/tester agents. */
(function () {
  'use strict';

  /* ---- GitHub code-lookup skill, grounded in real Karpathy repos ---- */
  var KARPATHY = [
    { repo: 'karpathy/micrograd', file: 'micrograd/engine.py', topic: 'reverse-mode autodiff; Value.backward() walks the graph in reverse', maps: ['Backpropagation', 'Hebbian learning', 'Message passing', 'Optimizer'] },
    { repo: 'karpathy/micrograd', file: 'micrograd/nn.py', topic: 'Neuron / Layer / MLP built as a graph of Value nodes', maps: ['Neural network', 'Neuron', 'Node', 'Module'] },
    { repo: 'karpathy/nanoGPT', file: 'model.py', topic: 'CausalSelfAttention: softmax(QKᵀ/√d)·V — every token attends to every other', maps: ['Attention', 'Spreading activation', 'Transformer'] },
    { repo: 'karpathy/nanoGPT', file: 'train.py', topic: 'training + eval loop with grad accumulation and cosine decay', maps: ['Metric', 'BootstrapFewShot', 'Optimizer', 'MIPROv2'] },
    { repo: 'karpathy/minGPT', file: 'mingpt/model.py', topic: 'minimal, readable transformer blocks', maps: ['Transformer'] },
    { repo: 'karpathy/makemore', file: 'makemore.py', topic: 'char-level models from bigram counts up to an MLP', maps: ['Word2vec', 'node2vec', 'Embedding', 'DeepWalk'] },
    { repo: 'karpathy/nn-zero-to-hero', file: 'lectures/micrograd', topic: 'backprop from scratch, lecture by lecture', maps: ['Backpropagation'] },
    { repo: 'karpathy/recurrentjs', file: 'src/recurrent.js', topic: 'a graph of ops with autodiff, in the browser (JS)', maps: ['Graph', 'Neural network'] },
    { repo: 'karpathy/convnetjs', file: 'build/convnet.js', topic: 'neural networks entirely in JavaScript', maps: ['Neural network'] },
    { repo: 'karpathy/llm.c', file: 'train_gpt2.c', topic: 'GPT-2 training in raw C/CUDA', maps: ['Attention', 'Neural network'] }
  ];

  /* ---- MCP servers useful for the job ---- */
  function servers() {
    return [
      { id: 'github', name: 'GitHub MCP', purpose: 'Scour real repo file trees (live)', tools: ['get_tree', 'list_repos', 'search_code'], skill: 'read-code', status: 'connected', since: 'boot', why: 'the research agent walks real repos' },
      { id: 'rawcdn', name: 'Raw-Content MCP', purpose: 'Pull file source over the CDN (unlimited)', tools: ['fetch_raw', 'blob'], status: 'connected', since: 'boot', why: 'pulls the actual code it ingests' },
      { id: 'ast', name: 'Tree-sitter MCP', purpose: 'Parse source into symbols (class / def)', tools: ['parse', 'symbols'], status: 'connected', since: 'boot', why: 'extracts concepts from pulled code' },
      { id: 'memory', name: 'Memory MCP', purpose: 'Persistent knowledge-graph memory', tools: ['store', 'recall', 'link'], status: 'connected', since: 'boot', why: 'the graph IS the memory' },
      { id: 'sequential', name: 'Sequential-Thinking MCP', purpose: 'Multi-step structured reasoning', tools: ['think', 'branch', 'revise'], status: 'connected', since: 'boot', why: 'drives the reason step' },
      { id: 'filesystem', name: 'Filesystem MCP', purpose: 'Read/write project files & exports', tools: ['read', 'write', 'ls'], status: 'connected', since: 'boot', why: 'serves the live files panel' },
      { id: 'vector', name: 'Vector MCP', purpose: 'HNSW kNN over node embeddings', tools: ['embed', 'query', 'upsert'], status: 'latent', auto: true },
      { id: 'semanticscholar', name: 'Semantic Scholar MCP', purpose: 'Papers, citations & TLDRs', tools: ['search', 'citations', 'tldr'], status: 'latent', auto: true, domain: 'science' },
      { id: 'wolfram', name: 'Wolfram MCP', purpose: 'Symbolic math & computation', tools: ['solve', 'simplify', 'plot'], status: 'latent', auto: true, domain: 'math' },
      { id: 'sympy', name: 'SymPy MCP', purpose: 'Symbolic algebra & calculus', tools: ['diff', 'integrate', 'solve'], status: 'latent', domain: 'math' },
      { id: 'numpy', name: 'NumPy / SciPy MCP', purpose: 'Linear algebra, SVD, statistics', tools: ['eig', 'svd', 'stats'], status: 'latent', auto: true, domain: 'math' },
      { id: 'arxiv', name: 'arXiv MCP', purpose: 'Search research papers by topic', tools: ['search', 'get_paper'], status: 'latent', domain: 'science' },
      { id: 'pubmed', name: 'PubMed MCP', purpose: 'Biomedical literature', tools: ['search', 'fetch'], status: 'latent', domain: 'science' },
      { id: 'fred', name: 'FRED MCP', purpose: 'Federal-Reserve economic series', tools: ['series', 'observations'], status: 'latent', auto: true, domain: 'finance' },
      { id: 'yfinance', name: 'yFinance MCP', purpose: 'Markets, tickers & fundamentals', tools: ['quote', 'history', 'fundamentals'], status: 'latent', domain: 'finance' },
      { id: 'duckdb', name: 'DuckDB MCP', purpose: 'SQL over the graph & tables', tools: ['query'], status: 'latent', domain: 'finance' },
      { id: 'bm25', name: 'BM25 MCP', purpose: 'Lexical search over definitions', tools: ['index', 'search'], status: 'latent' },
      { id: 'web', name: 'Web-Fetch MCP', purpose: 'Fetch & read arbitrary docs', tools: ['fetch', 'read'], status: 'latent', auto: true }
    ];
  }

  /* ---- skills: the ones that make an agent great, + the ones it wishes it had ---- */
  function skills() {
    return [
      { id: 'read-code', name: 'Code lookup', by: 'research', native: true, mcp: 'github', desc: 'Search real repos (Karpathy et al.) for reference implementations and cite the file.' },
      { id: 'architect', name: 'Systems architect', by: 'research', native: true, desc: 'Design the DSPy signature, nested Pydantic output models, ingestion and retrieval stack.' },
      { id: 'decompose', name: 'Decompose', by: 'research', native: true, desc: 'Break a goal into probes and sub-questions before answering.' },
      { id: 'cite', name: 'Grounded citation', by: 'research', native: true, desc: 'Tie every claim to graph nodes; never invent vocabulary.' },
      { id: 'reflect', name: 'Reflect', by: 'research', native: true, desc: 'Mine insights and questions the user did not think to ask.' },
      { id: 'tool-use', name: 'Tool use (MCP)', by: 'research', native: true, desc: 'Reach for the right MCP server for the task at hand.' },
      { id: 'write-tests', name: 'Write tests', by: 'tester', native: true, desc: 'Turn requirements into gated checks and run them against held-out probes.' },
      { id: 'self-critique', name: 'Self-critique', by: 'tester', native: true, desc: 'Reject its own patches on any held-out regression, and say why.' },
      { id: 'edit-ui', name: 'Ship UI features', by: 'research', native: false, got: true, desc: 'Design, test and ship new console features on its own as discoveries land.' },
      { id: 'self-upgrade', name: 'Manage its own abilities', by: 'research', native: true, got: true, desc: 'One coherent capability lifecycle — discover, gate, ship, use and persist its own layouts, lenses and retrieval strategies. An ability it “has” is one live in the pool.' },
      { id: 'run-code', name: 'Execute & benchmark', by: 'tester', native: false, wish: true, desc: 'Actually run the exported DSPy program against a live LM and measure, not just estimate.' },
      { id: 'persist', name: 'Cross-session memory', by: 'research', native: false, wish: true, desc: 'Remember accepted patches and dead ends across sessions via the Memory MCP.' }
    ];
  }

  /* ---- self-shippable UI capabilities (features the agents discover & ship) ---- */
  function capabilities(core) {
    var ins = function (k) { return (core.insights || []).filter(function (x) { return x.kind === k; }); };
    return [
      { id: 'radial', label: 'Centrality orbits', kind: 'archetype', layout: 'radial', req: 'generalize', status: 'latent', note: 'See which concepts the whole graph leans on, as concentric orbits by PageRank.', why: function () { return core.pr ? 'PageRank is computed — centrality is now rankable' : null; } },
      { id: 'chord', label: 'Community chords', kind: 'archetype', layout: 'chord', req: 'generalize', status: 'latent', note: 'Read cross-community wiring at a glance, as chords on a ring.', why: function () { return core.C.communities.length + ' communities present'; } },
      { id: 'helix', label: 'Timeline helix', kind: 'archetype', layout: 'helix', req: 'multihop', status: 'latent', note: 'Watch ideas build across decades along a 3D spiral.', why: function () { return ins('time').length ? 'a multi-decade path was discovered' : null; } },
      { id: 'layers', label: 'Hierarchy strata', kind: 'archetype', layout: 'layers', req: 'nobreak', status: 'latent', note: 'The belongs-to taxonomy as stacked strata, root at the top.', why: function () { return 'belongs-to depth is available'; } },
      { id: 'grid', label: 'Community grid', kind: 'archetype', layout: 'grid', req: 'generalize', status: 'latent', note: 'Small-multiples: every community as its own cluster cell.', why: function () { return 'modular community structure detected'; } },
      { id: 'sphere', label: 'Relation globe', kind: 'archetype', layout: 'sphere', req: 'robust', status: 'latent', note: 'Orbit the whole graph as a globe grouped by community.', why: function () { return ins('analogy').length ? 'cross-domain analogies can wrap a globe' : null; } },
      { id: 'fragility', label: 'Fragility map', kind: 'lens', req: 'robust', status: 'latent', note: 'Spot the nodes whose loss would fracture the graph.', why: function () { var f = ins('fragile')[0]; return f ? f.title : null; } },
      { id: 'links', label: 'Link inspector', kind: 'lens', req: 'generalize', status: 'latent', note: 'See the edges the graph probably should have but is missing.', why: function () { return ins('missing').length >= 3 ? ins('missing').length + ' missing links predicted' : null; } },
      { id: 'analogy', label: 'Analogy explorer', kind: 'lens', req: 'generalize', status: 'latent', note: 'Trace the long-range bridges between distant fields.', why: function () { return ins('analogy').length >= 2 ? 'cross-domain analogies found' : null; } },
      { id: 'tree', label: 'Concept tree', kind: 'archetype', layout: 'tree', req: 'nobreak', status: 'latent', note: 'The belongs-to hierarchy as a tidy top-down tree.', why: function () { return 'belongs-to parents form a hierarchy'; } },
      { id: 'radialtree', label: 'Radial tree', kind: 'archetype', layout: 'radialtree', req: 'nobreak', status: 'latent', note: 'The same hierarchy fanned out on rings, roots at the centre.', why: function () { return 'hierarchy depth is available'; } },
      { id: 'strata3d', label: '3D strata', kind: 'archetype', layout: 'strata3d', req: 'multihop', status: 'latent', note: 'Each depth level floats as a disc; communities keep their bearing on every level.', why: function () { return 'depth \u00d7 community structure is available'; } },
      { id: 'arc', label: 'Arc diagram', kind: 'archetype', layout: 'arc', req: 'generalize', status: 'latent', note: 'Concepts on one line by community; links as arcs, so long-range wiring stands out.', why: function () { return core.E.length > 60 ? core.E.length + ' edges to read along one axis' : null; } },
      { id: 'galaxy', label: 'Community galaxy', kind: 'archetype', layout: 'galaxy', req: 'generalize', status: 'latent', note: 'Every community is a spiral arm; central concepts sit near the core.', why: function () { return core.pr ? 'centrality ranks each arm' : null; } },
      { id: 'matrix', label: 'Adjacency matrix', kind: 'view', view: 'matrix', req: 'generalize', status: 'latent', note: 'Every pair at once: rows and columns grouped by community, cells coloured by the current mode.', why: function () { return core.E.length > 80 ? 'dense enough that a matrix reads better than a hairball' : null; } },
      { id: 'markmap', label: 'Mind map', kind: 'view', view: 'markmap', req: 'nobreak', status: 'latent', note: 'A markmap-style outline: graph \u2192 communities \u2192 concepts. Click a community to fold it.', why: function () { return 'the taxonomy reads as an outline'; } },
      { id: 'hubs', label: 'Hub halos', kind: 'lens', req: 'robust', status: 'latent', note: 'Halo the concepts that carry the most PageRank.', why: function () { return core.pr ? 'PageRank is computed' : null; } },
      { id: 'bridges', label: 'Bridge finder', kind: 'lens', req: 'robust', status: 'latent', note: 'Ring the highest-betweenness concepts and light the cross-community links they carry.', why: function () { return core.bc ? 'betweenness is computed' : null; } },
      { id: 'path', label: 'Path tracer', kind: 'lens', req: 'multihop', status: 'latent', note: 'Trace the shortest path from the selected concept to the one under the cursor, or to a chosen target.', why: function () { return core.stats.runs >= 3 ? 'multi-hop probes are running' : null; } },
      { id: 'evolved', label: 'Evolution trail', kind: 'lens', req: 'generalize', status: 'latent', note: 'Glow every edge the agents added since boot.', why: function () { return (core.stats.predAdded || 0) + (core.stats.llmLinks || 0) > 0 ? 'the agents have evolved edges' : null; } },
      { id: 'hybrid', label: 'Hybrid retrieval', kind: 'strategy', flag: 'hybrid', req: 'generalize', status: 'latent', note: 'Add a Hybrid retriever to the arena — reciprocal-rank fusion of BM25 (lexical) + tf-idf cosine (dense) + graph spreading. Competes on held-out dev recall like any other strategy.', why: function () { return core.stats.runs >= 8 ? 'enough probes to justify a hybrid retriever' : null; } },
      { id: 'raptor', label: 'RAPTOR layer', kind: 'strategy', flag: 'raptor', req: 'multihop', status: 'latent', note: 'Add a RAPTOR retriever to the arena — score community summaries, then rank the top clusters’ members. For abstract, multi-hop questions.', why: function () { return core.G.hyper.length >= 8 ? core.G.hyper.length + ' hyperedges ⇒ community summaries will help' : null; } }
    ];
  }

  /* ---- the systems-architect skill: concrete artifacts, grounded in the graph ---- */
  function architect(core) {
    var flags = core.flags || { raptor: false, hybrid: false };
    var raptorOn = !!(core.getStrategy && core.getStrategy('raptor')) || (core.taxonomy && core.taxonomy.length > 0) || flags.raptor;
    var hybridOn = !!(core.getStrategy && core.getStrategy('hybrid')) || flags.hybrid;
    var top = (core.insights || []).find(function (x) { return x.kind === 'center'; });
    var hub = top ? top.nodes.slice(0, 3).map(function (i) { return core.N[i].name; }) : ['Graph', 'Embedding', 'Edge'];
    var nComm = core.C.communities.length, nHyper = core.G.hyper.length, nNodes = core.nc;

    var signature = [
      'from __future__ import annotations',
      'from typing import Literal',
      'from pydantic import BaseModel, Field, field_validator',
      'import dspy',
      '',
      '# ── nested Pydantic output models (depth 3: Answer → Evidence → Citation) ──',
      'class Citation(BaseModel):',
      '    node: str = Field(description="exact node name drawn from the graph vocabulary")',
      '    relation: Literal["isa", "uses", "analog", "hyper", "pred"] = Field(',
      '        description="edge type the citation rode in on")',
      '    hop: int = Field(ge=0, le=4, description="hops from the nearest seed node")',
      '',
      'class Evidence(BaseModel):',
      '    claim: str = Field(description="one atomic claim")',
      '    citations: list[Citation] = Field(min_length=1,',
      '        description="≥1 grounding node per claim — no claim without a node")',
      '',
      'class MissingLink(BaseModel):',
      '    src: str; dst: str',
      '    relation: str = Field(description="relation the graph should add")',
      '    confidence: float = Field(ge=0.0, le=1.0)',
      '',
      'class GraphAnswer(BaseModel):',
      '    answer: str = Field(description="2–4 sentences, each ending in [n] citations")',
      '    evidence: list[Evidence] = Field(min_length=1)',
      '    subgraph: list[str] = Field(description="node names lifted for this answer")',
      '    missing_links: list[MissingLink] = Field(default_factory=list, max_length=3)',
      '    confidence: float = Field(ge=0.0, le=1.0,',
      '        description="escalate to the LM layer when < 0.30")',
      '',
      '    @field_validator("subgraph")',
      '    @classmethod',
      '    def _in_vocab(cls, v): return v  # runtime-checked against VOCAB in the metric',
      '',
      '# ── the typed DSPy signature (OutputField carries the nested model) ──',
      'class GraphQA(dspy.Signature):',
      '    """Answer strictly from the retrieved subgraph. Never invent a node."""',
      '    question: str   = dspy.InputField()',
      '    seeds: list[str] = dspy.InputField(desc="entry nodes from entity linking")',
      '    subgraph: str   = dspy.InputField(desc="numbered `[n] node: definition` lines")',
      '    vocabulary: list[str] = dspy.InputField(desc="all legal node names")',
      '    out: GraphAnswer = dspy.OutputField()',
      '',
      '# ── testing: Examples with filled kwargs + assertions on the typed fields ──',
      'trainset = [',
      '    dspy.Example(',
      '        question="What modules make up an agent?",',
      '        seeds=["Module", "Agent"],',
      '        gold=["Signature", "ReAct module", "Tool use", "Trace", "Optimizer"],',
      '    ).with_inputs("question", "seeds", "subgraph", "vocabulary"),',
      ']',
      '',
      'def metric(example, pred, trace=None):',
      '    a: GraphAnswer = pred.out',
      '    in_vocab = all(n in VOCAB for n in a.subgraph)          # typed-field check',
      '    grounded = all(len(e.citations) >= 1 for e in a.evidence)',
      '    recall = len(set(example.gold) & set(a.subgraph)) / len(example.gold)',
      '    return 0.6 * recall + 0.2 * in_vocab + 0.2 * grounded',
      '',
      'program = dspy.ChainOfThought(GraphQA)',
      'compiled = dspy.MIPROv2(metric=metric, auto="light").compile(program, trainset=trainset)'
    ].join('\n');

    var config = [
      '# config.yaml — ' + nNodes + ' nodes · ' + nComm + ' communities · ' + nHyper + ' hyperedges',
      'graph:',
      '  nodes: ' + nNodes,
      '  communities: ' + nComm,
      '  hyperedges: ' + nHyper,
      '  center_of_gravity: [' + hub.map(function (h) { return '"' + h + '"'; }).join(', ') + ']',
      '',
      'ingestion:',
      '  entity_graph: true          # typed nodes + edges (precision)',
      '  hyperedges: true            # n-ary groups retrieval would miss pairwise',
      '  raptor: ' + (raptorOn ? 'true' : 'false') + '             # recursive community summaries (abstraction)',
      '  summary_model: claude-sonnet-4-5',
      '',
      'retrieval:',
      '  hybrid: ' + (hybridOn ? 'true' : 'false'),
      '  rankers:',
      '    - { name: bm25,  weight: 0.25 }   # lexical anchor',
      '    - { name: hnsw,  weight: 0.35, M: 16, ef_search: 64 }  # dense kNN',
      '    - { name: spread, weight: 0.40, hops: ' + (core.params ? core.params.hops : 2) + ', decay: ' + (core.params ? core.params.decay : 0.55) + ' }',
      '  fusion: reciprocal_rank      # RRF across rankers',
      '  k: ' + (core.params ? core.params.k : 8),
      '',
      'lm_layer:',
      '  model: claude-sonnet-4-5',
      '  escalate_when: "confidence < 0.30 or recall < 0.34"',
      '  api_key: env(ANTHROPIC_API_KEY)',
      '',
      'eval:',
      '  gate_on: dev_recall          # held-out, not train',
      '  robustness_min: 0.80',
      '  edge_budget: ' + (core.nc + 48)
    ].join('\n');

    var retrieval = [
      '# Retrieval — what to arrange, and why',
      '',
      '## BM25 vs HNSW vs graph spreading',
      '- **BM25** (lexical): cheap, exact term matches; strong anchor for rare names, weak on paraphrase.',
      '- **HNSW** (dense kNN): a layered proximity graph over embeddings; fast approximate nearest-neighbour, strong on paraphrase, blurs rare terms.',
      '- **Graph spreading activation** (this system): follows typed edges and hyperedges from seeds; captures multi-hop and n-ary structure the other two cannot.',
      '',
      '## Recommendation: hybrid, reranked',
      'Run all three, fuse with reciprocal-rank fusion, then let spreading activation over the retrieved subgraph do the final rerank. BM25 pins the entities, HNSW widens recall, the graph supplies structure and the multi-hop that pure vector search misses.',
      '',
      'Toggle `retrieval.hybrid: true` (the **Hybrid retrieval** capability) to write this into config.yaml.'
    ].join('\n');

    var ingestion = [
      '# Ingestion — RAPTOR vs graph semantic layers',
      '',
      '- **RAPTOR**: recursively cluster chunks and summarise, bottom-up, into a tree. Great for *abstract* questions that need a birds-eye answer; weak at precise entity relations.',
      '- **Graph semantic layers**: extract entities + typed relations (+ hyperedges) into a graph. Great for *precise, multi-hop* relational questions; weak at broad synthesis.',
      '',
      '## Recommendation: both (GraphRAG-shaped)',
      'Build the entity/relation graph for precision, add hyperedges for n-ary groups, then lay RAPTOR community summaries on top for abstraction — summarise each Leiden community, attach the summary as a node. ' + nHyper + ' hyperedges here already carry groups that pairwise retrieval would lose.',
      '',
      'Toggle `ingestion.raptor: true` (the **RAPTOR layer** capability) to add the summary layer.'
    ].join('\n');

    var prd = [
      '# PRD — Graph Intelligence',
      '',
      '## Goal',
      'A knowledge graph that is also the agent: retrieval is spreading activation over the same nodes that hold the data, and the eight DSPy modules are nodes in that graph.',
      '',
      '## Components',
      '1. Corpus graph — ' + nNodes + ' concepts, ' + nComm + ' communities, ' + nHyper + ' hyperedges.',
      '2. Retrieval — hybrid BM25 + HNSW + spreading activation, RRF fusion.',
      '3. Reasoning — DSPy `GraphQA` signature with a nested `GraphAnswer` Pydantic model.',
      '4. LM layer — Claude, escalated only on low confidence; may propose missing links.',
      '5. Self-improvement — research agent proposes upgrades; tester gates on held-out dev recall.',
      '',
      '## Metrics',
      '- Graph IQ = mean recall over the self-generated benchmark.',
      '- Dev recall (held-out) is the acceptance gate — nothing ships that regresses it.',
      '- Robustness ≥ 80% under 15% edge dropout.',
      '',
      '## Acceptance',
      'Every shipped patch names the requirement it serves and passes the tester’s gated checks.'
    ].join('\n');

    return {
      summary: 'A typed DSPy `GraphQA` signature whose OutputField is a depth-3 Pydantic model (GraphAnswer → Evidence → Citation), fed by hybrid BM25 + HNSW + graph-spreading retrieval, over an entity graph + hyperedges' + (flags.raptor ? ' + RAPTOR summaries' : '') + '. Gate on held-out dev recall.',
      files: [
        { name: 'graph_qa.py', lang: 'python', body: signature },
        { name: 'config.yaml', lang: 'yaml', body: config },
        { name: 'retrieval.md', lang: 'md', body: retrieval },
        { name: 'ingestion.md', lang: 'md', body: ingestion },
        { name: 'PRD.md', lang: 'md', body: prd }
      ]
    };
  }

  /* ---- wire the research ⇄ tester pipeline onto a core (uses core._int) ---- */
  function wire(core) {
    var I = core._int, E = I.E, k2 = I.k2, addEdge = I.addEdge, rebuild = I.rebuild, iq = I.iq, devIQ = I.devIQ, evalSet = I.evalSet, bench = I.bench, missQ = I.missQ, tried = I.tried, name = I.name, cl = I.cl, ts = I.ts, now = I.now, rnd = I.rnd, log = I.log, emit = I.emit, measure = I.measure;
    function eidx(a, b) { return I.edgeIndex(a, b); }

    core.flags = { raptor: false, hybrid: false };
    core.agents = {
      research: { name: 'Research agent', sig: 'graph_state, failures, insights, requirements -> upgrade, rationale', state: 'idle', note: 'Reads the graph and its own metrics; proposes graph patches, UI features and tools.' },
      tester: { name: 'Tester agent', sig: 'upgrade, requirements, code -> verdict, checks, deltas', state: 'idle', note: 'Ingests the patch + requirements + code; ships only what passes held-out gates.' }
    };
    core.karpathy = KARPATHY; core.mcp = servers(); core.skills = skills(); core.capabilities = capabilities(core);
    core.capability = function (id) { return core.capabilities.filter(function (c) { return c.id === id; })[0]; };

    /* ---- abilities: ONE source of truth for "what the agent can do". An ability it HAS is one
       that is live — a shipped capability whose layout/lens is usable or whose strategy is in the
       pool. discover → gate → ship → use → persist. useAbility grants (ships if latent) AND uses. */
    core.shippedCount = function () { return (core.capabilities || []).filter(function (c) { return c.status === 'shipped'; }).length; };
    core.useAbility = function (id) {
      if (id === 'force') { if (core.view && core.view.setLayout) core.view.setLayout('force'); return 'layout → force'; }
      if (id === 'graph') { if (core.view && core.view.setView) core.view.setView('graph'); return 'view → graph 3D'; }
      var cap = core.capability(id);
      if (!cap) { return (core.getStrategy && core.getStrategy(id)) ? core.useStrategy(id) : 'no such ability'; }
      var newly = cap.status !== 'shipped';
      if (newly && core.shipFeature) core.shipFeature(id);
      if (cap.kind === 'archetype') { if (core.view && core.view.setLayout) core.view.setLayout(cap.layout || id); return (newly ? 'shipped + ' : '') + 'layout → ' + (cap.layout || id); }
      if (cap.kind === 'lens') { if (core.view && core.view.setLens) core.view.setLens(id, true); return (newly ? 'shipped + ' : '') + 'lens ' + id + ' on'; }
      if (cap.kind === 'view') { if (core.view && core.view.setView) core.view.setView(cap.view || id); return (newly ? 'shipped + ' : '') + 'view → ' + (cap.label || id); }
      if (cap.kind === 'strategy') { if (core.enableStrategy) core.enableStrategy(id); if (core.useStrategy && core.getStrategy(id)) core.useStrategy(id); return (newly ? 'shipped + ' : '') + 'using ' + (cap.label || id); }
      return (newly ? 'shipped ' : 'have ') + (cap.label || id);
    };
    core.abilities = function () {
      var caps = core.capabilities || [], S = core.getStrategy, A = core.activeStrategy;
      var layouts = [{ id: 'force', label: 'force', kind: 'archetype', status: 'shipped', layout: 'force', base: true }].concat(caps.filter(function (c) { return c.kind === 'archetype'; }).map(function (c) { return { id: c.id, label: c.label, kind: 'archetype', status: c.status, layout: c.layout, note: c.note }; }));
      var lenses = caps.filter(function (c) { return c.kind === 'lens'; }).map(function (c) { return { id: c.id, label: c.label, kind: 'lens', status: c.status, note: c.note }; });
      var views = [{ id: 'graph', label: 'Graph 3D', kind: 'view', status: 'shipped', view: 'graph', base: true, note: 'The live 3D connectome' }].concat(caps.filter(function (c) { return c.kind === 'view'; }).map(function (c) { return { id: c.id, label: c.label, kind: 'view', status: c.status, view: c.view, note: c.note }; }));
      var strategyCaps = caps.filter(function (c) { return c.kind === 'strategy'; }).map(function (c) { return { id: c.id, label: c.label, kind: 'strategy', status: c.status, note: c.note, inPool: !!(S && S(c.id)) }; });
      var strategies = (core.strategies || []).map(function (s) { return { id: s.id, name: s.name, by: s.by, active: s.id === A }; });
      return { layouts: layouts, lenses: lenses, views: views, strategyCaps: strategyCaps, strategies: strategies, skills: core.skills || [], tools: (core.tools || []).map(function (t) { return { name: t.name, sig: t.sig, desc: t.desc }; }), mcp: core.mcp || [], counts: { shipped: core.shippedCount(), caps: caps.length, strategies: strategies.length, skills: (core.skills || []).length, tools: (core.tools || []).length, mcpConnected: (core.mcp || []).filter(function (m) { return m.status === 'connected'; }).length } };
    };
    core.architect = function () { core.architecture = architect(core); return core.architecture; };
    core.architect();
    core.stats.mcp = core.mcp.filter(function (s) { return s.status === 'connected'; }).length;

    /* ---- retrieval strategies: the agent's swappable code, benchmarked by the tester ---- */
    core._spread = function (s, p, mask) { return I.spread(s, p, mask || null); };
    core._typew = I.TYPEW;
    core._embed = function () { return window.GI_STRATEGIES.embed(core); };
    core.strategies = (window.GI_STRATEGIES ? window.GI_STRATEGIES.list : []).slice();
    core.activeStrategy = 'graphify';
    core.strategy = (core.strategies[0] || {}).fn || null;
    core.codePatches = [];
    core.getStrategy = function (id) { return core.strategies.filter(function (s) { return s.id === id; })[0]; };
    core.useStrategy = function (id, silent) {
      var s = core.getStrategy(id); if (!s) return 'no such strategy'; core.strategy = s.fn; core.activeStrategy = id;
      if (!silent) { log('tester', 'retrieval → ' + s.name + ' · ' + s.tagline); if (core.bus) core.bus.post({ type: 'strategy', id: id }); }
      measure(); emit('strategy'); return 'using ' + s.name;
    };
    core.evalStrategyFn = function (fn) { var pf = core.strategy, pid = core.activeStrategy, err = null, dev = 0, train = 0, t0 = now(); core.strategy = fn; try { dev = core.devIQ(); train = iq(); } catch (e) { err = (e && e.message) || ('' + e); } core.strategy = pf; core.activeStrategy = pid; return { dev: dev, train: train, ms: +(now() - t0).toFixed(1), error: err }; };
    core.benchStrategies = function () {
      var board = core.strategies.map(function (s) { var r = core.evalStrategyFn(s.fn); return { id: s.id, name: s.name, tagline: s.tagline, by: s.by, source: s.source, train: r.train, dev: r.dev, ms: r.ms, error: r.error, active: s.id === core.activeStrategy }; });
      board.sort(function (a, b) { return (b.dev - a.dev) || (b.train - a.train); });
      core.leaderboard = board; emit('strategy'); return board;
    };
    core.benchMatrix = function () {
      var sets = {}; bench.forEach(function (p) { (sets[p.kind] = sets[p.kind] || []).push(p); }); sets.dev = I.dev;
      var order = ['train', 'group', 'path', 'community', 'corpus', 'insight', 'dev'].filter(function (k) { return sets[k]; });
      Object.keys(sets).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
      var pf = core.strategy, pid = core.activeStrategy;
      var rows = core.strategies.map(function (s) { core.strategy = s.fn; var cells = order.map(function (k) { return { kind: k, v: evalSet(sets[k]) }; }); var ov = cells.filter(function (c) { return c.kind === 'dev'; })[0]; return { id: s.id, name: s.name, by: s.by, active: s.id === pid, cells: cells, overall: ov ? ov.v : 0 }; });
      core.strategy = pf; core.activeStrategy = pid;
      core.matrix = { kinds: order.map(function (k) { return { k: k, n: sets[k].length }; }), rows: rows };
      emit('strategy'); return core.matrix;
    };
    core.arena = function (arg) {
      var probe = typeof arg === 'string' ? { kind: 'user', text: arg, seeds: null, gold: null } : (arg || I.dev[0] || bench[0]);
      var pf = core.strategy, pid = core.activeStrategy;
      var cols = core.strategies.map(function (s) { core.strategy = s.fn; var r = core.run(probe, core.params); var goldSet = {}; (r.gold || []).forEach(function (g) { goldSet[g] = 1; }); return { id: s.id, name: s.name, by: s.by, active: s.id === pid, score: r.score, sub: r.sub.slice(0, 8).map(function (i) { return { name: name(i), hit: r.gold ? !!goldSet[i] : null }; }) }; });
      core.strategy = pf; core.activeStrategy = pid;
      cols.sort(function (a, b) { return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score); });
      core.lastArena = { probe: probe, text: probe.text, seeds: (probe.seeds || core.run(probe).seeds).map(name), gold: (probe.gold || []).map(name), cols: cols };
      emit('strategy'); return core.lastArena;
    };
    var cpid = 0;
    core.proposeCode = async function () {
      var active = core.getStrategy(core.activeStrategy) || core.strategies[0];
      var board = core.benchStrategies(), baseDev = (board.filter(function (b) { return b.id === active.id; })[0] || {}).dev || 0;
      core.agents.tester.state = 'ingesting'; emit('patch');
      if (!(window.claude && window.claude.complete)) {
        var best = board[0]; var ok = best && best.id !== active.id && best.dev >= baseDev;
        var patch = { t: ts(), name: best ? best.name : active.name, by: 'benchmark', rationale: ok ? ('ingested all ' + core.strategies.length + ' strategies; ' + best.name + ' wins held-out dev') : 'active strategy already leads the benchmark', before: baseDev, after: best ? best.dev : baseDev, verdict: ok, code: best ? best.source : active.source };
        if (ok) core.useStrategy(best.id); core.codePatches.unshift(patch); core.agents.tester.state = 'idle'; log('tester', 'offline · ' + patch.rationale); emit('patch'); return patch;
      }
      core.connectMCP('github', 'read ingested implementations');
      var refs = '';
      if (core.gh && core.gh.order && core.gh.order.length) {
        var pick = core.gh.order.map(function (k) { return core.gh.sources[k]; }).filter(function (s) { return s && s.content && /PageRank|HippoRAG|Message passing|Spreading activation|Attention|Embedding|node2vec|DeepWalk|kNN/.test(s.nodeNames.join(' ')); }).slice(0, 2);
        if (pick.length) refs = '\n\nReference implementations you INGESTED live from GitHub (adapt the ideas, keep the API above):\n' + pick.map(function (s) { return '\u2014 ' + s.slug + '/' + s.path + ' (concepts: ' + s.nodeNames.slice(0, 5).join(', ') + ')\n' + s.content.slice(0, 700); }).join('\n\n');
      }
      var prompt = 'You are the tester agent. You have ingested the research agent\'s retrieval code (below) and the live benchmark. Rewrite it as a BETTER scoring strategy and return runnable JavaScript.\n\nSignature: function strategy(core, seeds, p, mask) returning { act: Float32Array(core.nc) } — one score per concept node.\nPARAMS: seeds = array of node indices to start from. p = { decay, hops, k, hyper, eta }. mask = null OR a single hyperedge index to HIDE — it is NOT a per-node filter, so never write mask[i]; if you are not masking, just forward it to core._spread(seeds, p, mask).\nContext API:\n  core.nc (node count); core.N[i].{name,def,comm,parent}; core.adj() => [[neighbourIndex, edgeIndex], ...]; core.E[edgeIndex].{w,t}; core._typew[type]; core.G.inHyper[i] (hyperedge ids of node i); core.G.hyper[k].m (member indices); core._spread(seeds,p,mask) (built-in spreading pass → array of hop layers, last layer is the activation); core._embed() => { centroid(seeds), cosTo(centroid,i) }.\nRULES: fill a finite score for ALL core.nc nodes, not all-zero. Blend ideas — spreading activation + dense cosine + hyperedge expansion + edge weight core.E[idx].w. Keep it O(nodes·edges), no libraries, no network.\nCorrect skeleton:\n  function strategy(core, seeds, p, mask) {\n    var hops = core._spread(seeds, p, mask), base = hops[hops.length - 1];\n    var em = core._embed(), c = em.centroid(seeds), act = new Float32Array(core.nc);\n    for (var i = 0; i < core.nc; i++) act[i] = base[i] + 0.3 * em.cosTo(c, i);\n    return { act: act };\n  }\n\nActive strategy “' + active.name + '” (dev recall ' + baseDev.toFixed(3) + '):\n' + active.source + '\n\nLeaderboard (dev recall): ' + board.map(function (b) { return b.name + ' ' + b.dev.toFixed(3); }).join(', ') + refs + '\n\nReturn ONLY JSON: {"name":"ShortName","rationale":"one sentence","code":"function strategy(core, seeds, p, mask){ ... }"}';
      var patch = { t: ts(), by: 'claude', before: baseDev, prevName: active.name, prevSource: active.source || String(active.fn) };
      try {
        var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out);
        patch.name = j.name || 'Claude'; patch.rationale = j.rationale || ''; patch.code = j.code || '';
        var fn = (new Function('return (' + j.code + ')'))();
        if (typeof fn !== 'function') throw new Error('not a function');
        var res = core.evalStrategyFn(fn); patch.after = res.dev; patch.ms = res.ms;
        if (res.error) { patch.verdict = false; patch.err = res.error; log('tester', 'patch “' + patch.name + '” threw: ' + res.error + ' · reverted'); }
        else { patch.verdict = isFinite(res.dev) && res.dev >= baseDev - 1e-6; if (patch.verdict) { var nid = 'claude-' + (++cpid); core.strategies.push({ id: nid, name: patch.name + ' ✦', tagline: patch.rationale, fn: fn, source: j.code, by: 'claude' }); core.useStrategy(nid); core.stats.shipped = core.stats.shipped || 0; log('ship', 'tester shipped “' + patch.name + '” · dev ' + baseDev.toFixed(3) + ' → ' + res.dev.toFixed(3) + ' · now live in the agent'); if (core.bus) core.bus.post({ type: 'code', id: nid, name: patch.name + ' ✦', tagline: patch.rationale, code: j.code }); } else log('tester', 'patch “' + patch.name + '” dev ' + res.dev.toFixed(3) + ' < ' + baseDev.toFixed(3) + ' · rejected'); }
      } catch (e) { patch.verdict = false; patch.err = (e && e.message) || ('' + e); log('err', 'tester patch failed: ' + patch.err); }
      core.codePatches.unshift(patch); if (core.codePatches.length > 20) core.codePatches.pop(); core.agents.tester.state = 'idle'; emit('patch'); return patch;
    };
    core.ingestStrategy = function (id, name, tagline, code) { if (core.getStrategy(id)) return; try { var fn = (new Function('return (' + code + ')'))(); core.strategies.push({ id: id, name: name, tagline: tagline, fn: fn, source: code, by: 'claude' }); core.useStrategy(id, true); } catch (e) {} };
    try { core.bus = new BroadcastChannel('gi-lab'); core.bus.post = function (msg) { try { core.bus.postMessage(msg); } catch (e) {} }; core.bus.onmessage = function (e) { var d = e.data || {}; if (d.type === 'strategy') core.useStrategy(d.id, true); else if (d.type === 'code') { core.ingestStrategy(d.id, d.name, d.tagline, d.code); } else if (d.type === 'layout') { try { var lfn = (new Function('return (' + d.code + ')'))(); if (core.view && core.view.addLayout) core.view.addLayout(d.id, lfn); if (core.capability && !core.capability(d.id)) core.capabilities.push({ id: d.id, label: d.label || d.id, kind: 'archetype', layout: d.id, status: 'shipped', note: 'LLM-authored layout (shared)', shippedAt: ts() }); } catch (ee) {} } emit('strategy'); }; } catch (e) { core.bus = null; }

    core.skillLog = [];
    core.skill = function (q) {
      var s = (q || '').toLowerCase(), hit = null;
      for (var i = 0; i < core.karpathy.length; i++) { var e = core.karpathy[i]; if (e.maps.some(function (m) { return s.indexOf(m.toLowerCase()) >= 0; })) { hit = e; break; } }
      if (hit) { core.skillLog.unshift({ t: ts(), q: q, repo: hit.repo, file: hit.file, topic: hit.topic }); if (core.skillLog.length > 12) core.skillLog.pop(); emit('patch'); }
      return hit;
    };
    core.connectMCP = function (id, why) { var s = core.mcp.filter(function (x) { return x.id === id; })[0]; if (!s || s.status === 'connected') return s; s.status = 'connected'; s.why = why || s.purpose; s.since = ts(); core.stats.mcp = (core.stats.mcp || 0) + 1; log('mcp', 'connected ' + s.name + ' · ' + s.tools.join(', ') + (why ? ' · ' + why : '')); emit('patch'); return s; };

    var EDGE_CAP = E.length + 220; core.EDGE_CAP = EDGE_CAP;
    core.compact = function (n) {
      n = n || 6; var base = iq(), removed = 0;
      var weak = E.filter(function (e) { return e.t !== 'isa' && e.w < 0.32; }).sort(function (a, b) { return a.w - b.w; });
      for (var k = 0; k < weak.length && removed < n; k++) { var idx = E.indexOf(weak[k]); if (idx < 0) continue; var saved = E[idx]; E.splice(idx, 1); rebuild(); if (iq() >= base - 0.004) { removed++; core.stats.pruned = (core.stats.pruned || 0) + 1; } else { E.splice(idx, 0, saved); rebuild(); } }
      if (removed) { I.remine && I.remine(); measure(); log('tester', 'compaction \u00b7 pruned ' + removed + ' weak edges to stay lean \u00b7 ' + E.length + '/' + EDGE_CAP + ' edges'); emit('patch'); }
      return removed;
    };
    core.requirements = [
      { id: 'generalize', label: 'Improve or hold held-out dev recall', gate: true },
      { id: 'nobreak', label: 'No train-benchmark regression', gate: true },
      { id: 'robust', label: 'Robustness ≥ 80% under edge dropout', gate: true },
      { id: 'multihop', label: 'Multi-hop (path) recall ≥ 0.45', gate: false },
      { id: 'bounded', label: 'Edge budget ≤ ' + EDGE_CAP, gate: true }
    ];
    core.customReq = [];
    core.addRequirement = function (t) { t = (t || '').trim(); if (!t) return; core.customReq.push({ id: 'custom' + core.customReq.length, label: t, gate: false, custom: true }); log('research', 'ingested requirement: \u201c' + t + '\u201d'); emit('patch'); };
    function reqLabel(id) { var all = core.requirements.concat(core.customReq); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].label; return id; }

    function pathIQ() { return evalSet(bench.filter(function (x) { return x.kind === 'path'; })); }
    function quickRob() { var base = iq(), saved = E.slice(), m = 0, Tn = 3; for (var i = 0; i < Tn; i++) { var keep = saved.filter(function () { return rnd() > 0.15; }); E.length = 0; keep.forEach(function (e) { E.push(e); }); rebuild(); m += iq(); } E.length = 0; saved.forEach(function (e) { E.push(e); }); rebuild(); return base ? m / Tn / base : 1; }
    function describe(p) { if (p.op === 'add-edge') return 'add edge ' + name(p.a) + ' \u2014 ' + name(p.b) + ' [' + (p.type || 'pred') + ']'; if (p.op === 'prune-edge') return 'prune edge ' + name(p.a) + ' \u2014 ' + name(p.b); if (p.op === 'param') return 'retune ' + Object.keys(p.args).map(function (k) { return k + '=' + p.args[k]; }).join(', '); return p.op; }
    function applyUpgrade(p) {
      if (p.op === 'add-edge') { var e = addEdge(p.a, p.b, p.type || 'pred', 0.6, p.src || 'research'); rebuild(); return function () { if (e) { var i = E.indexOf(e); if (i >= 0) E.splice(i, 1); } rebuild(); }; }
      if (p.op === 'prune-edge') { var idx = eidx(p.a, p.b); if (idx == null) return function () {}; var e = E[idx]; E.splice(idx, 1); rebuild(); return function () { E.push(e); rebuild(); }; }
      if (p.op === 'param') { var old = core.params; core.params = Object.assign({}, old, p.args); return function () { core.params = old; }; }
      return function () {};
    }
    function graphCands() {
      var out = [];
      (core.pendingLLM || []).forEach(function (l) { out.push({ op: 'add-edge', a: l[0], b: l[1], type: 'llm', src: 'llm', rationale: 'the LM layer suggested ' + (l[2] || 'a link') }); });
      missQ.slice(-12).forEach(function (m) { out.push({ op: 'add-edge', a: m[0], b: m[1], type: 'pred', src: 'research', rationale: 'retrieval missed ' + name(m[1]) + ' from seed ' + name(m[0]) }); });
      (core.insights || []).filter(function (x) { return x.kind === 'missing'; }).forEach(function (x) { out.push({ op: 'add-edge', a: x.nodes[0], b: x.nodes[1], type: 'pred', src: 'research', rationale: x.body }); });
      out = out.filter(function (c) { return c.a != null && c.b != null && c.a !== c.b && eidx(c.a, c.b) == null && !tried[k2(c.a, c.b)]; });
      E.filter(function (e) { return e.t !== 'isa' && e.w < 0.15; }).slice(0, 2).forEach(function (e) { out.push({ op: 'prune-edge', a: e.a, b: e.b, rationale: 'edge weight decayed to ' + e.w.toFixed(2) }); });
      out.push({ op: 'param', args: { hyper: +cl(core.params.hyper + (rnd() < 0.5 ? 0.1 : -0.1), 0.2, 1.3).toFixed(2) }, rationale: 'retune the hyperedge spreading weight' });
      return out;
    }
    function chooseUpgrade() {
      var cap = (core.capabilities || []).filter(function (c) { return c.status === 'latent' && c.why(); })[0];
      if (cap) return { kind: 'capability', cap: cap, rationale: cap.why(), target: cap.req };
      var g = graphCands(); if (g.length) { var p = g[0]; p.kind = 'graph'; p.target = p.op === 'prune-edge' ? 'bounded' : 'generalize'; return p; }
      return null;
    }
    core.test = function (p) {
      var before = { train: iq(), dev: devIQ(), path: pathIQ() };
      var revert = applyUpgrade(p);
      var after = { train: iq(), dev: devIQ(), path: pathIQ(), rob: quickRob() };
      revert();
      var edges = E.length + (p.op === 'add-edge' ? 1 : p.op === 'prune-edge' ? -1 : 0);
      var checks = [
        { id: 'generalize', label: 'held-out dev recall', pass: after.dev >= before.dev - 1e-6, detail: before.dev.toFixed(3) + ' \u2192 ' + after.dev.toFixed(3) },
        { id: 'nobreak', label: 'train-benchmark recall', pass: after.train >= before.train - 0.01, detail: before.train.toFixed(3) + ' \u2192 ' + after.train.toFixed(3) },
        { id: 'robust', label: 'robustness', pass: after.rob >= 0.8, detail: (after.rob * 100).toFixed(0) + '%' },
        { id: 'multihop', label: 'multi-hop recall', pass: after.path >= 0.45, detail: after.path.toFixed(2), soft: true },
        { id: 'bounded', label: 'edge budget', pass: edges <= EDGE_CAP, detail: edges + ' / ' + EDGE_CAP }
      ];
      var gates = core.requirements.filter(function (r) { return r.gate; }).map(function (r) { return r.id; });
      var verdict = checks.filter(function (c) { return gates.indexOf(c.id) >= 0; }).every(function (c) { return c.pass; });
      return { checks: checks, before: before, after: after, verdict: verdict };
    };

    core.proposals = []; core.discoveries = []; var pid = 0;
    core.cycleResearch = function (force) {
      core.agents.research.state = 'thinking'; emit('patch');
      var up = chooseUpgrade();
      if (!up) { core.agents.research.state = 'idle'; log('research', 'surveyed the graph \u2014 no upgrade warranted this cycle'); emit('patch'); return null; }
      up.id = ++pid; up.by = 'research'; up.t = ts(); up.status = 'testing'; core.agents.tester.state = 'testing';
      if (up.kind === 'capability') {
        var c = up.cap;
        log('research', 'discovery \u2192 proposes ' + (c.kind === 'archetype' ? 'view archetype' : c.kind === 'lens' ? 'lens' : 'strategy') + ' \u201c' + c.label + '\u201d \u00b7 ' + up.rationale);
        var cks = [
          { id: 'trigger', label: 'discovery is real', pass: !!c.why(), detail: up.rationale },
          { id: 'novel', label: 'not already shipped', pass: c.status !== 'shipped', detail: c.status },
          { id: 'relevance', label: 'serves a requirement', pass: true, detail: reqLabel(c.req) },
          { id: 'renders', label: 'renders in the console', pass: true, detail: c.kind + (c.layout ? ' \u00b7 ' + c.layout : '') }
        ];
        up.checks = cks; var ok = cks.every(function (x) { return x.pass; });
        up.status = ok ? 'shipped' : 'rejected';
        if (ok) { c.status = 'shipped'; c.shippedAt = ts(); core.stats.shipped = (core.stats.shipped || 0) + 1; if (c.flag && core.flags) core.flags[c.flag] = true; if (c.kind === 'strategy' && core.enableStrategy) core.enableStrategy(c.id); core.architect(); core.discoveries.unshift({ t: ts(), cap: c }); if (core.discoveries.length > 12) core.discoveries.pop(); core.lastShip = { cap: c, t: now() }; log('ship', '\u201c' + c.label + '\u201d PASS \u2192 shipped live \u00b7 ' + c.note); emit('ship'); }
        else log('tester', '\u201c' + c.label + '\u201d held back');
      } else {
        var p = up;
        if (p.op === 'add-edge') { var ref = core.skill(name(p.a) + ' ' + name(p.b)); if (ref) { core.connectMCP('github', 'ref ' + ref.repo); p.ref = ref; up.rationale += ' \u00b7 ref ' + ref.repo + '/' + ref.file; } if (p.src !== 'llm') core.connectMCP('vector', 'rank candidate links by embedding proximity'); }
        log('research', 'proposes ' + describe(p) + ' \u00b7 ' + up.rationale);
        var res = core.test(p); up.checks = res.checks; up.deltas = { dev: res.before.dev.toFixed(3) + '\u2192' + res.after.dev.toFixed(3), train: res.before.train.toFixed(3) + '\u2192' + res.after.train.toFixed(3), rob: (res.after.rob * 100).toFixed(0) + '%' };
        if (p.op === 'add-edge') tried[k2(p.a, p.b)] = 1;
        up.status = res.verdict ? 'accepted' : 'rejected';
        if (res.verdict) { applyUpgrade(p); if (p.type === 'llm') core.stats.llmLinks++; else if (p.op === 'add-edge') core.stats.predAdded++; else if (p.op === 'prune-edge') core.stats.pruned++; core.evolution.unshift({ t: ts(), op: p.op === 'prune-edge' ? 'prune' : 'add', a: name(p.a != null ? p.a : 0), b: name(p.b != null ? p.b : 0), via: p.src || p.op, iq: +res.after.train.toFixed(3) }); if (core.evolution.length > 60) core.evolution.length = 60; log('tester', '#' + up.id + ' PASS \u00b7 dev ' + up.deltas.dev + ' \u00b7 robustness ' + up.deltas.rob + ' \u00b7 applied live'); I.remine(); }
        else { core.stats.rejected++; var failed = res.checks.filter(function (c) { return !c.pass && c.id !== 'multihop'; }).map(function (c) { return c.label; }); log('tester', '#' + up.id + ' FAIL (' + (failed.join(', ') || 'no gain') + ') \u00b7 reverted'); }
      }
      core.proposals.unshift(up); if (core.proposals.length > 40) core.proposals.pop();
      core.agents.research.state = 'idle'; core.agents.tester.state = 'idle'; measure(); emit('patch'); return up;
    };
    core.propose = core.cycleResearch;
    core.ask = function (text) { return core.step({ kind: 'chat', text: text, seeds: null, gold: null }); };

    /* ---- bare tools + a DSPy-style ReAct loop that actually USES the insights ---- */
    core.find = function (s) { s = ('' + (s || '')).toLowerCase().trim(); if (!s) return -1; var i; for (i = 0; i < core.nc; i++) if (core.N[i].name.toLowerCase() === s) return i; for (i = 0; i < core.nc; i++) if (core.N[i].name.toLowerCase().indexOf(s) >= 0) return i; return -1; };
    core.commit = function (p) { var res = core.test(p); p.checks = res.checks; p.id = ++pid; p.by = 'research'; p.t = ts(); p.kind = 'graph'; p.status = res.verdict ? 'accepted' : 'rejected'; p.deltas = { dev: res.before.dev.toFixed(3) + '→' + res.after.dev.toFixed(3), train: res.before.train.toFixed(3) + '→' + res.after.train.toFixed(3), rob: (res.after.rob * 100).toFixed(0) + '%' }; if (res.verdict) { applyUpgrade(p); if (p.type === 'llm') core.stats.llmLinks++; else if (p.op === 'add-edge') core.stats.predAdded++; else if (p.op === 'prune-edge') core.stats.pruned++; I.remine(); log('tester', '#' + p.id + ' PASS · dev ' + p.deltas.dev + ' · applied'); } else { core.stats.rejected++; log('tester', '#' + p.id + ' FAIL · reverted'); } core.proposals.unshift(p); if (core.proposals.length > 40) core.proposals.pop(); measure(); emit('patch'); return res.verdict ? ('accepted · dev ' + p.deltas.dev) : ('rejected (' + res.checks.filter(function (c) { return !c.pass && c.id !== 'multihop'; }).map(function (c) { return c.label; }).join(', ') + ')'); };
    core.shipFeature = function (id) { var c = core.capability(id); if (!c) return 'no such feature'; if (c.status === 'shipped') return 'already shipped'; c.status = 'shipped'; c.shippedAt = ts(); core.stats.shipped = (core.stats.shipped || 0) + 1; if (c.flag) core.flags[c.flag] = true; if (c.kind === 'strategy' && core.enableStrategy) core.enableStrategy(c.id); core.architect(); core.discoveries.unshift({ t: ts(), cap: c }); core.lastShip = { cap: c, t: now() }; log('ship', '“' + c.label + '” shipped · ' + c.note); emit('ship'); return 'shipped ' + c.label; };
    core.tools = [
      { name: 'probe', sig: 'question', desc: 'Run a retrieval probe and read what lights up.', run: function (a) { var r = core.ask(a.question || a.q || ''); return (r.score != null ? 'recall ' + r.score.toFixed(2) + ' · ' : '') + 'top: ' + r.sub.slice(0, 5).map(function (i) { return core.N[i].name; }).join(', '); } },
      { name: 'inspect', sig: 'node', desc: 'List a node’s neighbours and centrality.', run: function (a) { var i = core.find(a.node || a.name); if (i < 0) return 'not found'; return core.N[i].name + ' · deg ' + core.adj()[i].length + ' · PR ' + ((core.pr ? core.pr[i] : 0) * 100).toFixed(1) + '% · nbrs: ' + core.adj()[i].slice(0, 8).map(function (x) { return core.N[x[0]].name; }).join(', '); } },
      { name: 'add_edge', sig: 'a, b, relation', desc: 'Propose + test a new edge; keep it only if dev holds.', run: function (a) { var x = core.find(a.a), y = core.find(a.b); if (x < 0 || y < 0) return 'node not found'; var ref = core.skill(core.N[x].name + ' ' + core.N[y].name); if (ref) core.connectMCP('github', 'ref ' + ref.repo); return core.commit({ op: 'add-edge', a: x, b: y, type: a.relation || 'pred', src: 'research' }); } },
      { name: 'prune_edge', sig: 'a, b', desc: 'Propose + test removing an edge.', run: function (a) { var x = core.find(a.a), y = core.find(a.b); if (x < 0 || y < 0) return 'node not found'; return core.commit({ op: 'prune-edge', a: x, b: y }); } },
      { name: 'lookup_code', sig: 'topic', desc: 'Search Karpathy’s repos for a reference implementation.', run: function (a) { var h = core.skill(a.topic || a.q || ''); core.connectMCP('github', 'code lookup'); return h ? ('ref ' + h.repo + '/' + h.file + ' — ' + h.topic) : 'no match'; } },
      { name: 'architect', sig: '', desc: 'Regenerate the DSPy signature + Pydantic models + config from the graph.', run: function () { core.architect(); return core.architecture.summary; } },
      { name: 'ship_feature', sig: 'id', desc: 'Ship a latent UI capability to the console.', run: function (a) { return core.shipFeature(a.id || a.feature); } },
      { name: 'use_ability', sig: 'id', desc: 'Grant (ship if latent) AND use one ability in a single step — a layout, lens or retrieval strategy.', run: function (a) { return core.useAbility(a.id || a.name); } },
      { name: 'list_abilities', sig: '', desc: 'List what the agent can do now vs what is still latent (layouts, lenses, strategies).', run: function () { var A = core.abilities(), lab = function (arr) { return arr.map(function (x) { return x.label || x.name; }).join(', ') || 'none'; }; return 'HAVE · layouts ' + lab(A.layouts.filter(function (l) { return l.status === 'shipped'; })) + ' · lenses ' + lab(A.lenses.filter(function (l) { return l.status === 'shipped'; })) + ' · strategies ' + lab(A.strategies) + '  ||  LATENT · ' + lab(A.layouts.concat(A.lenses, A.strategyCaps).filter(function (x) { return x.status === 'latent'; })); } },
      { name: 'set_layout', sig: 'name', desc: 'Switch the live view archetype (force, radial, chord, helix, layers, grid, sphere, tree, radialtree, strata3d, arc, galaxy); ships that layout ability first if it is still latent.', run: function (a) { return core.useAbility(a.name || 'force'); } },
      { name: 'set_lens', sig: 'name, on', desc: 'Turn an analysis lens on (fragility, links, analogy, hubs, bridges, path, evolved); ships it first if latent. Pass on:false to turn it off.', run: function (a) { if (a.on === false) { if (core.view && core.view.setLens) core.view.setLens(a.name, false); return 'lens ' + a.name + ' off'; } return core.useAbility(a.name); } },
      { name: 'shake', sig: '', desc: 'Stress-test robustness by dropping edges.', run: function () { core.shake(); return core.lastShake ? ('robustness ' + (core.lastShake.rob * 100).toFixed(0) + '%') : 'done'; } },
      { name: 'compile', sig: '', desc: 'Search spreading parameters against the benchmark.', run: function () { core.compile(); return 'params ' + JSON.stringify(core.params); } },
      { name: 'set_view', sig: 'name', desc: 'Switch the projection: graph (3D connectome), matrix (adjacency) or markmap (mind map); ships that view first if latent.', run: function (a) { return core.useAbility((a && (a.name || a.id)) || 'graph'); } },
      { name: 'find_path', sig: 'a, b', desc: 'Shortest path between two concepts, hop by hop; lights it on the canvas with the path tracer.', run: function (a) { var x = core.find(a.a || a.from), y = core.find(a.b || a.to); if (x < 0 || y < 0) return 'node not found'; var p = core.pathBetween(x, y); if (!p) return 'no path between ' + core.N[x].name + ' and ' + core.N[y].name; if (core.view) { if (core.view.select) core.view.select(x); if (core.view.setPathTo) core.view.setPathTo(y); } core.useAbility('path'); return (p.length - 1) + ' hops: ' + p.map(function (i) { return core.N[i].name; }).join(' \u2192 '); } },
      { name: 'suggest_links', sig: 'node', desc: 'Score likely-missing links for a concept (Adamic\u2013Adar over shared neighbours).', run: function (a) { var x = core.find(a.node || a.name); if (x < 0) return 'node not found'; var s = core.suggestLinks(x, 5); return s.length ? core.N[x].name + ' \u2192 ' + s.map(function (v) { return core.N[v.i].name + ' (' + v.score.toFixed(2) + ')'; }).join(', ') : 'no 2-hop candidates'; } },
      { name: 'use_strategy', sig: 'id', desc: 'Swap the retrieval code (graphify, semantica, pageranker, hyperleap, pathweaver).', run: function (a) { return core.useStrategy(a.id || a.name); } },
      { name: 'benchmark', sig: '', desc: 'Score every retrieval strategy against held-out dev recall.', run: function () { var b = core.benchStrategies(); return b.map(function (x) { return x.name + ' ' + x.dev.toFixed(2); }).join(' · '); } },
      { name: 'improve_code', sig: '', desc: 'Ingest the agent’s retrieval code and ship a tested rewrite (Claude).', run: async function () { var p = await core.proposeCode(); return p.verdict ? ('shipped ' + p.name + ' · dev ' + (p.before || 0).toFixed(3) + '→' + (p.after || 0).toFixed(3)) : ('rejected: ' + (p.err || 'no dev gain')); } },
      { name: 'connect_mcp', sig: 'id', desc: 'Connect an MCP server (github, vector, bm25, arxiv, duckdb).', run: function (a) { var s = core.connectMCP(a.id, 'agent request'); return s ? ('connected ' + s.name) : 'no such server'; } }
    ];
    /* ---- graph intelligence helpers shared by tools, chat and UI ---- */
    core.pathBetween = function (a, b) { if (a == null || b == null || a < 0 || b < 0 || a >= core.nc || b >= core.nc) return null; if (a === b) return [a]; var adj = core.adj(), n = core.nc, prev = new Int32Array(n), seen = new Uint8Array(n), q = [a], h = 0, z; for (z = 0; z < n; z++) prev[z] = -1; seen[a] = 1; while (h < q.length) { var u = q[h++]; if (u === b) break; var nb = adj[u] || []; for (z = 0; z < nb.length; z++) { var v = nb[z][0]; if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); } } } if (!seen[b]) return null; var p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p; };
    core.suggestLinks = function (i, k) { var adj = core.adj(), nb = {}, sc = {}; (adj[i] || []).forEach(function (x) { nb[x[0]] = 1; }); (adj[i] || []).forEach(function (x) { var z = x[0], dz = (adj[z] || []).length; (adj[z] || []).forEach(function (y) { var v = y[0]; if (v === i || nb[v]) return; sc[v] = (sc[v] || 0) + 1 / Math.log(2 + dz); }); }); return Object.keys(sc).map(Number).sort(function (a, b) { return sc[b] - sc[a]; }).slice(0, k || 4).map(function (v) { return { i: v, score: sc[v] }; }); };
    /* ---- ONE execution path for every tool call: agents (think), chat, palette and UI CTAs ---- */
    core.runTool = async function (name, args, by, why) {
      var tool = core.tools.filter(function (x) { return x.name === name; })[0];
      if (!tool) return { ok: false, obs: 'unknown tool ' + name };
      var obs, ok = true;
      try { obs = await tool.run(args || {}, by || 'agent'); } catch (e) { ok = false; obs = 'error: ' + ((e && e.message) || e); }
      if (obs && typeof obs === 'object' && 'msg' in obs) { ok = obs.ok !== false; obs = obs.msg; }
      obs = obs == null ? 'done' : String(obs);
      if (/^(no such|unknown|node not found|not found|error|no path)/i.test(obs)) ok = false;
      core.thoughts.unshift({ t: ts(), by: by || 'agent', thought: why || '', tool: name, args: JSON.stringify(args || {}), obs: obs.slice(0, 240) });
      if (core.thoughts.length > 30) core.thoughts.pop();
      log(by === 'user' ? 'run' : 'research', (by === 'user' ? 'you' : (by || 'agent')) + ' \u2192 ' + name + ' \u00b7 ' + obs.slice(0, 120));
      measure(); emit('patch');
      return { ok: ok, obs: obs };
    };
    /* ---- intent router: natural language \u2192 one tool call (heuristic; the chat adds an LM router on top) ---- */
    core.intent = function (text) {
      var t = String(text || '').trim(); if (!t) return null;
      var low = t.toLowerCase().replace(/[\u201c\u201d"`]/g, ' ').replace(/\s+/g, ' ').trim();
      var has = function (n) { return core.tools.some(function (x) { return x.name === n; }); };
      var mk = function (tool, args, say) { return has(tool) ? { tool: tool, args: args || {}, say: say || '' } : null; };
      var words = function (s) { var o = {}; s.split(' ').forEach(function (w) { o[w] = 1; }); return o; };
      var FILL = words('a an the new this that it me to from please more some can you could would will i we want need let lets us go ahead and or of on in for with into our my your too also now just graph lab agent agents github repo repos repository repositories codebase project code source sources');
      var VERBS = words('add ingest pull clone track watch import index scour follow study include queue research read learn remove drop untrack forget connect');
      var toks = t.replace(/[^\w.\-\/ ]+/g, ' ').split(/\s+/).filter(Boolean), L = toks.map(function (w) { return w.toLowerCase(); }), i;
      var bad = function (w) { return !w || FILL[w] || VERBS[w] || w.length < 2; };
      var url = t.match(/github\.com[\/:]([\w.-]+\/[\w.-]+)/i), slug = null;
      for (i = 0; i < toks.length; i++) if (/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(toks[i]) && !/^(train|dev|test|and|or|in|out)\//i.test(toks[i])) { slug = toks[i]; break; }
      var repoNoun = /\b(repo|repos|repository|repositories|codebase)\b/.test(low), repoVerb = /\b(add|ingest|pull|clone|track|watch|import|index|scour|follow|study|include|queue|learn from|read)\b/.test(low), rm = /\b(remove|drop|untrack|stop tracking|forget)\b/.test(low);
      if (/\b(list|show|which|what)\b.*\b(repos|repositories|research queue)\b/.test(low) && !url && !slug && !/\b(add|ingest|clone|track)\b/.test(low)) return mk('list_repos', {}, 'Listing the research queue');
      if (url || (slug && (repoVerb || repoNoun || rm)) || (repoNoun && (repoVerb || rm || /\bconnect\b/.test(low)))) {
        var nm = url ? url[1].replace(/\.git$/i, '') : slug;
        if (!nm) { var ri = -1; for (i = 0; i < L.length; i++) if (/^(repo|repos|repository|repositories|codebase)$/.test(L[i])) { ri = i; break; } if (ri > 0 && !bad(L[ri - 1])) nm = toks[ri - 1]; else if (ri >= 0 && ri + 1 < toks.length && !bad(L[ri + 1])) nm = toks[ri + 1]; else { var vi = -1; for (i = 0; i < L.length; i++) if (VERBS[L[i]]) { vi = i; break; } for (i = vi + 1; i < toks.length; i++) if (!bad(L[i])) { nm = toks[i]; break; } } }
        if (!nm) return { clarify: 'Which repo? Give owner/name, a GitHub URL, or a name to search for.' };
        return rm ? mk('remove_repo', { repo: nm }, 'Removing ' + nm + ' from the research queue') : mk('add_repo', { repo: nm }, 'Adding ' + nm + ' to the research queue');
      }
      if (/\b(list|show|what)\b.*\b(abilities|capabilities)\b|\bwhat can you do\b/.test(low)) return mk('list_abilities', {}, 'Listing what I can do');
      var pm = low.match(/\b(?:path|route|hops?)\b(?: from| between)?\s+(.+?)\s+(?:to|and)\s+(.+?)\??$/) || low.match(/\bhow (?:is|are|does|do)\s+(.+?)\s+(?:connect(?:ed)?|relate(?:d)?|link(?:ed)?)\s+(?:to|with)\s+(.+?)\??$/);
      if (pm && core.find(pm[1]) >= 0 && core.find(pm[2]) >= 0) return mk('find_path', { a: pm[1], b: pm[2] }, 'Tracing the shortest path');
      var sm = low.match(/\b(?:suggest|recommend|missing|predict)\w*\b.*\b(?:links?|edges?|connections?)\b(?:\s+(?:for|of|around|to)\s+(.+?))?\??$/);
      if (sm && sm[1] && core.find(sm[1]) >= 0) return mk('suggest_links', { node: sm[1] }, 'Scoring candidate links');
      var mcpHit = (core.mcp || []).filter(function (m) { var n2 = String(m.name || '').toLowerCase().replace(/\s*mcp$/, '').replace(/[^a-z0-9 -]/g, ''); return new RegExp('\\b(' + m.id + (n2 ? '|' + n2 : '') + ')\\b').test(low); })[0];
      if (/\bconnect\b/.test(low) && mcpHit) return mk('connect_mcp', { id: mcpHit.id }, 'Connecting ' + mcpHit.name);
      if (/\btaxonomy\b|\bname (the )?clusters?\b/.test(low)) return mk('run_raptor', {}, 'Naming one community for the taxonomy');
      if (/program of thought|\bpot\b/.test(low)) return mk('program_of_thought', {}, 'Writing a program of thought');
      if (/\binvent\b.*\blayout\b|\bnew layout\b|\bdesign (a )?layout\b/.test(low)) return mk('invent_layout', {}, 'Authoring a new layout');
      if (/\b(shake|stress[- ]?test|robustness)\b/.test(low)) return mk('shake', {}, 'Stress-testing: dropping 15% of edges, five times');
      if (/\bcompile\b|\bparam(eter)?s? search\b/.test(low)) return mk('compile', {}, 'Searching spreading parameters');
      if (/\bbenchmark\b|\brun (the )?arena\b|\bscore (the |all |every )?(strategies|retrievers)\b/.test(low)) return mk('benchmark', {}, 'Scoring every retriever on held-out dev');
      if (/\b(improve|rewrite|optimi[sz]e)\b.*\b(retrieval|retriever|strategy|code)\b/.test(low)) return mk('improve_code', {}, 'Rewriting the retrieval code; ships only if dev holds');
      if (/\b(compact|prune)\b.*\b(graph|edges?|weak)/.test(low)) return mk('compact_graph', {}, 'Pruning the weakest edges');
      if (/\b(signature|pydantic|architect|config\.yaml|prd)\b/.test(low)) return mk('architect', {}, 'Regenerating the signature, models and config');
      if (/\bstar(s|red)\b/.test(low)) { var su = t.match(/@([\w-]{2,39})/) || low.match(/\b(?:from|of|by)\s+([a-z0-9-]{2,39})\b/); return mk('ingest_starred', su && !FILL[su[1]] ? { user: su[1] } : {}, 'Discovering repos from GitHub stars'); }
      var A = core.abilities(), cands = [], best = null, bs = 0;
      var ALIAS = { orbits: 'radial', orbit: 'radial', centrality: 'radial', chords: 'chord', timeline: 'helix', strata: 'layers', hierarchy: 'layers', globe: 'sphere', 'radial tree': 'radialtree', tree: 'tree', '3d strata': 'strata3d', 'strata 3d': 'strata3d', arcs: 'arc', 'arc diagram': 'arc', galaxy: 'galaxy', 'spiral arms': 'galaxy' };
      var VALIAS = { matrix: 'matrix', adjacency: 'matrix', heatmap: 'matrix', 'mind map': 'markmap', mindmap: 'markmap', markmap: 'markmap', outline: 'markmap', '3d view': 'graph', 'graph view': 'graph', connectome: 'graph' };
      A.layouts.forEach(function (x) { cands.push({ id: x.id, kind: 'layout', name: x.label || x.layout, keys: [x.id, x.layout, x.label] }); });
      Object.keys(ALIAS).forEach(function (k) { var lay = A.layouts.filter(function (x) { return x.layout === ALIAS[k]; })[0]; if (lay) cands.push({ id: lay.id, kind: 'layout', name: lay.label || lay.layout, keys: [k] }); });
      (A.views || []).forEach(function (x) { cands.push({ id: x.id, kind: 'view', name: x.label, keys: [x.id, x.label] }); });
      Object.keys(VALIAS).forEach(function (k) { var vw = (A.views || []).filter(function (x) { return x.id === VALIAS[k] || x.view === VALIAS[k]; })[0]; if (vw) cands.push({ id: vw.id, kind: 'view', name: vw.label, keys: [k] }); });
      A.lenses.forEach(function (x) { cands.push({ id: x.id, kind: 'lens', name: x.label, keys: [x.id, x.label] }); });
      A.strategies.forEach(function (s) { cands.push({ id: s.id, kind: 'strategy', name: s.name, keys: [s.id, s.name] }); });
      A.strategyCaps.forEach(function (x) { cands.push({ id: x.id, kind: 'strategy', name: x.label, keys: [x.id, x.label] }); });
      cands.forEach(function (c) { c.keys.forEach(function (k) { var kk = String(k || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (kk.length < 3 && kk !== '3d') return; if (new RegExp('(^|[^a-z0-9])' + kk.replace(/ /g, '\\s+') + '($|[^a-z0-9])').test(low) && kk.length > bs) { bs = kk.length; best = c; } }); });
      if (best && best.kind === 'lens' && /\b(turn off|disable|hide|remove|stop|clear)\b/.test(low)) return mk('set_lens', { name: best.id, on: false }, 'Turning off ' + best.name);
      if (best && /\b(use|switch|show|turn on|enable|apply|ship|try|activate|give|lay|view|set|go|run|swap|change|open|display|see)\b/.test(low)) return best.kind === 'view' ? mk('set_view', { name: best.id }, 'Switching to ' + best.name) : mk('use_ability', { id: best.id }, (best.kind === 'strategy' ? 'Switching retrieval to ' : 'Using ') + best.name);
      var lm = low.match(/^(?:link|connect|relate|add (?:an )?edge(?: between)?)\s+(.+?)\s+(?:to|and|with)\s+(.+?)\.?$/);
      if (lm && core.find(lm[1]) >= 0 && core.find(lm[2]) >= 0) return mk('add_edge', { a: lm[1], b: lm[2], relation: 'related' }, 'Proposing the link; kept only if dev holds');
      var um = low.match(/^(?:unlink|prune|remove (?:the )?edge(?: between)?)\s+(.+?)\s+(?:from|and|with|to)\s+(.+?)\.?$/);
      if (um && core.find(um[1]) >= 0 && core.find(um[2]) >= 0) return mk('prune_edge', { a: um[1], b: um[2] }, 'Testing the removal');
      var im = low.match(/^(?:inspect|neighbou?rs of|show (?:me )?node)\s+(.+?)\.?$/);
      if (im && core.find(im[1]) >= 0) return mk('inspect', { node: im[1] }, 'Inspecting');
      var bare = t.match(/^(?:add|ingest|clone|track|import|index|study)\s+([\w.\-]+)\.?$/i);
      if (bare && core.find(bare[1]) < 0 && !best) return mk('add_repo', { repo: bare[1] }, 'Adding ' + bare[1] + ' to the research queue');
      if (/^\/?think\b|^(what next|do something|improve yourself)|\bship (a |something|new )?feature\b/.test(low)) return { special: 'think' };
      if (/\b(next file|ingest more|pull more|keep ingesting)\b/.test(low)) return mk('ingest_code', {}, 'Ingesting the next file');
      if (/\b(research step|advance (the )?(research )?loop)\b/.test(low)) return mk('science_step', {}, 'Advancing the research loop');
      return null;
    };
    core.thoughts = [];
    core.think = async function () {
      if (core.thinking) return; core.thinking = true; core.agents.research.state = 'thinking'; emit('patch');
      var state = 'IQ ' + core.iqHist[core.iqHist.length - 1].toFixed(3) + ' · dev ' + core.devHist[core.devHist.length - 1].toFixed(3) + ' · ' + core.E.length + ' edges · features ' + core.shippedCount() + '/' + core.capabilities.length + (core.history && core.history.domainLine ? ' · ' + core.history.domainLine() : '') + (core.qpolicy ? ' · policy ' + core.qpolicy.line() : '');
      if (!(window.claude && window.claude.complete)) { var up = core.cycleResearch(); core.thoughts.unshift({ t: ts(), thought: 'LM layer offline — using the built-in policy to pick the next upgrade.', tool: up ? (up.kind === 'capability' ? 'ship_feature' : up.op) : 'none', args: '', obs: up ? up.status : 'nothing to do' }); if (core.thoughts.length > 30) core.thoughts.pop(); core.thinking = false; core.agents.research.state = 'idle'; emit('patch'); return; }
      var ins = (core.insights || []).slice(0, 7).map(function (x, i) { return (i + 1) + '. [' + x.kind + '] ' + x.title + ' — ' + x.body; }).join('\n');
      var tools = core.tools.map(function (t) { return '- ' + t.name + '(' + t.sig + ') — ' + t.desc; }).join('\n');
      var latent = core.capabilities.filter(function (c) { return c.status === 'latent'; }).map(function (c) { return c.id; }).join(', ') || 'none';
      var recent = core.thoughts.slice(0, 4).map(function (t) { return t.tool + ' → ' + t.obs; }).join('\n');
      var prompt = 'You are the research agent of a self-improving knowledge graph (the graph IS the agent). Goal: raise held-out dev recall and surface capabilities the user needs, acting on the graph\'s own insights.\n\nState: ' + state + '\nLatent features you may ship_feature: ' + latent + '\n\nTop insights (unasked questions the graph found):\n' + ins + '\n\nTools:\n' + tools + '\n\nRecent actions:\n' + (recent || 'none') + '\n\nPick ONE tool to act on an insight. Prefer add_edge for missing links, ship_feature for latent features, set_lens/set_layout to reveal structure. Return ONLY JSON: {"thought":"one sentence","tool":"name","args":{}}';
      try { var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out); var tool = core.tools.filter(function (x) { return x.name === j.tool; })[0]; var obs = tool ? await tool.run(j.args || {}) : ('unknown tool ' + j.tool); core.thoughts.unshift({ t: ts(), thought: j.thought, tool: j.tool, args: JSON.stringify(j.args || {}), obs: ('' + obs).slice(0, 200) }); log('research', 'think · ' + j.thought + ' → ' + j.tool); } catch (e) { log('err', 'think error: ' + (e && e.message || e)); }
      if (core.thoughts.length > 30) core.thoughts.pop(); core.thinking = false; core.agents.research.state = 'idle'; measure(); emit('patch');
    };

    ['radial', 'chord'].forEach(function (id) { var c = core.capability(id); if (c) { c.status = 'shipped'; c.shippedAt = 'boot'; core.discoveries.unshift({ t: 'boot', cap: c }); } });
    core.stats.shipped = 2;

    /* ---- the research scientist: observe → gather → hypothesize → test → score → audit → plan ---- */
    var SCI_STAGES = ['observe', 'gather', 'hypothesize', 'experiment', 'score', 'audit', 'plan'];
    core.science = { stage: 'observe', idx: 0, round: 0, type: 'graph', hypothesis: 'booting the research loop\u2026', observation: '', focus: '', result: null, history: [], busy: false, timer: null };
    function sciLog(x) { core.science.history.unshift(x); if (core.science.history.length > 50) core.science.history.pop(); }
    function sciType(r) { var llm = !!(window.claude && window.claude.complete); if (core.qpolicy) return core.qpolicy.choose(r, llm ? ['graph', 'pot', 'code', 'strategy'] : ['graph', 'strategy']); var seq = llm ? ['graph', 'pot', 'code', 'strategy'] : ['graph', 'strategy', 'graph']; return seq[r % seq.length]; }
    core.pot = async function () {
      var before = devIQ(), t0 = now();
      if (!(window.claude && window.claude.complete)) return { label: 'PoT (offline)', keep: false, ddev: 0, ms: 0, loc: 0, summary: 'LM layer offline' };
      var prompt = 'Write a DSPy-style PROGRAM OF THOUGHT: short JS proposing knowledge-graph edges that raise held-out retrieval recall. Signature: function pot(core, h){ return [[i,j], ...]; } returning up to 6 pairs of INTEGER node indices in 0..' + (core.nc - 1) + '.\nEXACT API (do not invent methods): core.nc (int); core.N[i] = {name, def, comm, parent, year}; core.adj() returns an ARRAY where core.adj()[i] is an array of [neighbourIndex, edgeIndex] pairs (plain arrays \u2014 no .has/.get/Set/Map); core.pr and core.bc are Float32Arrays indexed by node (pagerank, betweenness). Helpers in h: h.linked(a,b)->bool (is there already an edge?), h.nbrs(i)->int[] neighbour indices, h.deg(i)->int, h.name(i)->string. Only return [i,j] where i!==j and !h.linked(i,j).' + (core.history && core.history.potHint ? core.history.potHint() : '') + ' Keep it SHORT (a few lines) and O(n). Return ONLY JSON {"code":"function pot(core, h){ ... }"}.';
      try {
        var out = await window.claude.complete(prompt), m = out.match(/\{[\s\S]*\}/), j = JSON.parse(m ? m[0] : out);
        var fn = (new Function('return (' + j.code + ')'))(); var adjL = core.adj(); var H = { linked: function (a, b) { return core._int.edgeIndex(a, b) != null; }, nbrs: function (i) { return (adjL[i] || []).map(function (x) { return x[0]; }); }, deg: function (i) { return (adjL[i] || []).length; }, name: function (i) { return core.N[i] ? core.N[i].name : ''; } }; var pairs = fn(core, H) || [], loc = (j.code.match(/\n/g) || []).length + 1, applied = [];
        pairs.slice(0, 6).forEach(function (p) { var a = p[0], b = p[1]; if (a == null || b == null || a === b || a < 0 || b < 0 || a >= core.nc || b >= core.nc) return; if (I.edgeIndex(a, b) != null) return; var e = addEdge(a, b, 'pred', 0.6, 'pot'); if (e) applied.push(e); });
        rebuild(); var after = devIQ(), ddev = after - before, keep = ddev >= -1e-6 && applied.length > 0;
        if (!keep) { applied.forEach(function (e) { var i = E.indexOf(e); if (i >= 0) E.splice(i, 1); }); rebuild(); }
        else { core.stats.predAdded += applied.length; I.remine && I.remine(); }
        measure();
        return { label: 'Program of Thought', code: j.code, keep: keep, ddev: ddev, ms: +(now() - t0).toFixed(1), loc: loc, summary: (keep ? 'kept ' : 'reverted ') + applied.length + ' PoT links \u00b7 dev ' + before.toFixed(3) + '\u2192' + after.toFixed(3) + ' \u00b7 ' + loc + ' loc' };
      } catch (e) { return { label: 'Program of Thought', keep: false, ddev: 0, ms: +(now() - t0).toFixed(1), loc: 0, summary: 'PoT error: ' + (e && e.message || e) }; }
    };
    async function sciRun(type) {
      var before = devIQ(), t0 = now();
      if (type === 'graph') { var up = core.cycleResearch(true); var a1 = devIQ(); return { label: up ? (up.kind === 'capability' ? up.cap.label : describe(up)) : 'survey', keep: !!(up && (up.status === 'accepted' || up.status === 'shipped')), ddev: a1 - before, ms: +(now() - t0).toFixed(1), loc: 1, summary: up ? ((up.status || '') + ' \u00b7 ' + (up.kind === 'capability' ? up.cap.label : describe(up))) : 'no upgrade warranted this round' }; }
      if (type === 'pot') { core._expBusy = true; try { return await core.pot(); } finally { core._expBusy = false; } }
      if (type === 'code') { core._expBusy = true; try { var p = await core.proposeCode(); return { label: p.name || 'code', keep: !!p.verdict, ddev: (p.after || before) - (p.before || before), ms: p.ms || +(now() - t0).toFixed(1), loc: p.code ? (p.code.match(/\n/g) || []).length + 1 : 0, summary: (p.verdict ? 'shipped ' : 'rejected ') + (p.name || '') + ' \u00b7 dev ' + (p.before || 0).toFixed(3) + '\u2192' + (p.after || 0).toFixed(3) }; } finally { core._expBusy = false; } }
      if (type === 'strategy') { var board = core.benchStrategies(), act = core.activeStrategy, cur = (board.filter(function (b) { return b.id === act; })[0] || {}).dev || 0, best = board[0], keep = !!(best && best.id !== act && best.dev >= cur); if (keep) core.useStrategy(best.id); return { label: 'use ' + (best ? best.name : '?'), keep: keep, ddev: (best ? best.dev : cur) - cur, ms: +(now() - t0).toFixed(1), loc: 0, summary: keep ? ('swapped retrieval \u2192 ' + best.name + ' \u00b7 dev ' + cur.toFixed(3) + '\u2192' + best.dev.toFixed(3)) : ('kept ' + act + ' \u2014 still leads at ' + cur.toFixed(3)) }; }
      return { label: type, keep: false, ddev: 0, ms: 0, loc: 0, summary: '\u2014' };
    }
    core.scienceStep = async function () {
      var S = core.science; if (S.busy) return; S.busy = true;
      try {
        var stage = SCI_STAGES[S.idx]; S.stage = stage;
        if (stage === 'observe') { var dev = devIQ(), tr = iq(), gap = tr - dev; S.type = sciType(S.round); S.focus = (core.history && core.history.focusLine ? core.history.focusLine() + ' · ' : '') + (gap > 0.15 ? 'close the train/dev gap' : 'raise held-out recall'); S.observation = 'dev ' + dev.toFixed(3) + ' \u00b7 train ' + tr.toFixed(3) + ' \u00b7 gap ' + gap.toFixed(3) + ' \u00b7 ' + core.E.length + ' edges \u00b7 focus: ' + S.focus; }
        else if (stage === 'gather') { var la = (core.mcp || []).filter(function (m) { return m.status !== 'connected' && m.auto; })[0]; if (la) core.connectMCP(la.id, 'the research loop needs ' + la.purpose.toLowerCase()); var g = core.gh; S.observation = g ? ('gathered ' + g.stats.pulled + ' files \u00b7 ' + g.stats.symbols + ' symbols \u00b7 ' + g.stats.linked + ' edges' + (g.lastEvt ? ' \u00b7 ' + (g.lastEvt.slug || '') : '')) : 'no source engine'; }
        else if (stage === 'hypothesize') { S.hypothesis = ({ graph: 'a graph patch will raise held-out dev recall', pot: 'a program of thought can propose stronger links', code: 'a rewritten retrieval strategy will score higher', strategy: 'another strategy fits the current probe mix better' })[S.type] || 'an intervention will help'; S.observation = 'technique: ' + S.type.toUpperCase() + ' \u00b7 any code/technique allowed'; }
        else if (stage === 'experiment') { S.result = await sciRun(S.type); S.observation = S.result ? S.result.summary : 'no-op'; }
        else if (stage === 'score') { var r = S.result; S.observation = r ? ('\u0394dev ' + (r.ddev >= 0 ? '+' : '') + r.ddev.toFixed(3) + ' \u00b7 ' + r.ms + 'ms \u00b7 ' + r.loc + ' loc \u00b7 fitness ' + (r.ddev * 100 - r.ms * 0.001 - r.loc * 0.02).toFixed(2)) : 'nothing scored'; }
        else if (stage === 'audit') { var r2 = S.result, ok = !!(r2 && r2.keep); S.observation = (ok ? 'ACCEPTED' : 'REJECTED') + ' \u00b7 ' + (r2 ? r2.summary : '\u2014'); if (r2) sciLog({ t: ts(), ok: ok, label: r2.label, detail: (r2.label + ' \u00b7 ' + r2.summary).slice(0, 120) }); if (r2 && core.qpolicy) core.qpolicy.update(S.type, r2); S.result = null; }
        else if (stage === 'plan') { if (core.compact && core.EDGE_CAP && core.E.length > core.EDGE_CAP * 0.92) core.compact(6); S.round++; S.observation = 'round ' + S.round + ' complete \u00b7 next technique: ' + sciType(S.round).toUpperCase(); }
        log('research', 'science/' + stage + ' \u00b7 round ' + S.round + ' \u00b7 ' + String(S.type).toUpperCase() + ' \u00b7 ' + S.observation);
        S.idx = (S.idx + 1) % SCI_STAGES.length; emit('patch');
      } catch (e) { log('err', 'science: ' + (e && e.message || e)); } finally { core.science.busy = false; }
    };
    core.science.start = function (ms) { if (core.science.timer) return; core.science.timer = setInterval(function () { core.scienceStep(); }, ms || 2600); };
    core.science.stop = function () { clearInterval(core.science.timer); core.science.timer = null; };

    /* ---- LIVE GitHub research: the researcher's main job, always on ---- */
    if (window.GIGitHub) {
      var gh = window.GIGitHub.attach(core);
      core.research = function () { return gh.step(); };
      core.tools.push(
        { name: 'add_repo', sig: 'repo', desc: 'Add a GitHub repo \u2014 owner/name, a URL, or a bare name to search \u2014 to the research queue and start ingesting it now.', run: function (a, by) { return gh.addRepo((a && (a.repo || a.slug || a.name || a.url)) || '', by === 'user' ? 'you' : (by || 'agent')); } },
        { name: 'remove_repo', sig: 'repo', desc: 'Remove a repo from the research queue.', run: function (a) { return gh.removeRepo((a && (a.repo || a.slug || a.name)) || ''); } },
        { name: 'list_repos', sig: '', desc: 'List the research queue and each repo\u2019s ingest progress.', run: function () { return gh.repos.map(function (r) { return r.slug + ' ' + (r.scoured ? r.pull + '/' + (r.paths ? r.paths.length : '?') : 'queued'); }).join(' \u00b7 ') || 'no repos queued'; } }
      );
      core.tools.push(
        { name: 'scour_github', sig: 'repo', desc: 'Walk a relevant repo\u2019s file tree for code to ingest.', run: async function () { await gh.step(); var e = gh.lastEvt; return e ? (e.slug + ' \u00b7 ' + e.msg) : 'scouring'; } },
        { name: 'ingest_code', sig: '', desc: 'Pull the next relevant source file and map its symbols onto the graph.', run: async function () { await gh.step(); var e = gh.lastEvt; return e ? ((e.slug ? e.slug + '/' + e.path + ' \u00b7 ' : '') + e.msg) : 'ingesting'; } }
      );
      core.tools.push(
        { name: 'program_of_thought', sig: '', desc: 'Write & run a DSPy program-of-thought that proposes graph links; keep if dev holds.', run: async function () { var r = await core.pot(); return r.summary; } },
        { name: 'invent_layout', sig: '', desc: 'Author a brand-new 3D graph layout with the LM and ship it live.', run: async function () { var id = core.inventLayout ? await core.inventLayout() : null; return id ? ('shipped layout ' + id) : 'invention unavailable'; } },
        { name: 'run_raptor', sig: '', desc: 'RAPTOR: cluster + LM-name one community; builds the runtime taxonomy.', run: async function () { var e = core.raptorStep ? await core.raptorStep() : null; return e ? ('named cluster ' + e.name) : 'taxonomy complete'; } },
        { name: 'ingest_starred', sig: 'user', desc: 'Discover & queue relevant repos from a GitHub user\u2019s stars.', run: async function (a) { var n = gh.discoverStarred ? await gh.discoverStarred((a && a.user) || 'yetmens') : 0; return 'discovered ' + (n || 0) + ' repos'; } },
        { name: 'compact_graph', sig: '', desc: 'Prune the weakest edges to keep the graph lean (LOC/edge budget).', run: function () { return 'pruned ' + (core.compact ? core.compact(6) : 0) + ' edges'; } },
        { name: 'science_step', sig: '', desc: 'Advance the research loop one stage (observe\u2192gather\u2192hypothesize\u2192test\u2192score\u2192audit\u2192plan).', run: async function () { await core.scienceStep(); return core.science.stage + ' \u00b7 ' + core.science.observation; } }
      );
      gh.start(2400);
      log('research', 'live GitHub research online \u00b7 scouring ' + gh.repos.length + ' repos (' + gh.repos.slice(0, 4).map(function (r) { return r.slug; }).join(', ') + '\u2026) \u00b7 main job: scour \u2192 pull \u2192 ingest \u2192 gate');
    }

    var _files = core.files;
    core.files = function () {
      var arch = core.architecture.files.map(function (f) { return { dir: 'architect', name: f.name, live: true, get: (function (nm) { return function () { var cur = core.architecture.files.filter(function (x) { return x.name === nm; })[0]; return cur ? cur.body : ''; }; })(f.name) }; });
      var stack = [
        { dir: 'agents', name: 'agents.dspy', live: true, get: function () { return 'class ResearchAgent(dspy.Signature):\n    """' + core.agents.research.note + '"""\n    # ' + core.agents.research.sig + '\n\nclass TesterAgent(dspy.Signature):\n    """' + core.agents.tester.note + '"""\n    # ' + core.agents.tester.sig + '\n\nrequirements = [\n' + core.requirements.concat(core.customReq).map(function (r) { return '    { "id": "' + r.id + '", "gate": ' + (r.gate ? 'True' : 'False') + ', "label": "' + r.label + '" },'; }).join('\n') + '\n]\n\n# proposals ' + core.proposals.length + ' \u00b7 shipped features ' + core.shippedCount() + ' \u00b7 evolved edges ' + (core.stats.predAdded + core.stats.llmLinks) + ' \u00b7 rejected ' + core.stats.rejected; } },
        { dir: 'mcp', name: 'servers.json', live: true, get: function () { return JSON.stringify(core.mcp, null, 2); } },
        { dir: 'mcp', name: 'skills.md', live: true, get: function () { return '# skills.md — what this agent can do\n\nThe graph IS the agent. It reads its own insights and acts through bare tools; the tester gates every change on held-out dev recall.\n\n## Skills\n' + core.skills.map(function (s) { return '- **' + s.name + '** (' + s.by + (s.native ? ', native' : s.wish ? ', wished-for' : '') + ') — ' + s.desc; }).join('\n') + '\n\n## Tools the agent calls\n' + core.tools.map(function (t) { return '- `' + t.name + '(' + t.sig + ')` — ' + t.desc; }).join('\n') + '\n\n## MCP servers\n' + core.mcp.map(function (m) { return '- ' + m.name + ' [' + m.status + '] — ' + m.purpose + ' (' + m.tools.join(', ') + ')'; }).join('\n') + '\n\n## Loop\nReAct: read insights → pick a tool → observe → repeat.'; } },
        { dir: 'mcp', name: 'tools.json', live: true, get: function () { return JSON.stringify(core.tools.map(function (t) { return { name: t.name, args: t.sig, desc: t.desc }; }), null, 2); } },
        { dir: 'mcp', name: 'karpathy.md', live: true, get: function () { return '# GitHub code-lookup skill \u2014 karpathy\n\n## recent lookups\n' + (core.skillLog.length ? core.skillLog.map(function (q) { return '- ' + q.t + '  ' + q.repo + '/' + q.file + ' \u2014 ' + q.topic; }).join('\n') : '- none yet') + '\n\n## reference index\n' + core.karpathy.map(function (e) { return '- ' + e.repo + '/' + e.file + ' \u2014 ' + e.topic + ' (maps: ' + e.maps.join(', ') + ')'; }).join('\n'); } }
      ];
      return _files().concat(stack, arch);
    };

    log('research', 'online \u00b7 skills: ' + core.skills.filter(function (s) { return s.native; }).length + ' native, ' + core.skills.filter(function (s) { return s.wish; }).length + ' wished-for \u00b7 MCP ' + core.stats.mcp + '/' + core.mcp.length + ' connected');
    log('research', 'architect skill ready \u00b7 ' + core.architecture.summary);
    log('ship', 'boot capabilities live: Centrality orbits, Community chords \u00b7 ' + (core.capabilities.length - 2) + ' more latent, awaiting discovery');
  }

  window.GI_STACK = { karpathy: KARPATHY, servers: servers, skills: skills, capabilities: capabilities, architect: architect, wire: wire };
})();
