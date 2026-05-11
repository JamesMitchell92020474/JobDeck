const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, getSetting } = require('../db/database');
const { log } = require('../services/logger');
const { scoreFit, generateCoverLetter, jobChat } = require('../services/ai');
const { autoTag } = require('../services/autoTag');

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

function cvForJob(job) {
  const cat = job.job_category;
  if (cat === 'tech')        return getSetting('cv_text_tech')        || getSetting('cv_text') || '';
  if (cat === 'hospitality') return getSetting('cv_text_hospitality') || getSetting('cv_text') || '';
  return getSetting('cv_text_tech') || getSetting('cv_text_hospitality') || getSetting('cv_text') || '';
}
const { exportCoverLetterPDF } = require('../services/pdfExport');
const { exportCoverLetterDocx } = require('../services/wordExport');

const router = express.Router();

function uploadsDir(sub) {
  const base = path.join(process.env.DATA_PATH || 'D:\\JobDeck\\data', 'uploads', sub);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => cb(null, uploadsDir('attachments')),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// GET /api/jobs
router.get('/', (req, res) => {
  const { status, source, q, min_fit, max_fit, include_deleted } = req.query;
  let sql = 'SELECT * FROM jobs WHERE 1=1';
  const params = [];

  if (!include_deleted) { sql += ' AND is_soft_deleted = 0'; }
  if (status)   { sql += ' AND status = ?';                params.push(status); }
  if (source)   { sql += ' AND source = ?';                params.push(source); }
  if (min_fit)  { sql += ' AND fit_score >= ?';            params.push(Number(min_fit)); }
  if (max_fit)  { sql += ' AND fit_score <= ?';            params.push(Number(max_fit)); }
  if (q) {
    sql += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY created_at DESC';

  const jobs = getDb().prepare(sql).all(...params).map(j => ({
    ...j,
    skills_gaps: j.skills_gaps ? JSON.parse(j.skills_gaps) : [],
  }));
  res.json(jobs);
});

// POST /api/jobs
router.post('/', (req, res) => {
  const { title, company, location, source, source_url, description, salary, job_type,
          deadline, posting_date, expiry_date, is_remote, is_hybrid, status, job_category: reqCategory } = req.body;
  const VALID_STATUSES = ['Shortlisted','Applied','Interview','Offer','Rejected','Archived'];
  const resolvedStatus = VALID_STATUSES.includes(status) ? status : 'Shortlisted';
  const job_category = reqCategory || autoTag(title, description);
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO jobs (title, company, location, source, source_url, description, salary, job_type,
                      deadline, posting_date, expiry_date, is_remote, is_hybrid, status, job_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, company||'', location||'', source||'Manual', source_url||'', description||'',
         salary||'', job_type||'', deadline||'', posting_date||'', expiry_date||'',
         is_remote?1:0, is_hybrid?1:0, resolvedStatus, job_category);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(r.lastInsertRowid);
  log({ type: 'activity', trigger: 'MANUAL', action: 'ADDED', jobTitle: title, company, source: source || 'Manual' });
  res.json(job);
});

// GET /api/jobs/:id
router.get('/:id', (req, res) => {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.skills_gaps = job.skills_gaps ? JSON.parse(job.skills_gaps) : [];
  const allFiles = getDb().prepare('SELECT * FROM job_files WHERE job_id = ? ORDER BY created_at DESC').all(req.params.id);
  // Remove DB records for files deleted outside the app
  const files = allFiles.filter(f => {
    if (fs.existsSync(f.file_path)) return true;
    getDb().prepare('DELETE FROM job_files WHERE id = ?').run(f.id);
    return false;
  });
  res.json({ ...job, files });
});

// PUT /api/jobs/:id
router.put('/:id', (req, res) => {
  const fields = ['title','company','location','source','source_url','description','salary','job_type',
    'deadline','calendar_reminder','notes','cover_letter','status','fit_score','ai_summary','skills_gaps','job_category'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (f in req.body) {
      updates.push(`${f} = ?`);
      params.push(f === 'skills_gaps' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  getDb().prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
});

// PUT /api/jobs/:id/move
router.put('/:id/move', (req, res) => {
  const { status } = req.body;
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  getDb().prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  log({ type: 'activity', trigger: 'MANUAL', action: 'MOVED', jobTitle: job.title, company: job.company, source: job.source, reason: `Moved to ${status}` });
  res.json({ ok: true });
});

// DELETE /api/jobs/:id
router.delete('/:id', (req, res) => {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  log({ type: 'activity', trigger: 'MANUAL', action: 'DELETED', jobTitle: job.title, company: job.company });
  res.json({ ok: true });
});

// POST /api/jobs/:id/ai-score  (score a job against the CV)
router.post('/:id/ai-score', async (req, res) => {
  try {
    const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const cvText = cvForJob(job);
    const result = await scoreFit(job.description || job.title, cvText);
    getDb().prepare(`
      UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?, updated_at = datetime('now') WHERE id = ?
    `).run(result.fit_score, result.summary, JSON.stringify(result.skills_gaps || []), req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/jobs/:id/chat
router.get('/:id/chat', (req, res) => {
  const msgs = getDb().prepare('SELECT * FROM job_chat WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(msgs);
});

// POST /api/jobs/:id/chat
router.post('/:id/chat', async (req, res) => {
  const { content } = req.body;
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  db.prepare('INSERT INTO job_chat (job_id, role, content) VALUES (?, ?, ?)').run(req.params.id, 'user', content);

  try {
    const history = db.prepare('SELECT role, content FROM job_chat WHERE job_id = ? ORDER BY created_at ASC').all(req.params.id);
    const cvText = cvForJob(job);
    const { text, model } = await jobChat(history, job, cvText);
    db.prepare('INSERT INTO job_chat (job_id, role, content, model) VALUES (?, ?, ?, ?)').run(req.params.id, 'assistant', text, model);
    res.json({ role: 'assistant', content: text, model });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/jobs/:id/cover-letter  (generate)
router.post('/:id/cover-letter', async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  try {
    const cvText  = cvForJob(job);
    const tmpl    = db.prepare('SELECT content FROM cover_letter_template WHERE id = 1').get();
    const text    = await generateCoverLetter(job, cvText, tmpl?.content || '');
    db.prepare("UPDATE jobs SET cover_letter = ?, updated_at = datetime('now') WHERE id = ?").run(text, req.params.id);
    log({ type: 'activity', trigger: 'MANUAL', action: 'COVER-LETTER-GENERATED', jobTitle: job.title, company: job.company });
    res.json({ content: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/jobs/:id/export-pdf
router.post('/:id/export-pdf', async (req, res) => {
  const { html } = req.body;
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  try {
    const dir = uploadsDir('cover-letters');
    const dateStr = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
    const filename = `CoverLetter_${(job.company||'').replace(/\s/g,'_')}_${dateStr}.pdf`;
    const filePath = await exportCoverLetterPDF(html || `<p>${job.cover_letter}</p>`, dir, filename);

    const stat = require('fs').statSync(filePath);
    const db = getDb();
    const insert = db.prepare('INSERT INTO job_files (job_id, filename, original_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, filename, filename, 'application/pdf', stat.size, filePath);
    const fileRecord = db.prepare('SELECT * FROM job_files WHERE id = ?').get(insert.lastInsertRowid);

    log({ type: 'activity', trigger: 'MANUAL', action: 'COVER-LETTER-EXPORTED-PDF', jobTitle: job.title, company: job.company });
    res.json({ filename, path: filePath, file: fileRecord });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/jobs/:id/export-word
router.post('/:id/export-word', async (req, res) => {
  const { html } = req.body;
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  try {
    const dir = uploadsDir('cover-letters');
    const dateStr = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
    const filename = `CoverLetter_${(job.company||'').replace(/\s/g,'_')}_${dateStr}.docx`;
    const filePath = await exportCoverLetterDocx(html || job.cover_letter || '', dir, filename);

    const stat = require('fs').statSync(filePath);
    const db = getDb();
    const insert = db.prepare('INSERT INTO job_files (job_id, filename, original_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, filename, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', stat.size, filePath);
    const fileRecord = db.prepare('SELECT * FROM job_files WHERE id = ?').get(insert.lastInsertRowid);

    log({ type: 'activity', trigger: 'MANUAL', action: 'COVER-LETTER-EXPORTED-WORD', jobTitle: job.title, company: job.company });
    res.json({ filename, path: filePath, file: fileRecord });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/jobs/:id/files
router.post('/:id/files', fileUpload.single('file'), (req, res) => {
  const { originalname, filename, mimetype, size, path: filePath } = req.file;
  getDb().prepare('INSERT INTO job_files (job_id, filename, original_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, filename, originalname, mimetype, size, filePath);
  const job = getDb().prepare('SELECT title, company FROM jobs WHERE id = ?').get(req.params.id);
  log({ type: 'activity', trigger: 'MANUAL', action: 'FILE-ATTACHED', jobTitle: job?.title, company: job?.company, reason: originalname });
  res.json({ filename, originalname, size, filePath });
});

// POST /api/jobs/:id/fetch-description — scrape description from source_url on demand
router.post('/:id/fetch-description', async (req, res) => {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (!job.source_url) return res.status(400).json({ error: 'No source URL for this job' });

  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  let description = '';
  let logoUrl     = '';
  let postingDate = '';
  let jobType     = '';
  let salary      = '';

  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(job.source_url, { waitUntil: 'load', timeout: 45000 });
    // Give JS-rendered content a moment to settle after load
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      const KEEP_TAGS = new Set(['p','ul','ol','li','strong','b','em','i','h1','h2','h3','h4','br','a']);

      function cleanEl(el) {
        // Resolve obscured contacts
        el.querySelectorAll('a[href^="tel:"]').forEach(a => {
          a.textContent = decodeURIComponent(a.href.replace('tel:', '').trim()) || a.textContent;
        });
        el.querySelectorAll('a[href^="mailto:"]').forEach(a => {
          a.textContent = decodeURIComponent(a.href.replace('mailto:', '').split('?')[0].trim()) || a.textContent;
        });

        // Remove junk elements
        el.querySelectorAll('script,style,button,input,select,form,svg,img,[class*="apply"],[class*="button"],[class*="social"],[class*="share"]').forEach(n => n.remove());

        // Convert block-level elements to <p> before stripping so line breaks survive
        const BLOCK_TAGS = new Set(['div','section','article','header','footer','aside','main','figure','figcaption']);
        el.querySelectorAll([...BLOCK_TAGS].join(',')).forEach(node => {
          const p = document.createElement('p');
          while (node.firstChild) p.appendChild(node.firstChild);
          node.parentNode?.replaceChild(p, node);
        });

        // Walk the tree and strip remaining disallowed tags (keep their children)
        const unwrap = node => {
          if (node.nodeType === 1 && !KEEP_TAGS.has(node.tagName.toLowerCase())) {
            const parent = node.parentNode;
            if (parent) {
              while (node.firstChild) parent.insertBefore(node.firstChild, node);
              parent.removeChild(node);
            }
          }
        };
        [...el.querySelectorAll('*')].reverse().forEach(unwrap);

        // Strip all attributes except href on <a>
        el.querySelectorAll('*').forEach(n => {
          [...n.attributes].forEach(attr => {
            if (!(n.tagName === 'A' && attr.name === 'href')) n.removeAttribute(attr.name);
          });
        });

        // Collapse 3+ consecutive empty <p> tags down to one
        let empties = 0;
        [...el.querySelectorAll('p')].forEach(p => {
          if (!p.textContent.trim()) { empties++; if (empties > 1) p.remove(); }
          else empties = 0;
        });

        return el.innerHTML.trim();
      }

      // Posting date, job type, salary from detail page
      const postedEl = document.querySelector('[data-automation="job-detail-date"]') ||
                       document.querySelector('[data-automation="jobPostDate"]') ||
                       document.querySelector('[data-automation="jobListingDate"]') ||
                       document.querySelector('time[datetime]') ||
                       document.querySelector('time');

      function resolveDate(el) {
        if (!el) return '';
        // Prefer machine-readable datetime attribute
        const iso = el.getAttribute('datetime');
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
        // Fall back to text — convert relative strings to real dates
        const txt = el.textContent.trim();
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) {
          const d = new Date();
          d.setDate(d.getDate() - parseInt(dMatch[1]));
          return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        const hMatch = txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i);
        if (hMatch) return new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        return txt;
      }
      const postingDate = resolveDate(postedEl);

      const jobTypeEl = document.querySelector('[data-automation="job-detail-work-type"]') ||
                        document.querySelector('[data-automation="workType"]') ||
                        document.querySelector('[class*="workType"]');
      const jobType = jobTypeEl?.textContent?.trim() || '';

      const salaryEl = document.querySelector('[data-automation="job-detail-salary"]') ||
                       document.querySelector('[data-automation="salary"]') ||
                       document.querySelector('[class*="salary"]') ||
                       document.querySelector('[class*="Salary"]');
      const rawSalary = salaryEl?.textContent?.trim() || '';
      // Only keep if it looks like an actual salary figure (contains $ or digits with k/hr/year)
      const salary = /(\$[\d,]+|[\d,]+k|\d+\s*(per\s*(hour|hr|year|annum|pa)|p\.h\.|p\.a\.))/i.test(rawSalary) ? rawSalary : '';

      // Logo — scoped to the job header only to avoid picking up logos from
      // featured/recommended jobs sections further down the page
      const jobHeader = document.querySelector('[data-automation="job-detail-header"]') ||
                        document.querySelector('[data-automation="jobDetailsHeader"]') ||
                        document.querySelector('[data-automation="job-detail-page"]')?.firstElementChild ||
                        document.querySelector('main > *:first-child') ||
                        document.querySelector('header');
      const scope = jobHeader || document;
      const logoEl = scope.querySelector('[data-automation="company-logo"] img') ||
                     scope.querySelector('[class*="CompanyLogo"] img') ||
                     scope.querySelector('[class*="company-logo"] img') ||
                     scope.querySelector('[class*="companyLogo"] img') ||
                     scope.querySelector('img[src*="logo"]') ||
                     scope.querySelector('img[src*="company"]');
      const logoUrl = logoEl?.src || '';

      // Description
      const seekDesc = document.querySelector('[data-automation="jobAdDetails"]') ||
                       document.querySelector('[data-automation="job-detail-page-job-description"]');
      if (seekDesc) return { html: cleanEl(seekDesc), logoUrl, postingDate, jobType, salary };

      const tmDesc = document.querySelector('.tm-markdown') ||
                     document.querySelector('[class*="job-description"]');
      if (tmDesc) return { html: cleanEl(tmDesc), logoUrl, postingDate, jobType, salary };

      const generic = document.querySelector('#jobDescriptionText') ||
                      document.querySelector('[class*="description"]') ||
                      document.querySelector('[class*="job-body"]') ||
                      document.querySelector('article') ||
                      document.querySelector('main');
      if (!generic) return { html: '', logoUrl, postingDate, jobType, salary };
      const html = cleanEl(generic);
      return { html: html.length > 12000 ? html.slice(0, 12000) : html, logoUrl, postingDate, jobType, salary };
    });

    description   = result.html;
    logoUrl       = result.logoUrl || '';
    postingDate   = result.postingDate || '';
    jobType       = normaliseJobType(result.jobType || '');
    salary        = result.salary || '';
    await browser.close();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (!description) return res.status(422).json({ error: 'Could not extract description from page' });

  const db2 = getDb();
  db2.prepare(`UPDATE jobs SET description = ?, logo_url = ?,
    ${postingDate ? 'posting_date = ?,' : ''}
    ${jobType && !job.job_type ? 'job_type = ?,' : ''}
    salary = ?,
    updated_at = datetime('now') WHERE id = ?`)
    .run(
      description, logoUrl,
      ...(postingDate ? [postingDate] : []),
      ...(jobType && !job.job_type ? [jobType] : []),
      salary,
      job.id
    );

  // Auto-score in background — don't block the response
  const freshJob = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
  scoreFit(description, cvForJob(freshJob)).then(result => {
    const hasDeadline = freshJob.deadline && freshJob.deadline.trim();
    getDb().prepare(`
      UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?,
        ${!hasDeadline && result.deadline ? 'deadline = ?,' : ''}
        updated_at = datetime('now') WHERE id = ?
    `).run(
      result.fit_score, result.summary, JSON.stringify(result.skills_gaps || []),
      ...(!hasDeadline && result.deadline ? [result.deadline] : []),
      job.id
    );
  }).catch(() => {});

  res.json({ ok: true, description, logoUrl });
});

// GET /api/jobs/:id/files/:fileId/serve — serve file inline or as download
router.get('/:id/files/:fileId/serve', (req, res) => {
  const file = getDb().prepare('SELECT * FROM job_files WHERE id = ? AND job_id = ?').get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: 'File not found on disk' });
  const inline = req.query.download !== '1';
  const disposition = inline ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
  res.setHeader('Content-Length', fs.statSync(file.file_path).size);
  fs.createReadStream(file.file_path).pipe(res);
});

// DELETE /api/jobs/:id/files/:fileId
router.delete('/:id/files/:fileId', (req, res) => {
  const file = getDb().prepare('SELECT * FROM job_files WHERE id = ? AND job_id = ?').get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(file.file_path); } catch {}
  getDb().prepare('DELETE FROM job_files WHERE id = ?').run(req.params.fileId);
  res.json({ ok: true });
});

module.exports = router;
