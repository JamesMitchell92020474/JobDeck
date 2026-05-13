const Anthropic = require('@anthropic-ai/sdk');
const { getSetting } = require('../db/database');

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY || getSetting('api_key') || '';
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

function userName() {
  return getSetting('display_name') || 'the candidate';
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

async function generateWelcome(stats, displayName, weather = null) {
  const { new: newCount, interested, applied, interview, offer, upcomingDeadlines } = stats;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const month = new Date().getMonth() + 1; // 1-12
  const season = month >= 3 && month <= 5 ? 'autumn' : month >= 6 && month <= 8 ? 'winter' : month >= 9 && month <= 11 ? 'spring' : 'summer';
  const weatherLine = weather ? `Current weather in ${weather.city || 'your area'}: ${weather.temp}°C, ${weather.desc}.` : '';

  const prompt = `Write a warm, concise 1-2 sentence job search status update addressed directly to ${displayName} (use "you/your", not third person).
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
  "deadline": "<closing/application date as written in the ad e.g. '30 May 2025', or null if not mentioned>",
  "description_summary": "<1-2 sentence plain text overview of the role and its key requirements, written independently of the candidate>"
}
Return only valid JSON, no markdown.`;

  const raw = await complete(prompt);
  return JSON.parse(raw);
}

async function generateCoverLetter(job, cvText, template) {
  const name = getSetting('display_name') || '';
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

async function jobChat(messages, job, cvText) {
  const client = getClient();
  const name = userName();
  const system = `You are helping ${name} prepare for a job application.
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

async function interviewChat(messages, job, cvText) {
  const client = getClient();
  const name = userName();
  const system = `You are conducting a mock job interview for ${name}, who is applying for the role of ${job.title} at ${job.company}.

Your goal is to help ${name} prepare for the real interview. Rules:
- Ask ONE question at a time — never ask multiple questions in one turn
- After the candidate answers, give 1-2 sentences of specific, constructive feedback, then ask the next question
- Mix question types: behavioural (STAR method), role-specific/technical, and situational
- Draw questions from the job description and the candidate's background where relevant
- After 5-7 questions, wrap up with a brief overall assessment and 2-3 concrete improvement tips
- Keep a professional but encouraging tone — you're a supportive interviewer, not adversarial

If this is the opening message, introduce yourself briefly, then ask your first question.

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

async function globalChat(messages, context, useOpus = false) {
  const client = getClient();
  const model = useOpus ? OPUS : SONNET;
  const name = userName();

  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: `You are a personal job search assistant for ${name}.\n${context}\nBe concise and practically useful.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return { text: res.content[0].text, model };
}

module.exports = { complete, generateWelcome, scoreFit, generateCoverLetter, jobChat, interviewChat, globalChat, SONNET, OPUS };
