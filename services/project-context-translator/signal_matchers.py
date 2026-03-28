"""
Domain Signal Matchers — rule-based pattern matching for business signals.

Organized as registries of pattern groups. Each group targets a signal
category (problem clues, opportunity clues, external/internal drivers,
triggers, urgency, quantitative cues).

These produce *candidate* signals with evidence links. They do NOT
produce final judgments — that is the LLM's job.

To extend: add patterns to the relevant RULES dict. Each entry is
(pattern_label, list_of_lowercase_phrases).
"""

from __future__ import annotations
from dataclasses import dataclass

# ── Pattern Registries ─────────────────────────────────────────────────────

# Each rule group: { rule_label: [lowercase phrases] }
# Matching is case-insensitive substring check against sentence text.

PROBLEM_RULES: dict[str, list[str]] = {
    "cost_pressure": [
        "rising costs", "cost overrun", "budget pressure", "over budget",
        "expensive", "cost increase", "feed cost", "transport cost",
    ],
    "delay_issues": [
        "delays", "delayed", "behind schedule", "missed deadline",
        "late delivery", "backlog",
    ],
    "quality_complaints": [
        "complaints", "frustration", "dissatisfaction", "poor quality",
        "errors", "defects", "bugs", "rework",
    ],
    "inefficiency": [
        "manual work", "inefficiency", "inefficient", "repetitive",
        "repetitive inquiries", "manual process", "workaround",
        "redundant", "time-consuming",
    ],
    "risk_escalation": [
        "risk", "escalation", "vulnerability", "exposure",
        "disease risk", "security risk", "compliance risk",
    ],
    "resource_constraints": [
        "resource constraints", "understaffed", "overloaded",
        "capacity issue", "shortage", "turnover", "burnout",
    ],
    "leadership_pressure": [
        "leadership pressure", "board mandate", "executive directive",
        "management demand", "stakeholder pressure",
    ],
}

OPPORTUNITY_RULES: dict[str, list[str]] = {
    "growth_demand": [
        "demand growth", "growing demand", "market growth",
        "new market", "expansion", "scale up", "local demand",
    ],
    "self_service": [
        "self-service", "automation opportunity", "digitize",
        "digital transformation", "modernize", "streamline",
    ],
    "competitive_advantage": [
        "competitive advantage", "differentiation", "first mover",
        "market leader", "innovation", "disrupt",
    ],
    "cost_saving": [
        "cost saving", "cost reduction", "optimize costs",
        "reduce spend", "efficiency gain",
    ],
    "revenue_opportunity": [
        "revenue opportunity", "new revenue", "monetize",
        "upsell", "cross-sell", "premium",
    ],
}

EXTERNAL_DRIVER_RULES: dict[str, list[str]] = {
    "market_forces": [
        "market shift", "market trend", "industry change",
        "consumer behavior", "demand shift",
    ],
    "competitive_pressure": [
        "competitor", "competitive pressure", "market share",
        "competitor already", "competitors",
    ],
    "regulatory": [
        "regulation", "regulatory", "compliance", "legislation",
        "mandate", "policy change", "government",
    ],
    "technology_shift": [
        "new technology", "technology shift", "ai", "machine learning",
        "cloud", "saas", "platform shift",
    ],
}

INTERNAL_DRIVER_RULES: dict[str, list[str]] = {
    "process_pain": [
        "legacy system", "technical debt", "outdated",
        "end of life", "end of support", "deprecated",
        "slow system", "fragmented",
    ],
    "strategic_priority": [
        "strategic priority", "strategic initiative", "roadmap",
        "vision", "transformation", "restructuring",
    ],
    "capability_gap": [
        "capability gap", "skill gap", "missing capability",
        "lack of", "no visibility", "no insight",
    ],
}

TRIGGER_RULES: dict[str, list[str]] = {
    "deadline": [
        "deadline", "due date", "end of quarter", "end of year",
        "q1", "q2", "q3", "q4", "by 2025", "by 2026",
        "this quarter", "next quarter",
    ],
    "incident": [
        "incident", "outage", "breach", "failure",
        "crash", "downtime",
    ],
    "catalyst": [
        "recently", "just happened", "last month", "last week",
        "this month", "spike", "surge", "sudden",
    ],
}

URGENCY_PHRASES: list[str] = [
    "urgent", "immediately", "asap", "critical",
    "time-sensitive", "deadline", "overdue", "now",
    "can't wait", "before it's too late",
    "this quarter", "this month", "this week",
]

BUSINESS_CONTEXT_PHRASES: list[str] = [
    "customer", "client", "revenue", "profit", "market",
    "organization", "company", "department", "team",
    "project", "initiative", "strategy", "business",
    "stakeholder", "process", "system", "service",
    "product", "platform", "budget", "cost",
]

# ── Quantitative Pattern Keywords ──────────────────────────────────────────

QUANT_PERCENTAGE_PHRASES: list[str] = ["%", "percent", "percentage"]
QUANT_INCREASE_PHRASES: list[str] = ["increase", "increased", "growing", "rise", "risen", "spike", "surge"]
QUANT_DECREASE_PHRASES: list[str] = ["decrease", "decreased", "decline", "drop", "fell", "reduction"]
QUANT_TEMPORAL_PHRASES: list[str] = [
    "recently", "this quarter", "last quarter", "this year", "last year",
    "this month", "last month", "q1", "q2", "q3", "q4",
    "2024", "2025", "2026",
]


# ── Matcher Engine ─────────────────────────────────────────────────────────

@dataclass
class MatchResult:
    """A single match from a rule-based pattern check."""
    text: str
    rule: str
    sentenceId: str


def match_rules(sentence_text: str, sentence_id: str, rules: dict[str, list[str]]) -> list[MatchResult]:
    """Check a sentence against a rule registry. Returns all matches."""
    lower = sentence_text.lower()
    results: list[MatchResult] = []
    for rule_label, phrases in rules.items():
        for phrase in phrases:
            if phrase in lower:
                results.append(MatchResult(
                    text=sentence_text.strip(),
                    rule=rule_label,
                    sentenceId=sentence_id,
                ))
                break  # one match per rule per sentence
    return results


def has_any_phrase(text: str, phrases: list[str]) -> bool:
    """Check if any phrase appears in text (case-insensitive)."""
    lower = text.lower()
    return any(p in lower for p in phrases)


def detect_quant_type(sentence_text: str) -> str | None:
    """Detect the quantitative signal type for a sentence, if any."""
    lower = sentence_text.lower()
    if has_any_phrase(lower, QUANT_PERCENTAGE_PHRASES):
        return "percentage"
    if has_any_phrase(lower, QUANT_INCREASE_PHRASES):
        return "increase"
    if has_any_phrase(lower, QUANT_DECREASE_PHRASES):
        return "decrease"
    if has_any_phrase(lower, QUANT_TEMPORAL_PHRASES):
        return "temporal"
    return None
