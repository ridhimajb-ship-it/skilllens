import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { PROJECT_ROOT } from '../config.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { toCsv } from '../utils/csv.js';
import { getAdminAnalytics, getDataQuality } from '../services/analytics.js';
import { DEFAULT_WEIGHTS, latestRun, runAnalysis } from '../services/scoring.js';
import { getResearchStatus, setSetting } from '../services/researchStatus.js';
import { getTaxonomy, invalidateTaxonomy } from '../services/taxonomy.js';
import { normalizeTerm } from '../services/normalizer.js';
import {
  importJobs, importProfessionals, importStudents, previewJobImport, previewProfessionalImport, previewStudentImport,
} from '../services/importer.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const importSchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  content: z.string().min(1, 'File is empty').max(8 * 1024 * 1024),
  filename: z.string().max(200).optional().nullable(),
  // 'real' = collected by the team from genuine sources with provenance; 'imported' = unverified upload.
  dataOrigin: z.enum(['imported', 'real']).default('imported'),
  analyze: z.boolean().default(true),
});

const weightSchema = z.object({
  industry: z.number().min(0).max(1),
  professional: z.number().min(0).max(1),
  beginner: z.number().min(0).max(1),
}).refine((w) => w.industry + w.professional + w.beginner > 0, { message: 'At least one weight must be positive' });

const analyzeSchema = z.object({
  includeDemo: z.boolean().default(true),
  weights: weightSchema.default(DEFAULT_WEIGHTS),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  role: z.string().max(80).optional(),
  origin: z.enum(['demo', 'imported', 'real']).optional(),
  q: z.string().max(120).optional(),
});

/* -------------------------------------------------------------- analytics */

router.get('/analytics', asyncHandler(async (req, res) => {
  res.json(await getAdminAnalytics());
}));

router.get('/data-quality', asyncHandler(async (req, res) => {
  res.json(await getDataQuality());
}));

/* -------------------------------------------------------------- records */

function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${toCsv(rows, columns)}`);
}

async function queryJobPostings({ role, origin, q }, limit, offset) {
  const where = [];
  const params = [];
  if (role) { params.push(role); where.push(`r.slug = $${params.length}`); }
  if (origin) { params.push(origin); where.push(`jp.data_origin = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(jp.title ILIKE $${params.length} OR jp.company ILIKE $${params.length})`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: [{ n }] } = await db.query(`SELECT count(*)::int AS n FROM job_postings jp LEFT JOIN roles r ON r.id = jp.role_id ${clause}`, params);
  const { rows } = await db.query(
    `SELECT jp.id, jp.company, jp.title, r.name AS role, r.slug AS role_slug, jp.role_match, jp.location,
            to_char(jp.posted_date, 'YYYY-MM-DD') AS posted_date, jp.source, jp.url, jp.experience_text,
            jp.experience_min_years, jp.education, jp.certifications, jp.data_origin, jp.unmapped_terms, jp.description,
            COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM job_posting_skills jps JOIN skills s ON s.id = jps.skill_id
                       WHERE jps.job_posting_id = jp.id), '[]') AS skills
       FROM job_postings jp LEFT JOIN roles r ON r.id = jp.role_id ${clause}
      ORDER BY jp.id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params,
  );
  return { total: n, rows };
}

router.get('/job-postings', validate(pageSchema, 'query'), asyncHandler(async (req, res) => {
  const { page, pageSize, ...filters } = req.valid.query;
  const { total, rows } = await queryJobPostings(filters, pageSize, (page - 1) * pageSize);
  res.json({ total, page, pageSize, rows: rows.map((r) => ({ ...r, description: r.description?.slice(0, 400) })) });
}));

router.get('/job-postings/export.csv', validate(pageSchema, 'query'), asyncHandler(async (req, res) => {
  const { page, pageSize, ...filters } = req.valid.query;
  const { rows } = await queryJobPostings(filters, 50000, 0);
  sendCsv(res, 'skilllens_job_postings.csv', rows, [
    { key: 'id' }, { key: 'company' }, { key: 'title' }, { key: 'role', label: 'role_category' }, { key: 'location' },
    { key: 'posted_date', label: 'posting_date' }, { key: 'source' }, { key: 'url' }, { key: 'skills', label: 'extracted_skills' },
    { key: 'experience_text', label: 'experience' }, { key: 'education' }, { key: 'certifications' }, { key: 'data_origin' },
    { key: 'description' },
  ]);
}));

