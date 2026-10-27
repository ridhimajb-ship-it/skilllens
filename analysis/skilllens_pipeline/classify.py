"""Role classification and experience parsing (mirrors server/src/services/classifier.js)."""
from __future__ import annotations

import re

from .normalize import normalize_term


def _pattern(p: str) -> re.Pattern:
    escaped = re.escape(normalize_term(p))
    escaped = re.sub(r"(\\ |\s)+", r"[\\s/_-]+", escaped)
    return re.compile(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", re.IGNORECASE)


class RoleClassifier:
    def __init__(self, roles: list[dict]):
        self.roles = sorted(roles, key=lambda r: r.get("classificationPriority", 99))
        self.by_key: dict[str, dict] = {}
        for r in roles:
            for key in (r["name"], r["slug"], r["slug"].replace("-", " ")):
                self.by_key[normalize_term(key)] = r
        self.patterns = [(r, [_pattern(p) for p in [r["name"], *r.get("titlePatterns", [])]]) for r in self.roles]

    def from_title(self, title) -> dict | None:
        if not title or isinstance(title, float):
            return None
        text = normalize_term(title)
        for role, regexes in self.patterns:
            if any(rx.search(text) for rx in regexes):
                return role
        return None

    def from_explicit(self, value) -> dict | None:
        if not value or isinstance(value, float):
            return None
        return self.by_key.get(normalize_term(value)) or self.from_title(value)

    def classify(self, title, role_category=None) -> tuple[dict | None, str | None]:
        explicit = self.from_explicit(role_category)
        if explicit:
            return explicit, "explicit"
        by_title = self.from_title(title)
        if by_title:
            return by_title, "title"
        return None, None


EXP = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:(?:-|to|–)\s*\d+(?:\.\d+)?\s*)?\+?\s*(?:years?|yrs?)")
ENTRY = re.compile(r"\b(fresher|freshers|entry[\s-]level|new grad|graduate program|0 years)\b")


def parse_experience_years(text) -> float | None:
    if not text or isinstance(text, float):
        return None
    t = str(text).lower()
    m = EXP.search(t)
    if m:
        return float(m.group(1))
    if ENTRY.search(t):
        return 0.0
    return None
