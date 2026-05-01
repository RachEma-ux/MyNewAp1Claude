/**
 * RAG Indexer — request a new indexing run
 *
 * Records that an index run has been requested by inserting a row in
 * `kgra_build_runs` with status="queued". The actual graph rebuild is
 * owned by the kgra-agent worker (which polls/listens on a separate
 * channel) — this module only registers the request in RAG-owned
 * storage. That keeps the gateway action honest: it touches RAGDB
 * directly, doesn't reach into kgra-agent code, and produces a real
 * row that observability/health can see.
 */

import { getRagDb } from "./connection";
import { kgraBuildRuns } from "../../drizzle/tables/ragdb";

export interface IndexRunRequest {
  reason?: string;
}

export interface IndexRunResult {
  runId: number;
  buildId: string;
  status: string;
  requestedAt: Date;
}

/**
 * Request a new index run. Inserts a kgra_build_runs row with
 * status="queued" and returns the row id + build id. The caller
 * should treat this as an enqueue operation — completion is
 * signalled later via rag.index.completed/failed events.
 */
export async function requestIndexRun(
  request: IndexRunRequest = {},
): Promise<IndexRunResult> {
  const db = getRagDb();
  if (!db) throw new Error("RAGDB not connected");

  const buildId = `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const typeCounts: Record<string, number> = request.reason
    ? { _reason: 0, _note: 0 }
    : {};

  const [inserted] = await db
    .insert(kgraBuildRuns)
    .values({
      buildId,
      status: "queued",
      entityCount: 0,
      relationshipCount: 0,
      chunkCount: 0,
      typeCounts,
    })
    .returning();

  if (!inserted) throw new Error("Failed to record index run request");

  return {
    runId: inserted.id,
    buildId: inserted.buildId,
    status: inserted.status,
    requestedAt: inserted.createdAt,
  };
}
