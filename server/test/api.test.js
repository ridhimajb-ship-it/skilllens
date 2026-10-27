import './env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { initDb, closeDb } from '../src/db/index.js';
import { migrate, seed } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';

let app;
let adminToken;
let studentToken;

before(async () => {
  await initDb();
  await migrate();
  await seed();
  app = createApp();
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@skilllens.test', password: 'admin-password-for-tests' });
  adminToken = res.body.token;
});

after(async () => {
  await closeDb();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('public API', () => {
  test('health check reports the database driver', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.ok, true);
    assert.match(res.body.database, /pglite/);
  });

  test('lists the 16 roles with demo-labelled data basis', async () => {
    const res = await request(app).get('/api/roles').expect(200);
    assert.equal(res.body.roles.length, 16);
    const ds = res.body.roles.find((r) => r.slug === 'data-scientist');
    assert.equal(ds.basis, 'data');
    assert.ok(ds.topSkills.length > 0);
    assert.equal(ds.postingCount, ds.demoPostingCount, 'all postings are demo at seed time');
  });

  test('role detail exposes hypothesis skills, tools and categories', async () => {
    const res = await request(app).get('/api/roles/data-scientist').expect(200);
    assert.equal(res.body.role.name, 'Data Scientist');
    assert.ok(res.body.role.coreSkills.some((s) => s.name === 'Python'));
    assert.ok(res.body.role.skillCategories.length > 3);
    await request(app).get('/api/roles/astronaut').expect(404);
  });

  test('skill analysis is flagged as demo and carries its sample size', async () => {
    const res = await request(app).get('/api/roles/data-scientist/skill-analysis').expect(200);
    const { dataBasis, skills, hypothesisCheck } = res.body;
    assert.equal(dataBasis.basis, 'data');
    assert.equal(dataBasis.containsDemo, true);
    assert.equal(dataBasis.demoOnly, true);
    assert.equal(dataBasis.postingTotal, 9);
    assert.ok(skills[0].score >= skills[skills.length - 1].score, 'skills are ranked');
    assert.ok(Array.isArray(hypothesisCheck.supported));
    const s = skills[0];
    assert.ok(s.industryDemand >= 0 && s.industryDemand <= 1);
  });

  test('skills endpoint supports search and the normalization tester', async () => {
    const res = await request(app).get('/api/skills?q=postgres').expect(200);
    assert.ok(res.body.skills.some((s) => s.name === 'PostgreSQL'));
    const norm = await request(app).post('/api/skills/normalize').send({ terms: ['Postgres', 'ReactJS', 'Underwater Welding'] }).expect(200);
    assert.deepEqual(norm.body.terms.map((t) => t.canonical[0] ?? null), ['PostgreSQL', 'React', null]);
  });

  test('research status never claims validation without real responses', async () => {
    const res = await request(app).get('/api/research-status').expect(200);
    assert.equal(res.body.problemValidation.status, 'Pending');
    assert.equal(res.body.problemValidation.note, 'Validation data will be populated through student research.');
    assert.equal(res.body.professionalData.status, 'Pending', 'demo responses do not count');
    assert.equal(res.body.jobMarketData.status, 'Pending');
    assert.equal(res.body.usingDemoData, true);
  });

  test('guest skill-gap computation', async () => {
    const res = await request(app).post('/api/skill-gap/compute')
      .send({ role: 'data-scientist', skills: [{ name: 'python 3', level: 3 }, { name: 'Basket weaving', level: 2 }] }).expect(200);
    assert.equal(res.body.saved, false);
    assert.ok(res.body.rows.length > 0);
    assert.equal(res.body.rows.find((r) => r.name === 'Python')?.studentLevel, 3);
    assert.ok(res.body.otherSkills.some((s) => s.name === 'Basket weaving'));
    await request(app).post('/api/skill-gap/compute').send({ role: 'data-scientist', skills: [{ name: 'x', level: 7 }] }).expect(400);
  });
});

describe('authentication', () => {
  test('registers a student, rejects duplicates and bad input', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Asha Student', email: 'Asha@Example.com', password: 'password123', role: 'student' }).expect(201);
    studentToken = res.body.token;
    assert.equal(res.body.user.email, 'asha@example.com');
    assert.equal(res.body.user.role, 'student');
    await request(app).post('/api/auth/register').send({ name: 'Asha', email: 'asha@example.com', password: 'password123' }).expect(409);
    await request(app).post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: 'short' }).expect(400);
  });

  test('admin accounts cannot be self-registered', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Mallory', email: 'm@example.com', password: 'password123', role: 'admin' }).expect(400);
  });

  test('login and /me', async () => {
    await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password' }).expect(401);
    const res = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'password123' }).expect(200);
    const me = await request(app).get('/api/auth/me').set(auth(res.body.token)).expect(200);
    assert.equal(me.body.user.name, 'Asha Student');
    await request(app).get('/api/auth/me').set(auth('garbage')).expect(401);
  });

  test('admin routes are protected', async () => {
    await request(app).get('/api/admin/analytics').expect(401);
    await request(app).get('/api/admin/analytics').set(auth(studentToken)).expect(403);
  });
});

