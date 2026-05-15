/**
 * Graph Algorithm public-api barrel — Phase 26 §T-G.5.
 */

export {
  GRAPH_ALGORITHM_KINDS,
  GRAPH_ALGORITHM_BACKEND_SUPPORT,
  GRAPH_ALGORITHM_METADATA,
  GraphAlgorithmMaxNodesOutOfRangeError,
  GraphAlgorithmMaxIterationsOutOfRangeError,
  isGraphAlgorithmKind,
  normalizeAlgorithmMaxNodes,
  normalizeAlgorithmMaxIterations,
  preflightAlgorithmRequest,
  listAlgorithmsTriggeringAuraUpgrade,
  listAlgorithmsAvailableOnCe,
  summarizeGraphAlgorithmCoverage,
  type GraphAlgorithmKind,
  type GraphAlgorithmBackendSupport,
  type GraphAlgorithmMetadata,
  type GraphAlgorithmRequest,
  type GraphAlgorithmResult,
  type GraphAlgorithmResultRow,
  type GraphAlgorithmPreflightDecision,
  type GraphAlgorithmPreflightOutcome,
  type GraphAlgorithmCoverageSummary,
} from "./contracts.js";
