import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { findRole, getTaxonomy } from '../services/taxonomy.js';
import { insertProfessionalResponse, insertStudentValidation } from '../services/importer.js';
import { EXPERIENCE_BAND_YEARS, PROFESSIONAL_OPTIONS, STUDENT_VALIDATION_OPTIONS } from '../services/surveyOptions.js';

const router = Router();

// Basic abuse protection for anonymous survey endpoints.
const surveyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 30, standardHeaders: 'draft-7', legacyHeaders: false });

const S = STUDENT_VALIDATION_OPTIONS;
const P = PROFESSIONAL_OPTIONS;
const optionalEnum = (values) => z.enum(values).optional().nullable();
const text = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

router.get('/surveys/options', asyncHandler(async (req, res) => {
  const { skills, roles } = await getTaxonomy();
  res.json({
    studentValidation: STUDENT_VALIDATION_OPTIONS,
    professional: PROFESSIONAL_OPTIONS,
    roles: roles.map((r) => ({ slug: r.slug, name: r.name })),
    skills: skills.map((s) => ({ id: s.id, name: s.name, category: s.category, type: s.type })),
  });
}));

const studentSchema = z.object({
  studyYear: optionalEnum(S.studyYear),
  fieldOfStudy: text(120),
  targetRole: text(120),
  decideMethods: z.array(z.enum(S.decideMethods)).max(S.decideMethods.length).default([]),
  learnedNotUseful: z.enum(S.learnedNotUseful),
  confusingPart: z.enum(S.confusingPart),
  confusingText: text(2000),
  sourceCount: z.enum(S.sourceCount),
  conflictingAdvice: z.enum(S.conflictingAdvice),
  trustedSources: z.array(z.enum(S.trustedSources)).min(1).max(3),
  wouldUsePlatform: z.enum(S.wouldUsePlatform),
  gapViewHelpful: z.enum(S.gapViewHelpful),
  comments: text(2000),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to submit' }) }),
});

router.post('/student-validation', surveyLimiter, validate(studentSchema), asyncHandler(async (req, res) => {
  const id = await db.transaction((tx) => insertStudentValidation(tx, req.valid.body, 'real'));
  res.status(201).json({ id, message: 'Thank you — your response has been recorded.' });
}));

const skillIds = z.array(z.number().int().positive()).max(60).default([]);

const professionalSchema = z.object({
  role: z.string().trim().min(1).max(80),
  industry: z.enum(P.industry),
  experienceBand: z.enum(P.experienceBand),
  skillsUsed: skillIds,
  toolsUsed: skillIds,
  otherSkills: text(300),
  beginnerSkills: z.array(z.number().int().positive()).max(5).default([]),
  overemphasizedSkills: z.array(z.number().int().positive()).max(5).default([]),
  beginnerMistakes: text(2000),
  wishLearnedEarlier: text(2000),
  workReality: text(2000),
  willingToContribute: z.enum(P.willingToContribute),
  motivation: z.array(z.enum(P.motivation)).max(P.motivation.length).default([]),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to submit' }) }),
}).refine((v) => v.skillsUsed.length + v.toolsUsed.length > 0, { message: 'Select at least one skill or tool you use', path: ['skillsUsed'] });

router.post('/professional-survey', surveyLimiter, optionalAuth, validate(professionalSchema), asyncHandler(async (req, res) => {
  const body = req.valid.body;
  const role = await findRole(body.role);
  if (!role) throw new HttpError(400, 'Unknown role.');
  const { skillById, normalizer } = await getTaxonomy();
  const known = (ids) => ids.filter((id) => skillById.has(id));

  // Free-text "other skills" are normalized too; anything unrecognised is stored for the data-quality report.
  const other = body.otherSkills ? normalizer.resolveList(body.otherSkills) : { skills: [], unmapped: [] };
  const uses = [...new Set([...known(body.skillsUsed), ...known(body.toolsUsed), ...other.skills.map((s) => s.id)])];

  const id = await db.transaction(async (tx) => {
    const responseId = await insertProfessionalResponse(tx, {
      userId: req.user?.id ?? null,
      roleId: role.id,
      industry: body.industry,
      yearsExperience: EXPERIENCE_BAND_YEARS[body.experienceBand],
      experienceBand: body.experienceBand,
      uses,
      beginner: known(body.beginnerSkills),
      overemphasized: known(body.overemphasizedSkills),
      otherSkills: other.unmapped,
      beginnerMistakes: body.beginnerMistakes,
      wishLearnedEarlier: body.wishLearnedEarlier,
      workReality: body.workReality,
      willingToContribute: body.willingToContribute,
      motivation: body.motivation,
    }, 'real');
    if (req.user?.role === 'professional') {
      await tx.query(
        `INSERT INTO professional_profiles (user_id, role_id, industry, years_experience, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id, industry = EXCLUDED.industry,
           years_experience = EXCLUDED.years_experience, updated_at = now()`,
        [req.user.id, role.id, body.industry, EXPERIENCE_BAND_YEARS[body.experienceBand]],
      );
    }
    return responseId;
  });
  res.status(201).json({ id, message: 'Thank you — your insights will help students understand what the work actually looks like.' });
}));

export default router;
