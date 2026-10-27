# SkillLens — Research Methodology

SkillLens is a CPI project. Its central claim — *students struggle to decide which skills to prioritise for a specific role* — is a **hypothesis to be validated**, and its skill rankings are **estimates** derived from collected data. This document describes how the team validates the problem, collects data, and keeps real and demo data apart.

> Wording rule for all reports and presentations: say **"SkillLens estimates role-specific skill priorities from available job-posting and professional data."** Do not say it *proves* which skills matter, guarantees employment, or replaces mentors.

---

## 1. Research questions

| # | Question | Evidence |
|---|---|---|
| RQ1 | Do students find it hard to decide what to learn for a target role? | Student validation survey |
| RQ2 | Which skills do current job postings ask for, per role? | Job-posting dataset |
| RQ3 | Which skills and tools do professionals actually use, and what do beginners get wrong? | Professional survey |
| RQ4 | Where do postings and professional practice disagree? | Industry vs professional comparison |
| RQ5 | Would students use a skill-gap view to decide what to learn next? | Student survey Q7–Q8, prototype feedback |

## 2. Problem validation — student survey

**Target:** 50–100 students (the dashboard tracks progress against 50).
**Instrument:** `/research/student-survey` (3 short steps, ~3 minutes, anonymous, explicit consent).

| # | Question | Type |
|---|---|---|
| Q1 | How do you currently decide what skills to learn for a career? | multi-select |
| Q2 | Have you ever learned a skill that turned out not to be useful for placements/jobs? | single choice |
| Q3 | What is the most confusing part of preparing for a specific job role? | single choice + free text |
| Q4 | How many different sources do you normally use to decide what to learn? | single choice |
| Q5 | Do different sources give conflicting advice? | single choice |
| Q6 | Which sources do you trust most? | up to 3 |
| Q7 | Would you use a platform showing skills actually used by professionals? | 5-point |
| Q8 | Would seeing your skill gap help you decide what to learn next? | 4-point |

Context fields (optional): year of study, field, target role.

**Sampling.** Convenience sampling through class groups, clubs and placement cells across years and branches. Record where and when the link was shared (the team keeps a sharing log) so sampling bias can be described. Paper or Google-Form responses can be imported via the student-validation CSV template.

**Analysis.** Admin → Overview shows response count, distributions for every question, pain points, source trust, willingness to use SkillLens, and free-text quotes; CSV export for deeper analysis. Below 50 responses the dashboard explicitly warns that percentages are for monitoring only.

**Decision rule (set before collecting data).** The team should agree in advance what would count as support for the problem, for example: *≥ 60 % report Q5 "Often/Sometimes" conflicting advice AND ≥ 50 % choose a prioritisation-related pain point in Q3 ("Too many skills…", "Don't know what to learn first", "Can't tell which skills companies actually need")*. Status changes to **Validated** only when the team records that decision in the admin dashboard with a note — it is never automatic. A **Not validated** outcome is also a valid research result.

Until real responses exist, the app displays: *"Validation data will be populated through student research."*

## 3. Professional survey

**Target:** 15–20 working professionals, ideally ≥ 1 per role family (engineering, data, AI/ML, infrastructure, security, product/business, design).
**Instrument:** `/contribute` — 4 steps, 3–5 minutes, no name or employer collected, explicit consent. Captures role, industry, years of experience, skills used regularly, tools used regularly, important beginner skills (≤ 5), overemphasised skills (≤ 5), common beginner mistakes, what they wish they had learned earlier, day-to-day reality, willingness to contribute again, and motivation.

**Recruitment.** Alumni networks, LinkedIn outreach, faculty contacts, internship supervisors. Record channel per response batch.

**Analysis.** Frequency of skills/tools (share of professionals), beginner priorities, overemphasised skills, role-level differences, and thematic coding of free-text answers (mistakes, wish-learned-earlier). Professional usage (P) and beginner importance (B) feed the ranking formula.

**Caveat.** 15–20 responses across 16 roles means ~1 response per role. Per-role P/B values from such samples are anecdotal; report them as *illustrative of practice*, and rely on the pooled analysis for conclusions. The confidence label in the app reflects this.

## 4. Job-posting research methodology

