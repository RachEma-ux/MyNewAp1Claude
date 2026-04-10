"""
KGRA LangGraph Nodes — each function transforms KGRAState.
Implements all nodes from the profile: classify_intent through human_review,
plus bundle_evaluation subgraph nodes.
"""

from __future__ import annotations
import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from .state import KGRAState, RuntimeMode
from .routing import classify_intent as _classify, select_mode, should_use_human_review
from ..config import get_config

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _add_tool_call(state: KGRAState, tool: str, inputs: dict, output: Any, cost: dict | None = None) -> None:
    calls = state.get("tool_calls", [])
    calls.append({"tool": tool, "inputs": inputs, "output_summary": str(output)[:200], "timestamp": _now(), "cost": cost or {}})
    state["tool_calls"] = calls
    # Accumulate cost
    if cost:
        c = state.get("cost", {"llm_tokens": 0, "graph_reads": 0, "vector_queries": 0, "mcp_calls": 0, "estimated_usd_cents": 0.0})
        for k in ["llm_tokens", "graph_reads", "vector_queries", "mcp_calls"]:
            c[k] = c.get(k, 0) + cost.get(k, 0)
        c["estimated_usd_cents"] = c.get("estimated_usd_cents", 0.0) + cost.get("estimated_usd_cents", 0.0)
        state["cost"] = c


# ══════════════════════════════════════════════════════════════════
# Node 1: Classify Intent
# ══════════════════════════════════════════════════════════════════

def classify_intent_node(state: KGRAState) -> KGRAState:
    """Classify the query intent and set initial state."""
    query = state.get("query", "")
    intent = _classify(query)
    state["intent"] = intent
    state["current_node"] = "classify_intent"
    state["completed_nodes"] = state.get("completed_nodes", []) + ["classify_intent"]
    state["started_at"] = state.get("started_at", _now())
    state["run_id"] = state.get("run_id", str(uuid.uuid4()))
    state["request_id"] = state.get("request_id", str(uuid.uuid4()))
    state["cost"] = state.get("cost", {"llm_tokens": 0, "graph_reads": 0, "vector_queries": 0, "mcp_calls": 0, "estimated_usd_cents": 0.0})
    state["tool_calls"] = state.get("tool_calls", [])
    state["errors"] = state.get("errors", [])
    logger.info(f"[{state['run_id'][:8]}] Intent: {intent}")
    return state


# ══════════════════════════════════════════════════════════════════
# Node 2: Resolve Domain Terms
# ══════════════════════════════════════════════════════════════════

def resolve_domain_terms_node(state: KGRAState) -> KGRAState:
    """Resolve ambiguous terms to canonical entity names using learning graph."""
    query = state.get("query", "")
    # In production: call entity resolution against learning graph + source graph
    # For now: pass-through (terms extracted but not resolved against graph)
    terms = {}
    words = query.split()
    for w in words:
        if w[0].isupper() and len(w) > 2:
            terms[w] = w  # identity mapping as baseline
    state["resolved_terms"] = terms
    state["completed_nodes"] = state.get("completed_nodes", []) + ["resolve_domain_terms"]
    _add_tool_call(state, "resolve_entities", {"query": query}, terms)
    return state


# ══════════════════════════════════════════════════════════════════
# Node 3: Load Schema Slice
# ══════════════════════════════════════════════════════════════════

def load_schema_slice_node(state: KGRAState) -> KGRAState:
    """Extract relevant schema subgraph for the query."""
    entities = list(state.get("resolved_terms", {}).values())
    # In production: call get_schema_slice tool against source graph
    schema_slice = {
        "node_labels": entities[:10] if entities else ["*"],
        "relationship_types": [],
        "properties": {},
        "indexes": [],
    }
    state["schema_slice"] = schema_slice
    state["completed_nodes"] = state.get("completed_nodes", []) + ["load_schema_slice"]
    _add_tool_call(state, "get_schema_slice", {"entities": entities}, schema_slice, {"graph_reads": 1})
    return state


# ══════════════════════════════════════════════════════════════════
# Node 4: Choose Mode
# ══════════════════════════════════════════════════════════════════

