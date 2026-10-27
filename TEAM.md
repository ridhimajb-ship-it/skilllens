# SkillLens — Team & 12-Week Plan

## Six-member division of work

| Member | Focus | Responsibilities | Main areas of this codebase |
|---|---|---|---|
| **Member 1 — Research + Data** | Research & validation | Survey design, data cleaning, Python/Pandas, basic visualisation, competitor research | `RESEARCH.md`, survey questions (`server/src/services/surveyOptions.js`), `analysis/skilllens_pipeline/pipeline.py`, competitor table (`client/src/utils/competitors.js`) |
| **Member 2 — UI/UX + Frontend** | Design & student experience | Figma, HTML/CSS, React, student dashboard | `client/src/styles/global.css`, `components/ui.jsx`, `pages/Landing.jsx`, `pages/StudentDashboard.jsx`, `pages/GapAnalysis.jsx` |
| **Member 3 — Frontend + Backend** | Integration | React, REST APIs, Node/Express, API integration | `client/src/api/client.js`, `pages/Assessment.jsx`, `pages/RoleExplorer.jsx`, `pages/RoleDetail.jsx`, `server/src/routes/roles.js`, `routes/student.js` |
| **Member 4 — Backend + Database** | Platform | Node/Express, PostgreSQL, authentication, database design | `server/src/db/*`, `middleware/auth.js`, `routes/auth.js`, `routes/admin.js`, security configuration |
| **Member 5 — Data + Backend** | Analysis engine | Python/Pandas, skill-ranking algorithm, data processing, backend/API integration | `services/scoring.js`, `services/skillGap.js`, `services/normalizer.js`, `services/importer.js`, `analysis/skilllens_pipeline/rank.py`, `data/taxonomy/*` |
| **Member 6 — Testing + Deployment + Data** | Quality & delivery | Frontend testing, API testing, deployment, analytics dashboard, documentation | `server/test/*`, `client/src/test/*`, `analysis/tests/*`, `pages/admin/*`, `README.md`, `TESTING.md` |

Shared ownership: everyone reviews pull requests outside their own area at least once a week; Member 1 and Member 5 jointly own the taxonomy (aliases, role lists).

## 12-week implementation plan

Tasks overlap by design; the critical path is *validation data → real job data → analysis → demo*.

| Week | Phase | Key deliverables | Lead(s) |
|---|---|---|---|
| 1–2 | **Research + problem validation** | Student survey live and shared (target 50–100); professional outreach list; competitor research; job-posting collection protocol agreed; decision rule for "validated" agreed in advance | M1 (all support recruitment) |
| 3–4 | **Requirements + UI/UX** | User journeys, wireframes and Figma for the 11 pages; database schema; API contract; taxonomy v1 (skills, aliases, 16 roles) | M2, M4, M1, M5 |
| 5–6 | **Frontend development** | Landing, Role Explorer, Role Details, Assessment, Dashboard, surveys, auth pages; reusable components and charts | M2, M3 |
| 6–7 | **Backend development** | Express API, auth (JWT + bcrypt), PostgreSQL schema & migrations, surveys, admin endpoints, validation & error handling | M4, M3 |
| 8–9 | **Data processing + skill analysis** | Import pipeline (CSV/JSON preview → validate → import), normalization & extraction, Python pipeline, ranking algorithm with shared fixture; first real job-posting import (≥ 30 per priority role) | M5, M1 |
| 9–10 | **Integration + skill-gap engine** | Gap engine, learning order, student dashboard wired to real analysis; admin analytics; professional responses flowing into scores | M5, M3, M6 |
| 11 | **Testing + user feedback** | Unit/API/UI/pipeline tests; usability sessions with 5–8 students; fix issues; sensitivity analysis on weights; record problem-validation decision | M6 (all) |
| 12 | **Finalisation + demo** | Remove demo data (or clearly label it), final analysis run id recorded, documentation, demo script, presentation | M6, M1 (all) |

## Definition of done (per feature)

1. Works end-to-end in the running app.
2. Validated inputs and clear error messages.
3. Any number shown carries its data basis (sample size, origin label).
4. Tests added or updated; `npm run test` and `npm run test:analysis` pass.
5. Documented where a teammate would look for it.
