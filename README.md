# JobDeck

A personal job search dashboard for the NZ market. Scrapes Seek, Trade Me Jobs, Jora and Indeed daily, scores listings against your CV using Claude, and tracks applications through a kanban board.

## Features

- **Kanban board** — Shortlisted → Applied → Interview → Offer → Rejected → Archived, with drag-and-drop
- **Automated scraping** — Seek, Trade Me Jobs, Jora, Indeed scraped daily at 7:00 NZST using your keywords, location and max job age
- **Board filters** — Filter by source, category (Tech/Hospitality/General) and job type (Full time/Part time/Contract/Temp etc.)
- **AI fit scoring** — Each job scored 0–100 against your CV via Claude, with match summary, skills gaps, and deadline extraction
- **Rich job descriptions** — Fetched on demand from the source listing; rendered as formatted HTML with company logo, salary, posting date and job type
- **Dual CV profiles** — Separate CVs for Tech/IT and Hospitality/Retail; AI uses the right one automatically
- **Cover letter generation** — Claude writes a tailored cover letter; export as PDF or Word directly to the Files tab
- **File preview** — PDFs preview inline in the Files tab; all files downloadable
- **Dashboard** — Weekly listings vs applications line chart, pipeline counts, source breakdown, upcoming deadlines
- **Manual job entry** — Add jobs from any source via the quick-add form on the board

## Prerequisites

- [Node.js 24+](https://nodejs.org/)
- [Playwright Chromium](https://playwright.dev/) — `npx playwright install chromium`
- An [Anthropic API key](https://console.anthropic.com/) for AI features
- A D: drive (or update `DATA_PATH` in `.env`)

## Setup

**1. Clone and install**
```powershell
git clone https://github.com/JamesMitchell92020474/JobDeck.git
cd JobDeck
npm install
npx playwright install chromium
```

**2. Create `.env`**
```
ANTHROPIC_API_KEY=sk-ant-...
DATA_PATH=D:\JobDeck\data
LOG_PATH=D:\JobDeck\logs
BACKUP_PATH=D:\JobDeck\backups
PORT=3001
NODE_ENV=development
LOW_DISK_WARNING_GB=2
ACCENT_COLOR=#423A8E
```

**3. Run in dev**
```powershell
npm run dev
```

Opens at **http://localhost:5173**. The backend auto-restarts on file changes via nodemon.

**4. Upload your CVs**

Go to Settings → Profile & CV and upload PDFs for your Tech and Hospitality profiles. These are used for AI scoring and cover letter generation.

**5. Configure scraper**

Go to Settings → Scraper preferences and set your location, keywords, and max job age. Then hit **Sync all sources** to pull your first batch of listings.

## Data

All data is stored locally:

| Path | Contents |
|------|----------|
| `D:\JobDeck\data\jd-database.db` | SQLite database (jobs, settings, chat history) |
| `D:\JobDeck\data\uploads\` | CV PDFs, cover letters, attachments |
| `D:\JobDeck\logs\` | Monthly rotating log files |
| `D:\JobDeck\backups\` | Zip backups (Settings → Export backup) |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Backend | Express + Node.js 24 |
| Database | node:sqlite (built-in, no native compilation) |
| Scraping | Playwright (Chromium) |
| AI | Anthropic Claude (Sonnet for scoring/chat, Opus for deep analysis) |
| Desktop | Electron (optional — see known issues) |

## Known issues

### ESET antivirus blocking Electron
ESET blocks Electron's V8 context snapshot. The app works fully in the browser at http://localhost:5173 without Electron. To fix, add these paths to ESET exclusions (Advanced Setup → Protections → Real-time file system protection → Exclusions → Paths):

```
C:\Users\<you>\Projects\JobDeck\node_modules\electron\dist\
C:\Users\<you>\AppData\Local\ms-playwright\
```

### node:sqlite experimental warning
Suppressed with `node --no-warnings`. The module is stable in Node.js 24 despite the label.
