"""
KGRA State Definition — TypedDict for the LangGraph state machine.
Matches Section 5 of the profile, extended with evaluation state.
"""

from __future__ import annotations
from typing import TypedDict, Optional, Any
from enum import Enum


class IntentType(str, Enum):
    FACTUAL = "factual"
    COMPARATIVE = "comparative"
    EXPLORATORY = "exploratory"
    TEMPORAL = "temporal"
    HYPOTHETICAL = "hypothetical"
    LEARNING_REQUEST = "learning_request"
    RESEARCH_DIRECTIVE = "research_directive"
    ONTOLOGY_DESIGN = "ontology_design"
    CONTRADICTION_RESOLUTION = "contradiction_resolution"
    CROSS_AGENT = "cross_agent_collaboration"
    REASONING_PATH_REUSE = "reasoning_path_reuse"
    SELF_EVALUATION = "self_evaluation"
    BUNDLE_EVALUATION = "bundle_evaluation"


class RuntimeMode(str, Enum):
    DIRECT_QUERY = "direct_query"
    PATH_REASONING = "path_reasoning"
    GRAPHRAG_LOCAL = "graphrag_local"
    GRAPHRAG_GLOBAL = "graphrag_global"
    DRIFT = "drift"
    BASIC_RAG = "basic_rag"
    HUMAN_REVIEW = "human_review"
    SELF_LEARNING = "self_learning"
    EXPERTISE_BUILDING = "expertise_building"
    RESEARCH_MODE = "research_mode"
    CROSS_AGENT = "cross_agent_collaboration"
    REASONING_PATH_REUSE = "reasoning_path_reuse"
    BUNDLE_EVALUATION = "bundle_evaluation"


class EvidenceNode(TypedDict, total=False):
    id: str
    node_type: str  # "fact" | "claim" | "evidence" | "decision"
    label: str
    source_ref: str
    confidence: float
    timestamp: str
    properties: dict


class EvidenceEdge(TypedDict, total=False):
    id: str
    from_id: str
    to_id: str
    edge_type: str  # "supports" | "contradicts" | "resolves" | "depends_on" | "precedes"
    weight: float


class ProvenanceEntry(TypedDict, total=False):
    source_type: str  # "graph" | "document" | "memory" | "other_ai" | "research" | "evaluated_bundle"
    source_ref: str
    operation_ref: str
    derivation_path: list[str]


class CostTracker(TypedDict, total=False):
    llm_tokens: int
    graph_reads: int
    vector_queries: int
    mcp_calls: int
    estimated_usd_cents: float


class TemporalScope(TypedDict, total=False):
    as_of: str
    valid_from: str
    valid_to: str
    warning: str


class GovernanceVerdict(TypedDict, total=False):
    verdict: str  # "allow" | "conditions" | "deny"
    reasons: list[str]
    human_review_required: bool


class BundleEvaluationState(TypedDict, total=False):
    bundle_id: str
    documents: list[dict]
    review_log: str
    coherence_score: float
    coherence_verdict: str
    readiness_score: float
    readiness_missing: list[str]
    resolved_decisions: list[dict]
    contract_mappings: list[dict]
    current_pass: int  # 1=gist, 2=structure, 3=gaps


class LearningOutcome(TypedDict, total=False):
    knowledge_graph_updated: bool
    new_node_types: list[str]
    new_relation_types: list[str]
    reasoning_path_id: str
    other_ai_contributions: list[dict]
    evaluated_bundle: dict


class AnalyticalMeta(TypedDict, total=False):
    reasoning_strength: float
    vulnerability: float
    alternative_hypotheses: list[dict]
    causal_claims: list[dict]


class KGRAState(TypedDict, total=False):
    """Complete state for the KGRA LangGraph state machine."""

    # ── Request ──
    run_id: str
    request_id: str
    query: str
    workspace_id: str
    session_id: str
    user_id: str

    # ── Intent & Mode ──
    intent: str  # IntentType value
    resolved_terms: dict[str, str]  # domain term → canonical form
    mode: str  # RuntimeMode value

    # ── Schema & Query Planning ──
    schema_slice: dict
    planned_query: str
    query_language: str  # "cypher" | "sparql" | "graphrag" | "vector"
    query_validated: bool
    validation_errors: list[str]

    # ── Execution Results ──
    raw_results: list[dict]
    paths: list[dict]
    ranked_paths: list[dict]

    # ── Evidence ──
    observed_facts: list[dict]
    inferred_claims: list[dict]
    evidence_nodes: list[EvidenceNode]
    evidence_edges: list[EvidenceEdge]
    provenance: list[ProvenanceEntry]

    # ── Temporal ──
    temporal: TemporalScope

    # ── Contradictions ──
    contradictions: list[dict]
    hypotheses: list[dict]

    # ── Answer ──
    answer: str
    confidence: float
    missing_knowledge: dict

    # ── Governance ──
    governance: GovernanceVerdict

    # ── Learning ──
    learning: LearningOutcome

    # ── Analytical ──
    analytical: AnalyticalMeta

    # ── Bundle Evaluation (subgraph state) ──
    evaluation: BundleEvaluationState

    # ── Cost ──
    cost: CostTracker

    # ── Control Flow ──
    current_node: str
    completed_nodes: list[str]
    errors: list[str]
    tool_calls: list[dict]  # log of every tool invocation
    started_at: str
    fallback_used: str
