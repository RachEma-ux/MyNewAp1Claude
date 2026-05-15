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
  PUBLISH_TARGET_TYPE_METADATA,
  getPublishTargetTypeMetadata,
  isPublishTargetType,
  isGovernanceDecision,
} from "./types.js";
export type { PublishTargetTypeMetadata } from "./types.js";

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

// V1+ integration slice — agsApprovalSteps adapter for 19-γ gate.
export {
  decideGovernanceFromApprovalSteps,
  createApprovalStepsGovernanceGate,
  type ApprovalStepSnapshot,
  type ResolvePublishRequestIdFn,
  type CreateApprovalStepsGovernanceGateOptions,
} from "./governance-gate-approval-steps.js";

// V1+ AS-2 — default gate registry consulted by the executor when
// callers do not supply an explicit `governanceGate`.
export {
  installDefaultGovernanceGate,
  getDefaultGovernanceGate,
  hasDefaultGovernanceGate,
  __resetDefaultGovernanceGateForTests,
} from "./default-governance-gate.js";

// V1+ AS-3 — generic gate composer (strictest decision wins;
// rejected short-circuits).
export { composeGovernanceGates } from "./compose-governance-gates.js";

// V1+ AS-4 — payload-based publishRequestId resolver +
// env-flag-gated boot installer for the default gate.
export {
  parsePublishRequestIdFromBody,
  resolvePublishRequestIdFromPayload,
} from "./payload-publish-request-id-resolver.js";
export {
  maybeInstallDefaultGovernanceGate,
  PUBLISH_GOVERNANCE_GATE_ENV_VAR,
  APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE,
  type DefaultGovernanceGateMode,
  type MaybeInstallDefaultGovernanceGateOptions,
  type MaybeInstallDefaultGovernanceGateResult,
} from "./install-default-governance-gate.js";

// V1+ Phase 19 admin (PR-V1-186): operator-facing read-only surface.
// PR-V1-187: + setEnabled mutation.
// PR-V1-188: + per-target execution summary aggregate.
// PR-V1-189: + single-execution detail surface (with details JSON).
// PR-V1-193: + single-target detail with config JSON.
export {
  listPublishTargets,
  listRecentPublishExecutions,
  setPublishTargetEnabled,
  getPublishTargetExecutionSummaries,
  getPublishExecutionById,
  getPublishTargetById,
  PublishTargetNotFoundForToggleError,
  type PublishTargetSummary,
  type PublishExecutionRow,
  type PublishTargetExecutionSummary,
  type PublishExecutionDetail,
  type PublishTargetWithConfig,
} from "./admin-queries.js";
export { publishTargetsAdminRouter } from "./admin-router.js";
