const cron = require('node-cron');
const { runScrape } = require('./services/scraper');
const { runHousekeeping } = require('./services/housekeeping');
const { log } = require('./services/logger');

// Daily scrape at 7:00 NZST (UTC+12, so 19:00 UTC previous day)
cron.schedule('0 19 * * *', async () => {
  log({ type: 'scraper', trigger: 'AUTO', action: 'DAILY-SCRAPE-STARTED' });
  await runScrape();
}, { timezone: 'UTC' });

// Housekeeping at 2:00 AM NZST (14:00 UTC)
cron.schedule('0 14 * * *', () => {
  log({ type: 'housekeeping', trigger: 'AUTO', action: 'DAILY-HOUSEKEEPING-STARTED' });
  runHousekeeping('AUTO');
}, { timezone: 'UTC' });

// Mid-day housekeeping pass (every 3 hours)
cron.schedule('0 */3 * * *', () => {
  runHousekeeping('AUTO');
}, { timezone: 'UTC' });

console.log('[cron] Scheduled tasks registered: daily scrape 7:00 NZST, housekeeping 2:00 AM NZST');
