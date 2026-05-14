// This file contains all the functions that talk to Claude (Anthropic's AI).
// Each function builds a prompt, sends it to the API, and returns the response.
// The API key is read from the environment variable or from the settings table.
const Anthropic = require('@anthropic-ai/sdk');
const { getSetting } = require('../db/database');

// Creates and returns an Anthropic API client using the stored API key.
// Called at the start of every AI function so the key is always fresh.
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY || getSetting('api_key') || '';
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

// Returns the user's display name from settings, falling back to "the candidate"
// if no name has been configured yet.
function userName() {
  return getSetting('display_name') || 'the candidate';
}

// The two Claude model IDs used across the app.
// Sonnet is faster and cheaper; Opus is more powerful and used for deep analysis.
const SONNET = 'claude-sonnet-4-20250514';
const OPUS   = 'claude-opus-4-20250514';

// A simple helper that sends a single message to Claude and returns the text reply.
// Used by functions that don't need a back-and-forth conversation history.
async function complete(prompt, { model = SONNET, system } = {}) {
  const client = getClient();
  const messages = [{ role: 'user', content: prompt }];
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system,    // optional system prompt that sets Claude's behaviour
    messages,
  });
  return res.content[0].text;
}

// Generates the personalised welcome message shown at the top of the Dashboard.
// Receives current job pipeline stats and optional weather data, then asks
// Claude to write a 1–2 sentence encouraging update.
//
// "displayName" — the user's name from Settings.
// "weather"     — { temp, desc, city } from Open-Meteo, or null if unavailable.
async function generateWelcome(stats, displayName, weather = null) {
  const { new: newCount, interested, applied, interview, offer, upcomingDeadlines } = stats;
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const month    = new Date().getMonth() + 1; // getMonth() returns 0–11, so add 1
  // Work out the current season for the Southern Hemisphere (opposite to the North).
  const season   = month >= 3 && month <= 5 ? 'autumn'
                 : month >= 6 && month <= 8 ? 'winter'
                 : month >= 9 && month <= 11 ? 'spring'
                 : 'summer';
  // Only include weather in the prompt if we successfully fetched it.
  const weatherLine = weather
    ? `Current weather in ${weather.city || 'your area'}: ${weather.temp}°C, ${weather.desc}.`
    : '';

  const prompt = `Write a warm, concise 1-2 sentence job search status update addressed directly to ${displayName} (use "you/your", not third person).
Current stats: ${newCount} new jobs awaiting review, ${interested} shortlisted, ${applied} applied, ${interview} in interview, ${offer} offers. Upcoming deadlines: ${upcomingDeadlines} in next 7 days.
Time of day: ${greeting}. Season: ${season} (Southern Hemisphere — NZ). ${weatherLine} Be specific and encouraging but not sycophantic. You may weave in the weather or season naturally if it fits, but don't force it.
Do NOT open with a greeting or the user's name — go straight to the job summary. Output plain text only, no markdown.`;

  return complete(prompt);
}

// Scores a job description against the user's CV and extracts key information.
// Returns a JSON object with: fit_score, summary, skills_gaps, deadline, description_summary.
//
// All five fields are extracted in a single API call to save cost and time.
// The result is saved to the job in the database by the calling route.
async function scoreFit(jobDescription, cvText) {
  const prompt = `You are an expert career advisor. Analyse this job description against the candidate's CV.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CV:
${cvText}

Return a JSON object with exactly these fields:
{
  "fit_score": <integer 0-100>,
  "summary": "<2-3 sentence match summary, written in second person addressing the user directly — use 'you/your', not the candidate's name or third person>",
  "skills_gaps": ["<gap 1>", "<gap 2>"],
  "deadline": "<closing/application date as written in the ad e.g. '30 May 2025', or null if not mentioned>",
  "description_summary": "<1-2 sentence plain text overview of the role and its key requirements, written independently of the candidate>"
}
Return only valid JSON, no markdown.`;

  const raw = await complete(prompt);
  // Parse the JSON string Claude returned into a proper JavaScript object.
  return JSON.parse(raw);
}

// Generates a cover letter for a specific job using the user's CV and template.
// The template is optional — a sensible default is used if none is saved.
async function generateCoverLetter(job, cvText, template) {
  const name    = getSetting('display_name') || '';
  const signOff = name ? `Signed ${name.split(' ')[0]}.` : 'Sign off with your name.';
  const prompt = `Write a professional cover letter for the following role. Use the candidate's CV and the template guidance.

ROLE: ${job.title} at ${job.company} in ${job.location || 'NZ'}
JOB DESCRIPTION: ${(job.description || '').slice(0, 2000)}

CANDIDATE CV SUMMARY:
${(cvText || '').slice(0, 3000)}

TEMPLATE / STYLE GUIDANCE:
${template || `Professional, concise. 3 paragraphs. ${signOff}`}

Write the cover letter as plain text. No subject line. Start with the salutation.`;

  return complete(prompt);
}

