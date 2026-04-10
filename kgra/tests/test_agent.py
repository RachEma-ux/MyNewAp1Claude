"""
Integration tests for KGRA agent — state machine execution.
"""

import pytest


@pytest.mark.asyncio
async def test_simple_factual_query():
    """Success criterion: answer a simple query using direct_query mode."""
    from kgra.src.agent.graph import compile_kgra_graph

    graph = compile_kgra_graph()
    state = {"query": "What is the capital of France?"}
    result = await graph.ainvoke(state)

    assert result.get("run_id")
    assert result.get("intent") == "factual"
    assert result.get("mode") == "direct_query"
    assert result.get("answer")
    assert result.get("confidence") is not None
    assert "classify_intent" in result.get("completed_nodes", [])
    assert "synthesize_answer" in result.get("completed_nodes", [])


@pytest.mark.asyncio
async def test_bundle_evaluation_mode():
    """Success criterion: produce evaluation report with scores."""
    from kgra.src.agent.graph import compile_kgra_graph

    graph = compile_kgra_graph()
    state = {
        "query": "Evaluate bundle: test docs",
        "intent": "bundle_evaluation",
        "mode": "bundle_evaluation",
        "evaluation": {
            "bundle_id": "test_bundle",
            "documents": [
                {"name": "doc1.md", "content": "API design specification with endpoint definitions."},
                {"name": "doc2.md", "content": "Architecture document describing microservices."},
            ],
            "current_pass": 1,
        },
    }
    result = await graph.ainvoke(state)

    assert result.get("mode") == "bundle_evaluation"
    eval_state = result.get("evaluation", {})
    assert eval_state.get("coherence_score") is not None
    assert eval_state.get("readiness_score") is not None
    learning = result.get("learning", {})
    assert learning.get("knowledge_graph_updated") is True


@pytest.mark.asyncio
async def test_governance_blocks_write_query():
    """Governance must block write operations."""
    from kgra.src.agent.nodes import validate_operation_node

    state = {
        "planned_query": "CREATE (n:Person {name: 'Alice'}) RETURN n",
        "query_language": "cypher",
        "workspace_id": "default",
        "completed_nodes": [],
    }
    result = validate_operation_node(state)
    assert result["query_validated"] is False
    assert any("CREATE" in e for e in result["validation_errors"])


@pytest.mark.asyncio
async def test_intent_classification():
    """Test intent routing for different query types."""
    from kgra.src.agent.routing import classify_intent

    assert classify_intent("What is the capital of France?") == "factual"
    assert classify_intent("Compare Python vs Java") == "comparative"
    assert classify_intent("Evaluate bundle of documents") == "bundle_evaluation"
    assert classify_intent("Research the latest papers on transformers") == "research_directive"
    assert classify_intent("What if we changed the architecture?") == "hypothetical"


@pytest.mark.asyncio
async def test_reasoning_path_construction():
    """Reasoning paths should be built for runs with >3 tool calls."""
    from kgra.src.reasoning.path_builder import should_build_path, build_reasoning_path

    tool_calls = [
        {"tool": "get_schema_slice", "timestamp": "t1"},
        {"tool": "plan_cypher_read", "timestamp": "t2"},
        {"tool": "execute_cypher_read", "timestamp": "t3"},
        {"tool": "synthesize_answer", "timestamp": "t4"},
    ]
    assert should_build_path(tool_calls) is True
    assert should_build_path(tool_calls[:2]) is False

    path = build_reasoning_path("run1", "test query", "test answer", tool_calls)
    assert path["path_id"].startswith("rp_")
    assert len(path["nodes"]) >= 5
    assert len(path["edges"]) >= 4


@pytest.mark.asyncio
async def test_path_mining():
    """Frequent subgraph mining should find common sequences."""
    from kgra.src.reasoning.path_mining import mine_reasoning_macros

    paths = [
        {"nodes": [{"tool": "get_schema_slice"}, {"tool": "plan_cypher_read"}, {"tool": "execute_cypher_read"}, {"tool": "synthesize_answer"}]},
        {"nodes": [{"tool": "get_schema_slice"}, {"tool": "plan_cypher_read"}, {"tool": "execute_cypher_read"}, {"tool": "synthesize_answer"}]},
        {"nodes": [{"tool": "get_schema_slice"}, {"tool": "plan_cypher_read"}, {"tool": "execute_cypher_read"}, {"tool": "synthesize_answer"}]},
    ]
    macros = mine_reasoning_macros(paths, min_support=3)
    assert len(macros) > 0
    assert macros[0]["support"] >= 3
