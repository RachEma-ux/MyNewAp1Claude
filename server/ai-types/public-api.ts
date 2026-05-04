/**
 * AI Types — Public API
 *
 * AI Types is platform-core: its catalog is the cross-module
 * coordination surface. This file is the only allowed import surface.
 */
export * from "./types";
export * from "./contracts";
export * from "./events";
export * from "./ports";
export { aiTypesManifest } from "./manifest";

// Plan v3 Phase 7 — provider/model availability contract.
// The fn lives behind the gateway action `aiTypes.providerModels.listAvailable`;
// types are exported here so cross-module callers can reference the
// shape without reaching into ai-types internals.
export {
  listAvailableProviderModels,
  FORBIDDEN_AVAILABILITY_KEYS,
} from "./provider-models-availability";
export type {
  ListAvailableProviderModelsInput,
  AvailableProviderModel,
  ProviderModelGovernanceStatus,
  ProviderModelRestrictions,
} from "./provider-models-availability";
