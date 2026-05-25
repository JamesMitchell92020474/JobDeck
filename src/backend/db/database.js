// This file manages the database connection and initial setup.
// It uses Node.js 24's built-in SQLite module — no extra packages needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');
const schema = require('./schema');

// We only open the database once. This variable holds it after the first call.
let db = null;

// Returns the open database connection, creating it if this is the first call.
// All other files use this function whenever they need to read or write data.
function getDb() {
  // If we've already opened the database, return it immediately.
  if (db) return db;

  // Work out where to store the database file.
  // Uses the DATA_PATH environment variable, or a default path on the D: drive.
  const dataPath = process.env.DATA_PATH || path.join(require('os').homedir(), 'JobDeck', 'data');
  const dbPath   = path.join(dataPath, 'jd-database.db');

  // Create the folder if it doesn't exist yet (the { recursive: true } option
  // means it won't error if the folder already exists).
  fs.mkdirSync(dataPath, { recursive: true });

  // Open (or create) the database file, then run the schema to create any
  // tables that don't exist yet.
  db = new DatabaseSync(dbPath);
  db.exec(schema);

  // ─── Migrations ────────────────────────────────────────────────────────────
  // A migration updates the database structure for users who installed the app
  // before a new column or table was added. We wrap each in try/catch so that
  // if the column already exists (on a fresh install), the error is silently
  // ignored rather than crashing the app.

  try { db.exec('ALTER TABLE jobs ADD COLUMN job_category TEXT DEFAULT NULL') } catch {}
  try { db.exec('ALTER TABLE jobs ADD COLUMN logo_url TEXT') } catch {}

  // In an older version "Shortlisted" was used instead of "Interested".
  // This renames any old rows to match the current naming.
  try { db.exec("UPDATE jobs SET status = 'Interested' WHERE status = 'Shortlisted'") } catch {}

  // One-time migration: reset all active jobs back to "New" so the user can
  // triage them properly. We use a settings flag so this only runs once.
  const newWorkflowV2 = db.prepare("SELECT value FROM settings WHERE key = 'migrated_new_workflow_v2'").get();
  if (!newWorkflowV2) {
    db.exec("UPDATE jobs SET status = 'New' WHERE status NOT IN ('Archived', 'Rejected') AND is_soft_deleted = 0");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_new_workflow_v2', '1');
  }

  // One-time migration: archive any scraped jobs whose location doesn't match
  // the user's configured city (they may have changed location in Settings).
  const locationMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_location_filter_v1'").get();
  if (!locationMigrated) {
    const configuredLocation = (db.prepare("SELECT value FROM settings WHERE key = 'scraper_location'").get()?.value || 'Christchurch').toLowerCase().trim();
    // Each city maps to a list of place-name keywords we accept as matching.
    const keywordMap = {
      christchurch: ['christchurch', 'canterbury', 'selwyn', 'waimakariri'],
      auckland:     ['auckland'],
      wellington:   ['wellington'],
      hamilton:     ['hamilton', 'waikato'],
      tauranga:     ['tauranga', 'bay of plenty'],
      dunedin:      ['dunedin', 'otago'],
    };
    const keywords = keywordMap[configuredLocation];
    if (keywords) {
      const jobs = db.prepare("SELECT id, location FROM jobs WHERE source IN ('Seek', 'Trade Me Jobs') AND status = 'New' AND is_soft_deleted = 0 AND location != ''").all();
      // Archive any job whose location string doesn't include at least one
      // of the accepted keywords for the configured city.
      const toArchive = jobs.filter(j => !keywords.some(k => j.location.toLowerCase().includes(k)));
      for (const j of toArchive) {
        db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(j.id);
      }
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_location_filter_v1', '1');
  }

  // One-time migration: archive jobs from Jora and Indeed, which are no longer
  // scraped, and remove them from the source colour settings.
  const retiredSourcesMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_retired_sources_v1'").get();
  if (!retiredSourcesMigrated) {
    db.exec("UPDATE jobs SET status = 'Archived' WHERE source IN ('Jora', 'Indeed') AND status NOT IN ('Archived', 'Rejected') AND is_soft_deleted = 0");
    const colorsRow = db.prepare("SELECT value FROM settings WHERE key = 'source_colors'").get();
    if (colorsRow) {
      try {
        const colors = JSON.parse(colorsRow.value);
        delete colors['Jora'];
        delete colors['Indeed'];
        db.prepare("UPDATE settings SET value = ? WHERE key = 'source_colors'").run(JSON.stringify(colors));
      } catch {}
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_retired_sources_v1', '1');
  }

  // Add new columns that were added in later versions of the app.
  // The try/catch means these are silently skipped if the column already exists.
  try { db.exec("ALTER TABLE job_chat ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'") } catch {}
  try { db.exec('ALTER TABLE job_chat ADD COLUMN answer_meta TEXT') } catch {}
  try { db.exec('ALTER TABLE jobs ADD COLUMN description_summary TEXT') } catch {}
  try { db.exec('ALTER TABLE jobs ADD COLUMN cover_letter_settings TEXT') } catch {}
  try { db.exec('ALTER TABLE activity_logs ADD COLUMN job_id INTEGER') } catch {}

  // One-time migration: move all existing global chat messages into a single
  // named session, so they're not orphaned when the sessions feature is added.
  const sessionsMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_chat_sessions_v1'").get();
  if (!sessionsMigrated) {
    try { db.exec('ALTER TABLE global_chat ADD COLUMN session_id INTEGER') } catch {}
    const existingCount = db.prepare('SELECT COUNT(*) as n FROM global_chat').get().n;
    if (existingCount > 0) {
      // Name the session after the first message the user ever sent.
      const firstMsg = db.prepare('SELECT content FROM global_chat ORDER BY created_at ASC LIMIT 1').get();
      const name = (firstMsg?.content || 'Previous chat').trim().slice(0, 60);
      const r = db.prepare('INSERT INTO global_chat_sessions (name) VALUES (?)').run(name);
      // Link all existing messages to this new session.
      db.prepare('UPDATE global_chat SET session_id = ?').run(r.lastInsertRowid);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_chat_sessions_v1', '1');
  }

  // One-time migration: blank out posting_date values that were stored as raw
  // unparsed text (e.g. "Listed yesterday") — cards fall back to relative date.
  const postingDateCleaned = db.prepare("SELECT value FROM settings WHERE key = 'migrated_posting_date_v1'").get();
  if (!postingDateCleaned) {
    db.exec("UPDATE jobs SET posting_date = NULL WHERE posting_date IS NOT NULL AND posting_date NOT GLOB '[0-9]*'");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_posting_date_v1', '1');
  }

  // ─── Default settings ──────────────────────────────────────────────────────
  // These are inserted once when the app first runs. "INSERT OR IGNORE" means
  // existing values are never overwritten — user changes are preserved.
  const defaults = {
    theme:           'light',
    accent_color:    process.env.ACCENT_COLOR || '#423A8E',
    display_font:    'Cambria',
    body_font:       'Inter',
    card_style:      'edge',
    display_name:      process.env.DISPLAY_NAME || '',
    scraper_location:  process.env.SCRAPER_LOCATION || 'Christchurch',
    cv_label_1:      'CV Profile 1',
    cv_label_2:      'CV Profile 2',
    density:         'balanced',
    source_colors:   JSON.stringify({ Seek: '#FFC107', 'Trade Me Jobs': '#DC3545' }),
    disabled_sources: JSON.stringify({}),
    hk_age_days:    '21',          // housekeeping: archive jobs older than this many days
    hk_soft_days:   '14',          // housekeeping: soft-delete archived jobs after this many days
    hk_hard_days:   '7',           // housekeeping: hard-delete soft-deleted jobs after this
    low_disk_gb:    process.env.LOW_DISK_WARNING_GB || '2',
    api_key:        '',
    deep_analysis:  '0',
    sync_on_startup: '0',
  };

  // Insert all defaults in a single transaction for efficiency.
  // A transaction groups multiple writes so they either all succeed or all fail.
  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
  }

  return db;
}

// Read a single setting value by its key. Returns null if the key doesn't exist.
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Write (or overwrite) a setting value. Everything is stored as text.
function setSetting(key, value) {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, String(value));
}

// Return all settings at once as a plain object: { key: value, ... }
function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

module.exports = { getDb, getSetting, setSetting, getAllSettings };
