"""SkillLens job-posting pipeline.

Raw job data -> cleaning -> normalization -> role classification -> skill extraction
-> skill de-duplication -> frequency calculation -> skill ranking -> outputs (CSV/JSON importable by the web app)
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .classify import RoleClassifier, parse_experience_years
from .normalize import SkillNormalizer, normalize_term, split_list
from .rank import DEFAULT_WEIGHTS, compute_skill_scores

ROOT = Path(__file__).resolve().parents[2]
TAXONOMY_DIR = ROOT / "data" / "taxonomy"

HEADER_SYNONYMS = {
    "title": ["title", "job_title", "position", "job_name", "role_title"],
    "company": ["company", "company_name", "employer", "organization", "organisation"],
    "role_category": ["role_category", "role", "category", "career_role", "target_role"],
    "location": ["location", "city", "job_location"],
    "posting_date": ["posting_date", "posted_date", "date_posted", "date", "posted_on"],
    "source": ["source", "platform", "site"],
    "url": ["url", "link", "job_url", "posting_url"],
    "description": ["description", "job_description", "details", "summary"],
    "skills": ["skills", "extracted_skills", "required_skills", "skills_required", "key_skills"],
    "tools": ["tools", "extracted_tools", "technologies", "tech_stack"],
    "experience": ["experience", "experience_requirements", "experience_required", "years_experience"],
    "education": ["education", "education_requirements", "qualification", "qualifications"],
    "certifications": ["certifications", "certification", "certs"],
}
TOOL_TYPES = {"tool", "platform", "library"}


def load_taxonomy(taxonomy_dir: Path = TAXONOMY_DIR) -> tuple[dict, dict]:
    skills = json.loads((taxonomy_dir / "skills.json").read_text(encoding="utf-8"))
    roles = json.loads((taxonomy_dir / "roles.json").read_text(encoding="utf-8"))
    return skills, roles


def normalize_header(h: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", str(h).strip().lower()))


def load_raw(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        records = data if isinstance(data, list) else data.get("jobs") or data.get("records") or data.get("data")
        df = pd.DataFrame(records)
    else:
        df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    df.columns = [normalize_header(c) for c in df.columns]
    return df


# ------------------------------------------------------------------------------------------------ cleaning

TAG = re.compile(r"<[^>]+>")


def clean_text(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = html.unescape(TAG.sub(" ", str(value)))
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def parse_date(value) -> str | None:
    if not value or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip()
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", s)
        if not m:
            return None
        y, mo, d = int(m.group(3)), int(m.group(2)), int(m.group(1))
    try:
        return pd.Timestamp(year=y, month=mo, day=d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def dedupe_key(row: dict) -> str:
    if row.get("url"):
        basis = "url|" + re.sub(r"/$", "", re.sub(r"[?#].*$", "", row["url"].lower()))
    else:
        parts = [row.get(k) or "" for k in ("company", "title", "location", "posting_date")]
        parts.append((row.get("description") or "")[:300])
        basis = "|".join(["t", *[normalize_term(p) for p in parts]])
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Map headers, clean text, parse dates, drop invalid rows and duplicates."""
    out = pd.DataFrame(index=df.index)
    for field, names in HEADER_SYNONYMS.items():
        present = [n for n in names if n in df.columns]
        if present:
            col = df[present[0]]
            for extra in present[1:]:
                col = col.where(col.astype(str).str.strip() != "", df[extra])
            out[field] = col
        else:
            out[field] = None
    for col in out.columns:
        out[col] = out[col].map(clean_text)
    out["posting_date_raw"] = out["posting_date"]
    out["posting_date"] = out["posting_date"].map(parse_date)
    out["url"] = out["url"].map(lambda u: u if u and re.match(r"^https?://", u) else None)

    total = len(out)
    missing_title = out["title"].isna()
    missing_content = out["description"].isna() & out["skills"].isna() & out["tools"].isna()
    invalid = missing_title | missing_content
    report = {
        "rows_total": int(total),
        "rows_missing_title": int(missing_title.sum()),
        "rows_missing_description_and_skills": int((missing_content & ~missing_title).sum()),
        "rows_with_unparsed_date": int((out["posting_date"].isna() & out["posting_date_raw"].notna()).sum()),
    }
    out = out[~invalid].copy()
    out["dedupe_key"] = [dedupe_key(r) for r in out.to_dict("records")]
    dupes = out.duplicated("dedupe_key", keep="first")
    report["duplicates_removed"] = int(dupes.sum())
    out = out[~dupes].drop(columns=["posting_date_raw"]).reset_index(drop=True)
    report["rows_after_cleaning"] = int(len(out))
    return out, report


