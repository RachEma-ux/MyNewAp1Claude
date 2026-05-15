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
  type FailureState,
  type FailureStateCategory,
  type FailureStateSeverity,
  type FailureStateMetadata,
} from "./contracts.js";