describe('student journey', () => {
  test('profile, skills and saved skill gap', async () => {
    await request(app).post('/api/student/profile').set(auth(studentToken)).send({ targetRole: 'data-scientist', studyYear: '3rd year' }).expect(200);
    const skills = await request(app).post('/api/student/skills').set(auth(studentToken))
      .send({ skills: [{ name: 'Python', level: 2 }, { name: 'Postgres', level: 1 }, { name: 'My custom skill', level: 1 }] }).expect(200);
    assert.equal(skills.body.skills.length, 3);
    assert.ok(skills.body.skills.some((s) => s.name === 'PostgreSQL'));
    const gap = await request(app).get('/api/student/skill-gap').set(auth(studentToken)).expect(200);
    assert.equal(gap.body.saved, true);
    assert.equal(gap.body.role.slug, 'data-scientist');
    assert.ok(gap.body.readiness >= 0 && gap.body.readiness <= 100);
    assert.ok(gap.body.learningOrder.length > 0);
    const dash = await request(app).get('/api/student/dashboard').set(auth(studentToken)).expect(200);
    assert.equal(dash.body.gap.role.name, 'Data Scientist');
    assert.ok(dash.body.history.length >= 1);
    assert.ok(dash.body.roleAnalysis.topSkills.length > 0);
  });

  test('students cannot use the student API without a token', async () => {
    await request(app).get('/api/student/profile').expect(401);
  });
});

describe('surveys', () => {
  test('options endpoint', async () => {
    const res = await request(app).get('/api/surveys/options').expect(200);
    assert.equal(res.body.roles.length, 16);
    assert.ok(res.body.studentValidation.trustedSources.length > 0);
  });

  test('student validation survey stores real responses and moves research status', async () => {
    const body = {
      studyYear: '3rd year', decideMethods: ['YouTube / online videos', 'Seniors or alumni'], learnedNotUseful: 'Yes, once',
      confusingPart: "Don't know what to learn first", sourceCount: '4-5', conflictingAdvice: 'Often',
      trustedSources: ['Working professionals'], wouldUsePlatform: 'Probably', gapViewHelpful: 'Very helpful', consent: true,
    };
    await request(app).post('/api/student-validation').send(body).expect(201);
    await request(app).post('/api/student-validation').send({ ...body, consent: false }).expect(400);
    await request(app).post('/api/student-validation').send({ ...body, trustedSources: ['A', 'B'] }).expect(400);
    const status = await request(app).get('/api/research-status').expect(200);
    assert.equal(status.body.problemValidation.status, 'In Progress');
    assert.equal(status.body.problemValidation.responses, 1);
  });

  test('professional survey stores skills and requires at least one', async () => {
    const opts = await request(app).get('/api/surveys/options');
    const id = (name) => opts.body.skills.find((s) => s.name === name).id;
    const body = {
      role: 'data-scientist', industry: 'Product / SaaS', experienceBand: '3-5 years',
      skillsUsed: [id('Python'), id('SQL'), id('Statistics')], toolsUsed: [id('Jupyter')], otherSkills: 'Looker, Postgres',
      beginnerSkills: [id('SQL')], overemphasizedSkills: [id('Deep Learning')], beginnerMistakes: 'Skipping SQL.',
      willingToContribute: 'Yes, happy to', motivation: ['Help students prepare better'], consent: true,
    };
    await request(app).post('/api/professional-survey').send(body).expect(201);
    await request(app).post('/api/professional-survey').send({ ...body, skillsUsed: [], toolsUsed: [], otherSkills: null }).expect(400);
    const list = await request(app).get('/api/admin/professional-responses?origin=real').set(auth(adminToken)).expect(200);
    assert.equal(list.body.total, 1);
    assert.ok(list.body.rows[0].uses.includes('PostgreSQL'), 'free-text other skills are normalized');
    assert.ok(list.body.rows[0].other_skills.includes('Looker'), 'unrecognised skills are kept for review');
  });
});

