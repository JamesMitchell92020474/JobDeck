const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, getSetting } = require('../db/database');
const { log } = require('../services/logger');
const { scoreFit, generateCoverLetter, jobChat } = require('../services/ai');
const { autoTag } = require('../services/autoTag');

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
  const { title, company, location, source, source_url, description, salary, job_type, deadline } = req.body;
  const job_category = autoTag(title, description);
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO jobs (title, company, location, source, source_url, description, salary, job_type, deadline, status, job_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Shortlisted', ?)
  `).run(title, company||'', location||'', source||'Manual', source_url||'', description||'', salary||'', job_type||'', deadline||'', job_category);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(r.lastInsertRowid);
  log({ type: 'activity', trigger: 'MANUAL', action: 'ADDED', jobTitle: title, company, source: source || 'Manual' });
  res.json(job);
});

// GET /api/jobs/:id
router.get('/:id', (req, res) => {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.skills_gaps = job.skills_gaps ? JSON.parse(job.skills_gaps) : [];
  const files = getDb().prepare('SELECT * FROM job_files WHERE job_id = ? ORDER BY created_at DESC').all(req.params.id);
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
    const filename = `CoverLetter_${(job.company||'').replace(/\s/g,'_')}_${Date.now()}.pdf`;
    const filePath = await exportCoverLetterPDF(html || `<p>${job.cover_letter}</p>`, dir, filename);

    const stat = require('fs').statSync(filePath);
    const db = getDb();
    db.prepare('INSERT INTO job_files (job_id, filename, original_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, filename, filename, 'pdf', stat.size, filePath);

    log({ type: 'activity', trigger: 'MANUAL', action: 'COVER-LETTER-EXPORTED-PDF', jobTitle: job.title, company: job.company });
    res.json({ filename, path: filePath });
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
    const filename = `CoverLetter_${(job.company||'').replace(/\s/g,'_')}_${Date.now()}.docx`;
    const filePath = await exportCoverLetterDocx(html || job.cover_letter || '', dir, filename);

    const stat = require('fs').statSync(filePath);
    const db = getDb();
    db.prepare('INSERT INTO job_files (job_id, filename, original_name, file_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, filename, filename, 'docx', stat.size, filePath);

    log({ type: 'activity', trigger: 'MANUAL', action: 'COVER-LETTER-EXPORTED-WORD', jobTitle: job.title, company: job.company });
    res.json({ filename, path: filePath });
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

// DELETE /api/jobs/:id/files/:fileId
router.delete('/:id/files/:fileId', (req, res) => {
  const file = getDb().prepare('SELECT * FROM job_files WHERE id = ? AND job_id = ?').get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(file.file_path); } catch {}
  getDb().prepare('DELETE FROM job_files WHERE id = ?').run(req.params.fileId);
  res.json({ ok: true });
});

module.exports = router;
