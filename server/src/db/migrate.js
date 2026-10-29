/**
 * Schema migration and seeding.
 *  - migrate():       creates tables (idempotent)
 *  - syncTaxonomy():  upserts skills, aliases, roles and the hypothesis role->skill map from data/taxonomy
 *  - seed():          admin account (from env), clearly-marked demo data (once), demo student, first analysis run
 */
import crypto from 'node:crypto';
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
import { getSetting } from '../services/researchStatus.js';
import { EXPERIENCE_BAND_YEARS } from '../services/surveyOptions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const log = (...args) => { if (!config.isTest) console.log('[db]', ...args); };

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await db.exec(sql);
}

const slugify = (s) => s.toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Build "($1,$2,...),($n,...)" placeholders for a multi-row INSERT. */
function placeholders(rowCount, width) {
  return Array.from({ length: rowCount }, (_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(',')})`).join(',');
}

/**
 * Upserts the taxonomy. Skipped when the taxonomy files are unchanged since the last sync
 * (fingerprint stored in settings), which keeps serverless cold starts fast.
 */
export async function syncTaxonomy(paths = config.paths) {
  const skillsRaw = fs.readFileSync(paths.taxonomySkills, 'utf8');
  const rolesRaw = fs.readFileSync(paths.taxonomyRoles, 'utf8');
  const fingerprint = crypto.createHash('sha1').update(skillsRaw).update(rolesRaw).digest('hex');
  if ((await getSetting('taxonomy_fingerprint', null)) === fingerprint) return false;
  const skillsDoc = JSON.parse(skillsRaw);
  const rolesDoc = JSON.parse(rolesRaw);

  await db.transaction(async (tx) => {
    const ids = new Map();
    const skillRows = skillsDoc.skills.map((s) => [s.name, slugify(s.name), s.category, s.type, s.description || '',
      JSON.stringify({ prerequisites: s.prerequisites || [] })]);
    const { rows: inserted } = await tx.query(
      `INSERT INTO skills (name, slug, category, type, description, metadata) VALUES ${placeholders(skillRows.length, 6)}
       ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, type = EXCLUDED.type,
         description = EXCLUDED.description, metadata = EXCLUDED.metadata
       RETURNING id, name`,
      skillRows.flat(),
    );
    for (const row of inserted) ids.set(row.name, row.id);

    // Aliases: first spelling wins when two skills claim the same normalized alias.
    const seen = new Set();
    const aliasRows = [];
    for (const s of skillsDoc.skills) {
      for (const [alias, cs] of [...(s.aliases || []).map((a) => [a, false]), ...(s.caseSensitiveAliases || []).map((a) => [a, true])]) {
        const norm = cs ? alias : normalizeTerm(alias);
        const key = `${norm}|${cs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        aliasRows.push([ids.get(s.name), alias, norm, cs]);
      }
    }
    for (let i = 0; i < aliasRows.length; i += 250) {
      const part = aliasRows.slice(i, i + 250);
      await tx.query(
        `INSERT INTO skill_aliases (skill_id, alias, alias_normalized, case_sensitive) VALUES ${placeholders(part.length, 4)}
         ON CONFLICT (alias_normalized, case_sensitive) DO NOTHING`,
        part.flat(),
      );
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
      const links = [['core', r.core], ['secondary', r.secondary]].flatMap(([tier, list]) => list.map((name) => {
        const skillId = ids.get(name);
        if (!skillId) throw new Error(`Role ${r.slug} references unknown skill "${name}"`);
        return [row.id, skillId, tier];
      }));
      await tx.query(
        `INSERT INTO role_skills (role_id, skill_id, tier) VALUES ${placeholders(links.length, 3)}
         ON CONFLICT (role_id, skill_id) DO UPDATE SET tier = EXCLUDED.tier`,
        links.flat(),
      );
    }
    await tx.query(
      `INSERT INTO settings (key, value) VALUES ('text_extraction_stop_aliases', $1), ('taxonomy_fingerprint', $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(skillsDoc.textExtractionStopAliases || []), JSON.stringify(fingerprint)],
    );
  });
  invalidateTaxonomy();
  return true;
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
  // Atomically claim the one-time demo seed, so two server instances starting together
  // (common on serverless platforms) cannot both import it.
  const { rows: claimed } = await db.query(
    "INSERT INTO settings (key, value) VALUES ('demo_seeded', 'true') ON CONFLICT (key) DO NOTHING RETURNING key",
  );
  if (claimed.length === 0) return false;

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
  const importedDemo = config.seedDemoData ? await seedDemoData() : false;
  await seedDemoStudent();
  if (importedDemo || !(await latestRun()) || (await latestRunIsStale())) {
    await runAnalysis({ includeDemo: true });
    log('analysis run complete');
  }
}

/**
 * True when the latest run used no data but data now exists. This happens when two server
 * instances start together: one runs the analysis while the other is still importing demo data.
 */
async function latestRunIsStale() {
  const run = await latestRun();
  if (!run || run.postings_used > 0 || run.responses_used > 0) return false;
  const { rows: [counts] } = await db.query(
    `SELECT (SELECT COUNT(*) FROM job_postings)::int AS postings,
            (SELECT COUNT(*) FROM professional_responses)::int AS responses`,
  );
  return counts.postings > 0 || counts.responses > 0;
}
