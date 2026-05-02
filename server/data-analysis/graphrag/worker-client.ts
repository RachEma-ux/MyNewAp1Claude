/**
 * GraphRAG Worker Client
 *
 * Communicates with the Python GraphRAG worker service.
 * The worker handles actual GraphRAG indexing and querying via
 * the Microsoft GraphRAG library.
 *
 * Architecture:
 *   Node service → HTTP/IPC → Python worker → graphrag library
 *
 * If the worker is not available, operations return graceful
 * failure responses with truthful status reporting.
 */

import type {
  WorkerIndexRequest,
  WorkerIndexResult,
  WorkerQueryRequest,
  WorkerQueryResult,
  GraphRagWorkerSettings,
  DEFAULT_WORKER_SETTINGS,
} from "./types";

const WORKER_BASE_URL =
  process.env.GRAPHRAG_WORKER_URL || "http://localhost:8484";

let workerHealthy = false;
let lastHealthCheck = 0;
let lastEmittedHealthy: boolean | null = null;
const HEALTH_CHECK_INTERVAL = 30000; // 30s

/**
 * Best-effort emission of worker availability transitions. We import
 * lazily to avoid a hard dep cycle (events.ts → manifest.ts → worker).
 * Failure to emit must never alter the returned health value.
 */
async function emitWorkerTransition(currentHealthy: boolean): Promise<void> {
  if (lastEmittedHealthy === currentHealthy) return;
  lastEmittedHealthy = currentHealthy;
  try {
    const [{ publishEvent, makeEnvelope }, { DATA_ANALYSIS_EVENTS }] =
      await Promise.all([
        import("../../platform/events"),
        import("../events"),
      ]);
    await publishEvent(
      makeEnvelope({
        eventType: currentHealthy
          ? DATA_ANALYSIS_EVENTS.graphRagWorkerRecovered
          : DATA_ANALYSIS_EVENTS.graphRagWorkerUnavailable,
        sourceModule: "dataAnalysis",
        payload: {
          url: WORKER_BASE_URL,
          message: currentHealthy
            ? "GraphRAG worker is reachable."
            : "GraphRAG worker is not available.",
        },
      }),
    );
  } catch {
    /* event-bus failure must not affect health probe */
  }
}

/**
 * Check if the Python worker is reachable.
 */
export async function checkWorkerHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return workerHealthy;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${WORKER_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    workerHealthy = res.ok;
  } catch {
    workerHealthy = false;
  }

  lastHealthCheck = now;
  void emitWorkerTransition(workerHealthy);
  return workerHealthy;
}

/**
 * Submit an index job to the worker.
 */
export async function submitIndexJob(
  req: WorkerIndexRequest
): Promise<WorkerIndexResult> {
  const healthy = await checkWorkerHealth();
  if (!healthy) {
    return {
      success: false,
      entityCount: 0,
      relationshipCount: 0,
      communityCount: 0,
      tokenUsage: 0,
      artifactPath: "",
      error:
        "GraphRAG worker is not available. Ensure the Python worker service " +
        "is running at " +
        WORKER_BASE_URL,
    };
  }

  try {
    const res = await fetch(`${WORKER_BASE_URL}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        success: false,
        entityCount: 0,
        relationshipCount: 0,
        communityCount: 0,
        tokenUsage: 0,
        artifactPath: "",
        error: `Worker returned ${res.status}: ${body}`,
      };
    }

    return (await res.json()) as WorkerIndexResult;
  } catch (err: any) {
    return {
      success: false,
      entityCount: 0,
      relationshipCount: 0,
      communityCount: 0,
      tokenUsage: 0,
      artifactPath: "",
      error: `Worker communication error: ${err.message}`,
    };
  }
}

/**
 * Submit a query job to the worker.
 */
export async function submitQueryJob(
  req: WorkerQueryRequest
): Promise<WorkerQueryResult> {
  const healthy = await checkWorkerHealth();
  if (!healthy) {
    return {
      success: false,
      answer: "",
      context: {},
      tokenUsage: 0,
      error:
        "GraphRAG worker is not available. Ensure the Python worker service " +
        "is running at " +
        WORKER_BASE_URL,
    };
  }

  try {
    const res = await fetch(`${WORKER_BASE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        success: false,
        answer: "",
        context: {},
        tokenUsage: 0,
        error: `Worker returned ${res.status}: ${body}`,
      };
    }

    return (await res.json()) as WorkerQueryResult;
  } catch (err: any) {
    return {
      success: false,
      answer: "",
      context: {},
      tokenUsage: 0,
      error: `Worker communication error: ${err.message}`,
    };
  }
}

/**
 * Generate GraphRAG settings YAML content for a workspace.
 */
export function generateSettingsYaml(
  settings: GraphRagWorkerSettings
): string {
  return `
llm:
  api_key: \${GRAPHRAG_API_KEY}
  model: ${settings.llmModel}
  max_retries: 3

embeddings:
  llm:
    api_key: \${GRAPHRAG_API_KEY}
    model: ${settings.embeddingModel}

chunks:
  size: ${settings.chunkSize}
  overlap: ${settings.chunkOverlap}

entity_extraction:
  max_gleanings: ${settings.maxGleanings}

community_reports:
  max_length: 2000

claim_extraction:
  enabled: false

cluster_graph:
  max_cluster_size: 10

local_search:
  max_tokens: 12000
  community_level: ${settings.communityLevel}

global_search:
  max_tokens: 12000
  community_level: ${settings.communityLevel}
`.trim();
}