const professionalQuery = `
  SELECT pr.id, r.name AS role, pr.industry, pr.experience_band, pr.years_experience, pr.beginner_mistakes,
         pr.wish_learned_earlier, pr.work_reality, pr.willing_to_contribute, pr.motivation, pr.other_skills, pr.data_origin,
         to_char(pr.created_at, 'YYYY-MM-DD HH24:MI') AS submitted_at,
         COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM professional_response_skills x JOIN skills s ON s.id = x.skill_id
                    WHERE x.response_id = pr.id AND x.kind = 'uses'), '[]') AS uses,
         COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM professional_response_skills x JOIN skills s ON s.id = x.skill_id
                    WHERE x.response_id = pr.id AND x.kind = 'beginner'), '[]') AS beginner,
         COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM professional_response_skills x JOIN skills s ON s.id = x.skill_id
                    WHERE x.response_id = pr.id AND x.kind = 'overemphasized'), '[]') AS overemphasized
    FROM professional_responses pr JOIN roles r ON r.id = pr.role_id`;

router.get('/professional-responses', asyncHandler(async (req, res) => {
  const origin = ['demo', 'imported', 'real'].includes(req.query.origin) ? req.query.origin : null;
  const { rows } = await db.query(`${professionalQuery} ${origin ? 'WHERE pr.data_origin = $1' : ''} ORDER BY pr.id DESC LIMIT 500`, origin ? [origin] : []);
  res.json({ total: rows.length, rows });
}));

router.get('/professional-responses/export.csv', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`${professionalQuery} ORDER BY pr.id`);
  sendCsv(res, 'skilllens_professional_responses.csv', rows, [
    { key: 'id' }, { key: 'role' }, { key: 'industry' }, { key: 'experience_band' }, { key: 'uses', label: 'skills_used' },
    { key: 'beginner', label: 'beginner_skills' }, { key: 'overemphasized', label: 'overemphasized_skills' },
    { key: 'other_skills' }, { key: 'beginner_mistakes' }, { key: 'wish_learned_earlier' }, { key: 'work_reality' },
    { key: 'willing_to_contribute' }, { key: 'motivation' }, { key: 'data_origin' }, { key: 'submitted_at' },
  ]);
}));

const studentColumns = [
  { key: 'id' }, { key: 'study_year' }, { key: 'field_of_study' }, { key: 'target_role' }, { key: 'decide_methods' },
  { key: 'learned_not_useful' }, { key: 'confusing_part' }, { key: 'confusing_text' }, { key: 'source_count' },
  { key: 'conflicting_advice' }, { key: 'trusted_sources' }, { key: 'would_use_platform' }, { key: 'gap_view_helpful' },
  { key: 'comments' }, { key: 'data_origin' }, { key: 'submitted_at' },
];

router.get('/student-validation', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT *, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS submitted_at FROM student_validation_responses ORDER BY id DESC LIMIT 500`,
  );
  res.json({ total: rows.length, rows });
}));

router.get('/student-validation/export.csv', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT *, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS submitted_at FROM student_validation_responses ORDER BY id`,
  );
  sendCsv(res, 'skilllens_student_validation.csv', rows, studentColumns);
}));

/* -------------------------------------------------------------- imports */

/** Re-run the analysis after an import, keeping the settings of the previous run. */
async function maybeAnalyze(analyze, userId) {
  if (!analyze) return null;
  const previous = await latestRun();
  const { run } = await runAnalysis({
    includeDemo: previous?.params?.includeDemo ?? true,
    weights: previous?.params?.weights ?? DEFAULT_WEIGHTS,
    userId,
  });
  return run;
}

router.post('/import/jobs/preview', validate(importSchema), asyncHandler(async (req, res) => {
  res.json(await previewJobImport(req.valid.body));
}));

router.post('/import/jobs', validate(importSchema), asyncHandler(async (req, res) => {
  const result = await importJobs({ ...req.valid.body, userId: req.user.id });
  const run = await maybeAnalyze(req.valid.body.analyze && result.imported > 0, req.user.id);
  res.status(201).json({ ...result, analysisRunId: run?.id ?? null });
}));

