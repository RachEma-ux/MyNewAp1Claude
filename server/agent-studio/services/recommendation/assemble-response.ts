/**
 * Recommendation response assembler — Phase 25 §T-G.8.
 *
 * Pure function that takes a list of permission-classified candidates
 * + a request and produces a `RecommendationResponse` with:
 *
 *   - permissionStatus="hidden" candidates DROPPED entirely (not in
 *     `results`); their count accumulated in `fullyHiddenCount`.
 *   - permissionStatus="redacted" candidates SURFACED with generic
 *     reason / empty graphPath / empty citations; their count
 *     accumulated in `redactedCount` AND they appear in `results`.
 *   - permissionStatus="visible" candidates surfaced with full
 *     reason / graphPath / citations.
 *   - confidence < `minConfidence` candidates DROPPED before
 *     classification.
 *   - sort: visible-then-redacted-by-confidence-desc, then truncate
 *     to `limit`.
 *   - `rank` assigned 1-based after sort + truncate.
 *
 * This is the **decision logic** the eventual runtime needs at the
 * tRPC boundary. Pinning it here so the runtime is a thin shell.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

import type {
  RecommendationKind,
  RecommendationPermissionStatus,
  RecommendationRequest,
  RecommendationResponse,
  RecommendationResult,
} from "./contracts.js";
import {
  normalizeRecommendationLimit,
  normalizeRecommendationMinConfidence,
} from "./contracts.js";

/**
 * Input shape for the assembler. The eventual runtime produces an
 * array of these from the GraphRAG router + permission post-filter;
 * the assembler converts them into the final response.
 *
 * The shape is intentionally similar to `RecommendationResult` but
 * (a) has no `rank` (the assembler assigns it) and (b) reasons /
 * paths / citations for redacted candidates may be present but will
 * be stripped by the assembler — the caller doesn't have to know
 * the redaction policy.
 */
export interface RecommendationCandidate {
  readonly permissionStatus: RecommendationPermissionStatus;
  readonly reason: string;
  readonly graphPath: ReadonlyArray<string>;
  readonly sourceCitations: ReadonlyArray<{
    readonly typeKey: string;
    readonly id: string;
  }>;
  readonly confidence: number;
  readonly recommendedNode: {
    readonly typeKey: string;
    readonly id: string;
  };
}

/** Fixed redaction-safe reason emitted by the assembler. */
export const REDACTED_RECOMMENDATION_REASON =
  "A relevant result exists in a workspace or scope you don't have access to.";

/** Fixed redaction-safe recommended-node sentinel. */
export const REDACTED_RECOMMENDATION_NODE_TYPE_KEY =
  "redacted_recommendation";
export const REDACTED_RECOMMENDATION_NODE_ID = "__redacted__";

export interface AssembleRecommendationResponseOptions {
  /** Request whose `limit` + `minConfidence` drive truncation +
   *  filtering. The response's `kind` + `anchor` are copied from
   *  this request. */
  readonly request: RecommendationRequest;
}

/**
 * Pure-function assembler. The caller provides classified candidates;
 * this produces the final response.
 */
export function assembleRecommendationResponse(
  candidates: ReadonlyArray<RecommendationCandidate>,
  options: AssembleRecommendationResponseOptions,
): RecommendationResponse {
  const limit = normalizeRecommendationLimit(options.request.limit);
  const minConfidence = normalizeRecommendationMinConfidence(
    options.request.minConfidence,
  );

  // 1) Drop sub-confidence candidates BEFORE classification — the
  //    confidence floor is a hard filter, not a re-ranking signal.
  const aboveFloor = candidates.filter((c) => c.confidence >= minConfidence);

  // 2) Partition by permission status.
  let fullyHiddenCount = 0;
  let redactedCount = 0;
  const surfaceable: RecommendationCandidate[] = [];
  for (const c of aboveFloor) {
    if (c.permissionStatus === "hidden") {
      fullyHiddenCount++;
      continue;
    }
    if (c.permissionStatus === "redacted") {
      redactedCount++;
    }
    surfaceable.push(c);
  }

  // 3) Sort surfaceable by confidence desc; stable on ties — visible
  //    before redacted (visible carries more operator-actionable
  //    signal).
  const sorted = [...surfaceable].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.permissionStatus === "visible" && b.permissionStatus !== "visible") {
      return -1;
    }
    if (a.permissionStatus !== "visible" && b.permissionStatus === "visible") {
      return 1;
    }
    return 0;
  });

  // 4) Truncate to limit, then convert each to a RecommendationResult
  //    with rank + redaction-policy applied.
  const truncated = sorted.slice(0, limit);
  const results: RecommendationResult[] = truncated.map((c, idx) => {
    if (c.permissionStatus === "redacted") {
      return {
        rank: idx + 1,
        permissionStatus: "redacted",
        reason: REDACTED_RECOMMENDATION_REASON,
        graphPath: [],
        sourceCitations: [],
        confidence: c.confidence,
        recommendedNode: {
          typeKey: REDACTED_RECOMMENDATION_NODE_TYPE_KEY,
          id: REDACTED_RECOMMENDATION_NODE_ID,
        },
      };
    }
    return {
      rank: idx + 1,
      permissionStatus: "visible",
      reason: c.reason,
      graphPath: c.graphPath,
      sourceCitations: c.sourceCitations,
      confidence: c.confidence,
      recommendedNode: c.recommendedNode,
    };
  });

  return {
    kind: options.request.kind satisfies RecommendationKind,
    anchor: options.request.anchor,
    results,
    redactedCount,
    fullyHiddenCount,
  };
}

// ============================================================================
// Candidate-list summary (T-G.18)
// ============================================================================

export interface RecommendationCandidateListSummary {
  readonly totalCandidates: number;
  readonly belowConfidenceFloor: number;
  readonly aboveConfidenceFloor: number;
  readonly visible: number;
  readonly redacted: number;
  readonly fullyHidden: number;
  /** Mean / min / max confidence across ALL candidates (visible or
   *  not). `null` for empty input. Useful for "is the model
   *  generating low-quality candidates regardless of permission?"
   *  diagnostics. */
  readonly meanConfidence: number | null;
  readonly minConfidence: number | null;
  readonly maxConfidence: number | null;
}

/**
 * Pre-assemble diagnostic: summarizes the raw candidate list BEFORE
 * `assembleRecommendationResponse` filters, sorts, and truncates. Use
 * this to monitor the recommendation runtime's upstream quality
 * separately from the dashboard-facing post-assembly summary.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeRecommendationCandidates(
  candidates: ReadonlyArray<RecommendationCandidate>,
  minConfidence: number,
): RecommendationCandidateListSummary {
  let visible = 0;
  let redacted = 0;
  let fullyHidden = 0;
  let belowFloor = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const c of candidates) {
    sum += c.confidence;
    if (c.confidence < min) min = c.confidence;
    if (c.confidence > max) max = c.confidence;
    if (c.confidence < minConfidence) {
      belowFloor += 1;
      continue;
    }
    if (c.permissionStatus === "visible") visible += 1;
    else if (c.permissionStatus === "redacted") redacted += 1;
    else fullyHidden += 1;
  }
  const aboveFloor = candidates.length - belowFloor;
  const total = candidates.length;
  return {
    totalCandidates: total,
    belowConfidenceFloor: belowFloor,
    aboveConfidenceFloor: aboveFloor,
    visible,
    redacted,
    fullyHidden,
    meanConfidence: total > 0 ? sum / total : null,
    minConfidence: total > 0 ? min : null,
    maxConfidence: total > 0 ? max : null,
  };
}
