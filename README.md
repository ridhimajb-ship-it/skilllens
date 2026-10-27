# SkillLens — Bridging the Gap Between Education and Industry Skills

> **Know what to learn. Not just where to learn.**
> SkillLens connects industry requirements, professional insights and a student's current skills to show what to prioritise for a specific career role.

SkillLens is a working full-stack MVP built for a CPI (innovation project) demonstration. It is a **research prototype**: it *estimates* role-specific skill priorities from the job-posting and professional data that has been collected. It does not guarantee employment and does not replace mentors.

---

## Contents
1. [Problem & solution](#1-problem--solution)
2. [Quick start](#2-quick-start)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Folder structure](#5-folder-structure)
6. [Database schema](#6-database-schema)
7. [REST API](#7-rest-api)
8. [Skill normalization](#8-skill-normalization)
9. [Skill-ranking algorithm](#9-skill-ranking-algorithm)
10. [Skill-gap engine](#10-skill-gap-engine)
11. [Importing data](#11-importing-data)
12. [Python analysis pipeline](#12-python-analysis-pipeline)
13. [Real vs demo data](#13-real-vs-demo-data)
14. [Security](#14-security)
15. [Testing](#15-testing)
16. [Environment variables](#16-environment-variables)
17. [Limitations](#17-limitations)
18. [Future scope](#18-future-scope)

Related documents: [RESEARCH.md](RESEARCH.md) · [TEAM.md](TEAM.md) · [TESTING.md](TESTING.md) · [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel + Neon)

---

## 1. Problem & solution

**Problem.** Students are not short of learning content (YouTube, Coursera, Udemy, LinkedIn, certifications…). They are short of *prioritisation*. A student who wants to become a Data Scientist meets Python → SQL → Statistics → ML → Deep Learning → NLP → TensorFlow → PyTorch → Cloud → Docker → MLOps and asks: **"What should I learn first?"**

**Solution.** SkillLens combines three sources of evidence:

```
JOB POSTINGS  +  PROFESSIONAL INSIGHTS  +  STUDENT PROFILE
                        ↓
   cleaning → normalization → role classification → skill extraction
                        ↓
          transparent skill ranking (0–100, per role)
                        ↓
     role-specific skill map → student skill gap → learning priorities
```

User journeys implemented:

| Who | Journey |
|---|---|
| **Student** | choose a role → see ranked industry skills, tools and professional insights → add/rate own skills (or custom skills) → see gaps, strongest skills, high-priority skills and a prerequisite-aware learning order → dashboard tracks readiness over time. Works in guest mode too. |
| **Professional** | 4-step, 3–5 minute survey: role, industry, experience, skills & tools used, beginner priorities, overemphasised skills, beginner mistakes, what they wish they had learned earlier, willingness and motivation. |
| **Admin / research team** | data overview, student-validation analytics (with CSV export), professional analytics, skill analytics (most common skills, role comparison heat-map, industry vs professional), CSV/JSON import with preview & validation, records browser, data-quality monitor, alias management, analysis re-runs with custom weights, research-status decisions, one-click demo-data removal. |

---

## 2. Quick start

Prerequisites: **Node.js 20+** (tested on Node 24). Python 3.10+ is only needed for the offline analysis pipeline. **No database install is required** — see [Architecture](#3-architecture).

```bash
cd skilllens
npm install          # installs server + client (npm workspaces)
npm run setup        # creates .env with generated secrets and prints the admin / demo-student passwords
npm run dev          # API on http://localhost:4000, web app on http://localhost:5173
```

Open **http://localhost:5173**. On first start the server creates the schema, loads the taxonomy (16 roles, 161 skills, ~680 aliases), imports the clearly-labelled demo dataset, creates the admin and demo-student accounts from `.env`, and runs the first analysis.

| Account | Where it comes from |
|---|---|
| Admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (admins cannot self-register) |
| Demo student | `DEMO_STUDENT_EMAIL` / `DEMO_STUDENT_PASSWORD` in `.env` (optional, pre-filled Data Scientist profile) |
| Students / professionals | self-register at `/register` |

Other commands:

```bash
npm run test           # server + client tests
npm run test:analysis  # Python tests (pip install -r analysis/requirements.txt first)
npm run db:reset       # drop, re-create and re-seed the database (development only)
npm run db:seed        # apply schema + seed to the configured database (idempotent)
npm run build          # production build of the React app (client/dist)
npm run demo:generate  # regenerate the synthetic demo dataset
```

**Using a real PostgreSQL server** instead of the embedded one: create a database and set
`DATABASE_URL=postgres://user:password@localhost:5432/skilllens` in `.env`. The same schema and SQL run unchanged.

---

## 3. Architecture

```
┌────────────────────────────┐      /api (JSON, JWT)      ┌──────────────────────────────────────┐
│ React + Vite SPA (client/) │ ─────────────────────────▶ │ Node.js + Express REST API (server/) │
│ pages · components · charts│                            │ routes → services → db adapter       │
└────────────────────────────┘                            └──────────────┬───────────────────────┘
                                                                         │ SQL ($1 parameters)
                                              ┌──────────────────────────┴───────────────────────┐
                                              │ PostgreSQL (DATABASE_URL)  or  PGlite (embedded) │
                                              └──────────────────────────────────────────────────┘
┌──────────────────────────────────────┐   shared data/taxonomy/*.json + scoring fixture
│ Python / Pandas pipeline (analysis/) │ ◀──────────────────────────────────────────────▶ server
│ clean → classify → extract → rank    │   outputs importable CSVs + reports
└──────────────────────────────────────┘
```

* **Database.** SkillLens uses PostgreSQL SQL everywhere. If `DATABASE_URL` is set it connects to a PostgreSQL server via `pg`; otherwise it runs **PGlite** — PostgreSQL compiled to WebAssembly — stored in `server/.data/pglite`. This keeps the project runnable on any laptop with zero installs while staying on PostgreSQL.
* **Single source of truth for the taxonomy.** `data/taxonomy/skills.json` (canonical skills + aliases) and `roles.json` (16 roles + hypothesis skill lists) are read by both the server and the Python pipeline. On every start the server upserts them into the database.
* **Same algorithm in two languages.** The ranking formula is implemented in `server/src/services/scoring.js` (used live by the app) and `analysis/skilllens_pipeline/rank.py` (offline research). Both are tested against the same fixture, `data/fixtures/scoring_fixture.json`, so they cannot drift apart.

---

## 4. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, Recharts 3, lucide-react icons, hand-written CSS design system (blue/white) |
| Backend | Node.js, Express 4, zod validation, helmet, CORS allow-list, express-rate-limit, bcryptjs, JSON Web Tokens |
| Database | PostgreSQL (via `pg`) or embedded PGlite (PostgreSQL in WebAssembly) |
| Data analysis | Python 3, Pandas, NumPy, optional Matplotlib for charts |
| Tests | node:test + supertest (API), Vitest + Testing Library (UI), pytest (pipeline) |

---

## 5. Folder structure

```
skilllens/
├── README.md  RESEARCH.md  TEAM.md  TESTING.md
├── package.json              # npm workspaces + root scripts
├── .env.example              # copy via `npm run setup`
├── data/
│   ├── taxonomy/skills.json  # 161 canonical skills, aliases, categories, prerequisites
│   ├── taxonomy/roles.json   # 16 roles, title patterns, hypothesis core/secondary skills
│   ├── demo/                 # SYNTHETIC demo data (+ README explaining it)
│   ├── templates/            # CSV templates for imports
│   └── fixtures/             # shared scoring fixture (Node + Python)
├── server/
│   ├── src/
│   │   ├── index.js  app.js  config.js
│   │   ├── db/               # schema.sql, adapter (pg | PGlite), migrate & seed, reset
│   │   ├── middleware/       # auth (JWT, roles), zod validation, error handling
│   │   ├── routes/           # auth, roles, skills, student, surveys, admin
│   │   ├── services/         # normalizer, classifier, importer, scoring, skillGap, roleAnalysis, analytics, researchStatus
│   │   └── utils/            # CSV parse/export, HttpError
│   └── test/                 # unit.test.js, api.test.js
├── client/
│   └── src/
│       ├── api/client.js     # REST client
│       ├── context/          # AuthContext
│       ├── components/       # ui primitives, charts, SkillPicker, Layout, ResearchStatus, GapViews, SurveyKit
│       ├── pages/            # Landing, RoleExplorer, RoleDetail, Assessment, GapAnalysis, StudentDashboard,
│       │                     # ProfessionalSurvey, StudentSurvey, Research, Auth, admin/*
│       ├── styles/global.css
│       └── test/             # component + page tests
├── analysis/
│   ├── skilllens_pipeline/   # normalize, classify, rank, pipeline
│   ├── run_pipeline.py       # CLI
│   ├── tests/                # pytest
│   └── requirements.txt
└── scripts/                  # setup.js, generate-demo-data.js
```

---

## 6. Database schema

All tables are defined in [`server/src/db/schema.sql`](server/src/db/schema.sql) (foreign keys + indexes).

| Table | Purpose |
|---|---|
| `users` | email, bcrypt hash, name, role (`student` / `professional` / `admin`) |
| `roles` | 16 career roles; `metadata` holds title patterns, classification priority and the original seed list |
| `skills` | canonical skill name, slug, category, type (language/framework/library/tool/platform/concept/practice/soft_skill), description, prerequisites |
| `skill_aliases` | alias → skill (normalized, unique), optional case-sensitive aliases such as `R` |
| `role_skills` | the team's **initial hypothesis** (core / secondary) per role |
| `import_batches` | every import with origin, counts and a JSON report |
| `job_postings` | company, title, role, location, date, source, URL, description, experience, education, certifications, unmapped terms, `data_origin`, `dedupe_key` (unique) |
| `job_posting_skills` | extracted skills per posting and whether they came from a skills column or the description |
| `professional_profiles` | optional profile for registered professionals |
| `professional_responses` | survey answers (role, industry, experience, free text, motivation) + `data_origin` |
| `professional_response_skills` | skills per response with kind `uses` / `beginner` / `overemphasized` |
| `student_validation_responses` | the 8 validation questions + context + `data_origin` |
| `student_profiles`, `student_skills` | target role and self-rated skills (1 Beginner, 2 Intermediate, 3 Advanced; custom skills allowed) |
| `analysis_runs` | each ranking run: weights, include-demo flag, origins used, sample sizes |
| `skill_scores` | per run × role × skill: score, tier, D/P/B components, specificity, counts, rank, in-hypothesis flag |
| `skill_gap_results` | saved gap analyses (readiness history) |
| `settings` | research-status decision, stop-alias list, demo-seeded flag |

---

## 7. REST API

Base URL `/api`. JSON in/out. Protected routes need `Authorization: Bearer <token>`. Errors: `{ "error": "message", "details": [...] }` with 400/401/403/404/409/413/500.

**Public**

| Method & path | Description |
|---|---|
| `GET /health` | health + database driver |
| `GET /research-status` | problem validation / professional data / job-market data status |
| `GET /meta` | algorithm formula, weights in use, latest run |
| `GET /roles` | 16 roles with top skills, top tools, skill count, postings analysed, confidence |
| `GET /roles/:slug` | role record: description, categories, core/secondary hypothesis skills, tools, technologies |
| `GET /roles/:slug/skills` | ranked skills (or hypothesis list if no data) |
| `GET /roles/:slug/skill-analysis` | full analysis: data basis, ranked skills with D/P/B, tools, categories, hypothesis check, professional insights, posting facts |
| `GET /skills?q=&category=` | taxonomy search incl. aliases |
| `POST /skills/normalize` | `{terms:[...], text?}` → canonical mapping (normalization tester) |
| `POST /skill-gap/compute` | guest skill gap: `{role, skills:[{skillId?|name, level}]}` |
| `GET /surveys/options` | answer options, roles, skills |
| `POST /student-validation` | submit student validation survey (rate-limited) |
| `POST /professional-survey` | submit professional survey (rate-limited; links to account if signed in) |

**Auth** — `POST /auth/register` (`student` or `professional` only), `POST /auth/login`, `GET /auth/me`.

**Student** (role `student`) — `GET/POST /student/profile`, `GET/POST /student/skills` (replaces the set; names are normalized, unknown names stored as custom skills), `GET /student/skill-gap?role=` (computes + saves), `GET /student/dashboard`.

**Admin** (role `admin`)

| Method & path | Description |
|---|---|
| `GET /admin/analytics` | overview, skill analytics, student validation analytics, professional analytics, data quality, research status |
| `GET /admin/data-quality` | data-quality report only |
| `GET /admin/job-postings?role=&origin=&q=&page=&pageSize=` | paginated postings |
| `GET /admin/job-postings/export.csv` | CSV export (same filters) |
| `GET /admin/professional-responses[?origin=]`, `/export.csv` | responses + export |
| `GET /admin/student-validation`, `/export.csv` | responses + export |
| `POST /admin/import/{jobs|professional|student-validation}/preview` | validate a file without writing |
| `POST /admin/import/{jobs|professional|student-validation}` | import (`{format, content, filename, dataOrigin, analyze}`) |
| `GET /admin/templates/{jobs|professional|student-validation}` | CSV templates |
| `POST /admin/analyze` | `{includeDemo, weights:{industry, professional, beginner}}` → new analysis run |
| `GET /admin/analysis-runs` | run history |
| `POST /admin/skills/:id/aliases` | add an alias |
| `PUT /admin/research-status` | record `validated` / `not_validated` / `null` with a note |
| `DELETE /admin/demo-data` | `{confirm:"DELETE DEMO DATA"}` removes all demo records and re-runs the analysis |

---

## 8. Skill normalization

Different postings write the same skill differently. Each canonical skill has aliases, a category, a type and a description:

```
PostgreSQL ← postgres, postgresql db, postgres db, psql, pgsql
React      ← react.js, reactjs, react js, react hooks
Python     ← python 3, python3, python programming, …
SQL        ← structured query language, t-sql, pl/sql, …
```

Resolution of an explicit term (skills column, survey, student input): exact alias → strip filler words ("experience with", "programming", "db") → compact form ("React JS" = "react.js" = "reactjs") → split compound terms (`AWS/Azure` → AWS + Azure, but `CI/CD` stays one skill). Unresolved terms are kept as **unmapped** and listed in the data-quality monitor, where an admin can map them to a skill in one click.

Extraction from free-text descriptions is stricter: longest alias wins (`Java` never matches inside `JavaScript`, `SQL` never inside `MySQL`); ambiguous words (`rest`, `node`, `less`, `express`, `spring`…) are only matched case-sensitively and not at the start of a sentence; `R` must stand alone (not `R&D`).

---

## 9. Skill-ranking algorithm

Transparent, reproducible and documented — no opaque AI score.

For role *r* and skill *s*, three shares in [0, 1]:

| Signal | Definition |
|---|---|
| **D** — industry demand | postings for *r* that mention *s* ÷ all postings for *r* |
| **P** — professional usage | professionals in *r* who use *s* regularly ÷ all professionals in *r* |
| **B** — beginner importance | professionals in *r* naming *s* important for beginners ÷ all professionals in *r* |

```
Score(r, s) = 100 × (wD·D + wP·P + wB·B) / (sum of weights of the signals that have data)
default weights: wD = 0.50, wP = 0.35, wB = 0.15
Tiers: Very High ≥ 80 · High 60–79 · Moderate 40–59 · Low 20–39 · Minimal < 20
```

* **Missing signals** are dropped and the remaining weights renormalised (postings only → score = 100·D). The UI always shows the sample size behind each score.
* **Role specificity** = D_r / (D_r + mean D in other roles); reported but *not* part of the score, because universal skills (Git, Communication) can be both common and essential.
* **Confidence** (sample size only): High ≥ 30 postings and ≥ 5 professionals; Medium ≥ 10 postings or ≥ 3 professionals; otherwise Low.
* Duplicate mentions inside one posting count once. Ties are broken by hypothesis membership, then skill id (deterministic).
* Admins can re-run the analysis with different weights (sensitivity analysis) and with or without demo data. Each run is stored, so results are reproducible.
* Roles with no data show the **hypothesis** list without scores.

Worked example (from the shared fixture): a role with 4 postings and 2 professional responses; a skill in 3/4 postings, used by 2/2 professionals and named for beginners by 2/2 → `100 × (0.5·0.75 + 0.35·1 + 0.15·1) / 1.0 = 87.5` → **Very High**.

---

## 10. Skill-gap engine

Rule-based and explainable (`server/src/services/skillGap.js`):

1. **Required skills** — the role's top 15 skills with score ≥ 25.
2. **Expected level** — score ≥ 75 → Advanced (3), ≥ 45 → Intermediate (2), otherwise Beginner (1). *A stated assumption.*
3. **Gap** = max(0, expected − student level) (student level 0 = not yet).
4. **Priority value** = score × gap ÷ 3 → Very High ≥ 50, High ≥ 30, Medium ≥ 15, Low > 0, Met = 0.
5. **Readiness** = Σ score·min(student, expected) ÷ Σ score·expected × 100.
6. **Learning order** — by priority, but unmet prerequisites (from the taxonomy, e.g. Python & Statistics before Machine Learning) are moved in front of the skill that depends on them, with a note explaining why.

Outputs: strongest skills, biggest gaps, high-priority skills, learning order, and a table with *why* for every row (e.g. "in 89% of postings, used by 100% of professionals surveyed; you: Beginner, expected: Advanced").

---

## 11. Importing data

**Admin → Data management → Import data**: choose dataset → choose origin (`Imported` or `Real`) → upload CSV/JSON → **Preview & validate** (column mapping, invalid rows, duplicates, unclassified postings, unmapped terms, per-role counts) → **Import** → skills normalised → analysis re-run → dashboards update.

* **Job postings** — template `data/templates/job_postings_template.csv`. Required: a title column (`job_title`/`title`/`position`) and either a description or a skills/tools column. Optional: company, role_category, location, posting_date (YYYY-MM-DD or DD/MM/YYYY), source, url, skills, tools, experience, education, certifications. Common header synonyms are accepted. JSON may be an array or `{ "jobs": [...] }`.
* **Professional responses** — template `professional_responses_template.csv` (role, industry, years_experience or band, skills_used, tools_used, beginner_skills, overemphasized_skills, free-text fields). Lists use `;`.
* **Student validation responses** — template `student_validation_template.csv` (useful for paper/Google-Form responses).

De-duplication: by URL (query string ignored) or by normalised company + title + location + date + description prefix — both within a file and against the database.

Job postings must be collected in line with each site's terms of use (manual collection, exports, public hiring reports, company career pages). SkillLens does not scrape websites.

---

## 12. Python analysis pipeline

```bash
cd analysis
pip install -r requirements.txt
python run_pipeline.py --input ../data/demo/job_postings_demo.csv \
                       --professionals ../data/demo/professional_responses_demo.json \
                       --out output/demo --charts
```

Pipeline: raw data → cleaning (header mapping, HTML stripping, whitespace, date parsing, invalid-row removal) → de-duplication → role classification → skill extraction + normalization → skill de-duplication → frequency calculation → ranking. Outputs:

| File | Content |
|---|---|
| `processed_job_postings.csv` | cleaned postings with canonical skills — import it in Admin → Data management |
| `skill_frequency_by_role.csv` | share of each role's postings mentioning each skill |
| `skill_scores.csv` | SkillLens scores with every component |
| `quality_report.json` | rows dropped, duplicates, unclassified, unmapped terms, postings per role |
| `charts/<role>.png` | top-skill bar charts (needs matplotlib) |

---

## 13. Real vs demo data

| Label | Meaning |
|---|---|
| **Real** | submitted through the live surveys, or postings collected by the team with source/URL and imported as "Real" |
| **Imported** | uploaded by the team with unverified provenance |
| **Demo** | synthetic, generated by `scripts/generate-demo-data.js` from the *hypothesis* taxonomy — rankings therefore mirror the hypothesis |
| **Hypothesis** | the team's initial skill list per role (shown without scores) |
| **Illustrative** | example values in explanations (e.g. the landing-page preview) |

Every record stores `data_origin`. Any page that uses demo data shows **"Demo data — replace with validated research data."** Research-status counts exclude demo records. Student validation has **no** demo data: until real responses exist the dashboard shows *"Validation data will be populated through student research."* Admins can delete all demo data in one click.

---

## 14. Security

* Passwords hashed with bcrypt (cost 10); constant-time comparison against a dummy hash for unknown emails.
* JWT auth (`JWT_SECRET` from env; the server refuses to start in production without one). User and role are re-loaded from the database on each request.
* Role-based access: admin routes require `admin`; admins cannot self-register.
* Every input validated with zod; all SQL uses `$1` parameters (no string concatenation of user input).
* helmet security headers, CORS allow-list (`CORS_ORIGIN`), rate limits on auth and survey endpoints, 8 MB body limit.
* CSV exports neutralise formula injection (`=`, `+`, `-`, `@`).
* No secrets in the repository: `npm run setup` generates them into `.env` (git-ignored).

---

## 15. Testing

```bash
npm run test           # 45 server tests (unit + API integration) and 12 client tests
npm run test:analysis  # 22 Python tests
```

See [TESTING.md](TESTING.md) for what each suite covers and a manual demo checklist.

---

## 16. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `NODE_ENV` | development | `production` enforces `JWT_SECRET` |
| `CORS_ORIGIN` | http://localhost:5173 | comma-separated allowed origins |
| `DATABASE_URL` | *(empty)* | PostgreSQL connection string; empty = embedded PGlite |
| `PGLITE_DATA_DIR` | server/.data/pglite | embedded database location (`memory` for RAM) |
| `JWT_SECRET` | *(generated)* | 32+ characters |
| `JWT_EXPIRES_IN` | 7d | token lifetime |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | admin account created at start |
| `DEMO_STUDENT_EMAIL` / `DEMO_STUDENT_PASSWORD` | — | optional demo student |
| `SEED_DEMO_DATA` | true | load the synthetic demo dataset on first start |
| `VITE_API_PROXY` | http://localhost:4000 | (client) dev proxy target |

---

## 17. Limitations

* SkillLens **estimates** priorities from the data collected; it does not prove which skills matter most. Small or skewed samples produce skewed rankings — the confidence label reflects sample size only, not representativeness.
* The shipped demo data is synthetic and mirrors the hypothesis; it must not be presented as findings.
* Skill extraction is dictionary-based; it can miss new terms (reported as unmapped) and cannot judge how deeply a skill is needed.
* Expected proficiency levels are an explicit assumption derived from scores.
* Self-rated proficiency is subjective.
* SkillLens does not guarantee employment and does not replace mentors, teachers or career counsellors.

## 18. Future scope

* Licensed job-data feeds or partnerships for larger, regularly refreshed samples (with source attribution).
* Time trends (skills rising/falling), location filters, and seniority-specific rankings.
* Professional-reported expected proficiency per skill to replace the score-based assumption.
* Curated learning resources per skill (after prioritisation, not instead of it).
* Mentor hand-off: share a gap report with a mentor.
* Inter-rater checks on skill extraction and an evaluation set for the alias dictionary.
