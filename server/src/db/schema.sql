-- SkillLens relational schema (PostgreSQL dialect).
-- Runs unchanged on a PostgreSQL server (DATABASE_URL) or on embedded PGlite.
-- Every research record carries a data_origin so demo data can never be confused
-- with real or imported data:
--   'demo'     synthetic seed data shipped with the prototype
--   'imported' records uploaded by the research team from CSV/JSON
--   'real'     responses submitted through the live SkillLens survey forms

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student', 'professional', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  type        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS skill_aliases (
  id               SERIAL PRIMARY KEY,
  skill_id         INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  case_sensitive   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (alias_normalized, case_sensitive)
);
CREATE INDEX IF NOT EXISTS idx_skill_aliases_skill ON skill_aliases(skill_id);

-- Initial hypothesis: which skills the team expects a role to need.
CREATE TABLE IF NOT EXISTS role_skills (
  role_id  INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tier     TEXT NOT NULL CHECK (tier IN ('core', 'secondary')),
  source   TEXT NOT NULL DEFAULT 'seed_hypothesis',
  PRIMARY KEY (role_id, skill_id)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id             SERIAL PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('jobs', 'professional', 'student_validation')),
  filename       TEXT,
  data_origin    TEXT NOT NULL CHECK (data_origin IN ('demo', 'imported', 'real')),
  rows_total     INTEGER NOT NULL DEFAULT 0,
  rows_imported  INTEGER NOT NULL DEFAULT 0,
  rows_skipped   INTEGER NOT NULL DEFAULT 0,
  report         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_postings (
  id               SERIAL PRIMARY KEY,
  company          TEXT,
  title            TEXT NOT NULL,
  role_id          INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  role_match       TEXT,                 -- how role_id was assigned: 'explicit' | 'title' | null
  location         TEXT,
  posted_date      DATE,
  source           TEXT,
  url              TEXT,
  description      TEXT,
  experience_text  TEXT,
  experience_min_years DOUBLE PRECISION,
  education        TEXT,
  certifications   TEXT,
  unmapped_terms   JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_origin      TEXT NOT NULL CHECK (data_origin IN ('demo', 'imported', 'real')),
  import_batch_id  INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  dedupe_key       TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_postings_role ON job_postings(role_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_origin ON job_postings(data_origin);

CREATE TABLE IF NOT EXISTS job_posting_skills (
  job_posting_id INTEGER NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  skill_id       INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  match_source   TEXT NOT NULL,          -- 'listed' (skills/tools column) | 'description'
  PRIMARY KEY (job_posting_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_jps_skill ON job_posting_skills(skill_id);

CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role_id          INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  industry         TEXT,
  years_experience DOUBLE PRECISION,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS professional_responses (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  role_id               INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  industry              TEXT,
  years_experience      DOUBLE PRECISION,
  experience_band       TEXT,
  other_skills          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- free-text skills that did not map to the taxonomy
  beginner_mistakes     TEXT,
  wish_learned_earlier  TEXT,
  work_reality          TEXT,
  willing_to_contribute TEXT,
  motivation            JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_origin           TEXT NOT NULL CHECK (data_origin IN ('demo', 'imported', 'real')),
  import_batch_id       INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prof_resp_role ON professional_responses(role_id);

-- kind: 'uses' (used regularly), 'beginner' (important for beginners), 'overemphasized'
CREATE TABLE IF NOT EXISTS professional_response_skills (
  response_id INTEGER NOT NULL REFERENCES professional_responses(id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('uses', 'beginner', 'overemphasized')),
  PRIMARY KEY (response_id, skill_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_prs_skill ON professional_response_skills(skill_id);

CREATE TABLE IF NOT EXISTS student_validation_responses (
  id                   SERIAL PRIMARY KEY,
  study_year           TEXT,
  field_of_study       TEXT,
  target_role          TEXT,
  decide_methods       JSONB NOT NULL DEFAULT '[]'::jsonb,
  learned_not_useful   TEXT,
  confusing_part       TEXT,
  confusing_text       TEXT,
  source_count         TEXT,
  conflicting_advice   TEXT,
  trusted_sources      JSONB NOT NULL DEFAULT '[]'::jsonb,
  would_use_platform   TEXT,
  gap_view_helpful     TEXT,
  comments             TEXT,
  data_origin          TEXT NOT NULL CHECK (data_origin IN ('demo', 'imported', 'real')),
  import_batch_id      INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_role_id  INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  education_level TEXT,
  study_year      TEXT,
  institution     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_skills (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id    INTEGER REFERENCES skills(id) ON DELETE CASCADE,
  custom_name TEXT,
  level       SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),  -- 1 Beginner, 2 Intermediate, 3 Advanced
  CHECK (skill_id IS NOT NULL OR custom_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_student_skills_user ON student_skills(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_skill ON student_skills(user_id, skill_id) WHERE skill_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS analysis_runs (
  id                  SERIAL PRIMARY KEY,
  params              JSONB NOT NULL,
  postings_used       INTEGER NOT NULL DEFAULT 0,
  responses_used      INTEGER NOT NULL DEFAULT 0,
  includes_demo       BOOLEAN NOT NULL DEFAULT false,
  origins             JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_scores (
  id                  SERIAL PRIMARY KEY,
  run_id              INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  role_id             INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id            INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  score               DOUBLE PRECISION NOT NULL,
  tier                TEXT NOT NULL,
  industry_demand     DOUBLE PRECISION,       -- share of the role's postings mentioning the skill (0-1)
  professional_usage  DOUBLE PRECISION,       -- share of the role's professionals who use it regularly (0-1)
  beginner_importance DOUBLE PRECISION,       -- share of professionals naming it important for beginners (0-1)
  specificity         DOUBLE PRECISION,       -- how concentrated the skill is in this role vs other roles (0-1)
  posting_count       INTEGER NOT NULL DEFAULT 0,
  professional_count  INTEGER NOT NULL DEFAULT 0,
  role_posting_total  INTEGER NOT NULL DEFAULT 0,
  role_professional_total INTEGER NOT NULL DEFAULT 0,
  in_hypothesis       BOOLEAN NOT NULL DEFAULT false,
  rank                INTEGER NOT NULL,
  UNIQUE (run_id, role_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_skill_scores_run_role ON skill_scores(run_id, role_id);

CREATE TABLE IF NOT EXISTS skill_gap_results (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  run_id     INTEGER REFERENCES analysis_runs(id) ON DELETE SET NULL,
  readiness  DOUBLE PRECISION NOT NULL,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gap_results_user ON skill_gap_results(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
