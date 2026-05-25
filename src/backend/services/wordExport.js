const {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Packer, BorderStyle,
  convertInchesToTwip,
} = require('docx');
const path = require('path');
const fs   = require('fs');

// ─── HTML → inline runs ────────────────────────────────────────────────────────
// Converts an inline HTML fragment into an array of run descriptors.
function parseInlineRuns(html) {
  const runs = [];
  // Normalise entities
  const text = html
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g,  "'");

  // Simple tag-aware tokeniser
  const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>|([^<]+)/g;
  const stack  = [];
  let state    = { bold: false, italic: false, underline: false, color: null, fontSize: null, fontFamily: null };

  const pushState = () => stack.push({ ...state });
  const popState  = () => { if (stack.length) state = stack.pop(); };

  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    const [, closing, tag, attrs, textNode] = m;
    if (textNode !== undefined) {
      // Plain text — emit a run using current state
      if (textNode) runs.push({ text: textNode, ...state });
    } else if (closing === '/') {
      // Closing tag — restore previous state
      popState();
    } else {
      // Opening tag
      const lo = tag.toLowerCase();
      pushState();
      if (lo === 'strong' || lo === 'b') {
        state.bold = true;
      } else if (lo === 'em' || lo === 'i') {
        state.italic = true;
      } else if (lo === 'u') {
        state.underline = true;
      } else if (lo === 'br') {
        runs.push({ text: '\n', ...state });
        popState(); // <br> is self-closing — nothing to nest
      } else if (lo === 'span') {
        const styleMatch = attrs.match(/style="([^"]*)"/i);
        if (styleMatch) {
          const s = styleMatch[1];
          const cm  = s.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
          const fsm = s.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i);
          const ffm = s.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i);
          if (cm)  state.color      = cm[1].trim();
          if (fsm) state.fontSize   = fsm[1].trim();
          if (ffm) state.fontFamily = ffm[1].trim().replace(/["']/g, '');
        }
      }
    }
  }
  return runs;
}

