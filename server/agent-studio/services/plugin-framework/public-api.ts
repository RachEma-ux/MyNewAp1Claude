/**
 * Plugin framework public API barrel.
 *
 * Slice 25 of the no-deferral catalogue (2026-05-19). Single entry
 * point for the V2 plugin-framework surface. Internal modules
 * (manifest-registry, future sandbox executor, future lifecycle
 * service) are not exported directly — callers go through this
 * barrel so the boundary is explicit.
 */

export type {
  PluginCapability,
  PluginLifecycleStatus,
  PluginManifest,
  PluginInstallRecord,
  PluginExecutionRequest,
  PluginExecutionResult,
} from "./contracts.js";

export {
  PLUGIN_CAPABILITIES,
  PLUGIN_LIFECYCLE_STATUSES,
  isPluginCapability,
  PluginCapabilityDeniedError,
} from "./contracts.js";

export {
  validatePluginManifest,
  type ManifestValidationOutcome,
  type ValidationContext,
} from "./manifest-registry.js";
