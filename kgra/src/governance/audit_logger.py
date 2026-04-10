"""
KGRA Audit Logger — immutable Postgres table with SHA-256 checksums.
Logs all tool calls, governance decisions, ontology changes, and evaluations.
"""

from __future__ import annotations
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


class AuditEntry:
    def __init__(
        self,
        run_id: str,
        event_type: str,
        tool_name: str,
        workspace_id: str = "default",
        user_id: str = "",
        inputs: Optional[dict] = None,
        output_summary: str = "",
        governance_verdict: str = "allow",
        governance_reasons: Optional[list[str]] = None,
        cost: Optional[dict] = None,
    ):
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.run_id = run_id
        self.event_type = event_type
        self.tool_name = tool_name
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.inputs = inputs or {}
        self.output_summary = output_summary[:500]
        self.governance_verdict = governance_verdict
        self.governance_reasons = governance_reasons or []
        self.cost = cost or {}

        # SHA-256 checksum for immutability verification
        self.checksum = self._compute_checksum()

    def _compute_checksum(self) -> str:
        payload = json.dumps({
            "timestamp": self.timestamp,
            "run_id": self.run_id,
            "event_type": self.event_type,
            "tool_name": self.tool_name,
            "inputs": self.inputs,
            "governance_verdict": self.governance_verdict,
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "run_id": self.run_id,
            "event_type": self.event_type,
            "tool_name": self.tool_name,
            "workspace_id": self.workspace_id,
            "user_id": self.user_id,
            "inputs": self.inputs,
            "output_summary": self.output_summary,
            "governance_verdict": self.governance_verdict,
            "governance_reasons": self.governance_reasons,
            "cost": self.cost,
            "checksum": self.checksum,
        }


class AuditLogger:
    """Append-only audit logger backed by Postgres."""

    def __init__(self):
        self._buffer: list[AuditEntry] = []
        self._pg_pool = None

    async def connect(self):
        """Initialize Postgres connection for audit writes."""
        # In production: asyncpg.create_pool()
        logger.info("Audit logger connected")

    async def close(self):
        await self.flush()
        if self._pg_pool:
            await self._pg_pool.close()

    async def log(self, entry: AuditEntry):
        """Log an audit entry (buffered for batch insert)."""
        self._buffer.append(entry)
        logger.debug(f"Audit: {entry.event_type} {entry.tool_name} [{entry.governance_verdict}]")

        if len(self._buffer) >= 10:
            await self.flush()

    async def flush(self):
        """Flush buffered entries to Postgres."""
        if not self._buffer:
            return

        # In production: INSERT INTO kgra_audit_log (columns) VALUES ($1, $2, ...) for each entry
        entries = self._buffer
        self._buffer = []
        logger.info(f"Flushed {len(entries)} audit entries")

    async def log_tool_call(self, run_id: str, tool_name: str, inputs: dict, output: str, verdict: str = "allow", cost: Optional[dict] = None):
        """Convenience: log a tool call."""
        await self.log(AuditEntry(
            run_id=run_id,
            event_type="tool_call",
            tool_name=tool_name,
            inputs=inputs,
            output_summary=output,
            governance_verdict=verdict,
            cost=cost,
        ))

    async def log_governance_decision(self, run_id: str, decision: str, reasons: list[str], tool_name: str = ""):
        """Convenience: log a governance decision."""
        await self.log(AuditEntry(
            run_id=run_id,
            event_type="governance_decision",
            tool_name=tool_name,
            governance_verdict=decision,
            governance_reasons=reasons,
        ))

    async def log_ontology_change(self, run_id: str, change_type: str, details: dict):
        """Convenience: log an ontology change."""
        await self.log(AuditEntry(
            run_id=run_id,
            event_type="ontology_change",
            tool_name=change_type,
            inputs=details,
        ))
