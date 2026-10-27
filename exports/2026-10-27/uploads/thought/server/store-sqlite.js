// SQLite store for the shared handler. Uses better-sqlite3 (synchronous, fast, one file).
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeCode } from './handler.js';

export function openStore(file = process.env.DB_FILE || './mapgraph.db') {
  const db = new Database(file); db.exec(readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8'));
  const q = {
    byEmail: db.prepare('SELECT * FROM signups WHERE email = ?'), byCode: db.prepare('SELECT * FROM signups WHERE code = ?'),
    maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM signups'),
    add: db.prepare('INSERT INTO signups (seq, code, email, name, role, interest, use_case, referred_by, source) VALUES (@seq, @code, @email, @name, @role, @interest, @useCase, @ref, @source)'),
    bump: db.prepare('UPDATE signups SET referrals = referrals + 1 WHERE code = ?'), survey: db.prepare('UPDATE signups SET survey_json = ? WHERE code = ?'),
    pos: db.prepare('SELECT 1 + COUNT(*) AS p FROM signups WHERE (seq - 10 * referrals) < (SELECT seq - 10 * referrals FROM signups WHERE code = ?)'),
    upgrade: db.prepare('INSERT INTO upgrades (code, plan, note) VALUES (@code, @plan, @note)'), contact: db.prepare('INSERT INTO contacts (name, email, topic, message) VALUES (@name, @email, @topic, @message)'),
    event: db.prepare('INSERT INTO events (type, page, session, props_json) VALUES (?, ?, ?, ?)'),
    enqueue: db.prepare("INSERT OR IGNORE INTO email_queue (code, template, send_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ? || ' hours'))"),
    rateAdd: db.prepare('INSERT INTO rate_limits (key, at) VALUES (?, ?)'), rateCount: db.prepare('SELECT COUNT(*) AS c FROM rate_limits WHERE key = ? AND at > ?'), rateGc: db.prepare('DELETE FROM rate_limits WHERE at < ?'),
  };
  const row = r => r && { ...r, useCase: r.use_case };
  return {
    signupByEmail: e => row(q.byEmail.get(e)), signupByCode: c => row(q.byCode.get(c)),
    addSignup(v) { const seq = q.maxSeq.get().m + 1, code = makeCode(); const info = q.add.run({ seq, code, ...v, ref: v.ref || null }); return row(q.byCode.get(code)) || { id: info.lastInsertRowid, code }; },
    bumpReferral: c => q.bump.run(c), setSurvey: (c, s) => q.survey.run(JSON.stringify(s), c), positionOf: c => q.pos.get(c).p,
    addUpgrade: v => q.upgrade.run(v).lastInsertRowid, addContact: v => q.contact.run(v).lastInsertRowid, addEvent: v => q.event.run(v.type, v.page, v.session, JSON.stringify(v.props)),
    enqueue: (code, drip) => { for (const d of drip) q.enqueue.run(code, d.tpl, d.delayH); },
    rateOk(key, limit, windowMs) { const now = Date.now(); q.rateGc.run(now - 3600000); if (q.rateCount.get(key, now - windowMs).c >= limit) return false; q.rateAdd.run(key, now); return true; },
    stats: () => ({ signups: db.prepare('SELECT COUNT(*) c FROM signups').get().c, byInterest: Object.fromEntries(db.prepare('SELECT interest, COUNT(*) c FROM signups GROUP BY interest').all().map(r => [r.interest, r.c])), referrals: db.prepare('SELECT COALESCE(SUM(referrals),0) s FROM signups').get().s, upgrades: db.prepare('SELECT COUNT(*) c FROM upgrades').get().c, events: Object.fromEntries(db.prepare('SELECT type, COUNT(*) c FROM events GROUP BY type').all().map(r => [r.type, r.c])) }),
    allSignups: () => db.prepare('SELECT * FROM signups ORDER BY seq').all(), db,
  };
}
