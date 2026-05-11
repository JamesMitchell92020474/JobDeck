const { getDb, getSetting, setSetting } = require('../db/database');

function normaliseJobType(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (s.includes('full')) return 'Full time';
  if (s.includes('part')) return 'Part time';
  if (s.includes('contract') || s.includes('temp')) return 'Contract/Temp';
  if (s.includes('casual')) return 'Casual';
  if (s.includes('intern')) return 'Internship';
  return raw.trim();
}
const { log } = require('./logger');
const { autoTag } = require('./autoTag');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function launchBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  return { browser, context };
}

async function scrapeSeekUrl(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Try known selectors, fall back to article tags
    const cardSel = await Promise.race([
      page.waitForSelector('[data-automation="normalJob"]', { timeout: 8000 }).then(() => '[data-automation="normalJob"]').catch(() => null),
      page.waitForSelector('article[data-card-type="JobCard"]', { timeout: 8000 }).then(() => 'article[data-card-type="JobCard"]').catch(() => null),
      page.waitForSelector('[data-testid="job-card"]', { timeout: 8000 }).then(() => '[data-testid="job-card"]').catch(() => null),
    ]);

    if (!cardSel) {
      log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-WARN', source: 'Seek', reason: `No job cards found at ${url}` });
      return [];
    }

    return await page.evaluate((sel) => {
      const titleSels  = ['[data-automation="jobTitle"]', 'h3 a', 'h2 a', '[class*="title"] a'];
      const companySels = ['[data-automation="jobCompany"]', '[data-automation="jobListingCompany"]', '[class*="company"]', '[class*="advertiser"]'];
      const locationSels = ['[data-automation="jobLocation"]', '[data-automation="jobCardLocation"]', '[class*="location"]'];

      const pick = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.textContent?.trim()) return found.textContent.trim();
        }
        return '';
      };
      const pickHref = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.href) return found.href;
        }
        return '';
      };

      const jobTypeSels = ['[data-automation="jobWorkType"]', '[data-automation="workType"]', '[class*="workType"]', '[class*="work-type"]'];
      const postedSels  = ['[data-automation="jobListingDate"]', '[data-automation="jobDate"]', '[class*="listed-date"]', 'time[datetime]', 'time'];

      function resolvePostedDate(el) {
        if (!el) return '';
        const iso = el.getAttribute && el.getAttribute('datetime');
        if (iso) {
          const d = new Date(iso);
          if (!isNaN(d)) {
            const now = new Date();
            return d.toLocaleDateString('en-NZ', {
              day: 'numeric', month: 'short',
              year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
          }
        }
        const txt = el.textContent.trim();
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) {
          const d = new Date(); d.setDate(d.getDate() - parseInt(dMatch[1]));
          return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        if (txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i)) {
          return new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        return txt;
      }

      function pickDate(card, sels) {
        for (const s of sels) {
          const el = card.querySelector(s);
          if (el) return resolvePostedDate(el);
        }
        return '';
      }

      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:        pick(c, titleSels),
        company:      pick(c, companySels),
        location:     pick(c, locationSels),
        url:          pickHref(c, titleSels),
        job_type:     pick(c, jobTypeSels),
        posting_date: pickDate(c, postedSels),
      })).filter(j => j.title);
    }, cardSel);
  } finally {
    await page.close();
  }
}

function buildSeekLocation(location) {
  // Seek uses slugified location in the where param
  const map = {
    christchurch: 'Christchurch-Canterbury',
    auckland: 'Auckland',
    wellington: 'Wellington',
    hamilton: 'Hamilton-Waikato',
    tauranga: 'Tauranga-Bay-of-Plenty',
    dunedin: 'Dunedin-Otago',
  };
  const key = (location || '').toLowerCase().trim();
  return map[key] || location || 'All-New-Zealand';
}

function buildSeekUrls(keywords, location, maxAgeDays) {
  const where = buildSeekLocation(location);
  const daterange = parseInt(maxAgeDays || '15', 10);
  const ageSuffix = `&daterange=${daterange}`;
  if (!keywords) {
    return [
      `https://www.seek.co.nz/jobs?where=${where}&classification=1209${ageSuffix}`,
      `https://www.seek.co.nz/jobs?where=${where}&classification=1208${ageSuffix}`,
      `https://www.seek.co.nz/jobs?where=${where}&classification=1225${ageSuffix}`,
    ];
  }
  return keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5).map(k =>
    `https://www.seek.co.nz/jobs?keywords=${encodeURIComponent(k)}&where=${where}${ageSuffix}`
  );
}

async function scrapeSeek() {
  const location   = getSetting('scraper_location') || 'Christchurch';
  const techKw     = getSetting('scraper_keywords_tech') || '';
  const hospKw     = getSetting('scraper_keywords_hospitality') || '';
  const maxAgeDays = getSetting('scraper_max_age_days') || '30';

  const { browser, context } = await launchBrowser();
  try {
    const urls = [
      ...buildSeekUrls(techKw, location, maxAgeDays),
      ...buildSeekUrls(hospKw, location, maxAgeDays),
    ];
    const all = [];
    for (const url of urls) {
      const jobs = await scrapeSeekUrl(context, url).catch(err => {
        log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-ERROR', source: 'Seek', reason: err.message });
        return [];
      });
      all.push(...jobs);
    }
    return all.map(j => ({ ...j, source: 'Seek' }));
  } finally {
    await browser.close();
  }
}

// Trade Me Jobs region IDs (alphabetical NZ regions)
function buildTradeMeRegion(location) {
  const map = {
    christchurch: 3,  // Canterbury
    auckland:     1,
    wellington:   14,
    hamilton:     13, // Waikato
    tauranga:     2,  // Bay of Plenty
    dunedin:      10, // Otago
  };
  return map[(location || '').toLowerCase().trim()] || 3;
}

