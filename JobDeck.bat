@echo off
title JobDeck Launcher
cd /d "%~dp0"

echo.
echo  =========================================
echo    JobDeck
echo  =========================================
echo.

:: ── Check Node.js is installed ───────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Please download and install Node.js version 24 or later from:
    echo  https://nodejs.org  (choose version 24.x)
    echo.
    echo  Then double-click this file again.
    echo.
    pause
    exit /b 1
)

:: ── Check Node.js version is 24+ ─────────────────────────────────────────────
for /f "tokens=1 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 24 (
    echo  ERROR: Node.js version 24 or later is required.
    echo  You have: & node --version
    echo.
    echo  Please download Node.js 24.x from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ── First-time setup: install packages ───────────────────────────────────────
if not exist "node_modules\" (
    echo  First run detected — installing packages.
    echo  This may take a couple of minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: Package installation failed.
        echo  Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo.
)

:: ── Install Playwright's browser (needed for job scraping) ───────────────────
:: This downloads Chromium the first time (~150 MB). Fast if already installed.
echo  Checking scraper browser (Playwright Chromium)...
call npx playwright install chromium --quiet 2>nul
echo.

:: ── First-time setup: build the frontend ─────────────────────────────────────
if not exist "dist\" (
    echo  Building the app for the first time...
    echo  This may take a minute...
    echo.
    call npm run build:fe
    if errorlevel 1 (
        echo.
        echo  ERROR: Build failed.
        echo  Please check the output above for details.
        echo.
        pause
        exit /b 1
    )
    echo.
)

:: ── Check .env exists ─────────────────────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    )
    echo  SETUP REQUIRED
    echo  ─────────────────────────────────────────
    echo  A .env file has been created for you.
    echo.
    echo  1. Get a free API key at: https://console.anthropic.com
    echo  2. Open the .env file (opening now in Notepad)
    echo  3. Paste your key after ANTHROPIC_API_KEY=
    echo  4. If your PC has no D: drive, change DATA_PATH to
    echo     something like C:\JobDeck\data
    echo  5. Save and close Notepad
    echo  6. Double-click JobDeck.bat again
    echo  ─────────────────────────────────────────
    echo.
    start notepad ".env"
    pause
    exit /b 0
)

:: ── Start the server ──────────────────────────────────────────────────────────
echo  Starting JobDeck...
echo.
echo  Your browser will open in a moment.
echo  Close the "JobDeck Server" window to stop the app.
echo.

start "JobDeck Server" node --no-warnings src/backend/index.js

:: Wait 3 seconds for the server to initialise, then open the browser.
timeout /t 3 /nobreak >nul
start http://localhost:3001

exit
