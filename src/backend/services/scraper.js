// Playwright-based scraper scaffold for NZ job sites
// Full scraping requires `npx playwright install chromium` after npm install

const { getDb, getSetting } = require('../db/database');
const { log } = require('./logger');
const { autoTag } = require('./autoTag');

async function scrapeSeek() {
  const results = [];
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.seek.co.nz/jobs?where=All-New-Zealand&classification=1209', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-automation="normalJob"]', { timeout: 10000 }).catch(() => {});

    const jobs = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-automation="normalJob"]')];
      return cards.slice(0, 20).map(c => ({
        title:   c.querySelector('[data-automation="jobTitle"]')?.textContent?.trim() || '',
        company: c.querySelector('[data-automation="jobCompany"]')?.textContent?.trim() || '',
        location:c.querySelector('[data-automation="jobLocation"]')?.textContent?.trim() || '',
        url:     c.querySelector('a[data-automation="jobTitle"]')?.href || '',
      }));
    });

    await browser.close();
    results.push(...jobs.map(j => ({ ...j, source: 'Seek' })));
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Seek', reason: err.message });
  }
  return results;
}

async function scrapeTradeMe() {
  const results = [];
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.trademe.co.nz/a/jobs', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tm-jobs-search-card', { timeout: 10000 }).catch(() => {});

    const jobs = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.tm-jobs-search-card')];
      return cards.slice(0, 20).map(c => ({
        title:   c.querySelector('.tm-jobs-search-card__title')?.textContent?.trim() || '',
        company: c.querySelector('.tm-jobs-search-card__subtitle')?.textContent?.trim() || '',
        location:c.querySelector('.tm-jobs-search-card__location')?.textContent?.trim() || '',
        url:     c.querySelector('a')?.href || '',
      }));
    });

    await browser.close();
    results.push(...jobs.map(j => ({ ...j, source: 'Trade Me Jobs' })));
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Trade Me Jobs', reason: err.message });
  }
  return results;
}

async function scrapeJora() {
  const results = [];
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://nz.jora.com/', { waitUntil: 'domcontentloaded' });
    await browser.close();
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Jora', reason: err.message });
  }
  return results;
}

async function scrapeIndeed() {
  const results = [];
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://nz.indeed.com/jobs', { waitUntil: 'domcontentloaded' });
    await browser.close();
  } catch (err) {
    log({ type: 'scraper', trigger: 'AUTO', action: 'SCRAPE-ERROR', source: 'Indeed', reason: err.message });
  }
  return results;
}

function saveJobsToDB(jobs) {
  const db = getDb();
  let saved = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, location, source, source_url, status, job_category)
    VALUES (?, ?, ?, ?, ?, 'Shortlisted', ?)
  `);

  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      if (!j.title) continue;
      const exists = db.prepare('SELECT id FROM jobs WHERE title = ? AND company = ? AND source = ?')
        .get(j.title, j.company || '', j.source);
      if (!exists) {
        insert.run(j.title, j.company || '', j.location || '', j.source, j.url || '', autoTag(j.title));
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
    results[src] = { found: jobs.length, saved };
  }

  return results;
}

module.exports = { runScrape };
