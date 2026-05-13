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

Key schema additions (beyond initial schema):
- `jobs.logo_url`, `jobs.job_category`, `jobs.description_summary` — added via migrations
- `job_chat.mode TEXT DEFAULT 'chat'` — separates regular chat from interview history
- `job_chat.answer_meta TEXT` — JSON metadata per interview answer (duration, wordCount, fillerWords)
- `global_chat.session_id` — links messages to a named session
- `global_chat_sessions (id, name, created_at)` — named chat sessions, max 20 kept
- `job_interview_runs (id, job_id, transcript, created_at)` — saved interview transcripts

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
| `cv_label_1` | Display name for the first CV profile (default: "CV Profile 1") |
| `cv_label_2` | Display name for the second CV profile (default: "CV Profile 2") |

## Design system

CSS variables defined in `src/frontend/styles/globals.css`.
Palette: deep indigo `#423A8E` accent, `#F5F4F8` bg (light), `#14132A` bg (dark).
Fonts: Fraunces (display) + Inter (body) + JetBrains Mono (data/labels).
Applied dynamically via JS in `AppContext.jsx` — accent, fonts, density, theme all
write to `document.documentElement` style/dataset.

Card styles: `.kc` + `[data-kc-style="edge|bordered|minimal"]` on `.kanban-shell`.

Theme is applied via `data-mode` attribute on `<html>` (NOT `data-theme`). Manual only — no auto-toggle.
Density via `data-density`. Both set in `AppContext.jsx`.

Sidebar and topbar use hardcoded `#2d4a63` (not the CSS variable) with white text — overrides are
scoped directly in `.sidebar` and `.topbar` rules rather than via the design token system.

Favicon: `src/frontend/favicon.svg` — indigo rounded square with white italic "JD" monogram.

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

## Fit score component

`src/frontend/components/ui/FitScore.jsx` exports:
- `Fit` — 44px SVG donut for kanban cards and dashboard listings
- `FitRing` — configurable SVG donut (default 72px) for detail Overview tab
- `Pill` — source/category badge

Both use a red→yellow→green colour gradient based on score value. The `Donut` helper
interpolates: 0–40 red→amber, 40–100 amber→green.

AI assessment (score + summary + skills gaps) is consolidated into a single box at the
top of the Overview tab. Not shown in the sidebar.

## AI models

- Standard: `claude-sonnet-4-20250514`
- Deep Analysis (user-triggered in global Chat): `claude-opus-4-20250514`
- All AI code: `src/backend/services/ai.js`

API key loaded from `ANTHROPIC_API_KEY` env var, falls back to `api_key` DB setting.

`scoreFit()` returns: `{ fit_score, summary, skills_gaps, deadline, description_summary }` — all extracted in one call. `description_summary` is a 1-2 sentence plain-text overview of the role, stored on the job and used in global chat context to reduce token usage. Saved to `jobs.description_summary` by all four score-save sites (ai-score route, fetch-description background, filter-new route, scraper).

`interviewChat(messages, job, cvText)` — mock interview mode for per-card chat. Claude plays a professional interviewer: opens with "tell me about yourself", asks 12–15 questions (behavioural/STAR, technical, situational), may ask 1 follow-up per answer, gives no mid-interview feedback, closes professionally, then delivers a written assessment covering strengths, areas to improve, and a communication style section (uses per-answer metadata: duration, word count, filler words). Uses separate message history (`mode = 'interview'` on `job_chat` rows). Transcripts saved to `job_interview_runs` table.

