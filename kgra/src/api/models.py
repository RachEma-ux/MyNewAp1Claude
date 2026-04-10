"""
KGRA API Models — Pydantic models matching the KGRAAnswer contract (Section 10).
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, Any


class RunRequest(BaseModel):
    query: str
    workspace_id: str = "default"
    session_id: str = ""
    user_id: str = ""
    mode: Optional[str] = None  # Override auto-detection


class BundleEvaluationRequest(BaseModel):
    documents: list[dict] = Field(description="List of {name, content} documents")
    bundle_name: Optional[str] = None


class KGRAAnswer(BaseModel):
    """Complete answer contract matching Section 10 TypeScript interface."""
    answer: str
    mode: str
    confidence: float

    observed_facts: list[dict] = []
    inferred_claims: list[dict] = []
    evidence_graph: dict = Field(default_factory=lambda: {"nodes": [], "edges": []})
    provenance: list[dict] = []

    temporal: dict = Field(default_factory=lambda: {"as_of": ""})
    missing_knowledge: dict = Field(default_factory=lambda: {"hasGap": False})
    governance: dict = Field(default_factory=lambda: {"verdict": "allow", "reasons": []})

    learning: dict = Field(default_factory=lambda: {"knowledge_graph_updated": False})
    analytical: dict = Field(default_factory=lambda: {"reasoning_strength": 0})

    error: Optional[dict] = None
    cost_estimate: dict = Field(default_factory=lambda: {"llm_tokens": 0, "graph_reads": 0, "vector_queries": 0, "mcp_calls": 0, "estimated_usd_cents": 0})
    run_id: str = ""
    request_id: str = ""
