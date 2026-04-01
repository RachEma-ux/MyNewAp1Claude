/**
 * AI Types Module — Public API (Façade)
 *
 * This is the ONLY import path external modules should use for AI Types
 * functionality. All internal files are implementation details.
 *
 * Module boundary:
 *   server/ai-types/index.ts → public API
 *   server/ai-types/*.ts      → internal (do not import directly from outside)
 */

// ── Boot ──────────────────────────────────────────────────────────────────
export { bootAiTypesModule } from "./boot";

// ── DB Operations (catalog entries, versions, bundles, audit, taxonomy) ───
export {
  getCatalogEntries,
  getCatalogEntryById,
  createCatalogEntry,
  updateCatalogEntry,
  approveCatalogEntry,
  deleteCatalogEntry,
  getCatalogEntryVersions,
  getPublishBundles,
  createPublishBundle,
  recallPublishBundle,
  getActiveBundles,
  getBundleByHash,
  getActiveBundleForEntry,
  createCatalogAuditEvent,
  getCatalogAuditEvents,
  createExecutionRun,
  updateExecutionRun,
  getExecutionRunById,
  listExecutionRuns,
  getTaxonomyNodes,
  getTaxonomyTree,
  getTaxonomyChildren,
  getEntryClassifications,
  setEntryClassifications,
  seedTaxonomy,
} from "./db";

// ── Execution Pipeline ────────────────────────────────────────────────────
export {
  resolveCatalogAgentExecutionTarget,
  resolveServiceAgentExecutionTarget,
  executeCatalogChatStream,
  executeServiceAgentStream,
  getExecutionRunForUi,
  catalogExecutionQuerySchema,
  type CatalogAgentExecutionTarget,
  type ServiceAgentExecutionTarget,
  type CatalogExecutionEvent,
  type ReasoningLlmContext,
} from "./execution";

// ── Universal Invoke ──────────────────────────────────────────────────────
export {
  invokeCatalogEntry,
  resolveInvokeTarget,
  type CatalogInvokeInput,
  type CatalogInvokeResolution,
} from "./invoke";

// ── Service Runtime ───────────────────────────────────────────────────────
export {
  isServiceBasedAgent,
  resolveServiceAgent,
  resolveServiceAgentByName,
  checkServiceHealth,
  checkServiceHealthByName,
  type ServiceRuntimeConfig,
  type ServiceRuntimeTarget,
  type ServiceHealthResult,
} from "./service-runtime";

// ── Availability ──────────────────────────────────────────────────────────
export {
  checkCatalogAvailability,
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
  type CatalogAvailabilityInput,
  type CatalogAvailabilityResult,
} from "./availability";

// ── Domain CRUD + Catalog Projection ──────────────────────────────────────
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

// ── Projection Utilities ──────────────────────────────────────────────────
export {
  projectToCatalog,
  refreshCatalogProjection,
  findCatalogEntryBySource,
  linkCatalogToDomain,
} from "./projection";

// ── Import Normalization ──────────────────────────────────────────────────
export {
  normalizeToModel,
  normalizeToLlm,
  resolveProviderId,
  getDomainTarget,
} from "./import-normalizer";

// ── Migration ─────────────────────────────────────────────────────────────
export {
  backfillDomainTables,
  verifyDomainLinks,
} from "./migration";

// ── Types ─────────────────────────────────────────────────────────────────
export type {
  AIEntryType,
  DomainModelData,
  DomainLlmData,
  DomainProviderData,
  ProjectionResult,
  CatalogProjectionInput,
} from "./types";

// ── Ports (for boot wiring only) ──────────────────────────────────────────
export {
  setProviderPort,
  setAgentPort,
  setGovernancePort,
  setProviderDbPort,
  getProviderPort,
  getAgentPort,
  getGovernancePort,
  getProviderDbPort,
} from "./ports";
