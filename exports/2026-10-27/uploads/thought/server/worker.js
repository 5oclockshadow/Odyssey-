// Sends due drip emails. Run on a schedule or as a long-running process: npm run worker
import { openStore } from './store-sqlite.js';
import { render } from './emails.js';

const env = process.env, store = openStore(), PUBLIC = env.PUBLIC_URL || 'http://localhost:8787';
let transport = null;
if (env.SMTP_URL) { const { default: nodemailer } = await import('nodemailer'); transport = nodemailer.createTransport(env.SMTP_URL); }
const due = store.db.prepare("SELECT q.id, q.template, s.* FROM email_queue q JOIN signups s ON s.code = q.code WHERE q.sent_at IS NULL AND q.send_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY q.send_at LIMIT 50");
const done = store.db.prepare("UPDATE email_queue SET sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), error = ? WHERE id = ?");
async function tick() {
  for (const r of due.all()) {
    const m = { name: r.name, position: store.positionOf(r.code), referralUrl: PUBLIC + '/Map%20Graph%20-%20Home.dc.html?ref=' + r.code, upgradeUrl: PUBLIC + '/Map%20Graph%20-%20Founding.dc.html?code=' + r.code }, mail = render(r.template, m);
    try { if (transport) await transport.sendMail({ from: env.MAIL_FROM || 'Map Graph <hello@example.com>', to: r.email, subject: mail.subject, text: mail.text, html: mail.html }); else console.log('[dry run]', r.email, '->', mail.subject); done.run(null, r.id); }
    catch (e) { done.run(String(e.message || e).slice(0, 200), r.id); }
  }
}
await tick(); if (env.ONCE !== '1') setInterval(tick, 60000);