router.post('/import/professional/preview', validate(importSchema), asyncHandler(async (req, res) => {
  res.json(await previewProfessionalImport(req.valid.body));
}));

router.post('/import/professional', validate(importSchema), asyncHandler(async (req, res) => {
  const result = await importProfessionals({ ...req.valid.body, userId: req.user.id });
  const run = await maybeAnalyze(req.valid.body.analyze && result.imported > 0, req.user.id);
  res.status(201).json({ ...result, analysisRunId: run?.id ?? null });
}));

router.post('/import/student-validation/preview', validate(importSchema), asyncHandler(async (req, res) => {
  res.json(await previewStudentImport(req.valid.body));
}));

router.post('/import/student-validation', validate(importSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await importStudents({ ...req.valid.body, userId: req.user.id }));
}));

const TEMPLATES = {
  jobs: 'job_postings_template.csv',
  professional: 'professional_responses_template.csv',
  'student-validation': 'student_validation_template.csv',
};

router.get('/templates/:kind', asyncHandler(async (req, res) => {
  const file = TEMPLATES[req.params.kind];
  if (!file) throw new HttpError(404, 'Unknown template.');
  const content = fs.readFileSync(path.join(PROJECT_ROOT, 'data', 'templates', file), 'utf8');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.send(content);
}));

/* -------------------------------------------------------------- analysis */

router.post('/analyze', validate(analyzeSchema), asyncHandler(async (req, res) => {
  const { includeDemo, weights } = req.valid.body;
  const result = await runAnalysis({ includeDemo, weights, userId: req.user.id });
  res.status(201).json(result);
}));

router.get('/analysis-runs', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ar.*, u.email AS triggered_by_email, (SELECT count(*)::int FROM skill_scores ss WHERE ss.run_id = ar.id) AS score_rows
       FROM analysis_runs ar LEFT JOIN users u ON u.id = ar.triggered_by ORDER BY ar.id DESC LIMIT 20`,
  );
  res.json({ runs: rows });
}));

/* -------------------------------------------------------------- taxonomy maintenance */

const aliasSchema = z.object({ alias: z.string().trim().min(1).max(80) });

router.post('/skills/:id/aliases', validate(aliasSchema), asyncHandler(async (req, res) => {
  const skillId = Number(req.params.id);
  const { skillById } = await getTaxonomy();
  if (!skillById.has(skillId)) throw new HttpError(404, 'Unknown skill.');
  const alias = req.valid.body.alias;
  const { rows } = await db.query(
    `INSERT INTO skill_aliases (skill_id, alias, alias_normalized, case_sensitive) VALUES ($1, $2, $3, false)
     ON CONFLICT (alias_normalized, case_sensitive) DO NOTHING RETURNING id`,
    [skillId, alias, normalizeTerm(alias)],
  );
  if (!rows.length) throw new HttpError(409, 'That alias is already mapped to a skill.');
  invalidateTaxonomy();
  res.status(201).json({ ok: true, note: 'Alias added. Re-import data to apply it to existing records.' });
}));

/* -------------------------------------------------------------- research status & demo data */

const decisionSchema = z.object({
  status: z.enum(['validated', 'not_validated']).nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

router.put('/research-status', validate(decisionSchema), asyncHandler(async (req, res) => {
  const { status, note } = req.valid.body;
  await setSetting('problem_validation_decision', status ? { status, note: note || null, decidedBy: req.user.email, decidedAt: new Date().toISOString() } : null);
  res.json(await getResearchStatus());
}));

const deleteDemoSchema = z.object({ confirm: z.literal('DELETE DEMO DATA') });

router.delete('/demo-data', validate(deleteDemoSchema), asyncHandler(async (req, res) => {
  const counts = await db.transaction(async (tx) => {
    const jobs = await tx.query("DELETE FROM job_postings WHERE data_origin = 'demo' RETURNING id");
    const pros = await tx.query("DELETE FROM professional_responses WHERE data_origin = 'demo' RETURNING id");
    const students = await tx.query("DELETE FROM student_validation_responses WHERE data_origin = 'demo' RETURNING id");
    return { jobPostings: jobs.rows.length, professionalResponses: pros.rows.length, studentResponses: students.rows.length };
  });
  const { run } = await runAnalysis({ includeDemo: false, userId: req.user.id });
  res.json({ deleted: counts, analysisRunId: run.id });
}));

export default router;
