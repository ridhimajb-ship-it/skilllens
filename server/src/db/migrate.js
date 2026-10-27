/**
 * Schema migration and seeding.
 *  - migrate():       creates tables (idempotent)
 *  - syncTaxonomy():  upserts skills, aliases, roles and the hypothesis role->skill map from data/taxonomy
 *  - seed():          admin account (from env), clearly-marked demo data (once), demo student, first analysis run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db } from './index.js';
import { normalizeTerm } from '../services/normalizer.js';
import { invalidateTaxonomy, getTaxonomy } from '../services/taxonomy.js';
import { importJobs, insertProfessionalResponse } from '../services/importer.js';
import { runAnalysis, latestRun } from '../services/scoring.js';
import { getSetting, setSetting } from '../services/researchStatus.js';
import { EXPERIENCE_BAND_YEARS } from '../services/surveyOptions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const log = (...args) => { if (!config.isTest) console.log('[db]', ...args); };

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await db.exec(sql);
}

const slugify = (s) => s.toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function syncTaxonomy(paths = config.paths) {
  const skillsDoc = JSON.parse(fs.readFileSync(paths.taxonomySkills, 'utf8'));
  const rolesDoc = JSON.parse(fs.readFileSync(paths.taxonomyRoles, 'utf8'));

  await db.transaction(async (tx) => {
    const ids = new Map();
    for (const s of skillsDoc.skills) {
      const { rows: [row] } = await tx.query(
        `INSERT INTO skills (name, slug, category, type, description, metadata) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, type = EXCLUDED.type,
           description = EXCLUDED.description, metadata = EXCLUDED.metadata
         RETURNING id`,
        [s.name, slugify(s.name), s.category, s.type, s.description || '', JSON.stringify({ prerequisites: s.prerequisites || [] })],
      );
      ids.set(s.name, row.id);
      const aliases = [
        ...(s.aliases || []).map((a) => [a, false]),
        ...(s.caseSensitiveAliases || []).map((a) => [a, true]),
      ];
      for (const [alias, cs] of aliases) {
        await tx.query(
          `INSERT INTO skill_aliases (skill_id, alias, alias_normalized, case_sensitive) VALUES ($1, $2, $3, $4)
           ON CONFLICT (alias_normalized, case_sensitive) DO NOTHING`,
          [row.id, alias, cs ? alias : normalizeTerm(alias), cs],
        );
      }
    }
    for (const r of rolesDoc.roles) {
      const metadata = {
        titlePatterns: r.titlePatterns || [],
        classificationPriority: r.classificationPriority ?? 99,
        seedListOriginal: r.seedListOriginal || [],
        hypothesisNote: 'Initial skill list supplied by the project team; to be validated with job-posting and professional data.',
      };
      const { rows: [row] } = await tx.query(
        `INSERT INTO roles (slug, name, category, description, metadata) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
           description = EXCLUDED.description, metadata = EXCLUDED.metadata
         RETURNING id`,
        [r.slug, r.name, r.category, r.description, JSON.stringify(metadata)],
      );
      for (const [tier, list] of [['core', r.core], ['secondary', r.secondary]]) {
        for (const name of list) {
          const skillId = ids.get(name);
          if (!skillId) throw new Error(`Role ${r.slug} references unknown skill "${name}"`);
          await tx.query(
            `INSERT INTO role_skills (role_id, skill_id, tier, source) VALUES ($1, $2, $3, 'seed_hypothesis')
             ON CONFLICT (role_id, skill_id) DO UPDATE SET tier = EXCLUDED.tier`,
            [row.id, skillId, tier],
          );
        }
      }
    }
    await tx.query(
      `INSERT INTO settings (key, value) VALUES ('text_extraction_stop_aliases', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(skillsDoc.textExtractionStopAliases || [])],
    );
  });
  invalidateTaxonomy();
}

async function ensureUser({ email, password, name, role }) {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (rows.length) return rows[0].id;
  const hash = await bcrypt.hash(password, 10);
  const { rows: [user] } = await db.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [email.toLowerCase(), hash, name, role],
  );
  log(`created ${role} account ${email}`);
  return user.id;
}

export async function seedDemoData(paths = config.paths) {
  if (await getSetting('demo_seeded', false)) return false;

  if (fs.existsSync(paths.demoJobs)) {
    const content = fs.readFileSync(paths.demoJobs, 'utf8');
    const result = await importJobs({ format: 'csv', content, dataOrigin: 'demo', filename: path.basename(paths.demoJobs) });
    log(`demo job postings imported: ${result.imported}`);
  }
  if (fs.existsSync(paths.demoProfessionals)) {
    const doc = JSON.parse(fs.readFileSync(paths.demoProfessionals, 'utf8'));
    const { roleBySlug, normalizer } = await getTaxonomy();
    const ids = (names) => normalizer.resolveList(names).skills.map((s) => s.id);
    await db.transaction(async (tx) => {
      const { rows: [batch] } = await tx.query(
        `INSERT INTO import_batches (kind, filename, data_origin, rows_total, rows_imported) VALUES ('professional', $1, 'demo', $2, $2) RETURNING id`,
        [path.basename(paths.demoProfessionals), doc.responses.length],
      );
      for (const r of doc.responses) {
        const role = roleBySlug.get(r.role);
        if (!role) continue;
        await insertProfessionalResponse(tx, {
          roleId: role.id,
          industry: r.industry,
          experienceBand: r.experienceBand,
          yearsExperience: EXPERIENCE_BAND_YEARS[r.experienceBand] ?? null,
          uses: ids([...(r.skillsUsed || []), ...(r.toolsUsed || [])]),
          beginner: ids(r.beginnerSkills || []),
          overemphasized: ids(r.overemphasizedSkills || []),
          beginnerMistakes: r.beginnerMistakes || null,
          wishLearnedEarlier: r.wishLearnedEarlier || null,
          workReality: r.workReality || null,
          willingToContribute: r.willingToContribute || null,
          motivation: r.motivation || [],
        }, 'demo', batch.id);
      }
    });
    log(`demo professional responses imported: ${doc.responses.length}`);
  }
  await setSetting('demo_seeded', true);
  return true;
}

async function seedDemoStudent() {
  const { email, password } = config.demoStudent;
  if (!email || !password) return;
  const userId = await ensureUser({ email, password, name: 'Demo Student', role: 'student' });
  const { rows } = await db.query('SELECT 1 FROM student_profiles WHERE user_id = $1', [userId]);
  if (rows.length) return;
  const { roleBySlug, normalizer } = await getTaxonomy();
  await db.query(
    'INSERT INTO student_profiles (user_id, target_role_id, education_level, study_year) VALUES ($1, $2, $3, $4)',
    [userId, roleBySlug.get('data-scientist').id, 'B.Tech (Computer Science)', '3rd year'],
  );
  // A clearly synthetic starting profile so the dashboard is not empty in a demo.
  const demoSkills = [['Python', 2], ['SQL', 1], ['Statistics', 1], ['Excel', 3], ['Git', 2], ['Data Visualization', 1], ['Communication', 2]];
  for (const [name, level] of demoSkills) {
    const skill = normalizer.resolveOne(name);
    await db.query('INSERT INTO student_skills (user_id, skill_id, level) VALUES ($1, $2, $3)', [userId, skill.id, level]);
  }
}

export async function seed() {
  await syncTaxonomy();
  if (config.admin.email && config.admin.password) {
    await ensureUser({ email: config.admin.email, password: config.admin.password, name: config.admin.name, role: 'admin' });
  } else if (!config.isTest) {
    console.warn('[db] ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account created. Run `npm run setup`.');
  }
  if (config.seedDemoData) await seedDemoData();
  await seedDemoStudent();
  if (!(await latestRun())) {
    await runAnalysis({ includeDemo: true });
    log('initial analysis run complete');
  }
}
