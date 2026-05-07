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
  deleteCatalogEntry,
  setEntryClassifications,
  createCatalogAuditEvent,
  createPublishBundle,
  recallPublishBundle,
  createExecutionRun,
  updateExecutionRun,
  seedTaxonomy,
} from "./db";

// Service-runtime helpers — resolve a service-based agent target from the
// catalog and probe its health. Reads only (no DB writes).
export {
  resolveServiceAgentByName,
  resolveServiceAgent,
  checkServiceHealth,
  checkServiceHealthByName,
  isServiceBasedAgent,
} from "./service-runtime";
export type {
  ServiceRuntimeConfig,
  ServiceRuntimeTarget,
  ServiceHealthResult,
} from "./service-runtime";

// Domain-projection writers (intra-platform). Same caveat as the catalog
// write helpers above — new cross-module callers should prefer the
// gateway register action; these are surfaced for the legacy
// catalog-import + catalog-manage flows that build domain rows + their
// catalog projections in one transaction.
export {
  createModel,
  updateModel,
  getModelById,
  createLlm,
  updateLlm,
  getLlmById,
  createProviderWithProjection,
  resolveDomainEntity,
  resolveProviderFromCatalogEntry,
} from "./service";

// Catalog-projection helpers (link / find). Used by catalog-import and
// admin paths that need to bind a domain row to a catalog entry.
export {
  buildCatalogFields,
  projectToCatalog,
  refreshCatalogProjection,
  findCatalogEntryBySource,
  linkCatalogToDomain,
} from "./projection";

// Import normalization — pure transforms (no DB writes), used by
// catalog-import to turn a CSV row into a domain payload.
export {
  resolveProviderId,
  normalizeToModel,
  normalizeToLlm,
  getDomainTarget,
} from "./import-normalizer";
export type { ImportRowLike } from "./import-normalizer";

// Execution surface — agent-execution target resolution + catalog
// chat-stream + execution event types. Used by the legacy agents/* and
// routers/conversations chat paths plus the catalog registry.
export {
  resolveCatalogAgentExecutionTarget,
  resolveServiceAgentExecutionTarget,
  catalogExecutionQuerySchema,
  executeCatalogChatStream,
  executeServiceAgentStream,
  getExecutionRunForUi,
} from "./execution";
export type {
  CatalogAgentExecutionTarget,
  ServiceAgentExecutionTarget,
  CatalogExecutionEvent,
  ReasoningLlmContext,
} from "./execution";

// Invoke surface — generic catalog-entry invocation + target resolution
// (delegates to the execution surface above).
export {
  resolveInvokeTarget,
  invokeCatalogEntry,
} from "./invoke";
export type {
  CatalogInvokeInput,
  CatalogInvokeResolution,
} from "./invoke";

// Module boot. The platform layer calls this from `_core/index.ts` at
// startup; sibling modules should not.
export { bootAiTypesModule } from "./boot";

// Module router. The platform layer mounts this from
// `server/platform/modules/module-routers.ts` at app boot; sibling
// modules should not import it directly.
export { aiTypesRouter } from "./router";

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
