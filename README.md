# JobDeck

AI-powered job search dashboard for Windows. Scrapes Seek and Trade Me Jobs, scores listings against your CV using Claude AI, tracks applications through a kanban pipeline, and helps you prepare for interviews.

---

## Features

**Pipeline**
- Kanban board — New → Interested → Applied → Interview → Offer → Rejected → Archived
- AI fit scoring (0–100) against your CV with summary and skills gaps
- One-click AI filter — scores all new listings, archives poor fits automatically
- Playwright scraper for Seek and Trade Me Jobs (daily schedule + manual trigger)
- Full description fetch per job — extracts salary, job type, and posting date

**AI chat**
- Global chat with named session history — discuss your whole job search with Claude
- Per-job chat — Claude has the job description and your CV as context
- Voice mode — hands-free conversation; mic restarts automatically after each response
- Mock interview — 15 realistic questions, no mid-interview feedback, written assessment at the end; save and compare transcripts across sessions

**Documents**
- AI cover letter generation with a custom style template
- Export as PDF or Word
- Two CV profiles with configurable labels (e.g. "Tech / IT" and "Sales")

**Other**
- Dashboard with welcome message, pipeline stats, news feed, and weather
- Activity logs, zip backups, dark mode, accent colour customisation
- All personal details configured via Settings — no hardcoding in the code

---

## Requirements

- **Windows** (the launcher is a `.bat` file)
- **Node.js 24 or later** — download from [nodejs.org](https://nodejs.org) and choose version **24.x**
  *(the app uses Node's built-in SQLite module which requires v24+)*
- **An Anthropic API key** — get one free at [console.anthropic.com](https://console.anthropic.com)
  *(you pay per use; typical job search usage costs a few cents a month)*

---

## Installation

### Step 1 — Get the code

**Option A — Git (recommended if you want easy updates):**
```
git clone https://github.com/JamesMitchell92020474/JobDeck.git
```

**Option B — Download ZIP:**
Go to the GitHub repo → click the green **Code** button → **Download ZIP** → extract it somewhere on your PC.

---

### Step 2 — First run

Double-click **`JobDeck.bat`** in the folder.

On first run it will automatically:
1. Check your Node.js version
2. Install all packages (`npm install`)
3. Download the scraper browser (Playwright Chromium, ~150 MB — once only)
4. Build the app
5. Create a `.env` file and open it in Notepad

---

### Step 3 — Add your API key

In Notepad, find this line:
```
ANTHROPIC_API_KEY=
```
Paste your key from [console.anthropic.com](https://console.anthropic.com) after the `=` sign.

**If your PC has no D: drive**, also change `DATA_PATH`:
```
DATA_PATH=C:\JobDeck\data
```
(and update `LOG_PATH` and `BACKUP_PATH` to match)

Save and close Notepad, then double-click **`JobDeck.bat`** again. Your browser will open to the app.

---

### Step 4 — Configure Settings

Go to **Settings** (bottom of the sidebar) and fill in:

| Setting | What it is |
|---|---|
| **Your name** | Used in AI prompts and the welcome message |
| **Location** | Your city — used for scraping and weather |
| **CV Profile 1 / 2** | Name your two CV profiles (e.g. "Tech / IT") then upload the PDFs |
| **Profile keywords** | Keywords used to search for jobs in each category |
| **Accent colour** | Pick a colour you like |

---

## Daily use

- **Double-click `JobDeck.bat`** to start the app each day. Close the "JobDeck Server" window to stop it.
- **Sync Sources** (dashboard) — scrapes Seek and Trade Me for new listings matching your keywords
- **Filter with AI** — scores all new listings and archives anything below 40% fit
- **Job cards** — click any job to see the full description, chat with Claude about it, or start a mock interview

---

## Getting updates

When new changes are published to GitHub:

1. Download the updated code (or `git pull` if you used Git)
2. Double-click **`Update.bat`** — it installs new packages, rebuilds, and relaunches

---

## Troubleshooting

**ESET antivirus** blocks Playwright's Chromium (used for scraping). Add to ESET exclusions:
```
C:\Users\<your username>\AppData\Local\ms-playwright\
```
In ESET: Advanced Setup → Protections → Real-time file system protection → Exclusions → use "Path" type.

**No D: drive** — see Step 3 above to change the data path to C:.

**Browser shows a blank page or error** — make sure the "JobDeck Server" window is open and didn't show any errors. Try refreshing after a few seconds.

**AI features not working** — check that `ANTHROPIC_API_KEY` is set correctly in your `.env` file, with no spaces around the `=`.

---

## Development

If you want to work on the code:

```powershell
npm run dev    # hot reload — backend on :3001, frontend on :5173
```
