/**
 * SkillLens skill-ranking algorithm (transparent and reproducible).
 *
 * For a role r and skill s, three measurable signals are computed, each a share in [0, 1]:
 *
 *   D  Industry demand      = postings for r that mention s        / all postings for r
 *   P  Professional usage   = professionals in r who use s regularly / all professionals in r
 *   B  Beginner importance  = professionals in r naming s important for beginners / all professionals in r
 *
 *   Score(r, s) = 100 * (wD*D + wP*P + wB*B) / (sum of weights of the signals that have data)
 *
 * Default weights: wD = 0.50, wP = 0.35, wB = 0.15.
 * If a role has no professional responses, only D is used (and vice versa); the UI reports which
 * signals were available and how many records they are based on, so a score is never shown without its basis.
 *
 * Role specificity (reported, NOT part of the score) = D_r / (D_r + mean D of the same skill in other roles).
 * 0.5 means "as common elsewhere"; close to 1 means "characteristic of this role". It is kept out of the
 * score on purpose: universal skills such as Git or Communication can be both common and important.
 *
 * The Python pipeline (analysis/skilllens_pipeline/rank.py) implements the same formula.
 */
import { db } from '../db/index.js';

export const DEFAULT_WEIGHTS = Object.freeze({ industry: 0.5, professional: 0.35, beginner: 0.15 });

export const TIERS = [
  { min: 80, label: 'Very High' },
  { min: 60, label: 'High' },
  { min: 40, label: 'Moderate' },
  { min: 20, label: 'Low' },
  { min: 0, label: 'Minimal' },
];

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min).label;
}

/** Confidence in a role's ranking, based purely on sample size. */
export function confidenceFor(postingTotal, professionalTotal) {
  if (postingTotal >= 30 && professionalTotal >= 5) return 'high';
  if (postingTotal >= 10 || professionalTotal >= 3) return 'medium';
  if (postingTotal > 0 || professionalTotal > 0) return 'low';
  return 'none';
}

const round = (v, d = 1) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Pure scoring function.
 * @param {object} input
 * @param {Array<{id: number, hypothesis: Map<number, string>}>} input.roles  hypothesis: skillId -> tier
 * @param {Array<{roleId: number, skillIds: number[]}>} input.postings
 * @param {Array<{roleId: number, uses: number[], beginner: number[], overemphasized?: number[]}>} input.responses
 * @param {{industry: number, professional: number, beginner: number}} [input.weights]
 * @returns {Array<object>} one row per (role, skill) with score, components and counts
 */
export function computeSkillScores({ roles, postings, responses, weights = DEFAULT_WEIGHTS }) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const stats = new Map(); // roleId -> { nPost, nPro, post: Map, uses: Map, beginner: Map, over: Map }
  const get = (roleId) => {
    if (!stats.has(roleId)) {
      stats.set(roleId, { nPost: 0, nPro: 0, post: new Map(), uses: new Map(), beginner: new Map(), over: new Map() });
    }
    return stats.get(roleId);
  };
  const inc = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  for (const p of postings) {
    if (p.roleId == null) continue;
    const s = get(p.roleId);
    s.nPost += 1;
    for (const id of new Set(p.skillIds)) inc(s.post, id);
  }
  for (const r of responses) {
    const s = get(r.roleId);
    s.nPro += 1;
    for (const id of new Set(r.uses || [])) inc(s.uses, id);
    for (const id of new Set(r.beginner || [])) inc(s.beginner, id);
    for (const id of new Set(r.overemphasized || [])) inc(s.over, id);
  }

  // Demand of each skill per role, used for specificity.
  const demandBySkill = new Map(); // skillId -> Map(roleId -> D)
  for (const [roleId, s] of stats) {
    if (s.nPost === 0) continue;
    for (const [skillId, count] of s.post) {
      if (!demandBySkill.has(skillId)) demandBySkill.set(skillId, new Map());
      demandBySkill.get(skillId).set(roleId, count / s.nPost);
    }
  }
  const rolesWithPostings = [...stats.entries()].filter(([, s]) => s.nPost > 0).map(([id]) => id);

  const rows = [];
  for (const role of roles) {
    const s = stats.get(role.id) || get(role.id);
    const hasD = s.nPost > 0;
    const hasP = s.nPro > 0;
    if (!hasD && !hasP) continue; // hypothesis only: nothing measurable to score

    const candidates = new Set([...role.hypothesis.keys(), ...s.post.keys(), ...s.uses.keys(), ...s.beginner.keys()]);
    const roleRows = [];
    for (const skillId of candidates) {
      const D = hasD ? (s.post.get(skillId) || 0) / s.nPost : null;
      const P = hasP ? (s.uses.get(skillId) || 0) / s.nPro : null;
      const B = hasP ? (s.beginner.get(skillId) || 0) / s.nPro : null;
      let num = 0;
      let den = 0;
      if (hasD) { num += w.industry * D; den += w.industry; }
      if (hasP) { num += w.professional * P + w.beginner * B; den += w.professional + w.beginner; }
      const score = den > 0 ? round((100 * num) / den, 1) : 0;

      let specificity = null;
      if (hasD && D > 0) {
        const others = rolesWithPostings.filter((id) => id !== role.id);
        if (others.length > 0) {
          const byRole = demandBySkill.get(skillId) || new Map();
          const meanOther = others.reduce((acc, id) => acc + (byRole.get(id) || 0), 0) / others.length;
          specificity = round(D / (D + meanOther), 3);
        }
      }

      roleRows.push({
        roleId: role.id,
        skillId,
        score,
        tier: tierFor(score),
        industryDemand: round(D, 4),
        professionalUsage: round(P, 4),
        beginnerImportance: round(B, 4),
        specificity,
        postingCount: s.post.get(skillId) || 0,
        professionalCount: s.uses.get(skillId) || 0,
        beginnerCount: s.beginner.get(skillId) || 0,
        overemphasizedCount: s.over.get(skillId) || 0,
        rolePostingTotal: s.nPost,
        roleProfessionalTotal: s.nPro,
        inHypothesis: role.hypothesis.has(skillId),
      });
    }
    // Rank: score desc, then hypothesis membership, then skill id for determinism.
    roleRows.sort((a, b) => b.score - a.score || Number(b.inHypothesis) - Number(a.inHypothesis) || a.skillId - b.skillId);
    roleRows.forEach((r, i) => { r.rank = i + 1; });
    rows.push(...roleRows);
  }
  return rows;
}

