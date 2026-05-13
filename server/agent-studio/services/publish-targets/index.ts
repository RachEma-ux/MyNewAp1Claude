/**
 * Publish-targets public API barrel.
 *
 * V1+ Phase 19-α first slice. Adds sync/publish target registry on
 * top of the existing promotion subsystem WITHOUT modifying its
 * internals (per the V1+ plan's "extend not greenfield" rule).
 */

export type {
  PublishTargetType,
  PublishExecutionStatus,
  PublishTargetRecord,
  PublishPayload,
  PublishExecutionOutcome,
  PublishPusher,
  GovernanceDecision,
  GovernanceGateFn,
} from "./types.js";

export {
  PUBLISH_TARGET_TYPES,
  PUBLISH_EXECUTION_STATUSES,
  GOVERNANCE_DECISIONS,
  isPublishTargetType,
  isGovernanceDecision,
} from "./types.js";

export {
  registerPublishPusher,
  getPublishPusher,
  listRegisteredTargetTypes,
} from "./registry.js";

export {
  executePublish,
  PublishTargetNotFoundError,
  PublishTargetDisabledError,
  PublishPusherNotRegisteredError,
  type ExecutePublishInput,
  type ExecutePublishResult,
} from "./executor.js";

export {
  makeHttpPusher,
  type MakeHttpPusherOptions,
  type HttpMethod,
} from "./http-pusher.js";

export {
  registerDefaultPublishPushers,
  type RegisterDefaultPublishPushersOptions,
  type CredentialFn,
} from "./defaults.js";

// V1+ integration slice — multi-region acceptance criterion #5.
export {
  requiresCrossRegionGovernance,
  wrapWithCrossRegionGovernance,
  type CrossRegionGovernanceInput,
  type CrossRegionWrapOptions,
  type GetSourceRegionKeyFn,
  type GetTargetRegionKeyFn,
} from "./cross-region-governance.js";
