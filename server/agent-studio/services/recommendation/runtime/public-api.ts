/**
 * Recommendation Service runtime public-api barrel — T-G.4.1.
 */

export {
  createRecommendationService,
  type RecommendationService,
  type RecommendationCandidateFetchFn,
  type CreateRecommendationServiceOptions,
} from "./recommendation-service.js";

export {
  createGraphRagCandidateFetcher,
  defaultRecommendationKindMapper,
  defaultBlockScorer,
  classifyBlockPermissionStatus,
  transformBlocksToCandidates,
  DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS,
  type RecommendationGraphRouter,
  type RecommendationKindMapper,
  type KindMapperInput,
  type BlockScorer,
  type BlockScoreInput,
  type TransformBlocksOptions,
  type CreateGraphRagCandidateFetcherOptions,
} from "./graphrag-candidate-fetcher.js";
