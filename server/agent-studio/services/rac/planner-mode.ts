/**
 * RAC Planner Mode — Retrofit P6.
 *
 * Pure function. Takes the existing `RetrievalPlan` (P4) plus a
 * boolean `hasCagPack` (provided by the runtime orchestrator from the
 * CAG resolver) and returns the explicit mode + a short reason string
 * the trace surfaces verbatim.
 *
 * The eight modes match the retrofit prompt's locked enum:
 *
 *   - no_retrieval                       — no sources, no CAG.
 *   - cag_only                           — CAG present, no retrieval.
 *   - knowledge_retrieval                — KB/RAG sources only.
 *   - multimodal_hybrid_retrieval        — KB+image/audio sources mix
 *                                          (stubbed; non-text sources
 *                                          land via external_connector
 *                                          for now).
 *   - tool_knowledge_retrieval           — tool_knowledge sources only.
 *   - hybrid_cag_rag                     — CAG + KB/RAG sources.
 *   - hybrid_cag_tool_knowledge          — CAG + tool_knowledge.
 *   - hybrid_cag_rag_tool_knowledge      — CAG + KB/RAG + tool_knowledge.
 *
 * The composer (services/cag/composer.ts) is mode-agnostic — it
 * always reads from `capabilityPack` and `retrievalEvidence`; the mode
 * tag is for trace + UI consumption (D-RAC-PLANNER). The runtime
 * orchestrator uses the mode to decide whether to skip retrieval (mode
 * ∈ {no_retrieval, cag_only}) before invoking the executor.
 */

import type { RetrievalPlan } from "./retrieval-planner";

export const RAC_PLANNER_MODES = [
  "no_retrieval",
  "cag_only",
  "knowledge_retrieval",
  "multimodal_hybrid_retrieval",
  "tool_knowledge_retrieval",
  "hybrid_cag_rag",
  "hybrid_cag_tool_knowledge",
  "hybrid_cag_rag_tool_knowledge",
] as const;

export type RacPlannerMode = (typeof RAC_PLANNER_MODES)[number];

/** Source-type families used to bucket runnable plan items. */
const KNOWLEDGE_TYPES: ReadonlySet<string> = new Set([
  "document_collection",
  "vector_index",
  "graph_index",
  "knowledge_unit",
  "external_connector",
]);

const TOOL_KNOWLEDGE_TYPES: ReadonlySet<string> = new Set(["tool_knowledge"]);

const MULTIMODAL_HINTS: ReadonlySet<string> = new Set([
  "multimodal",
  "image",
  "audio",
  "video",
]);

export interface DerivePlannerModeInput {
  plan: RetrievalPlan;
  hasCagPack: boolean;
}

export interface DerivePlannerModeOutput {
  mode: RacPlannerMode;
  reason: string;
}

/**
 * Derive the explicit planner mode (D-RAC-PLANNER).
 *
 * Decision tree (in order — first match wins):
 *
 *   1. No runnable sources AND no CAG pack         → no_retrieval
 *   2. No runnable sources AND CAG pack present    → cag_only
 *   3. Runnable sources contain a multimodal hint  → multimodal_hybrid_retrieval
 *      (regardless of CAG; multimodal subsumes the other modes for
 *       MVP routing — refinement is a follow-up)
 *   4. Runnable sources are exclusively tool_knowledge:
 *        a. With CAG pack          → hybrid_cag_tool_knowledge
 *        b. Without CAG pack       → tool_knowledge_retrieval
 *   5. Runnable sources are exclusively knowledge:
 *        a. With CAG pack          → hybrid_cag_rag
 *        b. Without CAG pack       → knowledge_retrieval
 *   6. Mix of knowledge + tool_knowledge:
 *        a. With CAG pack          → hybrid_cag_rag_tool_knowledge
 *        b. Without CAG pack       → knowledge_retrieval
 *           (tool_knowledge alongside knowledge sources collapses to
 *            knowledge_retrieval when no CAG; the tool_knowledge units
 *            still flow through retrieval — the mode tag just
 *            describes the dominant intent)
 */
export function derivePlannerMode(
  input: DerivePlannerModeInput,
): DerivePlannerModeOutput {
  const runnable = input.plan.items.filter((it) => it.skipReason === null);
  const types = new Set(runnable.map((it) => it.source.sourceType));

  const hasMultimodal = [...types].some((t) =>
    [...MULTIMODAL_HINTS].some((hint) => t.includes(hint)),
  );
  const hasKnowledge = [...types].some((t) => KNOWLEDGE_TYPES.has(t));
  const hasToolKnowledge = [...types].some((t) => TOOL_KNOWLEDGE_TYPES.has(t));

  if (runnable.length === 0) {
    if (input.hasCagPack) {
      return {
        mode: "cag_only",
        reason: "no runnable retrieval sources; CAG pack present",
      };
    }
    return {
      mode: "no_retrieval",
      reason: "no runnable retrieval sources and no CAG pack",
    };
  }

  if (hasMultimodal) {
    return {
      mode: "multimodal_hybrid_retrieval",
      reason: `multimodal source detected: types=[${[...types].join(",")}]`,
    };
  }

  // Tool-knowledge only.
  if (hasToolKnowledge && !hasKnowledge) {
    return input.hasCagPack
      ? {
          mode: "hybrid_cag_tool_knowledge",
          reason: "CAG pack + tool_knowledge sources",
        }
      : {
          mode: "tool_knowledge_retrieval",
          reason: "tool_knowledge sources only",
        };
  }

  // Knowledge only.
  if (hasKnowledge && !hasToolKnowledge) {
    return input.hasCagPack
      ? {
          mode: "hybrid_cag_rag",
          reason: "CAG pack + KB/RAG sources",
        }
      : {
          mode: "knowledge_retrieval",
          reason: "KB/RAG sources only",
        };
  }

  // Mixed knowledge + tool_knowledge.
  if (hasKnowledge && hasToolKnowledge) {
    return input.hasCagPack
      ? {
          mode: "hybrid_cag_rag_tool_knowledge",
          reason: "CAG pack + KB/RAG + tool_knowledge sources",
        }
      : {
          mode: "knowledge_retrieval",
          reason:
            "KB/RAG + tool_knowledge sources (mode collapses to knowledge_retrieval without CAG)",
        };
  }

  // Should not reach — runnable.length>0 + at least one of the
  // bucket booleans would be true. Fall through to no_retrieval as the
  // safest default; trace records the reason so operators can debug.
  return {
    mode: "no_retrieval",
    reason: `unknown source-type combination: types=[${[...types].join(",")}]`,
  };
}
