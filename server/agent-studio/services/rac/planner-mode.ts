/**
 * RAC Planner Mode — Retrofit P6 + Native Graph Workspace Phase 12.
 *
 * Pure function. Takes the existing `RetrievalPlan` (P4) plus a
 * boolean `hasCagPack` (provided by the runtime orchestrator from the
 * CAG resolver) and returns the explicit mode + a short reason string
 * the trace surfaces verbatim.
 *
 * The eight retrofit modes match the original locked enum:
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
 * Phase 12 (Native Graph Workspace) reserves seven additional modes per
 * `docs/architecture/agent-studio-graphrag-retrieval-router.md` §1.3 so
 * the GraphRAG retrieval router can label traces distinctly from the
 * generic `knowledge_retrieval` bucket. Derivation extension is deferred
 * until per-source retrieval-method metadata lands — `derivePlannerMode`
 * continues to emit `knowledge_retrieval` for `graph_index` sources
 * today, with the seven new strings reserved at the type level so
 * downstream callers (UI, trace columns, tRPC contracts) can already
 * reference them:
 *
 *   - graphrag_local                     — local-context GraphRAG.
 *   - graphrag_global                    — global-context GraphRAG.
 *   - graphrag_traversal                 — Neo4j traversal retrieval.
 *   - graphrag_text2cypher               — guarded Text2Cypher path.
 *   - graphrag_algorithm                 — graph-algorithm retrieval.
 *   - hybrid_cag_graphrag                — CAG + GraphRAG.
 *   - hybrid_rac_graphrag                — RAC sources + GraphRAG.
 *
 * The composer (services/cag/composer.ts) is mode-agnostic — it
 * always reads from `capabilityPack` and `retrievalEvidence`; the mode
 * tag is for trace + UI consumption (D-RAC-PLANNER). The runtime
 * orchestrator uses the mode to decide whether to skip retrieval (mode
 * ∈ {no_retrieval, cag_only}) before invoking the executor.
 */

import type { RetrievalPlan, RetrievalPlanItem } from "./retrieval-planner";

/**
 * Phase 12 — GraphRAG retrieval methods. Carried on a `graph_index`
 * source's `metadataJson.retrievalMethod` field. When absent, the source
 * is treated as legacy generic retrieval (today's behavior — routes
 * through `knowledge_retrieval` / `hybrid_cag_rag`).
 *
 * Persisted via the existing `metadataJson` jsonb column on
 * `ags_rac_sources` so this Phase 12 increment does not require a
 * schema migration. A future increment may promote the field to a
 * dedicated column once usage patterns settle.
 */
export const GRAPHRAG_RETRIEVAL_METHODS = [
  "local",
  "global",
  "traversal",
  "text2cypher",
  "algorithm",
] as const;
export type GraphragRetrievalMethod = (typeof GRAPHRAG_RETRIEVAL_METHODS)[number];

// ============================================================================
// Per-retrieval-method operator-facing metadata (T-A.6)
// ============================================================================

export interface GraphragRetrievalMethodMetadata {
  /** Display label rendered in the operator UI's source picker. */
  readonly label: string;
  /** Short operator-facing description of what the method does. */
  readonly description: string;
  /** Closed-taxonomy cost classification informing the planner's
   *  budget logic:
   *  - `low`: chunk-bounded vector reads, single-hop traversals.
   *  - `medium`: multi-hop traversals, community summaries.
   *  - `high`: full-graph algorithms, text2cypher with LLM call. */
  readonly costClass: "low" | "medium" | "high";
  /** Whether this method invokes an LLM as part of retrieval (drives
   *  the rate-limit / model-routing planner branch). */
  readonly invokesLlm: boolean;
}

export const GRAPHRAG_RETRIEVAL_METHOD_METADATA: Readonly<
  Record<GraphragRetrievalMethod, GraphragRetrievalMethodMetadata>
