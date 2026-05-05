const { Document, Paragraph, TextRun, HeadingLevel, Packer } = require('docx');
const path = require('path');
const fs = require('fs');

function htmlToDocxParagraphs(html) {
  // Strip tags and split on double newlines
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  return text.split('\n').map(line => new Paragraph({ children: [new TextRun(line.trim())] }));
}

async function exportCoverLetterDocx(html, outputDir, filename) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, filename);

  const doc = new Document({
    sections: [{
      properties: {},
      children: htmlToDocxParagraphs(html),
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

module.exports = { exportCoverLetterDocx };
