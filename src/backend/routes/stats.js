const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { generateWelcome } = require('../services/ai');

const router = express.Router();

// GET /api/stats
router.get('/', (req, res) => {
  const db = getDb();
  const cols = ['Shortlisted','Applied','Interview','Offer','Rejected'];
  const counts = {};
  for (const c of cols) {
    counts[c] = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE status = ? AND is_soft_deleted = 0').get(c).n;
  }

  const activity = [];
  for (let i = 6; i >= 0; i--) {
    const row = db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE date(created_at) = date('now', '-' || ? || ' days') AND is_soft_deleted = 0`).get(i);
    const d = new Date(); d.setDate(d.getDate() - i);
    activity.push({ day: d.toLocaleDateString('en-NZ', { weekday: 'short' }), n: row.n });
  }

  const sources = db.prepare(`
    SELECT source, COUNT(*) as n FROM jobs WHERE is_soft_deleted = 0 AND source IS NOT NULL GROUP BY source ORDER BY n DESC
  `).all();

  const deadlines = db.prepare(`
    SELECT * FROM jobs WHERE deadline IS NOT NULL AND deadline != '' AND deadline != '—'
      AND is_soft_deleted = 0 ORDER BY deadline ASC LIMIT 5
  `).all();

  const recent = db.prepare(`
    SELECT COUNT(*) as n FROM jobs WHERE created_at >= datetime('now', '-1 day') AND is_soft_deleted = 0
  `).get().n;

  const upcoming7 = db.prepare(`
    SELECT COUNT(*) as n FROM jobs WHERE deadline IS NOT NULL AND deadline != '' AND is_soft_deleted = 0
  `).get().n;

  res.json({ counts, activity, sources, deadlines, recent, upcoming7 });
});

// GET /api/welcome
router.get('/welcome', async (req, res) => {
  try {
    const db = getDb();
    const cols = ['Shortlisted','Applied','Interview','Offer'];
    const stats = {};
    for (const c of cols) {
      stats[c.toLowerCase()] = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE status = ? AND is_soft_deleted = 0').get(c).n;
    }
    stats.recentMatches = db.prepare(
      "SELECT COUNT(*) as n FROM jobs WHERE created_at >= datetime('now', '-1 day') AND is_soft_deleted = 0"
    ).get().n;
    stats.upcomingDeadlines = db.prepare(
      "SELECT COUNT(*) as n FROM jobs WHERE deadline IS NOT NULL AND deadline != '' AND is_soft_deleted = 0"
    ).get().n;

    const name = getSetting('display_name') || 'James';
    const msg = await generateWelcome(stats, name);
    res.json({ message: msg });
  } catch (e) {
    res.json({ message: `Welcome back. You have jobs to review today.` });
  }
});

module.exports = router;
