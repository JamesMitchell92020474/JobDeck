const { getDb, getSetting, setSetting } = require('../db/database');
const { fetchDescriptionPage, normaliseJobType } = require('./fetchDescription');
const { scoreFit } = require('./ai');
const { log } = require('./logger');
const { autoTag } = require('./autoTag');
const { allCvsForJob } = require('./cvContext');

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
        const fmt = d => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) { const d = new Date(); d.setDate(d.getDate() - parseInt(dMatch[1])); return fmt(d); }
        const wMatch = txt.match(/^(\d+)\s*w(?:eeks?)?\s+ago/i);
        if (wMatch) { const d = new Date(); d.setDate(d.getDate() - parseInt(wMatch[1]) * 7); return fmt(d); }
        const mMatch = txt.match(/^(\d+)\s*m(?:o(?:nths?)?)?\s+ago/i);
        if (mMatch) { const d = new Date(); d.setMonth(d.getMonth() - parseInt(mMatch[1])); return fmt(d); }
        if (txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i) || txt.match(/just\s+posted|today/i)) {
          return fmt(new Date());
        }
        if (txt.match(/30\+?\s*days/i)) { const d = new Date(); d.setDate(d.getDate() - 30); return fmt(d); }
        const listedYesterday = txt.match(/listed\s+yesterday/i);
        if (listedYesterday) { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); }
        const listedToday = txt.match(/listed\s+today/i);
        if (listedToday) return fmt(new Date());
        const listedD = txt.match(/listed\s+(\d+)\s*d(?:ays?)?\s+ago/i);
        if (listedD) { const d = new Date(); d.setDate(d.getDate() - parseInt(listedD[1])); return fmt(d); }
        const listedH = txt.match(/listed\s+(\d+)\s*h(?:ours?)?\s+ago/i);
        if (listedH) return fmt(new Date());
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
    return { jobs: all.map(j => ({ ...j, source: 'Seek' })), browser, context };
  } catch (e) {
    await browser.close();
    throw e;
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
        const fmt = d => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) { const d = new Date(); d.setDate(d.getDate() - parseInt(dMatch[1])); return fmt(d); }
        const wMatch = txt.match(/^(\d+)\s*w(?:eeks?)?\s+ago/i);
        if (wMatch) { const d = new Date(); d.setDate(d.getDate() - parseInt(wMatch[1]) * 7); return fmt(d); }
        const mMatch = txt.match(/^(\d+)\s*m(?:o(?:nths?)?)?\s+ago/i);
        if (mMatch) { const d = new Date(); d.setMonth(d.getMonth() - parseInt(mMatch[1])); return fmt(d); }
        if (txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i) || txt.match(/just\s+posted|today/i)) {
          return fmt(new Date());
        }
        if (txt.match(/30\+?\s*days/i)) { const d = new Date(); d.setDate(d.getDate() - 30); return fmt(d); }
        const listedYesterday = txt.match(/listed\s+yesterday/i);
        if (listedYesterday) { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); }
        const listedToday = txt.match(/listed\s+today/i);
        if (listedToday) return fmt(new Date());
        const listedD = txt.match(/listed\s+(\d+)\s*d(?:ays?)?\s+ago/i);
        if (listedD) { const d = new Date(); d.setDate(d.getDate() - parseInt(listedD[1])); return fmt(d); }
        const listedH = txt.match(/listed\s+(\d+)\s*h(?:ours?)?\s+ago/i);
        if (listedH) return fmt(new Date());
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
    return { jobs: all.map(j => ({ ...j, source: 'Trade Me Jobs' })), browser, context };
  } catch (e) {
    await browser.close();
    throw e;
  }
}


// Keywords that must appear in job location for a given scraper_location setting
const LOCATION_KEYWORDS = {
  christchurch: ['christchurch', 'canterbury', 'selwyn', 'waimakariri'],
  auckland:     ['auckland'],
  wellington:   ['wellington'],
  hamilton:     ['hamilton', 'waikato'],
  tauranga:     ['tauranga', 'bay of plenty'],
  dunedin:      ['dunedin', 'otago'],
};

function locationMatches(jobLocation, configuredLocation) {
  if (!jobLocation || !configuredLocation) return true; // no location data — let it through
  const keywords = LOCATION_KEYWORDS[configuredLocation.toLowerCase().trim()];
  if (!keywords) return true; // unknown location config — don't filter
  const loc = jobLocation.toLowerCase();
  return keywords.some(k => loc.includes(k));
}

