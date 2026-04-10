"""
Expertise Acquisition: Relation Analysis, Design & Building (Section 6).
Pattern detection → candidate generation → validation → materialisation.
"""

from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger(__name__)

MIN_SUPPORT = 10


async def detect_path_patterns(learning_graph_query_fn, min_length: int = 2, max_length: int = 3) -> list[dict]:
    """Mine learning graph for frequent path patterns."""
    # In production: MATCH p=(a)-[*2..3]->(b) WITH relationships(p) as rels, count(*) as cnt
    return []


async def generate_relation_candidate(pattern: dict) -> dict:
    """Propose new relation type from observed pattern."""
    return {
        "name": pattern.get("suggested_name", "NEW_RELATION"),
        "domain": pattern.get("start_type", "Entity"),
        "range": pattern.get("end_type", "Entity"),
        "cardinality": "N:M",
        "inverse": None,
        "temporal": False,
        "properties": ["confidence", "source", "weight"],
    }


async def validate_relation(candidate: dict, support_count: int = 0) -> dict:
    """Validate: consistency, predictive power, redundancy."""
    scores = {
        "consistency": min(1.0, support_count / max(MIN_SUPPORT, 1)),
        "predictive_power": 0.5,
        "redundancy": 0.1,
    }
    overall = sum(scores.values()) / len(scores)
    return {
        "candidate": candidate["name"],
        "scores": scores,
        "overall": round(overall, 3),
        "approved": overall >= 0.6,
    }


async def materialise_relation(candidate: dict, learning_plane) -> dict:
    """Add relation type to schema and optionally materialise instances."""
    version = await learning_plane.bump_schema_version()
    return {
        "materialised": True,
        "relation": candidate["name"],
        "version": version,
        "instances_created": 0,
    }
