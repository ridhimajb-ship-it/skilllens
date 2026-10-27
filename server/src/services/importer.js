/**
 * Data import pipeline for job postings, professional responses and student validation responses.
 *
 *   Raw CSV/JSON -> header mapping -> cleaning -> validation -> role classification
 *   -> skill extraction + normalization -> de-duplication -> database
 *
 * Every import first produces a preview report (nothing is written) so the research team can check
 * column mapping, invalid rows, unclassified postings and unmapped skill terms before committing.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { parseCsv, parseJsonRecords } from '../utils/csv.js';
import { HttpError } from '../utils/httpError.js';
import { getTaxonomy } from './taxonomy.js';
import { normalizeTerm, splitList } from './normalizer.js';
import { parseExperienceYears } from './classifier.js';
import { EXPERIENCE_BAND_YEARS, PROFESSIONAL_OPTIONS, bandForYears } from './surveyOptions.js';

const JOB_HEADERS = {
  title: ['title', 'job_title', 'position', 'job_name', 'role_title'],
  company: ['company', 'company_name', 'employer', 'organization', 'organisation'],
  role_category: ['role_category', 'role', 'category', 'career_role', 'target_role'],
  location: ['location', 'city', 'job_location'],
  posting_date: ['posting_date', 'posted_date', 'date_posted', 'date', 'posted_on'],
  source: ['source', 'platform', 'site'],
  url: ['url', 'link', 'job_url', 'posting_url'],
  description: ['description', 'job_description', 'details', 'summary'],
  skills: ['skills', 'extracted_skills', 'required_skills', 'skills_required', 'key_skills'],
  tools: ['tools', 'extracted_tools', 'technologies', 'tech_stack'],
  experience: ['experience', 'experience_requirements', 'experience_required', 'years_experience'],
  education: ['education', 'education_requirements', 'qualification', 'qualifications'],
  certifications: ['certifications', 'certification', 'certs'],
  data_origin: ['data_origin'],
};

const PROFESSIONAL_HEADERS = {
  role: ['role', 'job_role', 'current_role', 'role_category'],
  industry: ['industry', 'sector'],
  years_experience: ['years_experience', 'experience', 'years', 'yoe', 'experience_years'],
  skills_used: ['skills_used', 'skills', 'skills_used_regularly'],
  tools_used: ['tools_used', 'tools', 'tools_used_regularly'],
  beginner_skills: ['beginner_skills', 'important_beginner_skills', 'important_for_beginners'],
  overemphasized_skills: ['overemphasized_skills', 'overemphasized', 'overrated_skills'],
  beginner_mistakes: ['beginner_mistakes', 'common_beginner_mistakes', 'mistakes'],
  wish_learned_earlier: ['wish_learned_earlier', 'wish_i_had_learned_earlier', 'learn_earlier'],
  work_reality: ['work_reality', 'what_work_looks_like', 'day_to_day'],
  willing_to_contribute: ['willing_to_contribute', 'willingness', 'willing'],
  motivation: ['motivation', 'motivations'],
};

const STUDENT_HEADERS = {
  study_year: ['study_year', 'year', 'year_of_study'],
  field_of_study: ['field_of_study', 'field', 'branch', 'major'],
  target_role: ['target_role', 'role', 'career_goal'],
  decide_methods: ['decide_methods', 'how_decide', 'decision_methods'],
  learned_not_useful: ['learned_not_useful', 'learned_useless_skill'],
  confusing_part: ['confusing_part', 'most_confusing'],
  confusing_text: ['confusing_text', 'confusing_details'],
  source_count: ['source_count', 'number_of_sources'],
  conflicting_advice: ['conflicting_advice'],
  trusted_sources: ['trusted_sources', 'trust_most'],
  would_use_platform: ['would_use_platform', 'would_use'],
  gap_view_helpful: ['gap_view_helpful', 'gap_helpful'],
  comments: ['comments', 'comment', 'notes'],
};

const MAX_ROWS = 20000;
const clip = (v, n) => (v === null || v === undefined ? null : String(v).trim().slice(0, n) || null);

function mapHeaders(record, spec) {
  const out = {};
  for (const [field, names] of Object.entries(spec)) {
    const key = names.find((n) => record[n] !== undefined && record[n] !== null && String(record[n]).trim() !== '');
    out[field] = key ? record[key] : null;
  }
  return out;
}

function detectColumns(records, spec) {
  const present = new Set(records.flatMap((r) => Object.keys(r)));
  const mapped = {};
  for (const [field, names] of Object.entries(spec)) mapped[field] = names.find((n) => present.has(n)) || null;
  const known = new Set(Object.values(spec).flat());
  return { mapped, ignored: [...present].filter((c) => !known.has(c)) };
}

function readRecords(format, content, jsonKey) {
  if (typeof content !== 'string' && format === 'csv') throw new HttpError(400, 'CSV content must be text.');
  const records = format === 'json' ? parseJsonRecords(content, jsonKey) : parseCsv(content);
  if (records.length === 0) throw new HttpError(400, 'The file contains no data rows.');
  if (records.length > MAX_ROWS) throw new HttpError(413, `Too many rows (${records.length}). Maximum is ${MAX_ROWS} per import.`);
  return records;
}

export function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD-MM-YYYY (common in India/Europe)
  if (m) return validDate(+m[3], +m[2], +m[1]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function validDate(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function cleanUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(String(value).trim());
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function dedupeKey(job) {
  const basis = job.url
    ? `url|${job.url.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')}`
    : ['t', job.company, job.title, job.location, job.postedDate, (job.description || '').slice(0, 300)]
      .map((v) => normalizeTerm(v || '')).join('|');
  return crypto.createHash('sha1').update(basis).digest('hex');
}

/* ------------------------------------------------------------------ job postings */

