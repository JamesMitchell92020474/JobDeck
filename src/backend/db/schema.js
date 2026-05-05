module.exports = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  company      TEXT,
  location     TEXT,
  source       TEXT,
  source_url   TEXT,
  status       TEXT NOT NULL DEFAULT 'Shortlisted',
  posting_date TEXT,
  expiry_date  TEXT,
  description  TEXT,
  salary       TEXT,
  job_type     TEXT,
  is_remote    INTEGER DEFAULT 0,
  is_hybrid    INTEGER DEFAULT 0,
  fit_score    INTEGER,
  ai_summary   TEXT,
  skills_gaps  TEXT,
  deadline     TEXT,
  calendar_reminder TEXT,
  notes        TEXT,
  cover_letter TEXT,
  is_duplicate INTEGER DEFAULT 0,
  duplicate_of INTEGER,
  is_soft_deleted INTEGER DEFAULT 0,
  soft_deleted_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type     TEXT,
  file_size     INTEGER,
  file_path     TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_chat (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  model      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS global_chat (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  model            TEXT,
  is_deep_analysis INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  log_type     TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  action       TEXT NOT NULL,
  job_title    TEXT,
  company      TEXT,
  source       TEXT,
  reason       TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cover_letter_template (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  content    TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO cover_letter_template (id, content) VALUES (1, '');
`;
