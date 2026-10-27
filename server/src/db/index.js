/**
 * Database adapter.
 *
 * SkillLens speaks PostgreSQL everywhere. Two drivers are supported behind one tiny interface:
 *   - DATABASE_URL set  -> a real PostgreSQL server via `pg`
 *   - otherwise         -> PGlite, PostgreSQL compiled to WebAssembly (zero-install, file or memory backed)
 *
 * Interface: query(sql, params) -> { rows }, exec(sql), transaction(fn), close().
 * All queries use $1-style parameters, so user input is never concatenated into SQL.
 */
import fs from 'node:fs';
import { config } from '../config.js';

let driver = null;

async function createPgDriver(connectionString) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    name: 'postgres',
    query: async (text, params = []) => ({ rows: (await pool.query(text, params)).rows }),
    exec: async (text) => { await pool.query(text); },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (t, p = []) => ({ rows: (await client.query(t, p)).rows }) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDriver(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  let db;
  if (dataDir === 'memory') {
    db = new PGlite();
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new PGlite(dataDir);
  }
  await db.waitReady;
  return {
    name: dataDir === 'memory' ? 'pglite (in-memory)' : 'pglite',
    query: async (text, params = []) => ({ rows: (await db.query(text, params)).rows }),
    exec: async (text) => { await db.exec(text); },
    transaction: (fn) => db.transaction((tx) => fn({ query: async (t, p = []) => ({ rows: (await tx.query(t, p)).rows }) })),
    close: () => db.close(),
  };
}

export async function initDb(options = {}) {
  if (driver) return driver;
  const url = options.databaseUrl ?? config.databaseUrl;
  driver = url ? await createPgDriver(url) : await createPgliteDriver(options.pgliteDataDir ?? config.pgliteDataDir);
  return driver;
}

function ensure() {
  if (!driver) throw new Error('Database not initialised. Call initDb() first.');
  return driver;
}

export const db = {
  query: (text, params) => ensure().query(text, params),
  exec: (text) => ensure().exec(text),
  transaction: (fn) => ensure().transaction(fn),
  get driverName() { return driver?.name ?? 'uninitialised'; },
};

export async function closeDb() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
