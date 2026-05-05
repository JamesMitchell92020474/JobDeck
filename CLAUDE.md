# JobDeck — Claude Code Context

Personal job search dashboard for James Mitchell. NZ context (Seek, Trade Me Jobs, Jora, Indeed, LinkedIn).

## GitHub

https://github.com/JamesMitchell92020474/JobDeck (private)

## Architecture

```
src/
  frontend/    React 18 + Vite (port 5173 in dev)
  backend/     Express + node:sqlite (port 3001)
  electron/    Electron desktop wrapper
```

Data lives on D: drive — created automatically on first run:
- `D:\JobDeck\data\jd-database.db` — SQLite database
- `D:\JobDeck\data\uploads\` — CV, cover letters, attachments
- `D:\JobDeck\logs\` — rotating monthly log files
- `D:\JobDeck\backups\` — zip backups

## Running in dev

```powershell
cd C:\Users\James\Projects\JobDeck
npm run dev          # starts backend + Vite + Electron concurrently
```

Or separately:
```powershell
npm run dev:be       # backend on :3001
npm run dev:fe       # Vite on :5173
```

The app works fully in browser at http://localhost:5173. Electron has a known issue
on this machine (ESET antivirus blocks V8 context snapshot loading — see below).

## Vite config note

`vite.config.js` sets `root: 'src/frontend'` — Vite serves from that directory.
`index.html` and `main.jsx` live at `src/frontend/`, not the project root.
The proxy `/api → http://localhost:3001` is configured in vite.config.js.

## Database

Uses Node.js 24 built-in `node:sqlite` (no native compilation). NOT `better-sqlite3`.
DB path: `D:\JobDeck\data\jd-database.db`
Schema: `src/backend/db/schema.js`
Connection: `src/backend/db/database.js`

All settings are key-value pairs in the `settings` table.

**Transaction pattern** — `node:sqlite` has no `db.transaction()` wrapper. Use explicit:
```js
db.exec('BEGIN');
try { /* statements */ db.exec('COMMIT'); }
catch (e) { db.exec('ROLLBACK'); }
```

## Key settings keys

| Key | Description |
|-----|-------------|
| `theme` | light / dark |
| `accent_color` | hex, default `#423A8E` |
| `display_font` | default Cambria |
| `body_font` | default Inter |
| `card_style` | minimal / bordered / edge |
| `density` | compact / balanced / spacious |
| `source_colors` | JSON object, one hex per source |
| `cv_text` | extracted text from uploaded CV PDF |
| `api_key` | Anthropic API key (falls back to .env) |

## Design system

CSS variables defined in `src/frontend/styles/globals.css`.
Palette: deep indigo `#423A8E` accent, `#F5F4F8` bg (light), `#14132A` bg (dark).
Fonts: Fraunces (display) + Inter (body) + JetBrains Mono (data/labels).
Applied dynamically via JS in `AppContext.jsx` — accent, fonts, density, theme all
write to `document.documentElement` style/dataset.

Card styles: `.kc` + `[data-kc-style="edge|bordered|minimal"]` on `.kanban-shell`.

Theme is applied via `data-mode` attribute on `<html>` (NOT `data-theme`).
Density via `data-density`. Both set in `AppContext.jsx`.

Column colours (CSS vars):
- `--col-shortlisted` #FFC107 (yellow)
- `--col-applied`     #0D6EFD (blue)
- `--col-interview`   #DC3545 (red / overridden by accent in some builds)
- `--col-offer`       #198754 (green)
- `--col-rejected`    #6E6B85 (muted)

Default source colours (stored as JSON in `source_colors` setting):
- Seek `#3D5A80` · LinkedIn `#2867B2` · Trade Me Jobs `#2E7D5B` · Jora `#A8743A` · Indeed `#5C4A8A`

## AI models

- Standard: `claude-sonnet-4-20250514`
- Deep Analysis (user-triggered in global Chat): `claude-opus-4-20250514`
- All AI code: `src/backend/services/ai.js`

API key loaded from `ANTHROPIC_API_KEY` env var, falls back to `api_key` DB setting.

## Frontend routing

No React Router — uses simple string state in `App.jsx`:
```
route: 'dash' | 'board' | 'detail' | 'chat' | 'settings'
```
`detailJobId` holds the current job ID when `route === 'detail'`.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/stats | Dashboard counts, activity, sources |
| GET | /api/stats/welcome | AI-generated welcome message |
| GET/POST | /api/jobs | List / create jobs |
| GET/PUT/DELETE | /api/jobs/:id | Single job CRUD |
| PUT | /api/jobs/:id/move | Move to kanban column |
| POST | /api/jobs/:id/ai-score | Score job against CV |
| GET/POST | /api/jobs/:id/chat | Per-card Claude chat |
| POST | /api/jobs/:id/cover-letter | Generate cover letter |
| POST | /api/jobs/:id/export-pdf | Export cover letter as PDF |
| POST | /api/jobs/:id/export-word | Export as .docx |
| POST/DELETE | /api/jobs/:id/files | File attachments |
| GET/POST/DELETE | /api/chat | Global Claude chat |
| POST | /api/cv/upload | Upload CV PDF |
| GET/PUT | /api/settings | Settings CRUD |
| POST | /api/scrape | Trigger Playwright scrape |
| POST | /api/housekeeping/run | Run housekeeping manually |
| GET | /api/logs | Activity log viewer |
| POST | /api/export/backup | Create zip backup |
| GET/PUT | /api/export/cover-letter-template | Cover letter template |

## Scraping

Playwright scrapers in `src/backend/services/scraper.js`.
Run `npx playwright install chromium` before using.
LinkedIn: manual import only (no scraping).
Cron schedule: `src/backend/cron.js` — daily scrape 7:00 NZST, housekeeping 2:00 NZST.

## Known issues

### Electron V8 snapshot (ESET antivirus)
`require('electron').app` returns `undefined` in the main process because ESET blocks
Electron's V8 context snapshot from loading. The snapshot (`v8_context_snapshot.bin`)
is what registers Electron's JS API on top of Node.js.

**Fix:** Add Electron dist folder to ESET exclusions OR pause ESET temporarily:
`C:\Users\James\Projects\JobDeck\node_modules\electron\dist\`

In ESET: Advanced Setup → Protections → Real-time file system protection → Exclusions
(look for the "Paths" exclusion type, NOT the "Extensions" type).

The app is fully functional at http://localhost:5173 without Electron.

### node:sqlite experimental warning
`node --no-warnings` suppresses it. It's stable in Node.js 24 despite the label.

## Env vars (.env)

```
ANTHROPIC_API_KEY=      # required for AI features
DATA_PATH=D:\JobDeck\data
LOG_PATH=D:\JobDeck\logs
BACKUP_PATH=D:\JobDeck\backups
PORT=3001
NODE_ENV=development
LOW_DISK_WARNING_GB=2
ACCENT_COLOR=#423A8E
```

## User preferences

- James has graphic design + frontend dev background — UI quality matters
- NZ context: Xero, Sharesies, Hnry, Auror, Tracksuit, Cin7 are realistic companies
- Sources: Seek, Trade Me Jobs, LinkedIn (manual only), Jora, Indeed
- Display name: James Mitchell · james@mitchell.nz
- Default fonts: Cambria (display) + Inter (body)
