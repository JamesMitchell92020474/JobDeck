// Uses Node.js 24's built-in node:sqlite (no native compilation needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const schema = require('./schema');

let db = null;

function getDb() {
  if (db) return db;

  const dataPath = process.env.DATA_PATH || path.join('D:', 'JobDeck', 'data');
  const dbPath   = path.join(dataPath, 'jd-database.db');

  fs.mkdirSync(dataPath, { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec(schema);

  // Migrations for existing DBs
  try { db.exec('ALTER TABLE jobs ADD COLUMN job_category TEXT DEFAULT NULL') } catch {}
  try { db.exec('ALTER TABLE jobs ADD COLUMN logo_url TEXT') } catch {}
  // Rename Shortlisted → Interested, add New as scraper landing column
  try { db.exec("UPDATE jobs SET status = 'Interested' WHERE status = 'Shortlisted'") } catch {}
  // One-time: reset all active (non-archived) jobs to New for fresh triage
  const newWorkflowV2 = db.prepare("SELECT value FROM settings WHERE key = 'migrated_new_workflow_v2'").get();
  if (!newWorkflowV2) {
    db.exec("UPDATE jobs SET status = 'New' WHERE status NOT IN ('Archived', 'Rejected') AND is_soft_deleted = 0");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_new_workflow_v2', '1');
  }

  // Archive existing scraped jobs outside the configured location
  const locationMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_location_filter_v1'").get();
  if (!locationMigrated) {
    const configuredLocation = (db.prepare("SELECT value FROM settings WHERE key = 'scraper_location'").get()?.value || 'Christchurch').toLowerCase().trim();
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
      const toArchive = jobs.filter(j => !keywords.some(k => j.location.toLowerCase().includes(k)));
      for (const j of toArchive) {
        db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(j.id);
      }
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_location_filter_v1', '1');
  }

  // Remove retired sources — archive their jobs and strip from source_colors
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

  // Add mode column to job_chat for separating interview vs regular chat history
  try { db.exec("ALTER TABLE job_chat ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'") } catch {}
  // Answer metadata for interview mode (duration, word count, filler words)
  try { db.exec('ALTER TABLE job_chat ADD COLUMN answer_meta TEXT') } catch {}
  // Short AI-generated description summary for use in global chat context
  try { db.exec('ALTER TABLE jobs ADD COLUMN description_summary TEXT') } catch {}

  // Migrate global_chat to support named sessions (max 20, auto-named from first message)
  const sessionsMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_chat_sessions_v1'").get();
  if (!sessionsMigrated) {
    try { db.exec('ALTER TABLE global_chat ADD COLUMN session_id INTEGER') } catch {}
    const existingCount = db.prepare('SELECT COUNT(*) as n FROM global_chat').get().n;
    if (existingCount > 0) {
      const firstMsg = db.prepare('SELECT content FROM global_chat ORDER BY created_at ASC LIMIT 1').get();
      const name = (firstMsg?.content || 'Previous chat').trim().slice(0, 60);
      const r = db.prepare('INSERT INTO global_chat_sessions (name) VALUES (?)').run(name);
      db.prepare('UPDATE global_chat SET session_id = ?').run(r.lastInsertRowid);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('migrated_chat_sessions_v1', '1');
  }

  // Seed default settings
  const defaults = {
    theme:           'light',
    accent_color:    process.env.ACCENT_COLOR || '#423A8E',
    display_font:    'Cambria',
    body_font:       'Inter',
    card_style:      'edge',
    display_name:    '',
    cv_label_1:      'CV Profile 1',
    cv_label_2:      'CV Profile 2',
    email:           '',
    density:         'balanced',
    source_colors:   JSON.stringify({
      Seek:           '#FFC107',

      'Trade Me Jobs':'#DC3545',
    }),
    disabled_sources: JSON.stringify({}),
    hk_age_days:    '30',
    hk_soft_days:   '90',
    hk_hard_days:   '14',
    low_disk_gb:    process.env.LOW_DISK_WARNING_GB || '2',
    api_key:        '',
    deep_analysis:  '0',
  };

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

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, String(value));
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

module.exports = { getDb, getSetting, setSetting, getAllSettings };
