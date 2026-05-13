# JobDeck

AI-powered job search dashboard. Scrapes Seek and Trade Me Jobs, scores listings against your CV using Claude, tracks applications through a kanban pipeline, and helps you prepare for interviews.

## Features

**Pipeline management**
- Kanban board — New → Interested → Applied → Interview → Offer → Rejected → Archived
- AI fit scoring (0–100) against your CV with summary and skills gaps
- One-click AI filter — scores all new listings, archives poor fits (< 40)
- Playwright scraper for Seek and Trade Me Jobs (daily cron + manual trigger)
- Full description fetch per job — extracts salary, job type, and posting date

**AI chat**
- Global chat with named session history (max 20 sessions, auto-named from first message)
- Per-job chat with full job description + CV context
- Voice mode — mic auto-restarts after each response; speak to interrupt TTS
- Mock interview mode — 15 realistic questions, professional closing, written assessment with communication style analysis (tracks answer time, word count, filler words); save transcripts to compare across sessions

**Documents**
- AI cover letter generation with custom template
- Export as PDF or Word
- Multiple CV profiles with configurable labels (e.g. "Tech / IT" and "Hospitality / Retail", or any two categories that suit you)

**Other**
- Dashboard with welcome message, pipeline stats, news feed, and weather
- Activity logs, zip backups, dark mode, accent colour customisation
- All personal details (name, email, CV profile labels, location) configured via Settings — no hardcoding

## Stack

```
src/
  frontend/    React 18 + Vite (port 5173)
  backend/     Express + node:sqlite (port 3001)
  electron/    Desktop wrapper (optional)
```

- **Database**: Node.js 24 built-in `node:sqlite` — no native compilation
- **AI**: Anthropic Claude (Sonnet for scoring/chat, Opus for deep analysis)
- **Scraping**: Playwright (Chromium)
- **Data**: configurable via `DATA_PATH` env var (default `D:\JobDeck\data`)

## Setup

```powershell
npm install
npx playwright install chromium
cp .env.example .env   # fill in ANTHROPIC_API_KEY and adjust paths
npm run dev
```

Open **http://localhost:5173**

Then go to **Settings** to fill in your name, email, location, CV profiles, and scraper keywords.

## Environment variables

See `.env.example` for the full list. Required:

```
ANTHROPIC_API_KEY=      # get one at console.anthropic.com
```

Optional (shown with defaults):

```
DATA_PATH=D:\JobDeck\data
LOG_PATH=D:\JobDeck\logs
BACKUP_PATH=D:\JobDeck\backups
PORT=3001
NODE_ENV=development
```

## Known issues

**ESET antivirus** blocks Playwright's Chromium and Electron's V8 snapshot. Add to ESET exclusions:
- `C:\Users\<you>\AppData\Local\ms-playwright\`
- `C:\Users\<you>\Projects\JobDeck\node_modules\electron\dist\`

The app is fully functional in-browser without Electron.
