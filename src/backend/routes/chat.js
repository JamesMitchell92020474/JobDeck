// API routes for the global chat feature.
// "Global" means it covers the user's whole job search, not one specific job.
//
// Routes defined here are mounted at /api/chat in server.js, so:
//   router.get('/sessions') handles GET /api/chat/sessions
//   router.post('/')        handles POST /api/chat
// etc.
const express = require('express');
const { getDb, getSetting } = require('../db/database');
const { globalChat } = require('../services/ai');

// express.Router() creates a mini app just for these routes.
const router = express.Router();

// Builds the job context string that gets sent to Claude as part of every chat message.
// This tells Claude what jobs are currently in the pipeline so it can give relevant advice.
//
// The frontend fetches this once when the chat page loads and then passes it back
// with each message — so the database is only queried once per page load, not once
// per message.
function buildContext(db) {
  const userName = getSetting('display_name') || '';
  const cvTech   = getSetting('cv_text_tech') || '';
  const cvHosp   = getSetting('cv_text_hospitality') || '';
  const cvGeneric = getSetting('cv_text') || '';
  const label1   = getSetting('cv_label_1') || 'CV Profile 1';
  const label2   = getSetting('cv_label_2') || 'CV Profile 2';

  // Fetch up to 60 active jobs, ordered by pipeline stage (Interview first, then Applied, etc.)
  // so the most important jobs appear at the top of the context.
  const jobs = db.prepare(`
    SELECT title, company, location, status, fit_score, job_category, deadline, description_summary, description
    FROM jobs WHERE is_soft_deleted = 0
    ORDER BY
      CASE status WHEN 'Interview' THEN 1 WHEN 'Applied' THEN 2 WHEN 'Interested' THEN 3
                  WHEN 'New' THEN 4 WHEN 'Offer' THEN 5 ELSE 6 END,
      fit_score DESC
    LIMIT 60
  `).all();

  // Format each job as a single readable line for the AI.
  const jobLines = jobs.map(j => {
    const score    = j.fit_score != null ? ` · fit ${j.fit_score}%` : '';
    const deadline = j.deadline ? ` · deadline ${j.deadline}` : '';
    const cat      = j.job_category ? ` [${j.job_category}]` : '';
    // Prefer the AI-generated short summary; fall back to the first 300 chars of the
    // raw description with HTML tags stripped out.
    const desc     = j.description_summary
      ? '\n  ' + j.description_summary
      : j.description
        ? '\n  ' + j.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
        : '';
    return `- ${j.title} at ${j.company}, ${j.location || 'NZ'} — ${j.status}${cat}${score}${deadline}${desc}`;
  }).join('\n');

  // Include full CV text (not just a "yes/no" flag) so Claude can actually reference it
  // instead of asking the user to paste it in. Cached via cache_control, so the extra
  // tokens are cheap on later turns in the same session.
  const cvSections = [];
  if (cvTech) cvSections.push(`${label1} CV:\n${cvTech}`);
  if (cvHosp) cvSections.push(`${label2} CV:\n${cvHosp}`);
  if (!cvTech && !cvHosp && cvGeneric) cvSections.push(`CV:\n${cvGeneric}`);
  const cvBlock = cvSections.length
    ? cvSections.join('\n\n')
    : `No CV is on file for ${userName || 'the user'}. If CV-based advice is needed, tell them to upload one under Settings → CV Profiles rather than asking them to paste it here.`;

  return `${userName}'s active job pipeline (${jobs.length} jobs):
${jobLines || 'No active jobs.'}

${cvBlock}`;
}

// GET /api/chat/sessions
// Returns a list of the user's chat sessions, newest first, max 20.
// Each row includes a message count so the frontend can display it.
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

// POST /api/chat/sessions
// Creates a new empty session with a blank name.
// The name is set automatically when the user sends their first message.
router.post('/sessions', (req, res) => {
  const r = getDb().prepare("INSERT INTO global_chat_sessions (name) VALUES ('')").run();
  // Fetch the newly created row so we can return its full data (including the auto-assigned ID).
  const session = getDb().prepare('SELECT * FROM global_chat_sessions WHERE id = ?').get(r.lastInsertRowid);
  res.json(session);
});

// PATCH /api/chat/sessions/:id
// Renames a session. Called when the user edits the session name in the header.
router.patch('/sessions/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  getDb().prepare('UPDATE global_chat_sessions SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/chat/sessions/:id
// Deletes a session and all its messages.
// Because the global_chat table has ON DELETE CASCADE, deleting the session
// row automatically removes all associated messages too.
router.delete('/sessions/:id', (req, res) => {
  getDb().prepare('DELETE FROM global_chat_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/chat/context
// Returns the job pipeline context string for the frontend to cache.
// The frontend calls this once when the chat page loads, stores the result,
// and passes it with every subsequent message to avoid repeated DB queries.
router.get('/context', (req, res) => {
  res.json({ context: buildContext(getDb()) });
});

// GET /api/chat?session_id=N
// Returns all messages for a specific session, oldest first (so the conversation
// reads top-to-bottom chronologically).
router.get('/', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.json([]);
  const msgs = getDb().prepare('SELECT * FROM global_chat WHERE session_id = ? ORDER BY created_at ASC').all(session_id);
  res.json(msgs);
});

// POST /api/chat
// Sends a user message and gets Claude's reply.
// Body: { content, session_id, context (optional), deep_analysis (optional) }
//
// "context" is the job pipeline string cached by the frontend.
//   If it's not provided, we rebuild it from the database as a fallback.
// "deep_analysis" switches to the more powerful Opus model.
router.post('/', async (req, res) => {
  const { content, deep_analysis, context: clientContext, session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const db      = getDb();
  const session = db.prepare('SELECT * FROM global_chat_sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Save the user's message to the database first.
  db.prepare('INSERT INTO global_chat (session_id, role, content) VALUES (?, ?, ?)').run(session_id, 'user', content);

  // Auto-name the session after the first user message (truncated to 60 characters).
  let session_name = session.name || null;
  if (!session.name) {
    session_name = content.trim().slice(0, 60) + (content.trim().length > 60 ? '…' : '');
    db.prepare('UPDATE global_chat_sessions SET name = ? WHERE id = ?').run(session_name, session_id);
  }

  try {
    // Fetch the full conversation history so Claude has context for its reply.
    const history = db.prepare('SELECT role, content FROM global_chat WHERE session_id = ? ORDER BY created_at ASC').all(session_id);
    // Use the cached context from the frontend, or build it fresh if not provided.
    const context = clientContext || buildContext(db);

    const { text, model } = await globalChat(history, context, !!deep_analysis);

    // Save Claude's reply to the database.
    db.prepare('INSERT INTO global_chat (session_id, role, content, model, is_deep_analysis) VALUES (?, ?, ?, ?, ?)')
      .run(session_id, 'assistant', text, model, deep_analysis ? 1 : 0);

    // Return the reply plus the session name (in case it was just auto-set above).
    res.json({ role: 'assistant', content: text, model, is_deep_analysis: !!deep_analysis, session_name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
