"""
KGRA FastAPI Application — main API endpoints.
POST /run (sync), POST /run/stream (SSE), GET /run/{run_id},
GET /reasoning_path/{id}, POST /evaluate_bundle
"""

from __future__ import annotations
import logging
import uuid
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .models import RunRequest, BundleEvaluationRequest, KGRAAnswer
from ..agent.graph import compile_kgra_graph, get_checkpointer
from ..agent.state import KGRAState
from ..tools.evaluation_tools import evaluate_knowledge_bundle
from ..reasoning.path_builder import should_build_path, build_reasoning_path
from ..config import get_config

logger = logging.getLogger(__name__)

app = FastAPI(
    title="KGRA — Knowledge Graph Reasoning Agent",
    version="2.0.0",
    description="Autonomous, self-improving hybrid reasoning agent",
)

# Compile graph on startup
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        checkpointer = get_checkpointer()
        _graph = compile_kgra_graph(checkpointer=checkpointer)
    return _graph


def _state_to_answer(state: dict) -> KGRAAnswer:
    """Convert KGRAState to KGRAAnswer response model."""
    return KGRAAnswer(
        answer=state.get("answer", ""),
        mode=state.get("mode", "direct_query"),
        confidence=state.get("confidence", 0),
        observed_facts=state.get("observed_facts", []),
        inferred_claims=state.get("inferred_claims", []),
        evidence_graph={"nodes": state.get("evidence_nodes", []), "edges": state.get("evidence_edges", [])},
        provenance=state.get("provenance", []),
        temporal=state.get("temporal", {"as_of": ""}),
        missing_knowledge=state.get("missing_knowledge", {"hasGap": False}),
        governance=state.get("governance", {"verdict": "allow", "reasons": []}),
        learning=state.get("learning", {"knowledge_graph_updated": False}),
        analytical=state.get("analytical", {"reasoning_strength": 0}),
        error={"code": "FAILED", "message": "; ".join(state.get("errors", [])), "failedSteps": [], "fallbackUsed": state.get("fallback_used", "")} if state.get("errors") else None,
        cost_estimate=state.get("cost", {"llm_tokens": 0, "graph_reads": 0, "vector_queries": 0, "mcp_calls": 0, "estimated_usd_cents": 0}),
        run_id=state.get("run_id", ""),
        request_id=state.get("request_id", ""),
    )


@app.post("/run", response_model=KGRAAnswer)
async def run_sync(request: RunRequest):
    """Synchronous KGRA run — returns complete KGRAAnswer."""
    graph = _get_graph()
    initial_state: KGRAState = {
        "query": request.query,
        "workspace_id": request.workspace_id,
        "session_id": request.session_id or str(uuid.uuid4()),
        "user_id": request.user_id,
        "run_id": str(uuid.uuid4()),
        "request_id": str(uuid.uuid4()),
    }

    if request.mode:
        initial_state["mode"] = request.mode

    try:
        result = await graph.ainvoke(initial_state)

        # Auto-build reasoning path if >3 tool calls
        tool_calls = result.get("tool_calls", [])
        if should_build_path(tool_calls):
            path = build_reasoning_path(
                result.get("run_id", ""),
                result.get("query", ""),
                result.get("answer", ""),
                tool_calls,
                result.get("mode", "direct_query"),
            )
            learning = result.get("learning", {})
            learning["reasoning_path_id"] = path["path_id"]
            result["learning"] = learning

        return _state_to_answer(result)

    except Exception as e:
        logger.error(f"Run failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/run/stream")
async def run_stream(request: RunRequest):
    """SSE streaming KGRA run — streams state updates."""
    import json

    graph = _get_graph()
    initial_state: KGRAState = {
        "query": request.query,
        "workspace_id": request.workspace_id,
        "session_id": request.session_id or str(uuid.uuid4()),
        "user_id": request.user_id,
        "run_id": str(uuid.uuid4()),
        "request_id": str(uuid.uuid4()),
    }

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for event in graph.astream(initial_state):
                node_name = list(event.keys())[0] if event else "unknown"
                yield f"data: {json.dumps({'node': node_name, 'timestamp': ''})}\n\n"

            # Final state
            result = await graph.ainvoke(initial_state)
            answer = _state_to_answer(result)
            yield f"data: {json.dumps({'type': 'final', 'answer': answer.model_dump()})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/run/{run_id}")
async def get_run(run_id: str):
    """Get a completed run by ID (requires checkpointer)."""
    # In production: load from checkpoint store
    return {"run_id": run_id, "status": "not_found", "message": "Run retrieval requires PostgresSaver checkpointer"}


@app.get("/reasoning_path/{path_id}")
async def get_reasoning_path(path_id: str):
    """Get a stored reasoning path by ID."""
    # In production: query learning graph
    return {"path_id": path_id, "nodes": [], "edges": []}


@app.post("/evaluate_bundle", response_model=KGRAAnswer)
async def evaluate_bundle(request: BundleEvaluationRequest):
    """Evaluate a knowledge bundle using the full framework."""
    graph = _get_graph()
    initial_state: KGRAState = {
        "query": f"Evaluate knowledge bundle: {request.bundle_name or 'unnamed'}",
        "workspace_id": "default",
        "run_id": str(uuid.uuid4()),
        "request_id": str(uuid.uuid4()),
        "intent": "bundle_evaluation",
        "mode": "bundle_evaluation",
        "evaluation": {
            "bundle_id": str(uuid.uuid4()),
            "documents": request.documents,
            "current_pass": 1,
        },
    }

    result = await graph.ainvoke(initial_state)
    return _state_to_answer(result)


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}
