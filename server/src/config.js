import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(here, '..', '..');

// .env lives at the project root so the server, client and scripts share it.
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

const env = process.env;
const isTest = env.NODE_ENV === 'test';
const isProduction = env.NODE_ENV === 'production';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set (32+ characters) in production. Run `npm run setup`.');
  }
  // Development/test fallback: a random per-process secret (sessions reset on restart).
  jwtSecret = crypto.randomBytes(48).toString('hex');
  if (!isTest) console.warn('[config] JWT_SECRET not set — using a temporary random secret. Run `npm run setup`.');
}

export const config = {
  env: env.NODE_ENV || 'development',
  isTest,
  isProduction,
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL || '',
  // 'memory' keeps the embedded database in RAM (used by tests).
  pgliteDataDir: env.PGLITE_DATA_DIR || (isTest ? 'memory' : path.join(PROJECT_ROOT, 'server', '.data', 'pglite')),
  jwtSecret,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
  seedDemoData: bool(env.SEED_DEMO_DATA, true),
  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Research Admin',
  },
  demoStudent: {
    email: env.DEMO_STUDENT_EMAIL || '',
    password: env.DEMO_STUDENT_PASSWORD || '',
  },
  paths: {
    taxonomySkills: path.join(PROJECT_ROOT, 'data', 'taxonomy', 'skills.json'),
    taxonomyRoles: path.join(PROJECT_ROOT, 'data', 'taxonomy', 'roles.json'),
    demoJobs: path.join(PROJECT_ROOT, 'data', 'demo', 'job_postings_demo.csv'),
    demoProfessionals: path.join(PROJECT_ROOT, 'data', 'demo', 'professional_responses_demo.json'),
  },
};
