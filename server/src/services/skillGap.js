/**
 * Student skill-gap engine (rule-based and explainable — no hidden model).
 *
 * 1. Required skills    = the role's top skills (max 15) with an industry score >= 25.
 * 2. Required level     = from the score: >= 75 -> Advanced (3), >= 45 -> Intermediate (2), else Beginner (1).
 *                         Assumption: skills that appear in most postings/workflows are expected at greater depth.
 * 3. Gap                = max(0, required level - student level)        (0..3, student level 0 = not known)
 * 4. Priority value     = score * gap / 3                               (0..100)
 *                         Very High >= 50, High >= 30, Medium >= 15, Low > 0, Met = 0
 * 5. Readiness          = sum(score * min(student, required)) / sum(score * required) * 100
 * 6. Learning order     = by priority value, but an unmet prerequisite (e.g. Python before Machine Learning)
 *                         is moved in front of the skill that depends on it.
 */
import { tierFor } from './scoring.js';

export const LEVEL_LABELS = ['Not yet', 'Beginner', 'Intermediate', 'Advanced'];
export const MAX_REQUIRED = 15;
export const MIN_REQUIRED_SCORE = 25;

export function requiredLevelFor(score) {
  if (score >= 75) return 3;
  if (score >= 45) return 2;
  return 1;
}

export function gapLabel(gap) {
  return ['None', 'Low', 'Medium', 'High'][gap];
}

export function priorityLabel(value) {
  if (value <= 0) return 'Met';
  if (value >= 50) return 'Very High';
  if (value >= 30) return 'High';
  if (value >= 15) return 'Medium';
  return 'Low';
}

const pct = (v) => (v === null || v === undefined ? null : Math.round(v * 100));

function explain(skill, studentLevel, requiredLevel) {
  const evidence = [];
  if (skill.industryDemand !== null && skill.industryDemand !== undefined) evidence.push(`in ${pct(skill.industryDemand)}% of postings`);
  if (skill.professionalUsage !== null && skill.professionalUsage !== undefined) evidence.push(`used by ${pct(skill.professionalUsage)}% of professionals surveyed`);
  if (evidence.length === 0 && skill.basis === 'hypothesis') evidence.push(`listed as a ${skill.hypothesisTier} skill in the initial hypothesis`);
  const level = `you: ${LEVEL_LABELS[studentLevel]}, expected: ${LEVEL_LABELS[requiredLevel]}`;
  return `${evidence.join(', ')}${evidence.length ? '; ' : ''}${level}`;
}

/**
 * @param {object} input
 * @param {Array<{skillId:number,name:string,category:string,type:string,score:number,industryDemand?:number,
 *                professionalUsage?:number,prerequisites?:string[],basis?:'data'|'hypothesis',hypothesisTier?:string}>} input.roleSkills
 *        ranked skills for the role (from the latest analysis run)
 * @param {Array<{skillId:number, level:number}>} input.studentSkills
 */
export function computeSkillGap({ roleSkills, studentSkills }) {
  const levels = new Map(studentSkills.filter((s) => s.skillId).map((s) => [s.skillId, s.level]));
  const required = [...roleSkills]
    .filter((s) => s.score >= MIN_REQUIRED_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REQUIRED);

  const rows = required.map((s) => {
    const studentLevel = levels.get(s.skillId) || 0;
    const requiredLevel = requiredLevelFor(s.score);
    const gap = Math.max(0, requiredLevel - studentLevel);
    const priorityValue = Math.round((s.score * gap) / 3);
    return {
      skillId: s.skillId,
      name: s.name,
      category: s.category,
      type: s.type,
      industryScore: s.score,
      industryTier: tierFor(s.score),
      industryDemand: s.industryDemand ?? null,
      professionalUsage: s.professionalUsage ?? null,
      requiredLevel,
      requiredLabel: LEVEL_LABELS[requiredLevel],
      studentLevel,
      studentLabel: LEVEL_LABELS[studentLevel],
      gap,
      gapLabel: gapLabel(gap),
      priorityValue,
      priority: priorityLabel(priorityValue),
      reason: explain(s, studentLevel, requiredLevel),
      prerequisites: s.prerequisites || [],
    };
  });

  const weightTotal = rows.reduce((acc, r) => acc + r.industryScore * r.requiredLevel, 0);
  const weightMet = rows.reduce((acc, r) => acc + r.industryScore * Math.min(r.studentLevel, r.requiredLevel), 0);
  const readiness = weightTotal > 0 ? Math.round((weightMet / weightTotal) * 100) : 0;

  const strengths = rows.filter((r) => r.studentLevel > 0 && r.gap === 0).sort((a, b) => b.industryScore - a.industryScore);
  const gaps = rows.filter((r) => r.gap > 0);
  const biggestGaps = [...gaps].sort((a, b) => b.gap - a.gap || b.industryScore - a.industryScore);
  const highPriority = gaps.filter((r) => r.priority === 'Very High' || r.priority === 'High')
    .sort((a, b) => b.priorityValue - a.priorityValue);

  const learningOrder = buildLearningOrder(gaps);

  const requiredIds = new Set(rows.map((r) => r.skillId));
  const otherSkills = studentSkills.filter((s) => !s.skillId || !requiredIds.has(s.skillId));

  return {
    readiness,
    rows,
    strengths,
    biggestGaps,
    highPriority,
    learningOrder,
    otherSkills,
    counts: { required: rows.length, met: rows.length - gaps.length, gaps: gaps.length, partial: gaps.filter((g) => g.studentLevel > 0).length },
    method: {
      requiredSkills: `Top ${MAX_REQUIRED} role skills with score >= ${MIN_REQUIRED_SCORE}`,
      requiredLevel: 'score >= 75: Advanced, >= 45: Intermediate, otherwise Beginner',
      priority: 'score x gap / 3',
      readiness: 'score-weighted share of required proficiency you already have',
    },
  };
}

/** Sort by priority, pulling unmet prerequisites in front of the skills that depend on them. */
export function buildLearningOrder(gaps) {
  const byName = new Map(gaps.map((g) => [g.name, g]));
  const sorted = [...gaps].sort((a, b) => b.priorityValue - a.priorityValue || b.industryScore - a.industryScore);
  const order = [];
  const placed = new Set();
  const visit = (g, dependent, depth = 0) => {
    if (placed.has(g.name) || depth > 5) return;
    for (const pre of g.prerequisites || []) {
      const p = byName.get(pre);
      if (p && !placed.has(p.name)) visit(p, g.name, depth + 1);
    }
    placed.add(g.name);
    order.push({
      step: order.length + 1,
      skillId: g.skillId,
      name: g.name,
      priority: g.priority,
      priorityValue: g.priorityValue,
      from: g.studentLabel,
      to: g.requiredLabel,
      note: dependent ? `Prerequisite for ${dependent}` : null,
    });
  };
  for (const g of sorted) visit(g, null);
  return order;
}
