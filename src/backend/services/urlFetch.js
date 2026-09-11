// Detects URLs pasted into a chat message and fetches their page content so Claude can
// read the linked page directly, instead of the user having to paste the text themselves.
// Used by per-job chat, mock interview, and global chat — all three call
// extractLinksContext(message) before building the AI prompt for that turn.

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
const MAX_LINKS_PER_MESSAGE = 3;
const PER_LINK_LIMIT = 6000;
const TOTAL_LIMIT = 15000;
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Blocks local/internal addresses so a pasted link can't be used to probe the user's own
// machine or local network from the backend process.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local, incl. cloud metadata endpoints
  return false;
}

function extractUrls(text) {
  const matches = (text || '').match(URL_REGEX) || [];
  const seen = new Set();
  const urls = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,!?;:]+$/, ''); // drop trailing punctuation caught by the regex
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_LINKS_PER_MESSAGE) break;
  }
  return urls;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// Prefers <article> or <main> content when present — skips nav/header/footer boilerplate
// that would otherwise eat into the per-link character budget before the real content.
function extractMainHtml(html) {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article && article[1].length > 200) return article[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main && main[1].length > 200) return main[1];
  return html;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// Fast path: plain HTTP GET + strip. Works for static/server-rendered pages.
async function fetchPlain(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    const html = await res.text();
    return { title: extractTitle(html), text: stripHtml(extractMainHtml(html)) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Slow path: renders with Playwright for JS-heavy pages. Only used when the plain fetch
// came back empty/too short.
async function fetchWithBrowser(url) {
  let browser;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] });
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { waitUntil: 'load', timeout: FETCH_TIMEOUT_MS });
    await page.waitForTimeout(1000);
    const extracted = await page.evaluate(() => ({
      title: document.title || null,
      text: document.body ? document.body.innerText : '',
    }));
    return { title: extracted.title, text: (extracted.text || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim() };
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchOne(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { url, error: 'invalid URL' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { url, error: 'unsupported protocol' };
  if (isBlockedHost(parsed.hostname)) return { url, error: 'blocked host' };

  let result = await fetchPlain(url);
  if (!result || (result.text || '').length < 200) {
    const rendered = await fetchWithBrowser(url);
    if (rendered && (rendered.text || '').length > (result?.text?.length || 0)) result = rendered;
  }
  if (!result || !result.text) return { url, error: 'could not read page content' };
  return { url, title: result.title, text: result.text.slice(0, PER_LINK_LIMIT) };
}

// Finds URLs in a chat message, fetches each (capped at 3, run in parallel), and returns
// a formatted context block to append to that turn's system prompt — or null if the
// message contained no links.
async function extractLinksContext(message) {
  const urls = extractUrls(message);
  if (urls.length === 0) return null;

  const results = await Promise.all(urls.map(fetchOne));
  let totalChars = 0;
  const sections = [];
  for (const r of results) {
    if (r.error) {
      sections.push(`[Link: ${r.url}]\n(Could not fetch this page: ${r.error})`);
      continue;
    }
    if (totalChars >= TOTAL_LIMIT) continue;
    const chunk = r.text.slice(0, TOTAL_LIMIT - totalChars);
    sections.push(`[Link: ${r.url}${r.title ? ` — "${r.title}"` : ''}]\n${chunk}`);
    totalChars += chunk.length;
  }
  return sections.join('\n\n---\n\n');
}

module.exports = { extractLinksContext };