`generateWelcome(stats, displayName, weather)` — weather is fetched from Open-Meteo using coordinates derived from the `scraper_location` setting (lookup table for main NZ cities). No API key required. Falls back gracefully if fetch fails. Includes correct NZ Southern Hemisphere season. Strips any leading greeting from the AI response server-side.

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
| GET | /api/jobs/:id/chat-context | Returns `{ cvText }` for the job — fetched once by the frontend on card open |
| GET/POST | /api/jobs/:id/chat | Per-card Claude chat (`?mode=chat\|interview`; POST body includes `{ mode, cvText }`) |
| POST | /api/jobs/:id/cover-letter | Generate cover letter |
| POST | /api/jobs/:id/export-pdf | Export cover letter as PDF (Playwright-based, saves to uploads/cover-letters/) |
| POST | /api/jobs/:id/export-word | Export as .docx (saves to uploads/cover-letters/) |
| GET | /api/jobs/:id/files/:fileId/serve | Serve file inline or as download (`?download=1`) |
| POST/DELETE | /api/jobs/:id/files | File attachments |
| GET | /api/jobs/:id/interview-runs | List saved interview transcripts |
| GET | /api/jobs/:id/interview-runs/:runId | Full transcript for one run |
| POST | /api/jobs/:id/interview-runs/save | Save current interview transcript + clear live messages |
| DELETE | /api/jobs/:id/interview-runs/:runId | Delete a saved run |
| GET | /api/chat/sessions | List sessions newest-first, max 20, with message count |
| POST | /api/chat/sessions | Create new session (name auto-set from first message) |
| PATCH | /api/chat/sessions/:id | Rename session |
| DELETE | /api/chat/sessions/:id | Delete session + all its messages (CASCADE) |
| GET | /api/chat/context | Build and return job context string — fetched once by frontend per page load |
| GET | /api/chat | Messages for a session (`?session_id=N`) |
| POST | /api/chat | Send message (`{ content, session_id, context, deep_analysis }`) |
| POST | /api/cv/upload?profile=tech\|hospitality | Upload CV PDF |
| GET/PUT | /api/settings | Settings CRUD |
| POST | /api/scrape | Trigger Playwright scrape |
| POST | /api/housekeeping/run | Run housekeeping manually |
| POST | /api/housekeeping/cleanup-unmatched | Remove scraped jobs not matching keywords+location (`{ dryRun: bool }`) |
| GET | /api/news | Merged Hacker News (Algolia API) + Geekzone NZ headlines (30min cache, max 7 days old) |
| GET | /api/logs | Activity log viewer |
| POST | /api/export/backup | Create zip backup |
| GET/PUT | /api/export/cover-letter-template | Cover letter template |

## Chat features

### Global chat sessions
Named sessions stored in `global_chat_sessions` table. Max 20 kept (oldest removed when exceeded). Session name is auto-set from the first 60 chars of the user's opening message; can be renamed inline (click the heading). The "Chats" dropdown lists all sessions; "+" creates a new one. Old `DELETE /api/chat` endpoint is gone — delete via `DELETE /api/chat/sessions/:id`.

**Context caching**: on page load, the frontend fetches `GET /api/chat/context` once and stores it in React state (`jobContext`). Every subsequent message sends this stored string rather than triggering a DB query per message. The backend falls back to a fresh DB query if no context is provided.

**Prompt caching**: `globalChat()` in `ai.js` sends the system prompt (which includes the full job pipeline with `description_summary` per job) as an array block with `cache_control: { type: "ephemeral" }`. Anthropic caches it for 5 minutes — subsequent turns in the same session pay ~10% of normal input token cost for that block.

**Job context format**: up to 60 active jobs sorted by pipeline stage, each with title, company, location, status, category, fit score, deadline, and `description_summary` (or 300-char truncation of raw description as fallback).

### Per-card chat
Chat history is scoped by `mode` column on `job_chat`:
- `mode = 'chat'` — regular Q&A (default)
- `mode = 'interview'` — mock interview mode, separate history, uses `interviewChat()` system prompt

The frontend fetches `GET /api/jobs/:id/chat-context` once on card open and passes `cvText` with every POST, avoiding repeated settings lookups.

**Mock interview mode** — toggled via accent-coloured "Mock Interview" button in the chat tab header. 15 questions, no mid-interview feedback, professional closing, full written assessment at the end. Per-answer metadata tracked on the frontend (duration, word count, filler words via regex) and stored in `job_chat.answer_meta` (JSON). Backend prepends a formatted metadata header to each user message when building Claude's context. Auto-begins on first ever use; returns to an empty state after that so the user chooses when to start again. Completed interviews saved to `job_interview_runs` (transcript as plain text) via "Save Interview" button; past runs viewable/deletable in a collapsible panel.

### Voice mode (`src/frontend/hooks/useSpeech.js`)
Shared hook used by both `Chat.jsx` and `ChatTab.jsx`.

- **Voice mode toggle** — clicking the mic button once enters continuous voice mode (mic auto-restarts after every response). Clicking again exits.
- **Auto-restart logic**: a `useEffect([messages])` fires after each assistant message and restarts the mic 200ms later. If recognition times out naturally (no speech detected, `cancelRef` is still false), `onNaturalEnd` callback restarts immediately.
- **Interrupt TTS**: mic starts 200ms after response regardless of whether TTS is still playing. Speaking immediately calls `stopSpeaking()` to cancel TTS.
- **TTS text cleaning**: markdown stripped before synthesis (headings, bold, italic, code ticks, non-standard chars).
- `speak(text, onNaturalEnd?)` — `onNaturalEnd` fires only on natural `onend` (not when `stopListening()` was called).
- `startListening(onTranscript, onNaturalEnd?)` — `cancelRef` distinguishes user-cancelled from natural timeout.

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
3. Kicks off background Playwright fetch for any New jobs missing descriptions — scores and auto-archives them when done
4. Returns `{ archived, kept, scored, fetching }` — shown as an inline result note next to the button

