import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/httpError.js';
import { validate } from '../middleware/validate.js';
import { getTaxonomy } from '../services/taxonomy.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { skills } = await getTaxonomy();
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = req.query.category ? String(req.query.category) : null;
  const list = skills
    .filter((s) => !category || s.category === category)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.aliases.some((a) => a.alias.toLowerCase().includes(q)))
    .map((s) => ({
      id: s.id, name: s.name, slug: s.slug, category: s.category, type: s.type, description: s.description,
      aliases: s.aliases.map((a) => a.alias), prerequisites: s.metadata?.prerequisites || [],
    }));
  res.json({ count: list.length, categories: [...new Set(skills.map((s) => s.category))], skills: list });
}));

const normalizeSchema = z.object({ terms: z.array(z.string().max(200)).min(1).max(200), text: z.string().max(20000).optional() });

/** Normalization tester: shows exactly how raw terms map to canonical skills. */
router.post('/normalize', validate(normalizeSchema), asyncHandler(async (req, res) => {
  const { normalizer } = await getTaxonomy();
  const { terms, text } = req.valid.body;
  res.json({
    terms: terms.map((term) => {
      const { skills, unmapped } = normalizer.resolveTerm(term);
      return { term, canonical: skills.map((s) => s.name), mapped: !unmapped };
    }),
    extractedFromText: text ? normalizer.extractFromText(text).map((s) => s.name) : [],
  });
}));

export default router;
