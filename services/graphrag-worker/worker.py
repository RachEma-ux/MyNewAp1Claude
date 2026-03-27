"""
GraphRAG Worker Service

Python FastAPI service that wraps Microsoft's graphrag library.
Receives index and query jobs from the Node.js backend via HTTP.

Start: uvicorn worker:app --host 0.0.0.0 --port 8484
"""

import os
import json
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="GraphRAG Worker", version="0.1.0")

DATA_ROOT = os.environ.get("GRAPHRAG_DATA_ROOT", "/tmp/graphrag-data")


# ── Request / Response Models ────────────────────────────────────────────────


class WorkerSettings(BaseModel):
    llmModel: str = "gpt-4o-mini"
    embeddingModel: str = "text-embedding-3-small"
    chunkSize: int = 1200
    chunkOverlap: int = 200
    maxGleanings: int = 1
    communityLevel: int = 2


class IndexRequest(BaseModel):
    jobType: str = "index"
    moduleSlug: str
    datasetKey: str
    runKey: str
    snapshotPath: str
    workspacePath: str
    settings: WorkerSettings


class IndexResult(BaseModel):
    success: bool
    entityCount: int = 0
    relationshipCount: int = 0
    communityCount: int = 0
    tokenUsage: int = 0
    artifactPath: str = ""
    error: Optional[str] = None


class QueryRequest(BaseModel):
    jobType: str = "query"
    moduleSlug: str
    datasetKey: str
    method: str  # basic | local | global | drift
    question: str
    workspacePath: str


class QueryResult(BaseModel):
    success: bool
    answer: str = ""
    context: dict = {}
    tokenUsage: int = 0
    error: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "service": "graphrag-worker"}


@app.post("/index", response_model=IndexResult)
async def run_index(req: IndexRequest):
    """
    Run a GraphRAG index job.

    In a full deployment, this would:
    1. Read the snapshot CSV/Parquet from snapshotPath
    2. Generate graphrag settings.yaml
    3. Run graphrag.index against the workspace
    4. Return entity/relationship/community counts
    """
    try:
        workspace = Path(DATA_ROOT) / req.workspacePath
        workspace.mkdir(parents=True, exist_ok=True)

        # Write settings
        settings_path = workspace / "settings.yaml"
        settings_path.write_text(_generate_settings(req.settings))

        # In production, would call:
        # from graphrag.index import run_pipeline_with_config
        # result = await run_pipeline_with_config(workspace)

        return IndexResult(
            success=True,
            entityCount=0,
            relationshipCount=0,
            communityCount=0,
            tokenUsage=0,
            artifactPath=str(workspace / "output"),
            error=None,
        )
    except Exception as e:
        return IndexResult(success=False, error=str(e))


@app.post("/query", response_model=QueryResult)
async def run_query(req: QueryRequest):
    """
    Run a GraphRAG query.

    Supported methods: basic, local, global, drift
    Each method uses different search strategies over the knowledge graph.
    """
    try:
        workspace = Path(DATA_ROOT) / req.workspacePath

        if not workspace.exists():
            return QueryResult(
                success=False,
                error=f"No index found at {req.workspacePath}. Run an index job first.",
            )

        # In production, would call:
        # from graphrag.query import LocalSearch, GlobalSearch, DRIFTSearch
        # search = LocalSearch(workspace) if req.method == "local" else ...
        # result = await search.asearch(req.question)

        return QueryResult(
            success=True,
            answer=f"[GraphRAG {req.method} search] Worker received query: {req.question}",
            context={"method": req.method, "workspace": req.workspacePath},
            tokenUsage=0,
        )
    except Exception as e:
        return QueryResult(success=False, error=str(e))


def _generate_settings(settings: WorkerSettings) -> str:
    return f"""
llm:
  api_key: ${{GRAPHRAG_API_KEY}}
  model: {settings.llmModel}

embeddings:
  llm:
    api_key: ${{GRAPHRAG_API_KEY}}
    model: {settings.embeddingModel}

chunks:
  size: {settings.chunkSize}
  overlap: {settings.chunkOverlap}

entity_extraction:
  max_gleanings: {settings.maxGleanings}

community_reports:
  max_length: 2000
""".strip()
