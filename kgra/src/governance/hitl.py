"""
KGRA Human-in-the-Loop (HITL) — interrupt points for human review.
"""

from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class HITLManager:
    """Manages human review requests and approvals."""

    def __init__(self):
        self._pending: dict[str, dict] = {}

    async def request_review(self, run_id: str, reason: str, context: dict) -> str:
        """Create a human review request."""
        review_id = f"hitl_{run_id[:8]}"
        self._pending[review_id] = {
            "run_id": run_id,
            "reason": reason,
            "context": context,
            "status": "pending",
        }
        logger.info(f"HITL review requested: {review_id} — {reason}")
        return review_id

    async def get_pending(self) -> list[dict]:
        """List all pending review requests."""
        return [{"id": k, **v} for k, v in self._pending.items() if v["status"] == "pending"]

    async def approve(self, review_id: str, approver: str, notes: str = "") -> dict:
        """Approve a pending review."""
        if review_id not in self._pending:
            return {"error": "Review not found"}
        self._pending[review_id]["status"] = "approved"
        self._pending[review_id]["approver"] = approver
        self._pending[review_id]["notes"] = notes
        return {"approved": True, "review_id": review_id}

    async def reject(self, review_id: str, reviewer: str, reason: str = "") -> dict:
        """Reject a pending review."""
        if review_id not in self._pending:
            return {"error": "Review not found"}
        self._pending[review_id]["status"] = "rejected"
        self._pending[review_id]["reviewer"] = reviewer
        self._pending[review_id]["rejection_reason"] = reason
        return {"rejected": True, "review_id": review_id}
