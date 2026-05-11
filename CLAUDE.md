# JobDeck — Claude Code Context

Personal job search dashboard for James Mitchell. NZ context (Seek, Trade Me Jobs).
Tracks both tech/IT roles and hospitality/retail roles with separate CV profiles per category.

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
npm run dev          # starts backend (nodemon) + Vite + Electron concurrently
```

Or separately:
```powershell
npm run dev:be       # backend on :3001 (auto-restarts via nodemon on file changes)
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

Migrations run in `database.js` via `try { db.exec('ALTER TABLE...') } catch {}` — add new columns there.

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
| `source_colors` | JSON object, one hex per source |
| `disabled_sources` | JSON object, source → bool |
| `cv_text` | legacy single CV (fallback if profile CVs not uploaded) |
| `cv_text_tech` | extracted text from Tech / IT CV PDF |
| `cv_text_hospitality` | extracted text from Hospitality / Retail CV PDF |
| `cv_filename_tech` | filename for tech CV |
| `cv_filename_hospitality` | filename for hospitality CV |
| `api_key` | Anthropic API key (falls back to .env) |
| `scraper_location` | City/region for scraper searches (default: Christchurch) |
| `scraper_keywords_tech` | Comma-separated keywords for tech searches |
| `scraper_keywords_hospitality` | Comma-separated keywords for hospitality searches |
| `scraper_max_age_days` | Only pull jobs posted within this many days (default: 30) |
| `last_sync_{source}` | ISO timestamp of last successful sync per source |

## Design system

CSS variables defined in `src/frontend/styles/globals.css`.
Palette: deep indigo `#423A8E` accent, `#F5F4F8` bg (light), `#14132A` bg (dark).
Fonts: Fraunces (display) + Inter (body) + JetBrains Mono (data/labels).
Applied dynamically via JS in `AppContext.jsx` — accent, fonts, density, theme all
write to `document.documentElement` style/dataset.

Card styles: `.kc` + `[data-kc-style="edge|bordered|minimal"]` on `.kanban-shell`.

Theme is applied via `data-mode` attribute on `<html>` (NOT `data-theme`). Manual only — no auto-toggle.
Density via `data-density`. Both set in `AppContext.jsx`.

Column colours (CSS vars):
- `--col-new`         #6B7FD4 (soft periwinkle)
- `--col-interested`  #FFC107 (yellow)
- `--col-applied`     #0D6EFD (blue)
- `--col-interview`   #DC3545 (red)
- `--col-offer`       #198754 (green)
- `--col-archived`    #8C7860 (warm brown)
- `--col-rejected`    #6E6B85 (muted purple)

Default source colours (stored as JSON in `source_colors` setting):
- Seek `#FFC107` · Trade Me Jobs `#DC3545`

## AI models

- Standard: `claude-sonnet-4-20250514`
- Deep Analysis (user-triggered in global Chat): `claude-opus-4-20250514`
- All AI code: `src/backend/services/ai.js`

API key loaded from `ANTHROPIC_API_KEY` env var, falls back to `api_key` DB setting.

`scoreFit()` returns: `{ fit_score, summary, skills_gaps, deadline }` — deadline extracted from job description text in the same call, saved only if job doesn't already have one.

## Frontend routing

No React Router — uses simple string state in `App.jsx`:
```
route: 'dash' | 'board' | 'detail' | 'chat' | 'settings'
```
`detailJobId` holds the current job ID when `route === 'detail'`.

Sidebar labels: "Home" (dash) · "Job Board" (board) · "Chat" · "Settings"

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/stats | Dashboard counts, activity (NZ timezone), sources |
| GET | /api/stats/welcome | AI-generated welcome message |
| GET/POST | /api/jobs | List / create jobs |
| POST | /api/jobs/filter-new | Score unscored New jobs and archive poor fits (threshold: fit_score < 40) |
| GET/PUT/DELETE | /api/jobs/:id | Single job CRUD |
| PUT | /api/jobs/:id/move | Move to kanban column |
| POST | /api/jobs/:id/ai-score | Score job against CV |
| POST | /api/jobs/:id/fetch-description | Scrape description, logo, posting_date, job_type, salary from source_url; auto-scores in background |
| GET/POST | /api/jobs/:id/chat | Per-card Claude chat |
| POST | /api/jobs/:id/cover-letter | Generate cover letter |
| POST | /api/jobs/:id/export-pdf | Export cover letter as PDF (Playwright-based, saves to uploads/cover-letters/) |
| POST | /api/jobs/:id/export-word | Export as .docx (saves to uploads/cover-letters/) |
| GET | /api/jobs/:id/files/:fileId/serve | Serve file inline or as download (`?download=1`) |
| POST/DELETE | /api/jobs/:id/files | File attachments |
| GET/POST/DELETE | /api/chat | Global Claude chat |
| POST | /api/cv/upload?profile=tech\|hospitality | Upload CV PDF |
| GET/PUT | /api/settings | Settings CRUD |
| POST | /api/scrape | Trigger Playwright scrape |
| POST | /api/housekeeping/run | Run housekeeping manually |
| POST | /api/housekeeping/cleanup-unmatched | Remove scraped jobs not matching keywords+location (`{ dryRun: bool }`) |
| GET | /api/news | Merged Hacker News (Algolia API) + Geekzone NZ headlines (30min cache, max 7 days old) |
| GET | /api/logs | Activity log viewer |
| POST | /api/export/backup | Create zip backup |
| GET/PUT | /api/export/cover-letter-template | Cover letter template |

## Kanban columns

