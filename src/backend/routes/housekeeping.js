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

  const toTerms = raw => raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const keywords       = [...new Set(toTerms(techKw + ',' + hospKw))];
  const excludeTech    = toTerms(getSetting('scraper_keywords_exclude_tech') || '');
  const excludeHosp    = toTerms(getSetting('scraper_keywords_exclude_hospitality') || '');

  const db = getDb();
  const jobs = db.prepare(`
    SELECT id, title, company, location, source, job_category, description FROM jobs
    WHERE is_soft_deleted = 0 AND source IS NOT NULL AND source != 'Manual'
      AND status = 'New'
  `).all();

  const toRemove = jobs.filter(j => {
    const title = (j.title || '').toLowerCase();
    const loc   = (j.location || '').toLowerCase();
    const matchesKeyword  = keywords.some(k => title.includes(k));
    const matchesLocation = !loc || loc.includes(location);
    if (!matchesKeyword || !matchesLocation) return true;

    // Also remove if title or description contains an excluded keyword for this category
    const excludes = j.job_category === 'tech' ? excludeTech
                   : j.job_category === 'hospitality' ? excludeHosp : [];
    if (excludes.length) {
      const descText = (j.description || '').replace(/<[^>]+>/g, ' ').toLowerCase();
      if (excludes.some(k => title.includes(k) || descText.includes(k))) return true;
    }
    return false;
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
