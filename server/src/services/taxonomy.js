/**
 * Loads skills, aliases and roles from the database into an in-memory normalizer and classifier.
 * Cached until invalidate() is called (after seeding or alias changes).
 */
import { db } from '../db/index.js';
import { SkillNormalizer } from './normalizer.js';
import { RoleClassifier } from './classifier.js';

let cache = null;

export function invalidateTaxonomy() {
  cache = null;
}

export async function getTaxonomy() {
  if (cache) return cache;
  const { rows: skills } = await db.query(
    `SELECT s.id, s.name, s.slug, s.category, s.type, s.description, s.metadata,
            COALESCE(json_agg(json_build_object('alias', a.alias, 'caseSensitive', a.case_sensitive))
                     FILTER (WHERE a.id IS NOT NULL), '[]') AS aliases
       FROM skills s LEFT JOIN skill_aliases a ON a.skill_id = s.id
      GROUP BY s.id ORDER BY s.name`,
  );
  const { rows: roles } = await db.query('SELECT id, slug, name, category, description, metadata FROM roles ORDER BY id');
  const { rows: stopRows } = await db.query("SELECT value FROM settings WHERE key = 'text_extraction_stop_aliases'");
  const stopAliases = stopRows[0]?.value || [];

  const normalizer = new SkillNormalizer(skills, { stopAliases });
  const classifier = new RoleClassifier(roles.map((r) => ({
    ...r,
    titlePatterns: r.metadata?.titlePatterns || [],
    classificationPriority: r.metadata?.classificationPriority,
  })));
  cache = {
    skills,
    roles,
    normalizer,
    classifier,
    skillById: new Map(skills.map((s) => [s.id, s])),
    skillByName: new Map(skills.map((s) => [s.name, s])),
    roleBySlug: new Map(roles.map((r) => [r.slug, r])),
    roleById: new Map(roles.map((r) => [r.id, r])),
  };
  return cache;
}

/** Find a role by slug, name or id-like value. */
export async function findRole(value) {
  const t = await getTaxonomy();
  if (value === undefined || value === null || value === '') return null;
  const s = String(value);
  return t.roleBySlug.get(s) || t.roles.find((r) => r.name.toLowerCase() === s.toLowerCase())
    || t.roleById.get(Number(s)) || t.classifier.fromExplicit(s);
}
