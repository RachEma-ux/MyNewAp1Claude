/**
 * Data Analysis — Event Catalog
 *
 * All Data Analysis events emit through `publishEvent(makeEnvelope({...}))`
 * with `sourceModule: "dataAnalysis"`. The GraphRAG subdomain owns the
 * `dataAnalysis.graphRag.*` namespace; future Data Analysis subdomains
 * (Data Warehouse, OmniRAG facade, etc.) extend this catalog rather
 * than minting independent event roots.
 *
 * Events declare *transitions* — a sync that fails emits `syncFailed`,
 * never both `syncCompleted` and `syncFailed`. The router/service layer
 * is responsible for emitting after the actual state change.
 */

export const DATA_ANALYSIS_EVENTS = {
  // GraphRAG subdomain — source registration
  graphRagSourceRegistered: "dataAnalysis.graphRag.sourceRegistered",
  // GraphRAG subdomain — sync lifecycle
  graphRagSyncStarted: "dataAnalysis.graphRag.syncStarted",
  graphRagSyncCompleted: "dataAnalysis.graphRag.syncCompleted",
  graphRagSyncFailed: "dataAnalysis.graphRag.syncFailed",
  // GraphRAG subdomain — index lifecycle
  graphRagIndexStarted: "dataAnalysis.graphRag.indexStarted",
  graphRagIndexCompleted: "dataAnalysis.graphRag.indexCompleted",
  graphRagIndexFailed: "dataAnalysis.graphRag.indexFailed",
  // GraphRAG subdomain — query lifecycle
  graphRagQueryStarted: "dataAnalysis.graphRag.queryStarted",
  graphRagQueryCompleted: "dataAnalysis.graphRag.queryCompleted",
  graphRagQueryFailed: "dataAnalysis.graphRag.queryFailed",
  // GraphRAG subdomain — worker runtime
  graphRagWorkerUnavailable: "dataAnalysis.graphRag.workerUnavailable",
  graphRagWorkerRecovered: "dataAnalysis.graphRag.workerRecovered",
} as const;

export type DataAnalysisEventName =
  (typeof DATA_ANALYSIS_EVENTS)[keyof typeof DATA_ANALYSIS_EVENTS];

/** Manifest-facing flat list (literal strings — required by check:event-wiring). */
export const DATA_ANALYSIS_EVENT_NAMES: DataAnalysisEventName[] = [
  "dataAnalysis.graphRag.sourceRegistered",
  "dataAnalysis.graphRag.syncStarted",
  "dataAnalysis.graphRag.syncCompleted",
  "dataAnalysis.graphRag.syncFailed",
  "dataAnalysis.graphRag.indexStarted",
  "dataAnalysis.graphRag.indexCompleted",
  "dataAnalysis.graphRag.indexFailed",
  "dataAnalysis.graphRag.queryStarted",
  "dataAnalysis.graphRag.queryCompleted",
  "dataAnalysis.graphRag.queryFailed",
  "dataAnalysis.graphRag.workerUnavailable",
  "dataAnalysis.graphRag.workerRecovered",
];

// ── Payload types ──────────────────────────────────────────────────────────

export interface GraphRagSourceRegisteredPayload {
  sourceId: number;
  moduleSlug: string;
  datasetKey: string;
}

export interface GraphRagSyncEventPayload {
  sourceId: number;
  syncRunId: number;
  documentCount?: number;
  errorMessage?: string;
}

export interface GraphRagIndexEventPayload {
  sourceId: number;
  indexRunId: number;
  syncRunId?: number | null;
  entityCount?: number;
  relationshipCount?: number;
  errorMessage?: string;
}

export interface GraphRagQueryEventPayload {
  sourceId: number;
  queryRunId: number;
  method: string;
  question: string;
  errorMessage?: string;
}

export interface GraphRagWorkerEventPayload {
  url: string;
  message: string;
}
