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
import { getDataAcquisitionWorkerStatus } from "./data-acquisition/dataAcquisition.worker";

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

  let graphRagStatus: { healthy: boolean; url: string; message: string };
  try {
    graphRagStatus = await getGraphRagWorkerStatus();
  } catch (err: any) {
    graphRagStatus = {
      healthy: false,
      url: process.env.GRAPHRAG_WORKER_URL || "http://localhost:8484",
      message: err?.message ?? "worker status threw",
    };
  }

  let acquisitionStatus: { healthy: boolean; url: string; message: string };
  try {
    acquisitionStatus = await getDataAcquisitionWorkerStatus();
  } catch (err: any) {
    acquisitionStatus = {
      healthy: false,
      url:
        process.env.DATA_ACQUISITION_WORKER_URL || "http://localhost:8485",
      message: err?.message ?? "worker status threw",
    };
  }

  const allWorkersHealthy = graphRagStatus.healthy && acquisitionStatus.healthy;
  const state: ModuleHealthReport["state"] = !dbOk
    ? "failed"
    : allWorkersHealthy
      ? "ok"
      : "degraded";

  return {
    state,
    message: [
      dbDetail ? `db=${dbDetail}` : null,
      `graphRagWorker=${graphRagStatus.healthy ? "healthy" : "unavailable"}`,
      `dataAcquisitionWorker=${
        acquisitionStatus.healthy ? "healthy" : "unavailable"
      }`,
    ]
      .filter(Boolean)
      .join("; "),
    details: {
      db: { ok: dbOk, detail: dbDetail ?? null },
      graphRagWorker: graphRagStatus,
      dataAcquisitionWorker: acquisitionStatus,
    },
    checkedAt: new Date().toISOString(),
  };
}
