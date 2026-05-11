const path = require('path');
const fs = require('fs');

async function exportCoverLetterPDF(html, outputDir, filename) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, filename);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const page = await browser.newPage();

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.7; max-width: 700px; margin: 60px auto; color: #1a1a1a; }
  h1, h2 { font-size: 14pt; }
  p { margin: 0 0 1em; }
  ul, ol { margin: 0 0 1em 1.4em; }
</style>
</head>
<body>${html}</body>
</html>`;

  await page.setContent(fullHtml, { waitUntil: 'load' });
  await page.pdf({ path: outPath, format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' } });
  await browser.close();

  return outPath;
}

module.exports = { exportCoverLetterPDF };
