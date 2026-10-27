// Map Graph server: JSON API plus (optionally) the static site. Run: npm start
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './handler.js';
import { openStore } from './store-sqlite.js';

const env = process.env;
if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24 || /change-me/i.test(env.ADMIN_TOKEN)) { console.error('Refusing to start: set ADMIN_TOKEN to a random value of 24+ characters (openssl rand -hex 24).'); process.exit(1); }
const audit = e => console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'audit', ...e }));
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'SAMEORIGIN', 'strict-transport-security': 'max-age=31536000' };
const PORT = +env.PORT || 8787, store = openStore(), ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jsx': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const cors = o => ({ ...SEC, 'access-control-allow-origin': env.CORS_ORIGIN || (env.NODE_ENV === 'production' ? 'null' : o || '*'), 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), headers = { ...req.headers };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(req.headers.origin)); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 20000) { res.writeHead(413, cors()); return res.end('{"ok":false,"error":"too_large"}'); } }
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { res.writeHead(400, { ...cors(), 'content-type': 'application/json' }); return res.end('{"ok":false,"error":"bad_json"}'); }
    const out = await handle(store, { method: req.method, path: url.pathname, body, headers, env, ip: req.socket.remoteAddress, audit });
    if (out.json.csv !== undefined) { res.writeHead(out.status, { ...cors(), 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="signups.csv"' }); return res.end(out.json.csv); }
    res.writeHead(out.status, { ...cors(req.headers.origin), 'content-type': 'application/json' }); return res.end(JSON.stringify(out.json));
  }
  if (env.SERVE_STATIC === '0') { res.writeHead(404); return res.end(); }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]\.\.)+/, ''); if (p === '/' || p === '\\') p = '/Map Graph - Home.dc.html';
  const file = join(ROOT, p); if (!file.startsWith(ROOT) || /\/server\//.test(file.replace(/\\/g, '/')) || /\.(db|env|md|sql|yaml)$/.test(file) || /(^|\/)\./.test(file.slice(ROOT.length))) { res.writeHead(404); return res.end(); }
  try { const s = await stat(file); if (!s.isFile()) throw 0; res.writeHead(200, { ...SEC, 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(await readFile(file)); } catch (e) { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Map Graph on http://localhost:' + PORT));