Order: New → Interested → Applied → Interview → Offer → Rejected → Archived

- **New** — scraper landing column. All scraped jobs arrive here for triage.
- **Interested** — jobs the user has chosen to pursue. Manually added jobs default here.
- **Archived** — aged out (30d), expired, manually dismissed, or AI-filtered (poor fit). Housekeeping moves jobs here automatically.
- **Rejected** — applied and didn't get it (user-initiated only).
- Housekeeping soft-deletes jobs in either Archived or Rejected after 90 days.

### AI filter

"Filter with AI" button appears in both the kanban toolbar and the dashboard quick-actions row. Calls `POST /api/jobs/filter-new`:
1. Scores any unscored New jobs that have a fetched description
2. Archives all New jobs with `fit_score < 40`
3. Returns `{ archived, kept, scored }` — shown as an inline result note next to the button

## Job categories

Jobs are auto-tagged on creation (POST /api/jobs and scraper inserts) via `src/backend/services/autoTag.js`.

| Value | Label | CV used for AI |
|-------|-------|----------------|
| `tech` | Tech | `cv_text_tech` → `cv_text` |
| `hospitality` | Hospitality | `cv_text_hospitality` → `cv_text` |
| `null` | General | `cv_text_tech` → `cv_text_hospitality` → `cv_text` |

Category shown as label + dropdown selector in card detail aside.
Board has category filter chips: All / Tech / Hospitality / General.

## Dashboard

Layout (top to bottom):
1. **Welcome** — greeting + AI-generated welcome message (`GET /api/stats/welcome`)
2. **Stat strip** — compact single-row pipeline counts, clickable to board
3. **Quick actions** — Sync Sources · Filter with AI · Add Job (right-aligned)
4. **grid-3 (2:1)** — New listings (up to 8, sorted by fit score desc) | News feed
5. **grid-2** — Weekly activity chart | Sources donut
6. **Deadlines** — only rendered when jobs have deadlines set

New listings sorts by `fit_score DESC` (scored jobs first), then `created_at DESC` for unscored.
News feed auto-refreshes every 30 minutes via `setInterval`.

## Scraping

Playwright scrapers in `src/backend/services/scraper.js`.
Run `npx playwright install chromium` before using.
LinkedIn: manual add only (no scraping). Jora and Indeed removed — low NZ value/overlap.
Cron schedule: `src/backend/cron.js` — daily scrape 7:00 NZST, housekeeping 2:00 NZST.

Scraper reads `scraper_location`, `scraper_keywords_tech`, `scraper_keywords_hospitality`, `scraper_max_age_days` from settings to build search URLs. Seek uses `daterange` param for age filtering. Saves `last_sync_{source}` setting on completion.

Extracts per job from search results: title, company, location, url, job_type (normalised), posting_date.
Duplicate check: skips insert if same title + company + source already exists.
Scraped jobs default to status **New**. Manually added jobs default to **Interested**.

### fetch-description (on-demand, per job)

`POST /api/jobs/:id/fetch-description` — launches Playwright, visits `source_url`, extracts:
- Description HTML (cleaned: keeps p/ul/ol/li/strong/em/h1-h4/a; block elements converted to `<p>` before stripping)
- Company logo URL (scoped to job header element to avoid picking up featured job logos)
- Posting date (prefers `datetime` attribute on `<time>` elements; converts "Xd ago" to real date)
- Job type (normalised via `normaliseJobType()`)
- Salary (only stored if value contains a dollar figure or salary range; benefits text discarded)

Files deleted outside the app (via File Explorer) are automatically cleaned from DB when the job is next loaded.

Uses `waitUntil: 'load'` + 1.5s settle delay (not networkidle — too slow on Seek).
After saving, auto-scores in background via `scoreFit()` (non-blocking).

Description is stored as cleaned HTML and rendered with `dangerouslySetInnerHTML`. Plain-text fallback (pre-wrap) for jobs fetched before HTML support.

### Board filtering

Filter chips above the kanban (all frontend-only, no DB queries):
- **Source** chips — one per source in use
- **Category** chips — All / Tech / Hospitality / General
- **Job type** chips — All / Full time / Part time / Contract/Temp / Casual / Internship (only shows types present in current jobs)

Board sorts by `created_at DESC` within each column.

### Job type normalisation

`normaliseJobType()` in both `scraper.js` and `jobs.js` maps Seek's inconsistent labels to standard values: `Full time`, `Part time`, `Contract/Temp`, `Casual`, `Internship`.

## Known issues

### Electron V8 snapshot (ESET antivirus)
`require('electron').app` returns `undefined` in the main process because ESET blocks
Electron's V8 context snapshot from loading.

**Fix:** Add Electron dist folder to ESET exclusions:
`C:\Users\James\Projects\JobDeck\node_modules\electron\dist\`

In ESET: Advanced Setup → Protections → Real-time file system protection → Exclusions
(use "Paths" exclusion type, NOT "Extensions").

The app is fully functional at http://localhost:5173 without Electron.

### Playwright / ESET
ESET may also block Playwright's Chromium. Add to exclusions:
`C:\Users\james\AppData\Local\ms-playwright\`

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

- James Mitchell · hello@jamesmitchell.co.nz · Christchurch, NZ
- Graphic design + frontend dev background — UI quality matters
- NZ context: Xero, Sharesies, Hnry, Auror, Tracksuit, Cin7 are realistic companies
- Sources: Seek, Trade Me Jobs (scraped) · LinkedIn (manual add only, not scraped)
- Default fonts: Cambria (display) + Inter (body)