async function processJobs(records) {
  const { normalizer, classifier } = await getTaxonomy();
  const seen = new Set();
  const unmappedCounts = new Map();
  const rows = records.map((raw, index) => {
    const r = mapHeaders(raw, JOB_HEADERS);
    const errors = [];
    const warnings = [];
    const title = clip(r.title, 300);
    const description = clip(r.description, 20000);
    if (!title) errors.push('Missing job title');
    if (!description && !r.skills && !r.tools) errors.push('Needs a description or a skills/tools column');

    const url = cleanUrl(r.url);
    if (r.url && !url) warnings.push('Invalid URL ignored');
    const postedDate = parseDate(r.posting_date);
    if (r.posting_date && !postedDate) warnings.push(`Unrecognised date "${r.posting_date}"`);

    const { role, match } = classifier.classify({ roleCategory: r.role_category, title });
    if (!role && title) warnings.push('Could not classify into one of the 16 roles');

    const listed = normalizer.resolveList([...splitList(r.skills), ...splitList(r.tools)]);
    const fromText = normalizer.extractFromText(description);
    const skillMap = new Map();
    for (const s of listed.skills) skillMap.set(s.id ?? s.name, { skill: s, source: 'listed' });
    for (const s of fromText) if (!skillMap.has(s.id ?? s.name)) skillMap.set(s.id ?? s.name, { skill: s, source: 'description' });
    for (const term of listed.unmapped) unmappedCounts.set(term, (unmappedCounts.get(term) || 0) + 1);

    const experienceText = clip(r.experience, 300);
    const job = {
      rowNumber: index + 1,
      title,
      company: clip(r.company, 200),
      location: clip(r.location, 200),
      postedDate,
      source: clip(r.source, 100),
      url,
      description,
      experienceText,
      experienceMinYears: parseExperienceYears(experienceText) ?? parseExperienceYears(description),
      education: clip(r.education, 500),
      certifications: clip(r.certifications, 500),
      role,
      roleMatch: match,
      skills: [...skillMap.values()],
      unmapped: listed.unmapped,
      errors,
      warnings,
    };
    if (errors.length === 0) {
      job.dedupeKey = dedupeKey(job);
      if (seen.has(job.dedupeKey)) {
        job.duplicateInFile = true;
        warnings.push('Duplicate of an earlier row in this file');
      }
      seen.add(job.dedupeKey);
    }
    if (skillMap.size === 0 && errors.length === 0) warnings.push('No recognised skills found');
    return job;
  });
  const topUnmapped = [...unmappedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([term, count]) => ({ term, count }));
  return { rows, topUnmapped };
}

