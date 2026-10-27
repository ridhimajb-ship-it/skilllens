import './env.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizerFromTaxonomy, normalizeTerm, splitList } from '../src/services/normalizer.js';
import { RoleClassifier, parseExperienceYears } from '../src/services/classifier.js';
import { computeSkillScores, tierFor, confidenceFor } from '../src/services/scoring.js';
import { computeSkillGap, requiredLevelFor, priorityLabel, buildLearningOrder } from '../src/services/skillGap.js';
import { dedupeKey, parseDate } from '../src/services/importer.js';
import { toCsv } from '../src/utils/csv.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, 'data/taxonomy/skills.json'), 'utf8'));
const roles = JSON.parse(fs.readFileSync(path.join(root, 'data/taxonomy/roles.json'), 'utf8')).roles;
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'data/fixtures/scoring_fixture.json'), 'utf8'));
const n = normalizerFromTaxonomy(taxonomy);
const names = (skills) => skills.map((s) => s.name).sort();

describe('skill normalization', () => {
  test('maps aliases to canonical names', () => {
    for (const [term, expected] of [
      ['Postgres', 'PostgreSQL'], ['PostgreSQL', 'PostgreSQL'], ['PostgreSQL DB', 'PostgreSQL'],
      ['React.js', 'React'], ['ReactJS', 'React'], ['react', 'React'], ['React JS', 'React'],
      ['Python 3', 'Python'], ['Python programming', 'Python'], ['Structured Query Language', 'SQL'],
      ['k8s', 'Kubernetes'], ['  NODE.JS  ', 'Node.js'], ['Advanced Excel', 'Excel'], ['scikit learn', 'Scikit-learn'],
      ['Experience with Docker', 'Docker'], ['C#', 'C#'], ['c++', 'C++'],
    ]) {
      assert.equal(n.resolveOne(term)?.name, expected, `${term} -> ${expected}`);
    }
  });

  test('splits compound seed entries such as "AWS/Azure"', () => {
    assert.deepEqual(names(n.resolveTerm('AWS/Azure').skills), ['AWS', 'Azure']);
    assert.deepEqual(names(n.resolveTerm('Python/Bash').skills), ['Bash/Shell Scripting', 'Python']);
    // ...but keeps real names that contain a slash
    assert.deepEqual(names(n.resolveTerm('CI/CD').skills), ['CI/CD']);
    assert.deepEqual(names(n.resolveTerm('A/B Testing').skills), ['A/B Testing']);
  });

  test('every seed-list entry in roles.json resolves to a canonical skill', () => {
    for (const role of roles) {
      for (const entry of role.seedListOriginal) {
        const { skills, unmapped } = n.resolveTerm(entry);
        assert.ok(skills.length > 0 && !unmapped, `${role.slug}: "${entry}" should resolve`);
      }
    }
  });

  test('reports unmapped terms and removes duplicates', () => {
    const { skills, unmapped } = n.resolveList('Python; python 3; Postgres; PostgreSQL; Quantum Basket Weaving');
    assert.deepEqual(names(skills), ['PostgreSQL', 'Python']);
    assert.deepEqual(unmapped, ['Quantum Basket Weaving']);
  });

  test('extracts skills from free text without false positives', () => {
    const text = 'We use Java and JavaScript with MySQL. R&D team. Built REST services; the rest of the team uses Node.js and React.js. Knowledge of R is a plus.';
    const found = names(n.extractFromText(text));
    assert.ok(found.includes('Java'));
    assert.ok(found.includes('JavaScript'));
    assert.ok(found.includes('MySQL'));
    assert.ok(found.includes('Node.js'));
    assert.ok(found.includes('React'));
    assert.ok(found.includes('R'), 'standalone "R" should match');
    assert.ok(found.includes('REST APIs'), 'uppercase REST should match');
    assert.ok(!found.includes('SQL'), '"MySQL" must not also count as SQL');
  });

  test('ambiguous words are not extracted from prose', () => {
    const found = names(n.extractFromText('Express your ideas clearly. Less is more. The rest is history. Sketch out a plan in spring.'));
    assert.deepEqual(found, []);
    assert.deepEqual(names(n.extractFromText('Strong R&D background')), []);
  });

  test('normalizeTerm and splitList', () => {
    assert.equal(normalizeTerm('  "React.JS"  '), 'react.js');
    assert.deepEqual(splitList('a; b | c,d\ne'), ['a', 'b', 'c', 'd', 'e']);
  });
});

