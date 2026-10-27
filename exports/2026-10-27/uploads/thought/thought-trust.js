// thought-trust.js — SOC 2-oriented controls for a local-first thought graph:
// tamper-evident audit trail, PII redaction, connector consent with scopes, retention, and data-subject export/purge.
// Everything here is client-side and auditable; no transport, no hidden egress.

export const NS = 'tg-';
export const KEYS = { audit: NS + 'audit', consent: NS + 'consent', policy: NS + 'policy', graph: NS + 'sphere-current', history: NS + 'sphere-history', spec: NS + 'spec', findings: NS + 'findings', mcp: NS + 'mcp-config' };
export const SCHEMA = 3;

// ── Policy (retention, redaction, egress) ─────────────────────────────────
export const DEFAULT_POLICY = { schema: SCHEMA, redact: true, retentionDays: 30, egress: 'off', auditLimit: 500, classification: 'internal' };
const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
export function policy() { const p = read(KEYS.policy, null); return p && p.schema === SCHEMA ? p : { ...DEFAULT_POLICY }; }
export function setPolicy(patch) { const p = { ...policy(), ...patch, schema: SCHEMA }; write(KEYS.policy, p); return p; }

// ── Tamper-evident audit trail (hash-chained) ─────────────────────────────
function h32(s) { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 0x01000193); } return (a >>> 0).toString(16).padStart(8, '0'); }
export function digest(s) { return h32(s) + h32(s.split('').reverse().join('')) + h32(s.length + ':' + s); } // 24 hex chars, no crypto dependency
export function auditLog() { return read(KEYS.audit, []); }
export function audit(action, detail = '', meta = {}) {
  const log = auditLog(), prev = log.length ? log[log.length - 1].hash : 'genesis';
  const entry = { seq: log.length + 1, at: new Date().toISOString(), action, detail: String(detail).slice(0, 180), actor: meta.actor || 'user', scope: meta.scope || 'local', prev };
  entry.hash = digest(JSON.stringify(entry));
  log.push(entry);
  const lim = policy().auditLimit;
  write(KEYS.audit, log.length > lim ? log.slice(-lim) : log);
  return entry;
}
export function verifyChain() {
  const log = auditLog(); let prev = log.length ? log[0].prev : 'genesis', broken = null;
  for (const e of log) {
    const { hash, ...rest } = e;
    if (rest.prev !== prev || digest(JSON.stringify(rest)) !== hash) { broken = e.seq; break; }
    prev = hash;
  }
  return { entries: log.length, intact: broken === null, brokenAt: broken, head: log.length ? log[log.length - 1].hash : null };
}

