# SkillLens — Testing Guide

## Run everything

```bash
cd skilllens
npm run test                         # server (node:test + supertest) then client (Vitest)
pip install -r analysis/requirements.txt
npm run test:analysis                # Python (pytest)
```

The server tests use an **in-memory PostgreSQL (PGlite)** database, created and seeded fresh for each test file, so they never touch your development data and need no database server.

## What is covered

### Backend — `server/test/unit.test.js` (20 tests)
| Area | Checks |
|---|---|
| Normalization | aliases → canonical (Postgres/PostgreSQL DB → PostgreSQL, React.js/ReactJS → React, Python 3 → Python, Structured Query Language → SQL…); compound terms (`AWS/Azure` split, `CI/CD` kept); every seed-list entry resolves; duplicates removed; unmapped terms reported |
| Text extraction | Java vs JavaScript, MySQL not counted as SQL, standalone R but not R&D, ambiguous words (“rest”, “Express your ideas”, “Less is more”) ignored |
| Role classification | most-specific-first title matching, explicit role column, unclassifiable titles; experience parsing |
| Scoring | shared fixture (identical expectations to Python), roles without data skipped, duplicate mentions count once, tiers and confidence thresholds |
| Skill-gap engine | expected-level bands, gap / priority / readiness arithmetic, prerequisite-aware learning order, empty profile |
| Import helpers | date parsing (ISO, DD/MM/YYYY, invalid dates), de-duplication keys, CSV escaping & formula-injection guard |

### Backend — `server/test/api.test.js` (25 tests)
| Area | Checks |
|---|---|
| Public API | health, 16 roles, role detail & 404, skill analysis flagged as demo with sample size, skill search, normalization endpoint, research status never “validated” without real data, guest gap computation & validation errors |
| Authentication | register (email normalised), duplicate 409, invalid input 400, admin self-registration blocked, login success/failure, `/me`, invalid token 401, admin routes 401/403 |
| Student journey | profile → skills (alias + custom) → saved gap → dashboard with history; unauthenticated access blocked |
| Surveys | options; student survey stored as real data and moves research status to In Progress; consent and max-3 validation; professional survey normalises free-text skills and keeps unmapped ones |
| Admin | import preview writes nothing; import de-duplicates within file and against DB and re-runs analysis; JSON import; malformed JSON 400; analytics sections; analysis without demo data & custom weights; invalid weights 400; CSV exports & templates; alias management; research decision; demo-data removal |

### Frontend — `client/src/test/*.test.jsx` (12 tests)
| Area | Checks |
|---|---|
| Provenance labels | DataBadge labels; DemoBanner shows “Demo data — replace with validated research data.” only when relevant, and the hypothesis warning |
| Components | ScoreBars prints values; tier/priority pills |
| Skill selection | search by alias, add, rate proficiency, remove; quick-add suggestions; custom skills |
| Role explorer | role card content, sample size, demo label, link |
| Gap report | readiness ring, strengths, learning order, gap table, extra skills, demo banner |
| Dashboard rendering | all sections from API data, setup prompt, readable API error; Research Status rendering |

### Data pipeline — `analysis/tests/test_pipeline.py` (22 tests)
Normalization parity with the server, compound terms, seed-list coverage, duplicates & unmapped terms, text extraction rules, role classification, **shared scoring fixture**, JavaScript-compatible rounding, cleaning (HTML stripping, date parsing, invalid rows, duplicates), and a full run on the demo dataset including output files.

## Manual demo checklist (≈ 10 minutes)

1. `npm run dev` → open http://localhost:5173. Landing page shows the illustrative example (labelled) and Research Status = Pending.
2. **Career Roles** → open *Data Scientist*: demo banner, ranked chart, evidence table (D / P / B / specificity), hypothesis check, professional insights with Demo badges.
3. **Assess My Skills** as a guest → choose a role, add “postgres” (maps to PostgreSQL), add a custom skill, rate levels → **Show my skill gap**.
4. Sign in as the demo student (credentials printed by `npm run setup`) → **My Dashboard**.
5. **For Professionals** → complete the 4-step survey → thank-you screen.
6. **Research → Student survey** → submit → Research Status changes to *In Progress (1/50)*.
7. Sign in as admin → **Admin**: overview counts, validation analytics now show 1 response with the small-sample warning; export CSV.
8. **Data management** → download the job-postings template → fill a few real rows → Preview → Import → see the analysis re-run and the role page update.
9. **Skill analytics** → untick “Include demo data”, run analysis → roles without real data fall back to the labelled hypothesis.
10. Data management → **Remove demo data** when real data is in place.

## API smoke test with curl

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/roles/data-analyst/skill-analysis
curl -X POST http://localhost:4000/api/skills/normalize -H "Content-Type: application/json" \
     -d '{"terms":["Postgres","ReactJS","AWS/Azure"]}'
```
