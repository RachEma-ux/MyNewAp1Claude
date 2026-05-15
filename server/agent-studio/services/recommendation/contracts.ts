/**
 * Recommendation Service contracts — Phase 25 §T-G.4.
 *
 * Roadmap §"Phase 25 — V1.5 Expansion" defines the Recommendation
 * Service Pattern with 8 closed-taxonomy recommendation kinds and
 * a strict output shape: `{ rank, reason, graphPath, sourceCitations,
 * confidence, permissionStatus }`.
 *
 * This module pins the closed taxonomy + the request/response shape.
 * The recommendation runtime (GraphRAG router → ranking pipeline →
 * permission post-filter) is wired in a follow-up; here we lock the
 * boundary contract so the runtime can be implemented against a
 * stable surface.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - The eventual runtime uses the existing GraphRAG router (Phase
 *     12, done); no new model-execution path.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

// ============================================================================
// Closed recommendation-kind taxonomy
// ============================================================================

/**
 * 8 recommendation kinds. Closed taxonomy — adding a new kind requires
 * editing this constant AND adding an ADR for the new kind's source
 * path through the recommendation runtime.
 */
export const RECOMMENDATION_KINDS = [
  "relevant_notes",
  "relevant_cag_blocks",
  "relevant_graph_skill_packs",
  "relevant_tools",
  "relevant_policies",
  "relevant_workflows",
  "relevant_experts",
  "next_actions",
] as const;

