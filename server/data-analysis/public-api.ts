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
