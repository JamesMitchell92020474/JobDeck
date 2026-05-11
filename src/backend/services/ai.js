const Anthropic = require('@anthropic-ai/sdk');
const { getSetting } = require('../db/database');

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY || getSetting('api_key') || '';
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

const SONNET = 'claude-sonnet-4-20250514';
const OPUS   = 'claude-opus-4-20250514';

async function complete(prompt, { model = SONNET, system } = {}) {
  const client = getClient();
  const messages = [{ role: 'user', content: prompt }];
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
  });
  return res.content[0].text;
}

async function generateWelcome(stats, userName, weather = null) {
  const { new: newCount, interested, applied, interview, offer, upcomingDeadlines } = stats;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const month = new Date().getMonth() + 1; // 1-12
  const season = month >= 3 && month <= 5 ? 'autumn' : month >= 6 && month <= 8 ? 'winter' : month >= 9 && month <= 11 ? 'spring' : 'summer';
  const weatherLine = weather ? `Current weather in Christchurch: ${weather.temp}°C, ${weather.desc}.` : '';

  const prompt = `Write a warm, concise 1-2 sentence job search status update addressed directly to ${userName} (use "you/your", not third person).
Current stats: ${newCount} new jobs awaiting review, ${interested} shortlisted, ${applied} applied, ${interview} in interview, ${offer} offers. Upcoming deadlines: ${upcomingDeadlines} in next 7 days.
Time of day: ${greeting}. Season: ${season} (Southern Hemisphere — NZ). ${weatherLine} Be specific and encouraging but not sycophantic. You may weave in the weather or season naturally if it fits, but don't force it.
Do NOT open with a greeting or the user's name — go straight to the job summary. Output plain text only, no markdown.`;

  return complete(prompt);
}

async function scoreFit(jobDescription, cvText) {
  const prompt = `You are an expert career advisor. Analyse this job description against the candidate's CV.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CV:
${cvText}

Return a JSON object with exactly these fields:
{
  "fit_score": <integer 0-100>,
  "summary": "<2-3 sentence match summary>",
  "skills_gaps": ["<gap 1>", "<gap 2>"],
  "deadline": "<closing/application date as written in the ad e.g. '30 May 2025', or null if not mentioned>"
}
Return only valid JSON, no markdown.`;

  const raw = await complete(prompt);
  return JSON.parse(raw);
}

async function generateCoverLetter(job, cvText, template) {
  const prompt = `Write a professional cover letter for the following role. Use the candidate's CV and the template guidance.

ROLE: ${job.title} at ${job.company} in ${job.location || 'NZ'}
JOB DESCRIPTION: ${(job.description || '').slice(0, 2000)}

CANDIDATE CV SUMMARY:
${(cvText || '').slice(0, 3000)}

TEMPLATE / STYLE GUIDANCE:
${template || 'Professional, concise, NZ context. 3 paragraphs. Signed James.'}

Write the cover letter as plain text. No subject line. Start with the salutation.`;

  return complete(prompt);
}

async function jobChat(messages, job, cvText) {
  const client = getClient();
  const system = `You are helping James Mitchell prepare for a job application.
Role: ${job.title} at ${job.company}.
Job description: ${(job.description || '').slice(0, 2000)}
CV summary: ${(cvText || '').slice(0, 2000)}
Be concise, specific, and practically useful.`;

  const res = await client.messages.create({
    model: SONNET,
    max_tokens: 1024,
    system,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model: SONNET };
}

async function globalChat(messages, context, useOpus = false) {
  const client = getClient();
  const model = useOpus ? OPUS : SONNET;
  const system = `You are a personal job search assistant for James Mitchell.
${context}
Be concise and practically useful.`;

  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model };
}

module.exports = { complete, generateWelcome, scoreFit, generateCoverLetter, jobChat, globalChat, SONNET, OPUS };
