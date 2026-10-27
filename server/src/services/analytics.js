/**
 * Aggregations for the admin / research dashboard. Nothing here invents values: every number is a
 * count or share over stored records, reported together with its sample size and data origin.
 */
import { db } from '../db/index.js';
import { STUDENT_VALIDATION_OPTIONS, PROFESSIONAL_OPTIONS } from './surveyOptions.js';
import { confidenceFor, latestRun } from './scoring.js';
import { getResearchStatus } from './researchStatus.js';

const TOOL_TYPES = ['tool', 'platform', 'library'];

/** Count single-valued answers, keeping the option order and appending unexpected values. */
export function distribution(rows, field, options = []) {
  const counts = new Map(options.map((o) => [o, 0]));
  for (const r of rows) {
    const v = r[field];
    if (v === null || v === undefined || v === '') continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const answered = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()].map(([label, count]) => ({ label, count, share: answered ? count / answered : 0 }));
}

/** Count multi-select answers (JSON arrays). Share = share of respondents who picked the option. */
export function multiDistribution(rows, field, options = []) {
  const counts = new Map(options.map((o) => [o, 0]));
  let respondents = 0;
  for (const r of rows) {
    const values = Array.isArray(r[field]) ? r[field] : [];
    if (values.length) respondents += 1;
    for (const v of new Set(values)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: respondents ? count / respondents : 0 }))
    .sort((a, b) => b.count - a.count);
}

async function countsByOrigin(table) {
  const { rows } = await db.query(`SELECT data_origin, count(*)::int AS n FROM ${table} GROUP BY data_origin`);
  const out = { total: 0, demo: 0, imported: 0, real: 0 };
  for (const r of rows) { out[r.data_origin] = r.n; out.total += r.n; }
  return out;
}

export async function getOverview() {
  const [jobs, students, professionals] = await Promise.all([
    countsByOrigin('job_postings'), countsByOrigin('student_validation_responses'), countsByOrigin('professional_responses'),
  ]);
  const { rows: [counts] } = await db.query(
    `SELECT (SELECT count(*)::int FROM roles) AS roles, (SELECT count(*)::int FROM skills) AS skills,
            (SELECT count(*)::int FROM skill_aliases) AS aliases,
            (SELECT count(*)::int FROM users WHERE role = 'student') AS student_accounts,
            (SELECT count(*)::int FROM student_skills) AS student_skill_entries,
            (SELECT count(*)::int FROM skill_gap_results) AS gap_analyses`,
  );
  return { jobs, students, professionals, ...counts, latestRun: await latestRun() };
}

export async function getSkillAnalytics() {
  const { rows: [{ n: postingTotal }] } = await db.query('SELECT count(*)::int AS n FROM job_postings');
  const { rows: [{ n: proTotal }] } = await db.query('SELECT count(*)::int AS n FROM professional_responses');

  const { rows: common } = await db.query(
    `SELECT s.id, s.name, s.category, s.type, count(*)::int AS postings
       FROM job_posting_skills jps JOIN skills s ON s.id = jps.skill_id
      GROUP BY s.id ORDER BY postings DESC, s.name LIMIT 25`,
  );
  const { rows: proUse } = await db.query(
    `SELECT prs.skill_id, count(*)::int AS n FROM professional_response_skills prs WHERE prs.kind = 'uses' GROUP BY prs.skill_id`,
  );
  const proMap = new Map(proUse.map((r) => [r.skill_id, r.n]));
  const mostCommon = common.map((c) => ({
    name: c.name, category: c.category, type: c.type, postings: c.postings,
    postingShare: postingTotal ? c.postings / postingTotal : 0,
    professionalShare: proTotal ? (proMap.get(c.id) || 0) / proTotal : null,
  }));

  const { rows: categoryRows } = await db.query(
    `SELECT s.category, count(*)::int AS mentions FROM job_posting_skills jps JOIN skills s ON s.id = jps.skill_id
      GROUP BY s.category ORDER BY mentions DESC`,
  );

  // Role comparison: share of each role's postings mentioning the 12 most common skills.
  const topIds = common.slice(0, 12).map((c) => c.id);
  const { rows: matrixRows } = topIds.length ? await db.query(
    `SELECT r.slug, r.name AS role, s.name AS skill,
            count(DISTINCT jps.job_posting_id)::float / NULLIF((SELECT count(*) FROM job_postings j2 WHERE j2.role_id = r.id), 0) AS share
       FROM roles r
       JOIN job_postings jp ON jp.role_id = r.id
       JOIN job_posting_skills jps ON jps.job_posting_id = jp.id AND jps.skill_id = ANY($1)
       JOIN skills s ON s.id = jps.skill_id
      GROUP BY r.id, r.slug, r.name, s.name`,
    [topIds],
  ) : { rows: [] };

  const run = await latestRun();
  let topByRole = [];
  if (run) {
    ({ rows: topByRole } = await db.query(
      `SELECT r.slug, r.name AS role, s.name AS skill, ss.score, ss.rank, ss.tier
         FROM skill_scores ss JOIN roles r ON r.id = ss.role_id JOIN skills s ON s.id = ss.skill_id
        WHERE ss.run_id = $1 AND ss.rank <= 5 ORDER BY r.id, ss.rank`,
      [run.id],
    ));
  }
  return {
    postingTotal,
    professionalTotal: proTotal,
    mostCommon,
    categories: categoryRows,
    roleComparison: { skills: common.slice(0, 12).map((c) => c.name), cells: matrixRows },
    topByRole,
  };
}

