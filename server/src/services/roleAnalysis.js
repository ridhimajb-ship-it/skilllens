/**
 * Read-side queries that assemble role-level analysis for the UI.
 * Every response carries a `dataBasis` block (run id, sample sizes, origins, confidence) so the
 * client can always show what a number is based on and label demo data.
 */
import { db } from '../db/index.js';
import { confidenceFor, latestRun } from './scoring.js';

const TOOL_TYPES = new Set(['tool', 'platform', 'library']);
// When a role has no measurable data yet, hypothesis tiers stand in for scores (clearly labelled).
export const HYPOTHESIS_WEIGHTS = { core: 70, secondary: 40 };

async function originCounts(roleId) {
  const { rows } = await db.query(
    `SELECT 'postings' AS kind, data_origin, count(*)::int AS n FROM job_postings WHERE role_id = $1 GROUP BY data_origin
     UNION ALL
     SELECT 'professionals', data_origin, count(*)::int FROM professional_responses WHERE role_id = $1 GROUP BY data_origin`,
    [roleId],
  );
  const out = { postings: { demo: 0, imported: 0, real: 0 }, professionals: { demo: 0, imported: 0, real: 0 } };
  for (const r of rows) out[r.kind][r.data_origin] = r.n;
  return out;
}

/** Ranked skills for a role from the latest run, or the hypothesis list if no data exists. */
export async function getRoleSkillRanking(roleId, run = undefined) {
  const current = run === undefined ? await latestRun() : run;
  if (current) {
    const { rows } = await db.query(
      `SELECT ss.skill_id, s.name, s.slug, s.category, s.type, s.description, s.metadata, ss.score, ss.tier,
              ss.industry_demand, ss.professional_usage, ss.beginner_importance, ss.specificity, ss.posting_count,
              ss.professional_count, ss.role_posting_total, ss.role_professional_total, ss.in_hypothesis, ss.rank,
              rs.tier AS hypothesis_tier
         FROM skill_scores ss
         JOIN skills s ON s.id = ss.skill_id
         LEFT JOIN role_skills rs ON rs.role_id = ss.role_id AND rs.skill_id = ss.skill_id
        WHERE ss.run_id = $1 AND ss.role_id = $2
        ORDER BY ss.rank`,
      [current.id, roleId],
    );
    if (rows.length > 0) {
      return {
        basis: 'data',
        run: current,
        postingTotal: rows[0].role_posting_total,
        professionalTotal: rows[0].role_professional_total,
        skills: rows.map((r) => ({
          skillId: r.skill_id,
          name: r.name,
          slug: r.slug,
          category: r.category,
          type: r.type,
          description: r.description,
          prerequisites: r.metadata?.prerequisites || [],
          score: r.score,
          tier: r.tier,
          industryDemand: r.role_posting_total > 0 ? r.industry_demand : null,
          professionalUsage: r.role_professional_total > 0 ? r.professional_usage : null,
          beginnerImportance: r.role_professional_total > 0 ? r.beginner_importance : null,
          specificity: r.specificity,
          postingCount: r.posting_count,
          professionalCount: r.professional_count,
          inHypothesis: r.in_hypothesis,
          hypothesisTier: r.hypothesis_tier,
          rank: r.rank,
          basis: 'data',
        })),
      };
    }
  }
  const { rows } = await db.query(
    `SELECT rs.skill_id, rs.tier, s.name, s.slug, s.category, s.type, s.description, s.metadata
       FROM role_skills rs JOIN skills s ON s.id = rs.skill_id
      WHERE rs.role_id = $1 ORDER BY rs.tier, s.name`,
    [roleId],
  );
  return {
    basis: 'hypothesis',
    run: current,
    postingTotal: 0,
    professionalTotal: 0,
    skills: rows.map((r, i) => ({
      skillId: r.skill_id,
      name: r.name,
      slug: r.slug,
      category: r.category,
      type: r.type,
      description: r.description,
      prerequisites: r.metadata?.prerequisites || [],
      score: HYPOTHESIS_WEIGHTS[r.tier],
      tier: r.tier === 'core' ? 'Hypothesis: core' : 'Hypothesis: secondary',
      industryDemand: null,
      professionalUsage: null,
      beginnerImportance: null,
      specificity: null,
      postingCount: 0,
      professionalCount: 0,
      inHypothesis: true,
      hypothesisTier: r.tier,
      rank: i + 1,
      basis: 'hypothesis',
      hypothesisTierLabel: r.tier,
    })),
  };
}