A `descFetchInProgress` module-level flag prevents concurrent background fetches from stacking up.

## Job categories

Jobs are auto-tagged on creation (POST /api/jobs and scraper inserts) via `src/backend/services/autoTag.js`.

| Value | Label (configurable) | CV used for AI |
|-------|----------------------|----------------|
| `tech` | `cv_label_1` setting (default: "CV Profile 1") | `cv_text_tech` → `cv_text` |
| `hospitality` | `cv_label_2` setting (default: "CV Profile 2") | `cv_text_hospitality` → `cv_text` |
| `null` | General | `cv_text_tech` → `cv_text_hospitality` → `cv_text` |

Category labels are user-configurable via Settings — the internal DB values (`tech`/`hospitality`) are unchanged. Labels flow through to job card badges, board filter chips, category dropdown, and Add Job modal.
Category shown as label + dropdown selector in card detail aside.

## Dashboard

Layout (top to bottom):
1. **Welcome** — greeting + AI-generated welcome message (`GET /api/stats/welcome`)
2. **Quick actions** — Sync Sources · Filter with AI · Add Job (right-aligned)
3. **Stat strip** — compact single-row pipeline counts, clickable to board
4. **grid-3 (2:1)** — New listings (up to 8, sorted by fit score desc) | News feed
5. **grid-2** — Weekly activity chart | Sources donut
6. **Deadlines** — only rendered when jobs have deadlines set

New listings sorts by `fit_score DESC` (scored jobs first), then `created_at DESC` for unscored.
News feed auto-refreshes every 30 minutes via `setInterval`.
Dashboard content is centred (`margin: 0 auto`) and offset by half the sidebar width via
`transform: translateX(calc(var(--sidebar-w) / -2))` to appear centred on the full screen.

## Scraping

Playwright scrapers in `src/backend/services/scraper.js`.
Run `npx playwright install chromium` before using.
LinkedIn: manual add only (no scraping). Jora and Indeed removed — low NZ value/overlap.
Cron schedule: `src/backend/cron.js` — daily scrape 7:00 NZST, housekeeping 2:00 NZST.

Scraper reads `scraper_location`, `scraper_keywords_tech`, `scraper_keywords_hospitality`, `scraper_max_age_days` from settings to build search URLs. Seek uses `daterange` param for age filtering. Saves `last_sync_{source}` setting on completion.

Extracts per job from search results: title, company, location, url, job_type (normalised), posting_date.
Duplicate check: skips insert if same title + company + source already exists.
Scraped jobs default to status **New**. Manually added jobs default to **Interested**.

**Location filtering** — `saveJobsToDB` skips jobs whose location doesn't match the configured
`scraper_location`. Keywords per city defined in `LOCATION_KEYWORDS` map in `scraper.js`.
**Casual jobs are excluded** — `normaliseJobType() === 'Casual'` skips insert.

**Post-scrape description fetch** — after saving new jobs, `fetchDescriptionsForNewJobs(context, newJobs)`
runs in the background using the same browser session. Fetches description, awaits `scoreFit`, then
auto-archives poor fits (< 40). Browser closes when done. Logs `FETCH-DESC-START`, `FETCH-DESC-JOB [n/total]`,
`FETCH-DESC-DONE`, `FETCH-DESC-ERROR` for visibility.

### fetchDescription service

`src/backend/services/fetchDescription.js` — shared Playwright page evaluation logic used by both
the scraper and the on-demand `/:id/fetch-description` route. Exports `fetchDescriptionPage(context, url)`
and `normaliseJobType(raw)`.

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

### Board filtering and sorting

Filter chips above the kanban (all frontend-only, no DB queries):
- **Source** chips — derived from actual job data (not settings keys)
- **Category** chips — All / Tech / Hospitality / General
- **Job type** chips — All / Full time / Part time / Contract/Temp / Casual / Internship (only shows types present in current jobs)

Sort dropdown: Title / Company / Date added / Date posted / Deadline / Score, with asc/desc toggle.
Nulls always sort to the bottom regardless of direction.

### Job type normalisation

`normaliseJobType()` in `fetchDescription.js` (shared) maps Seek's inconsistent labels to:
`Full time`, `Part time`, `Contract/Temp`, `Casual`, `Internship`.

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
