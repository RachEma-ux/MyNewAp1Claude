"""
KGRA LangGraph State Machine — wires all nodes with conditional edges.
Includes main graph and bundle_evaluation subgraph.
"""

from __future__ import annotations
import logging
from typing import Literal

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

from .state import KGRAState
from .nodes import (
    classify_intent_node,
    resolve_domain_terms_node,
    load_schema_slice_node,
    choose_mode_node,
    plan_operation_node,
    validate_operation_node,
    execute_retrieval_node,
    expand_rank_paths_node,
    assemble_evidence_graph_node,
    update_task_memory_node,
    synthesize_answer_node,
    human_review_node,
    bundle_multi_pass_review_node,
    bundle_coherence_scoring_node,
    bundle_readiness_scoring_node,
    bundle_decision_resolution_node,
    bundle_contract_mapping_node,
)
from .routing import should_use_human_review, get_fallback_chain
from ..config import get_config

logger = logging.getLogger(__name__)


# ── Conditional Edge Functions ──────────────────────────────────

def route_after_mode(state: KGRAState) -> str:
    """Route to different subgraphs based on selected mode."""
    mode = state.get("mode", "direct_query")
    if mode == "bundle_evaluation":
        return "bundle_multi_pass_review"
    if mode == "human_review":
        return "human_review"
    return "plan_operation"


def route_after_validation(state: KGRAState) -> str:
    """Check validation result — proceed or deny."""
    if state.get("query_validated", False):
        return "execute_retrieval"
    # Try fallback
    fallbacks = get_fallback_chain(state.get("mode", ""))
    if fallbacks:
        state["mode"] = fallbacks[0]
        state["fallback_used"] = fallbacks[0]
        return "plan_operation"
    return "synthesize_answer"  # Give up, synthesize with error


def route_after_retrieval(state: KGRAState) -> str:
    """Check if path reasoning is needed."""
    mode = state.get("mode", "")
    if mode == "path_reasoning":
        return "expand_rank_paths"
    return "assemble_evidence_graph"


def route_after_synthesis(state: KGRAState) -> str:
    """Check if human review is needed."""
    if should_use_human_review(state):
        return "human_review"
    return END


def route_bundle_passes(state: KGRAState) -> str:
    """Route multi-pass review iterations."""
    eval_state = state.get("evaluation", {})
    current_pass = eval_state.get("current_pass", 1)
    if current_pass <= 3:
        return "bundle_multi_pass_review"  # Loop back for next pass
    return "bundle_coherence_scoring"  # All passes done


# ── Build the Graph ─────────────────────────────────────────────

def build_kgra_graph() -> StateGraph:
    """Construct the complete KGRA LangGraph state machine."""

    graph = StateGraph(KGRAState)

    # Add all nodes
    graph.add_node("classify_intent", classify_intent_node)
    graph.add_node("resolve_domain_terms", resolve_domain_terms_node)
    graph.add_node("load_schema_slice", load_schema_slice_node)
    graph.add_node("choose_mode", choose_mode_node)
    graph.add_node("plan_operation", plan_operation_node)
    graph.add_node("validate_operation", validate_operation_node)
    graph.add_node("execute_retrieval", execute_retrieval_node)
    graph.add_node("expand_rank_paths", expand_rank_paths_node)
    graph.add_node("assemble_evidence_graph", assemble_evidence_graph_node)
    graph.add_node("update_task_memory", update_task_memory_node)
    graph.add_node("synthesize_answer", synthesize_answer_node)
    graph.add_node("human_review", human_review_node)

    # Bundle evaluation subgraph nodes
    graph.add_node("bundle_multi_pass_review", bundle_multi_pass_review_node)
    graph.add_node("bundle_coherence_scoring", bundle_coherence_scoring_node)
    graph.add_node("bundle_readiness_scoring", bundle_readiness_scoring_node)
    graph.add_node("bundle_decision_resolution", bundle_decision_resolution_node)
    graph.add_node("bundle_contract_mapping", bundle_contract_mapping_node)

    # ── Entry ──
    graph.set_entry_point("classify_intent")

    # ── Main flow edges ──
    graph.add_edge("classify_intent", "resolve_domain_terms")
    graph.add_edge("resolve_domain_terms", "load_schema_slice")
    graph.add_edge("load_schema_slice", "choose_mode")

    # Mode routing
    graph.add_conditional_edges("choose_mode", route_after_mode, {
        "plan_operation": "plan_operation",
        "bundle_multi_pass_review": "bundle_multi_pass_review",
        "human_review": "human_review",
    })

    graph.add_edge("plan_operation", "validate_operation")

    # Validation routing
    graph.add_conditional_edges("validate_operation", route_after_validation, {
        "execute_retrieval": "execute_retrieval",
        "plan_operation": "plan_operation",  # fallback retry
        "synthesize_answer": "synthesize_answer",
    })

    # Retrieval routing
    graph.add_conditional_edges("execute_retrieval", route_after_retrieval, {
        "expand_rank_paths": "expand_rank_paths",
        "assemble_evidence_graph": "assemble_evidence_graph",
    })

    graph.add_edge("expand_rank_paths", "assemble_evidence_graph")
    graph.add_edge("assemble_evidence_graph", "update_task_memory")
    graph.add_edge("update_task_memory", "synthesize_answer")

    # Post-synthesis routing
    graph.add_conditional_edges("synthesize_answer", route_after_synthesis, {
        "human_review": "human_review",
        END: END,
    })

    graph.add_edge("human_review", END)

    # ── Bundle evaluation subgraph edges ──
    graph.add_conditional_edges("bundle_multi_pass_review", route_bundle_passes, {
        "bundle_multi_pass_review": "bundle_multi_pass_review",
        "bundle_coherence_scoring": "bundle_coherence_scoring",
    })
    graph.add_edge("bundle_coherence_scoring", "bundle_readiness_scoring")
    graph.add_edge("bundle_readiness_scoring", "bundle_decision_resolution")
    graph.add_edge("bundle_decision_resolution", "bundle_contract_mapping")
    graph.add_edge("bundle_contract_mapping", "synthesize_answer")

    return graph


def compile_kgra_graph(checkpointer=None):
    """Compile the graph with optional checkpointer for durable execution."""
    graph = build_kgra_graph()
    return graph.compile(checkpointer=checkpointer)


def get_checkpointer():
    """Create a PostgresSaver checkpointer from config."""
    cfg = get_config()
    try:
        return PostgresSaver.from_conn_string(cfg.postgres.dsn)
    except Exception as e:
        logger.warning(f"Failed to create PostgresSaver: {e}. Running without checkpointer.")
        return None
