const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const LOG_TYPES = ['housekeeping', 'activity', 'scraper', 'errors'];
const MAX_LOG_FOLDER_MB = 50;

function getLogPath() {
  const { getSetting } = require('../db/database');
  return getSetting('log_path') || process.env.LOG_PATH || path.join('D:', 'JobDeck', 'logs');
}

function ensureLogDir() {
  fs.mkdirSync(getLogPath(), { recursive: true });
}

function getLogFilename(type) {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return path.join(getLogPath(), `jd-${type}-${ym}.log`);
}

function writeToFile(type, line) {
  try {
    ensureLogDir();
    const file = getLogFilename(type);
    fs.appendFileSync(file, line + '\n');
    enforceFolderCap();
  } catch {}
}

function enforceFolderCap() {
  try {
    const { getSetting } = require('../db/database');
    const maxMb = parseInt(getSetting('log_retention_mb') || String(MAX_LOG_FOLDER_MB), 10);
    const dir = getLogPath();
    const files = fs.readdirSync(dir)
      .map(f => ({ name: f, p: path.join(dir, f), stat: fs.statSync(path.join(dir, f)) }))
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);

    let totalBytes = files.reduce((s, f) => s + f.stat.size, 0);
    while (totalBytes > maxMb * 1024 * 1024 && files.length > 0) {
      const oldest = files.shift();
      fs.unlinkSync(oldest.p);
      totalBytes -= oldest.stat.size;
    }
  } catch {}
}

function log({ type = 'activity', trigger = 'MANUAL', action, jobTitle, company, source, reason }) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const parts = [ts, `[${trigger}]`, `${action}`];
  if (jobTitle) parts.push(`"${jobTitle}"`);
  if (company)  parts.push(`at ${company}`);
  if (source)   parts.push(`(${source})`);
  if (reason)   parts.push(`— reason: ${reason}`);
  const line = parts.join(' — ');

  writeToFile(type, line);

  try {
    getDb().prepare(`
      INSERT INTO activity_logs (log_type, trigger_type, action, job_title, company, source, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(type, trigger, action, jobTitle || null, company || null, source || null, reason || null);
  } catch {}
}

function getLogs({ type, trigger, from, to, limit = 200 } = {}) {
  let q = 'SELECT * FROM activity_logs WHERE 1=1';
  const params = [];
  if (type)    { q += ' AND log_type = ?';     params.push(type); }
  if (trigger) { q += ' AND trigger_type = ?'; params.push(trigger); }
  if (from)    { q += ' AND created_at >= ?';  params.push(from); }
  if (to)      { q += ' AND created_at <= ?';  params.push(to); }
  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(q).all(...params);
}

module.exports = { log, getLogs };