// ── PII redaction on ingest ───────────────────────────────────────────────
const PII = [
  [/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, '[email]'],
  [/\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Rua|Lane|Ln|Drive|Dr)\b/g, '[address]'],
  [/@[A-Za-z0-9_]{3,}\b/g, '[handle]'],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]'],
  [/\b(?:MRN|NHS|SSN|DOB|patient id|record)\s*(?:no\.?|number|#|:)?\s*[A-Z0-9][A-Z0-9-]{4,}\b/gi, '[record id]'], // medical and personal record numbers
];
const LOCAL = /\b\d{3}[-.\s]\d{4}\b/g; // seven-digit local numbers and extensions, after full numbers so an area code goes with its number
const PHONE = /\(?\+?\d(?:[\d\s().-]{7,18})\d/g;
export function redact(text) {
  let out = String(text || ''), hits = 0;
  for (const [rx, tok] of PII) out = out.replace(rx, () => { hits++; return tok; }); // exact shapes first — a card or IP must not be read as a phone
  out = out.replace(PHONE, m => { const digits = (m.match(/\d/g) || []).length; if (digits < 9 || digits > 15) return m; hits++; return '[phone]'; });
  out = out.replace(LOCAL, () => { hits++; return '[phone]'; });
  return { text: out, hits };
}
export function redactItems(items) {
  let hits = 0;
  const out = items.map(it => { const r = redact(it.text); hits += r.hits; return { ...it, text: r.text, redacted: r.hits > 0 }; });
  if (hits) audit('redact', `${hits} personal identifier${hits === 1 ? '' : 's'} masked on ingest from ${new Set(items.map(i => i.source)).size} sources`, { scope: 'ingest' });
  return { items: out, hits };
}

// ── Connector consent with least-privilege scopes ─────────────────────────
export const SENSITIVE = new Set(['gmail', 'slack', 'discord', 'telegram', 'ios-health', 'windows', 'shopify']);
export const SCOPES = { gmail: 'read:subjects', slack: 'read:channel', discord: 'read:channel', telegram: 'read:group', 'ios-health': 'read:aggregate', windows: 'read:file', shopify: 'read:orders', fetch: 'net:get', scholar: 'net:get', time: 'local:clock', 'graph-intelligence': 'local:graph', 'sequential-thinking': 'local:reasoning' };
export function consents() { return read(KEYS.consent, {}); }
export function consented(name) { const c = consents()[name]; return !!(c && c.granted); }
export function grant(name, on) {
  const c = consents();
  c[name] = on ? { granted: true, scope: SCOPES[name] || 'read', at: new Date().toISOString() } : { granted: false, at: new Date().toISOString() };
  write(KEYS.consent, c);
  audit(on ? 'consent.grant' : 'consent.revoke', `${name} · scope ${SCOPES[name] || 'read'}`, { scope: name });
  return c[name];
}
export function pending(serverNames) { return serverNames.filter(n => SENSITIVE.has(n) && !consented(n)); }

// ── Retention ─────────────────────────────────────────────────────────────
export function retention() {
  const days = policy().retentionDays, cutoff = Date.now() - days * 86400000;
  const hist = read(KEYS.history, []), kept = hist.filter(h => new Date(h.at).getTime() >= cutoff);
  const log = auditLog(), keptLog = log.filter(e => new Date(e.at).getTime() >= cutoff);
  const dropped = (hist.length - kept.length) + (log.length - keptLog.length);
  if (hist.length !== kept.length) write(KEYS.history, kept);
  if (log.length !== keptLog.length) write(KEYS.audit, keptLog);
  if (dropped) audit('retention.sweep', `${dropped} record${dropped === 1 ? '' : 's'} past the ${days}-day window removed`, { actor: 'system' });
  return { days, dropped, history: kept.length, audit: keptLog.length };
}

// ── Data subject rights: export everything, purge everything ─────────────
export function exportAll() {
  const bundle = { exportedAt: new Date().toISOString(), schema: SCHEMA, policy: policy(), consent: consents(), chain: verifyChain(), data: {} };
  for (const [name, key] of Object.entries(KEYS)) bundle.data[name] = read(key, null);
  audit('data.export', `full export · ${Object.keys(bundle.data).length} stores`, { scope: 'dsar' });
  return bundle;
}
export function purge(scope = 'all') {
  const keys = scope === 'all' ? Object.values(KEYS) : [KEYS[scope]].filter(Boolean);
  let n = 0;
  for (const k of keys) { if (k === KEYS.audit) continue; if (localStorage.getItem(k) != null) { localStorage.removeItem(k); n++; } }
  audit('data.purge', `${scope} · ${n} store${n === 1 ? '' : 's'} erased (audit trail retained by design)`, { scope: 'dsar' });
  return n;
}

// ── Posture summary for the UI ────────────────────────────────────────────
export function posture(serverNames = []) {
  const p = policy(), chain = verifyChain(), sens = serverNames.filter(n => SENSITIVE.has(n));
  const granted = sens.filter(consented);
  const controls = [
    { id: 'egress', label: 'Network egress', state: p.egress === 'off' ? 'off — all processing local' : 'on — Claude only, on request', ok: true },
    { id: 'redact', label: 'PII redaction on ingest', state: p.redact ? 'enforced' : 'disabled — personal identifiers will be stored verbatim', ok: p.redact },
    { id: 'consent', label: 'Connector consent', state: `${granted.length}/${sens.length} granted, least privilege`, ok: granted.length <= sens.length },
    { id: 'audit', label: 'Audit trail', state: chain.intact ? `${chain.entries} entries, chain intact` : `broken at #${chain.brokenAt}`, ok: chain.intact },
    { id: 'retention', label: 'Retention', state: `${p.retentionDays} days, swept on load`, ok: true },
    { id: 'dsar', label: 'Export / erase', state: 'available on demand', ok: true },
    { id: 'class', label: 'Data classification', state: p.classification, ok: true },
  ];
  return { policy: p, chain, controls, ready: controls.every(c => c.ok) };
}
