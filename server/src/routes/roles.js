import { Router } from 'express';
import { db } from '../db/index.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { getTaxonomy } from '../services/taxonomy.js';
import { getRoleAnalysis, getRoleList, getRoleSkillRanking } from '../services/roleAnalysis.js';

const router = Router();

async function roleOr404(slug) {
  const { roleBySlug } = await getTaxonomy();
  const role = roleBySlug.get(slug);
  if (!role) throw new HttpError(404, `Unknown role "${slug}".`);
  return role;
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(await getRoleList());
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const role = await roleOr404(req.params.slug);
  const { rows } = await db.query(
    `SELECT s.id, s.name, s.category, s.type, s.description, rs.tier
       FROM role_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.role_id = $1 ORDER BY rs.tier, s.name`,
    [role.id],
  );
  const tools = rows.filter((s) => ['tool', 'platform', 'library'].includes(s.type));
  const technologies = rows.filter((s) => ['language', 'framework'].includes(s.type));
  res.json({
    role: {
      ...role,
      skillCategories: [...new Set(rows.map((s) => s.category))],
      coreSkills: rows.filter((s) => s.tier === 'core'),
      secondarySkills: rows.filter((s) => s.tier === 'secondary'),
      tools,
      technologies,
    },
  });
}));

router.get('/:slug/skills', asyncHandler(async (req, res) => {
  const role = await roleOr404(req.params.slug);
  const ranking = await getRoleSkillRanking(role.id);
  res.json({ role: { slug: role.slug, name: role.name }, basis: ranking.basis, skills: ranking.skills });
}));

router.get('/:slug/skill-analysis', asyncHandler(async (req, res) => {
  const role = await roleOr404(req.params.slug);
  res.json(await getRoleAnalysis(role));
}));

export default router;
