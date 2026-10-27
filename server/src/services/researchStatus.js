/**
 * Research Status: an honest summary of how far validation has progressed.
 * Counts only non-demo records. "Validated" is never automatic — the research team must review
 * the evidence and mark the problem as validated themselves (stored in settings).
 */
import { db } from '../db/index.js';

export const TARGETS = { students: 50, professionals: 15 };

export async function getSetting(key, fallback = null) {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key, value) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getResearchStatus() {
  const { rows: [c] } = await db.query(
    `SELECT (SELECT count(*)::int FROM student_validation_responses WHERE data_origin <> 'demo') AS students,
            (SELECT count(*)::int FROM professional_responses WHERE data_origin <> 'demo') AS professionals,
            (SELECT count(*)::int FROM professional_responses WHERE data_origin = 'demo') AS demo_professionals,
            (SELECT count(*)::int FROM job_postings WHERE data_origin <> 'demo') AS postings,
            (SELECT count(*)::int FROM job_postings WHERE data_origin = 'demo') AS demo_postings`,
  );
  const decision = await getSetting('problem_validation_decision', null);

  let problem;
  if (decision?.status === 'validated') problem = 'Validated';
  else if (decision?.status === 'not_validated') problem = 'Not validated';
  else if (c.students === 0) problem = 'Pending';
  else problem = 'In Progress';

  const professional = c.professionals === 0 ? 'Pending' : c.professionals < TARGETS.professionals ? 'In Progress' : 'Available';
  const jobMarket = c.postings > 0 ? 'Imported' : 'Pending';

  return {
    problemValidation: {
      status: problem,
      responses: c.students,
      target: TARGETS.students,
      decision,
      note: problem === 'Pending' ? 'Validation data will be populated through student research.' : null,
    },
    professionalData: { status: professional, responses: c.professionals, target: TARGETS.professionals, demoResponses: c.demo_professionals },
    jobMarketData: { status: jobMarket, postings: c.postings, demoPostings: c.demo_postings },
    usingDemoData: c.demo_postings + c.demo_professionals > 0,
  };
}
