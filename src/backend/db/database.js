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

  // Seed default settings
  const defaults = {
    theme:           'light',
    accent_color:    process.env.ACCENT_COLOR || '#423A8E',
    display_font:    'Cambria',
    body_font:       'Inter',
    card_style:      'edge',
    display_name:    'James Mitchell',
    email:           'james@mitchell.nz',
    density:         'balanced',
    source_colors:   JSON.stringify({
      Seek:           '#FFC107',
      LinkedIn:       '#0D6EFD',
      'Trade Me Jobs':'#DC3545',
      Jora:           '#198754',
      Indeed:         '#6E6B85',
    }),
    disabled_sources: JSON.stringify({}),
    hk_age_days:    '30',
    hk_soft_days:   '90',
    hk_hard_days:   '14',
    low_disk_gb:    process.env.LOW_DISK_WARNING_GB || '2',
    api_key:        '',
    deep_analysis:  '0',
    auto_theme:     '0',
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