describe('role classification', () => {
  const c = new RoleClassifier(roles);
  test('classifies job titles, most specific role first', () => {
    for (const [title, slug] of [
      ['Senior Data Scientist', 'data-scientist'], ['Machine Learning Engineer II', 'machine-learning-engineer'],
      ['GenAI Engineer', 'ai-engineer'], ['Software Engineer - Backend', 'backend-developer'],
      ['Full-Stack Developer (MERN)', 'full-stack-developer'], ['Android Developer', 'mobile-app-developer'],
      ['SDE 1', 'software-engineer'], ['Cloud Security Engineer', 'cybersecurity-engineer'], ['Product Designer', 'ui-ux-designer'],
      ['Site Reliability Engineer', 'devops-engineer'], ['Associate Product Manager', 'product-manager'],
    ]) {
      assert.equal(c.classify({ title }).role?.slug, slug, title);
    }
    assert.equal(c.classify({ title: 'Operations Associate' }).role, null);
    assert.equal(c.classify({ title: 'Analyst', roleCategory: 'Business Analyst' }).match, 'explicit');
  });

  test('parses experience requirements', () => {
    assert.equal(parseExperienceYears('3+ years of experience'), 3);
    assert.equal(parseExperienceYears('2-4 yrs'), 2);
    assert.equal(parseExperienceYears('Freshers welcome'), 0);
    assert.equal(parseExperienceYears('No requirement stated'), null);
  });
});

describe('skill ranking algorithm', () => {
  const toRoles = (rs) => rs.map((r) => ({ id: r.id, hypothesis: new Map(Object.entries(r.hypothesis).map(([k, v]) => [Number(k), v])) }));

  test('matches the shared fixture (same expectations as the Python scorer)', () => {
    const rows = computeSkillScores({ ...fixture.input, roles: toRoles(fixture.input.roles) });
    assert.equal(rows.length, fixture.expected.length);
    for (const exp of fixture.expected) {
      const got = rows.find((r) => r.roleId === exp.roleId && r.skillId === exp.skillId);
      assert.ok(got, `missing ${exp.roleId}/${exp.skillId}`);
      assert.equal(got.score, exp.score, `score ${exp.roleId}/${exp.skillId}`);
      assert.equal(got.tier, exp.tier);
      assert.equal(got.rank, exp.rank);
      assert.equal(got.specificity, exp.specificity);
    }
  });

  test('roles without any data are not scored', () => {
    const rows = computeSkillScores({ ...fixture.input, roles: toRoles(fixture.input.roles) });
    assert.ok(!rows.some((r) => r.roleId === 3));
  });

  test('duplicate skill mentions inside one posting count once', () => {
    const rows = computeSkillScores({
      roles: [{ id: 1, hypothesis: new Map() }],
      postings: [{ roleId: 1, skillIds: [5, 5, 5] }, { roleId: 1, skillIds: [6] }],
      responses: [],
    });
    assert.equal(rows.find((r) => r.skillId === 5).score, 50);
  });

  test('tiers and confidence', () => {
    assert.equal(tierFor(80), 'Very High');
    assert.equal(tierFor(79.9), 'High');
    assert.equal(tierFor(40), 'Moderate');
    assert.equal(tierFor(5), 'Minimal');
    assert.equal(confidenceFor(0, 0), 'none');
    assert.equal(confidenceFor(9, 0), 'low');
    assert.equal(confidenceFor(10, 0), 'medium');
    assert.equal(confidenceFor(30, 5), 'high');
  });
});

