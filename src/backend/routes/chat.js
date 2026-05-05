const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { globalChat } = require('../services/ai');

const router = express.Router();

// GET /api/chat
router.get('/', (req, res) => {
  const msgs = getDb().prepare('SELECT * FROM global_chat ORDER BY created_at ASC').all();
  res.json(msgs);
});

// POST /api/chat
router.post('/', async (req, res) => {
  const { content, deep_analysis } = req.body;
  const db = getDb();

  db.prepare('INSERT INTO global_chat (role, content) VALUES (?, ?)').run('user', content);

  try {
    const history = db.prepare('SELECT role, content FROM global_chat ORDER BY created_at ASC').all();
    const jobCount = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE is_soft_deleted = 0').get().n;
    const cvText   = getSetting('cv_text') || '';
    const userName = getSetting('display_name') || 'James';
    const context  = `${userName}'s job search: ${jobCount} active jobs. CV available: ${cvText ? 'yes' : 'no'}.`;

    const { text, model } = await globalChat(history, context, !!deep_analysis);
    db.prepare('INSERT INTO global_chat (role, content, model, is_deep_analysis) VALUES (?, ?, ?, ?)')
      .run('assistant', text, model, deep_analysis ? 1 : 0);
    res.json({ role: 'assistant', content: text, model, is_deep_analysis: !!deep_analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chat
router.delete('/', (req, res) => {
  getDb().prepare('DELETE FROM global_chat').run();
  res.json({ ok: true });
});

module.exports = router;
