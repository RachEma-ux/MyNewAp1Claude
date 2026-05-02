/**
 * Data Analysis — Health Probe
 *
 * Reports both the Data Analysis-owned DB connection and the GraphRAG
 * worker runtime endpoint as composite signals. The GraphRAG worker is
 * declared as a Data Analysis runtime dependency (see manifest.ports);
 * a missing worker keeps the module in a `degraded` state, never a
 * hard failure — this is the contract that lets the UI render a clean
 * worker-unavailable banner.
 */

import type { ModuleHealthReport } from "../platform/modules/types";
import { getDataAnalysisDb, getDataAnalysisDbMode } from "./connection";
import { getGraphRagWorkerStatus } from "./graphrag/graphRag.worker";

export async function dataAnalysisHealth(): Promise<ModuleHealthReport> {
  let dbOk = false;
  let dbDetail: string | undefined;
  try {
    const db = getDataAnalysisDb();
    if (db) {
      dbOk = true;
      dbDetail = `mode=${getDataAnalysisDbMode()}`;
    } else {
      dbDetail = "DB unavailable";
    }
  } catch (err: any) {
    dbDetail = err?.message ?? "DB probe threw";
  }

  let workerStatus: { healthy: boolean; url: string; message: string };
  try {
    workerStatus = await getGraphRagWorkerStatus();
  } catch (err: any) {
    workerStatus = {
      healthy: false,
      url: process.env.GRAPHRAG_WORKER_URL || "http://localhost:8484",
      message: err?.message ?? "worker status threw",
    };
  }

  const state: ModuleHealthReport["state"] = !dbOk
    ? "failed"
    : workerStatus.healthy
      ? "ok"
      : "degraded";

  return {
    state,
    message: [
      dbDetail ? `db=${dbDetail}` : null,
      `graphRagWorker=${workerStatus.healthy ? "healthy" : "unavailable"}`,
      `graphRagWorker.url=${workerStatus.url}`,
      workerStatus.message ? `graphRagWorker.message=${workerStatus.message}` : null,
    ]
      .filter(Boolean)
      .join("; "),
    details: {
      db: { ok: dbOk, detail: dbDetail ?? null },
      graphRagWorker: workerStatus,
    },
    checkedAt: new Date().toISOString(),
  };
}
