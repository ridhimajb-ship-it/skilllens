/**
 * Skill normalization and extraction.
 *
 * Maps the many ways a skill is written ("Postgres", "PostgreSQL DB", "postgresql")
 * to one canonical skill ("PostgreSQL"). Two entry points:
 *   - resolveTerm(term):   for explicit skill lists (CSV skills column, surveys, student input)
 *   - extractFromText(t):  for free-text job descriptions (stricter: ambiguous aliases are skipped)
 *
 * The same rules are implemented in analysis/skilllens_pipeline/normalize.py.
 */

const DASHES = /[‐-―−]/g;

/** Lowercase, unify dashes/whitespace and strip wrapping punctuation. */
export function normalizeTerm(value) {
  return String(value ?? '')
    .replace(DASHES, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'`([{]+|["'`)\]}.,:;!?]+$/g, '')
    .trim();
}

/** Compact form used as a last-resort match: "React JS" / "react.js" / "ReactJS" -> "reactjs". */
export function compactTerm(value) {
  return normalizeTerm(value).replace(/[\s._-]+/g, '');
}

const PREFIXES = [
  'working knowledge of', 'hands-on experience with', 'hands-on experience in', 'experience with', 'experience in',
  'knowledge of', 'familiarity with', 'proficiency in', 'proficient in', 'expertise in', 'strong', 'advanced',
  'basic', 'solid', 'hands-on', 'good',
];
const SUFFIXES = [
  'programming language', 'programming', 'language', 'framework', 'library', 'database', 'db', 'development',
  'skills', 'skill', 'basics', 'experience', 'knowledge', 'concepts', '(basic)', '(advanced)',
];

function stripAffixes(term) {
  let current = term;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PREFIXES) {
      if (current.startsWith(`${p} `)) { current = current.slice(p.length + 1).trim(); changed = true; }
    }
    for (const s of SUFFIXES) {
      if (current.endsWith(` ${s}`)) { current = current.slice(0, -(s.length + 1)).trim(); changed = true; }
    }
  }
  return current;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

const LEFT = '(?<![A-Za-z0-9+#])';
const RIGHT = '(?![A-Za-z0-9+#])';
const SHORT_RIGHT = "(?![A-Za-z0-9+#&'\\-])"; // single/two-letter aliases such as "R" must not be "R&D"

function buildAlternation(aliases) {
  // Longest first so "postgresql db" wins over "postgresql" and "java" never eats "javascript".
  const sorted = [...new Set(aliases)].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;
  return sorted.map((a) => escapeRegex(a) + (a.length <= 2 ? SHORT_RIGHT : '')).join('|');
}

export class SkillNormalizer {
  /**
   * @param {Array<{id?: number, name: string, category?: string, type?: string,
   *                aliases?: Array<string|{alias: string, caseSensitive?: boolean}>}>} skills
   * @param {{stopAliases?: string[]}} options  aliases too ambiguous for free text
   */
  constructor(skills, { stopAliases = [] } = {}) {
    this.skills = skills;
    this.exact = new Map();
    this.compact = new Map();
    this.caseSensitive = new Map();
    const stop = new Set(stopAliases.map(normalizeTerm));
    const textAliases = [];
    const csAliases = [];

    for (const skill of skills) {
      const entries = [{ alias: skill.name, caseSensitive: false }, ...(skill.aliases || []).map((a) =>
        typeof a === 'string' ? { alias: a, caseSensitive: false } : { alias: a.alias, caseSensitive: Boolean(a.caseSensitive) })];
      for (const { alias, caseSensitive } of entries) {
        const norm = normalizeTerm(alias);
        if (!norm) continue;
        // Explicit lists are matched case-insensitively for every alias.
        if (!this.exact.has(norm)) this.exact.set(norm, skill);
        const comp = compactTerm(alias);
        if (comp && !this.compact.has(comp)) this.compact.set(comp, skill);
        if (caseSensitive) {
          this.caseSensitive.set(alias, skill);
          csAliases.push(alias);
        } else if (!stop.has(norm)) {
          textAliases.push(norm);
        }
      }
    }
    // Exact entries must win over compact collisions created later.
    for (const [norm, skill] of this.exact) this.compact.set(compactTerm(norm), skill);

    const ci = buildAlternation(textAliases);
    const cs = buildAlternation(csAliases);
    this.ciRegex = ci ? new RegExp(`${LEFT}(?:${ci})${RIGHT}`, 'gi') : null;
    this.csRegex = cs ? new RegExp(`${LEFT}(?:${cs})${RIGHT}`, 'g') : null;
  }

  /** Resolve one term to a single skill, or null. */
  resolveOne(term) {
    const norm = normalizeTerm(term);
    if (!norm) return null;
    if (this.exact.has(norm)) return this.exact.get(norm);
    const stripped = stripAffixes(norm);
    if (this.exact.has(stripped)) return this.exact.get(stripped);
    const comp = compactTerm(stripped);
    if (this.compact.has(comp)) return this.compact.get(comp);
    return null;
  }

  /**
   * Resolve a term that may be compound ("AWS/Azure", "Python and SQL").
   * @returns {{skills: object[], unmapped: string|null}}
   */
  resolveTerm(term) {
    const direct = this.resolveOne(term);
    if (direct) return { skills: [direct], unmapped: null };
    const norm = normalizeTerm(term);
    if (!norm) return { skills: [], unmapped: null };
    const parts = norm.split(/\s*(?:\/|&|\band\b|\+(?!\+))\s*/).filter(Boolean);
    if (parts.length > 1) {
      const resolved = parts.map((p) => this.resolveOne(p));
      if (resolved.every(Boolean)) return { skills: [...new Set(resolved)], unmapped: null };
    }
    return { skills: [], unmapped: String(term).trim() };
  }

  /**
   * Resolve a list cell or array of terms. Cells are split on ; | , and newlines
   * ("/" is kept because it is part of names like CI/CD and A/B Testing).
   */
  resolveList(input) {
    const terms = Array.isArray(input) ? input : splitList(input);
    const found = new Map();
    const unmapped = [];
    for (const term of terms) {
      const { skills, unmapped: miss } = this.resolveTerm(term);
      for (const s of skills) found.set(s.name, s);
      if (miss) unmapped.push(miss);
    }
    return { skills: [...found.values()], unmapped };
  }

  /** Extract canonical skills mentioned in free text. */
  extractFromText(text) {
    if (!text) return [];
    const found = new Map();
    const original = String(text).replace(DASHES, '-');
    let working = original;
    if (this.ciRegex) {
      working = working.replace(this.ciRegex, (match) => {
        const skill = this.exact.get(normalizeTerm(match));
        if (skill) found.set(skill.name, skill);
        return ' '.repeat(match.length);
      });
    }
    if (this.csRegex) {
      for (const m of working.matchAll(this.csRegex)) {
        const match = m[0];
        // Title-case aliases that are ordinary English words ("Express", "Less", "Sketch", "Swift")
        // are ignored at the start of a sentence, where any word is capitalised.
        // (Blanking keeps string length, so indexes into `original` line up with `working`.)
        const isWordLike = /^[A-Z][a-z]+$/.test(match);
        const before = original.slice(0, m.index).trimEnd();
        if (isWordLike && (before === '' || /[.!?\n]$/.test(before))) continue;
        const skill = this.caseSensitive.get(match);
        if (skill) found.set(skill.name, skill);
      }
    }
    return [...found.values()];
  }
}

export function splitList(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split(/[;|,\n]+/).map((v) => v.trim()).filter(Boolean);
}

/** Build a normalizer straight from the taxonomy JSON (used by scripts and tests). */
export function normalizerFromTaxonomy(taxonomy) {
  const skills = taxonomy.skills.map((s) => ({
    ...s,
    aliases: [
      ...(s.aliases || []).map((a) => ({ alias: a, caseSensitive: false })),
      ...(s.caseSensitiveAliases || []).map((a) => ({ alias: a, caseSensitive: true })),
    ],
  }));
  return new SkillNormalizer(skills, { stopAliases: taxonomy.textExtractionStopAliases || [] });
}