function buildTradeMeUrls(keywords, location) {
  const region = buildTradeMeRegion(location);
  if (!keywords) return [`https://www.trademe.co.nz/a/jobs/search?region=${region}`];
  return keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5).map(k =>
    `https://www.trademe.co.nz/a/jobs/search?search_string=${encodeURIComponent(k)}&region=${region}`
  );
}

async function scrapeTradeMeUrl(context, url) {
  const page = await context.newPage();
  log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-START', source: 'Trade Me Jobs', reason: url });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);

    const cardSel = await Promise.race([
      page.waitForSelector('tm-jobs-search-card', { timeout: 8000 }).then(() => 'tm-jobs-search-card').catch(() => null),
      page.waitForSelector('[data-testid="job-card"]', { timeout: 8000 }).then(() => '[data-testid="job-card"]').catch(() => null),
      page.waitForSelector('[class*="tm-jobs-search-card"]', { timeout: 8000 }).then(() => '[class*="tm-jobs-search-card"]').catch(() => null),
      page.waitForSelector('tm-job-listing', { timeout: 8000 }).then(() => 'tm-job-listing').catch(() => null),
    ]);

    if (!cardSel) {
      log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-WARN', source: 'Trade Me Jobs', reason: `No job cards found at ${url}` });
      return [];
    }

    log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-INFO', source: 'Trade Me Jobs', reason: `Selector matched: ${cardSel}` });

    const jobs = await page.evaluate((sel) => {
      const pick = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.textContent?.trim()) return found.textContent.trim();
        }
        return '';
      };

      const titleSels    = ['[class*="title"]', 'h2', 'h3', 'strong'];
      const companySels  = ['[class*="company"]', '[class*="employer"]', '[class*="advertiser"]', '[class*="subtitle"]'];
      const locationSels = ['[class*="location"]', '[class*="region"]', '[class*="suburb"]'];
      const typeSels     = ['[class*="job-type"]', '[class*="work-type"]', '[class*="employment"]'];
      const dateSels     = ['time[datetime]', 'time', '[class*="date"]', '[class*="listed"]'];

      function resolvePostedDate(el) {
        if (!el) return '';
        const iso = el.getAttribute && el.getAttribute('datetime');
        if (iso) {
          const d = new Date(iso);
          if (!isNaN(d)) {
            const now = new Date();
            return d.toLocaleDateString('en-NZ', {
              day: 'numeric', month: 'short',
              year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
            });
          }
        }
        const txt = el.textContent.trim();
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) {
          const d = new Date(); d.setDate(d.getDate() - parseInt(dMatch[1]));
          return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        if (txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i)) {
          return new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        return txt;
      }

      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:        pick(c, titleSels),
        company:      pick(c, companySels),
        location:     pick(c, locationSels),
        url:          c.querySelector('a[href*="/jobs/"]')?.href || c.querySelector('a')?.href || '',
        job_type:     pick(c, typeSels),
        posting_date: resolvePostedDate(c.querySelector(dateSels.find(s => c.querySelector(s)) || dateSels[0])),
      })).filter(j => j.title);
    }, cardSel);

    log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-INFO', source: 'Trade Me Jobs', reason: `Found ${jobs.length} jobs at ${url}` });
    return jobs;
  } finally {
    await page.close();
  }
}

async function scrapeTradeMe() {
  const location = getSetting('scraper_location') || 'Christchurch';
  const techKw   = getSetting('scraper_keywords_tech') || '';
  const hospKw   = getSetting('scraper_keywords_hospitality') || '';

  const { browser, context } = await launchBrowser();
  try {
    const urls = [
      ...buildTradeMeUrls(techKw, location),
      ...buildTradeMeUrls(hospKw, location),
    ];
    const all = [];
    for (const url of urls) {
      const jobs = await scrapeTradeMeUrl(context, url).catch(err => {
        log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-ERROR', source: 'Trade Me Jobs', reason: err.message });
        return [];
      });
      all.push(...jobs);
    }
    return all.map(j => ({ ...j, source: 'Trade Me Jobs' }));
  } finally {
    await browser.close();
  }
}


function saveJobsToDB(jobs) {
  const db = getDb();
  let saved = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, location, source, source_url, status, job_category, job_type, posting_date)
    VALUES (?, ?, ?, ?, ?, 'New', ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      if (!j.title) continue;
      const exists = db.prepare('SELECT id FROM jobs WHERE title = ? AND company = ? AND source = ?')
        .get(j.title, j.company || '', j.source);
      if (!exists) {
        insert.run(j.title, j.company || '', j.location || '', j.source, j.url || '', autoTag(j.title), normaliseJobType(j.job_type), j.posting_date || '');
        saved++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
  }
  return saved;
}

async function runScrape(sources = ['Seek', 'Trade Me Jobs']) {
  const disabledStr = getSetting('disabled_sources') || '{}';
  const disabled = JSON.parse(disabledStr);

  const scrapers = { Seek: scrapeSeek, 'Trade Me Jobs': scrapeTradeMe };
  const results = {};

  for (const src of sources) {
    if (disabled[src]) { results[src] = { skipped: true }; continue; }
    const scraper = scrapers[src];
    if (!scraper) continue;

    log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-START', source: src });
    const jobs = await scraper();
    const saved = saveJobsToDB(jobs);
    log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-DONE', source: src, reason: `${jobs.length} found, ${saved} new` });
    setSetting(`last_sync_${src}`, new Date().toISOString());
    results[src] = { found: jobs.length, saved };
  }

  return results;
}

module.exports = { runScrape };
