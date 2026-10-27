/** Apply the schema and seed data to the configured database, then exit. Usage: npm run db:seed */
import { initDb, closeDb, db } from './index.js';
import { migrate, seed } from './migrate.js';

await initDb();
await migrate();
await seed();
console.log(`Schema applied and seed complete (${db.driverName}).`);
await closeDb();
