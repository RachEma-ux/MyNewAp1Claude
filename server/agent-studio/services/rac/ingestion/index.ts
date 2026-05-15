/**
 * RAC Ingestion — public barrel (Phase 3).
 *
 * Re-exports the adapter contract, the gap-shaped concrete adapters,
 * and the dispatcher. P4 retrieval planner/executor consume from here.
 */

export type {
  RacIngestionAdapter,
  RacRetrievalRequest,
  RacRetrievalResult,
  RacRetrievalChunk,
  RacRetrievalHealth,
  RacRetrievalHealthStatus,
  RacRetrievalHealthStatusMetadata,
  RacIndexValidationResult,
  RacIngestionPreview,
} from "./types";

export {
  RacBackendUnavailableError,
  EmbeddingDimMismatchError,
  EmbeddingProviderUnavailableError,
  RAC_RETRIEVAL_HEALTH_STATUSES,
  RAC_RETRIEVAL_HEALTH_STATUS_METADATA,
  getRacRetrievalHealthStatusMetadata,
} from "./types";

export { graphragAdapter } from "./graphrag-adapter";
export { localPgvectorAdapter } from "./local-pgvector-adapter";
export { knowledgeUnitAdapter } from "./knowledge-unit-adapter";

export {
  pickAdapter,
  resolveEmbeddingBinding,
  type ResolvedEmbeddingBinding,
} from "./dispatcher";
