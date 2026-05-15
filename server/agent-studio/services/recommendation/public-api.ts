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
  type RecommendationKind,
  type RecommendationPermissionStatus,
  type RecommendationRequest,
  type RecommendationResult,
  type RecommendationResponse,
  type RecommendationResponseSummary,
} from "./contracts.js";

export {
  assembleRecommendationResponse,
  REDACTED_RECOMMENDATION_REASON,
  REDACTED_RECOMMENDATION_NODE_TYPE_KEY,
  REDACTED_RECOMMENDATION_NODE_ID,
  type RecommendationCandidate,
  type AssembleRecommendationResponseOptions,
} from "./assemble-response.js";