def choose_mode_node(state: KGRAState) -> KGRAState:
    """Select runtime mode based on intent and resources."""
    intent = state.get("intent", "factual")
    has_sources = bool(state.get("schema_slice", {}).get("node_labels"))
    mode = select_mode(intent, has_sources)
    state["mode"] = mode
    state["completed_nodes"] = state.get("completed_nodes", []) + ["choose_mode"]
    logger.info(f"[{state.get('run_id', '')[:8]}] Mode: {mode}")
    return state


# ══════════════════════════════════════════════════════════════════
# Node 5: Plan Operation
# ══════════════════════════════════════════════════════════════════

def plan_operation_node(state: KGRAState) -> KGRAState:
    """Generate query/operation plan based on mode and schema slice."""
    mode = state.get("mode", "direct_query")
    query = state.get("query", "")
    schema = state.get("schema_slice", {})
    cfg = get_config()

    if mode in ("direct_query", "path_reasoning"):
        # Generate Cypher (simplified — production uses LLM)
        labels = schema.get("node_labels", [])
        if labels and labels[0] != "*":
            cypher = f"MATCH (n:{labels[0]}) WHERE n.name CONTAINS $query RETURN n LIMIT {cfg.limits.max_rows}"
        else:
            cypher = f"MATCH (n) WHERE n.name CONTAINS $query RETURN n LIMIT {cfg.limits.max_rows}"
        state["planned_query"] = cypher
        state["query_language"] = "cypher"
        _add_tool_call(state, "plan_cypher_read", {"query": query, "schema": schema}, cypher, {"llm_tokens": 50})

    elif mode in ("graphrag_local", "graphrag_global", "drift"):
        state["planned_query"] = query
        state["query_language"] = "graphrag"

    elif mode == "basic_rag":
        state["planned_query"] = query
        state["query_language"] = "vector"

    elif mode == "bundle_evaluation":
        state["planned_query"] = "evaluate_bundle"
        state["query_language"] = "evaluation"

    else:
        state["planned_query"] = query
        state["query_language"] = "natural"

    state["completed_nodes"] = state.get("completed_nodes", []) + ["plan_operation"]
    return state


# ══════════════════════════════════════════════════════════════════
# Node 6: Validate Operation
# ══════════════════════════════════════════════════════════════════

def validate_operation_node(state: KGRAState) -> KGRAState:
    """Validate the planned query against governance rules."""
    cfg = get_config()
    errors = []
    query = state.get("planned_query", "")
    lang = state.get("query_language", "")

    if lang == "cypher":
        # Block write operations
        dangerous = ["CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DROP", "DETACH"]
        for kw in dangerous:
            if kw in query.upper():
                errors.append(f"Blocked write keyword: {kw}")

        # Check LIMIT
        if "LIMIT" not in query.upper():
            errors.append("Missing LIMIT clause")

    # Check governance allowlist
    workspace = state.get("workspace_id", "default")
    allowlists = cfg.governance.workspace_allowlists
    if workspace != "default" and workspace not in allowlists:
        errors.append(f"Workspace {workspace} not in allowlist")

    state["query_validated"] = len(errors) == 0
    state["validation_errors"] = errors
    state["completed_nodes"] = state.get("completed_nodes", []) + ["validate_operation"]

    if errors:
        state["governance"] = {"verdict": "deny", "reasons": errors, "human_review_required": False}
        logger.warning(f"[{state.get('run_id', '')[:8]}] Validation failed: {errors}")
    else:
        state["governance"] = state.get("governance", {"verdict": "allow", "reasons": [], "human_review_required": False})

    return state


# ══════════════════════════════════════════════════════════════════
# Node 7: Execute Retrieval
# ══════════════════════════════════════════════════════════════════

def execute_retrieval_node(state: KGRAState) -> KGRAState:
    """Execute the validated query/retrieval operation."""
    if not state.get("query_validated", False):
        state["raw_results"] = []
        state["errors"] = state.get("errors", []) + ["Skipped execution: validation failed"]
        state["completed_nodes"] = state.get("completed_nodes", []) + ["execute_retrieval"]
        return state

    mode = state.get("mode", "direct_query")
    query = state.get("planned_query", "")

    # In production: call actual graph/vector/retrieval tools
    # Stub: return empty results (adapters will be called by actual tools)
    results: list[dict] = []

    if mode == "direct_query":
        _add_tool_call(state, "execute_cypher_read", {"query": query}, results, {"graph_reads": 1})
    elif mode in ("graphrag_local", "graphrag_global", "drift"):
        _add_tool_call(state, f"run_graphrag_{mode.split('_')[-1] if '_' in mode else mode}", {"query": query}, results, {"vector_queries": 1, "graph_reads": 1})
    elif mode == "basic_rag":
        _add_tool_call(state, "run_basic_rag", {"query": query}, results, {"vector_queries": 1})

    state["raw_results"] = results
    state["completed_nodes"] = state.get("completed_nodes", []) + ["execute_retrieval"]
    return state


