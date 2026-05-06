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
  RacIndexValidationResult,
  RacIngestionPreview,
} from "./types";

export {
  RacBackendUnavailableError,
  EmbeddingDimMismatchError,
  EmbeddingProviderUnavailableError,
} from "./types";

export { graphragAdapter } from "./graphrag-adapter";
export { localPgvectorAdapter } from "./local-pgvector-adapter";
export { knowledgeUnitAdapter } from "./knowledge-unit-adapter";

export {
  pickAdapter,
  resolveEmbeddingBinding,
  type ResolvedEmbeddingBinding,
} from "./dispatcher";
