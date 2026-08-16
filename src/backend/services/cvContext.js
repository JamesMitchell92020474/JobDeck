// Shared helper for resolving which CV text to hand to the AI for a given job.
// Used by both the jobs routes and the scraper (background scoring).
const { getSetting } = require('../db/database');

// Returns all uploaded CVs, labelled, with the category-matched one flagged as the primary
// match. Used for chat, interviews, cover letters, and scoring so the AI can draw on
// cross-category experience (e.g. customer service history relevant to a "general" role).
function allCvsForJob(job) {
  const label1 = getSetting('cv_label_1') || 'CV Profile 1';
  const label2 = getSetting('cv_label_2') || 'CV Profile 2';
  const tech   = getSetting('cv_text_tech') || '';
  const hosp   = getSetting('cv_text_hospitality') || '';
  const generic = getSetting('cv_text') || '';

  const parts = [];
  if (tech) parts.push(`${label1} CV${job.job_category === 'tech' ? ' (primary match for this role)' : ''}:\n${tech}`);
  if (hosp) parts.push(`${label2} CV${job.job_category === 'hospitality' ? ' (primary match for this role)' : ''}:\n${hosp}`);
  if (!tech && !hosp && generic) parts.push(`CV:\n${generic}`);
  return parts.join('\n\n---\n\n');
}

module.exports = { allCvsForJob };
