# JobDeck

Personal job search dashboard for the NZ market. Scrapes Seek and Trade Me Jobs, scores listings against your CV using Claude AI, and tracks applications through a kanban pipeline.

## Features

- **Kanban board** — New → Interested → Applied → Interview → Offer → Rejected → Archived
- **AI scoring** — each job scored against your CV (0–100 fit score) with summary and skills gaps
- **Auto-filter** — one click scores all new listings and archives poor fits (< 40)
- **Scraper** — daily Playwright scrape of Seek and Trade Me Jobs; filters by location, skips casual roles
- **Description fetch** — visits each job URL to extract full description, salary, job type, posting date; auto-scores on completion
- **Cover letter generation** — AI-generated cover letters, exportable as PDF or Word
- **Per-job chat** — Claude chat with full job + CV context
- **News feed** — Hacker News + Geekzone NZ headlines
- **Weather** — current Christchurch conditions via Open-Meteo (no API key required)
- **Dark mode** — manual toggle

## Stack

```
src/
  frontend/    React 18 + Vite (port 5173)
  backend/     Express + node:sqlite (port 3001)
  electron/    Desktop wrapper (optional)
```

- **Database**: Node.js 24 built-in `node:sqlite` — no native compilation needed
- **AI**: Anthropic Claude (Sonnet for scoring/chat, Opus for deep analysis)
- **Scraping**: Playwright (Chromium)
- **Data**: `D:\JobDeck\data\` (configurable via `DATA_PATH` env var)

## Setup

```powershell
npm install
npx playwright install chromium
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:5173

## Environment variables

```
ANTHROPIC_API_KEY=      # required for AI features
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
