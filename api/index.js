/**
 * Vercel serverless entry point: the whole Express API runs as one function.
 * vercel.json rewrites every /api/* request here; the original path is preserved in req.url.
 *
 * On a cold start the function connects to PostgreSQL (DATABASE_URL), applies the schema and runs the
 * idempotent seed (taxonomy sync is skipped when unchanged; demo data is imported once).
 */
import { initDb } from '../server/src/db/index.js';
import { migrate, seed } from '../server/src/db/migrate.js';
import { createApp } from '../server/src/app.js';

const app = createApp();
let ready = null;

function init() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('DATABASE_URL is not set. Connect a Postgres database to this Vercel project (see DEPLOYMENT.md).');
  }
  ready ||= (async () => {
    await initDb();
    await migrate();
    await seed();
  })().catch((err) => {
    ready = null; // retry on the next request instead of caching the failure
    throw err;
  });
  return ready;
}

export default async function handler(req, res) {
  try {
    await init();
  } catch (err) {
    console.error('[startup]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The SkillLens API is starting up or misconfigured. Check the deployment logs.' }));
    return;
  }
  return app(req, res);
}
