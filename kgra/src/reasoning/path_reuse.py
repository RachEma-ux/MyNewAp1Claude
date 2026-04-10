"""
Reasoning Path Reuse — similarity search, adaptation, and reuse of stored paths.
"""

from __future__ import annotations
from typing import Optional


def compute_path_signature(intent: str, domain: str, schema_hash: str) -> str:
    """Create a signature for matching stored paths."""
    return f"{intent}|{domain}|{schema_hash}"


def find_similar_paths(signature: str, stored_paths: list[dict], top_k: int = 3) -> list[dict]:
    """Find stored paths with similar signatures using Jaccard on entity types."""
    sig_parts = set(signature.split("|"))
    results = []

    for path in stored_paths:
        path_sig = set(path.get("signature", "").split("|"))
        if not path_sig:
            continue
        intersection = sig_parts & path_sig
        union = sig_parts | path_sig
        jaccard = len(intersection) / max(len(union), 1)
        if jaccard > 0.3:
            results.append({**path, "_similarity": jaccard})

    return sorted(results, key=lambda p: p["_similarity"], reverse=True)[:top_k]


def adapt_path(stored_path: dict, new_entities: dict[str, str], new_max_hops: Optional[int] = None) -> dict:
    """Adapt a stored path by substituting entities and adjusting parameters.
    new_entities: {old_entity: new_entity} mapping
    """
    adapted = {**stored_path, "path_id": f"adapted_{stored_path.get('path_id', '')}"}

    # Substitute entities in node contents
    nodes = []
    for node in stored_path.get("nodes", []):
        new_node = {**node}
        content = new_node.get("content", "")
        for old, new in new_entities.items():
            content = content.replace(old, new)
        new_node["content"] = content
        nodes.append(new_node)

    adapted["nodes"] = nodes
    adapted["edges"] = stored_path.get("edges", [])
    adapted["adaptations"] = list(new_entities.keys())

    return adapted