/** Load inputs from the database, run the algorithm and persist a new analysis run. */
export async function runAnalysis({ includeDemo = true, weights = DEFAULT_WEIGHTS, userId = null } = {}) {
  const origins = includeDemo ? ['demo', 'imported', 'real'] : ['imported', 'real'];

  const { rows: roleRows } = await db.query('SELECT id FROM roles ORDER BY id');
  const { rows: hyp } = await db.query('SELECT role_id, skill_id, tier FROM role_skills');
  const roles = roleRows.map((r) => ({
    id: r.id,
    hypothesis: new Map(hyp.filter((h) => h.role_id === r.id).map((h) => [h.skill_id, h.tier])),
  }));

  const { rows: postingRows } = await db.query(
    `SELECT jp.id, jp.role_id, COALESCE(array_agg(jps.skill_id) FILTER (WHERE jps.skill_id IS NOT NULL), '{}') AS skill_ids
       FROM job_postings jp
       LEFT JOIN job_posting_skills jps ON jps.job_posting_id = jp.id
      WHERE jp.role_id IS NOT NULL AND jp.data_origin = ANY($1)
      GROUP BY jp.id`,
    [origins],
  );
  const { rows: responseRows } = await db.query(
    `SELECT pr.id, pr.role_id,
            COALESCE(array_agg(prs.skill_id) FILTER (WHERE prs.kind = 'uses'), '{}') AS uses,
            COALESCE(array_agg(prs.skill_id) FILTER (WHERE prs.kind = 'beginner'), '{}') AS beginner,
            COALESCE(array_agg(prs.skill_id) FILTER (WHERE prs.kind = 'overemphasized'), '{}') AS overemphasized
       FROM professional_responses pr
       LEFT JOIN professional_response_skills prs ON prs.response_id = pr.id
      WHERE pr.data_origin = ANY($1)
      GROUP BY pr.id`,
    [origins],
  );

  const postings = postingRows.map((p) => ({ roleId: p.role_id, skillIds: p.skill_ids }));
  const responses = responseRows.map((r) => ({ roleId: r.role_id, uses: r.uses, beginner: r.beginner, overemphasized: r.overemphasized }));
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const scores = computeSkillScores({ roles, postings, responses, weights: w });

  const { rows: originRows } = await db.query(
    `SELECT DISTINCT data_origin FROM (
        SELECT data_origin FROM job_postings WHERE role_id IS NOT NULL AND data_origin = ANY($1)
        UNION SELECT data_origin FROM professional_responses WHERE data_origin = ANY($1)) o`,
    [origins],
  );
  const usedOrigins = originRows.map((o) => o.data_origin).sort();

  return db.transaction(async (tx) => {
    const { rows: [run] } = await tx.query(
      `INSERT INTO analysis_runs (params, postings_used, responses_used, includes_demo, origins, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [JSON.stringify({ weights: w, includeDemo }), postings.length, responses.length, usedOrigins.includes('demo'),
        JSON.stringify(usedOrigins), userId],
    );
    // Batch insert in chunks to keep statements small.
    const chunk = 200;
    for (let i = 0; i < scores.length; i += chunk) {
      const part = scores.slice(i, i + chunk);
      const values = [];
      const params = [];
      const width = 15;
      part.forEach((s, j) => {
        const b = j * width;
        values.push(`(${Array.from({ length: width }, (_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(run.id, s.roleId, s.skillId, s.score, s.tier, s.industryDemand, s.professionalUsage,
          s.beginnerImportance, s.specificity, s.postingCount, s.professionalCount, s.rolePostingTotal,
          s.roleProfessionalTotal, s.inHypothesis, s.rank);
      });
      await tx.query(
        `INSERT INTO skill_scores (run_id, role_id, skill_id, score, tier, industry_demand, professional_usage,
            beginner_importance, specificity, posting_count, professional_count, role_posting_total,
            role_professional_total, in_hypothesis, rank)
         VALUES ${values.join(',')}`,
        params,
      );
    }
    return { run, scoreCount: scores.length };
  });
}

/** The most recent analysis run (the one the UI shows), or null. */
export async function latestRun() {
  const { rows } = await db.query('SELECT * FROM analysis_runs ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}