# ══════════════════════════════════════════════════════════════════
# Node 8: Expand & Rank Paths
# ══════════════════════════════════════════════════════════════════

def expand_rank_paths_node(state: KGRAState) -> KGRAState:
    """Expand candidate paths and rank them (for path_reasoning mode)."""
    mode = state.get("mode", "")
    results = state.get("raw_results", [])

    if mode == "path_reasoning" and results:
        # Extract paths from results
        paths = [{"nodes": [r], "score": 1.0, "hops": 1} for r in results]
        # Rank by score
        ranked = sorted(paths, key=lambda p: p.get("score", 0), reverse=True)
        state["paths"] = paths
        state["ranked_paths"] = ranked
        _add_tool_call(state, "expand_candidate_paths", {"results": len(results)}, ranked)
        _add_tool_call(state, "rank_paths", {"count": len(paths)}, ranked)
    else:
        state["paths"] = []
        state["ranked_paths"] = []

    state["completed_nodes"] = state.get("completed_nodes", []) + ["expand_rank_paths"]
    return state


# ══════════════════════════════════════════════════════════════════
# Node 9: Assemble Evidence Graph
# ══════════════════════════════════════════════════════════════════

def assemble_evidence_graph_node(state: KGRAState) -> KGRAState:
    """Build evidence graph from results, facts, and claims."""
    results = state.get("raw_results", [])
    evidence_nodes: list[dict] = []
    evidence_edges: list[dict] = []
    observed_facts: list[dict] = []
    provenance: list[dict] = []

    for i, r in enumerate(results):
        node_id = f"fact_{i}"
        evidence_nodes.append({
            "id": node_id,
            "node_type": "fact",
            "label": str(r.get("label", r.get("name", f"result_{i}"))),
            "source_ref": r.get("source", "source_graph"),
            "confidence": r.get("confidence", 0.8),
        })
        observed_facts.append({
            "id": node_id,
            "label": evidence_nodes[-1]["label"],
            "sourceRef": evidence_nodes[-1]["source_ref"],
        })
        provenance.append({
            "source_type": "graph",
            "source_ref": r.get("source", "source_graph"),
            "operation_ref": state.get("planned_query", ""),
        })

    state["evidence_nodes"] = evidence_nodes
    state["evidence_edges"] = evidence_edges
    state["observed_facts"] = observed_facts
    state["inferred_claims"] = state.get("inferred_claims", [])
    state["provenance"] = provenance
    state["completed_nodes"] = state.get("completed_nodes", []) + ["assemble_evidence_graph"]
    _add_tool_call(state, "assemble_evidence_graph", {"facts": len(observed_facts)}, {"nodes": len(evidence_nodes), "edges": len(evidence_edges)})
    return state


# ══════════════════════════════════════════════════════════════════
# Node 10: Update Task Memory
# ══════════════════════════════════════════════════════════════════

def update_task_memory_node(state: KGRAState) -> KGRAState:
    """Persist findings to session memory graph."""
    facts = state.get("observed_facts", [])
    claims = state.get("inferred_claims", [])
    # In production: write to Redis + Postgres memory plane
    _add_tool_call(state, "update_task_memory_graph", {"facts": len(facts), "claims": len(claims)}, "ok")
    state["completed_nodes"] = state.get("completed_nodes", []) + ["update_task_memory"]
    return state


# ══════════════════════════════════════════════════════════════════
# Node 11: Synthesize Answer
# ══════════════════════════════════════════════════════════════════