describe('skill-gap engine', () => {
  const roleSkills = [
    { skillId: 1, name: 'Python', category: 'Programming Languages', type: 'language', score: 90 },
    { skillId: 2, name: 'SQL', category: 'Databases', type: 'language', score: 80 },
    { skillId: 3, name: 'Statistics', category: 'Statistics & Math', type: 'concept', score: 60 },
    { skillId: 4, name: 'Machine Learning', category: 'Machine Learning & AI', type: 'concept', score: 55, prerequisites: ['Python', 'Statistics'] },
    { skillId: 5, name: 'Docker', category: 'DevOps', type: 'tool', score: 30 },
    { skillId: 6, name: 'Obscure', category: 'Other', type: 'tool', score: 10 },
  ];

  test('required level follows the score bands', () => {
    assert.equal(requiredLevelFor(90), 3);
    assert.equal(requiredLevelFor(60), 2);
    assert.equal(requiredLevelFor(30), 1);
  });

  test('computes gaps, priorities and readiness', () => {
    const result = computeSkillGap({ roleSkills, studentSkills: [{ skillId: 1, level: 3 }, { skillId: 2, level: 1 }, { skillId: 99, level: 2 }] });
    assert.equal(result.rows.length, 5, 'skills under score 25 are not required');
    const sql = result.rows.find((r) => r.name === 'SQL');
    assert.equal(sql.requiredLevel, 3);
    assert.equal(sql.gap, 2);
    assert.equal(sql.priorityValue, Math.round((80 * 2) / 3));
    assert.equal(sql.priority, 'Very High');
    const python = result.rows.find((r) => r.name === 'Python');
    assert.equal(python.gap, 0);
    assert.equal(python.priority, 'Met');
    assert.deepEqual(result.strengths.map((s) => s.name), ['Python']);
    // readiness = (90*3 + 80*1) / (90*3 + 80*3 + 60*2 + 55*2 + 30*1) = 350 / 770
    assert.equal(result.readiness, Math.round((350 / 770) * 100));
    assert.equal(result.otherSkills.length, 1);
  });

  test('learning order puts prerequisites first', () => {
    const result = computeSkillGap({ roleSkills, studentSkills: [{ skillId: 1, level: 3 }, { skillId: 2, level: 3 }] });
    const order = result.learningOrder.map((s) => s.name);
    assert.ok(order.indexOf('Statistics') < order.indexOf('Machine Learning'));
    assert.equal(priorityLabel(0), 'Met');
    const custom = buildLearningOrder([
      { name: 'B', priorityValue: 60, industryScore: 90, prerequisites: ['A'] },
      { name: 'A', priorityValue: 10, industryScore: 30, prerequisites: [] },
    ]);
    assert.deepEqual(custom.map((s) => s.name), ['A', 'B']);
    assert.equal(custom[0].note, 'Prerequisite for B');
  });

  test('a student with no skills has readiness 0 and every required skill is a gap', () => {
    const result = computeSkillGap({ roleSkills, studentSkills: [] });
    assert.equal(result.readiness, 0);
    assert.equal(result.counts.gaps, result.rows.length);
  });
});

describe('import helpers', () => {
  test('parses common date formats and rejects invalid ones', () => {
    assert.equal(parseDate('2026-10-05'), '2026-10-05');
    assert.equal(parseDate('05/10/2026'), '2026-10-05');
    assert.equal(parseDate('2026-02-30'), null);
    assert.equal(parseDate('not a date'), null);
  });

  test('dedupe key ignores case/whitespace and URL query strings', () => {
    const a = dedupeKey({ company: 'Acme', title: 'Data Analyst', location: 'Pune', postedDate: '2026-10-01', description: 'x' });
    const b = dedupeKey({ company: ' ACME ', title: 'data analyst', location: 'pune', postedDate: '2026-10-01', description: 'X' });
    assert.equal(a, b);
    assert.equal(dedupeKey({ url: 'https://x.com/job/1?utm=a' }), dedupeKey({ url: 'https://x.com/job/1' }));
  });

  test('CSV export escapes quotes and neutralises formulas', () => {
    const csv = toCsv([{ a: 'he said "hi"', b: '=HYPERLINK("x")' }], [{ key: 'a' }, { key: 'b' }]);
    assert.ok(csv.includes('"he said ""hi"""'));
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  });
});
