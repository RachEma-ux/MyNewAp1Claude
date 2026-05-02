/**
 * Data Acquisition — public contracts.
 *
 * Stable types other modules / the UI consume via `public-api`.
 * Internal richer Drizzle types stay inside the subdomain.
 */

import type {
  CanonicalRecordType,
  ConnectorStatus,
  OutputType,
  Pipeline,
  RunStatus,
  SourceType,
} from "./dataAcquisition.constants";

/* ------------------------------------------------------------------ */
/*  Worker status — drives UI degraded banner                          */
/* ------------------------------------------------------------------ */

export interface DataAcquisitionWorkerStatus {
  healthy: boolean;
  url: string;
  message: string;
  lastCheckedAt?: number;
  capabilities?: string[];
}

export interface DataAcquisitionWorkerContract {
  defaultUrl: string;
  envVar: string;
  healthPath: string;
  classifyPath: string;
  routePath: string;
  parsePath: string;
  ocrPath: string;
  reconstructPath: string;
  validatePath: string;
  outputPath: string;
  capabilities: string[];
  timeoutMs: number;
}

/* ------------------------------------------------------------------ */
/*  Source / run / item summaries                                      */
/* ------------------------------------------------------------------ */

export interface DataAcquisitionSourceSummary {
  id: number;
  workspaceId: number;
  sourceType: SourceType;
  sourceUri: string;
  displayName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataAcquisitionRunSummary {
  id: number;
  workspaceId: number;
  sourceId: number;
  runType: string;
  status: RunStatus;
  itemCount: number;
  processedCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface DataAcquisitionItemSummary {
  id: number;
  sourceId: number;
  runId: number | null;
  itemType: string;
  sourceUri: string;
  status: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface DataAcquisitionClassificationSummary {
  id: number;
  itemId: number;
  dataType: string;
  mode: Pipeline;
  recommendedProcessor: string | null;
  confidence: number;
  classifierVersion: string;
}

export interface DataAcquisitionRouteSummary {
  id: number;
  itemId: number;
  selectedPipeline: Pipeline;
  selectedProcessor: string;
  fallbackChain: string[];
  strategy: string;
}

export interface DataAcquisitionProcessingRunSummary {
  id: number;
  itemId: number;
  pipeline: string;
  processorName: string;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  outputLocation: string | null;
  confidence: number | null;
}

export interface DataAcquisitionOutputRunSummary {
  id: number;
  workspaceId: number;
  outputType: OutputType;
  status: RunStatus;
  itemId: number | null;
  canonicalRecordId: number | null;
  targetRef: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Canonical models                                                   */
/* ------------------------------------------------------------------ */

export interface CanonicalAcquisitionRecord {
  id: string;
  workspaceId: number;
  sourceId: string;
  itemId: string;
  recordType:
    | "document"
    | "sensor"
    | "stream_event"
    | "api_record"
    | "db_record"
    | "web_page"
    | "git_object"
    | "form_submission"
    | "webhook_event"
    | "media";
  metadata: Record<string, unknown>;
  content: unknown;
  quality: {
    confidenceScore: number;
    issues: Array<{
      code: string;
      severity: "low" | "medium" | "high";
      message: string;
    }>;
    requiresReview: boolean;
  };
  provenance: {
    sourceUri: string;
    acquiredAt: string;
    pipelineVersion: string;
    processor: string;
  };
}

export interface CanonicalDocumentModel {
  document: {
    id: string;
    metadata: Record<string, unknown>;
    sections: Array<{
      title?: string;
      content: unknown[];
      tables: unknown[];
      figures: unknown[];
    }>;
  };
  graph?: {
    nodes: unknown[];
    edges: unknown[];
  };
}

/* ------------------------------------------------------------------ */
/*  Connector contract                                                 */
/* ------------------------------------------------------------------ */

export interface AcquisitionConnectorRuntime {
  key: string;
  sourceTypes: SourceType[];
  displayName: string;
  status: ConnectorStatus;
  message: string;
  envVars?: string[];
}

/* ------------------------------------------------------------------ */
/*  Dashboard summary                                                  */
/* ------------------------------------------------------------------ */

export interface DataAcquisitionSummary {
  generatedAt: string;
  worker: DataAcquisitionWorkerStatus;
  sources: {
    registered: number;
    active: number;
    byType: Record<SourceType, number>;
  };
  runs: {
    total: number;
    byStatus: Record<RunStatus, number>;
  };
  items: {
    total: number;
    discovered: number;
    processed: number;
  };
  processing: {
    runs: number;
    failed: number;
    averageConfidence: number;
  };
  canonicalRecords: {
    total: number;
    byType: Record<CanonicalRecordType, number>;
  };
  outputs: {
    total: number;
    byType: Record<OutputType, number>;
  };
  governance: {
    denials: number;
  };
}
