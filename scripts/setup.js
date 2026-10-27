/**
 * One-time local setup: creates .env from .env.example with freshly generated secrets.
 * Prints the generated admin / demo-student passwords once. Re-running never overwrites an existing .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (fs.existsSync(envPath)) {
  console.log('.env already exists — leaving it unchanged. Delete it and re-run `npm run setup` to regenerate secrets.');
  process.exit(0);
}

const password = () => crypto.randomBytes(9).toString('base64url');
const adminPassword = password();
const studentPassword = password();
let env = fs.readFileSync(examplePath, 'utf8');
env = env
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`)
  .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${adminPassword}`)
  .replace(/^DEMO_STUDENT_PASSWORD=.*$/m, `DEMO_STUDENT_PASSWORD=${studentPassword}`);
fs.writeFileSync(envPath, env, { mode: 0o600 });

const email = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
console.log('Created .env with generated secrets.\n');
console.log('Accounts created when the server first starts:');
console.log(`  Admin         ${email('ADMIN_EMAIL')}  /  ${adminPassword}`);
console.log(`  Demo student  ${email('DEMO_STUDENT_EMAIL')}  /  ${studentPassword}`);
console.log('\nThese passwords are stored only in your local .env file.');
console.log('Next: npm run dev   (API on http://localhost:4000, web app on http://localhost:5173)');
