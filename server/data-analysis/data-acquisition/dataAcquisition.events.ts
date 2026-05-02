/**
 * Data Acquisition — event catalog (subdomain of `dataAnalysis`).
 *
 * Events are emitted only after real state changes via
 * `publishEvent(makeEnvelope({ sourceModule: "dataAnalysis", ... }))`.
 *
 * The `dataAnalysis.dataAcquisition.*` namespace is owned by Data
 * Analysis. Document Intelligence sub-events live under
 * `dataAnalysis.dataAcquisition.document.*`. KGRA / Documents / RAG
 * may subscribe but never mint events under this namespace themselves.
 */

export const DATA_ACQUISITION_EVENTS = {
  // generic acquisition lifecycle
  sourceRegistered: "dataAnalysis.dataAcquisition.sourceRegistered",
  acquisitionStarted: "dataAnalysis.dataAcquisition.acquisitionStarted",
  acquisitionCompleted: "dataAnalysis.dataAcquisition.acquisitionCompleted",
  acquisitionFailed: "dataAnalysis.dataAcquisition.acquisitionFailed",

  // discovery
  itemDiscovered: "dataAnalysis.dataAcquisition.itemDiscovered",

  // classification + routing
  itemClassified: "dataAnalysis.dataAcquisition.itemClassified",
  itemRouted: "dataAnalysis.dataAcquisition.itemRouted",

  // per-pipeline processing
  processingStarted: "dataAnalysis.dataAcquisition.processingStarted",
  processingCompleted: "dataAnalysis.dataAcquisition.processingCompleted",
  processingFailed: "dataAnalysis.dataAcquisition.processingFailed",

  // canonical model + quality
  canonicalRecordCreated:
    "dataAnalysis.dataAcquisition.canonicalRecordCreated",
  qualityValidated: "dataAnalysis.dataAcquisition.qualityValidated",

  // output pipelines
  outputPipelineStarted:
    "dataAnalysis.dataAcquisition.outputPipelineStarted",
  outputPipelineCompleted:
    "dataAnalysis.dataAcquisition.outputPipelineCompleted",
  outputPipelineFailed:
    "dataAnalysis.dataAcquisition.outputPipelineFailed",

  // worker runtime
  workerUnavailable: "dataAnalysis.dataAcquisition.workerUnavailable",
  workerRecovered: "dataAnalysis.dataAcquisition.workerRecovered",

  // document-specific sub-events
  documentParserSelected:
    "dataAnalysis.dataAcquisition.document.parserSelected",
  documentParserFallbackTriggered:
    "dataAnalysis.dataAcquisition.document.parserFallbackTriggered",
  documentReconstructed:
    "dataAnalysis.dataAcquisition.document.reconstructed",
  documentValidated: "dataAnalysis.dataAcquisition.document.validated",
} as const;

export type DataAcquisitionEventName =
  (typeof DATA_ACQUISITION_EVENTS)[keyof typeof DATA_ACQUISITION_EVENTS];

/** Manifest-facing flat list (literal strings — required by check:event-wiring). */
export const DATA_ACQUISITION_EVENT_NAMES: DataAcquisitionEventName[] = [
  "dataAnalysis.dataAcquisition.sourceRegistered",
  "dataAnalysis.dataAcquisition.acquisitionStarted",
  "dataAnalysis.dataAcquisition.acquisitionCompleted",
  "dataAnalysis.dataAcquisition.acquisitionFailed",
  "dataAnalysis.dataAcquisition.itemDiscovered",
  "dataAnalysis.dataAcquisition.itemClassified",
  "dataAnalysis.dataAcquisition.itemRouted",
  "dataAnalysis.dataAcquisition.processingStarted",
  "dataAnalysis.dataAcquisition.processingCompleted",
  "dataAnalysis.dataAcquisition.processingFailed",
  "dataAnalysis.dataAcquisition.canonicalRecordCreated",
  "dataAnalysis.dataAcquisition.qualityValidated",
  "dataAnalysis.dataAcquisition.outputPipelineStarted",
  "dataAnalysis.dataAcquisition.outputPipelineCompleted",
  "dataAnalysis.dataAcquisition.outputPipelineFailed",
  "dataAnalysis.dataAcquisition.workerUnavailable",
  "dataAnalysis.dataAcquisition.workerRecovered",
  "dataAnalysis.dataAcquisition.document.parserSelected",
  "dataAnalysis.dataAcquisition.document.parserFallbackTriggered",
  "dataAnalysis.dataAcquisition.document.reconstructed",
  "dataAnalysis.dataAcquisition.document.validated",
];

/* ── Payload shapes ───────────────────────────────────────────────── */

export interface SourceRegisteredPayload {
  sourceId: number;
  workspaceId: number;
  sourceType: string;
  sourceUri: string;
}

export interface AcquisitionRunPayload {
  runId: number;
  sourceId: number;
  workspaceId: number;
  runType: string;
  itemCount?: number;
  errorMessage?: string;
}

export interface ItemDiscoveredPayload {
  itemId: number;
  runId: number | null;
  sourceId: number;
  itemType: string;
}

export interface ClassificationPayload {
  itemId: number;
  classificationId: number;
  dataType: string;
  mode: string;
  confidence: number;
}

export interface RoutingPayload {
  itemId: number;
  routeId: number;
  selectedPipeline: string;
  selectedProcessor: string;
  fallbackChain: string[];
}

export interface ProcessingPayload {
  itemId: number;
  processingRunId: number;
  pipeline: string;
  processorName: string;
  status: string;
  errorMessage?: string;
}

export interface CanonicalRecordPayload {
  canonicalRecordId: number;
  itemId: number;
  recordType: string;
  confidenceScore: number | null;
}

export interface QualityValidatedPayload {
  itemId: number;
  qualityResultId: number;
  confidenceScore: number;
  requiresReview: boolean;
}

export interface OutputRunPayload {
  outputRunId: number;
  outputType: string;
  status: string;
  itemId?: number | null;
  canonicalRecordId?: number | null;
  errorMessage?: string;
}

export interface WorkerEventPayload {
  url: string;
  message: string;
}

export interface DocumentParserPayload {
  itemId: number;
  parserUsed: string;
  fallback?: boolean;
}

export interface DocumentValidatedPayload {
  itemId: number;
  qualityResultId: number;
  confidenceScore: number;
}
