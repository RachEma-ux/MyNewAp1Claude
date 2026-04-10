"""
KGRA Intent Classification & Mode Routing.
Maps queries to one of 13 intent types and selects runtime mode.
"""

from __future__ import annotations
import logging
from ..config import get_config

logger = logging.getLogger(__name__)

# Intent keywords for rule-based fast-path classification
INTENT_KEYWORDS: dict[str, list[str]] = {
    "factual": ["what is", "who is", "where is", "how many", "define", "capital of", "name of"],
    "comparative": ["compare", "difference between", "vs", "versus", "better than", "more than"],
    "exploratory": ["tell me about", "explain", "describe", "overview", "what do we know"],
    "temporal": ["when", "timeline", "history", "before", "after", "during", "date of"],
    "hypothetical": ["what if", "imagine", "suppose", "would happen", "could we"],
    "learning_request": ["learn from", "teach me", "study", "understand"],
    "research_directive": ["research", "investigate", "find papers", "look up"],
    "ontology_design": ["new node type", "new relation", "schema", "ontology", "entity type"],
    "contradiction_resolution": ["contradict", "conflict", "inconsistent", "disagree"],
    "cross_agent_collaboration": ["ask the", "collaborate with", "other agent"],
    "reasoning_path_reuse": ["like last time", "similar to", "reuse", "same approach"],
    "self_evaluation": ["evaluate my", "how well", "self-assess", "reasoning quality"],
    "bundle_evaluation": ["evaluate bundle", "assess documents", "review documentation", "coherence of", "readiness of"],
}

# Intent → default mode mapping
INTENT_MODE_MAP: dict[str, str] = {
    "factual": "direct_query",
    "comparative": "path_reasoning",
    "exploratory": "graphrag_global",
    "temporal": "direct_query",
    "hypothetical": "path_reasoning",
    "learning_request": "self_learning",
    "research_directive": "research_mode",
    "ontology_design": "expertise_building",
    "contradiction_resolution": "path_reasoning",
    "cross_agent_collaboration": "cross_agent_collaboration",
    "reasoning_path_reuse": "reasoning_path_reuse",
    "self_evaluation": "self_learning",
    "bundle_evaluation": "bundle_evaluation",
}


def classify_intent(query: str) -> str:
    """Classify query intent using keyword matching (fast path).
    For production, this should be enhanced with LLM classification.
    """
    lower = query.lower().strip()

    best_intent = "factual"
    best_score = 0

    for intent, keywords in INTENT_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lower)
        if score > best_score:
            best_score = score
            best_intent = intent

    logger.info(f"Classified intent: {best_intent} (score={best_score})")
    return best_intent


def select_mode(intent: str, has_graph_sources: bool = True, confidence_threshold: float = 0.5) -> str:
    """Select runtime mode based on intent and available resources."""
    mode = INTENT_MODE_MAP.get(intent, "direct_query")

    # Fallback: if no graph sources, use basic_rag
    if mode == "direct_query" and not has_graph_sources:
        mode = "basic_rag"
        logger.info("No graph sources available, falling back to basic_rag")

    return mode


def should_use_human_review(state: dict) -> bool:
    """Check if human review is needed based on state."""
    # Low confidence
    if state.get("confidence", 1.0) < 0.3:
        return True

    # Unresolved contradictions
    if state.get("contradictions") and not state.get("hypotheses"):
        return True

    # Governance requires it
    gov = state.get("governance", {})
    if gov.get("human_review_required"):
        return True

    return False


def get_fallback_chain(mode: str) -> list[str]:
    """Return ordered fallback modes if primary fails."""
    chains: dict[str, list[str]] = {
        "direct_query": ["graphrag_local", "basic_rag"],
        "path_reasoning": ["graphrag_local", "direct_query", "basic_rag"],
        "graphrag_local": ["graphrag_global", "basic_rag"],
        "graphrag_global": ["graphrag_local", "basic_rag"],
        "drift": ["graphrag_local", "basic_rag"],
        "basic_rag": [],
        "bundle_evaluation": [],
    }
    return chains.get(mode, ["basic_rag"])
