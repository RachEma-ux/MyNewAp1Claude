"""
KGRA Governance Policy Engine (Section 8).
Checks each tool call before execution against governance rules.
"""

from __future__ import annotations
import logging
from typing import Optional

from ..config import get_config

logger = logging.getLogger(__name__)

# Dangerous Cypher keywords that indicate write operations
WRITE_KEYWORDS = {"CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DROP", "DETACH", "FOREACH", "LOAD CSV", "CALL apoc", "CALL gds"}


class PolicyEngine:
    """Enforces all governance rules from Section 8."""

    def __init__(self):
        self.cfg = get_config()

    def check_tool_call(self, tool_name: str, args: dict, workspace_id: str = "default") -> dict:
        """Pre-execution check for any tool call.
        Returns: {allowed: bool, reasons: list[str], budget_remaining: dict}
        """
        reasons = []

        # 1. Read-only default for graph tools
        if tool_name in ("execute_cypher_read", "plan_cypher_read"):
            query = args.get("query", args.get("cypher", ""))
            for kw in WRITE_KEYWORDS:
                if kw in query.upper():
                    reasons.append(f"Write keyword '{kw}' blocked by read-only policy")

        # 2. Source allowlist
        if workspace_id != "default":
            allowlists = self.cfg.governance.workspace_allowlists
            if allowlists and workspace_id not in allowlists:
                reasons.append(f"Workspace '{workspace_id}' not in allowlist")

        # 3. Query shape limits
        if tool_name in ("execute_cypher_read", "execute_sparql_read"):
            max_rows = args.get("max_rows", 0)
            if max_rows > self.cfg.limits.max_rows:
                reasons.append(f"max_rows {max_rows} exceeds limit {self.cfg.limits.max_rows}")

        # 4. MCP access control
        if tool_name in ("invoke_mcp_tool", "register_mcp_server"):
            server = args.get("server_name", "")
            registry_names = [s.name for s in self.cfg.mcp.registry]
            if server and server not in registry_names:
                reasons.append(f"MCP server '{server}' not in workspace allowlist")

        # 5. Bundle size limit
        if tool_name == "evaluate_knowledge_bundle":
            docs = args.get("documents", [])
            if len(docs) > self.cfg.limits.max_bundle_documents:
                reasons.append(f"Bundle exceeds {self.cfg.limits.max_bundle_documents} document limit")

        allowed = len(reasons) == 0
        if not allowed:
            logger.warning(f"Policy denied {tool_name}: {reasons}")

        return {"allowed": allowed, "reasons": reasons}

    def check_budget(self, current_cost: dict) -> dict:
        """Check if run is within budget limits."""
        cfg = self.cfg.limits
        warnings = []

        if current_cost.get("llm_tokens", 0) > cfg.llm_input_budget + cfg.llm_output_budget:
            warnings.append("LLM token budget exceeded")
        if current_cost.get("mcp_calls", 0) > cfg.max_mcp_calls_per_run:
            warnings.append("MCP call limit exceeded")
        if current_cost.get("vector_queries", 0) > cfg.max_vector_queries:
            warnings.append("Vector query limit exceeded")

        return {"within_budget": len(warnings) == 0, "warnings": warnings}

    def check_ontology_change(self, change_type: str, requires_approval: bool = False) -> dict:
        """Check if ontology change is permitted."""
        if self.cfg.governance.require_human_approval_ontology or requires_approval:
            return {"allowed": False, "reason": "Human approval required for ontology changes", "pending_approval": True}
        return {"allowed": True, "reason": "Auto-approved within workspace scope"}
