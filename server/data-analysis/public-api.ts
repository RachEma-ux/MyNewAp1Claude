/**
 * Data Analysis — Public API barrel
 *
 * Single import point for cross-module consumers (always via the
 * Module Gateway in production code; this barrel exists so checks
 * and tests have a stable surface to inspect).
 */

export { dataAnalysisManifest } from "./manifest";
export {
  DATA_ANALYSIS_EVENTS,
  DATA_ANALYSIS_EVENT_NAMES,
  type DataAnalysisEventName,
} from "./events";
export {
  DATA_ANALYSIS_HANDOFFS,
  type DataAnalysisHandoffType,
} from "./handoffs";
export {
  DATA_ANALYSIS_PROVIDED_PORTS,
  DATA_ANALYSIS_RUNTIME_ENDPOINTS,
  graphRagWorkerContract,
  getGraphRagWorkerUrl,
  GRAPHRAG_WORKER_DEFAULT_URL,
  GRAPHRAG_WORKER_ENV,
} from "./ports";
export {
  type GraphRagQueryMethod,
  type GraphRagWorkerStatus,
  type GraphRagWorkerContract,
  type DataAnalysisGraphRagSourceSummary,
  type DataAnalysisGraphRagSyncRunSummary,
  type DataAnalysisGraphRagIndexRunSummary,
  type DataAnalysisGraphRagQueryRunSummary,
} from "./contracts";
export {
  getDataAnalysisDb,
  getDataAnalysisDbMode,
} from "./connection";
export { getGraphRagWorkerStatus } from "./graphrag/graphRag.worker";

// ── Data Acquisition subdomain ─────────────────────────────────────
export {
  DATA_ACQUISITION_EVENTS,
  DATA_ACQUISITION_EVENT_NAMES,
  type DataAcquisitionEventName,
} from "./data-acquisition/dataAcquisition.events";
export {
  DATA_ACQUISITION_OWNED_TABLES,
  DATA_ACQUISITION_WORKER_DEFAULT_URL,
  DATA_ACQUISITION_WORKER_ENV,
} from "./data-acquisition/dataAcquisition.constants";
export {
  dataAcquisitionWorkerContract,
  getDataAcquisitionWorkerStatus,
  getDataAcquisitionWorkerUrl,
} from "./data-acquisition/dataAcquisition.worker";
export type {
  DataAcquisitionWorkerStatus,
  DataAcquisitionWorkerContract,
  DataAcquisitionSourceSummary,
  DataAcquisitionRunSummary,
  DataAcquisitionItemSummary,
  DataAcquisitionClassificationSummary,
  DataAcquisitionRouteSummary,
  DataAcquisitionProcessingRunSummary,
  DataAcquisitionOutputRunSummary,
  CanonicalAcquisitionRecord,
  CanonicalDocumentModel,
  AcquisitionConnectorRuntime,
  DataAcquisitionSummary,
} from "./data-acquisition/dataAcquisition.contracts";
