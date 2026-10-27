/** Drops all SkillLens tables, then re-creates and re-seeds them. Development use only. */
import { config } from '../config.js';
import { initDb, closeDb, db } from './index.js';
import { migrate, seed } from './migrate.js';

if (config.isProduction) {
  console.error('Refusing to reset the database in production.');
  process.exit(1);
}

await initDb();
await db.exec(`
  DROP TABLE IF EXISTS skill_gap_results, skill_scores, analysis_runs, student_skills, student_profiles,
    student_validation_responses, professional_response_skills, professional_responses, professional_profiles,
    job_posting_skills, job_postings, import_batches, role_skills, skill_aliases, skills, roles, users, settings CASCADE;
`);
await migrate();
await seed();
console.log(`Database reset and re-seeded (${db.driverName}).`);
await closeDb();
