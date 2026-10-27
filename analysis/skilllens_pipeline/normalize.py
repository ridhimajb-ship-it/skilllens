"""Skill normalization and extraction (mirrors server/src/services/normalizer.js).

- resolve_term(term): explicit skill lists (CSV skills column, survey answers)
- extract_from_text(text): free-text descriptions; ambiguous aliases are skipped
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

DASHES = re.compile(r"[‐-―−]")
WRAP = re.compile(r"""^["'`(\[{]+|["'`)\]}.,:;!?]+$""")

PREFIXES = [
    "working knowledge of", "hands-on experience with", "hands-on experience in", "experience with", "experience in",
    "knowledge of", "familiarity with", "proficiency in", "proficient in", "expertise in", "strong", "advanced",
    "basic", "solid", "hands-on", "good",
]
SUFFIXES = [
    "programming language", "programming", "language", "framework", "library", "database", "db", "development",
    "skills", "skill", "basics", "experience", "knowledge", "concepts", "(basic)", "(advanced)",
]

LEFT = r"(?<![A-Za-z0-9+#])"
RIGHT = r"(?![A-Za-z0-9+#])"
SHORT_RIGHT = r"(?![A-Za-z0-9+#&'\-])"


def normalize_term(value) -> str:
    s = DASHES.sub("-", str(value if value is not None else "")).lower()
    s = re.sub(r"\s+", " ", s).strip()
    return WRAP.sub("", s).strip()


def compact_term(value) -> str:
    return re.sub(r"[\s._-]+", "", normalize_term(value))


def split_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, float):  # pandas NaN
        return []
    return [v.strip() for v in re.split(r"[;|,\n]+", str(value)) if v.strip()]


def _strip_affixes(term: str) -> str:
    current = term
    changed = True
    while changed:
        changed = False
        for p in PREFIXES:
            if current.startswith(p + " "):
                current = current[len(p) + 1:].strip()
                changed = True
        for s in SUFFIXES:
            if current.endswith(" " + s):
                current = current[: -(len(s) + 1)].strip()
                changed = True
    return current


def _alternation(aliases: list[str]) -> str | None:
    unique = sorted(set(aliases), key=len, reverse=True)
    if not unique:
        return None
    return "|".join(re.escape(a) + (SHORT_RIGHT if len(a) <= 2 else "") for a in unique)


@dataclass
class Skill:
    name: str
    category: str = ""
    type: str = ""
    aliases: list[tuple[str, bool]] = field(default_factory=list)  # (alias, case_sensitive)
    prerequisites: list[str] = field(default_factory=list)


class SkillNormalizer:
    def __init__(self, skills: list[Skill], stop_aliases: list[str] | None = None):
        self.skills = skills
        self.exact: dict[str, Skill] = {}
        self.compact: dict[str, Skill] = {}
        self.case_sensitive: dict[str, Skill] = {}
        stop = {normalize_term(a) for a in (stop_aliases or [])}
        text_aliases: list[str] = []
        cs_aliases: list[str] = []
        for skill in skills:
            for alias, cs in [(skill.name, False), *skill.aliases]:
                norm = normalize_term(alias)
                if not norm:
                    continue
                self.exact.setdefault(norm, skill)
                self.compact.setdefault(compact_term(alias), skill)
                if cs:
                    self.case_sensitive[alias] = skill
                    cs_aliases.append(alias)
                elif norm not in stop:
                    text_aliases.append(norm)
        for norm, skill in self.exact.items():
            self.compact[compact_term(norm)] = skill
        ci = _alternation(text_aliases)
        cs = _alternation(cs_aliases)
        self.ci_regex = re.compile(f"{LEFT}(?:{ci}){RIGHT}", re.IGNORECASE) if ci else None
        self.cs_regex = re.compile(f"{LEFT}(?:{cs}){RIGHT}") if cs else None

    @classmethod
    def from_taxonomy(cls, doc: dict) -> "SkillNormalizer":
        skills = [
            Skill(
                name=s["name"],
                category=s.get("category", ""),
                type=s.get("type", ""),
                aliases=[(a, False) for a in s.get("aliases", [])] + [(a, True) for a in s.get("caseSensitiveAliases", [])],
                prerequisites=s.get("prerequisites", []),
            )
            for s in doc["skills"]
        ]
        return cls(skills, doc.get("textExtractionStopAliases", []))

    def resolve_one(self, term) -> Skill | None:
        norm = normalize_term(term)
        if not norm:
            return None
        if norm in self.exact:
            return self.exact[norm]
        stripped = _strip_affixes(norm)
        if stripped in self.exact:
            return self.exact[stripped]
        return self.compact.get(compact_term(stripped))

    def resolve_term(self, term) -> tuple[list[Skill], str | None]:
        direct = self.resolve_one(term)
        if direct:
            return [direct], None
        norm = normalize_term(term)
        if not norm:
            return [], None
        parts = [p for p in re.split(r"\s*(?:/|&|\band\b|\+(?!\+))\s*", norm) if p]
        if len(parts) > 1:
            resolved = [self.resolve_one(p) for p in parts]
            if all(resolved):
                return list({s.name: s for s in resolved}.values()), None
        return [], str(term).strip()

    def resolve_list(self, value) -> tuple[list[Skill], list[str]]:
        found: dict[str, Skill] = {}
        unmapped: list[str] = []
        for term in split_list(value):
            skills, miss = self.resolve_term(term)
            for s in skills:
                found[s.name] = s
            if miss:
                unmapped.append(miss)
        return list(found.values()), unmapped

    def extract_from_text(self, text) -> list[Skill]:
        if not text or (isinstance(text, float)):
            return []
        original = DASHES.sub("-", str(text))
        found: dict[str, Skill] = {}
        working = original
        if self.ci_regex:
            def blank(m: re.Match) -> str:
                skill = self.exact.get(normalize_term(m.group(0)))
                if skill:
                    found[skill.name] = skill
                return " " * len(m.group(0))
            working = self.ci_regex.sub(blank, working)
        if self.cs_regex:
            for m in self.cs_regex.finditer(working):
                match = m.group(0)
                word_like = re.fullmatch(r"[A-Z][a-z]+", match) is not None
                before = original[: m.start()].rstrip()
                if word_like and (before == "" or before[-1] in ".!?\n"):
                    continue
                skill = self.case_sensitive.get(match)
                if skill:
                    found[skill.name] = skill
        return list(found.values())
