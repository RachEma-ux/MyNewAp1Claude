/**
 * GraphRAG-backed candidate fetcher — T-G.4.2.
 *
 * Production implementation of `RecommendationCandidateFetchFn`
 * that maps a `RecommendationRequest.kind` to a `GraphRetrievalInput`,
 * calls the existing `GraphRetrievalRouter.retrieve(...)`, then
 * transforms the returned context blocks + safety events into
 * `RecommendationCandidate[]`.
 *
 * Composition:
 *
 *   RecommendationService (T-G.4.1) → fetchCandidates(request)
 *     ↓
 *   createGraphRagCandidateFetcher({ router, kindMapper? })
 *     ↓
 *   kindMapper(request) → GraphRetrievalInput  (kind → mode/template)
 *     ↓
 *   router.retrieve(input) → GraphRetrievalOutput
 *     ↓
 *   blocks → candidates (with confidence + permissionStatus derived
 *                        from safetyEvents)
 *
 * Why a separate factory rather than baking the GraphRAG dependency
 * into the runtime:
 *   - The runtime stays a thin shell (T-G.4.1 invariant).
 *   - Future sibling fetchers (OSV / GHSA / scanner plugins) wire
 *     the same `RecommendationCandidateFetchFn` shape with their own
 *     retrieval surface.
 *   - Tests can inject a stub router OR a stub fetcher; the runtime
 *     doesn't know which.
 *
 * Permission-status derivation rules:
 *   - block has matching `governance_hidden` safety event
 *       → permissionStatus = "hidden" (fully filtered out)
 *   - block has matching `permission_denied` safety event
 *       → permissionStatus = "redacted" (existence surfaced; content hidden)
 *   - else
 *       → permissionStatus = "visible"
 *
 * Confidence derivation:
 *   - Default: 0.7 (template-hit baseline). The router doesn't surface
 *     a per-block confidence today; future enhancement can thread
 *     BFS-hop distance or template-relevance score.
 *   - Operators can supply a `scoreBlock` option in the factory to
 *     override the default scorer.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import. GraphRAG router calls flow through
 *     GraphRepository underneath (Phase 7.5b path).
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver` /
 *     `process.env` reads. Operator threads RuntimeContext via the
 *     request anchor / workspaceId.
 */

import type {
  GraphRetrievalInput,
  GraphRetrievalOutput,
  RetrievalMode,
} from "../../graph/retrieval/retrieval-router.js";
import type { ContextBlockOutput, SafetyEvent } from "../../graph/retrieval/safety-filter.js";
import type { RuntimeContext } from "../../graph/repository/types.js";
import type { RecommendationCandidate } from "../assemble-response.js";
import type {
  RecommendationKind,
  RecommendationRequest,
} from "../contracts.js";
import type { RecommendationCandidateFetchFn } from "./recommendation-service.js";

// ============================================================================
// Router-shaped boundary
// ============================================================================

/**
 * Minimal subset of `GraphRetrievalRouter` the fetcher needs. Lets
 * tests inject a stub without constructing the full router (which
 * needs a GraphRepository + several optional recorders).
 */
export interface RecommendationGraphRouter {
  retrieve(input: GraphRetrievalInput): Promise<GraphRetrievalOutput>;
}

// ============================================================================
// Kind → retrieval-shape mapper
// ============================================================================

export interface KindMapperInput {
  readonly kind: RecommendationKind;
  readonly anchor: RecommendationRequest["anchor"];
  readonly limit: number;
  readonly runtime: RuntimeContext;
}

export type RecommendationKindMapper = (
  input: KindMapperInput,
) => GraphRetrievalInput;

/**
 * Default kind → retrieval-shape mapping. Each kind maps to a
 * `graphrag_traversal` mode anchored on the request's `anchor.id`,
 * with a kind-specific templateKey hint passed via `preferTemplateKeys`.
 *
 * The actual templates may or may not exist in the
 * `ags_query_templates` registry; when none match, the router falls
 * back to the generic traversal path. This keeps the mapper a soft
 * suggestion rather than a hard contract — operators can register
 * recommendation-specific templates later without changing this code.
 */
export const DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS: Readonly<
  Record<RecommendationKind, ReadonlyArray<string>>
> = {
  relevant_notes: ["recommendation_relevant_notes", "find_similar_notes"],
  relevant_cag_blocks: ["recommendation_cag_blocks", "cag_block_dependencies"],
  relevant_graph_skill_packs: [
    "recommendation_graph_skill_packs",
    "skill_pack_neighbors",
  ],
  relevant_tools: ["recommendation_tools", "tool_neighborhood"],
  relevant_policies: ["recommendation_policies", "tool_policy_dependencies"],
  relevant_workflows: ["recommendation_workflows", "workflow_neighbors"],
  relevant_experts: ["recommendation_experts", "agent_owners_for_domain"],
  next_actions: ["recommendation_next_actions", "lifecycle_next_actions"],
};

