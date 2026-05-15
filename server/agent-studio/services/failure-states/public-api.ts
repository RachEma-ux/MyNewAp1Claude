/**
 * Failure-states public-api barrel — Phase 22 §T-I.3.
 */

export {
  FAILURE_STATES,
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_SEVERITIES,
  FAILURE_STATE_METADATA,
  isFailureState,
  listFailureStatesByCategory,
  listFailureStatesBySeverity,
  listOperatorActionRequiredFailureStates,
  summarizeFailureStateOccurrences,
  type FailureState,
  type FailureStateCategory,
  type FailureStateSeverity,
  type FailureStateMetadata,
  type FailureStateOccurrenceSummary,
} from "./contracts.js";

export {
  FAILURE_STATE_ERROR_CLASS_PREFIX,
  failureStateErrorClass,
  parseFailureStateFromErrorClass,
  getCanonicalFailureStateAnnotations,
  recordFailureStateEvent,
  recordFailureStateEvents,
  summarizeFailureStateEventList,
  type RecordFailureStateEventInput,
  type CanonicalFailureStateAnnotations,
  type FailureStateEventListSummary,
} from "./observability-bridge.js";
