const { getDb, getSetting, setSetting } = require('../db/database');
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

      const jobTypeSels  = ['[data-automation="jobWorkType"]', '[data-automation="workType"]', '[class*="workType"]', '[class*="work-type"]'];
      const postedSels   = ['[data-automation="jobListingDate"]', '[data-automation="jobDate"]', '[class*="listed-date"]', 'time'];

      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:        pick(c, titleSels),
        company:      pick(c, companySels),
        location:     pick(c, locationSels),
        url:          pickHref(c, titleSels),
        job_type:     pick(c, jobTypeSels),
        posting_date: pick(c, postedSels),
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

async function scrapeTradeMe() {
  const location = getSetting('scraper_location') || 'Christchurch';
  const techKw   = getSetting('scraper_keywords_tech') || '';
  const hospKw   = getSetting('scraper_keywords_hospitality') || '';
  const allKw    = [...new Set([
    ...techKw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 3),
    ...hospKw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 3),
  ])];
  const searchQuery = allKw.length ? allKw[0] : '';
  const url = searchQuery
    ? `https://www.trademe.co.nz/a/jobs?search_string=${encodeURIComponent(searchQuery)}&region=${encodeURIComponent(location)}`
    : 'https://www.trademe.co.nz/a/jobs';

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const cardSel = await Promise.race([
      page.waitForSelector('.tm-jobs-search-card', { timeout: 8000 }).then(() => '.tm-jobs-search-card').catch(() => null),
      page.waitForSelector('[data-testid="job-card"]', { timeout: 8000 }).then(() => '[data-testid="job-card"]').catch(() => null),
      page.waitForSelector('tm-job-listing', { timeout: 8000 }).then(() => 'tm-job-listing').catch(() => null),
    ]);

    if (!cardSel) {
      log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-WARN', source: 'Trade Me Jobs', reason: 'No job cards found' });
      return [];
    }

    const jobs = await page.evaluate((sel) => {
      const titleSels    = ['.tm-jobs-search-card__title', '[class*="title"]', 'h2', 'h3'];
      const companySels  = ['.tm-jobs-search-card__subtitle', '[class*="company"]', '[class*="employer"]'];
      const locationSels = ['.tm-jobs-search-card__location', '[class*="location"]', '[class*="region"]'];

      const pick = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.textContent?.trim()) return found.textContent.trim();
        }
        return '';
      };

      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:    pick(c, titleSels),
        company:  pick(c, companySels),
        location: pick(c, locationSels),
        url:      c.querySelector('a')?.href || '',
      })).filter(j => j.title);
    }, cardSel);

    return jobs.map(j => ({ ...j, source: 'Trade Me Jobs' }));
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Trade Me Jobs', reason: err.message });
    return [];
  } finally {
    await page.close();
    await browser.close();
  }
}

async function scrapeJora() {
  const location = getSetting('scraper_location') || 'Christchurch';
  const techKw   = getSetting('scraper_keywords_tech') || '';
  const hospKw   = getSetting('scraper_keywords_hospitality') || '';
  const kw = (techKw + ',' + hospKw).split(',').map(k => k.trim()).filter(Boolean)[0] || '';
  const url = `https://nz.jora.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(location)}`;

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const cardSel = await Promise.race([
      page.waitForSelector('article.job-card', { timeout: 8000 }).then(() => 'article.job-card').catch(() => null),
      page.waitForSelector('[data-automation="jobCard"]', { timeout: 8000 }).then(() => '[data-automation="jobCard"]').catch(() => null),
      page.waitForSelector('.job-card', { timeout: 8000 }).then(() => '.job-card').catch(() => null),
    ]);

    if (!cardSel) {
      log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-WARN', source: 'Jora', reason: 'No job cards found' });
      return [];
    }

    const jobs = await page.evaluate((sel) => {
      const pick = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.textContent?.trim()) return found.textContent.trim();
        }
        return '';
      };
      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:    pick(c, ['[class*="title"]', 'h2', 'h3', 'a']),
        company:  pick(c, ['[class*="company"]', '[class*="employer"]', '[class*="advertiser"]']),
        location: pick(c, ['[class*="location"]', '[class*="suburb"]']),
        url:      c.querySelector('a')?.href || '',
      })).filter(j => j.title);
    }, cardSel);

    return jobs.map(j => ({ ...j, source: 'Jora' }));
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Jora', reason: err.message });
    return [];
  } finally {
    await page.close();
    await browser.close();
  }
}

async function scrapeIndeed() {
  const location = getSetting('scraper_location') || 'Christchurch';
  const techKw   = getSetting('scraper_keywords_tech') || '';
  const hospKw   = getSetting('scraper_keywords_hospitality') || '';
  const kw = (techKw + ',' + hospKw).split(',').map(k => k.trim()).filter(Boolean)[0] || '';
  const url = `https://nz.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(location)}`;

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const cardSel = await Promise.race([
      page.waitForSelector('.job_seen_beacon', { timeout: 8000 }).then(() => '.job_seen_beacon').catch(() => null),
      page.waitForSelector('[data-jk]', { timeout: 8000 }).then(() => '[data-jk]').catch(() => null),
      page.waitForSelector('.jobsearch-ResultsList li', { timeout: 8000 }).then(() => '.jobsearch-ResultsList li').catch(() => null),
    ]);

    if (!cardSel) {
      log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-WARN', source: 'Indeed', reason: 'No job cards found' });
      return [];
    }

    const jobs = await page.evaluate((sel) => {
      const pick = (el, sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.textContent?.trim()) return found.textContent.trim();
        }
        return '';
      };
      return [...document.querySelectorAll(sel)].slice(0, 25).map(c => ({
        title:    pick(c, ['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobTitle a', 'h2 a', 'h2']),
        company:  pick(c, ['[data-testid="company-name"]', '.companyName', '[class*="company"]']),
        location: pick(c, ['[data-testid="text-location"]', '.companyLocation', '[class*="location"]']),
        url:      c.querySelector('a[id^="job_"]')?.href || c.querySelector('a')?.href || '',
      })).filter(j => j.title);
    }, cardSel);

    return jobs.map(j => ({ ...j, source: 'Indeed' }));
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Indeed', reason: err.message });
    return [];
  } finally {
    await page.close();
    await browser.close();
  }
}

function saveJobsToDB(jobs) {
  const db = getDb();
  let saved = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, location, source, source_url, status, job_category, job_type, posting_date)
    VALUES (?, ?, ?, ?, ?, 'Shortlisted', ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      if (!j.title) continue;
      const exists = db.prepare('SELECT id FROM jobs WHERE title = ? AND company = ? AND source = ?')
        .get(j.title, j.company || '', j.source);
      if (!exists) {
        insert.run(j.title, j.company || '', j.location || '', j.source, j.url || '', autoTag(j.title), j.job_type || '', j.posting_date || '');
        saved++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
  }
  return saved;
}

async function runScrape(sources = ['Seek', 'Trade Me Jobs', 'Jora', 'Indeed']) {
  const disabledStr = getSetting('disabled_sources') || '{}';
  const disabled = JSON.parse(disabledStr);

  const scrapers = { Seek: scrapeSeek, 'Trade Me Jobs': scrapeTradeMe, Jora: scrapeJora, Indeed: scrapeIndeed };
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
