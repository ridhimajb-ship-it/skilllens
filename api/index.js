/**
 * Vercel serverless entry point: the whole Express API runs as one function.
 * vercel.json rewrites every /api/* request here; the original path is preserved in req.url.
 *
 * Everything is loaded lazily inside a try/catch, so a configuration problem (missing JWT_SECRET,
 * no database connected, wrong credentials) produces a readable 503 with a safe hint instead of an
 * opaque FUNCTION_INVOCATION_FAILED. Details go to the Vercel logs only.
 *
 * On a cold start the function connects to PostgreSQL, applies the schema and runs the idempotent
 * seed (taxonomy sync is skipped when unchanged; demo data is imported once).
 */
let appPromise = null;

function loadApp() {
  appPromise ||= (async () => {
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    // Imported here (not at the top) so import-time errors are caught and reported.
    const { initDb } = await import('../server/src/db/index.js');
    const { migrate, seed } = await import('../server/src/db/migrate.js');
    const { createApp } = await import('../server/src/app.js');
    await initDb();
    await migrate();
    await seed();
    return createApp();
  })().catch((err) => {
    appPromise = null; // retry on the next request instead of caching the failure
    throw err;
  });
  return appPromise;
}

/** Map a startup error to a hint that is safe to show publicly (no hostnames or secrets). */
export function diagnose(err) {
  const msg = `${err?.code || ''} ${err?.message || err}`;
  if (/JWT_SECRET/.test(msg)) {
    return { code: 'missing_jwt_secret', hint: 'JWT_SECRET is missing or shorter than 32 characters. Add it in Vercel → Settings → Environment Variables, then redeploy.' };
  }
  if (/DATABASE_URL is not set/.test(msg)) {
    return { code: 'missing_database', hint: 'No database is connected. Connect Neon in Vercel → Storage, then redeploy.' };
  }
  if (/password authentication|SASL|SCRAM|channel binding|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo|SSL|self.signed|28P01|3D000|timeout/i.test(msg)) {
    return { code: 'database_connection', hint: 'Could not connect to the database. Check that the Neon database is connected to this project and its connection string is valid.' };
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|ENOENT/.test(msg)) {
    return { code: 'missing_file', hint: 'A server file or package is missing from the deployment bundle.' };
  }
  return { code: 'startup_error', hint: 'Unexpected startup error. See the Vercel function logs for "[startup]".' };
}

export default async function handler(req, res) {
  let app;
  try {
    app = await loadApp();
  } catch (err) {
    console.error('[startup]', err);
    const { code, hint } = diagnose(err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'The SkillLens API could not start.', code, hint }));
    return;
  }
  app(req, res);
}
