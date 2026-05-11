const express = require('express');
const { runHousekeeping } = require('../services/housekeeping');
const { getDb, getSetting } = require('../db/database');
const { log } = require('../services/logger');

const router = express.Router();

router.post('/run', (req, res) => {
  try {
    const results = runHousekeeping('MANUAL');
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cleanup-unmatched', (req, res) => {
  const { dryRun = true } = req.body;

  const techKw  = getSetting('scraper_keywords_tech') || '';
  const hospKw  = getSetting('scraper_keywords_hospitality') || '';
  const location = (getSetting('scraper_location') || 'Christchurch').toLowerCase().trim();

  const keywords = [...new Set(
    (techKw + ',' + hospKw).split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
  )];

  const db = getDb();
  const jobs = db.prepare(`
    SELECT id, title, company, location, source FROM jobs
    WHERE is_soft_deleted = 0 AND source IS NOT NULL AND source != 'Manual'
  `).all();

  const toRemove = jobs.filter(j => {
    const title = (j.title || '').toLowerCase();
    const loc   = (j.location || '').toLowerCase();
    const matchesKeyword  = keywords.some(k => title.includes(k));
    const matchesLocation = !loc || loc.includes(location);
    return !matchesKeyword || !matchesLocation;
  });

  if (!dryRun) {
    const ids = toRemove.map(j => j.id);
    if (ids.length) {
      db.prepare(`UPDATE jobs SET is_soft_deleted = 1 WHERE id IN (${ids.map(() => '?').join(',')})`)
        .run(...ids);
      log({ type: 'activity', trigger: 'MANUAL', action: 'CLEANUP', reason: `Removed ${ids.length} unmatched jobs` });
    }
  }

  res.json({ ok: true, count: toRemove.length, jobs: toRemove.map(j => ({ id: j.id, title: j.title, company: j.company })) });
});

module.exports = router;
