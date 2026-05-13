// API routes for everything to do with individual job listings.
// Mounted at /api/jobs in server.js.
const express = require('express');
const multer  = require('multer');  // handles file uploads
const path    = require('path');
const fs      = require('fs');
const { getDb, getSetting } = require('../db/database');
const { log }               = require('../services/logger');
const { scoreFit, generateCoverLetter, jobChat, interviewChat } = require('../services/ai');
const { autoTag }           = require('../services/autoTag');
const { fetchDescriptionPage, normaliseJobType } = require('../services/fetchDescription');
const { fetchDescriptionsForNewJobs }            = require('../services/scraper');
const { exportCoverLetterPDF }  = require('../services/pdfExport');
const { exportCoverLetterDocx } = require('../services/wordExport');

// Returns the appropriate CV text for a given job based on its category.
// Tech jobs use the tech CV; hospitality jobs use the hospitality CV.
// Falls back to the generic CV if the category-specific one isn't uploaded.
function cvForJob(job) {
  const cat = job.job_category;
  if (cat === 'tech')        return getSetting('cv_text_tech')        || getSetting('cv_text') || '';
  if (cat === 'hospitality') return getSetting('cv_text_hospitality') || getSetting('cv_text') || '';
  return getSetting('cv_text_tech') || getSetting('cv_text_hospitality') || getSetting('cv_text') || '';
}

const router = express.Router();

