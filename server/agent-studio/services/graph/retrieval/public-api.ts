/**
 * GraphRAG retrieval — public API barrel.
 */

export {
  FORBIDDEN_TOKENS,
  FORBIDDEN_PROCEDURE_PATTERNS,
  ALLOWED_PROCEDURE_NAMESPACES,
  validateCypherReadOnly,
} from "./text2cypher-validator.js";
export type { ValidationOutcome, Text2CypherValidationRecord } from "./text2cypher-validator.js";

export { filterContextBlocks } from "./safety-filter.js";
export type { ContextBlockInput, ContextBlockOutput, SafetyEvent, FilterResult } from "./safety-filter.js";

export { GraphRetrievalRouter } from "./retrieval-router.js";
export type { RetrievalMode, GraphRetrievalInput, GraphRetrievalOutput } from "./retrieval-router.js";

export {
  rankHybrid,
  extractDefaultSignals,
  DEFAULT_RANK_WEIGHTS,
} from "./hybrid-ranker.js";
export type {
  RankSignals,
  RankWeights,
  RankedBlock,
  HybridRankInput,
  HybridRankOptions,
} from "./hybrid-ranker.js";

export {
  buildSignalLookup,
  composeSignalLookups,
} from "./vector-text-signal-bridge.js";
export type {
  VectorRetrieverHit,
  TextRetrieverHit,
  SignalBridgeInput,
} from "./vector-text-signal-bridge.js";
