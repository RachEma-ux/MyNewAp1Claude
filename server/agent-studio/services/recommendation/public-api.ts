/**
 * Recommendation Service public-api barrel — Phase 25 §T-G.4.
 */

export {
  RECOMMENDATION_KINDS,
  RECOMMENDATION_PERMISSION_STATUSES,
  DEFAULT_RECOMMENDATION_LIMIT,
  ABSOLUTE_RECOMMENDATION_LIMIT,
  DEFAULT_RECOMMENDATION_MIN_CONFIDENCE,
  isRecommendationKind,
  normalizeRecommendationLimit,
  normalizeRecommendationMinConfidence,
  summarizeRecommendationResponse,
  RECOMMENDATION_KIND_METADATA,
  getRecommendationKindMetadata,
  RECOMMENDATION_PERMISSION_STATUS_METADATA,
  getRecommendationPermissionStatusMetadata,
  type RecommendationKind,
  type RecommendationPermissionStatus,
  type RecommendationRequest,
  type RecommendationResult,
  type RecommendationResponse,
  type RecommendationResponseSummary,
  type RecommendationKindMetadata,
  type RecommendationPermissionStatusMetadata,
} from "./contracts.js";

export {
  assembleRecommendationResponse,
  summarizeRecommendationCandidates,
  REDACTED_RECOMMENDATION_REASON,
  REDACTED_RECOMMENDATION_NODE_TYPE_KEY,
  REDACTED_RECOMMENDATION_NODE_ID,
  type RecommendationCandidate,
  type AssembleRecommendationResponseOptions,
  type RecommendationCandidateListSummary,
} from "./assemble-response.js";

// T-G.4.1 — runtime that composes the candidate fetcher + assembler
// into a runnable service.
export * from "./runtime/public-api.js";
