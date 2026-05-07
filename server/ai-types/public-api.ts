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

// Plan v3 Phase 31 (Phase 26.1) — catalog helpers exposed through
// public-api so callers don't need to reach into `ai-types/db.ts`
// directly.
//
// Reads (always safe to re-export):
export {
  getCatalogEntries,
  getCatalogEntryById,
  getCatalogEntryVersions,
  getPublishBundles,
  getActiveBundles,
  getBundleByHash,
  getActiveBundleForEntry,
  getCatalogAuditEvents,
  getExecutionRunById,
  listExecutionRuns,
  getTaxonomyNodes,
  getTaxonomyTree,
  getTaxonomyChildren,
  getEntryClassifications,
} from "./db";

// Intra-platform write helpers. New cross-module callers should prefer
// `gatewayCall("aiTypes.catalog.register", ...)` (see
// `LEGACY_PATH_DEPRECATION.md`) so the receipt + canonical audit chain
// is preserved. These are exposed here for the in-process writers that
// predate the gateway pattern and would require a behavior-preserving
// refactor to migrate (e.g., the `<domain>.importToCatalog` mutations
// emit custom audit event shapes that downstream consumers filter on).
// The Phase-47 deprecation markers + first-call console.warn already
// steer NEW callers to the gateway path; cleaning up the in-process
// callers is a follow-up phase explicitly scoped as behavior preservation.
export {
  createCatalogEntry,
  updateCatalogEntry,
  approveCatalogEntry,
  setEntryClassifications,
  createCatalogAuditEvent,
  createPublishBundle,
  recallPublishBundle,
  createExecutionRun,
  updateExecutionRun,
} from "./db";

// Re-export the drizzle-schema row + insert types for callers using the
// helpers above. Keeps caller imports tight (single `from "../ai-types/public-api"`)
// instead of forcing a parallel `from "../../drizzle/schema"` import.
export type {
  CatalogEntry,
  InsertCatalogEntry,
  CatalogEntryVersion,
  InsertCatalogEntryVersion,
  PublishBundle,
  InsertPublishBundle,
  CatalogAuditEvent,
  InsertCatalogAuditEvent,
  ExecutionRun,
  InsertExecutionRun,
  TaxonomyNode,
  InsertTaxonomyNode,
  CatalogEntryClassification,
} from "../../drizzle/schema";
