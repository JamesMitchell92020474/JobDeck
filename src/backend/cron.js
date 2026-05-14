const cron = require('node-cron');
const { runHousekeeping } = require('./services/housekeeping');
const { log } = require('./services/logger');

// Housekeeping at 2:00 AM NZST (14:00 UTC)
cron.schedule('0 14 * * *', () => {
  log({ type: 'housekeeping', trigger: 'AUTO', action: 'DAILY-HOUSEKEEPING-STARTED' });
  runHousekeeping('AUTO');
}, { timezone: 'UTC' });

// Mid-day housekeeping pass (every 3 hours)
cron.schedule('0 */3 * * *', () => {
  runHousekeeping('AUTO');
}, { timezone: 'UTC' });

console.log('[cron] Scheduled tasks registered: housekeeping 2:00 AM NZST');
