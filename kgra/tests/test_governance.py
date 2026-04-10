"""
Tests for governance policy engine, audit logger, and HITL.
"""

import pytest


def test_policy_blocks_write_cypher():
    from kgra.src.governance.policy_engine import PolicyEngine
    engine = PolicyEngine()
    result = engine.check_tool_call("execute_cypher_read", {"query": "CREATE (n:Test) RETURN n"})
    assert result["allowed"] is False
    assert any("CREATE" in r for r in result["reasons"])


def test_policy_allows_read_cypher():
    from kgra.src.governance.policy_engine import PolicyEngine
    engine = PolicyEngine()
    result = engine.check_tool_call("execute_cypher_read", {"query": "MATCH (n) RETURN n LIMIT 10"})
    assert result["allowed"] is True


def test_policy_blocks_excessive_rows():
    from kgra.src.governance.policy_engine import PolicyEngine
    engine = PolicyEngine()
    result = engine.check_tool_call("execute_cypher_read", {"query": "MATCH (n) RETURN n", "max_rows": 99999})
    assert result["allowed"] is False


def test_policy_blocks_unknown_mcp_server():
    from kgra.src.governance.policy_engine import PolicyEngine
    engine = PolicyEngine()
    result = engine.check_tool_call("invoke_mcp_tool", {"server_name": "evil_server"})
    assert result["allowed"] is False


def test_policy_blocks_oversized_bundle():
    from kgra.src.governance.policy_engine import PolicyEngine
    engine = PolicyEngine()
    docs = [{"name": f"doc{i}", "content": "x"} for i in range(200)]
    result = engine.check_tool_call("evaluate_knowledge_bundle", {"documents": docs})
    assert result["allowed"] is False


def test_audit_entry_checksum():
    from kgra.src.governance.audit_logger import AuditEntry
    entry = AuditEntry(
        run_id="test123",
        event_type="tool_call",
        tool_name="execute_cypher_read",
        inputs={"query": "MATCH (n) RETURN n"},
    )
    assert entry.checksum
    assert len(entry.checksum) == 64  # SHA-256 hex

    # Same inputs = same checksum
    entry2 = AuditEntry(
        run_id="test123",
        event_type="tool_call",
        tool_name="execute_cypher_read",
        inputs={"query": "MATCH (n) RETURN n"},
    )
    # Timestamps differ so checksums differ (immutability property)
    assert entry.checksum != entry2.checksum or entry.timestamp == entry2.timestamp


@pytest.mark.asyncio
async def test_hitl_request_and_approve():
    from kgra.src.governance.hitl import HITLManager
    mgr = HITLManager()
    review_id = await mgr.request_review("run1", "Low confidence", {"confidence": 0.2})
    assert review_id.startswith("hitl_")

    pending = await mgr.get_pending()
    assert len(pending) == 1

    result = await mgr.approve(review_id, "admin", "Looks OK")
    assert result["approved"] is True

    pending = await mgr.get_pending()
    assert len(pending) == 0
