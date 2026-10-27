// Agent for the six apps: thinks out loud, runs code against a read-only copy of the map in a worker, finds sources,
// and calls tools on a connected MCP server (Streamable HTTP, JSON-RPC 2.0). Every step is reported as it happens.
import * as E from './thought-engine.js';

// ── MCP client ──
async function rpc(conn, method, params, notify) {
  const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++conn.seq }) };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; if (conn.token) headers.Authorization = 'Bearer ' + conn.token; if (conn.session) headers['Mcp-Session-Id'] = conn.session; if (conn.version) headers['MCP-Protocol-Version'] = conn.version;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), conn.timeout || 20000); let res;
  try { res = await fetch(conn.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }); } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : 'could not reach the server (network or CORS): ' + e.message); } finally { clearTimeout(t); }
  const sid = res.headers.get('Mcp-Session-Id'); if (sid) conn.session = sid; if (notify) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = res.headers.get('Content-Type') || '', text = await res.text(); let msg = null;
  if (type.includes('text/event-stream')) { for (const line of text.split('\n')) if (line.startsWith('data:')) { try { const m = JSON.parse(line.slice(5)); if (m.id === body.id) msg = m; } catch (e) {} } } else { try { msg = JSON.parse(text); } catch (e) { throw new Error('server sent something that is not JSON'); } }
  if (!msg) throw new Error('no reply to ' + method); if (msg.error) throw new Error(msg.error.message || 'server error'); return msg.result;
}
export async function mcpConnect(url, token) {
  if (!/^https:\/\//i.test(url || '') && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url || '')) throw new Error('use an https:// address (or http://localhost)');
  const conn = { url, token: token || '', seq: 0, session: null, version: null, tools: [] };
  const init = await rpc(conn, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Map Graph', version: '1.0' } }); conn.version = init && init.protocolVersion; conn.server = (init && init.serverInfo && init.serverInfo.name) || url;
  await rpc(conn, 'notifications/initialized', null, true); const list = await rpc(conn, 'tools/list', {}); conn.tools = (list && list.tools || []).map(t => ({ name: t.name, description: String(t.description || '').slice(0, 200), schema: t.inputSchema || {} }));
  return conn;
}
export async function mcpCall(conn, name, args) { const r = await rpc(conn, 'tools/call', { name, arguments: args || {} }); const parts = (r && r.content || []).map(c => c.type === 'text' ? c.text : c.type === 'resource' && c.resource ? (c.resource.text || c.resource.uri) : '[' + c.type + ']'); return { text: parts.join('\n').slice(0, 4000), error: !!(r && r.isError) }; }

// ── sandboxed code: a worker with no DOM, no storage, a frozen copy of the map, and a hard 3-second limit ──
export function runCode(code, g) {
  const data = { seed: g.seed, nodes: g.nodes.map(n => ({ id: n.id, label: n.label, detail: n.detail || '', plane: n.plane, g: n.g, parent: n.parent || null, tags: n.tags || [] })), edges: g.edges.map(e => ({ a: e.a, b: e.b, kind: e.kind, relation: e.relation || '', weight: e.weight ?? 0.5 })) };
  const src = `self.onmessage = e => { const out = []; const log = (...a) => out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; const map = JSON.parse(e.data.map); const records = map.nodes.filter(n => (n.detail || '').includes(': ') && (n.detail || '').includes(' · ')).map(n => { const o = { _id: n.id, _label: n.label, _parent: n.parent }; for (const s of n.detail.split(' · ')) { const i = s.indexOf(': '); if (i > 0) o[s.slice(0, i)] = s.slice(i + 2); } return o; }); const r = (new Function('map', 'log', 'records', '"use strict";\\n' + e.data.code))(map, log, records); self.postMessage({ ok: true, out, result: r === undefined ? null : JSON.parse(JSON.stringify(r)) }); } catch (err) { self.postMessage({ ok: false, out, error: String(err && err.message || err) }); } };`;
  return new Promise(resolve => { let w; try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); } catch (e) { resolve({ ok: false, error: 'workers are blocked here: ' + e.message, out: [] }); return; }
    const t = setTimeout(() => { w.terminate(); resolve({ ok: false, error: 'stopped after 3 seconds', out: [] }); }, 3000);
    w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); }; w.onerror = e => { clearTimeout(t); w.terminate(); resolve({ ok: false, error: e.message || 'code failed', out: [] }); };
    w.postMessage({ code: String(code).slice(0, 6000), map: JSON.stringify(data) }); });
}

// ── the loop ──
const short = (s, n) => E.short(String(s || ''), n);
function snapshot(g, max = 40) { const list = g.nodes.filter(n => !n.dormant).slice(-max), ids = new Map(); list.forEach((n, i) => ids.set('t' + (i + 1), n.id)); return { ids, text: list.map((n, i) => 't' + (i + 1) + ' (' + Math.round(n.g * 100) + '% grounded' + (n.evidence && n.evidence.length ? ', ' + n.evidence.length + ' source' + (n.evidence.length > 1 ? 's' : '') : '') + ') ' + n.label).join('\n') }; }
export const liveAvailable = () => typeof window !== 'undefined' && !!(window.claude && window.claude.complete);

