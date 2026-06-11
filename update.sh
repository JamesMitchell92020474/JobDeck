#!/usr/bin/env bash
set -euo pipefail

# Load nvm if available (nvm doesn't export node to non-interactive shells)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ========================================="
echo "    JobDeck - Apply Update"
echo "  ========================================="
echo ""
echo "  Run this after pulling new changes from GitHub."
echo "  It will install any new packages, rebuild the app, and relaunch it."
echo ""

# Check Node.js is installed
if ! command -v node &>/dev/null; then
  echo "  ERROR: Node.js is not installed."
  echo "  Please install version 24 or later."
  echo ""
  read -rp "  Press Enter to exit" _
  exit 1
fi

# Install any new packages
echo "  Checking for new packages..."
npm install
echo ""

# Update Playwright browser if needed
# Skip if binary already exists — npx playwright install can hang on Linux Mint
PLAYWRIGHT_BIN=$(node -e "try{const {chromium}=require('playwright-core');console.log(chromium.executablePath());}catch{}" 2>/dev/null)
if [ -z "$PLAYWRIGHT_BIN" ] || [ ! -f "$PLAYWRIGHT_BIN" ]; then
  echo "  Installing scraper browser (Playwright Chromium)..."
  timeout 120 npx playwright install chromium --quiet 2>/dev/null || \
    echo "  Warning: Playwright install timed out. Run 'npx playwright install chromium' manually if scraping fails."
fi
echo ""

# Rebuild the frontend
echo "  Rebuilding the app..."
npm run build:fe
echo ""

echo "  Update complete. Launching JobDeck..."
echo ""

(sleep 3 && xdg-open "http://localhost:3001" 2>/dev/null) &

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
