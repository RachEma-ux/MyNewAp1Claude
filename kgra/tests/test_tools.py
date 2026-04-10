"""
Unit tests for KGRA tools — graph, learning, evaluation, MCP.
"""

import pytest
import asyncio


# ── Graph Tools ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_schema_slice():
    from kgra.src.tools.graph_tools import get_schema_slice
    result = await get_schema_slice(["Person", "Company"], max_depth=2)
    assert "node_labels" in result
    assert "Person" in result["node_labels"]
    assert result["_cost"]["graph_reads"] == 1


@pytest.mark.asyncio
async def test_plan_cypher_read():
    from kgra.src.tools.graph_tools import plan_cypher_read
    result = await plan_cypher_read("Find all people", {"node_labels": ["Person"]})
    assert "query" in result
    assert "MATCH" in result["query"]
    assert "LIMIT" in result["query"]
    assert result["language"] == "cypher"


@pytest.mark.asyncio
async def test_execute_cypher_read():
    from kgra.src.tools.graph_tools import execute_cypher_read
    result = await execute_cypher_read("MATCH (n) RETURN n LIMIT 10")
    assert "records" in result
    assert result["_cost"]["graph_reads"] == 1


@pytest.mark.asyncio
async def test_resolve_entities():
    from kgra.src.tools.graph_tools import resolve_entities
    result = await resolve_entities(["Paris", "France"])
    assert "resolved" in result
    assert "Paris" in result["resolved"]


# ── Learning Tools ────────────���─────────────────────────────────

@pytest.mark.asyncio
async def test_construct_reasoning_path():
    from kgra.src.tools.learning_tools import construct_reasoning_path
    result = await construct_reasoning_path(
        run_id="test123",
        query="What is the capital?",
        answer="Paris",
        tool_calls=[
            {"tool": "get_schema_slice", "timestamp": "t1"},
            {"tool": "execute_cypher_read", "timestamp": "t2"},
            {"tool": "synthesize_answer", "timestamp": "t3"},
        ],
    )
    assert result["path_id"].startswith("rp_test123")
    assert len(result["nodes"]) >= 4  # query + 3 steps + answer
    assert len(result["edges"]) >= 3


@pytest.mark.asyncio
async def test_propose_new_node_type():
    from kgra.src.tools.learning_tools import propose_new_node_type
    result = await propose_new_node_type([{"label": "Person", "count": 50}])
    assert result["candidate"] is not None
    assert result["validation_needed"] is True


# ── Evaluation Tools ─────────────────��──────────────────────────

@pytest.mark.asyncio
async def test_evaluate_knowledge_bundle():
    from kgra.src.tools.evaluation_tools import evaluate_knowledge_bundle
    docs = [
        {"name": "design.md", "content": "This API endpoint accepts JSON requests and returns structured responses with error handling."},
        {"name": "arch.md", "content": "The system uses a microservices architecture with state management and dependency injection."},
    ]
    result = await evaluate_knowledge_bundle(docs, "test_bundle")
    assert "bundle_id" in result
    assert 0 <= result["coherence_score"] <= 10
    assert 0 <= result["readiness_score"] <= 10
    assert isinstance(result["resolved_decisions"], list)
    assert isinstance(result["review_log"], list)


@pytest.mark.asyncio
async def test_extract_contract_mapping():
    from kgra.src.tools.evaluation_tools import extract_contract_mapping
    result = await extract_contract_mapping("REST API with JSON body", "gRPC service with protobuf")
    assert "request_mapping" in result
    assert "response_mapping" in result
    assert "error_mapping" in result


@pytest.mark.asyncio
async def test_resolve_decision_fork():
    from kgra.src.tools.evaluation_tools import resolve_decision_fork
    result = await resolve_decision_fork("Choose between REST and GraphQL")
    assert "resolution" in result
    assert "justification" in result
    assert result["confidence"] > 0


@pytest.mark.asyncio
async def test_score_coherence():
    from kgra.src.tools.evaluation_tools import score_coherence
    result = await score_coherence("This is a well-structured document about API design with clear specifications and error handling.")
    assert 0 <= result["score"] <= 10
    assert "verdict" in result


@pytest.mark.asyncio
async def test_score_readiness():
    from kgra.src.tools.evaluation_tools import score_readiness
    result = await score_readiness("The API requires authentication. Config from environment variables. Dependency on PostgreSQL.")
    assert 0 <= result["score"] <= 10
    assert isinstance(result["missing_specifics"], list)


# ── MCP Tools ────────────────────��──────────────────────��───────

@pytest.mark.asyncio
async def test_discover_mcp_tools():
    from kgra.src.tools.mcp_tools import discover_mcp_tools
    result = await discover_mcp_tools()
    assert "servers" in result
    assert "total" in result


@pytest.mark.asyncio
async def test_invoke_mcp_tool_unknown_server():
    from kgra.src.tools.mcp_tools import invoke_mcp_tool
    result = await invoke_mcp_tool("nonexistent", "test", {})
    assert "error" in result