// ─── runs → TextRun[] ─────────────────────────────────────────────────────────
function runsToTextRuns(runs, docSettings) {
  const defaultFont   = (docSettings.fontFamily || 'Georgia').split(',')[0].trim().replace(/["']/g, '');
  const defaultPtHalf = ptToHalfPoints(docSettings.fontSize || '12pt');

  return runs.map(r => {
    const opts = { text: r.text };
    if (r.bold)      opts.bold      = true;
    if (r.italic)    opts.italics   = true;
    if (r.underline) opts.underline = {};

    // Color — strip # prefix, skip default dark values
    if (r.color) {
      const hex = r.color.replace('#', '');
      if (hex && hex !== '1a1a1a' && hex !== '000000') opts.color = hex;
    }

    // Font size (half-points)
    const sizeHp = r.fontSize ? ptToHalfPoints(r.fontSize) : null;
    if (sizeHp) opts.size = sizeHp;
    else if (defaultPtHalf) opts.size = defaultPtHalf;

    // Font family
    const ff = r.fontFamily ? r.fontFamily.split(',')[0].trim().replace(/["']/g, '') : null;
    opts.font = ff || defaultFont;

    return new TextRun(opts);
  });
}

function ptToHalfPoints(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d+(?:\.\d+)?)\s*pt$/i);
  return m ? Math.round(parseFloat(m[1]) * 2) : null;
}

// ─── HTML → docx Paragraph[] ──────────────────────────────────────────────────
function htmlToDocxParagraphs(html, settings = {}) {
  // 1. Convert list items to flat paragraphs with bullet prefixes
  let processed = html
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ');

  processed = processed.replace(
    /<ul[^>]*>([\s\S]*?)<\/ul>/gi,
    (_, inner) => inner.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (__, c) => `<p>• ${c.replace(/<\/?p[^>]*>/gi, '').trim()}</p>`
    )
  );

  let olCounter = 0;
  processed = processed.replace(
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    (_, inner) => {
      olCounter = 0;
      return inner.replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (__, c) => { olCounter++; return `<p>${olCounter}. ${c.replace(/<\/?p[^>]*>/gi, '').trim()}</p>`; }
      );
    }
  );

  // 2. Extract block elements
  const BLOCK = /<(p|h[1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/gi;
  const paras  = [];
  let match;

  while ((match = BLOCK.exec(processed)) !== null) {
    const [, tag, attrsStr, inner] = match;
    const lo = tag.toLowerCase();

    // text-align from style
    const alignM = attrsStr.match(/text-align\s*:\s*(\w+)/i);
    const align  = alignM ? alignM[1] : 'left';

    let heading = null;
    if (lo === 'h1') heading = HeadingLevel.HEADING_1;
    if (lo === 'h2') heading = HeadingLevel.HEADING_2;
    if (lo === 'h3') heading = HeadingLevel.HEADING_3;

    const runs  = parseInlineRuns(inner);
    paras.push({ heading, align, runs });
  }

  // 3. Convert to docx Paragraphs
  const mmToTwip = mm => Math.round(mm * 56.69);
  const pxToTwip = px => Math.round(px * 15);

  const spaceBefore = pxToTwip(Number(settings.spaceBefore) || 0);
  const spaceAfter  = pxToTwip(Number(settings.spaceAfter)  || 14);

  // Line spacing — docx uses 240 = single, 360 = 1.5, 480 = double
  const lhVal = parseFloat(settings.lineHeight || 1.7);
  const lineSpacing = Math.round(lhVal * 240);

  const alignMap = {
    left:    AlignmentType.LEFT,
    center:  AlignmentType.CENTER,
    right:   AlignmentType.RIGHT,
    justify: AlignmentType.BOTH,
  };

  return paras.map(p => {
    const textRuns = runsToTextRuns(p.runs, settings);
    if (!textRuns.length) textRuns.push(new TextRun({ text: '' }));

    const opts = {
      children: textRuns,
      spacing: {
        before: p.heading ? pxToTwip(12) : spaceBefore,
        after:  spaceAfter,
        line:   lineSpacing,
        lineRule: 'auto',
      },
    };

    if (p.heading)             opts.heading   = p.heading;
    if (alignMap[p.align])     opts.alignment = alignMap[p.align];

    return new Paragraph(opts);
  });
}

// ─── Build letterhead paragraphs ──────────────────────────────────────────────
function letterheadToParagraphs(lh, settings) {
  if (!lh || !lh.enabled) return [];
  const paras = [];

  const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };
  const alignment = alignMap[lh.logoAlign || 'left'] || AlignmentType.LEFT;

  // Note: Word doesn't support embedded base64 images via this library easily.
  // Logo is omitted from the Word export (it will appear in the PDF).
  // Show a placeholder comment instead.
  if (lh.logoBase64) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: '[Logo — see PDF for full letterhead]', italics: true, color: '888888', size: 18 })],
      alignment,
      spacing: { after: 80 },
    }));
  }

  if (lh.nameText) {
    const namePtHalf = ptToHalfPoints(lh.nameFontSize || '22pt');
    const nameFont   = (lh.nameFontFamily || 'Georgia').split(',')[0].trim().replace(/["']/g, '');
    const nameColor  = (lh.nameColor || '#1a1a1a').replace('#', '');
    paras.push(new Paragraph({
      children: [new TextRun({
        text:    lh.nameText,
        bold:    lh.nameFontWeight === 'bold',
        italics: !!lh.nameItalic,
        size:    namePtHalf || 44,
        font:    nameFont,
        color:   nameColor !== '1a1a1a' ? nameColor : undefined,
      })],
      alignment,
      spacing: { after: 60 },
    }));
  }

  if (lh.contactText) {
    const contactPtHalf = ptToHalfPoints(lh.contactFontSize || '10pt');
    const contactFont   = (lh.contactFontFamily || 'Georgia').split(',')[0].trim().replace(/["']/g, '');
    const contactColor  = (lh.contactColor || '#555555').replace('#', '');
    paras.push(new Paragraph({
      children: [new TextRun({
        text:  lh.contactText,
        size:  contactPtHalf || 20,
        font:  contactFont,
        color: contactColor,
      })],
      alignment,
      spacing: { after: lh.showSeparator ? 140 : 280 },
    }));
  }

  // Separator — approximated with a bottom border on an empty paragraph
  if (lh.showSeparator) {
    paras.push(new Paragraph({
      children: [],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: (lh.separatorColor || '#cccccc').replace('#', '') },
      },
      spacing: { after: 280 },
    }));
  }

  return paras;
}

// ─── Main export function ─────────────────────────────────────────────────────
async function exportCoverLetterDocx(html, outputDir, filename, settings = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, filename);

  const margins    = settings.margins || { top: 25, bottom: 25, left: 25, right: 25 };
  const mmToTwip   = mm => Math.round(mm * 56.69);

  const bodyParagraphs = htmlToDocxParagraphs(html, settings);
  const lhParagraphs   = letterheadToParagraphs(settings.letterhead, settings);
  const allChildren    = [...lhParagraphs, ...bodyParagraphs];

  if (!allChildren.length) {
    allChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: (settings.fontFamily || 'Georgia').split(',')[0].trim().replace(/["']/g, ''),
            size: ptToHalfPoints(settings.fontSize || '12pt') || 24,
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: settings.pageSize === 'Letter'
            ? { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) }
            : { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) }, // A4
          margin: {
            top:    mmToTwip(margins.top),
            bottom: mmToTwip(margins.bottom),
            left:   mmToTwip(margins.left),
            right:  mmToTwip(margins.right),
          },
        },
      },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

module.exports = { exportCoverLetterDocx };
