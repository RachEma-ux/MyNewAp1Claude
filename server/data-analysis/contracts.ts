/**
 * Data Analysis — Public Contracts
 *
 * Stable types exposed across module boundaries. Other modules and
 * the UI consume these via `public-api.ts`. Internal repositories
 * and services may use richer Drizzle types directly.
 */

export type GraphRagQueryMethod = "basic" | "local" | "global" | "drift";

/** Worker runtime status — used by UI to render degraded banner. */
export interface GraphRagWorkerStatus {
  healthy: boolean;
  url: string;
  /** Human-readable reason — always populated, even on healthy. */
  message: string;
  /** Last time the worker was probed (epoch ms). */
  lastCheckedAt?: number;
}

export interface DataAnalysisGraphRagSourceSummary {
  id: number;
  moduleSlug: string;
  datasetKey: string;
  displayName: string;
  description?: string | null;
  enabled: boolean;
}

export interface DataAnalysisGraphRagSyncRunSummary {
  id: number;
  sourceId: number;
  status: "running" | "completed" | "failed";
  documentCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface DataAnalysisGraphRagIndexRunSummary {
  id: number;
  sourceId: number;
  syncRunId: number | null;
  status: "running" | "completed" | "failed";
  entityCount: number;
  relationshipCount: number;
  errorMessage: string | null;
}

export interface DataAnalysisGraphRagQueryRunSummary {
  id: number;
  sourceId: number;
  method: GraphRagQueryMethod;
  question: string;
  status: "running" | "completed" | "failed";
  errorMessage: string | null;
}

/** Worker contract surface — declared as a runtime port. */
export interface GraphRagWorkerContract {
  /** Default URL when env unset. */
  defaultUrl: string;
  /** Env var the runtime reads. */
  envVar: string;
  /** Health endpoint (relative). */
  healthPath: string;
  /** Index submission endpoint. */
  indexPath: string;
  /** Query submission endpoint. */
  queryPath: string;
  /** Probe timeout (ms). */
  timeoutMs: number;
}
