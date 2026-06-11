const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { setSetting, getSetting } = require('../db/database');
const { log } = require('../services/logger');

const router = express.Router();

function cvDir() {
  const dir = path.join(process.env.DATA_PATH || path.join(os.homedir(), 'JobDeck', 'data'), 'uploads', 'cv');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => cb(null, cvDir()),
    filename: (_req, file, cb) => cb(null, `CV_${Date.now()}${path.extname(file.originalname)}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/cv/upload?profile=tech|hospitality
router.post('/upload', upload.single('cv'), async (req, res) => {
  const { originalname, filename, size, path: filePath } = req.file;
  const profile = ['tech', 'hospitality'].includes(req.query.profile) ? req.query.profile : null;
  const suffix  = profile ? `_${profile}` : '';

  let cvText = '';
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    cvText = parsed.text;
  } catch {}

  const prev = getSetting(`cv_filename${suffix}`);
  setSetting(`cv_filename${suffix}`, originalname);
  setSetting(`cv_path${suffix}`,     filePath);
  setSetting(`cv_size${suffix}`,     String(size));
  setSetting(`cv_uploaded_at${suffix}`, new Date().toISOString());
  setSetting(`cv_text${suffix}`,     cvText);

  log({
    type: 'activity', trigger: 'MANUAL', action: prev ? 'CV-REPLACED' : 'CV-UPLOADED',
    reason: `${profile ? `[${profile}] ` : ''}${originalname} (${Math.round(size / 1024)} KB)`,
  });

  res.json({ filename: originalname, size, uploadedAt: new Date().toISOString(), profile });
});

// DELETE /api/cv?profile=tech|hospitality
router.delete('/', (req, res) => {
  const profile = ['tech', 'hospitality'].includes(req.query.profile) ? req.query.profile : null;
  const suffix  = profile ? `_${profile}` : '';
  const p = getSetting(`cv_path${suffix}`);
  if (p) try { fs.unlinkSync(p); } catch {}
  setSetting(`cv_filename${suffix}`, '');
  setSetting(`cv_path${suffix}`,     '');
  setSetting(`cv_size${suffix}`,     '');
  setSetting(`cv_uploaded_at${suffix}`, '');
  setSetting(`cv_text${suffix}`,     '');
  log({ type: 'activity', trigger: 'MANUAL', action: 'CV-REMOVED', reason: profile || 'generic' });
  res.json({ ok: true });
});

module.exports = router;
