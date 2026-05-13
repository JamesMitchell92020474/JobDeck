@echo off
title JobDeck Updater
cd /d "%~dp0"

echo.
echo  =========================================
echo    JobDeck — Apply Update
echo  =========================================
echo.
echo  Run this after pulling new changes from GitHub.
echo  It will install any new packages, rebuild the app, and relaunch it.
echo.

:: ── Check Node.js is installed ───────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Please install it from https://nodejs.org (version 24 or later)
    echo.
    pause
    exit /b 1
)

:: ── Install any new packages ──────────────────────────────────────────────────
echo  Checking for new packages...
call npm install
if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed.
    pause
    exit /b 1
)
echo.

:: ── Update Playwright browser if needed ──────────────────────────────────────
echo  Checking scraper browser...
call npx playwright install chromium --quiet 2>nul
echo.

:: ── Rebuild the frontend ──────────────────────────────────────────────────────
echo  Rebuilding the app...
call npm run build:fe
if errorlevel 1 (
    echo.
    echo  ERROR: Build failed.
    pause
    exit /b 1
)
echo.

:: ── Launch ────────────────────────────────────────────────────────────────────
echo  Update complete. Launching JobDeck...
echo.

start "JobDeck Server" node --no-warnings src/backend/index.js
timeout /t 3 /nobreak >nul
start http://localhost:3001

exit
