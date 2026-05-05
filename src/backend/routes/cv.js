const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { setSetting, getSetting } = require('../db/database');
const { log } = require('../services/logger');

const router = express.Router();

function cvDir() {
  const dir = path.join(process.env.DATA_PATH || 'D:\\JobDeck\\data', 'uploads', 'cv');
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

// POST /api/cv/upload
router.post('/upload', upload.single('cv'), async (req, res) => {
  const { originalname, filename, size, path: filePath } = req.file;

  let cvText = '';
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    cvText = parsed.text;
  } catch {}

  const prev = getSetting('cv_filename');
  setSetting('cv_filename', originalname);
  setSetting('cv_path', filePath);
  setSetting('cv_size', String(size));
  setSetting('cv_uploaded_at', new Date().toISOString());
  setSetting('cv_text', cvText);

  log({
    type: 'activity', trigger: 'MANUAL', action: prev ? 'CV-REPLACED' : 'CV-UPLOADED',
    reason: `${originalname} (${Math.round(size / 1024)} KB)`,
  });

  res.json({ filename: originalname, size, uploadedAt: new Date().toISOString() });
});

// DELETE /api/cv
router.delete('/', (req, res) => {
  const p = getSetting('cv_path');
  if (p) try { fs.unlinkSync(p); } catch {}
  setSetting('cv_filename', '');
  setSetting('cv_path', '');
  setSetting('cv_size', '');
  setSetting('cv_uploaded_at', '');
  setSetting('cv_text', '');
  log({ type: 'activity', trigger: 'MANUAL', action: 'CV-REMOVED' });
  res.json({ ok: true });
});

module.exports = router;