def synthesize_answer_node(state: KGRAState) -> KGRAState:
    """Produce final answer with confidence, evidence, and analytical metadata."""
    facts = state.get("observed_facts", [])
    claims = state.get("inferred_claims", [])
    query = state.get("query", "")
    mode = state.get("mode", "direct_query")
    errors = state.get("errors", [])

    # Build answer text
    if facts:
        fact_texts = [f.get("label", "") for f in facts]
        answer = f"Based on {len(facts)} evidence items: {'; '.join(fact_texts[:5])}"
    elif errors:
        answer = f"Unable to answer: {'; '.join(errors[:3])}"
    else:
        answer = f"No evidence found for: {query}"

    # Confidence calculation
    n_facts = len(facts)
    n_claims = len(claims)
    n_errors = len(errors)
    if n_facts > 0:
        base_confidence = min(0.95, 0.3 + n_facts * 0.1 + n_claims * 0.05)
    else:
        base_confidence = max(0.05, 0.2 - n_errors * 0.05)

    # Reasoning strength
    tool_calls = state.get("tool_calls", [])
    evidence_chains = max(1, len([t for t in tool_calls if t.get("tool", "").startswith("execute")]))
    total_steps = max(1, len(tool_calls))
    reasoning_strength = min(1.0, evidence_chains / total_steps * 2)

    # Vulnerability
    vulnerability = 1.0 - reasoning_strength if n_facts < 3 else 0.3

    state["answer"] = answer
    state["confidence"] = round(base_confidence, 3)
    state["temporal"] = {"as_of": _now()}
    state["missing_knowledge"] = {"hasGap": n_facts == 0, "summary": "No evidence found" if n_facts == 0 else None}
    state["analytical"] = {
        "reasoning_strength": round(reasoning_strength, 3),
        "vulnerability": round(vulnerability, 3),
        "alternative_hypotheses": [],
        "causal_claims": [],
    }
    state["learning"] = state.get("learning", {"knowledge_graph_updated": False})
    state["completed_nodes"] = state.get("completed_nodes", []) + ["synthesize_answer"]

    _add_tool_call(state, "synthesize_answer", {"facts": n_facts, "claims": n_claims}, answer[:100], {"llm_tokens": 100})
    return state


# ══════════════════════════════════════════════════════════════════
# Node 12: Human Review
# ══════════════════════════════════════════════════════════════════

def human_review_node(state: KGRAState) -> KGRAState:
    """Flag run for human review (HITL interrupt)."""
    state["governance"] = {
        "verdict": "conditions",
        "reasons": ["Human review required due to low confidence or unresolved contradictions"],
        "human_review_required": True,
    }
    state["completed_nodes"] = state.get("completed_nodes", []) + ["human_review"]
    logger.info(f"[{state.get('run_id', '')[:8]}] Flagged for human review")
    return state


# ══════════════════════════════════════════════════════════════════
# Bundle Evaluation Subgraph Nodes
# ══════════════════════════════════════════════════════════════════

def bundle_multi_pass_review_node(state: KGRAState) -> KGRAState:
    """Step 1: Multi-pass review — gist, structure, gaps."""
    eval_state = state.get("evaluation", {})
    documents = eval_state.get("documents", [])
    current_pass = eval_state.get("current_pass", 1)

    review_log_parts = []

    if current_pass == 1:
        # Pass 1: Gist — main claims and term glossary
        review_log_parts.append(f"=== PASS 1: GIST ({len(documents)} documents) ===")
        for doc in documents[:10]:
            name = doc.get("name", "untitled")
            content = doc.get("content", "")[:500]
            review_log_parts.append(f"[{name}] Main claims: {content[:200]}...")
        eval_state["current_pass"] = 2

    elif current_pass == 2:
        # Pass 2: Structure — dependencies and themes
        review_log_parts.append("=== PASS 2: STRUCTURE ===")
        review_log_parts.append("Analyzing dependencies and recurring themes across documents...")
        eval_state["current_pass"] = 3

    elif current_pass == 3:
        # Pass 3: Gaps — missing definitions and unresolved choices
        review_log_parts.append("=== PASS 3: GAP ANALYSIS ===")
        review_log_parts.append("Identifying missing definitions and unresolved decision points...")
        eval_state["current_pass"] = 4  # Done

    existing_log = eval_state.get("review_log", "")
    eval_state["review_log"] = existing_log + "\n".join(review_log_parts) + "\n"
    state["evaluation"] = eval_state
    state["completed_nodes"] = state.get("completed_nodes", []) + [f"bundle_review_pass_{current_pass}"]
    _add_tool_call(state, "evaluate_knowledge_bundle", {"pass": current_pass, "docs": len(documents)}, "review_pass", {"llm_tokens": 200})
    return state


