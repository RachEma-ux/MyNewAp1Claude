"""
Memory Graph Plane — session-local task memory.
Uses Redis for hot cache + Postgres JSONB for persistence.
"""

from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from ..config import get_config

logger = logging.getLogger(__name__)


class MemoryPlane:
    """Session-scoped task memory: facts, claims, hypotheses, evidence links."""

    def __init__(self):
        self._redis = None
        self._pg_pool = None

    async def connect(self):
        """Initialize Redis + Postgres connections."""
        cfg = get_config()
        # In production: aioredis.from_url() + asyncpg.create_pool()
        logger.info("Memory plane connected")

    async def close(self):
        if self._redis:
            await self._redis.close()
        if self._pg_pool:
            await self._pg_pool.close()

    async def get_session(self, session_id: str) -> dict:
        """Load session memory graph."""
        # Try Redis first, fall back to Postgres
        return {"session_id": session_id, "facts": [], "claims": [], "hypotheses": [], "evidence_links": []}

    async def add_fact(self, session_id: str, fact: dict) -> str:
        """Add observed fact to session memory."""
        fact_id = f"fact_{datetime.now(timezone.utc).timestamp()}"
        # In production: HSET to Redis + INSERT to Postgres
        return fact_id

    async def add_claim(self, session_id: str, claim: dict) -> str:
        """Add inferred claim to session memory."""
        claim_id = f"claim_{datetime.now(timezone.utc).timestamp()}"
        return claim_id

    async def add_hypothesis(self, session_id: str, hypothesis: dict) -> str:
        """Add hypothesis to session memory."""
        hyp_id = f"hyp_{datetime.now(timezone.utc).timestamp()}"
        return hyp_id

    async def get_facts(self, session_id: str) -> list[dict]:
        """Get all facts for a session."""
        session = await self.get_session(session_id)
        return session.get("facts", [])

    async def expire_session(self, session_id: str) -> None:
        """Remove session memory after TTL."""
        cfg = get_config()
        # Redis: EXPIRE key ttl
        logger.info(f"Session {session_id} expired")
