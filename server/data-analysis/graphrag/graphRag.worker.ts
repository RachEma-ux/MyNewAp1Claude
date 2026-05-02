/**
 * Data Analysis — GraphRAG Worker Status (canonical, module-owned)
 *
 * Thin wrapper that gives the Data Analysis manifest a stable, typed
 * surface for the worker contract. The actual HTTP probe lives in
 * `worker-client.ts` (legacy filename, kept for compatibility); this
 * file is the canonical entrypoint other Data Analysis code should
 * call so that future migrations to a different transport (gRPC, IPC,
 * embedded subprocess) only need to change one place.
 */

import {
  graphRagWorkerContract,
  getGraphRagWorkerUrl,
} from "../ports";
import type { GraphRagWorkerStatus } from "../contracts";
import { checkWorkerHealth } from "./worker-client";

/**
 * Probe the GraphRAG worker and return a normalized status object.
 *
 * Contract:
 * - Never throws. Worker unreachable returns `healthy: false` with a
 *   readable message; the caller (UI / health probe) decides how to
 *   surface it.
 * - The `message` field is always populated so the UI never has to
 *   construct a fallback string.
 */
export async function getGraphRagWorkerStatus(): Promise<GraphRagWorkerStatus> {
  const url = getGraphRagWorkerUrl();
  let healthy = false;
  try {
    healthy = await checkWorkerHealth();
  } catch {
    healthy = false;
  }
  return {
    healthy,
    url,
    message: healthy
      ? "GraphRAG worker is reachable."
      : "GraphRAG worker is not available. Start the Python worker service to enable indexing and querying.",
    lastCheckedAt: Date.now(),
  };
}

export { graphRagWorkerContract };
