const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { getSetting } = require('../db/database');

const router = express.Router();

// POST /api/export/backup
router.post('/backup', (req, res) => {
  try {
    const backupDir = process.env.BACKUP_PATH || path.join('D:', 'JobDeck', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(backupDir, `jd-backup-${date}.zip`);

    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => res.json({ path: outPath, size: archive.pointer() }));
    archive.on('error', (e) => res.status(500).json({ error: e.message }));

    archive.pipe(output);

    const dataPath = process.env.DATA_PATH || path.join('D:', 'JobDeck', 'data');
    if (fs.existsSync(dataPath)) archive.directory(dataPath, 'data');

    archive.finalize();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cover-letter-template
router.get('/cover-letter-template', (req, res) => {
  const { getDb } = require('../db/database');
  const row = getDb().prepare('SELECT content FROM cover_letter_template WHERE id = 1').get();
  res.json({ content: row?.content || '' });
});

// PUT /api/cover-letter-template
router.put('/cover-letter-template', (req, res) => {
  const { content } = req.body;
  const { getDb } = require('../db/database');
  getDb().prepare("INSERT OR REPLACE INTO cover_letter_template (id, content, updated_at) VALUES (1, ?, datetime('now'))").run(content);
  res.json({ ok: true });
});

module.exports = router;
