# JobDeck

AI-powered job search dashboard. Scrapes Seek and Trade Me Jobs, scores listings against your CV using Claude AI, tracks applications through a kanban pipeline, and helps you prepare for interviews.

---

## Features

**Pipeline**
- Kanban board — New → Interested → Applied → Interview → Offer → Rejected → Archived
- AI fit scoring (0–100) against your CV with second-person summary and skills gaps
- One-click AI filter — scores all unscored active jobs, archives poor fits from the New column (configurable threshold)
- Playwright scraper for Seek and Trade Me Jobs (manual sync or optional startup auto-sync)
- Full description fetch per job — extracts salary, job type, and posting date
- Exclude keywords per CV profile — jobs matching excluded terms in title or description are silently skipped

**AI chat**
- Global chat with named session history — discuss your whole job search with Claude
- Per-job chat — Claude has the job description and your CV as context
- Voice mode — hands-free conversation; mic restarts automatically after each response
- Mock interview — voice and TTS auto-enable on entry; 15 realistic questions with 2.5 second pause before sending to allow thinking time; written assessment at the end; save, restart, and compare transcripts across sessions

**Cover letters**
- Full page editor — A4 or Letter canvas with drop-shadow print preview so you see exactly what will export
- Per-job page settings — all four margins, font family (picks up your installed system fonts), font size, line height, and paragraph spacing
- Text colour picker and inline font styling on selected text
- Dual letterhead profiles — one for Tech/IT, one for Hospitality/Retail, each with its own logo, name, styled contact details, and separator line. Set them up once; they auto-load based on the job category with a one-click switcher to override
- AI cover letter generation from your CV and the job description
- Export as PDF (exact page layout via Playwright) or Word (.docx with formatting preserved)
- Two CV profiles with configurable labels (e.g. "Tech / IT" and "Retail / Hospitality")

**Other**
- Dashboard with cached welcome message (regenerates on pipeline changes or time-of-day shift), stats, news feed, and weather
- Per-job activity log — tracks status changes, AI scoring, cover letters, file attachments
- Activity logs, zip backups, dark mode, accent colour customisation
- All personal details configured via the setup wizard and Settings — no hardcoding in the code

---

## Requirements

- **Linux** (Linux Mint / Ubuntu recommended)
- **Node.js 24 or later** — install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or from [nodejs.org](https://nodejs.org)
  *(the app uses Node's built-in SQLite module which requires v24+)*
- **An Anthropic API key** — get one free at [console.anthropic.com](https://console.anthropic.com)
  *(you pay per use; typical job search usage costs a few cents a month)*

---

## Installation

### Step 1 — Get the code

**Option A — Git (recommended, makes updates easy):**
```
git clone https://github.com/JamesMitchell92020474/JobDeck.git
```

**Option B — Download ZIP:**
Go to the GitHub repo → click the green **Code** button → **Download ZIP** → extract it somewhere on your PC.

---

### Step 2 — First run

Open a terminal in the project folder and run:
```bash
bash jobdeck.sh
```

On first run the script will automatically:
1. Check your Node.js version
2. Install all packages (`npm install`)
3. Download the scraper browser (Playwright Chromium, ~150 MB — once only)
4. Build the app
5. Open the app in your browser

---

### Step 3 — Setup wizard

The first time the app opens, a setup wizard will guide you through:

- **Storage paths** — where to store data, backups, and logs (defaults to `~/JobDeck/...`)
- **Your name** — used in the dashboard greeting and AI prompts
- **Location** — your city, used for job searches and weather
- **API key** — your Anthropic API key for all AI features
- **Desktop shortcut** — optionally adds a JobDeck icon to your desktop

Click **Finish setup** and the app restarts automatically. You're ready to go.

---

### Step 4 — Configure Settings

Go to **Settings** and complete the following before syncing for the first time:

**Profile & CV** (Settings → Profile & CV)
- Name your CV profile to match your job search type (e.g. "Tech / IT") — a second CV and profile is optional if you want to search across more than one industry (e.g. "Retail / Hospitality")
- Upload a PDF CV for each profile you set up — JobDeck uses these to score job listings against your experience

**Search keywords** (Settings → Scraper preferences)

Keywords are what JobDeck uses to search Seek and Trade Me Jobs — only listings that match at least one of your keywords will be scraped. Without keywords, the Sync button is disabled.

- Add keywords for each CV profile as comma-separated terms (e.g. `front end developer, React, IT support`)
- Be specific enough to get relevant results but broad enough to catch variations
- **Exclude keywords** — optionally add terms whose presence in a job title or description will cause it to be automatically skipped (e.g. `Senior`, `Manager`). These appear below the include keywords for each profile.

| Other setting | What it is |
|---|---|
| **Location** | Already set in the wizard — adjust here if needed |
| **Accent colour** | Pick a colour you like |

---

## Daily use

- Run **`bash jobdeck.sh`** (or use the desktop shortcut if you created one) to start the app each day. Close the terminal to stop it.
- **Sync Sources** (dashboard) — scrapes Seek and Trade Me for new listings matching your keywords
- **Filter with AI** — scores all new listings and archives anything below the configured fit threshold
- **Job cards** — click any job to see the full description, chat with Claude about it, or start a mock interview

---

## Getting updates

When new changes are published to GitHub:

1. Pull the latest code (`git pull`, or download the ZIP again)
2. Run **`bash update.sh`** — it installs new packages, rebuilds, and relaunches automatically

---

## Troubleshooting

**Sync Sources does nothing / scraping fails** — Playwright's Chromium may not be installed. `jobdeck.sh` installs it automatically, but the extraction can hang on Linux Mint. If that happens, download and extract it manually:
```bash
# Find the version your Playwright expects
node -e "const {chromium}=require('playwright-core');console.log(chromium.executablePath())"
# Then download the headless shell zip from cdn.playwright.dev and extract it to that path
# Or simply run: npx playwright install chromium
```

**Browser shows a blank page or error** — make sure the terminal running `jobdeck.sh` is still open and didn't show any errors. Try refreshing after a few seconds.

**AI features not working** — go to Settings → AI and check that your Anthropic API key is entered correctly.

**Want to change your data path** — go to Settings → Data & Storage. Note that changing `DATA_PATH` after first run requires restarting the server.

---

## Development

```bash
npm run dev:browser   # backend + Vite, opens browser automatically (no Electron)
npm run dev           # backend + Vite + Electron
npm run dev:be        # backend only (nodemon, port 3001)
npm run dev:fe        # Vite only (port 5173)
```

The app works fully in the browser at `http://localhost:5173` in dev mode. Vite proxies `/api` to the backend on `:3001`.
