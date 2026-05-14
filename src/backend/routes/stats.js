const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { generateWelcome } = require('../services/ai');

// Open-Meteo weather — no API key required. Coordinates keyed by scraper_location setting.
const WMO_DESCRIPTIONS = {
  0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  80: 'rain showers', 81: 'rain showers', 82: 'heavy rain showers',
  95: 'thunderstorms',
};

const CITY_COORDS = {
  christchurch: { lat: -43.5321, lon: 172.6362 },
  auckland:     { lat: -36.8485, lon: 174.7633 },
  wellington:   { lat: -41.2865, lon: 174.7762 },
  hamilton:     { lat: -37.7870, lon: 175.2793 },
  tauranga:     { lat: -37.6878, lon: 176.1651 },
  dunedin:      { lat: -45.8788, lon: 170.5028 },
};

async function fetchWeather(city = 'christchurch') {
  try {
    const coords = CITY_COORDS[city.toLowerCase().trim()] || CITY_COORDS.christchurch;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=Pacific%2FAuckland`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const desc = WMO_DESCRIPTIONS[data.current.weather_code] || 'variable conditions';
    return { temp, desc, city };
  } catch {
    return null;
  }
}

const router = express.Router();

// In-memory welcome message cache. Keyed on time-of-day bucket + pipeline counts
// so it only regenerates when something meaningful has changed.
let welcomeCache = { key: null, message: null };

function timeBucket() {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false }));
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

function welcomeKey(stats) {
  return `${timeBucket()}|${stats.new}|${stats.interested}|${stats.applied}|${stats.interview}|${stats.offer}|${stats.recentMatches}|${stats.upcomingDeadlines}`;
}

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
      AND is_soft_deleted = 0 AND status NOT IN ('Archived','Rejected')
      ORDER BY deadline ASC LIMIT 5
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

// GET /api/stats/welcome
// Cached by time-of-day bucket + pipeline counts. Pass ?refresh=1 to force regeneration.
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

    const key = welcomeKey(stats);
    if (req.query.refresh !== '1' && welcomeCache.key === key && welcomeCache.message) {
      return res.json({ message: welcomeCache.message, cached: true });
    }

    const name = getSetting('display_name') || '';
    const city = getSetting('scraper_location') || 'Christchurch';
    const weather = await fetchWeather(city);
    let msg = await generateWelcome(stats, name, weather);
    msg = msg.replace(/^(good\s+(morning|afternoon|evening)[,!]?\s*(james[,!]?\s*)?|hi[,!]?\s*(james[,!]?\s*)?|hey[,!]?\s*(james[,!]?\s*)?|hello[,!]?\s*(james[,!]?\s*)?)/i, '').trimStart();
    if (msg.length > 0) msg = msg[0].toUpperCase() + msg.slice(1);

    welcomeCache = { key, message: msg };
    res.json({ message: msg, cached: false });
  } catch (e) {
    res.json({ message: 'Welcome back. You have jobs to review today.', cached: false });
  }
});

module.exports = router;
