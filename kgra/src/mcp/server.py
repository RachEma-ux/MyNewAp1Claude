"""
KGRA MCP Server — exposes KGRA tools to other agents via FastAPI + SSE.
Tools: query_kgra, get_reasoning_path, get_learning_graph_slice, evaluate_knowledge_bundle
Resources: learning_graph://current/schema, learning_graph://reasoning_paths/{id}
"""

from __future__ import annotations
import os
import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel

from ..config import get_config

logger = logging.getLogger(__name__)

mcp_app = FastAPI(title="KGRA MCP Server", version="2.0")


def _verify_api_key(x_api_key: str = Header(default="")):
    """API key authentication for MCP server calls."""
    cfg = get_config()
    expected = os.environ.get(cfg.mcp.server_api_key_env, "")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


class ToolCallRequest(BaseModel):
    tool: str
    arguments: dict = {}


class ResourceReadRequest(BaseModel):
    uri: str


# ── Tools ───────────────────────────────────────────────────────

@mcp_app.post("/tools/call", dependencies=[Depends(_verify_api_key)])
async def call_tool(request: ToolCallRequest):
    """MCP tools/call endpoint."""
    tool = request.tool
    args = request.arguments

    if tool == "query_kgra":
        # In production: invoke the full KGRA graph
        return {"result": {"answer": "KGRA query result placeholder", "confidence": 0.5}}

    elif tool == "get_reasoning_path":
        path_id = args.get("path_id", "")
        return {"result": {"path_id": path_id, "nodes": [], "edges": []}}

    elif tool == "get_learning_graph_slice":
        entity_ids = args.get("entity_ids", [])
        return {"result": {"nodes": [], "edges": [], "entities": entity_ids}}

    elif tool == "evaluate_knowledge_bundle":
        from ..tools.evaluation_tools import evaluate_knowledge_bundle
        documents = args.get("documents", [])
        result = await evaluate_knowledge_bundle(documents, args.get("bundle_name"))
        return {"result": result}

    else:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {tool}")


# ── Resources ───────────────────────────────────────────────────

@mcp_app.post("/resources/read", dependencies=[Depends(_verify_api_key)])
async def read_resource(request: ResourceReadRequest):
    """MCP resources/read endpoint."""
    uri = request.uri

    if uri == "learning_graph://current/schema":
        return {"content": {"version": "v0", "node_types": [], "relation_types": []}}

    elif uri.startswith("learning_graph://reasoning_paths/"):
        path_id = uri.split("/")[-1]
        return {"content": {"path_id": path_id, "nodes": [], "edges": []}}

    elif uri.startswith("learning_graph://evaluations/"):
        bundle_id = uri.split("/")[-1]
        return {"content": {"bundle_id": bundle_id, "coherence_score": 0, "readiness_score": 0}}

    else:
        raise HTTPException(status_code=404, detail=f"Unknown resource: {uri}")


# ── Tools List ──────────────────────────────────────────────────

@mcp_app.get("/tools/list", dependencies=[Depends(_verify_api_key)])
async def list_tools():
    """MCP tools/list endpoint."""
    return {
        "tools": [
            {"name": "query_kgra", "description": "Ask KGRA a natural language question", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}}},
            {"name": "get_reasoning_path", "description": "Get a stored reasoning path", "inputSchema": {"type": "object", "properties": {"path_id": {"type": "string"}}}},
            {"name": "get_learning_graph_slice", "description": "Get subgraph from learning graph", "inputSchema": {"type": "object", "properties": {"entity_ids": {"type": "array", "items": {"type": "string"}}}}},
            {"name": "evaluate_knowledge_bundle", "description": "Evaluate a document bundle", "inputSchema": {"type": "object", "properties": {"documents": {"type": "array"}, "bundle_name": {"type": "string"}}}},
        ]
    }