describe('admin / research team', () => {
  const csv = [
    'company,job_title,location,posting_date,source,url,description,skills',
    'Acme,Data Analyst,Pune,2026-10-01,Company site,https://acme.example/jobs/1,"Analyse data with SQL and Power BI. Python is a plus.",Excel; Tableau',
    'Acme,Data Analyst,Pune,2026-10-01,Company site,https://acme.example/jobs/1,"Duplicate of the row above",SQL',
    'Beta,Chief Happiness Officer,Remote,2026-10-02,Company site,,"Make people happy.",Communication',
    ',,,,,,,',
  ].join('\n');

  test('preview validates without writing', async () => {
    const res = await request(app).post('/api/admin/import/jobs/preview').set(auth(adminToken)).send({ format: 'csv', content: csv }).expect(200);
    assert.equal(res.body.summary.duplicatesInFile, 1);
    assert.equal(res.body.summary.unclassified, 1);
    assert.deepEqual(res.body.rows[0].skills.sort(), ['Excel', 'Power BI', 'Python', 'SQL', 'Tableau']);
    const list = await request(app).get('/api/admin/job-postings?origin=imported').set(auth(adminToken)).expect(200);
    assert.equal(list.body.total, 0);
  });

  test('import writes rows, de-duplicates and re-runs the analysis', async () => {
    const first = await request(app).post('/api/admin/import/jobs').set(auth(adminToken)).send({ format: 'csv', content: csv, filename: 't.csv' }).expect(201);
    assert.equal(first.body.imported, 2);
    assert.ok(first.body.analysisRunId);
    const again = await request(app).post('/api/admin/import/jobs').set(auth(adminToken)).send({ format: 'csv', content: csv }).expect(201);
    assert.equal(again.body.imported, 0);
    assert.equal(again.body.duplicatesInDb, 2);
    const status = await request(app).get('/api/research-status');
    assert.equal(status.body.jobMarketData.status, 'Imported');
  });

  test('JSON import and malformed input', async () => {
    const json = JSON.stringify({ jobs: [{ title: 'Frontend Developer', description: 'React, TypeScript and CSS.' }] });
    const res = await request(app).post('/api/admin/import/jobs').set(auth(adminToken)).send({ format: 'json', content: json, analyze: false }).expect(201);
    assert.equal(res.body.imported, 1);
    await request(app).post('/api/admin/import/jobs').set(auth(adminToken)).send({ format: 'json', content: '{not json' }).expect(400);
  });

  test('analytics aggregates every section', async () => {
    const res = await request(app).get('/api/admin/analytics').set(auth(adminToken)).expect(200);
    const { overview, skills, students, professionals, quality } = res.body;
    assert.equal(overview.roles, 16);
    assert.ok(overview.jobs.demo > 100);
    assert.equal(overview.jobs.imported, 3);
    assert.equal(overview.students.total, 1, 'student response counts are not overwritten by account counts');
    assert.equal(overview.student_accounts, 1);
    assert.ok(skills.mostCommon.length > 0);
    assert.equal(students.count, 1);
    assert.ok(students.trustedSources.find((t) => t.label === 'Working professionals').count === 1);
    assert.ok(professionals.count > 1);
    assert.ok(quality.jobs.unclassified >= 1);
    assert.ok(quality.unmappedTerms.some((t) => t.term === 'Quantum Basket Weaving'));
  });

  test('analysis can exclude demo data and accepts custom weights', async () => {
    const res = await request(app).post('/api/admin/analyze').set(auth(adminToken))
      .send({ includeDemo: false, weights: { industry: 1, professional: 0, beginner: 0 } }).expect(201);
    assert.equal(res.body.run.includes_demo, false);
    const da = await request(app).get('/api/roles/data-analyst/skill-analysis').expect(200);
    assert.equal(da.body.dataBasis.postingTotal, 1, 'only the imported Data Analyst posting is used');
    assert.equal(da.body.dataBasis.containsDemo, false);
    const ds = await request(app).get('/api/roles/data-scientist/skill-analysis').expect(200);
    assert.equal(ds.body.dataBasis.postingTotal, 0);
    assert.equal(ds.body.dataBasis.professionalTotal, 1, 'the real professional response is used');
    await request(app).post('/api/admin/analyze').set(auth(adminToken)).send({ weights: { industry: 0, professional: 0, beginner: 0 } }).expect(400);
  });

  test('CSV exports and templates', async () => {
    const res = await request(app).get('/api/admin/student-validation/export.csv').set(auth(adminToken)).expect(200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.text, /would_use_platform/);
    await request(app).get('/api/admin/job-postings/export.csv').set(auth(adminToken)).expect(200);
    await request(app).get('/api/admin/templates/jobs').set(auth(adminToken)).expect(200);
  });

  test('alias management and research decision', async () => {
    const skills = await request(app).get('/api/skills?q=Power BI');
    const pbi = skills.body.skills.find((s) => s.name === 'Power BI');
    await request(app).post(`/api/admin/skills/${pbi.id}/aliases`).set(auth(adminToken)).send({ alias: 'PBI Desktop' }).expect(201);
    await request(app).post(`/api/admin/skills/${pbi.id}/aliases`).set(auth(adminToken)).send({ alias: 'pbi desktop' }).expect(409);
    const norm = await request(app).post('/api/skills/normalize').send({ terms: ['PBI Desktop'] });
    assert.equal(norm.body.terms[0].canonical[0], 'Power BI');
    const status = await request(app).put('/api/admin/research-status').set(auth(adminToken)).send({ status: 'validated', note: 'test' }).expect(200);
    assert.equal(status.body.problemValidation.status, 'Validated');
  });

  test('demo data can be removed entirely', async () => {
    await request(app).delete('/api/admin/demo-data').set(auth(adminToken)).send({ confirm: 'yes' }).expect(400);
    const res = await request(app).delete('/api/admin/demo-data').set(auth(adminToken)).send({ confirm: 'DELETE DEMO DATA' }).expect(200);
    assert.ok(res.body.deleted.jobPostings > 100);
    const status = await request(app).get('/api/research-status');
    assert.equal(status.body.usingDemoData, false);
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    assert.match(res.body.error, /No API route/);
  });
});