**Sources (in line with each site's terms):** LinkedIn Jobs, Indeed, Glassdoor, Naukri, company career pages, public hiring reports and industry reports. The team collects postings **manually or through permitted exports** — SkillLens does not scrape.

**Protocol.**
1. Collection window: fix a date range (e.g. the last 60 days) and record it.
2. Per role: aim for ≥ 30 postings (the "High confidence" threshold), mixing company sizes and cities.
3. Record for each posting: company, title, location, posting date, source, URL, full description. Leave skills empty to let SkillLens extract them, or fill the skills column if the source lists them.
4. Import with origin **Real** only if every row has a genuine source and URL; otherwise use **Imported**.
5. Review the preview: unclassified titles, unmapped terms, duplicates. Add aliases for genuine skills.
6. Re-run the analysis and save the run id used in any report.

**Processing.** Cleaning → normalization → role classification (explicit role column, else title patterns, most specific role first) → skill extraction (skills column + description) → de-duplication (URL or normalised fields) → frequency per role → ranking. Identical logic exists in the Python pipeline for offline analysis.

## 5. Ranking & gap method (summary)

`Score = 100 × (0.50·D + 0.35·P + 0.15·B) / (weights of available signals)`, where D, P, B are shares of postings / professionals. Specificity and confidence are reported alongside. The skill-gap engine maps scores to expected levels (≥ 75 Advanced, ≥ 45 Intermediate, else Beginner), computes gaps, priority (score × gap ÷ 3), readiness and a prerequisite-aware learning order. Full details: README §9–10. Weight choice is a judgement call: run a sensitivity analysis (Admin → Skill analytics) and report whether top-5 rankings change.

## 6. Hypothesis validation

The 16 initial skill lists in `data/taxonomy/roles.json` are the team's **starting hypothesis**. After data is imported, each role page shows a *Hypothesis check*:

* **Supported** — hypothesis skills scoring ≥ 40
* **Weak evidence** — hypothesis skills scoring < 40
* **Not observed** — hypothesis skills with no mentions at all
* **Found in data** — skills not in the hypothesis that score ≥ 25

This turns the seed lists into a testable artefact rather than presenting them as facts.

## 7. Competitor research framework

For each platform, document: what it provides, who it serves, how it decides *what* to recommend, what it does not focus on, and how SkillLens differs. Claims must be verifiable from the platform's own public pages; record the URL and access date.

| Platform | What it provides | What it is not focused on | How SkillLens differs |
|---|---|---|---|
| LinkedIn | Networking, job listings, learning content | A per-role ranked skill priority combined with the student's own gaps | Aggregates posting demand with professional usage into an ordered plan |
| Glassdoor | Company reviews, salaries, interview reports, jobs | Structured per-role skill requirements | Skill-centric, mapped to a student profile |
| ADPList | Free 1:1 mentorship | Aggregated, comparable data across many professionals | Aggregates short structured input from many professionals; complements mentors |
| MentorCruise | Paid long-term mentorship | Free, data-backed prioritisation at scale | Evidence-based starting point students can take to a mentor |
| roadmap.sh | Community-curated learning roadmaps | Linking items to measured posting frequency or to the student's level | Ranks from data and personalises the gap |
| Coursera | Courses and certificates | Deciding which skills matter most before choosing courses | Answers "what first?" before "where to learn?" |

**Positioning:** existing platforms provide courses, networking, job listings, roadmaps or mentorship. SkillLens focuses on aggregating *industry requirements + professional usage + student skill profile* to produce role-specific skill priorities.

## 8. Real vs demo data

| Label | Definition | Where it appears |
|---|---|---|
| Real | Live survey submissions; postings collected by the team with source + URL | counted in Research Status |
| Imported | Uploaded files with unverified provenance | counted in Research Status (non-demo) |
| Demo | Synthetic data generated from the hypothesis (`data/demo`) | banner "Demo data — replace with validated research data."; excluded from Research Status |
| Hypothesis | Initial team skill lists | shown without scores when no data exists |
| Illustrative | Example values in explanations | labelled "Illustrative" |

The demo dataset (146 postings incl. one duplicate and one unclassifiable row; 48 professional responses) exists only so the prototype works end-to-end. Because it is generated *from* the hypothesis, its rankings reproduce the hypothesis by construction and carry no evidential weight. Remove it (Admin → Data management → Remove demo data) before reporting results.

## 9. Data limitations & threats to validity

* **Sampling bias** — convenience samples of students and professionals; postings from a few sites/cities/dates.
* **Small samples** — especially professionals per role.
* **Measurement** — a mention in a posting ≠ depth required; self-rated skill levels are subjective; multi-select survey items inflate counts relative to single choice.
* **Extraction errors** — missed synonyms (mitigated by the unmapped-term review) and false positives (mitigated by stop-aliases and tests).
* **Temporal drift** — skill demand changes; always report the collection window and analysis run id.
* **Ethics** — anonymous surveys, explicit consent, no personal identifiers in exports, aggregated reporting only.

## 10. What we will and will not claim

| ✅ We can say | ❌ We must not say |
|---|---|
| "Among the N postings we collected for Data Analyst between dates X and Y, SQL appeared in Z %." | "SQL is the most important skill for data analysts." |
| "SkillLens estimates role-specific skill priorities from available job-posting and professional data." | "SkillLens proves which skills matter." |
| "x of y surveyed students reported conflicting advice." | "Students are confused" (without numbers and sample description). |
| "SkillLens can help students decide what to learn next." | "SkillLens guarantees employment" / "replaces mentors." |