function jobSummary(rows) {
  const valid = rows.filter((r) => r.errors.length === 0 && !r.duplicateInFile);
  const byRole = {};
  for (const r of valid) {
    const key = r.role?.name || 'Unclassified';
    byRole[key] = (byRole[key] || 0) + 1;
  }
  return {
    total: rows.length,
    valid: valid.length,
    invalid: rows.filter((r) => r.errors.length > 0).length,
    duplicatesInFile: rows.filter((r) => r.duplicateInFile).length,
    unclassified: valid.filter((r) => !r.role).length,
    withoutSkills: valid.filter((r) => r.skills.length === 0).length,
    byRole,
  };
}

const previewJob = (r) => ({
  rowNumber: r.rowNumber,
  title: r.title,
  company: r.company,
  role: r.role?.name || null,
  roleMatch: r.roleMatch,
  postedDate: r.postedDate,
  skills: r.skills.map((s) => s.skill.name),
  unmapped: r.unmapped,
  errors: r.errors,
  warnings: r.warnings,
});

export async function previewJobImport({ format, content }) {
  const records = readRecords(format, content, 'jobs');
  const columns = detectColumns(records, JOB_HEADERS);
  const missingRequired = columns.mapped.title ? [] : ['title'];
  if (!columns.mapped.description && !columns.mapped.skills && !columns.mapped.tools) missingRequired.push('description or skills');
  const { rows, topUnmapped } = await processJobs(records);
  return {
    columns,
    missingRequired,
    summary: jobSummary(rows),
    topUnmapped,
    rows: rows.slice(0, 50).map(previewJob),
    problems: rows.filter((r) => r.errors.length || r.warnings.length).slice(0, 100).map(previewJob),
  };
}

