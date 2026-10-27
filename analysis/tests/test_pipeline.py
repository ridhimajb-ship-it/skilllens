import json
from pathlib import Path

import pandas as pd
import pytest

from skilllens_pipeline import RoleClassifier, SkillNormalizer, clean, compute_skill_scores, run, tier_for, write_outputs
from skilllens_pipeline.pipeline import load_taxonomy, parse_date
from skilllens_pipeline.rank import js_round

ROOT = Path(__file__).resolve().parents[2]
SKILLS, ROLES = load_taxonomy()
N = SkillNormalizer.from_taxonomy(SKILLS)
FIXTURE = json.loads((ROOT / "data" / "fixtures" / "scoring_fixture.json").read_text(encoding="utf-8"))


def names(skills):
    return sorted(s.name for s in skills)


# ------------------------------------------------------------------------------------- normalization

@pytest.mark.parametrize("term,expected", [
    ("Postgres", "PostgreSQL"), ("PostgreSQL DB", "PostgreSQL"), ("React.js", "React"), ("ReactJS", "React"),
    ("Python 3", "Python"), ("Python programming", "Python"), ("Structured Query Language", "SQL"),
    ("k8s", "Kubernetes"), ("Advanced Excel", "Excel"), ("C#", "C#"), ("c++", "C++"), ("React JS", "React"),
])
def test_aliases_resolve(term, expected):
    assert N.resolve_one(term).name == expected


def test_compound_terms_split():
    skills, miss = N.resolve_term("AWS/Azure")
    assert names(skills) == ["AWS", "Azure"] and miss is None
    assert names(N.resolve_term("CI/CD")[0]) == ["CI/CD"]


def test_every_seed_entry_resolves():
    for role in ROLES["roles"]:
        for entry in role["seedListOriginal"]:
            skills, miss = N.resolve_term(entry)
            assert skills and miss is None, (role["slug"], entry)


def test_duplicates_and_unmapped():
    skills, unmapped = N.resolve_list("Python; python 3; Postgres; PostgreSQL; Quantum Basket Weaving")
    assert names(skills) == ["PostgreSQL", "Python"]
    assert unmapped == ["Quantum Basket Weaving"]


def test_text_extraction_matches_node_rules():
    text = ("We use Java and JavaScript with MySQL. R&D team. Built REST services; the rest of the team uses "
            "Node.js and React.js. Knowledge of R is a plus.")
    found = names(N.extract_from_text(text))
    for expected in ["Java", "JavaScript", "MySQL", "Node.js", "React", "R", "REST APIs"]:
        assert expected in found
    assert "SQL" not in found
    assert names(N.extract_from_text("Express your ideas clearly. Less is more. The rest is history.")) == []


# ------------------------------------------------------------------------------------- classification

def test_role_classification():
    c = RoleClassifier(ROLES["roles"])
    assert c.classify("Senior Data Scientist")[0]["slug"] == "data-scientist"
    assert c.classify("Software Engineer - Backend")[0]["slug"] == "backend-developer"
    assert c.classify("GenAI Engineer")[0]["slug"] == "ai-engineer"
    assert c.classify("Operations Associate")[0] is None
    assert c.classify("Analyst", "Business Analyst")[1] == "explicit"


# ------------------------------------------------------------------------------------- scoring

def test_scores_match_shared_fixture():
    inp = FIXTURE["input"]
    df = compute_skill_scores(inp["roles"], inp["postings"], inp["responses"], inp["weights"])
    assert len(df) == len(FIXTURE["expected"])
    for exp in FIXTURE["expected"]:
        row = df[(df.role_id == exp["roleId"]) & (df.skill_id == exp["skillId"])].iloc[0]
        assert row.score == exp["score"]
        assert row.tier == exp["tier"]
        assert row["rank"] == exp["rank"]
        if exp["specificity"] is None:
            assert row.specificity is None or pd.isna(row.specificity)
        else:
            assert row.specificity == exp["specificity"]


def test_rounding_is_half_up_like_javascript():
    assert js_round(32.25, 1) == 32.3
    assert tier_for(80) == "Very High" and tier_for(19.9) == "Minimal"


# ------------------------------------------------------------------------------------- cleaning & pipeline

def test_cleaning_drops_invalid_rows_and_duplicates():
    raw = pd.DataFrame([
        {"job_title": "Data Analyst", "company": "Acme", "description": "<p>SQL &amp; Excel</p>", "posting_date": "01/10/2026"},
        {"job_title": "data analyst", "company": " ACME ", "description": "SQL &amp; Excel", "posting_date": "2026-10-01"},
        {"job_title": "", "company": "NoTitle", "description": "Python"},
        {"job_title": "Frontend Developer", "company": "Beta", "description": ""},
    ])
    out, report = clean(raw)
    assert report["rows_missing_title"] == 1
    assert report["rows_missing_description_and_skills"] == 1
    assert report["duplicates_removed"] == 1
    assert len(out) == 1
    assert out.iloc[0]["description"] == "SQL & Excel"
    assert out.iloc[0]["posting_date"] == "2026-10-01"


def test_parse_date():
    assert parse_date("2026-10-05") == "2026-10-05"
    assert parse_date("05/10/2026") == "2026-10-05"
    assert parse_date("2026-02-30") is None


def test_full_pipeline_on_demo_data(tmp_path):
    result = run(ROOT / "data/demo/job_postings_demo.csv", ROOT / "data/demo/professional_responses_demo.json")
    assert result.report["duplicates_removed"] == 1
    assert result.report["rows_unclassified"] == 1
    assert result.report["professional_responses_used"] == 48
    assert "Quantum Basket Weaving" in result.report["top_unmapped_terms"]
    ds = result.scores[result.scores.role_slug == "data-scientist"].sort_values("rank")
    assert ds.iloc[0]["score"] >= ds.iloc[-1]["score"]
    files = write_outputs(result, tmp_path)
    processed = pd.read_csv(tmp_path / "processed_job_postings.csv")
    assert len(processed) == result.report["rows_after_cleaning"]
    assert {"job_title", "role_category", "skills"} <= set(processed.columns)
    assert all(f.exists() for f in files)
