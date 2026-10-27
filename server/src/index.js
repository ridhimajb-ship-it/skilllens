import { config } from './config.js';
import { initDb, closeDb, db } from './db/index.js';
import { migrate, seed } from './db/migrate.js';
import { createApp } from './app.js';

async function main() {
  await initDb();
  await migrate();
  await seed();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`SkillLens API listening on http://localhost:${config.port} (database: ${db.driverName})`);
  });
  const shutdown = async () => {
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start SkillLens API:', err);
  process.exit(1);
});
