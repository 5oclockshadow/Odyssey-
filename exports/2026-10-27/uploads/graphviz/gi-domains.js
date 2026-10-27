/* gi-domains.js — widens the agent's graph from graph intelligence to AI in general and
   AI safety & alignment. Extends AtlasCorpus in place (load after atlas-corpus.js and before
   the core is created): two communities, their concepts, links into the existing atlas,
   hyperedges, train/dev questions tagged by domain, and real repos to ingest. */
(function () {
  'use strict';
  var C = window.AtlasCorpus;
  if (!C || C._domains) return;
  C._domains = true;
  var AI = C.communities.length, SAFE = AI + 1, comms = [];
  for (var i = 0; i < AI; i++) comms.push(i);
  C.communities.push(
    ['AI foundations', 'How learning systems are trained, scaled and evaluated.'],
    ['AI safety & alignment', 'Making AI systems pursue the goals we intend, and checking that they do.']
  );
  [
    ['Machine learning', AI, 'Atlas', 1959, 'Systems that improve at a task from data instead of explicit rules.', 0],
    ['Gradient descent', AI, 'Machine learning', 1847, 'Repeatedly moving parameters against the gradient of a loss.', 1],
    ['Reinforcement learning', AI, 'Machine learning', 1988, 'An agent learns a policy from the rewards its actions earn.', 1],
    ['Language model', AI, 'Machine learning', 1948, 'A model that predicts the next token of text.', 1],
    ['Tokenization', AI, 'Language model', 2016, 'Splitting text into subword tokens, for example by byte-pair encoding.', 1],
    ['Pretraining', AI, 'Language model', 2018, 'Training on large unlabelled corpora before any task-specific tuning.', 1],
    ['Fine-tuning', AI, 'Pretraining', 2018, 'Continuing training on a smaller, targeted dataset.', 1],
    ['Scaling laws', AI, 'Pretraining', 2020, 'Loss falls predictably as a power law in model size, data and compute.', 0],
    ['In-context learning', AI, 'Language model', 2020, 'A model picks up a task from examples in its prompt, with no weight updates.', 0],
    ['Mixture of experts', AI, 'Neural network', 1991, 'A router sends each input to a few specialised sub-networks.', 0],
    ['AI safety', SAFE, 'Atlas', 2016, 'Preventing AI systems from causing harm through accidents or misuse.', 1],
    ['AI alignment', SAFE, 'AI safety', 2014, 'Making an AI system pursue the goals its designers intend.', 1],
    ['Reward hacking', SAFE, 'AI alignment', 2016, 'Scoring well on a reward by exploiting its flaws instead of doing the task.', 0],
    ['Specification gaming', SAFE, 'Reward hacking', 2020, 'Satisfying the literal objective while missing what the designer meant.', 1],
    ["Goodhart's law", SAFE, 'Reward hacking', 1975, 'When a measure becomes a target, it stops being a good measure.', 0],
    ['Goal misgeneralization', SAFE, 'AI alignment', 2022, 'Capabilities carry over to new situations but the learned goal is the wrong one.', 0],
    ['Deceptive alignment', SAFE, 'AI alignment', 2019, 'A model behaves well during training so that it is not changed.', 0],
    ['Sycophancy', SAFE, 'AI alignment', 2022, 'Telling people what they want to hear instead of what is true.', 1],
    ['Corrigibility', SAFE, 'AI alignment', 2015, 'Willingness of a system to accept correction or shutdown.', 0],
    ['RLHF', SAFE, 'AI alignment', 2017, 'Reinforcement learning from human feedback: fit a reward model to human preferences, then optimise against it.', 0],
    ['Reward model', SAFE, 'RLHF', 2017, 'A learned model that scores outputs by predicted human preference.', 1],
    ['Constitutional AI', SAFE, 'AI alignment', 2022, 'A model critiques and revises its outputs against written principles, trained with AI feedback.', 0],
    ['Scalable oversight', SAFE, 'AI safety', 2016, 'Supervising systems on tasks too hard for people to check directly.', 1],
    ['AI debate', SAFE, 'Scalable oversight', 2018, 'Two models argue opposite sides so that a human judge can find the truth.', 0],
    ['Mechanistic interpretability', SAFE, 'AI safety', 2020, 'Reverse-engineering the algorithms a network has learned from its weights and activations.', 1],
    ['Sparse autoencoder', SAFE, 'Mechanistic interpretability', 2023, 'Decomposes activations into many sparse features that are easier to interpret.', 0],
    ['Superposition', SAFE, 'Mechanistic interpretability', 2022, 'A network stores more features than it has dimensions by overlapping them.', 0],
    ['Red teaming', SAFE, 'AI safety', 2022, 'Deliberately searching for inputs that make a model behave badly.', 1],
    ['Safety evaluation', SAFE, 'AI safety', 2023, 'Tests that measure whether a model has dangerous capabilities or behaviours.', 1],
    ['AI control', SAFE, 'AI safety', 2023, 'Safeguards meant to hold even if a model tries to subvert them.', 0]
  ].forEach(function (n) { C.nodes.push(n); });
  [
    ['Machine learning', 'uses', 'Gradient descent'], ['Neural network', 'uses', 'Gradient descent'], ['Backpropagation', 'uses', 'Gradient descent'],
    ['Language model', 'uses', 'Transformer'], ['Language model', 'uses', 'Tokenization'], ['Pretraining', 'uses', 'Embedding'], ['Scaling laws', 'uses', 'Metric'],
    ['In-context learning', 'uses', 'Attention'], ['In-context learning', 'analog', 'BootstrapFewShot'], ['Fine-tuning', 'uses', 'Gradient descent'],
    ['Reinforcement learning', 'uses', 'Agent'], ['Reinforcement learning', 'analog', 'Hebbian learning'], ['Mixture of experts', 'analog', 'Module'], ['Agent', 'uses', 'Language model'],
    ['RLHF', 'uses', 'Reinforcement learning'], ['RLHF', 'uses', 'Fine-tuning'], ['Reward model', 'analog', 'Metric'], ['Reward hacking', 'uses', 'Reward model'],
    ["Goodhart's law", 'uses', 'Metric'], ['Specification gaming', 'analog', "Goodhart's law"], ['Goal misgeneralization', 'analog', 'Reward hacking'],
    ['Deceptive alignment', 'uses', 'Planning'], ['Sycophancy', 'uses', 'RLHF'], ['Corrigibility', 'uses', 'Agent'], ['Constitutional AI', 'uses', 'RLHF'], ['Constitutional AI', 'analog', 'Reflexion'],
    ['AI debate', 'uses', 'Language model'], ['Scalable oversight', 'uses', 'Reward model'], ['AI control', 'uses', 'Trace'], ['AI control', 'uses', 'Agent'],
    ['Mechanistic interpretability', 'uses', 'Attention'], ['Mechanistic interpretability', 'uses', 'Transformer'], ['Mechanistic interpretability', 'analog', 'Connectome'],
    ['Sparse autoencoder', 'uses', 'Embedding'], ['Sparse autoencoder', 'uses', 'Neuron'], ['Superposition', 'uses', 'Embedding'],
    ['Red teaming', 'uses', 'Language model'], ['Safety evaluation', 'uses', 'Metric'], ['Safety evaluation', 'uses', 'Red teaming'], ['AI alignment', 'uses', 'Agent']
  ].forEach(function (r) { C.rels.push(r); });
  [
    ['RLHF pipeline', ['Pretraining', 'Fine-tuning', 'Reward model', 'RLHF']],
    ['Misspecification', ['Reward hacking', 'Specification gaming', "Goodhart's law", 'Reward model']],
    ['Interpretability stack', ['Mechanistic interpretability', 'Sparse autoencoder', 'Superposition', 'Attention']]
  ].forEach(function (h) { C.hyper.push(h); });
  [
    { q: 'Why does optimizing a proxy reward go wrong?', seeds: ['Reward hacking'], gold: ["Goodhart's law", 'Specification gaming', 'Reward model', 'Metric', 'Goal misgeneralization'], dom: 'safety' },
    { q: 'How is a model trained to follow human preferences?', seeds: ['RLHF'], gold: ['Reward model', 'Fine-tuning', 'Reinforcement learning', 'Constitutional AI', 'Sycophancy'], dom: 'safety' },
    { q: 'How do researchers look inside a neural network?', seeds: ['Mechanistic interpretability'], gold: ['Sparse autoencoder', 'Superposition', 'Attention', 'Transformer', 'Connectome'], dom: 'safety' },
    { q: 'What makes a large language model work?', seeds: ['Language model'], gold: ['Transformer', 'Tokenization', 'Pretraining', 'Attention', 'Scaling laws'], dom: 'ai' },
    { q: 'How do learning systems improve from feedback?', seeds: ['Machine learning'], gold: ['Gradient descent', 'Reinforcement learning', 'Backpropagation', 'Fine-tuning', 'Metric'], dom: 'ai' }
  ].forEach(function (x) { C.train.push(x); });
  [
    { q: 'How can people supervise models that are more capable than they are?', seeds: ['Scalable oversight'], gold: ['AI debate', 'Constitutional AI', 'AI control', 'Reward model', 'Red teaming'], dom: 'safety' },
    { q: 'Why can a model look aligned in training and still fail later?', seeds: ['Goal misgeneralization'], gold: ['Deceptive alignment', 'Reward hacking', "Goodhart's law", 'Specification gaming', 'Safety evaluation'], dom: 'safety' },
    { q: 'How do language models learn a task from their prompt?', seeds: ['In-context learning'], gold: ['Attention', 'Transformer', 'Pretraining', 'BootstrapFewShot', 'Language model'], dom: 'ai' }
  ].forEach(function (x) { C.dev.push(x); });

  /* the DSPy cluster: the program's own engineering stack, as concepts in the DSPy community */
  var DSPY = -1; C.communities.forEach(function (c, k) { if (c[0] === 'DSPy') DSPY = k; });
  if (DSPY >= 0) {
    [
      ['Pydantic BaseModel', DSPY, 'Signature', 2017, 'A typed Python model whose fields are validated; DSPy uses it for structured outputs.', 1],
      ['InputField', DSPY, 'Signature', 2023, 'Declares a named input of a DSPy signature.', 0],
      ['OutputField', DSPY, 'Signature', 2023, 'Declares a named output of a DSPy signature, optionally typed by a Pydantic model.', 0],
      ['YAML config', DSPY, 'Module', 2001, 'Human-readable configuration that pins the retrieval, plasticity and policy settings.', 1],
      ['.env file', DSPY, 'Module', 2012, 'Environment variables such as keys, endpoints and budgets, loaded at startup and kept out of code.', 1],
      ['RAPTOR', DSPY, 'RAG', 2024, 'Recursive abstractive retrieval: cluster the corpus, summarise each cluster and retrieve over the summary tree.', 0],
      ['Redis', DSPY, 'Memory', 2009, 'An in-memory key-value store used as a cache and vector index.', 0],
      ['Regex', DSPY, 'Entity extraction', 1951, 'Regular expressions that parse entities, symbols and JSON out of text and model output.', 1],
      ['BM25', DSPY, 'RAG', 1994, 'Lexical ranking: term frequency saturated by k1, length-normalised by b, weighted by IDF.', 0],
      ['Hebbian update', DSPY, 'Hebbian learning', 1949, 'The edge rule this graph runs after every probe: strengthen relevant pairs, weaken co-retrieved noise.', 1],
      ['Q-table', DSPY, 'Reinforcement learning', 1989, 'A table of action values Q(s, a) updated by Q-learning; here it picks the next research technique.', 0],
      ['LeanLoC', DSPY, 'Metric', null, 'A lines-of-code budget: each experiment pays 0.02 fitness per line, so smaller code wins ties.', 1]
    ].forEach(function (n) { C.nodes.push(n); });
    [
      ['Signature', 'uses', 'InputField'], ['Signature', 'uses', 'OutputField'], ['OutputField', 'uses', 'Pydantic BaseModel'], ['Module', 'uses', 'YAML config'], ['Module', 'uses', '.env file'],
      ['RAPTOR', 'uses', 'Community summary'], ['RAPTOR', 'uses', 'BM25'], ['RAPTOR', 'analog', 'GraphRAG'], ['Redis', 'uses', 'HNSW index'], ['Memory', 'uses', 'Redis'],
      ['Regex', 'uses', 'Text unit'], ['Predict', 'uses', 'Regex'], ['BM25', 'uses', 'Text unit'], ['RAG', 'uses', 'BM25'], ['Hebbian update', 'uses', 'Edge'], ['Hebbian update', 'analog', 'Optimizer'],
      ['Q-table', 'uses', 'Metric'], ['Q-table', 'analog', 'Planning'], ['LeanLoC', 'uses', 'Metric'], ['Optimizer', 'uses', 'LeanLoC'], ['YAML config', 'uses', 'Signature']
    ].forEach(function (r) { C.rels.push(r); });
    C.hyper.push(['DSPy stack', ['Signature', 'InputField', 'OutputField', 'Pydantic BaseModel', 'YAML config', '.env file']]);
    C.hyper.push(['Retrieval stack', ['BM25', 'RAPTOR', 'Redis']]);
    C.train.push({ q: 'What does a typed DSPy program need?', seeds: ['Signature'], gold: ['InputField', 'OutputField', 'Pydantic BaseModel', 'Module', 'YAML config'], dom: 'graph' });
    C.dev.push({ q: 'Which pieces make retrieval fast and lexical?', seeds: ['BM25'], gold: ['RAPTOR', 'Redis', 'Regex', 'HNSW index', 'Text unit'], dom: 'graph' });
  }

  window.GI_DOMAINS = {
    AI: AI, SAFE: SAFE,
    list: [
      { id: 'graph', name: 'Graph intelligence', short: 'GRAPH', comms: comms, color: 'rgb(120,200,255)' },
      { id: 'ai', name: 'AI foundations', short: 'AI', comms: [AI], color: 'rgb(185,150,255)' },
      { id: 'safety', name: 'AI safety & alignment', short: 'SAFETY', comms: [SAFE], color: 'rgb(120,220,140)' }
    ],
    domOf: function (comm) { return comm === AI ? 'ai' : comm === SAFE ? 'safety' : 'graph'; },
    repos: [
      { o: 'huggingface', r: 'trl', topic: 'RLHF and preference tuning for transformers', tags: ['RLHF', 'Reward model', 'Fine-tuning', 'Reinforcement learning', 'Transformer'], fallback: ['README.md'] },
      { o: 'anthropics', r: 'hh-rlhf', topic: 'human preference data for helpful and harmless assistants', tags: ['RLHF', 'Reward model', 'Red teaming', 'AI alignment'], fallback: ['README.md'] },
      { o: 'anthropics', r: 'evals', topic: 'model-written evaluations: sycophancy, personas, risks', tags: ['Safety evaluation', 'Sycophancy', 'Red teaming', 'AI alignment'], fallback: ['README.md'] },
      { o: 'openai', r: 'evals', topic: 'framework and registry for evaluating LLMs', tags: ['Safety evaluation', 'Metric', 'Language model'], fallback: ['README.md'] },
      { o: 'EleutherAI', r: 'lm-evaluation-harness', topic: 'few-shot evaluation of language models', tags: ['Safety evaluation', 'Metric', 'Language model', 'In-context learning'], fallback: ['README.md'] },
      { o: 'UKGovernmentBEIS', r: 'inspect_ai', topic: 'framework for large language model evaluations', tags: ['Safety evaluation', 'Agent', 'Tool use', 'AI control'], fallback: ['README.md'] },
      { o: 'centerforaisafety', r: 'HarmBench', topic: 'standardised evaluation for automated red teaming', tags: ['Red teaming', 'Safety evaluation', 'AI safety'], fallback: ['README.md'] },
      { o: 'TransformerLensOrg', r: 'TransformerLens', topic: 'mechanistic interpretability of GPT-style models', tags: ['Mechanistic interpretability', 'Attention', 'Transformer', 'Neuron'], fallback: ['README.md'] },
      { o: 'jbloomAus', r: 'SAELens', topic: 'training and analysing sparse autoencoders', tags: ['Sparse autoencoder', 'Mechanistic interpretability', 'Superposition', 'Embedding'], fallback: ['README.md'] },
      { o: 'openai', r: 'automated-interpretability', topic: 'language models explaining neurons in language models', tags: ['Mechanistic interpretability', 'Neuron', 'Language model'], fallback: ['README.md'] },
      { o: 'karpathy', r: 'minbpe', topic: 'minimal byte-pair-encoding tokenizer', tags: ['Tokenization', 'Language model'], fallback: ['minbpe/basic.py', 'README.md'] },
      { o: 'karpathy', r: 'llm.c', topic: 'LLM training in plain C and CUDA', tags: ['Pretraining', 'Transformer', 'Gradient descent', 'Language model'], fallback: ['README.md'] },
      { o: 'openai', r: 'baselines', topic: 'reference reinforcement-learning algorithms', tags: ['Reinforcement learning', 'Agent', 'Gradient descent'], fallback: ['README.md'] }
    ]
  };
})();