> = {
  local: {
    label: "Local",
    description:
      "Per-document chunk-based retrieval scoped to a single graph community or anchor entity.",
    costClass: "low",
    invokesLlm: false,
  },
  global: {
    label: "Global",
    description:
      "Cross-document graph-level retrieval that combines community summaries before answering.",
    costClass: "medium",
    invokesLlm: false,
  },
  traversal: {
    label: "Traversal",
    description:
      "Explicit graph walk along typed edges from one or more anchor nodes — operator picks edge filters.",
    costClass: "medium",
    invokesLlm: false,
  },
  text2cypher: {
    label: "Text2Cypher",
    description:
      "LLM-generated read-only Cypher query against the graph — gated by guardrails and approval.",
    costClass: "high",
    invokesLlm: true,
  },
  algorithm: {
    label: "Algorithm",
    description:
      "Graph algorithm output (centrality / community / similarity) — typically pre-computed and served from cache.",
    costClass: "high",
    invokesLlm: false,
  },
};

export function getGraphragRetrievalMethodMetadata(
  method: GraphragRetrievalMethod,
): GraphragRetrievalMethodMetadata {
  return GRAPHRAG_RETRIEVAL_METHOD_METADATA[method];
}

/**
 * Extract the GraphRAG retrieval method from a plan item's underlying
 * source, returning `null` if the source is not a `graph_index` or the
 * `metadataJson.retrievalMethod` value is missing/invalid. The check
 * is intentionally permissive about unknown strings — unrecognized
 * methods fall through to legacy generic retrieval so an operator
 * misconfiguration does not block the request.
 */
export function readGraphragRetrievalMethod(
  item: RetrievalPlanItem,
): GraphragRetrievalMethod | null {
  if (item.source.sourceType !== "graph_index") return null;
  const meta = item.source.metadataJson;
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).retrievalMethod;
  if (typeof raw !== "string") return null;
  return (GRAPHRAG_RETRIEVAL_METHODS as readonly string[]).includes(raw)
    ? (raw as GraphragRetrievalMethod)
    : null;
}

export const RAC_PLANNER_MODES = [
  "no_retrieval",
  "cag_only",
  "knowledge_retrieval",
  "multimodal_hybrid_retrieval",
  "tool_knowledge_retrieval",
  "hybrid_cag_rag",
  "hybrid_cag_tool_knowledge",
  "hybrid_cag_rag_tool_knowledge",
  // ── Phase 12 — Native Graph Workspace GraphRAG modes (reserved) ──
  // Type-level only today; derivation extension deferred until per-source
  // retrieval-method metadata lands. See file header.
  "graphrag_local",
  "graphrag_global",
  "graphrag_traversal",
  "graphrag_text2cypher",
  "graphrag_algorithm",
  "hybrid_cag_graphrag",
  "hybrid_rac_graphrag",
] as const;

/**
 * Reserved Phase 12 modes that the current `derivePlannerMode`
 * implementation never emits. Exported so the lockstep test and
 * downstream callers can distinguish reservation from active modes
 * without re-enumerating the literals.
 */
export const PHASE_12_RESERVED_MODES = [
  "graphrag_local",
  "graphrag_global",
  "graphrag_traversal",
  "graphrag_text2cypher",
  "graphrag_algorithm",
  "hybrid_cag_graphrag",
  "hybrid_rac_graphrag",
] as const satisfies ReadonlyArray<(typeof RAC_PLANNER_MODES)[number]>;

/**
 * Phase 12 §5 — map a `GraphragRetrievalMethod` string to the matching
 * `graphrag_<method>` literal from `PHASE_12_RESERVED_MODES`. Used by
 * the RAC ingestion adapter to translate the method string carried on
 * a source's `metadataJson` into the typed mode the
 * `GraphRetrievalRouter` consumes.
 */
export function methodToReservedMode(
  method: GraphragRetrievalMethod,
): "graphrag_local" | "graphrag_global" | "graphrag_traversal" | "graphrag_text2cypher" | "graphrag_algorithm" {
  return `graphrag_${method}` as const;
}

export type RacPlannerMode = (typeof RAC_PLANNER_MODES)[number];

