import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { findRole, getTaxonomy } from '../services/taxonomy.js';
import { getRoleAnalysis, getRoleSkillRanking } from '../services/roleAnalysis.js';
import { computeSkillGap } from '../services/skillGap.js';
import { confidenceFor } from '../services/scoring.js';

export const studentRouter = Router();
export const publicGapRouter = Router();

const skillInput = z.object({
  skillId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  level: z.number().int().min(1).max(3),
}).refine((s) => s.skillId || s.name, { message: 'Each skill needs a skillId or a name' });

const skillsSchema = z.object({ skills: z.array(skillInput).max(150) });

const profileSchema = z.object({
  targetRole: z.string().trim().min(1).max(80),
  educationLevel: z.string().trim().max(80).optional().nullable(),
  studyYear: z.string().trim().max(40).optional().nullable(),
  institution: z.string().trim().max(160).optional().nullable(),
});

const computeSchema = z.object({ role: z.string().trim().min(1).max(80), skills: z.array(skillInput).max(150) });

/** Resolve submitted skills to taxonomy ids; unknown names are kept as custom skills. */
export async function resolveStudentSkills(input) {
  const { normalizer, skillById } = await getTaxonomy();
  const resolved = new Map();
  const custom = new Map();
  for (const s of input) {
    let skill = s.skillId ? skillById.get(s.skillId) : null;
    if (!skill && s.name) skill = normalizer.resolveOne(s.name);
    if (skill) {
      const prev = resolved.get(skill.id);
      resolved.set(skill.id, { skillId: skill.id, name: skill.name, category: skill.category, level: Math.max(prev?.level || 0, s.level) });
    } else if (s.name) {
      custom.set(s.name.toLowerCase(), { skillId: null, name: s.name, category: 'Custom', level: s.level });
    }
  }
  return [...resolved.values(), ...custom.values()];
}

async function buildGap(role, studentSkills) {
  const ranking = await getRoleSkillRanking(role.id);
  const gap = computeSkillGap({ roleSkills: ranking.skills, studentSkills });
  return {
    role: { id: role.id, slug: role.slug, name: role.name },
    basis: ranking.basis,
    dataBasis: {
      runId: ranking.run?.id ?? null,
      runIncludesDemo: ranking.run?.includes_demo ?? false,
      postingTotal: ranking.postingTotal,
      professionalTotal: ranking.professionalTotal,
      confidence: confidenceFor(ranking.postingTotal, ranking.professionalTotal),
    },
    ...gap,
  };
}

/* ------------------------------------------------ public: compute without saving (guest mode) */

publicGapRouter.post('/compute', validate(computeSchema), asyncHandler(async (req, res) => {
  const role = await findRole(req.valid.body.role);
  if (!role) throw new HttpError(404, 'Unknown role.');
  const skills = await resolveStudentSkills(req.valid.body.skills);
  res.json({ saved: false, skills, ...(await buildGap(role, skills)) });
}));

/* ------------------------------------------------ authenticated student endpoints */

studentRouter.use(requireAuth, requireRole('student'));

async function loadProfile(userId) {
  const { rows } = await db.query(
    `SELECT sp.*, r.slug AS target_role_slug, r.name AS target_role_name
       FROM student_profiles sp LEFT JOIN roles r ON r.id = sp.target_role_id WHERE sp.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function loadSkills(userId) {
  const { rows } = await db.query(
    `SELECT ss.skill_id, COALESCE(s.name, ss.custom_name) AS name, COALESCE(s.category, 'Custom') AS category, ss.level
       FROM student_skills ss LEFT JOIN skills s ON s.id = ss.skill_id
      WHERE ss.user_id = $1 ORDER BY ss.level DESC, 2`,
    [userId],
  );
  return rows.map((r) => ({ skillId: r.skill_id, name: r.name, category: r.category, level: r.level }));
}

studentRouter.get('/profile', asyncHandler(async (req, res) => {
  res.json({ profile: await loadProfile(req.user.id), skills: await loadSkills(req.user.id) });
}));

studentRouter.post('/profile', validate(profileSchema), asyncHandler(async (req, res) => {
  const { targetRole, educationLevel, studyYear, institution } = req.valid.body;
  const role = await findRole(targetRole);
  if (!role) throw new HttpError(404, 'Unknown role.');
  await db.query(
    `INSERT INTO student_profiles (user_id, target_role_id, education_level, study_year, institution, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET target_role_id = EXCLUDED.target_role_id, education_level = EXCLUDED.education_level,
       study_year = EXCLUDED.study_year, institution = EXCLUDED.institution, updated_at = now()`,
    [req.user.id, role.id, educationLevel ?? null, studyYear ?? null, institution ?? null],
  );
  res.json({ profile: await loadProfile(req.user.id) });
}));

studentRouter.get('/skills', asyncHandler(async (req, res) => {
  res.json({ skills: await loadSkills(req.user.id) });
}));

/** Replace the student's skill set. */
studentRouter.post('/skills', validate(skillsSchema), asyncHandler(async (req, res) => {
  const skills = await resolveStudentSkills(req.valid.body.skills);
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM student_skills WHERE user_id = $1', [req.user.id]);
    for (const s of skills) {
      await tx.query('INSERT INTO student_skills (user_id, skill_id, custom_name, level) VALUES ($1, $2, $3, $4)',
        [req.user.id, s.skillId, s.skillId ? null : s.name, s.level]);
    }
  });
  res.json({ skills: await loadSkills(req.user.id) });
}));

studentRouter.get('/skill-gap', asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.user.id);
  const role = await findRole(req.query.role || profile?.target_role_slug);
  if (!role) throw new HttpError(400, 'Choose a target role first.');
  const skills = await loadSkills(req.user.id);
  const result = await buildGap(role, skills);
  await db.query(
    'INSERT INTO skill_gap_results (user_id, role_id, run_id, readiness, result) VALUES ($1, $2, $3, $4, $5)',
    [req.user.id, role.id, result.dataBasis.runId, result.readiness,
      JSON.stringify({ readiness: result.readiness, learningOrder: result.learningOrder, counts: result.counts })],
  );
  res.json({ saved: true, skills, ...result });
}));

studentRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.user.id);
  const skills = await loadSkills(req.user.id);
  if (!profile?.target_role_id) return res.json({ profile, skills, needsSetup: true });
  const role = await findRole(profile.target_role_slug);
  const gap = await buildGap(role, skills);
  const analysis = await getRoleAnalysis(role);
  const { rows: history } = await db.query(
    'SELECT readiness, created_at FROM skill_gap_results WHERE user_id = $1 AND role_id = $2 ORDER BY created_at DESC LIMIT 10',
    [req.user.id, role.id],
  );
  return res.json({
    profile,
    skills,
    needsSetup: skills.length === 0,
    gap,
    roleAnalysis: {
      dataBasis: analysis.dataBasis,
      topSkills: analysis.skills.slice(0, 10),
      tools: analysis.tools,
      professionalInsights: {
        count: analysis.professionalInsights.count,
        beginnerMistakes: analysis.professionalInsights.beginnerMistakes.slice(0, 3),
      },
    },
    history: history.reverse(),
  });
}));