# ------------------------------------------------------------------------------- classification & extraction

def classify_roles(df: pd.DataFrame, classifier: RoleClassifier) -> pd.DataFrame:
    results = [classifier.classify(t, rc) for t, rc in zip(df["title"], df["role_category"])]
    df = df.copy()
    df["role"] = [r["name"] if r else None for r, _ in results]
    df["role_slug"] = [r["slug"] if r else None for r, _ in results]
    df["role_match"] = [m for _, m in results]
    return df


def extract_skills(df: pd.DataFrame, normalizer: SkillNormalizer) -> pd.DataFrame:
    df = df.copy()
    extracted, unmapped = [], []
    for skills_cell, tools_cell, description in zip(df["skills"], df["tools"], df["description"]):
        listed, miss = normalizer.resolve_list([*split_list(skills_cell), *split_list(tools_cell)])
        from_text = normalizer.extract_from_text(description)
        names = list(dict.fromkeys([s.name for s in listed] + [s.name for s in from_text]))  # de-duplicated, order kept
        extracted.append(names)
        unmapped.append(miss)
    df["extracted_skills"] = extracted
    df["unmapped_terms"] = unmapped
    df["experience_min_years"] = [
        parse_experience_years(e) if parse_experience_years(e) is not None else parse_experience_years(d)
        for e, d in zip(df["experience"], df["description"])
    ]
    return df


def skill_frequencies(df: pd.DataFrame, skill_meta: dict) -> pd.DataFrame:
    """Share of each role's postings that mention each skill."""
    classified = df[df["role"].notna()]
    if classified.empty:
        return pd.DataFrame(columns=["role", "skill", "category", "type", "postings", "role_postings", "share"])
    exploded = classified[["role", "dedupe_key", "extracted_skills"]].explode("extracted_skills").dropna()
    exploded = exploded.drop_duplicates(["dedupe_key", "extracted_skills"])
    freq = exploded.groupby(["role", "extracted_skills"]).size().rename("postings").reset_index()
    totals = classified.groupby("role").size().rename("role_postings")
    freq = freq.join(totals, on="role")
    freq["share"] = (freq["postings"] / freq["role_postings"]).round(4)
    freq = freq.rename(columns={"extracted_skills": "skill"})
    freq["category"] = freq["skill"].map(lambda s: skill_meta.get(s, {}).get("category"))
    freq["type"] = freq["skill"].map(lambda s: skill_meta.get(s, {}).get("type"))
    return freq.sort_values(["role", "postings", "skill"], ascending=[True, False, True]).reset_index(drop=True)


# --------------------------------------------------------------------------------------------- professionals

def load_professionals(path: str | Path | None, normalizer: SkillNormalizer, classifier: RoleClassifier) -> list[dict]:
    """Accepts the demo JSON format or the CSV template format. Returns responses keyed by role slug."""
    if not path:
        return []
    path = Path(path)
    if path.suffix.lower() == ".json":
        doc = json.loads(path.read_text(encoding="utf-8"))
        raw = doc["responses"] if isinstance(doc, dict) else doc
        rows = [{
            "role": r.get("role"),
            "uses": [*r.get("skillsUsed", []), *r.get("toolsUsed", [])],
            "beginner": r.get("beginnerSkills", []),
            "overemphasized": r.get("overemphasizedSkills", []),
        } for r in raw]
    else:
        df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
        df.columns = [normalize_header(c) for c in df.columns]
        rows = [{
            "role": r.get("role"),
            "uses": [*split_list(r.get("skills_used")), *split_list(r.get("tools_used"))],
            "beginner": split_list(r.get("beginner_skills")),
            "overemphasized": split_list(r.get("overemphasized_skills")),
        } for r in df.to_dict("records")]
    out = []
    for r in rows:
        role = classifier.from_explicit(r["role"])
        if not role:
            continue
        names = lambda terms: [s.name for s in normalizer.resolve_list(terms)[0]]  # noqa: E731
        out.append({"roleId": role["slug"], "uses": names(r["uses"]), "beginner": names(r["beginner"]),
                    "overemphasized": names(r["overemphasized"])})
    return out


