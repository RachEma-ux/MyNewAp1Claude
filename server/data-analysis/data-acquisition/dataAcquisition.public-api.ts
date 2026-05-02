/**
 * Data Acquisition — public-API barrel.
 *
 * Other modules and the UI consume this module through:
 *   - Module Gateway actions registered in `dataAnalysisManifest.boot`
 *     (see `server/data-analysis/manifest.ts`).
 *   - Event subscriptions on `dataAnalysis.dataAcquisition.*`.
 *
 * This barrel exposes the stable contract types and the worker
 * status helper for in-process code that wants to read state without
 * going through the gateway.
 */

export {
  DATA_ACQUISITION_EVENTS,
  DATA_ACQUISITION_EVENT_NAMES,
} from "./dataAcquisition.events";
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
} from "./dataAcquisition.contracts";
export {
  DATA_ACQUISITION_OWNED_TABLES,
  DATA_ACQUISITION_WORKER_DEFAULT_URL,
  DATA_ACQUISITION_WORKER_ENV,
  DATA_ACQUISITION_PIPELINE_VERSION,
} from "./dataAcquisition.constants";
export {
  dataAcquisitionWorkerContract,
  getDataAcquisitionWorkerStatus,
  getDataAcquisitionWorkerUrl,
} from "./dataAcquisition.worker";
