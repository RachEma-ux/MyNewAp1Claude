/**
 * Data Analysis — Public types.
 *
 * Re-exported from `./index.ts` so other modules can typecheck against
 * Data Analysis shapes without reaching into private files. Keep this
 * file dependency-free and minimal: only the data structures other
 * modules legitimately need to refer to.
 *
 * Data Analysis owns three frontend subdomains (GraphRAG, Data
 * Acquisition, Data Warehouse). KGRA Agent is a separate RTLM and is
 * intentionally absent from this list.
 */

export type DataAnalysisSubdomain =
  | "graphRag"
  | "dataAcquisition"
  | "dataWarehouse";

export type DataAcquisitionTab =
  | "dashboard"
  | "sources"
  | "runs"
  | "items"
  | "classification"
  | "routing"
  | "processing"
  | "document-intelligence"
  | "canonical-records"
  | "outputs"
  | "settings";
