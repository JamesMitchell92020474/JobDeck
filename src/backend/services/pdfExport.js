const path = require('path');
const fs   = require('fs');

// Build the letterhead HTML block from settings
function buildLetterheadHtml(lh) {
  if (!lh || !lh.enabled) return '';

  const textAlign = lh.logoAlign || 'left';
  const parts = [];

  // Logo
  if (lh.logoBase64) {
    parts.push(`
      <div style="text-align: ${textAlign}; margin-bottom: 6px;">
        <img src="${lh.logoBase64}"
             style="height: ${lh.logoHeight || 60}px; max-width: 100%; object-fit: contain; display: inline-block;" />
      </div>`);
  }

  // Name
  if (lh.nameText) {
    const nameStyle = [
      `font-family: ${lh.nameFontFamily || 'Georgia, serif'}`,
      `font-size: ${lh.nameFontSize || '22pt'}`,
      `font-weight: ${lh.nameFontWeight || 'bold'}`,
      `font-style: ${lh.nameItalic ? 'italic' : 'normal'}`,
      `color: ${lh.nameColor || '#1a1a1a'}`,
      `line-height: 1.2`,
      `margin: 0 0 4px`,
      `text-align: ${textAlign}`,
    ].join('; ');
    parts.push(`<div style="${nameStyle}">${escHtml(lh.nameText)}</div>`);
  }

  // Contact
  if (lh.contactText) {
    const contactStyle = [
      `font-family: ${lh.contactFontFamily || 'Georgia, serif'}`,
      `font-size: ${lh.contactFontSize || '10pt'}`,
      `color: ${lh.contactColor || '#555555'}`,
      `margin: 0`,
      `text-align: ${textAlign}`,
    ].join('; ');
    parts.push(`<div style="${contactStyle}">${escHtml(lh.contactText)}</div>`);
  }

  // Separator
  if (lh.showSeparator) {
    parts.push(`<hr style="border: none; border-top: 1px solid ${lh.separatorColor || '#cccccc'}; margin: 12px 0 16px;" />`);
  } else {
    parts.push('<div style="margin-bottom: 20px;"></div>');
  }

  return `<div class="cl-letterhead">${parts.join('\n')}</div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function exportCoverLetterPDF(html, outputDir, filename, settings = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, filename);

  const pageSize   = settings.pageSize || 'A4';
  const margins    = settings.margins  || { top: 25, bottom: 25, left: 25, right: 25 };
  const fontFamily = settings.fontFamily || 'Georgia, serif';
  const fontSize   = settings.fontSize   || '12pt';
  const lineHeight = settings.lineHeight  || 1.7;
  const spaceBefore = settings.spaceBefore != null ? settings.spaceBefore : 0;
  const spaceAfter  = settings.spaceAfter  != null ? settings.spaceAfter  : 14;

  const letterheadHtml = buildLetterheadHtml(settings.letterhead);

  // Map page size to Playwright format
  const playwrightFormat = pageSize === 'Letter' ? 'Letter' : 'A4';

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${fontFamily};
    font-size: ${fontSize};
    line-height: ${lineHeight};
    color: #1a1a1a;
  }
  .cl-letterhead { margin-bottom: 4px; }
  p  { margin-top: ${spaceBefore}px; margin-bottom: ${spaceAfter}px; }
  h1, h2, h3 { margin-top: 1.2em; margin-bottom: 0.4em; font-size: 14pt; }
  ul, ol { margin: 0 0 ${spaceAfter}px 1.4em; }
  li { margin-bottom: 0.25em; }
  strong { font-weight: bold; }
  em     { font-style: italic; }
</style>
</head>
<body>
${letterheadHtml}
${html}
</body>
</html>`;

  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'load' });
  await page.pdf({
    path: outPath,
    format: playwrightFormat,
    margin: {
      top:    `${margins.top}mm`,
      bottom: `${margins.bottom}mm`,
      left:   `${margins.left}mm`,
      right:  `${margins.right}mm`,
    },
  });
  await browser.close();

  return outPath;
}

module.exports = { exportCoverLetterPDF };
