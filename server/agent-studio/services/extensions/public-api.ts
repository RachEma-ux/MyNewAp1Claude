/**
 * Extension framework — public API barrel.
 *
 * V1+ Phase 18-α first slice. The runtime entry point
 * (`invokeFromExtension`) is the ONLY path extensions reach the
 * MCP dispatcher (acceptance criterion #5; source-scan tested).
 */

export type {
  ExtensionGovernanceStatus,
  ExtensionCapabilityLane,
  ExtensionCapabilityCheck,
  ExtensionManifest,
  ExtensionRecord,
  InstallExtensionInput,
  ApproveExtensionInput,
  CapabilityCheckOutcome,
  InvokeFromExtensionInput,
} from "./contracts.js";

export {
  EXTENSION_GOVERNANCE_STATUSES,
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_CAPABILITY_CHECKS,
  isExtensionGovernanceStatus,
  isExtensionCapabilityLane,
  ExtensionNotFoundError,
  ExtensionStatusInvalidError,
  ExtensionLaneInvalidError,
} from "./contracts.js";

export { evaluateCapability } from "./capability-check.js";

export {
  AsdbUnavailableError,
  installExtension,
  approveExtension,
  setExtensionStatus,
  getExtensionById,
  listExtensionsByWorkspace,
} from "./manifest.js";

export {
  invokeFromExtension,
  type InvokeFromExtensionOutcome,
  type InvokeFromExtensionOptions,
} from "./runtime.js";

// V1+ Phase 18-β: extension lane hook registry.
export {
  registerLaneHook,
  getLaneHook,
  listRegisteredLaneHookLanes,
  type LaneHookFn,
  type LaneHookOutcome,
} from "./lane-hooks.js";
