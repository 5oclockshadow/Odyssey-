-- Map Graph backend schema (SQLite). Apply once: sqlite3 mapgraph.db < schema.sql
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seq         INTEGER NOT NULL UNIQUE,            -- arrival order, 1-based
  code        TEXT NOT NULL UNIQUE,               -- 8-char member and referral code
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'other',
  interest    TEXT NOT NULL DEFAULT 'both' CHECK (interest IN ('thoughts','atlas','both')),
  use_case    TEXT NOT NULL DEFAULT '',
  referred_by TEXT,                               -- code of the member who invited this one
  referrals   INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT '',
  survey_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_signups_score ON signups ((seq - 10 * referrals));
CREATE TABLE IF NOT EXISTS upgrades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL REFERENCES signups(code), plan TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, page TEXT NOT NULL DEFAULT '', session TEXT NOT NULL DEFAULT '', props_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type, created_at);
CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL REFERENCES signups(code), template TEXT NOT NULL,
  send_at TEXT NOT NULL, sent_at TEXT, error TEXT, UNIQUE (code, template)
);
CREATE INDEX IF NOT EXISTS idx_queue_due ON email_queue (sent_at, send_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_limits (key, at);
