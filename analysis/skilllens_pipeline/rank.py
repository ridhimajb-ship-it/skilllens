"""Skill-ranking algorithm (mirrors server/src/services/scoring.js).

For role r and skill s:
    D = postings for r mentioning s / postings for r                      (industry demand)
    P = professionals in r using s regularly / professionals in r          (professional usage)
    B = professionals in r naming s important for beginners / professionals (beginner importance)

    score = 100 * (wD*D + wP*P + wB*B) / (sum of weights for signals that have data)

Specificity (reported, not scored) = D_r / (D_r + mean D of s across the other roles with postings).
Arithmetic is performed in the same order as the JavaScript implementation so both produce identical numbers.
"""
from __future__ import annotations

import math
from collections import defaultdict

import pandas as pd

DEFAULT_WEIGHTS = {"industry": 0.5, "professional": 0.35, "beginner": 0.15}
TIERS = [(80, "Very High"), (60, "High"), (40, "Moderate"), (20, "Low"), (0, "Minimal")]


def tier_for(score: float) -> str:
    return next(label for minimum, label in TIERS if score >= minimum)


def js_round(value: float | None, digits: int = 1) -> float | None:
    """Math.round semantics (round half up) — Python's round() uses banker's rounding."""
    if value is None:
        return None
    f = 10 ** digits
    return math.floor(value * f + 0.5) / f


def compute_skill_scores(roles: list[dict], postings: list[dict], responses: list[dict], weights: dict | None = None) -> pd.DataFrame:
    """roles: [{id, hypothesis: {skill_id: tier}}]; postings: [{roleId, skillIds}];
    responses: [{roleId, uses, beginner, overemphasized}]"""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    stats: dict = defaultdict(lambda: {"n_post": 0, "n_pro": 0, "post": defaultdict(int), "uses": defaultdict(int),
                                       "beginner": defaultdict(int), "over": defaultdict(int)})
    for p in postings:
        if p.get("roleId") is None:
            continue
        s = stats[p["roleId"]]
        s["n_post"] += 1
        for sid in set(p.get("skillIds", [])):
            s["post"][sid] += 1
    for r in responses:
        s = stats[r["roleId"]]
        s["n_pro"] += 1
        for kind, key in (("uses", "uses"), ("beginner", "beginner"), ("overemphasized", "over")):
            for sid in set(r.get(kind, []) or []):
                s[key][sid] += 1

    demand: dict = defaultdict(dict)
    for role_id, s in list(stats.items()):
        if s["n_post"] == 0:
            continue
        for sid, count in s["post"].items():
            demand[sid][role_id] = count / s["n_post"]
    roles_with_postings = [rid for rid, s in stats.items() if s["n_post"] > 0]

    rows = []
    for role in roles:
        rid = role["id"]
        s = stats[rid]
        has_d, has_p = s["n_post"] > 0, s["n_pro"] > 0
        if not has_d and not has_p:
            continue
        hypothesis = {(int(k) if str(k).isdigit() else k): v for k, v in role.get("hypothesis", {}).items()}
        candidates = set(hypothesis) | set(s["post"]) | set(s["uses"]) | set(s["beginner"])
        role_rows = []
        for sid in candidates:
            d = s["post"].get(sid, 0) / s["n_post"] if has_d else None
            p = s["uses"].get(sid, 0) / s["n_pro"] if has_p else None
            b = s["beginner"].get(sid, 0) / s["n_pro"] if has_p else None
            num = 0.0
            den = 0.0
            if has_d:
                num += w["industry"] * d
                den += w["industry"]
            if has_p:
                num += w["professional"] * p + w["beginner"] * b
                den += w["professional"] + w["beginner"]
            score = js_round((100 * num) / den, 1) if den > 0 else 0.0

            specificity = None
            if has_d and d > 0:
                others = [o for o in roles_with_postings if o != rid]
                if others:
                    mean_other = sum(demand.get(sid, {}).get(o, 0) for o in others) / len(others)
                    specificity = js_round(d / (d + mean_other), 3)

            role_rows.append({
                "role_id": rid, "skill_id": sid, "score": score, "tier": tier_for(score),
                "industry_demand": js_round(d, 4), "professional_usage": js_round(p, 4),
                "beginner_importance": js_round(b, 4), "specificity": specificity,
                "posting_count": s["post"].get(sid, 0), "professional_count": s["uses"].get(sid, 0),
                "overemphasized_count": s["over"].get(sid, 0),
                "role_posting_total": s["n_post"], "role_professional_total": s["n_pro"],
                "in_hypothesis": sid in hypothesis,
            })
        role_rows.sort(key=lambda r: (-r["score"], -int(r["in_hypothesis"]), str(r["skill_id"]) if isinstance(r["skill_id"], str) else r["skill_id"]))
        for i, r in enumerate(role_rows, start=1):
            r["rank"] = i
        rows.extend(role_rows)
    return pd.DataFrame(rows)
