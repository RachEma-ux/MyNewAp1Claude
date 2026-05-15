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
  type RecommendationKind,
  type RecommendationPermissionStatus,
  type RecommendationRequest,
  type RecommendationResult,
  type RecommendationResponse,
} from "./contracts.js";
