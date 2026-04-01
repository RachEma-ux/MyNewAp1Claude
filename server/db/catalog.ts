/**
 * BACKWARD COMPATIBILITY SHIM
 *
 * The canonical catalog DB operations now live in server/ai-types/db.ts.
 * This file re-exports everything so existing imports from "../db/catalog"
 * or "../db" continue to work without changes.
 *
 * New code should import from "server/ai-types/db" directly.
 */
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
} from "../ai-types/db";