export async function run(g, o = {}) {
  const say = o.onStep || (() => {}), stop = o.cancelled || (() => false), app = o.app || { name: 'Map Graph', capacity: 'thinking' }, conn = o.mcp || null, rounds = o.rounds || 4, added = [], notes = [];
  if (!liveAvailable()) { say({ k: 'think', text: 'Live AI is not available in this viewer, so the agent cannot think freely here. Turn it on where Claude is available, or connect an MCP server and call its tools directly.' }); return { added }; }
  const tools = ['think: say what you are doing next and why (always first)', 'code: {"code": "JavaScript run on map = {seed, nodes:[{id,label,detail,plane,g,parent,tags}], edges:[{a,b,kind,relation,weight}]}; use log(...) and return a value"}', 'sources: {"claim": "tN", "query": "what to look for"} asks you, Claude, for real published sources you are confident exist', 'add: {"label": "<=90 chars", "detail": "<=200 chars", "attach": "tN", "rel": "supports|contradicts|causes|refines|example of|leads to", "source": "optional citation"}', 'link: {"a": "tN", "b": "tN", "rel": "..."}', 'done: {"summary": "what changed"}'];
  if (conn) tools.push('mcp: {"name": "tool name", "args": {...}} calls a live tool on ' + conn.server + '. Available: ' + conn.tools.map(t => t.name + ' (' + t.description.slice(0, 90) + ')').join('; '));
  for (let r = 0; r < rounds && !stop(); r++) {
    const snap = snapshot(g);
    const prompt = 'You are the research agent inside ' + app.name + ', an app for ' + String(app.capacity).toLowerCase() + '. Goal from the user: ' + (o.goal || 'strengthen the weakest claims with evidence') + '\nTopic: ' + g.seed + '\nThe map:\n' + snap.text + '\n\nWhat you did so far:\n' + (notes.slice(-8).join('\n') || '(nothing yet)') + '\n\nTools, one JSON object each:\n- ' + tools.join('\n- ') + '\n\nThink out loud in plain words, like a careful researcher. Never invent a source: if unsure, say so in "think". Use at most 4 actions this round; end with done when the goal is met.\nReply with JSON only: {"actions": [{"tool": "think", "text": "..."}, ...]}';
    let j; try { const raw = await window.claude.complete(prompt); const m = String(raw || '').match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : 'null'); } catch (e) { say({ k: 'error', text: 'Could not read the agent reply: ' + e.message }); break; }
    const acts = (j && Array.isArray(j.actions) ? j.actions : []).slice(0, 5); if (!acts.length) { say({ k: 'think', text: 'Nothing more to do.' }); break; }
    let done = false;
    for (const a of acts) { if (stop()) break; const tool = String(a.tool || '');
      try {
        if (tool === 'think') { say({ k: 'think', text: short(a.text, 400) }); notes.push('thought: ' + short(a.text, 160)); }
        else if (tool === 'code') { say({ k: 'code', text: short(a.code, 600) }); const res = await runCode(a.code, g); const txt = res.ok ? [...(res.out || []), res.result != null ? '→ ' + JSON.stringify(res.result).slice(0, 600) : ''].filter(Boolean).join('\n') : 'error: ' + res.error; say({ k: 'result', text: short(txt, 800) }); notes.push('code result: ' + short(txt, 300)); }
        else if (tool === 'sources') { const id = snap.ids.get(a.claim), n = id && g.byId.get(id); const list = n ? await E.livePapers(g, n) : []; const good = (list || []).slice(0, 3); say({ k: 'source', text: good.length ? good.map(p => '• ' + [p.title, p.authors, p.year].filter(Boolean).join(', ') + ' (unverified: check before relying on it)').join('\n') : 'No sources Claude is confident about.' }); if (n) for (const p of good) E.attachPaper(g, n.id, { ...p, unverified: true }); notes.push('sources for ' + a.claim + ': ' + good.length); }
        else if (tool === 'mcp' && conn) { say({ k: 'tool', text: conn.server + ' · ' + a.name + ' ' + JSON.stringify(a.args || {}).slice(0, 200) }); const res = await mcpCall(conn, a.name, a.args); say({ k: res.error ? 'error' : 'result', text: short(res.text, 900) }); notes.push('mcp ' + a.name + ': ' + short(res.text, 400)); if (o.audit) o.audit('egress.mcp', conn.server + ' · ' + a.name); }
        else if (tool === 'add') { const at = snap.ids.get(a.attach) || g.nodes[0].id; if (!a.label || g.nodes.some(n => n.label.toLowerCase() === String(a.label).trim().toLowerCase())) continue; const n = E.addNodeRaw(g, { label: short(a.label, 110), detail: short(a.detail, 300), plane: a.source ? 'facts' : 'concepts', g: a.source ? 0.55 : 0.4, parent: at, via: 'Agent', evidence: a.source ? [{ src: short(a.source, 200) + ' (unverified)', year: '' }] : [] }); E.addEdgeRaw(g, at, n.id, null, 'expands'); if (a.rel) E.link(g, at, n.id, String(a.rel).slice(0, 24)); added.push(n); say({ k: 'add', text: n.label, id: n.id }); notes.push('added: ' + n.label); }
        else if (tool === 'link') { const x = snap.ids.get(a.a), y = snap.ids.get(a.b); if (x && y && x !== y) { E.link(g, x, y, String(a.rel || 'relates to').slice(0, 24)); say({ k: 'add', text: 'Linked ' + short(g.byId.get(x).label, 40) + ' ' + (a.rel || 'relates to') + ' ' + short(g.byId.get(y).label, 40) }); notes.push('linked ' + a.a + ' ' + a.b); } }
        else if (tool === 'done') { say({ k: 'done', text: short(a.summary || 'Done.', 400) }); done = true; }
      } catch (e) { say({ k: 'error', text: tool + ' failed: ' + e.message }); notes.push(tool + ' failed: ' + e.message); }
      if (o.onChange) o.onChange(); }
    if (done) break;
  }
  return { added };
}
