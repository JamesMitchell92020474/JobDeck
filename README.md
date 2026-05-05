# JobDeck

Personal job search dashboard — NZ-focused, AI-powered, runs as a desktop app.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Node.js + Express |
| Database | SQLite (node:sqlite — built into Node.js 22+) |
| Scraping | Playwright |
| DnD | dnd-kit |
| Editor | TipTap |
| PDF export | Puppeteer |
| Word export | docx |
| Scheduling | node-cron |
| Desktop | Electron |
| AI | Claude API (Anthropic) |

## Folder structure

```
C:\Users\James\Projects\JobDeck\
├── src\
│   ├── frontend\        React + Vite app
│   ├── backend\         Express API
│   └── electron\        Electron main process
├── assets\              App icon
├── dist\                Built frontend (generated)
├── dist-electron\       Packaged installer (generated)
├── .env                 Configuration (not committed)
└── package.json
```

Data lives on the D: drive (created automatically on first run):

```
D:\JobDeck\
├── data\
│   ├── jd-database.db
│   └── uploads\  (cv, cover-letters, attachments)
├── logs\
└── backups\
```

## Prerequisites

- Windows 10/11
- Node.js 22 or later (24 recommended — uses built-in `node:sqlite`)
- D: drive (or edit DATA_PATH in .env)

## Setup

```powershell
# 1. Install dependencies
cd C:\Users\James\Projects\JobDeck
npm install

# 2. Install Playwright browsers (for scraping)
npx playwright install chromium

# 3. Configure .env
# Add your ANTHROPIC_API_KEY
notepad .env

# 4. Run in development
npm run dev
```

## Environment variables (.env)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for all AI features |
| `DATA_PATH` | `D:\JobDeck\data` | SQLite DB and uploads |
| `LOG_PATH` | `D:\JobDeck\logs` | Activity and error logs |
| `BACKUP_PATH` | `D:\JobDeck\backups` | Backup zip files |
| `PORT` | `3001` | Backend API port |
| `LOW_DISK_WARNING_GB` | `2` | Disk space warning threshold |
| `ACCENT_COLOR` | `#423A8E` | Default accent colour |

## Development

```powershell
npm run dev          # Start backend + frontend + Electron
npm run dev:be       # Backend only
npm run dev:fe       # Vite frontend only
```

## Production build

```powershell
npm run build        # Build frontend + package Electron
```

Output goes to `dist-electron\`.

## First run

On first run the app will:
1. Create D:\JobDeck folder structure
2. Initialise the SQLite database
3. Set default settings
4. Register cron jobs (daily scrape 7am NZST, housekeeping 2am NZST)

## Scraping

LinkedIn can't be scraped — use manual import (paste job URL or description).

Before using scraping features:
```powershell
npx playwright install chromium
```

## AI features

All AI features require `ANTHROPIC_API_KEY` in .env. You can also enter it in Settings → AI.

- Welcome message: generated fresh each session
- Fit scoring + skills gap: on each job import  
- Cover letter generation: per-card, using your CV + template
- Per-card chat: job + CV context, claude-sonnet-4-20250514
- Global chat: full job list context, claude-sonnet-4-20250514
- Deep Analysis: claude-opus-4-20250514, manually triggered in Chat
