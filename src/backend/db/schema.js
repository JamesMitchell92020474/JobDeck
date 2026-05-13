// This file defines the database structure (called a "schema").
// Each CREATE TABLE statement creates a table — think of it like a spreadsheet tab,
// where each column header is defined here.
//
// "IF NOT EXISTS" means the table is only created if it doesn't already exist,
// so running this file multiple times is safe.

module.exports = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- User-configurable settings stored as simple key-value pairs.
-- e.g. key = "theme", value = "dark"
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,  -- the setting name (must be unique)
  value TEXT NOT NULL       -- the setting value, always stored as text
);

-- One row per job listing. This is the main table in the app.
CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- unique ID, auto-assigned
  title        TEXT NOT NULL,       -- job title e.g. "Frontend Developer"
  company      TEXT,                -- employer name
  location     TEXT,                -- city/region
  source       TEXT,                -- where it came from: "Seek", "Trade Me Jobs", etc.
  source_url   TEXT,                -- link to the original job listing
  status       TEXT NOT NULL DEFAULT 'New',  -- pipeline stage: New, Interested, Applied, etc.
  posting_date TEXT,                -- when the job was posted (if available)
  expiry_date  TEXT,                -- when the listing closes (if available)
  description  TEXT,                -- full job description HTML (fetched separately)
  salary       TEXT,                -- salary range if listed
  job_type     TEXT,                -- Full time / Part time / Contract etc.
  is_remote    INTEGER DEFAULT 0,   -- 1 = remote, 0 = not (true/false stored as 1/0)
  is_hybrid    INTEGER DEFAULT 0,   -- 1 = hybrid working arrangement
  fit_score    INTEGER,             -- AI match score 0–100 against the user's CV
  ai_summary   TEXT,                -- AI-written summary of how well the job fits
  skills_gaps  TEXT,                -- JSON array of skills the user is missing
  description_summary TEXT,         -- short 1–2 sentence AI summary of the role
  deadline     TEXT,                -- application closing date (extracted from description)
  calendar_reminder TEXT,           -- reminder date set by the user
  notes        TEXT,                -- user's own notes on the job
  cover_letter TEXT,                -- AI-generated cover letter text
  job_category TEXT DEFAULT NULL,   -- "tech", "hospitality", or null (General)
  logo_url     TEXT,                -- company logo URL (fetched from job page)
  is_duplicate INTEGER DEFAULT 0,   -- 1 if this is flagged as a duplicate
  duplicate_of INTEGER,             -- ID of the original job if this is a duplicate
  is_soft_deleted INTEGER DEFAULT 0,-- 1 = hidden from the UI but kept in DB
  soft_deleted_at TEXT,             -- when it was soft-deleted
  created_at   TEXT DEFAULT (datetime('now')),  -- when the row was created
  updated_at   TEXT DEFAULT (datetime('now'))   -- when the row was last changed
);

-- Files attached to a job (e.g. a tailored CV or cover letter PDF).
-- References jobs(id): if a job is deleted, its files are deleted too (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS job_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,      -- the filename on disk
  original_name TEXT NOT NULL,      -- the filename the user uploaded
  file_type     TEXT,               -- MIME type e.g. "application/pdf"
  file_size     INTEGER,            -- file size in bytes
  file_path     TEXT NOT NULL,      -- full path to the file on disk
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Chat messages for the per-job Claude chat (not the global chat).
-- "role" is either "user" (the person) or "assistant" (Claude).
-- "mode" separates regular chat from mock interview sessions.
-- "answer_meta" stores timing and filler-word data for interview answers (JSON).
CREATE TABLE IF NOT EXISTS job_chat (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,     -- "user" or "assistant"
  content     TEXT NOT NULL,     -- the message text
  model       TEXT,              -- which AI model replied (e.g. "claude-sonnet-...")
  mode        TEXT NOT NULL DEFAULT 'chat',  -- "chat" or "interview"
  answer_meta TEXT,              -- JSON: { duration, wordCount, fillerWords } for interview mode
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Named sessions for the global chat (the full job-search chat, not per-job).
-- Max 20 sessions are kept; older ones are removed automatically.
CREATE TABLE IF NOT EXISTS global_chat_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',  -- auto-set from the user's first message
  created_at TEXT DEFAULT (datetime('now'))
);

-- Messages in the global chat, grouped by session.
-- "is_deep_analysis" flags messages sent using the more powerful (Opus) model.
CREATE TABLE IF NOT EXISTS global_chat (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER REFERENCES global_chat_sessions(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,             -- "user" or "assistant"
  content          TEXT NOT NULL,
  model            TEXT,
  is_deep_analysis INTEGER DEFAULT 0,         -- 1 = used the Opus model
  created_at       TEXT DEFAULT (datetime('now'))
);

-- Saved mock interview transcripts (one row per completed interview).
-- When the user clicks "Save Interview", the full conversation is formatted
-- as plain text and stored here so they can review it later.
CREATE TABLE IF NOT EXISTS job_interview_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  transcript  TEXT NOT NULL,   -- the full formatted conversation
  created_at  TEXT DEFAULT (datetime('now'))
);

-- A log of things the app has done: scraping, AI scoring, moving jobs, etc.
-- Used by the activity log viewer in the sidebar.
CREATE TABLE IF NOT EXISTS activity_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  log_type     TEXT NOT NULL,     -- category e.g. "scraper", "activity"
  trigger_type TEXT NOT NULL,     -- what caused it: "MANUAL", "AUTO", "AI"
  action       TEXT NOT NULL,     -- what happened e.g. "ARCHIVED", "SCORED"
  job_title    TEXT,              -- which job it relates to (if any)
  company      TEXT,
  source       TEXT,              -- which job board
  reason       TEXT,              -- human-readable explanation
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Stores the user's cover letter template/style guide.
-- There is always exactly one row (id = 1).
CREATE TABLE IF NOT EXISTS cover_letter_template (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  content    TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Make sure the single cover letter template row exists.
INSERT OR IGNORE INTO cover_letter_template (id, content) VALUES (1, '');
`;
