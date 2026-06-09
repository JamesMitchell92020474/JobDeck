#!/usr/bin/env bash
set -euo pipefail

# Load nvm if available (nvm doesn't export node to non-interactive shells)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ========================================="
echo "    JobDeck"
echo "  ========================================="
echo ""

# Check Node.js is installed
if ! command -v node &>/dev/null; then
  echo "  ERROR: Node.js is not installed."
  echo ""
  echo "  Install it via your package manager, e.g.:"
  echo "    sudo apt install nodejs   (may be outdated)"
  echo "  or use nvm: https://github.com/nvm-sh/nvm"
  echo "  Version 24 or later is required."
  echo ""
  read -rp "  Press Enter to exit" _
  exit 1
fi

# Check Node.js version is 24+
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "  ERROR: Node.js version 24 or later is required."
  echo "  You have: $(node --version)"
  echo ""
  read -rp "  Press Enter to exit" _
  exit 1
fi

# First-time setup: install packages
if [ ! -d "node_modules" ]; then
  echo "  First run detected - installing packages."
  echo "  This may take a couple of minutes..."
  echo ""
  npm install
  echo ""
fi

# Install Playwright Chromium (needed for job scraping)
echo "  Checking scraper browser (Playwright Chromium)..."
npx playwright install chromium --quiet 2>/dev/null || true
echo ""

# First-time setup: build the frontend
if [ ! -d "dist" ]; then
  echo "  Building the app for the first time..."
  echo "  This may take a minute..."
  echo ""
  npm run build:fe
  echo ""
fi

# Create .env from example if missing (setup wizard runs in the browser)
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp ".env.example" ".env"
fi

echo "  Starting JobDeck..."
echo ""
echo "  Opening browser in 3 seconds."
echo "  Keep this terminal open - it runs the JobDeck server."
echo "  Press Ctrl+C to stop the app."
echo ""

# Open browser after a short delay
(sleep 3 && xdg-open "http://localhost:3001" 2>/dev/null) &

# Server loop — restarts automatically when the setup wizard completes (exit code 42)
while true; do
  node --no-warnings src/backend/index.js || EXIT_CODE=$?
  if [ "${EXIT_CODE:-0}" -eq 42 ]; then
    echo ""
    echo "  Restarting..."
    echo ""
    EXIT_CODE=0
  else
    break
  fi
done

read -rp "  Press Enter to close" _