export async function importJobs({ format, content, dataOrigin = 'imported', filename = null, userId = null }) {
  const records = readRecords(format, content, 'jobs');
  const { rows, topUnmapped } = await processJobs(records);
  const valid = rows.filter((r) => r.errors.length === 0 && !r.duplicateInFile);

  return db.transaction(async (tx) => {
    const { rows: [batch] } = await tx.query(
      `INSERT INTO import_batches (kind, filename, data_origin, rows_total, created_by)
       VALUES ('jobs', $1, $2, $3, $4) RETURNING id`,
      [filename, dataOrigin, rows.length, userId],
    );
    let imported = 0;
    let duplicatesInDb = 0;
    for (const job of valid) {
      const { rows: inserted } = await tx.query(
        `INSERT INTO job_postings (company, title, role_id, role_match, location, posted_date, source, url, description,
            experience_text, experience_min_years, education, certifications, unmapped_terms, data_origin, import_batch_id, dedupe_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [job.company, job.title, job.role?.id ?? null, job.roleMatch, job.location, job.postedDate, job.source, job.url,
          job.description, job.experienceText, job.experienceMinYears, job.education, job.certifications,
          JSON.stringify(job.unmapped), dataOrigin, batch.id, job.dedupeKey],
      );
      if (inserted.length === 0) { duplicatesInDb += 1; continue; }
      imported += 1;
      const postingId = inserted[0].id;
      if (job.skills.length) {
        const params = [postingId];
        const values = job.skills.map((s, i) => {
          params.push(s.skill.id, s.source);
          return `($1, $${i * 2 + 2}, $${i * 2 + 3})`;
        });
        await tx.query(`INSERT INTO job_posting_skills (job_posting_id, skill_id, match_source) VALUES ${values.join(',')}`, params);
      }
    }
    const summary = { ...jobSummary(rows), imported, duplicatesInDb, topUnmapped };
    await tx.query(
      'UPDATE import_batches SET rows_imported = $1, rows_skipped = $2, report = $3 WHERE id = $4',
      [imported, rows.length - imported, JSON.stringify(summary), batch.id],
    );
    return { batchId: batch.id, ...summary };
  });
}

/* ------------------------------------------------------------ professional responses */

/** Insert one professional response (shared by the live survey and the CSV importer). */
export async function insertProfessionalResponse(tx, r, dataOrigin, batchId = null) {
  const { rows: [row] } = await tx.query(
    `INSERT INTO professional_responses (user_id, role_id, industry, years_experience, experience_band, other_skills,
        beginner_mistakes, wish_learned_earlier, work_reality, willing_to_contribute, motivation, data_origin, import_batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [r.userId ?? null, r.roleId, r.industry, r.yearsExperience, r.experienceBand, JSON.stringify(r.otherSkills || []),
      r.beginnerMistakes, r.wishLearnedEarlier, r.workReality, r.willingToContribute, JSON.stringify(r.motivation || []),
      dataOrigin, batchId],
  );
  const links = [
    ...new Set((r.uses || []).map((id) => `uses:${id}`)),
    ...new Set((r.beginner || []).map((id) => `beginner:${id}`)),
    ...new Set((r.overemphasized || []).map((id) => `overemphasized:${id}`)),
  ];
  if (links.length) {
    const params = [row.id];
    const values = links.map((l, i) => {
      const [kind, id] = l.split(':');
      params.push(Number(id), kind);
      return `($1, $${i * 2 + 2}, $${i * 2 + 3})`;
    });
    await tx.query(`INSERT INTO professional_response_skills (response_id, skill_id, kind) VALUES ${values.join(',')}`, params);
  }
  return row.id;
}

function parseYears(value) {
  if (value === null || value === undefined || value === '') return null;
  const band = PROFESSIONAL_OPTIONS.experienceBand.find((b) => normalizeTerm(b) === normalizeTerm(value));
  if (band) return EXPERIENCE_BAND_YEARS[band];
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : null;
}

async function processProfessionals(records) {
  const { normalizer, classifier } = await getTaxonomy();
  return records.map((raw, index) => {
    const r = mapHeaders(raw, PROFESSIONAL_HEADERS);
    const errors = [];
    const warnings = [];
    const role = classifier.fromExplicit(r.role);
    if (!r.role) errors.push('Missing role');
    else if (!role) errors.push(`Unknown role "${r.role}"`);
    const years = parseYears(r.years_experience);
    if (r.years_experience && years === null) warnings.push(`Unrecognised experience "${r.years_experience}"`);
    const uses = normalizer.resolveList([...splitList(r.skills_used), ...splitList(r.tools_used)]);
    const beginner = normalizer.resolveList(r.beginner_skills);
    const over = normalizer.resolveList(r.overemphasized_skills);
    if (uses.skills.length === 0) warnings.push('No recognised skills/tools used');
    return {
      rowNumber: index + 1,
      role,
      errors,
      warnings,
      data: {
        roleId: role?.id,
        industry: clip(r.industry, 120),
        yearsExperience: years,
        experienceBand: bandForYears(years),
        uses: uses.skills.map((s) => s.id),
        beginner: beginner.skills.map((s) => s.id),
        overemphasized: over.skills.map((s) => s.id),
        otherSkills: [...new Set([...uses.unmapped, ...beginner.unmapped, ...over.unmapped])].slice(0, 30),
        beginnerMistakes: clip(r.beginner_mistakes, 2000),
        wishLearnedEarlier: clip(r.wish_learned_earlier, 2000),
        workReality: clip(r.work_reality, 2000),
        willingToContribute: clip(r.willing_to_contribute, 60),
        motivation: splitList(r.motivation).slice(0, 10),
      },
      skillNames: uses.skills.map((s) => s.name),
    };
  });
}

export async function previewProfessionalImport({ format, content }) {
  const records = readRecords(format, content, 'responses');
  const rows = await processProfessionals(records);
  return {
    columns: detectColumns(records, PROFESSIONAL_HEADERS),
    summary: { total: rows.length, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length },
    rows: rows.slice(0, 50).map((r) => ({ rowNumber: r.rowNumber, role: r.role?.name || null, skills: r.skillNames, errors: r.errors, warnings: r.warnings })),
  };
}

export async function importProfessionals({ format, content, dataOrigin = 'imported', filename = null, userId = null }) {
  const records = readRecords(format, content, 'responses');
  const rows = await processProfessionals(records);
  const valid = rows.filter((r) => !r.errors.length);
  return db.transaction(async (tx) => {
    const { rows: [batch] } = await tx.query(
      `INSERT INTO import_batches (kind, filename, data_origin, rows_total, rows_imported, rows_skipped, created_by)
       VALUES ('professional', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [filename, dataOrigin, rows.length, valid.length, rows.length - valid.length, userId],
    );
    for (const r of valid) await insertProfessionalResponse(tx, r.data, dataOrigin, batch.id);
    return { batchId: batch.id, total: rows.length, imported: valid.length, invalid: rows.length - valid.length };
  });
}

/* -------------------------------------------------------- student validation responses */

export async function insertStudentValidation(tx, r, dataOrigin, batchId = null) {
  const { rows: [row] } = await tx.query(
    `INSERT INTO student_validation_responses (study_year, field_of_study, target_role, decide_methods, learned_not_useful,
        confusing_part, confusing_text, source_count, conflicting_advice, trusted_sources, would_use_platform,
        gap_view_helpful, comments, data_origin, import_batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [r.studyYear, r.fieldOfStudy, r.targetRole, JSON.stringify(r.decideMethods || []), r.learnedNotUseful,
      r.confusingPart, r.confusingText, r.sourceCount, r.conflictingAdvice, JSON.stringify(r.trustedSources || []),
      r.wouldUsePlatform, r.gapViewHelpful, r.comments, dataOrigin, batchId],
  );
  return row.id;
}

function processStudents(records) {
  return records.map((raw, index) => {
    const r = mapHeaders(raw, STUDENT_HEADERS);
    const errors = [];
    if (!r.would_use_platform && !r.decide_methods && !r.confusing_part) errors.push('Row has none of the core survey answers');
    return {
      rowNumber: index + 1,
      errors,
      data: {
        studyYear: clip(r.study_year, 60),
        fieldOfStudy: clip(r.field_of_study, 120),
        targetRole: clip(r.target_role, 120),
        decideMethods: splitList(r.decide_methods).slice(0, 15),
        learnedNotUseful: clip(r.learned_not_useful, 60),
        confusingPart: clip(r.confusing_part, 200),
        confusingText: clip(r.confusing_text, 2000),
        sourceCount: clip(r.source_count, 30)?.replace(/[‐-―]/g, '-') ?? null,
        conflictingAdvice: clip(r.conflicting_advice, 30),
        trustedSources: splitList(r.trusted_sources).slice(0, 10),
        wouldUsePlatform: clip(r.would_use_platform, 30),
        gapViewHelpful: clip(r.gap_view_helpful, 30),
        comments: clip(r.comments, 2000),
      },
    };
  });
}

export async function previewStudentImport({ format, content }) {
  const records = readRecords(format, content, 'responses');
  const rows = processStudents(records);
  return {
    columns: detectColumns(records, STUDENT_HEADERS),
    summary: { total: rows.length, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length },
    rows: rows.slice(0, 50).map((r) => ({ rowNumber: r.rowNumber, ...r.data, errors: r.errors })),
  };
}

export async function importStudents({ format, content, dataOrigin = 'imported', filename = null, userId = null }) {
  const records = readRecords(format, content, 'responses');
  const rows = processStudents(records);
  const valid = rows.filter((r) => !r.errors.length);
  return db.transaction(async (tx) => {
    const { rows: [batch] } = await tx.query(
      `INSERT INTO import_batches (kind, filename, data_origin, rows_total, rows_imported, rows_skipped, created_by)
       VALUES ('student_validation', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [filename, dataOrigin, rows.length, valid.length, rows.length - valid.length, userId],
    );
    for (const r of valid) await insertStudentValidation(tx, r.data, dataOrigin, batch.id);
    return { batchId: batch.id, total: rows.length, imported: valid.length, invalid: rows.length - valid.length };
  });
}