// Returns the path to a subfolder inside the uploads directory, creating it if needed.
// e.g. uploadsDir('attachments') → D:\JobDeck\data\uploads\attachments
function uploadsDir(sub) {
  const base = path.join(process.env.DATA_PATH || 'D:\\JobDeck\\data', 'uploads', sub);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

// Configures multer to save uploaded files to the attachments folder
// with a timestamp prepended to the filename to avoid collisions.
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => cb(null, uploadsDir('attachments')),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// GET /api/jobs
// Returns a filtered list of jobs. Optional query parameters:
//   ?status=Applied  — only jobs in that pipeline stage
//   ?source=Seek     — only jobs from that source
//   ?q=react         — search title, company, and description
//   ?min_fit=50      — only jobs with a fit score of 50 or above
//   ?include_deleted — include soft-deleted jobs (normally hidden)
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
// Creates a new job listing. Used by the Add Job modal.
// Auto-tags the job category (tech/hospitality/null) from the title if not specified.
router.post('/', (req, res) => {
  const { title, company, location, source, source_url, description, salary, job_type,
          deadline, posting_date, expiry_date, is_remote, is_hybrid, status, job_category: reqCategory } = req.body;
  const VALID_STATUSES = ['New','Interested','Applied','Interview','Offer','Rejected','Archived'];
  const resolvedStatus = VALID_STATUSES.includes(status) ? status : 'Interested';
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

// Flag to prevent two fetch-and-score background processes running at once.
let descFetchInProgress = false;

// POST /api/jobs/filter-new
// The "Filter with AI" button calls this. It:
//  1. Scores any New jobs that have a description but no score yet
//  2. Archives any New job with a fit score below the threshold (default 40)
//  3. Kicks off a background Playwright fetch for New jobs that still have no description
// Returns counts so the UI can show what happened.
router.post('/filter-new', async (req, res) => {
  const threshold = parseInt(getSetting('ai_filter_threshold') || '40', 10);
  const db = getDb();
  const newJobs = db.prepare('SELECT * FROM jobs WHERE status = ? AND is_soft_deleted = 0').all('New');
  if (newJobs.length === 0) return res.json({ archived: [], kept: 0, scored: 0, fetching: 0 });

  const archived = [];
  let scored = 0;

  for (const job of newJobs) {
    let fitScore = job.fit_score;

    if (fitScore == null && job.description) {
      try {
        const cvText = cvForJob(job);
        if (cvText) {
          const result = await scoreFit(job.description, cvText);
          fitScore = result.fit_score;
          db.prepare(`UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?, description_summary = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(result.fit_score, result.summary, JSON.stringify(result.skills_gaps || []), result.description_summary || null, job.id);
          scored++;
        }
      } catch {}
    }

    if (fitScore != null && fitScore < threshold) {
      db.prepare("UPDATE jobs SET status = 'Archived', updated_at = datetime('now') WHERE id = ?").run(job.id);
      log({ type: 'activity', trigger: 'AI', action: 'ARCHIVED', jobTitle: job.title, company: job.company, source: job.source, reason: `AI filter: fit score ${fitScore} below threshold ${threshold}` });
      archived.push({ id: job.id, title: job.title, company: job.company, fit_score: fitScore });
    }
  }

  // Kick off background description fetching for New jobs that have no description yet
  const undescribed = newJobs.filter(j => !j.description && j.source_url && !archived.find(a => a.id === j.id));
  if (undescribed.length > 0 && !descFetchInProgress) {
    descFetchInProgress = true;
    const { chromium } = require('playwright');
    chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] }).then(async browser => {
      const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
      return fetchDescriptionsForNewJobs(context, undescribed).finally(() => browser.close());
    }).finally(() => { descFetchInProgress = false; }).catch(() => {});
  }

  res.json({
    archived,
    kept: newJobs.length - archived.length,
    scored,
    fetching: undescribed.length,
    fetchInProgress: descFetchInProgress && undescribed.length === 0,
  });
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
      UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?, description_summary = ?, updated_at = datetime('now') WHERE id = ?
    `).run(result.fit_score, result.summary, JSON.stringify(result.skills_gaps || []), result.description_summary || null, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/jobs/:id/chat-context
// Returns the CV text for a specific job. The frontend calls this once when a job card
// is opened and then passes the CV text with every subsequent chat message, avoiding
// repeated database reads.
router.get('/:id/chat-context', (req, res) => {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json({ cvText: cvForJob(job) });
});

// GET /api/jobs/:id/chat?mode=chat|interview
// Returns the chat history for a job. "mode" separates the regular chat
// from the mock interview conversation (they have separate histories).
router.get('/:id/chat', (req, res) => {
  const mode = req.query.mode || 'chat';
  const msgs = getDb().prepare('SELECT * FROM job_chat WHERE job_id = ? AND mode = ? ORDER BY created_at ASC').all(req.params.id, mode);
  res.json(msgs);
});

// POST /api/jobs/:id/chat
// Sends a message in the per-job chat and returns Claude's reply.
// Body: { content, mode, cvText (optional), answerMeta (optional, interview only) }
//
// For interview mode, each user message is enriched with a metadata header
// (e.g. "[Answer: 45s | 120 words | Filler words: "um" x3]") before being
// sent to Claude. This metadata is stored in the database but only shown
// to Claude — the frontend displays the clean transcript without it.
router.post('/:id/chat', async (req, res) => {
  const { content, mode = 'chat', cvText: clientCvText, answerMeta } = req.body;
  const db  = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  // Store the user's message. "answerMeta" is JSON containing timing and filler-word
  // data collected by the frontend during interview mode.
  const metaJson = mode === 'interview' && answerMeta ? JSON.stringify(answerMeta) : null;
  db.prepare('INSERT INTO job_chat (job_id, role, content, mode, answer_meta) VALUES (?, ?, ?, ?, ?)').run(req.params.id, 'user', content, mode, metaJson);

  try {
    // Use the CV text passed from the frontend, or look it up from the database.
    const cvText = clientCvText ?? cvForJob(job);

    let history;
    if (mode === 'interview') {
      // For interview mode, fetch the history including metadata and format it
      // so Claude can see timing and filler-word info for the final assessment.
      const raw = db.prepare('SELECT role, content, answer_meta FROM job_chat WHERE job_id = ? AND mode = ? ORDER BY created_at ASC').all(req.params.id, mode);
      history = raw.map(m => {
        if (m.role === 'user' && m.answer_meta) {
          try {
            const meta  = JSON.parse(m.answer_meta);
            const parts = [];
            if (meta.duration != null) {
              const min = Math.floor(meta.duration / 60), sec = meta.duration % 60;
              parts.push(min > 0 ? `${min}m ${sec}s` : `${sec}s`);
            }
            if (meta.wordCount) parts.push(`${meta.wordCount} words`);
            if (meta.fillerWords && Object.keys(meta.fillerWords).length > 0) {
              const fs = Object.entries(meta.fillerWords).map(([w, n]) => `"${w}" x${n}`).join(', ');
              parts.push(`Filler words: ${fs}`);
            }
            // Prepend the metadata header to the message text.
            if (parts.length) return { role: m.role, content: `[Answer: ${parts.join(' | ')}]\n${m.content}` };
          } catch {}
        }
        return { role: m.role, content: m.content };
      });
    } else {
      // Regular chat: just fetch the plain message history.
      history = db.prepare('SELECT role, content FROM job_chat WHERE job_id = ? AND mode = ? ORDER BY created_at ASC').all(req.params.id, mode);
    }

    // Call the appropriate AI function based on whether this is an interview or regular chat.
    const { text, model: aiModel } = mode === 'interview'
      ? await interviewChat(history, job, cvText)
      : await jobChat(history, job, cvText);

    db.prepare('INSERT INTO job_chat (job_id, role, content, model, mode) VALUES (?, ?, ?, ?, ?)').run(req.params.id, 'assistant', text, aiModel, mode);
    res.json({ role: 'assistant', content: text, model: aiModel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/jobs/:id/interview-runs
// Returns a list of saved interview transcripts for a job, newest first.
// Only returns a short preview (first 200 characters) for the list view —
// the full transcript is fetched separately when the user expands a run.
router.get('/:id/interview-runs', (req, res) => {
  const runs = getDb().prepare(
    'SELECT id, created_at, substr(transcript, 1, 200) as preview FROM job_interview_runs WHERE job_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(runs);
});

// GET /api/jobs/:id/interview-runs/:runId
// Returns the full transcript for a single saved interview run.
router.get('/:id/interview-runs/:runId', (req, res) => {
  const run = getDb().prepare('SELECT * FROM job_interview_runs WHERE id = ? AND job_id = ?').get(req.params.runId, req.params.id);
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

// POST /api/jobs/:id/interview-runs/save
// Saves the current interview session as a plain-text transcript, then deletes
// the live messages so the next interview starts fresh.
// The transcript is formatted with speaker names and timestamps in the header.
router.post('/:id/interview-runs/save', (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  const msgs = db.prepare("SELECT role, content FROM job_chat WHERE job_id = ? AND mode = 'interview' ORDER BY created_at ASC").all(req.params.id);
  if (msgs.length === 0) return res.status(400).json({ error: 'No interview to save' });

  const userName = getSetting('display_name') || 'Candidate';
  const lines = msgs.map(m => {
    const speaker = m.role === 'user' ? userName : 'Interviewer';
    return `${speaker}:\n${m.content}`;
  });
  const header = `Mock Interview — ${job.title} at ${job.company}\nDate: ${new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n${'─'.repeat(60)}\n\n`;
  const transcript = header + lines.join('\n\n');

  db.prepare('INSERT INTO job_interview_runs (job_id, transcript) VALUES (?, ?)').run(req.params.id, transcript);
  db.prepare("DELETE FROM job_chat WHERE job_id = ? AND mode = 'interview'").run(req.params.id);

  res.json({ ok: true });
});

// DELETE /api/jobs/:id/interview-runs/:runId
router.delete('/:id/interview-runs/:runId', (req, res) => {
  getDb().prepare('DELETE FROM job_interview_runs WHERE id = ? AND job_id = ?').run(req.params.runId, req.params.id);
  res.json({ ok: true });
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

  let description = '';
  let logoUrl     = '';
  let postingDate = '';
  let jobType     = '';
  let salary      = '';

  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    try {
      const result = await fetchDescriptionPage(context, job.source_url);
      description = result.html;
      logoUrl     = result.logoUrl || '';
      postingDate = result.postingDate || '';
      jobType     = normaliseJobType(result.jobType || '');
      salary      = result.salary || '';
    } finally {
      await browser.close();
    }
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
      UPDATE jobs SET fit_score = ?, ai_summary = ?, skills_gaps = ?, description_summary = ?,
        ${!hasDeadline && result.deadline ? 'deadline = ?,' : ''}
        updated_at = datetime('now') WHERE id = ?
    `).run(
      result.fit_score, result.summary, JSON.stringify(result.skills_gaps || []), result.description_summary || null,
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
