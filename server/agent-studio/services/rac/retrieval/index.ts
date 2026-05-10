/**
 * RAC Retrieval — public barrel (Phase 4).
 *
 * P5 assembler and P6 chat-stream integration consume from here. The
 * three primitives compose as: `planRetrieval → executeRetrieval →
 * filterRetrieval`. Each is independently testable.
 */

export {
  planRetrieval,
  buildItem,
  // H3-c8: surface PlannerTimeoutError so callers can recognize the
  // typed timeout error (orchestrator uses it for safe-degraded
  // mapping; downstream tests use it to assert behavior).
  PlannerTimeoutError,
  type RetrievalPlan,
  type RetrievalPlanItem,
  type PlanRetrievalInput,
} from "../retrieval-planner";

export {
  executeRetrieval,
  DEFAULT_RETRIEVAL_TIMEOUT_MS,
  type ExecutedRetrieval,
  type ExecutedSourceResult,
  type ExecuteRetrievalInput,
} from "../retrieval-executor";

export {
  filterRetrieval,
  DEFAULT_RETRIEVAL_FILTER_CONFIG,
  type RetrievalFilterConfig,
  type FilteredRetrieval,
  type FilterRetrievalInput,
  type FilterRejectionCounts,
} from "../retrieval-filter";