export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export function isRecommendationKind(s: unknown): s is RecommendationKind {
  return (
    typeof s === "string" &&
    (RECOMMENDATION_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Permission-status taxonomy
// ============================================================================

/**
 * The runtime's permission post-filter classifies each candidate as
 * one of:
 *   - `visible` — viewer can see the full content; surfaced normally.
 *   - `redacted` — viewer cannot see the content but the candidate's
 *     existence is surfaced (with a "Hidden by permission" label).
 *     Operators use this to know "there's a relevant thing here but
 *     you'd need access" without revealing details.
 *   - `hidden` — fully filtered out; not even shape is exposed.
 *     The recommendation runtime drops these before they reach the
 *     response.
 */
export const RECOMMENDATION_PERMISSION_STATUSES = [
  "visible",
  "redacted",
  "hidden",
] as const;

export type RecommendationPermissionStatus =
  (typeof RECOMMENDATION_PERMISSION_STATUSES)[number];

// ============================================================================
// Per-permission-status operator-facing metadata (T-G.27)
// ============================================================================

export interface RecommendationPermissionStatusMetadata {
  /** Display label for operator dashboards / lens overlays. */
  readonly label: string;
  /** Short description of what the operator sees for this status. */
  readonly description: string;
  /** Whether the candidate is rendered at all (visible/redacted=yes,
   *  hidden=no). */
  readonly rendered: boolean;
}

export const RECOMMENDATION_PERMISSION_STATUS_METADATA: Readonly<
  Record<
    RecommendationPermissionStatus,
    RecommendationPermissionStatusMetadata
  >
> = {
  visible: {
    label: "Visible",
    description:
      "Viewer can see the full content. The recommendation is surfaced with reason / path / citations.",
    rendered: true,
  },
  redacted: {
    label: "Redacted",
    description:
      "Viewer cannot see the content but the candidate's existence is surfaced with a generic 'Hidden by permission' label.",
    rendered: true,
  },
  hidden: {
    label: "Hidden",
    description:
      "Fully filtered out — neither content nor existence is exposed. Excluded from the response entirely.",
    rendered: false,
  },
};

export function getRecommendationPermissionStatusMetadata(
  status: RecommendationPermissionStatus,
): RecommendationPermissionStatusMetadata {
  return RECOMMENDATION_PERMISSION_STATUS_METADATA[status];
}

// ============================================================================
// Per-kind operator-facing metadata (T-G.23)
// ============================================================================

export interface RecommendationKindMetadata {
  /** Display label rendered in the operator UI's lens tabs / pickers. */
  readonly label: string;
  /** Short description rendered on hover / in the lens-runner's help
   *  text. Operator-facing, no jargon. */
  readonly description: string;
}

export const RECOMMENDATION_KIND_METADATA: Readonly<
  Record<RecommendationKind, RecommendationKindMetadata>
> = {
  relevant_notes: {
    label: "Relevant Notes",
    description:
      "Notes anchored to the same topic / entity as the current context.",
  },
  relevant_cag_blocks: {
    label: "Relevant CAG Blocks",
    description:
      "Compiled CAG blocks whose semantics match the current context.",
  },
  relevant_graph_skill_packs: {
    label: "Relevant Skill Packs",
    description:
      "Graph skill packs that historically apply to similar contexts.",
  },
  relevant_tools: {
    label: "Relevant Tools",
    description:
      "MCP tools whose schemas indicate suitability for the current context.",
  },
  relevant_policies: {
    label: "Relevant Policies",
    description:
      "Governance policies that bind operations in the current context.",
  },
  relevant_workflows: {
    label: "Relevant Workflows",
    description:
      "Automation workflows that match the current context's trigger shape.",
  },
  relevant_experts: {
    label: "Relevant Experts",
    description:
      "People (per institutional memory) with prior involvement in the current context.",
  },
  next_actions: {
    label: "Next Actions",
    description:
      "Suggested next actions based on the current context's lifecycle stage.",
  },
};

export function getRecommendationKindMetadata(
  kind: RecommendationKind,
): RecommendationKindMetadata {
  return RECOMMENDATION_KIND_METADATA[kind];
}

// ============================================================================
// Request shape
// ============================================================================

export interface RecommendationRequest {
  readonly kind: RecommendationKind;
  /** The user / agent / context anchoring the recommendation. */
  readonly anchor: {
    readonly typeKey: string;
    readonly id: string;
  };
  /** Workspace scope. Recommendations NEVER cross workspaces in MVP. */
  readonly workspaceId: number;
  /** Max results returned. Default 10; absolute max 100. */
  readonly limit?: number;
  /** Minimum confidence threshold. Default 0.5; range [0, 1]. Results
   *  below this confidence are dropped before the response. */
  readonly minConfidence?: number;
}

// ============================================================================
// Response shape
// ============================================================================

/**
 * One recommendation result. Mirrors the roadmap §Phase 25 output
 * spec: rank + reason + graph path + source citations + confidence
 * + permission status.
 */
export interface RecommendationResult {
  /** 1-based rank in the result set. */
  readonly rank: number;
  /** Closed-taxonomy permission classification. */
  readonly permissionStatus: RecommendationPermissionStatus;
  /** Human-readable reason for the recommendation. Always present;
   *  when permissionStatus="redacted" the reason is generic
   *  ("a relevant note exists in a workspace you don't have access
   *  to") so the redaction doesn't leak. */
  readonly reason: string;
  /** Graph path from the anchor to the recommended node — a list of
   *  edge typeKeys traversed. Useful for "why this answer?"
   *  inspection. Empty when permissionStatus="redacted". */
  readonly graphPath: ReadonlyArray<string>;
  /** Source citations — `{ typeKey, id }` for the provenance row(s)
   *  backing this recommendation. Empty when redacted. */
  readonly sourceCitations: ReadonlyArray<{
    readonly typeKey: string;
    readonly id: string;
  }>;
  /** Score in [0, 1]. Higher = more confident. The runtime drops
   *  results below the request's `minConfidence`. */
  readonly confidence: number;
  /** Recommended node id. May be a redaction sentinel when
   *  permissionStatus="redacted". */
  readonly recommendedNode: {
    readonly typeKey: string;
    readonly id: string;
  };
}

export interface RecommendationResponse {
  readonly kind: RecommendationKind;
  readonly anchor: RecommendationRequest["anchor"];
  readonly results: ReadonlyArray<RecommendationResult>;
  /** Number of candidates surfaced with permissionStatus="redacted".
   *  Operator UI uses this for "N additional results hidden by
   *  permission" without revealing the content. */
  readonly redactedCount: number;
  /** Number of candidates dropped entirely (permissionStatus="hidden"
   *  before reaching the response). Surfaced for audit-trail
   *  completeness; UI uses it to size the "search ran wider than
   *  you can see" signal. */
  readonly fullyHiddenCount: number;
}

// ============================================================================
// Defaults + limits
// ============================================================================

export const DEFAULT_RECOMMENDATION_LIMIT = 10;
export const ABSOLUTE_RECOMMENDATION_LIMIT = 100;

export const DEFAULT_RECOMMENDATION_MIN_CONFIDENCE = 0.5;

/**
 * Validate + normalize `limit`. Returns the clamped value (between
 * 1 and ABSOLUTE_RECOMMENDATION_LIMIT inclusive). Throws on non-finite
 * or sub-1.
 */
export function normalizeRecommendationLimit(
  input: number | undefined,
): number {
  if (input === undefined) return DEFAULT_RECOMMENDATION_LIMIT;
  if (!Number.isFinite(input)) {
    throw new Error(
      `Recommendation limit must be a finite number; got ${String(input)}`,
    );
  }
  if (input < 1) {
    throw new Error(`Recommendation limit must be >= 1; got ${input}`);
  }
  if (input > ABSOLUTE_RECOMMENDATION_LIMIT) {
    return ABSOLUTE_RECOMMENDATION_LIMIT;
  }
  return Math.floor(input);
}

// ============================================================================
// Aggregation helper (T-G.13)
// ============================================================================

export interface RecommendationResponseSummary {
  readonly total: number;
  readonly visible: number;
  readonly redacted: number;
  /** Always == response.fullyHiddenCount; mirrored here so a single
   *  summary value carries the full permission-shape. */
  readonly fullyHidden: number;
  /** Mean confidence across `visible` results only — redacted / hidden
   *  contribute no confidence signal. `null` when there are zero
   *  visible results. */
  readonly meanConfidenceVisible: number | null;
  /** Min / max confidence across `visible` results only. `null` when
   *  there are zero visible results. */
  readonly minConfidenceVisible: number | null;
  readonly maxConfidenceVisible: number | null;
}

/**
 * Aggregates a `RecommendationResponse` into a stable-shape summary
 * suitable for operator dashboards. All counts are present at zero
 * or higher; confidence stats are `null` when there are zero visible
 * results (rather than NaN / 0, which would mislead the dashboard).
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeRecommendationResponse(
  response: RecommendationResponse,
): RecommendationResponseSummary {
  let visible = 0;
  let redacted = 0;
  let confidenceSum = 0;
  let minConf = Number.POSITIVE_INFINITY;
  let maxConf = Number.NEGATIVE_INFINITY;
  for (const r of response.results) {
    if (r.permissionStatus === "visible") {
      visible += 1;
      confidenceSum += r.confidence;
      if (r.confidence < minConf) minConf = r.confidence;
      if (r.confidence > maxConf) maxConf = r.confidence;
    } else if (r.permissionStatus === "redacted") {
      redacted += 1;
    }
  }
  const meanConfidenceVisible = visible > 0 ? confidenceSum / visible : null;
  const minConfidenceVisible = visible > 0 ? minConf : null;
  const maxConfidenceVisible = visible > 0 ? maxConf : null;
  return {
    total: response.results.length,
    visible,
    redacted,
    fullyHidden: response.fullyHiddenCount,
    meanConfidenceVisible,
    minConfidenceVisible,
    maxConfidenceVisible,
  };
}

/**
 * Validate + normalize `minConfidence`. Returns the value in [0, 1].
 * Throws on out-of-range or non-finite.
 */
export function normalizeRecommendationMinConfidence(
  input: number | undefined,
): number {
  if (input === undefined) return DEFAULT_RECOMMENDATION_MIN_CONFIDENCE;
  if (!Number.isFinite(input)) {
    throw new Error(
      `Recommendation minConfidence must be a finite number; got ${String(input)}`,
    );
  }
  if (input < 0 || input > 1) {
    throw new Error(
      `Recommendation minConfidence must be in [0, 1]; got ${input}`,
    );
  }
  return input;
}
