/**
 * AI Types Domain — Public API
 *
 * This module is the source of truth for AI Types (providers, models, LLMs, agents, bots).
 * Other modules should consume through catalog_entries and runtime APIs,
 * NOT by importing from this module directly.
 *
 * Internal use only: server/catalog-import, server/routers/catalog-manage,
 * server/catalog, server/governance.
 */

// Domain CRUD + catalog projection
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

// Projection utilities
export {
  projectToCatalog,
  refreshCatalogProjection,
  findCatalogEntryBySource,
  linkCatalogToDomain,
} from "./projection";

// Import normalization
export {
  normalizeToModel,
  normalizeToLlm,
  resolveProviderId,
  getDomainTarget,
} from "./import-normalizer";

// Migration
export {
  backfillDomainTables,
  verifyDomainLinks,
} from "./migration";

// Types
export type {
  AIEntryType,
  DomainModelData,
  DomainLlmData,
  DomainProviderData,
  ProjectionResult,
  CatalogProjectionInput,
} from "./types";