export const defaultRecommendationKindMapper: RecommendationKindMapper = (
  input,
) => {
  const mode: RetrievalMode = "graphrag_traversal";
  return {
    mode,
    query: `recommendation:${input.kind} anchored on ${input.anchor.typeKey}:${input.anchor.id}`,
    seedNodeId: input.anchor.id,
    maxResults: input.limit * 3, // over-fetch; runtime truncates after rank-sort
    maxDepth: 3,
    runtime: input.runtime,
    preferTemplateKeys: [
      ...DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS[input.kind],
    ],
  };
};

// ============================================================================
// Block → candidate transform
// ============================================================================

export interface BlockScoreInput {
  readonly block: ContextBlockOutput;
  readonly kind: RecommendationKind;
}

export type BlockScorer = (input: BlockScoreInput) => number;

/**
 * Default scorer — fixed 0.7. The router doesn't surface a per-
 * block confidence signal today. Operators / future enhancements
 * can swap this for a BFS-hop-distance or template-relevance scorer.
 */
export const defaultBlockScorer: BlockScorer = () => 0.7;

/**
 * Classify a block's permission status from the safety-event stream.
 * `governance_hidden` → hidden (drop entirely); `permission_denied`
 * → redacted (surface existence; hide content). Everything else
 * surfaces normally as visible.
 */
export function classifyBlockPermissionStatus(
  blockId: string,
  safetyEvents: ReadonlyArray<SafetyEvent>,
): "visible" | "redacted" | "hidden" {
  for (const e of safetyEvents) {
    if (e.blockId !== blockId) continue;
    if (e.reason === "governance_hidden") return "hidden";
    if (e.reason === "permission_denied") return "redacted";
    if (e.reason === "governance_archived") return "hidden";
  }
  return "visible";
}

export interface TransformBlocksOptions {
  readonly kind: RecommendationKind;
  readonly score?: BlockScorer;
}

export function transformBlocksToCandidates(
  output: GraphRetrievalOutput,
  options: TransformBlocksOptions,
): ReadonlyArray<RecommendationCandidate> {
  const scorer = options.score ?? defaultBlockScorer;
  const candidates: RecommendationCandidate[] = [];
  for (const block of output.contextBlocks) {
    const permissionStatus = classifyBlockPermissionStatus(
      block.id,
      output.safetyEvents,
    );
    if (permissionStatus === "hidden") {
      // The assembler will count this in `fullyHiddenCount`, but
      // only if we surface it. Since the GraphRAG router has
      // ALREADY filtered hidden blocks out of `contextBlocks`
      // (see safety-filter.ts), reaching this branch is rare —
      // it only happens when the safetyEvents include a hidden
      // event for a block still in the list. Surface the
      // candidate so the assembler can count it; the assembler
      // drops it from `results`.
      candidates.push({
        permissionStatus: "hidden",
        reason: "",
        graphPath: [],
        sourceCitations: [],
        confidence: scorer({ block, kind: options.kind }),
        recommendedNode: {
          typeKey: block.sourceKind,
          id: block.sourceId,
        },
      });
      continue;
    }
    candidates.push({
      permissionStatus,
      reason: block.contentSnippet ?? `Found via ${output.mode}`,
      graphPath: [output.mode],
      sourceCitations: [
        {
          typeKey: block.citation.sourceKind,
          id: block.citation.sourceId,
        },
      ],
      confidence: scorer({ block, kind: options.kind }),
      recommendedNode: {
        typeKey: block.sourceKind,
        id: block.sourceId,
      },
    });
  }
  return candidates;
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateGraphRagCandidateFetcherOptions {
  readonly router: RecommendationGraphRouter;
  /** Optional override for the kind → retrieval-shape mapping. */
  readonly kindMapper?: RecommendationKindMapper;
  /** Optional override for the per-block confidence scorer. */
  readonly score?: BlockScorer;
}

export function createGraphRagCandidateFetcher(
  options: CreateGraphRagCandidateFetcherOptions,
): RecommendationCandidateFetchFn {
  const mapper = options.kindMapper ?? defaultRecommendationKindMapper;
  return async (request: RecommendationRequest) => {
    const limit = request.limit ?? 10;
    const runtime: RuntimeContext = {
      workspaceId: request.workspaceId,
    };
    const input = mapper({
      kind: request.kind,
      anchor: request.anchor,
      limit,
      runtime,
    });
    const output = await options.router.retrieve(input);
    return transformBlocksToCandidates(output, {
      kind: request.kind,
      score: options.score,
    });
  };
}
