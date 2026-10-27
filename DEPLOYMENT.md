# Deploying SkillLens to Vercel

The whole app runs on **one Vercel project**: the React site is served as static files and the Express API runs as a serverless function (`api/index.js`). Data lives in a free **Neon PostgreSQL** database that you connect from inside Vercel. Every push to `main` on GitHub redeploys automatically.

> Why not the embedded database? Vercel functions have a temporary file system, so PGlite data would vanish. In production SkillLens uses a real PostgreSQL database via `DATABASE_URL` (or `POSTGRES_URL`) — same schema, same SQL.

## One-time setup (about 10 minutes)

### 1. Import the GitHub repository
1. Sign in at **https://vercel.com** with your GitHub account.
2. **Add New… → Project** → import **`skilllens`**.
3. Framework preset: leave as detected / **Other** — `vercel.json` already sets the install command, build command, output folder and API routing.
4. Open **Environment Variables** and paste the contents of your local, git-ignored `.env.vercel` file (Vercel accepts a pasted `.env` block). It contains:

   | Variable | Purpose |
   |---|---|
   | `JWT_SECRET` | signs login tokens (required in production) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | the research-admin account created on first start |
   | `DEMO_STUDENT_EMAIL`, `DEMO_STUDENT_PASSWORD` | optional demo student (remove both to skip) |
   | `SEED_DEMO_DATA` | `true` loads the clearly labelled synthetic demo dataset once |

   No `.env.vercel`? Generate values yourself: a 64+ character random `JWT_SECRET` and strong passwords.
5. Click **Deploy**. The website will load, but the API answers *503* until a database is connected — that is expected.

### 2. Add the database
1. In the project, open **Storage → Create Database → Neon (Serverless Postgres)** → free plan.
2. Pick a region near the function region (Vercel's default is Washington, D.C. / `iad1`, so a US-East Neon region keeps queries fast).
3. **Connect** it to the `skilllens` project for all environments. Vercel adds `DATABASE_URL` / `POSTGRES_URL` automatically.
4. **Deployments → ⋯ → Redeploy** the latest deployment so it picks up the new variables.

### 3. First start
Open the site and visit any page (or `https://<your-app>.vercel.app/api/health`). The first API request creates the tables, loads the taxonomy and the demo dataset, creates the admin account and runs the first analysis — a few seconds. Later cold starts take well under a second because unchanged data is skipped.

Sign in at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Day to day
- **Updates:** push to `main` → Vercel builds and deploys. Pull requests get preview URLs (they share the same database unless you give previews their own).
- **Logs:** Vercel project → **Logs** (startup errors are logged with the prefix `[startup]`).
- **Re-seeding / migrations by hand:** set `DATABASE_URL` locally to the Neon connection string and run `npm run db:seed` — it is idempotent.
- **Real data:** import it in Admin → Data management, then remove the demo data there.
- **Changing the admin password:** the account is only created if it does not exist. To rotate, change it in the database or delete the user and redeploy with new variables.

## Troubleshooting
| Symptom | Fix |
|---|---|
| API returns 503 "starting up or misconfigured" | Check Logs. Usually the database is not connected (step 2) or `JWT_SECRET` is missing. Redeploy after changing variables. |
| Login fails right after deploy | The admin is created from the variables present at first start. Confirm `ADMIN_EMAIL`/`ADMIN_PASSWORD` were set before the first API request. |
| Slow first request | Cold start + first-time seed. Subsequent requests are fast. |
| Function timeout on first start | Very distant DB region. Move the Neon database closer to `iad1`, or run `npm run db:seed` locally once. |

## Other hosts
The same build works on Render, Railway or Fly.io as a normal Node service: build the client (`npm run build`), start the API (`npm start`), set `DATABASE_URL`, `JWT_SECRET`, `TRUST_PROXY=1`, and serve `client/dist` from a static host or CDN with `/api` proxied to the API.