// ============================================================================
// Per-planner-mode operator-facing metadata (T-A.7)
// ============================================================================

/**
 * Closed-taxonomy mode-family classification. Maps every
 * `RAC_PLANNER_MODES` entry into one of six families operators
 * actually pick from in the planner UI's family-level picker.
 */
export const RAC_PLANNER_MODE_FAMILIES = [
  "no_retrieval",
  "cag_only",
  "knowledge_retrieval",
  "hybrid_cag",
  "graphrag_pure",
  "graphrag_hybrid",
] as const;

export type RacPlannerModeFamily = (typeof RAC_PLANNER_MODE_FAMILIES)[number];

export interface RacPlannerModeMetadata {
  /** Display label rendered in the operator UI's planner-mode picker. */
  readonly label: string;
  /** Short operator-facing description of what the planner does in
   *  this mode. */
  readonly description: string;
  /** Closed-taxonomy family — drives the picker grouping. */
  readonly family: RacPlannerModeFamily;
  /** True when this mode is reserved (declared but never emitted by
   *  the current `derivePlannerMode`). Reserved modes still appear in
   *  the picker as "Coming Soon" — operators do not select them. */
  readonly reserved: boolean;
}

export const RAC_PLANNER_MODE_METADATA: Readonly<
  Record<RacPlannerMode, RacPlannerModeMetadata>
> = {
  no_retrieval: {
    label: "No Retrieval",
    description:
      "Plain prompt path — no CAG, no RAG, no tools. Used for short answers and unscoped queries.",
    family: "no_retrieval",
    reserved: false,
  },
  cag_only: {
    label: "CAG Only",
    description:
      "Compiled CAG context only — no retrieval at runtime. Fast and deterministic.",
    family: "cag_only",
    reserved: false,
  },
  knowledge_retrieval: {
    label: "Knowledge Retrieval",
    description:
      "RAG over the governed knowledge base — text + vector retrieval, no tools.",
    family: "knowledge_retrieval",
    reserved: false,
  },
  multimodal_hybrid_retrieval: {
    label: "Multimodal Hybrid Retrieval",
    description:
      "RAG across text + image / OCR sources — extends knowledge_retrieval to multimodal artifacts.",
    family: "knowledge_retrieval",
    reserved: false,
  },
  tool_knowledge_retrieval: {
    label: "Tool Knowledge Retrieval",
    description:
      "RAG over tool-knowledge promotions — surfaces what tools have been used and to what effect.",
    family: "knowledge_retrieval",
    reserved: false,
  },
  hybrid_cag_rag: {
    label: "Hybrid CAG + RAG",
    description:
      "Compiled CAG context plus runtime RAG retrieval. The most common operator-picked mode.",
    family: "hybrid_cag",
    reserved: false,
  },
  hybrid_cag_tool_knowledge: {
    label: "Hybrid CAG + Tool Knowledge",
    description:
      "Compiled CAG context plus runtime tool-knowledge retrieval. Used for operations-heavy queries.",
    family: "hybrid_cag",
    reserved: false,
  },
  hybrid_cag_rag_tool_knowledge: {
    label: "Hybrid CAG + RAG + Tool Knowledge",
    description:
      "Full stack: compiled CAG, RAG, and tool-knowledge retrieval. The kitchen-sink mode for hardest queries.",
    family: "hybrid_cag",
    reserved: false,
  },
  graphrag_local: {
    label: "GraphRAG Local (Reserved)",
    description:
      "Per-document chunk-based GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_pure",
    reserved: true,
  },
  graphrag_global: {
    label: "GraphRAG Global (Reserved)",
    description:
      "Cross-document graph-level GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_pure",
    reserved: true,
  },
  graphrag_traversal: {
    label: "GraphRAG Traversal (Reserved)",
    description:
      "Typed-edge graph walk GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_pure",
    reserved: true,
  },
  graphrag_text2cypher: {
    label: "GraphRAG Text2Cypher (Reserved)",
    description:
      "LLM-generated read-only Cypher GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_pure",
    reserved: true,
  },
  graphrag_algorithm: {
    label: "GraphRAG Algorithm (Reserved)",
    description:
      "Graph-algorithm-output GraphRAG retrieval (centrality / community / similarity). Phase 12 reserved — not yet emitted.",
    family: "graphrag_pure",
    reserved: true,
  },
  hybrid_cag_graphrag: {
    label: "Hybrid CAG + GraphRAG (Reserved)",
    description:
      "Compiled CAG plus GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_hybrid",
    reserved: true,
  },
  hybrid_rac_graphrag: {
    label: "Hybrid RAC + GraphRAG (Reserved)",
    description:
      "Full RAC stack plus GraphRAG retrieval. Phase 12 reserved — not yet emitted by derivePlannerMode.",
    family: "graphrag_hybrid",
    reserved: true,
  },
};

