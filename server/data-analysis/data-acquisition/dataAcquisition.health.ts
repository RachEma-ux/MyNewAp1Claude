/**
 * Data Acquisition health.
 *
 * Composite of:
 *   - DB reachability via the Data Analysis seam (Phase-1 staged).
 *   - Worker reachability — missing worker keeps state at `degraded`,
 *     never `failed`.
 */

import { getDataAnalysisDb } from "../connection";
import { sql } from "drizzle-orm";
import { getDataAcquisitionWorkerStatus } from "./dataAcquisition.worker";

export interface DataAcquisitionHealthReport {
  state: "ok" | "degraded" | "failed";
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
}

export async function dataAcquisitionHealth(): Promise<DataAcquisitionHealthReport> {
  const checkedAt = new Date().toISOString();
  let dbHealthy = false;
  let dbMessage = "";

  try {
    const db = getDataAnalysisDb();
    if (db) {
      await db.execute(sql`SELECT 1`);
      dbHealthy = true;
      dbMessage = "Data Acquisition DB reachable (Phase-1 shared).";
    } else {
      dbMessage = "DB accessor returned undefined.";
    }
  } catch (err) {
    dbMessage = `DB probe failed: ${(err as Error).message}`;
  }

  const worker = await getDataAcquisitionWorkerStatus();

  if (!dbHealthy) {
    return {
      state: "failed",
      message: dbMessage,
      details: { worker },
      checkedAt,
    };
  }
  if (!worker.healthy) {
    return {
      state: "degraded",
      message: `Worker unavailable — ${worker.message}`,
      details: { worker, db: { healthy: true, message: dbMessage } },
      checkedAt,
    };
  }
  return {
    state: "ok",
    message: "Data Acquisition healthy (DB + worker reachable).",
    details: { worker, db: { healthy: true, message: dbMessage } },
    checkedAt,
  };
}