export async function getStudentValidationAnalytics() {
  const { rows } = await db.query('SELECT * FROM student_validation_responses ORDER BY created_at DESC');
  const o = STUDENT_VALIDATION_OPTIONS;
  const willing = rows.filter((r) => ['Definitely', 'Probably'].includes(r.would_use_platform)).length;
  const answeredWould = rows.filter((r) => r.would_use_platform).length;
  const learnedUseless = rows.filter((r) => r.learned_not_useful?.startsWith('Yes')).length;
  const answeredLearned = rows.filter((r) => r.learned_not_useful).length;
  const conflicting = rows.filter((r) => ['Often', 'Sometimes'].includes(r.conflicting_advice)).length;
  const answeredConflicting = rows.filter((r) => r.conflicting_advice).length;
  return {
    count: rows.length,
    target: { min: 50, max: 100 },
    origins: rows.reduce((acc, r) => ({ ...acc, [r.data_origin]: (acc[r.data_origin] || 0) + 1 }), {}),
    headline: {
      willingToUse: answeredWould ? willing / answeredWould : null,
      willingToUseN: answeredWould,
      learnedNotUseful: answeredLearned ? learnedUseless / answeredLearned : null,
      learnedNotUsefulN: answeredLearned,
      conflictingAdvice: answeredConflicting ? conflicting / answeredConflicting : null,
      conflictingAdviceN: answeredConflicting,
    },
    decideMethods: multiDistribution(rows, 'decide_methods', o.decideMethods),
    learnedNotUseful: distribution(rows, 'learned_not_useful', o.learnedNotUseful),
    confusingPart: distribution(rows, 'confusing_part', o.confusingPart),
    sourceCount: distribution(rows, 'source_count', o.sourceCount),
    conflictingAdvice: distribution(rows, 'conflicting_advice', o.conflictingAdvice),
    trustedSources: multiDistribution(rows, 'trusted_sources', o.trustedSources),
    wouldUsePlatform: distribution(rows, 'would_use_platform', o.wouldUsePlatform),
    gapViewHelpful: distribution(rows, 'gap_view_helpful', o.gapViewHelpful),
    studyYear: distribution(rows, 'study_year', o.studyYear),
    painPointQuotes: rows.filter((r) => r.confusing_text).slice(0, 12).map((r) => ({ text: r.confusing_text, origin: r.data_origin })),
    comments: rows.filter((r) => r.comments).slice(0, 12).map((r) => ({ text: r.comments, origin: r.data_origin })),
  };
}