function dataBasis(ranking, origins) {
  const demoOnly = origins.postings.imported + origins.postings.real + origins.professionals.imported + origins.professionals.real === 0;
  const anyDemo = origins.postings.demo + origins.professionals.demo > 0;
  return {
    basis: ranking.basis,
    runId: ranking.run?.id ?? null,
    runAt: ranking.run?.created_at ?? null,
    runIncludesDemo: ranking.run?.includes_demo ?? false,
    postingTotal: ranking.postingTotal,
    professionalTotal: ranking.professionalTotal,
    confidence: confidenceFor(ranking.postingTotal, ranking.professionalTotal),
    origins,
    containsDemo: ranking.basis === 'data' && Boolean(ranking.run?.includes_demo) && anyDemo,
    demoOnly: ranking.basis === 'data' && demoOnly,
  };
}

export async function getRoleList() {
  const run = await latestRun();
  const { rows: roles } = await db.query(
    `SELECT r.id, r.slug, r.name, r.category, r.description,
            (SELECT count(*)::int FROM role_skills rs WHERE rs.role_id = r.id) AS hypothesis_skill_count,
            (SELECT count(*)::int FROM job_postings jp WHERE jp.role_id = r.id) AS posting_count,
            (SELECT count(*)::int FROM job_postings jp WHERE jp.role_id = r.id AND jp.data_origin = 'demo') AS demo_posting_count,
            (SELECT count(*)::int FROM professional_responses pr WHERE pr.role_id = r.id) AS professional_count
       FROM roles r ORDER BY r.id`,
  );
  let scores = [];
  if (run) {
    ({ rows: scores } = await db.query(
      `SELECT ss.role_id, s.name, s.type, ss.score, ss.rank FROM skill_scores ss JOIN skills s ON s.id = ss.skill_id
        WHERE ss.run_id = $1 AND ss.score >= 25 ORDER BY ss.role_id, ss.rank`,
      [run.id],
    ));
  }
  const { rows: hyp } = await db.query(
    `SELECT rs.role_id, rs.tier, s.name, s.type FROM role_skills rs JOIN skills s ON s.id = rs.skill_id ORDER BY rs.tier, s.name`,
  );
  const maxPostings = Math.max(1, ...roles.map((r) => r.posting_count));
  return {
    run,
    roles: roles.map((r) => {
      const ranked = scores.filter((s) => s.role_id === r.id);
      const source = ranked.length ? ranked : hyp.filter((h) => h.role_id === r.id);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        description: r.description,
        basis: ranked.length ? 'data' : 'hypothesis',
        topSkills: source.filter((s) => !TOOL_TYPES.has(s.type)).slice(0, 5).map((s) => s.name),
        topTools: source.filter((s) => TOOL_TYPES.has(s.type)).slice(0, 4).map((s) => s.name),
        skillCount: ranked.length || r.hypothesis_skill_count,
        hypothesisSkillCount: r.hypothesis_skill_count,
        postingCount: r.posting_count,
        demoPostingCount: r.demo_posting_count,
        professionalCount: r.professional_count,
        datasetShare: r.posting_count / maxPostings,
        confidence: confidenceFor(r.posting_count, r.professional_count),
      };
    }),
  };
}