export function getRacPlannerModeMetadata(
  mode: RacPlannerMode,
): RacPlannerModeMetadata {
  return RAC_PLANNER_MODE_METADATA[mode];
}

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
 *   4. Runnable sources include a graph_index source carrying a
 *      Phase-12 `metadataJson.retrievalMethod` discriminator:
 *        a. Only graph_index sources contribute, no CAG → graphrag_<method>
 *        b. Only graph_index sources contribute, with CAG → hybrid_cag_graphrag
 *        c. graph_index + other knowledge sources, no CAG → hybrid_rac_graphrag
 *        d. graph_index + other knowledge sources, with CAG → hybrid_cag_graphrag
 *           (CAG presence wins because the CAG pack and GraphRAG share
 *            the same operator UX surface — the trace tag describes the
 *            dominant compositional intent rather than the source mix)
 *      When multiple graph_index sources carry methods, the lowest-priority
 *      (i.e., first registered) method wins so that operator intent is
 *      stable; mixed methods collapse to graphrag_local conservatively.
 *      Graph sources without a `retrievalMethod` discriminator fall
 *      through to the legacy knowledge / tool_knowledge buckets below.
 *   5. Runnable sources are exclusively tool_knowledge:
 *        a. With CAG pack          → hybrid_cag_tool_knowledge
 *        b. Without CAG pack       → tool_knowledge_retrieval
 *   6. Runnable sources are exclusively knowledge:
 *        a. With CAG pack          → hybrid_cag_rag
 *        b. Without CAG pack       → knowledge_retrieval
 *   7. Mix of knowledge + tool_knowledge:
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

  // Phase 12 — GraphRAG-flavored routing.
  const graphragMethods = runnable
    .map((it) => readGraphragRetrievalMethod(it))
    .filter((m): m is GraphragRetrievalMethod => m !== null);

  if (graphragMethods.length > 0) {
    const onlyGraphSources = runnable.every(
      (it) => it.source.sourceType === "graph_index",
    );
    const distinctMethods = new Set(graphragMethods);
    const chosenMethod: GraphragRetrievalMethod =
      distinctMethods.size === 1
        ? graphragMethods[0]
        : "local";

    if (input.hasCagPack) {
      return {
        mode: "hybrid_cag_graphrag",
        reason: onlyGraphSources
          ? `CAG pack + graphrag_${chosenMethod} (${graphragMethods.length} graph source(s))`
          : `CAG pack + graphrag_${chosenMethod} + ${runnable.length - graphragMethods.length} other source(s)`,
      };
    }
    if (!onlyGraphSources) {
      return {
        mode: "hybrid_rac_graphrag",
        reason: `graphrag_${chosenMethod} + ${runnable.length - graphragMethods.length} non-graph source(s)`,
      };
    }
    return {
      mode: `graphrag_${chosenMethod}` as RacPlannerMode,
      reason:
        distinctMethods.size === 1
          ? `graph_index source(s) with retrievalMethod=${chosenMethod}`
          : `graph_index sources with mixed methods=[${[...distinctMethods].join(",")}] — collapsed to graphrag_local`,
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
