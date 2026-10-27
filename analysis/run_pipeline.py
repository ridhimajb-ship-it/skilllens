"""Command-line entry point for the SkillLens analysis pipeline.

Examples:
  python run_pipeline.py --input ../data/demo/job_postings_demo.csv --professionals ../data/demo/professional_responses_demo.json
  python run_pipeline.py --input my_postings.csv --out output/run1 --charts

Outputs (in --out, default ./output):
  processed_job_postings.csv   cleaned, de-duplicated, role-classified postings (importable in Admin > Data management)
  skill_frequency_by_role.csv  share of each role's postings mentioning each skill
  skill_scores.csv             transparent SkillLens scores with every component
  quality_report.json          rows dropped, duplicates, unclassified rows, unmapped terms
  charts/<role>.png            optional, requires matplotlib
"""
import argparse
import json

from skilllens_pipeline import run, write_outputs


def main() -> None:
    parser = argparse.ArgumentParser(description="SkillLens job-posting analysis pipeline")
    parser.add_argument("--input", required=True, help="Job postings CSV or JSON")
    parser.add_argument("--professionals", help="Professional responses (demo JSON or CSV template format)")
    parser.add_argument("--out", default="output", help="Output directory")
    parser.add_argument("--charts", action="store_true", help="Also write PNG charts (needs matplotlib)")
    parser.add_argument("--weights", help='JSON weights, e.g. \'{"industry":0.5,"professional":0.35,"beginner":0.15}\'')
    args = parser.parse_args()

    weights = json.loads(args.weights) if args.weights else None
    result = run(args.input, args.professionals, weights)
    files = write_outputs(result, args.out, charts=args.charts)

    r = result.report
    print(f"Rows read: {r['rows_total']}  after cleaning: {r['rows_after_cleaning']}  "
          f"duplicates removed: {r['duplicates_removed']}  unclassified: {r['rows_unclassified']}")
    print(f"Professional responses used: {r['professional_responses_used']}")
    if not result.scores.empty:
        print("\nTop 5 skills per role (score 0-100):")
        for role, group in result.scores.groupby("role", sort=True):
            top = group.sort_values("rank").head(5)
            print(f"  {role:<28} " + ", ".join(f"{s} {v:g}" for s, v in zip(top["skill"], top["score"])))
    print("\nWrote:")
    for f in files:
        print(f"  {f}")


if __name__ == "__main__":
    main()
