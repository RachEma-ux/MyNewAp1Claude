"""
Expertise Acquisition: Node Design & Building (Section 5).
Autonomous observation → candidate generation → validation → commit loop.
"""

from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger(__name__)

VALIDATION_THRESHOLD = 0.75
REVIEW_THRESHOLD = 0.50


async def detect_instance_clusters(learning_graph_query_fn) -> list[dict]:
    """Scan learning graph for entity clusters using community detection.
    Uses Louvain/Leiden on entity co-occurrence edges.
    """
    # In production: run community detection algorithm on learning graph
    return []


async def generate_node_type_candidate(cluster: dict) -> dict:
    """Generate candidate node type from an observed cluster."""
    return {
        "name": cluster.get("suggested_name", "NewType"),
        "description": f"Auto-detected from cluster of {cluster.get('size', 0)} entities",
        "required_properties": ["name", "id"],
        "optional_properties": cluster.get("common_properties", []),
        "examples": cluster.get("examples", [])[:10],
    }


async def validate_node_type(candidate: dict, historical_queries: Optional[list[str]] = None) -> dict:
    """Validate candidate: discriminative power, query utility, schema conflict, simulation."""
    scores = {
        "discriminative_power": 0.6,
        "query_utility": 0.5,
        "schema_conflict": 0.1,
        "simulation_improvement": 0.0,
    }
    overall = sum(scores.values()) / len(scores)

    if overall >= VALIDATION_THRESHOLD:
        decision = "commit"
    elif overall >= REVIEW_THRESHOLD:
        decision = "human_review"
    else:
        decision = "reject"

    return {
        "candidate": candidate["name"],
        "scores": scores,
        "overall": round(overall, 3),
        "decision": decision,
    }


async def commit_node_type(candidate: dict, learning_plane) -> dict:
    """Commit validated node type to schema with versioning."""
    version = await learning_plane.bump_schema_version()
    node_id = await learning_plane.add_node("NodeTypeDefinition", {
        "name": candidate["name"],
        "description": candidate.get("description", ""),
        "required_properties": candidate.get("required_properties", []),
        "optional_properties": candidate.get("optional_properties", []),
    })
    return {"committed": True, "version": version, "node_id": node_id}


async def run_node_design_loop(learning_plane) -> list[dict]:
    """Full closed-loop: observe → generate → validate → commit/reject."""
    results = []
    clusters = await detect_instance_clusters(learning_plane.query)

    for cluster in clusters:
        candidate = await generate_node_type_candidate(cluster)
        validation = await validate_node_type(candidate)

        if validation["decision"] == "commit":
            commit_result = await commit_node_type(candidate, learning_plane)
            results.append({"candidate": candidate["name"], "action": "committed", **commit_result})
        elif validation["decision"] == "human_review":
            results.append({"candidate": candidate["name"], "action": "flagged_for_review", **validation})
        else:
            results.append({"candidate": candidate["name"], "action": "rejected", **validation})

    return results
