"""
Permanent Learning Graph Plane — all acquired knowledge with versioning.
Neo4j/Neptune with timestamped edges, schema version table.
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional

from ..config import get_config

logger = logging.getLogger(__name__)


class LearningPlane:
    """Permanent, versioned knowledge graph for all learned knowledge."""

    def __init__(self):
        self._driver = None
        self._current_version = "v0"

    async def connect(self):
        """Initialize learning graph driver (read-write)."""
        cfg = get_config()
        # In production: AsyncGraphDatabase.driver(cfg.learning_graph.uri, ...)
        logger.info(f"Learning plane connected to {cfg.learning_graph.uri}")

    async def close(self):
        if self._driver:
            await self._driver.close()

    async def get_schema_version(self) -> str:
        """Get current schema version."""
        return self._current_version

    async def add_node(self, label: str, properties: dict, version: Optional[str] = None) -> str:
        """Add a node with timestamp and version."""
        props = {
            **properties,
            "_created_at": datetime.now(timezone.utc).isoformat(),
            "_version": version or self._current_version,
        }
        node_id = f"{label}_{props.get('name', 'anon')}_{datetime.now(timezone.utc).timestamp()}"
        # In production: CREATE (n:Label {props}) RETURN id(n)
        logger.debug(f"Learning node added: {label}")
        return node_id

    async def add_edge(self, from_id: str, to_id: str, rel_type: str, properties: Optional[dict] = None) -> str:
        """Add an edge with timestamp."""
        props = {
            **(properties or {}),
            "_created_at": datetime.now(timezone.utc).isoformat(),
            "_version": self._current_version,
        }
        edge_id = f"{rel_type}_{from_id}_{to_id}"
        # In production: MATCH (a), (b) WHERE id(a)=$from AND id(b)=$to CREATE (a)-[r:REL_TYPE {props}]->(b)
        return edge_id

    async def rollback_to_version(self, version: str) -> dict:
        """Roll back schema and content to a previous version."""
        # In production: DELETE nodes/edges where _version > target
        return {"rolled_back_to": version, "nodes_removed": 0, "edges_removed": 0}

    async def export_subgraph(self, node_ids: list[str]) -> dict:
        """Export a subgraph for external use."""
        return {"nodes": [], "edges": [], "exported_count": len(node_ids)}

    async def query(self, cypher: str, params: Optional[dict] = None) -> list[dict]:
        """Execute query against learning graph."""
        return []

    async def store_reasoning_path(self, path: dict) -> str:
        """Store a reasoning path as nodes/edges in the learning graph."""
        path_id = path.get("path_id", "")
        for node in path.get("nodes", []):
            await self.add_node(node.get("type", "StepNode"), node)
        for edge in path.get("edges", []):
            await self.add_edge(edge["from"], edge["to"], edge["type"])
        return path_id

    async def store_evaluation_result(self, evaluation: dict) -> str:
        """Store a bundle evaluation result."""
        bundle_id = evaluation.get("bundle_id", "")
        await self.add_node("EvaluatedBundle", {
            "bundle_id": bundle_id,
            "name": evaluation.get("bundle_name", ""),
            "coherence_score": evaluation.get("coherence_score", 0),
            "readiness_score": evaluation.get("readiness_score", 0),
            "document_count": evaluation.get("document_count", 0),
        })

        for decision in evaluation.get("resolved_decisions", []):
            dec_id = await self.add_node("ResolvedDecision", decision)
            await self.add_edge(bundle_id, dec_id, "HAS_DECISION")

        for mapping in evaluation.get("contract_mappings", []):
            map_id = await self.add_node("ContractMapping", mapping)
            await self.add_edge(bundle_id, map_id, "HAS_MAPPING")

        for pattern in evaluation.get("extracted_patterns", []):
            pat_id = await self.add_node("ExtractedPattern", {"name": pattern})
            await self.add_edge(bundle_id, pat_id, "EXTRACTED_PATTERN")

        return bundle_id

    async def bump_schema_version(self) -> str:
        """Increment schema version."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        self._current_version = f"v{ts}"
        return self._current_version
