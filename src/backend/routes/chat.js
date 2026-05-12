const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { globalChat } = require('../services/ai');

const router = express.Router();

function buildContext(db) {
  const userName = getSetting('display_name') || 'James';
  const cvText   = getSetting('cv_text_tech') || getSetting('cv_text_hospitality') || getSetting('cv_text') || '';

  const jobs = db.prepare(`
    SELECT title, company, location, status, fit_score, job_category, deadline, description_summary, description
    FROM jobs WHERE is_soft_deleted = 0
    ORDER BY
      CASE status WHEN 'Interview' THEN 1 WHEN 'Applied' THEN 2 WHEN 'Interested' THEN 3
                  WHEN 'New' THEN 4 WHEN 'Offer' THEN 5 ELSE 6 END,
      fit_score DESC
    LIMIT 60
  `).all();

  const jobLines = jobs.map(j => {
    const score    = j.fit_score != null ? ` · fit ${j.fit_score}%` : '';
    const deadline = j.deadline ? ` · deadline ${j.deadline}` : '';
    const cat      = j.job_category ? ` [${j.job_category}]` : '';
    const desc     = j.description_summary
      ? '\n  ' + j.description_summary
      : j.description
        ? '\n  ' + j.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
        : '';
    return `- ${j.title} at ${j.company}, ${j.location || 'NZ'} — ${j.status}${cat}${score}${deadline}${desc}`;
  }).join('\n');

  return `${userName}'s active job pipeline (${jobs.length} jobs):
${jobLines || 'No active jobs.'}

CV on file: ${cvText ? 'yes' : 'no'}.`;
}

// GET /api/chat/sessions — list sessions newest first, max 20
router.get('/sessions', (req, res) => {
  const sessions = getDb().prepare(`
    SELECT s.id, s.name, s.created_at,
           COUNT(m.id) as message_count
    FROM global_chat_sessions s
    LEFT JOIN global_chat m ON m.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 20
  `).all();
  res.json(sessions);
});

// POST /api/chat/sessions — create a new empty session
router.post('/sessions', (req, res) => {
  const r = getDb().prepare("INSERT INTO global_chat_sessions (name) VALUES ('')").run();
  const session = getDb().prepare('SELECT * FROM global_chat_sessions WHERE id = ?').get(r.lastInsertRowid);
  res.json(session);
});

// PATCH /api/chat/sessions/:id — rename a session
router.patch('/sessions/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  getDb().prepare('UPDATE global_chat_sessions SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/chat/sessions/:id — delete session and all its messages
router.delete('/sessions/:id', (req, res) => {
  getDb().prepare('DELETE FROM global_chat_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/chat/context — fetch job context once at session start
router.get('/context', (req, res) => {
  res.json({ context: buildContext(getDb()) });
});

// GET /api/chat — messages for a session
router.get('/', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.json([]);
  const msgs = getDb().prepare('SELECT * FROM global_chat WHERE session_id = ? ORDER BY created_at ASC').all(session_id);
  res.json(msgs);
});

// POST /api/chat — send a message
router.post('/', async (req, res) => {
  const { content, deep_analysis, context: clientContext, session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM global_chat_sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare('INSERT INTO global_chat (session_id, role, content) VALUES (?, ?, ?)').run(session_id, 'user', content);

  // Auto-name session from the first user message
  let session_name = session.name || null;
  if (!session.name) {
    session_name = content.trim().slice(0, 60) + (content.trim().length > 60 ? '…' : '');
    db.prepare('UPDATE global_chat_sessions SET name = ? WHERE id = ?').run(session_name, session_id);
  }

  try {
    const history  = db.prepare('SELECT role, content FROM global_chat WHERE session_id = ? ORDER BY created_at ASC').all(session_id);
    const context  = clientContext || buildContext(db);
    const { text, model } = await globalChat(history, context, !!deep_analysis);
    db.prepare('INSERT INTO global_chat (session_id, role, content, model, is_deep_analysis) VALUES (?, ?, ?, ?, ?)')
      .run(session_id, 'assistant', text, model, deep_analysis ? 1 : 0);
    res.json({ role: 'assistant', content: text, model, is_deep_analysis: !!deep_analysis, session_name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
