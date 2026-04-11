/**
 * KGRA Intent Classification & Mode Routing.
 * TypeScript port — maps queries to 13 intent types and selects runtime mode.
 */

import type { IntentType, RuntimeMode, KGRAState } from "./state";

// ── Intent keywords for rule-based fast-path classification ─────

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  factual: ["what is", "who is", "where is", "how many", "define", "capital of", "name of"],
  comparative: ["compare", "difference between", "vs", "versus", "better than", "more than"],
  exploratory: ["tell me about", "explain", "describe", "overview", "what do we know"],
  temporal: ["when", "timeline", "history", "before", "after", "during", "date of"],
  hypothetical: ["what if", "imagine", "suppose", "would happen", "could we"],
  learning_request: ["learn from", "teach me", "study", "understand"],
  research_directive: ["research", "investigate", "find papers", "look up"],
  ontology_design: ["new node type", "new relation", "schema", "ontology", "entity type"],
  contradiction_resolution: ["contradict", "conflict", "inconsistent", "disagree"],
  cross_agent_collaboration: ["ask the", "collaborate with", "other agent"],
  reasoning_path_reuse: ["like last time", "similar to", "reuse", "same approach"],
  self_evaluation: ["evaluate my", "how well", "self-assess", "reasoning quality"],
  bundle_evaluation: ["evaluate bundle", "assess documents", "review documentation", "coherence of", "readiness of"],
};

// ── Intent → default mode mapping ───────────────────────────────

const INTENT_MODE_MAP: Record<IntentType, RuntimeMode> = {
  factual: "direct_query",
  comparative: "path_reasoning",
  exploratory: "graphrag_global",
  temporal: "direct_query",
  hypothetical: "path_reasoning",
  learning_request: "self_learning",
  research_directive: "research_mode",
  ontology_design: "expertise_building",
  contradiction_resolution: "path_reasoning",
  cross_agent_collaboration: "direct_query",
  reasoning_path_reuse: "direct_query",
  self_evaluation: "self_learning",
  bundle_evaluation: "bundle_evaluation",
};

// ── Fallback chains ─────────────────────────────────────────────

const FALLBACK_CHAINS: Record<string, RuntimeMode[]> = {
  direct_query: ["graphrag_local", "basic_rag"],
  path_reasoning: ["graphrag_local", "direct_query", "basic_rag"],
  graphrag_local: ["graphrag_global", "basic_rag"],
  graphrag_global: ["graphrag_local", "basic_rag"],
  drift: ["graphrag_local", "basic_rag"],
  basic_rag: [],
  bundle_evaluation: [],
};

/**
 * Classify query intent using keyword matching.
 */
export function classifyIntent(query: string): IntentType {
  const lower = query.toLowerCase().trim();
  let bestIntent: IntentType = "factual";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as IntentType;
    }
  }

  return bestIntent;
}

/**
 * Select runtime mode based on intent and available resources.
 */
export function selectMode(intent: IntentType, hasGraphSources: boolean = false): RuntimeMode {
  let mode = INTENT_MODE_MAP[intent] || "direct_query";

  if (mode === "direct_query" && !hasGraphSources) {
    mode = "basic_rag";
  }

  return mode;
}

/**
 * Check if human review is needed based on state.
 */
export function shouldUseHumanReview(state: KGRAState): boolean {
  if (state.confidence < 0.3) return true;
  if (state.contradictions.length > 0 && state.hypotheses.length === 0) return true;
  if (state.governance.human_review_required) return true;
  return false;
}

/**
 * Return ordered fallback modes if primary fails.
 */
export function getFallbackChain(mode: string): RuntimeMode[] {
  return FALLBACK_CHAINS[mode] || ["basic_rag"];
}