export async function getRoleAnalysis(role) {
  const ranking = await getRoleSkillRanking(role.id);
  const origins = await originCounts(role.id);
  const skills = ranking.skills;

  const categories = {};
  for (const s of skills.filter((x) => x.score >= 20 || x.inHypothesis)) {
    categories[s.category] ||= { category: s.category, skills: [], scoreSum: 0 };
    categories[s.category].skills.push({ name: s.name, score: s.score, tier: s.tier });
    categories[s.category].scoreSum += s.score;
  }
  const categoryList = Object.values(categories)
    .map((c) => ({ category: c.category, skills: c.skills, count: c.skills.length, averageScore: Math.round(c.scoreSum / c.skills.length) }))
    .sort((a, b) => b.averageScore - a.averageScore);

  const isData = ranking.basis === 'data';
  const hypothesisCheck = isData ? {
    supported: skills.filter((s) => s.inHypothesis && s.score >= 40).map((s) => s.name),
    weak: skills.filter((s) => s.inHypothesis && s.score > 0 && s.score < 40).map((s) => s.name),
    notObserved: skills.filter((s) => s.inHypothesis && s.postingCount === 0 && s.professionalCount === 0).map((s) => s.name),
    discovered: skills.filter((s) => !s.inHypothesis && s.score >= 25).map((s) => s.name),
  } : null;

  const insights = await getProfessionalInsights(role.id);
  const postingFacts = await getPostingFacts(role.id);

  return {
    role,
    dataBasis: dataBasis(ranking, origins),
    skills,
    tools: skills.filter((s) => TOOL_TYPES.has(s.type) && (s.score >= 15 || !isData)).slice(0, 12),
    categories: categoryList,
    hypothesisCheck,
    professionalInsights: insights,
    postingFacts,
  };
}

export async function getProfessionalInsights(roleId) {
  const { rows: responses } = await db.query(
    `SELECT id, beginner_mistakes, wish_learned_earlier, work_reality, years_experience, experience_band, industry, data_origin
       FROM professional_responses WHERE role_id = $1 ORDER BY created_at DESC`,
    [roleId],
  );
  const { rows: skillCounts } = await db.query(
    `SELECT prs.kind, s.name, count(*)::int AS n
       FROM professional_response_skills prs
       JOIN professional_responses pr ON pr.id = prs.response_id
       JOIN skills s ON s.id = prs.skill_id
      WHERE pr.role_id = $1
      GROUP BY prs.kind, s.name ORDER BY n DESC, s.name`,
    [roleId],
  );
  const pick = (field) => responses.filter((r) => r[field]).slice(0, 8).map((r) => ({ text: r[field], origin: r.data_origin, experience: r.experience_band }));
  const byKind = (kind) => skillCounts.filter((c) => c.kind === kind).slice(0, 10).map((c) => ({ name: c.name, count: c.n }));
  const bands = {};
  for (const r of responses) if (r.experience_band) bands[r.experience_band] = (bands[r.experience_band] || 0) + 1;
  return {
    count: responses.length,
    demoCount: responses.filter((r) => r.data_origin === 'demo').length,
    beginnerMistakes: pick('beginner_mistakes'),
    wishLearnedEarlier: pick('wish_learned_earlier'),
    workReality: pick('work_reality'),
    topUsed: byKind('uses'),
    beginnerSkills: byKind('beginner'),
    overemphasized: byKind('overemphasized'),
    experienceBands: bands,
  };
}

async function getPostingFacts(roleId) {
  const { rows: [facts] } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE experience_min_years IS NOT NULL)::int AS with_experience,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY experience_min_years) AS median_experience,
            count(*) FILTER (WHERE experience_min_years <= 1)::int AS entry_level,
            count(*) FILTER (WHERE education IS NOT NULL)::int AS with_education,
            count(*) FILTER (WHERE certifications IS NOT NULL)::int AS with_certifications
       FROM job_postings WHERE role_id = $1`,
    [roleId],
  );
  const { rows: sources } = await db.query(
    'SELECT COALESCE(source, \'Unknown\') AS source, count(*)::int AS n FROM job_postings WHERE role_id = $1 GROUP BY 1 ORDER BY n DESC LIMIT 6',
    [roleId],
  );
  return { ...facts, sources };
}
