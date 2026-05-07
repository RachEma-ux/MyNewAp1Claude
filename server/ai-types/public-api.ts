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

// Plan v3 Phase 31 (Phase 26.1) — read-only catalog helpers exposed
// through public-api so callers don't need to reach into
// `ai-types/db.ts` directly. Writes are NOT re-exported: any code that
// needs to mutate catalog state must go through a gateway action
// (`aiTypes.catalog.register`, `aiTypes.catalog.publish`, etc.) so the
// receipt + audit chain is consistent. The boundary lint
// (`scripts/check-ai-types-public-api-boundary.ts`) enforces this.
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
