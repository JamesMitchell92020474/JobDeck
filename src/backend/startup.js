const fs = require('fs');
const path = require('path');
const os = require('os');

function createDataFolders() {
  const home = os.homedir();
  const dataPath = process.env.DATA_PATH || path.join(home, 'JobDeck', 'data');
  const paths = [
    dataPath,
    path.join(dataPath, 'uploads', 'cv'),
    path.join(dataPath, 'uploads', 'cover-letters'),
    path.join(dataPath, 'uploads', 'attachments'),
    process.env.LOG_PATH    || path.join(home, 'JobDeck', 'logs'),
    process.env.BACKUP_PATH || path.join(home, 'JobDeck', 'backups'),
  ];

  for (const p of paths) {
    try {
      fs.mkdirSync(p, { recursive: true });
    } catch (e) {
      console.warn(`[startup] Could not create ${p}:`, e.message);
    }
  }
  console.log('[startup] Data folders ready');
}

function checkDiskSpace() {
  try {
    const warnGB = parseFloat(process.env.LOW_DISK_WARNING_GB || '2');
    // On Windows, check C: drive free space via statvfs (not available natively)
    // Using a cross-platform approach via the os module
    // This is a best-effort check; proper disk stats require native addons
    console.log('[startup] Disk space check skipped (requires native addon on Windows)');
  } catch {}
}

function runStartup() {
  console.log('[startup] JobDeck starting up…');
  createDataFolders();
  checkDiskSpace();
  require('./cron');
  console.log('[startup] Startup complete');
}

function maybeStartupSync() {
  const { getSetting } = require('./db/database');
  const { log } = require('./services/logger');
  if (getSetting('sync_on_startup') !== '1') return;
  console.log('[startup] Sync on startup enabled — running scrape in background');
  log({ type: 'scraper', trigger: 'AUTO', action: 'STARTUP-SCRAPE-STARTED' });
  require('./services/scraper').runScrape().catch(() => {});
}

module.exports = { runStartup, maybeStartupSync };