// Handles messages in the per-job regular chat (not interview mode).
// "messages" is the full conversation history so Claude remembers earlier turns.
// The job description and CV are included in the system prompt so Claude has
// context about what role is being discussed.
async function jobChat(messages, job, cvText) {
  const client = getClient();
  const name   = userName();
  const system = `You are helping ${name} prepare for a job application.
Role: ${job.title} at ${job.company}.
Job description: ${(job.description || '').slice(0, 2000)}
CV summary: ${(cvText || '').slice(0, 2000)}
Be concise, specific, and practically useful.`;

  const res = await client.messages.create({
    model: SONNET,
    max_tokens: 1024,
    system,
    // Map the stored messages to the format the API expects ({ role, content }).
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model: SONNET };
}

// Runs the mock interview conversation.
// Claude acts as a professional interviewer for the specific role.
// The structure is defined in the system prompt:
//   - Opens with "tell me about yourself"
//   - 12–15 questions (behavioural, technical, situational)
//   - Up to 1 follow-up per answer
//   - No mid-interview feedback
//   - Closes professionally, then delivers a full assessment
//
// Each user message may include a metadata header like "[Answer: 45s | 120 words]"
// which Claude uses in the final Communication Style section of the assessment.
async function interviewChat(messages, job, cvText) {
  const client = getClient();
  const name   = userName();
  const system = `You are conducting a realistic mock job interview for ${name}, who is applying for ${job.title} at ${job.company}.

STRUCTURE:
1. Open with a brief professional welcome, then ask: "Could you start by telling me a little about yourself and what draws you to this opportunity?" as your first question.
2. Ask 12–15 substantive questions across behavioural (STAR method), role-specific/technical, and situational types. Draw from the job description and the candidate's background.
3. If a candidate's answer mentions something particularly interesting, unexpected, or vague, you may ask ONE focused follow-up before moving on. Keep total questions including follow-ups under 20.
4. After each answer, do NOT give feedback or evaluation — simply acknowledge naturally (e.g. "Thank you", "Great", "Understood", "Interesting") and move to your next question. Save all evaluation for the end.
5. After 12–15 questions, close the interview professionally: "Thank you so much for coming in today, ${name}. We've really enjoyed learning more about you and your experience. We'll be reviewing all candidates and will be in touch shortly."
6. Immediately after the closing, provide a full written assessment using exactly these headings:

**Overall Impression**
2–3 sentences on your general impression of the candidate.

**Strengths**
Bullet points — what they demonstrated well, with specific examples from their answers.

**Areas for Improvement**
Bullet points — specific, actionable feedback tied to their actual answers.

**Communication Style**
Comment on: conciseness and pacing (using the time data in answer metadata), filler word usage (using filler word counts in answer metadata), clarity, and how their confidence and structure evolved across the interview. Be specific about patterns you noticed.

**Top 3 Tips for the Real Interview**
Three numbered, concrete tips personalised to this candidate's specific strengths and weaknesses.

ANSWER METADATA: Each candidate message may begin with a header like "[Answer: 1m 12s | 95 words | Filler words: "um" x4, "like" x2]". Use this data to inform the Communication Style section of your assessment, but do not reference or comment on it during the interview itself — only in the final assessment.

Job description: ${(job.description || '').slice(0, 2000)}
Candidate CV: ${(cvText || '').slice(0, 2000)}`;

  const res = await client.messages.create({
    model: SONNET,
    max_tokens: 1024,
    system,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model: SONNET };
}

// Handles the global chat — a conversation about the user's entire job search,
// not tied to any specific listing.
//
// "context" is the full job pipeline summary (built from the database and passed
// in from the frontend, which caches it to avoid re-querying on every message).
//
// "useOpus" switches to the more powerful model when the user enables Deep Analysis.
//
// Prompt caching: the system prompt is sent as a special block that Anthropic
// caches for 5 minutes. After the first message, subsequent turns in the same
// session pay roughly 10% of the normal input token cost for the cached portion.
async function globalChat(messages, context, useOpus = false) {
  const client = getClient();
  const model  = useOpus ? OPUS : SONNET;
  const name   = userName();

  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        // The system prompt includes the full job pipeline so Claude can discuss
        // specific listings, compare opportunities, and give tailored advice.
        text: `You are a personal job search assistant for ${name}.\n${context}\nBe concise and practically useful.`,
        // This tells Anthropic to cache this block — saves cost on long conversations.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model };
}

module.exports = { complete, generateWelcome, scoreFit, generateCoverLetter, jobChat, interviewChat, globalChat, SONNET, OPUS };
