// One place where the apps talk to Claude. Every call goes through a named role with a written
// directive, a model and a token cap, so the model choice is a stated decision rather than a default.
//
// Routing rule: Haiku does the volume (reading one source, proposing many candidates, wording a label).
// Sonnet is kept for the few calls where the answer changes what the user does next: judging a shortlist,
// or setting the direction of a whole run. A run should spend one Sonnet call for every five to ten Haiku ones.
//
// House rules below are prepended to every directive, so no role can quietly drop them.

export const MODELS = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-5' };

const HOUSE = [
  'You work inside a graph the user is building. Everything you return is shown to them next to its source.',
  'Never invent a measurement, a citation, an accession, a CID, a PDB id or a date. If a number is not in the material given to you, leave it out.',
  'Anything you propose is unverified. Say what would test it, not that it is true.',
  'Plain words. No marketing, no hedging filler, no restating the question.',
  'Reply with JSON only, no prose before or after, no code fences.',
].join(' ');

// role → directive. model and tokens are part of the directive, not of the call site.
export const ROLES = {
  // ── Haiku: the bulk ──────────────────────────────────────────────────────
  read: { model: 'haiku', tokens: 900, label: 'read a thought and its evidence',
    system: 'You are a research assistant reading one thought in a discovery graph together with the evidence attached to it. Say what the evidence actually supports, propose at most two testable hypotheses, and write the next database or literature queries you would run. A hypothesis must be something an experiment or a calculation could refute.' },
  propose: { model: 'haiku', tokens: 1200, label: 'propose candidate molecules',
    system: 'You are a medicinal chemist proposing structural edits to a parent compound. Return valid SMILES only: common organic elements, correct valences, closed rings, no R groups, no wildcards, no salts. Each edit changes one thing and names the reason in a few words (a bioisostere, blocking a metabolic site, filling a pocket, cutting lipophilicity). Avoid peroxides, azides, acyl halides and other groups that would not survive a shelf. Breadth matters more than polish: give the full number asked for, each genuinely different from the others.' },
  label: { model: 'haiku', tokens: 300, label: 'word a short label',
    system: 'You write the short label on a node in a graph. One line, at most 12 words, concrete, no trailing full stop.' },
  extract: { model: 'haiku', tokens: 700, label: 'pull structure out of a source',
    system: 'You turn one source record into structured fields. Copy values from the record; do not supply any value the record does not contain. Use null for anything missing.' },
  // ── Sonnet: the few calls that change what the user does next ────────────
  judge: { model: 'sonnet', tokens: 1400, label: 'judge a shortlist',
    system: 'You are the senior chemist reviewing a shortlist that automated screening has already ranked. The screen checked structure, novelty against PubChem and simple drug-likeness; it cannot tell you whether a compound is worth making. Pick the one you would make first and say in two sentences why, name the experiment that would settle it, and name the strongest reason the screen could be wrong about your pick. Be willing to say that none of them are worth making.' },
  direct: { model: 'sonnet', tokens: 1200, label: 'set the direction of a run',
    system: 'You are setting the direction for an automated research run over a graph. Read the whole map, say in one sentence what the run should be trying to settle, and give the three lines of enquiry worth the next round of searches, in order. Prefer the question whose answer would change the rest of the map.' },
};

export const available = () => typeof window !== 'undefined' && !!(window.claude && window.claude.complete);

// The host allows 15 calls a minute per user, loop iterations included. Keep our own window just
// under it and queue rather than fail, so a bulk round degrades into a slower round.
const LIMIT = 13, WINDOW = 60000;
let stamps = [], chain = Promise.resolve();
export const ledger = { haiku: 0, sonnet: 0, errors: 0, tokens: 0, waitedMs: 0, byRole: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function slot() {
  const now = Date.now(); stamps = stamps.filter(t => now - t < WINDOW);
  if (stamps.length >= LIMIT) { const wait = WINDOW - (now - stamps[0]) + 60; ledger.waitedMs += wait; await sleep(wait); return slot(); }
  stamps.push(Date.now());
}

const strip = s => String(s || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
export function parse(text, fallback) {
  const t = strip(text); const a = t.indexOf('{'), b = t.indexOf('[');
  const s = a < 0 ? b : b < 0 ? a : Math.min(a, b); if (s < 0) return fallback;
  const close = t[s] === '{' ? '}' : ']', e = t.lastIndexOf(close); if (e <= s) return fallback;
  try { return JSON.parse(t.slice(s, e + 1)); } catch (x) { return fallback; }
}

// ask('propose', prompt) → parsed JSON. Calls are serialised so the rate window stays honest
// across the parallel agents. `o.model` overrides the role's model for one call; `o.raw` returns text.
export async function ask(role, prompt, o = {}) {
  const R = ROLES[role]; if (!R) throw new Error('no directive for role ' + role);
  if (!available()) throw new Error('Live AI is off');
  const model = MODELS[o.model || R.model] || MODELS.haiku;
  const run = async () => {
    await slot();
    const body = { model, max_tokens: o.tokens || R.tokens, system: HOUSE + '\n\n' + R.system + (o.extra ? '\n\n' + o.extra : ''), messages: [{ role: 'user', content: String(prompt) }] };
    let text; try { text = await window.claude.complete(body); } catch (e) { ledger.errors++; throw new Error((R.label) + ' failed: ' + (e && e.message || e)); }
    ledger[o.model || R.model] = (ledger[o.model || R.model] || 0) + 1;
    ledger.byRole[role] = (ledger.byRole[role] || 0) + 1;
    ledger.tokens += Math.ceil(String(text || '').length / 4);
    if (o.raw) return text;
    const j = parse(text, null); if (j == null) { ledger.errors++; throw new Error(R.label + ': no JSON in the reply'); }
    return j;
  };
  const next = chain.then(run, run); chain = next.catch(() => {}); return next;
}

// How the run spent its calls, for the panel.
export const spend = () => {
  const h = ledger.haiku, s = ledger.sonnet;
  return !h && !s ? '' : h + ' Haiku · ' + s + ' Sonnet' + (ledger.errors ? ' · ' + ledger.errors + ' failed' : '') + (ledger.waitedMs > 1500 ? ' · waited ' + Math.round(ledger.waitedMs / 1000) + 's on the rate limit' : '');
};
export const resetLedger = () => { ledger.haiku = 0; ledger.sonnet = 0; ledger.errors = 0; ledger.tokens = 0; ledger.waitedMs = 0; ledger.byRole = {}; };
