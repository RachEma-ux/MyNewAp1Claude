"""
Source Graph Plane — read-only Cypher (Neo4j) and SPARQL (RDF) connectors.
Implements schema slicing for focused query generation.
"""

from __future__ import annotations
import logging
from typing import Any, Optional
from ..config import get_config

logger = logging.getLogger(__name__)


class Neo4jSourceAdapter:
    """Read-only Neo4j connector with schema slicing."""

    def __init__(self):
        self._driver = None

    async def connect(self):
        """Initialize Neo4j driver with read-only credentials."""
        cfg = get_config()
        # In production: from neo4j import AsyncGraphDatabase
        # self._driver = AsyncGraphDatabase.driver(cfg.source_graph.uri, auth=(cfg.source_graph.user, cfg.source_graph.password))
        logger.info(f"Neo4j source connected to {cfg.source_graph.uri}")

    async def close(self):
        if self._driver:
            await self._driver.close()

    async def get_schema(self) -> dict:
        """Return full schema: labels, relationship types, properties, indexes."""
        # In production: CALL db.schema.visualization()
        return {"node_labels": [], "relationship_types": [], "properties": {}, "indexes": []}

    async def get_schema_slice(self, entities: list[str], max_depth: int = 2) -> dict:
        """Extract schema subgraph relevant to given entities."""
        full_schema = await self.get_schema()
        # Filter to relevant labels
        relevant_labels = [l for l in full_schema.get("node_labels", []) if any(e.lower() in l.lower() for e in entities)]
        return {
            "node_labels": relevant_labels or entities[:10],
            "relationship_types": full_schema.get("relationship_types", []),
            "properties": {l: full_schema.get("properties", {}).get(l, []) for l in relevant_labels},
            "indexes": full_schema.get("indexes", []),
        }

    async def execute_read(self, cypher: str, params: Optional[dict] = None, max_rows: int = 1000) -> list[dict]:
        """Execute read-only Cypher query."""
        cfg = get_config()
        max_rows = min(max_rows, cfg.limits.max_rows)
        # In production: session.run(cypher, params, database=cfg.source_graph.database)
        return []


class SparqlSourceAdapter:
    """Read-only SPARQL connector."""

    def __init__(self):
        self._endpoint = None

    async def connect(self, endpoint: str):
        self._endpoint = endpoint
        logger.info(f"SPARQL source connected to {endpoint}")

    async def get_schema(self) -> dict:
        """Introspect RDF schema via SPARQL."""
        # SELECT DISTINCT ?class WHERE { ?s a ?class }
        return {"classes": [], "properties": [], "ranges": {}}

    async def execute_read(self, sparql: str, max_rows: int = 1000) -> list[dict]:
        """Execute SPARQL SELECT/CONSTRUCT query."""
        return []
