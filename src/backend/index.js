require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), override: true });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { runStartup } = require('./startup');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const dataPath = process.env.DATA_PATH || path.join(require('os').homedir(), 'JobDeck', 'data');
app.use('/uploads', express.static(path.join(dataPath, 'uploads')));

// Setup route — must be before other routes, requires no DB
app.use('/api/setup', require('./routes/setup').router);

// Routes
app.use('/api/jobs',         require('./routes/jobs'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/cv',           require('./routes/cv'));
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/logs',         require('./routes/logs'));
app.use('/api/scrape',       require('./routes/scrape'));
app.use('/api/housekeeping', require('./routes/housekeeping'));
app.use('/api/export',       require('./routes/export'));
app.use('/api/stats',        require('./routes/stats'));
app.use('/api/news',         require('./routes/news'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Serve the built frontend (dist/ folder created by `npm run build:fe`).
// In dev mode Vite handles this itself, so this block only activates when
// the dist folder actually exists (i.e. after a production build).
const distPath = path.join(__dirname, '../../dist');
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath));
  // Catch-all: for any URL that isn't an /api route, return index.html.
  // This lets React Router handle client-side navigation (e.g. refreshing
  // a page doesn't result in a 404 from Express).
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// Run startup (folders, cron)
try { runStartup(); } catch (e) { console.error('[startup] Error:', e.message); }

// Initialise DB eagerly
try { getDb(); } catch (e) { console.error('[db] Init error:', e.message); }

const server = app.listen(PORT, () => {
  console.log(`[backend] JobDeck API running on http://localhost:${PORT}`);
});

module.exports = { app, server };
