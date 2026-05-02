/**
 * Data Analysis — Public contract.
 *
 * Other modules import from `@/modules/data-analysis` only. Anything
 * imported via `@/modules/data-analysis/<subdir>/*` is a boundary
 * violation enforced by `check:module-api-boundaries`.
 *
 * Allowed exports:
 *   - public types (Data Analysis shapes referenced elsewhere)
 *   - canonical route builders (so callers don't hardcode
 *     "/data-analysis/...")
 *
 * Forbidden exports:
 *   - dataAnalysisRouter (backend), service functions
 *   - private hooks, pages, or components
 *   - the manifest itself (the platform registry consumes it via
 *     `client.ts`; no consumer should reach for it directly)
 *   - KGRA Agent exports — KGRA is a separate RTLM
 */

export type {
  DataAnalysisSubdomain,
  DataAcquisitionTab,
} from "./types";

/**
 * Canonical URL builders for Data Analysis. Use these instead of
 * hardcoding "/data-analysis/graphrag" etc. in another module's UI —
 * `check:cross-module-links` flags hardcoded links when a public
 * builder exists.
 */
export const DataAnalysisRoutes = {
  root: () => "/data-analysis",
  graphRag: () => "/data-analysis/graphrag",
  dataAcquisition: () => "/data-analysis/data-acquisition",
  dataAcquisitionSources: () => "/data-analysis/data-acquisition/sources",
  dataAcquisitionRuns: () => "/data-analysis/data-acquisition/runs",
  dataAcquisitionItems: () => "/data-analysis/data-acquisition/items",
  dataAcquisitionClassification: () =>
    "/data-analysis/data-acquisition/classification",
  dataAcquisitionRouting: () => "/data-analysis/data-acquisition/routing",
  dataAcquisitionProcessing: () => "/data-analysis/data-acquisition/processing",
  dataAcquisitionDocumentIntelligence: () =>
    "/data-analysis/data-acquisition/document-intelligence",
  dataAcquisitionCanonicalRecords: () =>
    "/data-analysis/data-acquisition/canonical-records",
  dataAcquisitionOutputs: () => "/data-analysis/data-acquisition/outputs",
  dataAcquisitionSettings: () => "/data-analysis/data-acquisition/settings",
  dataWarehouse: () => "/data-analysis/data-warehouse",
} as const;
