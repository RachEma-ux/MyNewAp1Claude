/**
 * Data Analysis — Runtime Ports / External Endpoints
 *
 * Data Analysis owns the GraphRAG worker contract (Python service on
 * `:8484` by default). The worker is an external runtime dependency,
 * not a hard requirement — when it is not running, the module reports
 * `degraded` and the UI renders a clean worker-unavailable state.
 *
 * This file is the single source of truth for the worker endpoint
 * envelope. `manifest.ports.runtimeEndpoints` cites it; the AWI/
 * Digital HQ port-registry consumer reads from here.
 */

import type { GraphRagWorkerContract } from "./contracts";

/** Default worker URL — external Python service. */
export const GRAPHRAG_WORKER_DEFAULT_URL = "http://localhost:8484";

/** Env var the runtime reads. */
export const GRAPHRAG_WORKER_ENV = "GRAPHRAG_WORKER_URL";

/** Full worker contract — declared as a runtime port. */
export const graphRagWorkerContract: GraphRagWorkerContract = {
  defaultUrl: GRAPHRAG_WORKER_DEFAULT_URL,
  envVar: GRAPHRAG_WORKER_ENV,
  healthPath: "/health",
  indexPath: "/index",
  queryPath: "/query",
  timeoutMs: 5000,
};

/**
 * Resolve the effective worker URL at runtime. Pure read of env;
 * no probe is performed here.
 */
export function getGraphRagWorkerUrl(): string {
  return process.env[GRAPHRAG_WORKER_ENV] || GRAPHRAG_WORKER_DEFAULT_URL;
}

/** Manifest-facing port descriptor list. */
export const DATA_ANALYSIS_PROVIDED_PORTS = [
  "dataAnalysis.read",
  "dataAnalysis.graphRag.read",
] as const;

/** Runtime endpoints exposed by Data Analysis (external dependencies). */
export const DATA_ANALYSIS_RUNTIME_ENDPOINTS = [
  {
    key: "graphRagWorker",
    env: GRAPHRAG_WORKER_ENV,
    defaultUrl: GRAPHRAG_WORKER_DEFAULT_URL,
    mode: "external" as const,
    required: false,
    description:
      "Python GraphRAG worker (Microsoft graphrag library). Required for buildIndex / query happy path; missing worker keeps Data Analysis in degraded state.",
  },
] as const;
