const { getDb, getSetting } = require('../db/database');
const { log } = require('./logger');

function runHousekeeping(trigger = 'AUTO') {
  const db = getDb();
  const results = { archived: 0, softDeleted: 0, hardDeleted: 0 };

  const ageDays  = parseInt(getSetting('hk_age_days')  || '30', 10);
  const softDays = parseInt(getSetting('hk_soft_days') || '90', 10);
  const hardDays = parseInt(getSetting('hk_hard_days') || '14', 10);

  const hasAttachments = (job) => {
    const files = db.prepare('SELECT id FROM job_files WHERE job_id = ?').get(job.id);
    const chat  = db.prepare('SELECT id FROM job_chat  WHERE job_id = ?').get(job.id);
    return !!(files || chat || job.notes || job.cover_letter);
  };

  // 1. Archive expired jobs
  const expired = db.prepare(`
    SELECT * FROM jobs
    WHERE status NOT IN ('Archived','Rejected') AND is_soft_deleted = 0
      AND expiry_date IS NOT NULL AND expiry_date != ''
      AND expiry_date < date('now')
  `).all();

  for (const j of expired) {
    if (hasAttachments(j)) {
      log({ type: 'housekeeping', trigger, action: 'FLAGGED-FOR-REVIEW', jobTitle: j.title, company: j.company, source: j.source, reason: 'Expired but has attachments' });
      continue;
    }
    db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(j.id);
    log({ type: 'housekeeping', trigger, action: 'ARCHIVED', jobTitle: j.title, company: j.company, source: j.source, reason: `Expired ${j.expiry_date}` });
    results.archived++;
  }

  // 2. Archive old jobs with no expiry
  const old = db.prepare(`
    SELECT * FROM jobs
    WHERE status NOT IN ('Archived','Rejected') AND is_soft_deleted = 0
      AND (expiry_date IS NULL OR expiry_date = '')
      AND created_at < datetime('now', '-' || ? || ' days')
  `).all(ageDays);

  for (const j of old) {
    if (hasAttachments(j)) continue;
    db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(j.id);
    log({ type: 'housekeeping', trigger, action: 'ARCHIVED', jobTitle: j.title, company: j.company, source: j.source, reason: `Older than ${ageDays} days` });
    results.archived++;
  }

  // 3. Soft-delete Archived and Rejected jobs older than softDays
  const toSoftDelete = db.prepare(`
    SELECT * FROM jobs
    WHERE status IN ('Archived','Rejected') AND is_soft_deleted = 0
      AND updated_at < datetime('now', '-' || ? || ' days')
  `).all(softDays);

  for (const j of toSoftDelete) {
    if (hasAttachments(j)) continue;
    db.prepare("UPDATE jobs SET is_soft_deleted = 1, soft_deleted_at = datetime('now') WHERE id = ?").run(j.id);
    log({ type: 'housekeeping', trigger, action: 'SOFT-DELETED', jobTitle: j.title, company: j.company, source: j.source });
    results.softDeleted++;
  }

  // 4. Hard-delete soft-deleted records older than hardDays
  const toHardDelete = db.prepare(`
    SELECT * FROM jobs
    WHERE is_soft_deleted = 1
      AND soft_deleted_at < datetime('now', '-' || ? || ' days')
  `).all(hardDays);

  for (const j of toHardDelete) {
    if (hasAttachments(j)) continue;
    db.prepare('DELETE FROM jobs WHERE id = ?').run(j.id);
    log({ type: 'housekeeping', trigger, action: 'HARD-DELETED', jobTitle: j.title, company: j.company, source: j.source });
    results.hardDeleted++;
  }

  return results;
}

module.exports = { runHousekeeping };
