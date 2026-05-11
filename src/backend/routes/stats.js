const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { generateWelcome } = require('../services/ai');

// Christchurch coords — Open-Meteo, no API key required
const WMO_DESCRIPTIONS = {
  0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  80: 'rain showers', 81: 'rain showers', 82: 'heavy rain showers',
  95: 'thunderstorms',
};

async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=-43.5321&longitude=172.6362&current=temperature_2m,weather_code&timezone=Pacific%2FAuckland';
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const desc = WMO_DESCRIPTIONS[data.current.weather_code] || 'variable conditions';
    return { temp, desc };
  } catch {
    return null;
  }
}

const router = express.Router();

// GET /api/stats
router.get('/', (req, res) => {
  const db = getDb();
  const cols = ['New','Interested','Applied','Interview','Offer','Rejected','Archived'];
  const counts = {};
  for (const c of cols) {
    counts[c] = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE status = ? AND is_soft_deleted = 0').get(c).n;
  }

  // Compute NZ offset in hours (handles NZST +12 and NZDT +13 automatically)
  function getNZOffset() {
    const now = new Date();
    const nzDate = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((nzDate - utcDate) / 3600000);
  }
  const nzOffset = getNZOffset();
  const offsetStr = `+${nzOffset} hours`;

  // Today's date in NZ as YYYY-MM-DD (shift UTC now by NZ offset, then read UTC date)
  const nzNowMs  = Date.now() + nzOffset * 3600000;
  const nzTodayStr = new Date(nzNowMs).toISOString().slice(0, 10);
  const nzToday  = new Date(nzTodayStr + 'T00:00:00Z');

  // Monday of current NZ week (week starts Monday)
  const dow = nzToday.getUTCDay(); // 0=Sun
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(nzToday);
  monday.setUTCDate(monday.getUTCDate() - daysFromMon);

  const activity = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const isFuture = d > nzToday;
    const listings = isFuture ? 0 : db.prepare(`
      SELECT COUNT(*) as n FROM jobs
      WHERE date(datetime(created_at, ?)) = ? AND is_soft_deleted = 0
    `).get(offsetStr, dateStr).n;
    const applications = isFuture ? 0 : db.prepare(`
      SELECT COUNT(*) as n FROM activity_logs
      WHERE action = 'MOVED' AND reason = 'Moved to Applied'
        AND date(datetime(created_at, ?)) = ?
    `).get(offsetStr, dateStr).n;
    const label = new Intl.DateTimeFormat('en-NZ', { weekday: 'short', timeZone: 'UTC' }).format(d);
    activity.push({ day: label, listings, applications });
  }

  const sources = db.prepare(`
    SELECT source, COUNT(*) as n FROM jobs WHERE is_soft_deleted = 0 AND source IS NOT NULL GROUP BY source ORDER BY n DESC
  `).all();

  const deadlines = db.prepare(`
    SELECT * FROM jobs WHERE deadline IS NOT NULL AND deadline != '' AND deadline != '—'
      AND is_soft_deleted = 0 ORDER BY deadline ASC LIMIT 5
  `).all();

  const recent = db.prepare(`
    SELECT COUNT(*) as n FROM jobs
    WHERE date(datetime(created_at, ?)) = ? AND is_soft_deleted = 0
  `).get(offsetStr, nzTodayStr).n;

  const upcoming7 = db.prepare(`
    SELECT COUNT(*) as n FROM jobs WHERE deadline IS NOT NULL AND deadline != '' AND is_soft_deleted = 0
  `).get().n;

  res.json({ counts, activity, sources, deadlines, recent, upcoming7 });
});

// GET /api/welcome
router.get('/welcome', async (req, res) => {
  try {
    const db = getDb();
    const cols = ['New','Interested','Applied','Interview','Offer'];
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
    const weather = await fetchWeather();
    let msg = await generateWelcome(stats, name, weather);
    msg = msg.replace(/^(good\s+(morning|afternoon|evening)[,!]?\s*(james[,!]?\s*)?|hi[,!]?\s*(james[,!]?\s*)?|hey[,!]?\s*(james[,!]?\s*)?|hello[,!]?\s*(james[,!]?\s*)?)/i, '').trimStart();
    if (msg.length > 0) msg = msg[0].toUpperCase() + msg.slice(1);
    res.json({ message: msg });
  } catch (e) {
    res.json({ message: `Welcome back. You have jobs to review today.` });
  }
});

module.exports = router;