export async function getProfessionalAnalytics() {
  const { rows } = await db.query(
    `SELECT pr.*, r.name AS role_name, r.slug AS role_slug FROM professional_responses pr JOIN roles r ON r.id = pr.role_id
      ORDER BY pr.created_at DESC`,
  );
  const { rows: skillRows } = await db.query(
    `SELECT prs.kind, s.name, s.type, count(*)::int AS n
       FROM professional_response_skills prs JOIN skills s ON s.id = prs.skill_id
      GROUP BY prs.kind, s.name, s.type ORDER BY n DESC, s.name`,
  );
  const { rows: roleTop } = await db.query(
    `SELECT role_name, slug, skill, n FROM (
        SELECT r.name AS role_name, r.slug, s.name AS skill, count(*)::int AS n,
               ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY count(*) DESC, s.name) AS rn
          FROM professional_response_skills prs
          JOIN professional_responses pr ON pr.id = prs.response_id
          JOIN roles r ON r.id = pr.role_id
          JOIN skills s ON s.id = prs.skill_id
         WHERE prs.kind = 'uses'
         GROUP BY r.id, r.name, r.slug, s.name) t
      WHERE rn <= 3 ORDER BY role_name, n DESC`,
  );
  const total = rows.length;
  const share = (n) => (total ? n / total : 0);
  const byKind = (kind, filter = () => true) => skillRows.filter((r) => r.kind === kind && filter(r)).slice(0, 15)
    .map((r) => ({ name: r.name, count: r.n, share: share(r.n) }));
  const roleDiffs = {};
  for (const r of roleTop) {
    roleDiffs[r.role_name] ||= { role: r.role_name, slug: r.slug, responses: rows.filter((x) => x.role_slug === r.slug).length, topSkills: [] };
    roleDiffs[r.role_name].topSkills.push({ name: r.skill, count: r.n });
  }
  return {
    count: total,
    target: { min: 15, max: 20 },
    origins: rows.reduce((acc, r) => ({ ...acc, [r.data_origin]: (acc[r.data_origin] || 0) + 1 }), {}),
    byRole: distribution(rows, 'role_name'),
    industries: distribution(rows, 'industry', PROFESSIONAL_OPTIONS.industry).filter((d) => d.count > 0),
    experienceBands: distribution(rows, 'experience_band', PROFESSIONAL_OPTIONS.experienceBand),
    willingToContribute: distribution(rows, 'willing_to_contribute', PROFESSIONAL_OPTIONS.willingToContribute),
    motivation: multiDistribution(rows, 'motivation', PROFESSIONAL_OPTIONS.motivation),
    frequentSkills: byKind('uses', (r) => !TOOL_TYPES.includes(r.type)),
    frequentTools: byKind('uses', (r) => TOOL_TYPES.includes(r.type)),
    beginnerPriorities: byKind('beginner'),
    overemphasized: byKind('overemphasized'),
    beginnerMistakes: rows.filter((r) => r.beginner_mistakes).slice(0, 12)
      .map((r) => ({ text: r.beginner_mistakes, role: r.role_name, origin: r.data_origin })),
    wishLearnedEarlier: rows.filter((r) => r.wish_learned_earlier).slice(0, 12)
      .map((r) => ({ text: r.wish_learned_earlier, role: r.role_name, origin: r.data_origin })),
    roleDifferences: Object.values(roleDiffs),
  };
}

export async function getDataQuality() {
  const { rows: [jobs] } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE role_id IS NULL)::int AS unclassified,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM job_posting_skills j WHERE j.job_posting_id = jp.id))::int AS without_skills,
            count(*) FILTER (WHERE posted_date IS NULL)::int AS missing_date,
            count(*) FILTER (WHERE source IS NULL)::int AS missing_source,
            count(*) FILTER (WHERE url IS NULL)::int AS missing_url,
            count(*) FILTER (WHERE posted_date < now() - interval '12 months')::int AS older_than_12_months,
            count(*) FILTER (WHERE role_match = 'title')::int AS classified_by_title
       FROM job_postings jp`,
  );
  const { rows: unmapped } = await db.query(
    `SELECT term, count(*)::int AS n FROM (
        SELECT jsonb_array_elements_text(unmapped_terms) AS term FROM job_postings
        UNION ALL SELECT jsonb_array_elements_text(other_skills) FROM professional_responses) t
      GROUP BY term ORDER BY n DESC, term LIMIT 25`,
  );
  const { rows: roles } = await db.query(
    `SELECT r.slug, r.name,
            (SELECT count(*)::int FROM job_postings jp WHERE jp.role_id = r.id) AS postings,
            (SELECT count(*)::int FROM job_postings jp WHERE jp.role_id = r.id AND jp.data_origin <> 'demo') AS non_demo_postings,
            (SELECT count(*)::int FROM professional_responses pr WHERE pr.role_id = r.id) AS professionals,
            (SELECT count(*)::int FROM professional_responses pr WHERE pr.role_id = r.id AND pr.data_origin <> 'demo') AS non_demo_professionals
       FROM roles r ORDER BY r.id`,
  );
  const { rows: batches } = await db.query(
    `SELECT b.id, b.kind, b.filename, b.data_origin, b.rows_total, b.rows_imported, b.rows_skipped, b.report, b.created_at, u.email AS created_by
       FROM import_batches b LEFT JOIN users u ON u.id = b.created_by ORDER BY b.id DESC LIMIT 15`,
  );
  return {
    jobs,
    unmappedTerms: unmapped,
    roles: roles.map((r) => ({ ...r, confidence: confidenceFor(r.postings, r.professionals) })),
    recentImports: batches,
  };
}

export async function getAdminAnalytics() {
  const [overview, skills, students, professionals, quality, researchStatus] = await Promise.all([
    getOverview(), getSkillAnalytics(), getStudentValidationAnalytics(), getProfessionalAnalytics(), getDataQuality(), getResearchStatus(),
  ]);
  return { overview, skills, students, professionals, quality, researchStatus };
}