function isExcludedByDescription(plainText, category) {
  const toTerms = (raw) => (raw || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const terms = category === 'tech'        ? toTerms(getSetting('scraper_keywords_exclude_tech'))
              : category === 'hospitality' ? toTerms(getSetting('scraper_keywords_exclude_hospitality'))
              : [];
  if (!terms.length) return false;
  const t = plainText.toLowerCase();
  return terms.some(k => t.includes(k));
}

function saveJobsToDB(jobs) {
  const db = getDb();
  const configuredLocation = getSetting('scraper_location') || 'Christchurch';

  const toExcludeTerms = (raw) =>
    (raw || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const excludeTech  = toExcludeTerms(getSetting('scraper_keywords_exclude_tech'));
  const excludeHosp  = toExcludeTerms(getSetting('scraper_keywords_exclude_hospitality'));

  const isExcluded = (title, category) => {
    const t = title.toLowerCase();
    const terms = category === 'tech' ? excludeTech : category === 'hospitality' ? excludeHosp : [];
    return terms.some(k => t.includes(k));
  };

  let saved = 0;
  const newJobs = [];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs (title, company, location, source, source_url, status, job_category, job_type, posting_date)
    VALUES (?, ?, ?, ?, ?, 'New', ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      if (!j.title) continue;
      if (!locationMatches(j.location, configuredLocation)) continue;
      if (normaliseJobType(j.job_type) === 'Casual') continue;
      if (isExcluded(j.title, autoTag(j.title))) continue;
      const exists = db.prepare('SELECT id FROM jobs WHERE title = ? AND company = ? AND source = ?')
        .get(j.title, j.company || '', j.source);
      if (!exists) {
        const info = insert.run(j.title, j.company || '', j.location || '', j.source, j.url || '', autoTag(j.title), normaliseJobType(j.job_type), j.posting_date || '');
        const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
        if (newJob) newJobs.push(newJob);
        saved++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
  }
  return { count: saved, newJobs };
}

async function fetchDescriptionsForNewJobs(context, newJobs) {
  const withUrl = newJobs.filter(j => j.source_url);
  if (!withUrl.length) return;

  log({ type: 'scraper', trigger: 'AUTO', action: 'FETCH-DESC-START', reason: `Fetching descriptions for ${withUrl.length} new jobs` });
  const db = getDb();
  let done = 0;

  for (const job of withUrl) {
    try {
      log({ type: 'scraper', trigger: 'AUTO', action: 'FETCH-DESC-JOB', reason: `[${done + 1}/${withUrl.length}] ${job.title} — ${job.company}` });
      const result = await fetchDescriptionPage(context, job.source_url);
      if (!result.html) { done++; continue; }

      const jobType = normaliseJobType(result.jobType || '');
      db.prepare(`UPDATE jobs SET description = ?, logo_url = ?,
        ${result.companyUrl ? 'company_url = ?,' : ''}
        ${result.postingDate ? 'posting_date = ?,' : ''}
        ${jobType && !job.job_type ? 'job_type = ?,' : ''}
        salary = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(
          result.html, result.logoUrl || '',
          ...(result.companyUrl ? [result.companyUrl] : []),
          ...(result.postingDate ? [result.postingDate] : []),
          ...(jobType && !job.job_type ? [jobType] : []),
          result.salary || '', job.id
        );

      // Strip HTML tags for keyword matching
      const descPlain = result.html.replace(/<[^>]+>/g, ' ');
      if (isExcludedByDescription(descPlain, job.job_category)) {
        db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(job.id);
        log({ type: 'activity', trigger: 'AUTO', action: 'ARCHIVED', jobId: job.id, jobTitle: job.title, company: job.company, source: job.source, reason: 'Exclude keyword found in description' });
        done++;
        continue;
      }

      const cvText = allCvsForJob(job);
      if (cvText) {
        try {
          const scored = await scoreFit(result.html, cvText);
          const hasDeadline = job.deadline && job.deadline.trim();
          db.prepare(`UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?, description_summary = ?,
            ${!hasDeadline && scored.deadline ? 'deadline = ?,' : ''}
            updated_at = datetime('now') WHERE id = ?`)
            .run(
              scored.fit_score, scored.summary, JSON.stringify(scored.skills_gaps || []), scored.description_summary || null,
              ...(!hasDeadline && scored.deadline ? [scored.deadline] : []),
              job.id
            );
        } catch {}
      }
      done++;
    } catch (err) {
      done++;
      log({ type: 'scraper', trigger: 'AUTO', action: 'FETCH-DESC-ERROR', reason: `${job.title}: ${err.message}` });
    }
  }

  // Auto-archive poor fits now that all jobs are scored
  const THRESHOLD = 40;
  const toArchive = db.prepare(
    'SELECT id, title, company, source, fit_score FROM jobs WHERE status = ? AND is_soft_deleted = 0 AND fit_score IS NOT NULL AND fit_score < ?'
  ).all('New', THRESHOLD);
  for (const job of toArchive) {
    db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(job.id);
    log({ type: 'activity', trigger: 'AI', action: 'ARCHIVED', jobTitle: job.title, company: job.company, source: job.source, reason: `AI filter: fit score ${job.fit_score} below threshold ${THRESHOLD}` });
  }

  log({ type: 'scraper', trigger: 'AUTO', action: 'FETCH-DESC-DONE', reason: `Processed ${done}/${withUrl.length} jobs, archived ${toArchive.length} poor fits` });
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
    const { jobs, browser, context } = await scraper();
    const { count: saved, newJobs } = saveJobsToDB(jobs);
    log({ type: 'scraper', trigger: 'MANUAL', action: 'SCRAPE-DONE', source: src, reason: `${jobs.length} found, ${saved} new` });
    setSetting(`last_sync_${src}`, new Date().toISOString());
    results[src] = { found: jobs.length, saved };

    // Fetch descriptions + auto-score in background — browser closes when done
    fetchDescriptionsForNewJobs(context, newJobs).finally(() => browser.close()).catch(() => {});
  }

  return results;
}

module.exports = { runScrape, fetchDescriptionsForNewJobs, isExcludedByDescription };