def bundle_coherence_scoring_node(state: KGRAState) -> KGRAState:
    """Step 2: Score strategic coherence (0-10)."""
    eval_state = state.get("evaluation", {})
    documents = eval_state.get("documents", [])

    # Scoring rubric (production: LLM-based with rubric enforcement)
    doc_count = len(documents)
    # Heuristic: more docs with shared terms = higher coherence
    base_score = min(10, max(2, doc_count * 1.5))
    coherence_score = round(base_score, 1)

    eval_state["coherence_score"] = coherence_score
    eval_state["coherence_verdict"] = (
        f"Bundle of {doc_count} documents scores {coherence_score}/10 on strategic coherence. "
        f"{'Strong internal alignment.' if coherence_score >= 7 else 'Some gaps in alignment.'}"
    )

    state["evaluation"] = eval_state
    state["completed_nodes"] = state.get("completed_nodes", []) + ["bundle_coherence_scoring"]
    _add_tool_call(state, "score_coherence", {"docs": doc_count}, coherence_score, {"llm_tokens": 150})
    return state


def bundle_readiness_scoring_node(state: KGRAState) -> KGRAState:
    """Step 3: Score implementation readiness (0-10)."""
    eval_state = state.get("evaluation", {})
    documents = eval_state.get("documents", [])

    # Scoring rubric
    doc_count = len(documents)
    base_score = min(10, max(1, doc_count * 1.2))
    readiness_score = round(base_score, 1)

    missing = []
    if doc_count < 3:
        missing.append("Insufficient documentation depth")
    if readiness_score < 5:
        missing.append("Missing concrete implementation details")
        missing.append("No error handling specification")

    eval_state["readiness_score"] = readiness_score
    eval_state["readiness_missing"] = missing

    state["evaluation"] = eval_state
    state["completed_nodes"] = state.get("completed_nodes", []) + ["bundle_readiness_scoring"]
    _add_tool_call(state, "score_readiness", {"docs": doc_count}, readiness_score, {"llm_tokens": 150})
    return state


def bundle_decision_resolution_node(state: KGRAState) -> KGRAState:
    """Step 4: Resolve decision boundaries."""
    eval_state = state.get("evaluation", {})
    review_log = eval_state.get("review_log", "")

    # In production: LLM identifies decision forks from review log
    resolved_decisions = [
        {
            "decision_point": "Default resolution strategy",
            "criteria": "Bundle context analysis",
            "resolution": "Proceed with documented approach",
            "justification": "Sufficient evidence in bundle to support this direction",
        }
    ]

    eval_state["resolved_decisions"] = resolved_decisions
    state["evaluation"] = eval_state
    state["completed_nodes"] = state.get("completed_nodes", []) + ["bundle_decision_resolution"]
    _add_tool_call(state, "resolve_decision_fork", {"forks": 1}, resolved_decisions, {"llm_tokens": 100})
    return state


def bundle_contract_mapping_node(state: KGRAState) -> KGRAState:
    """Step 5: Validate and produce contract mappings."""
    eval_state = state.get("evaluation", {})

    # In production: LLM extracts interface descriptions and maps fields
    contract_mappings = [
        {
            "source_interface": "bundle_input",
            "target_interface": "evaluation_output",
            "field_mappings": [
                {"source_field": "document.content", "target_field": "review_log", "transform": "multi_pass_analysis"},
                {"source_field": "document.metadata", "target_field": "provenance", "transform": "extract_source_refs"},
            ],
        }
    ]

    eval_state["contract_mappings"] = contract_mappings
    state["evaluation"] = eval_state
    state["completed_nodes"] = state.get("completed_nodes", []) + ["bundle_contract_mapping"]
    _add_tool_call(state, "extract_contract_mapping", {"interfaces": 1}, contract_mappings, {"llm_tokens": 100})

    # Set learning outcome
    state["learning"] = {
        "knowledge_graph_updated": True,
        "reasoning_path_id": f"eval_{state.get('run_id', '')[:8]}",
        "evaluated_bundle": {
            "bundle_id": eval_state.get("bundle_id", str(uuid.uuid4())),
            "coherence_score": eval_state.get("coherence_score", 0),
            "readiness_score": eval_state.get("readiness_score", 0),
            "resolved_decisions_count": len(eval_state.get("resolved_decisions", [])),
            "contract_mappings_count": len(contract_mappings),
        },
    }

    return state