# --------------------------------------------------------------------------------------------------- runner

@dataclass
class PipelineResult:
    postings: pd.DataFrame
    frequencies: pd.DataFrame
    scores: pd.DataFrame
    report: dict


def run(input_path: str | Path, professionals_path: str | Path | None = None, weights: dict | None = None,
        taxonomy_dir: Path = TAXONOMY_DIR) -> PipelineResult:
    skills_doc, roles_doc = load_taxonomy(taxonomy_dir)
    normalizer = SkillNormalizer.from_taxonomy(skills_doc)
    classifier = RoleClassifier(roles_doc["roles"])
    skill_meta = {s["name"]: s for s in skills_doc["skills"]}

    raw = load_raw(input_path)
    cleaned, report = clean(raw)
    classified = classify_roles(cleaned, classifier)
    extracted = extract_skills(classified, normalizer)
    freq = skill_frequencies(extracted, skill_meta)

    roles = [{"id": r["slug"], "hypothesis": {n: "core" for n in r["core"]} | {n: "secondary" for n in r["secondary"]}}
             for r in roles_doc["roles"]]
    postings = [{"roleId": slug, "skillIds": skills} for slug, skills in
                zip(extracted["role_slug"], extracted["extracted_skills"]) if slug]
    responses = load_professionals(professionals_path, normalizer, classifier)
    scores = compute_skill_scores(roles, postings, responses, weights or DEFAULT_WEIGHTS)
    if not scores.empty:
        names = {r["slug"]: r["name"] for r in roles_doc["roles"]}
        scores = scores.rename(columns={"role_id": "role_slug", "skill_id": "skill"})
        scores.insert(1, "role", scores["role_slug"].map(names))

    unmapped = pd.Series([t for terms in extracted["unmapped_terms"] for t in terms], dtype=object)
    report.update({
        "rows_unclassified": int(extracted["role"].isna().sum()),
        "rows_without_skills": int((extracted["extracted_skills"].map(len) == 0).sum()),
        "rows_classified_by_title": int((extracted["role_match"] == "title").sum()),
        "postings_by_role": {k: int(v) for k, v in extracted["role"].value_counts().items()},
        "professional_responses_used": len(responses),
        "top_unmapped_terms": {k: int(v) for k, v in unmapped.value_counts().head(25).items()},
        "weights": weights or DEFAULT_WEIGHTS,
    })
    return PipelineResult(extracted, freq, scores, report)


def write_outputs(result: PipelineResult, out_dir: str | Path, charts: bool = False) -> list[Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []

    importable = result.postings.assign(
        job_title=result.postings["title"],
        role_category=result.postings["role"],
        skills=result.postings["extracted_skills"].map(lambda xs: "; ".join(xs)),
    )[["company", "job_title", "role_category", "location", "posting_date", "source", "url", "description",
       "skills", "experience", "education", "certifications"]]
    p = out / "processed_job_postings.csv"
    importable.to_csv(p, index=False)
    written.append(p)

    p = out / "skill_frequency_by_role.csv"
    result.frequencies.to_csv(p, index=False)
    written.append(p)

    p = out / "skill_scores.csv"
    result.scores.to_csv(p, index=False)
    written.append(p)

    p = out / "quality_report.json"
    p.write_text(json.dumps(result.report, indent=2), encoding="utf-8")
    written.append(p)

    if charts:
        written.extend(_charts(result, out / "charts"))
    return written


def _charts(result: PipelineResult, out: Path) -> list[Path]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed - skipping charts (pip install matplotlib)")
        return []
    out.mkdir(parents=True, exist_ok=True)
    written = []
    if result.scores.empty:
        return written
    for slug, group in result.scores.groupby("role_slug"):
        top = group.sort_values("score", ascending=False).head(12).iloc[::-1]
        fig, ax = plt.subplots(figsize=(7, 4.5))
        ax.barh(top["skill"], top["score"], color="#2563eb")
        ax.set_xlim(0, 100)
        ax.set_xlabel("SkillLens score (0-100)")
        ax.set_title(f"{group['role'].iloc[0]} - top skills (n={int(group['role_posting_total'].iloc[0])} postings)")
        for spine in ("top", "right"):
            ax.spines[spine].set_visible(False)
        fig.tight_layout()
        p = out / f"{slug}.png"
        fig.savefig(p, dpi=130)
        plt.close(fig)
        written.append(p)
    return written
