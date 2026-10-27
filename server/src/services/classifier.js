/**
 * Role classification for job postings.
 *  1. If the record names a role explicitly (role_category column), match it to a known role.
 *  2. Otherwise match the job title against each role's title patterns, checking the most
 *     specific roles first (classificationPriority), using whole-word matching.
 * Unclassified postings are kept but excluded from role-level scoring and reported as a data-quality issue.
 */
import { normalizeTerm } from './normalizer.js';

function patternRegex(pattern) {
  const escaped = normalizeTerm(pattern)
    .replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
    .replace(/\s+/g, '[\\s/_-]+');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
}

export class RoleClassifier {
  /** @param {Array<{id?: number, slug: string, name: string, titlePatterns?: string[], classificationPriority?: number}>} roles */
  constructor(roles) {
    this.roles = [...roles].sort((a, b) => (a.classificationPriority ?? 99) - (b.classificationPriority ?? 99));
    this.byKey = new Map();
    for (const role of roles) {
      this.byKey.set(normalizeTerm(role.name), role);
      this.byKey.set(normalizeTerm(role.slug), role);
      this.byKey.set(normalizeTerm(role.slug.replace(/-/g, ' ')), role);
    }
    this.patterns = this.roles.map((role) => ({
      role,
      regexes: [role.name, ...(role.titlePatterns || [])].map(patternRegex),
    }));
  }

  fromExplicit(value) {
    if (!value) return null;
    const key = normalizeTerm(value);
    if (this.byKey.has(key)) return this.byKey.get(key);
    // An explicit value may itself be a job title ("Sr. Data Scientist").
    return this.fromTitle(value);
  }

  fromTitle(title) {
    if (!title) return null;
    const text = normalizeTerm(title);
    for (const { role, regexes } of this.patterns) {
      if (regexes.some((r) => r.test(text))) return role;
    }
    return null;
  }

  /** @returns {{role: object|null, match: 'explicit'|'title'|null}} */
  classify({ roleCategory, title }) {
    const explicit = this.fromExplicit(roleCategory);
    if (explicit) return { role: explicit, match: 'explicit' };
    const byTitle = this.fromTitle(title);
    if (byTitle) return { role: byTitle, match: 'title' };
    return { role: null, match: null };
  }
}

/**
 * Pull a minimum years-of-experience figure out of free text.
 * "3+ years", "2-4 yrs", "minimum 5 years" -> 3, 2, 5; "fresher"/"entry level" -> 0.
 */
export function parseExperienceYears(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:(?:-|to|–)\s*\d+(?:\.\d+)?\s*)?\+?\s*(?:years?|yrs?)/);
  if (m) return Number(m[1]);
  if (/\b(fresher|freshers|entry[\s-]level|new grad|graduate program|0 years)\b/.test(t)) return 0;
  return null;
}
