$Host.UI.RawUI.WindowTitle = "JobDeck Updater"
Set-Location $PSScriptRoot

trap {
    Write-Host ""
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "  ========================================="
Write-Host "    JobDeck - Apply Update"
Write-Host "  ========================================="
Write-Host ""
Write-Host "  Run this after pulling new changes from GitHub."
Write-Host "  It will install any new packages, rebuild the app, and relaunch it."
Write-Host ""

# Check Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "  Please install it from https://nodejs.org (version 24 or later)"
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# Install any new packages
Write-Host "  Checking for new packages..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: npm install failed." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host ""

# Update Playwright browser if needed
Write-Host "  Checking scraper browser..."
npx playwright install chromium --quiet 2>$null
Write-Host ""

# Rebuild the frontend
Write-Host "  Rebuilding the app..."
npm run build:fe
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: Build failed." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host ""

# Launch
Write-Host "  Update complete. Launching JobDeck..."
Write-Host ""

Start-Job { Start-Sleep 3; Start-Process "http://localhost:3001" } | Out-Null

do {
    node --no-warnings src/backend/index.js
    $restart = $LASTEXITCODE -eq 42
    if ($restart) {
        Write-Host ""
        Write-Host "  Restarting..."
        Write-Host ""
    }
} while ($restart)

Read-Host "  Press Enter to close"
