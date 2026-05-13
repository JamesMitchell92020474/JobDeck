$Host.UI.RawUI.WindowTitle = "JobDeck"
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
Write-Host "    JobDeck"
Write-Host "  ========================================="
Write-Host ""

# Check Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please download and install Node.js version 24 or later from:"
    Write-Host "  https://nodejs.org  (choose version 24.x)"
    Write-Host ""
    Write-Host "  Then double-click this file again."
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# Check Node.js version is 24+
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
    Write-Host "  ERROR: Node.js version 24 or later is required." -ForegroundColor Red
    Write-Host "  You have: $(node --version)"
    Write-Host ""
    Write-Host "  Please download Node.js 24.x from https://nodejs.org"
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# First-time setup: install packages
if (-not (Test-Path "node_modules")) {
    Write-Host "  First run detected - installing packages."
    Write-Host "  This may take a couple of minutes..."
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  ERROR: Package installation failed." -ForegroundColor Red
        Write-Host "  Check your internet connection and try again."
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
    Write-Host ""
}

# Install Playwright Chromium (needed for job scraping)
Write-Host "  Checking scraper browser (Playwright Chromium)..."
npx playwright install chromium --quiet 2>$null
Write-Host ""

# First-time setup: build the frontend
if (-not (Test-Path "dist")) {
    Write-Host "  Building the app for the first time..."
    Write-Host "  This may take a minute..."
    Write-Host ""
    npm run build:fe
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  ERROR: Build failed." -ForegroundColor Red
        Write-Host "  Please check the output above for details."
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
    Write-Host ""
}

# Create .env from example if missing (setup wizard runs in the browser)
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
    }
}

# Start the server
Write-Host "  Starting JobDeck..."
Write-Host ""
Write-Host "  Opening browser in 3 seconds."
Write-Host "  Keep this window open - it runs the JobDeck server."
Write-Host "  Close it to stop the app."
Write-Host ""

Start-Job { Start-Sleep 3; Start-Process "http://localhost:3001" } | Out-Null

# Server loop - restarts automatically when the setup wizard completes (exit code 42)
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
