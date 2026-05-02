/**
 * Output pipeline runner — records `data_acquisition_output_runs`.
 *
 * For each `outputType`:
 *   - rag, graphrag, analytics, warehouse, alerts, reports,
 *     markdown, html, pdf
 *
 * Behavior:
 *   1. Insert `pending` row.
 *   2. If a target service is configured (e.g., GraphRAG worker for
 *      `graphrag`), the consumer reacts to the
 *      `outputPipelineCompleted` event. We do *not* reach across
 *      module boundaries directly here — Data Acquisition emits a
 *      canonical record and an event; the receiving subdomain owns
 *      the actual ingest.
 *   3. Mark `degraded` if no consumer is configured for the type, but
 *      always preserve provenance.
 *
 * Caller is responsible for emitting `outputPipelineStarted` /
 * `outputPipelineCompleted` / `outputPipelineFailed`.
 */

import { eq } from "drizzle-orm";

import { getDataAnalysisDb as getDb } from "../../../connection";
import { dataAcquisitionOutputRuns } from "../../../../../drizzle/schema";
import type { OutputRunInput } from "../../dataAcquisition.types";

export interface OutputRunResult {
  id: number;
  status: "pending" | "running" | "completed" | "failed" | "degraded";
  errorMessage?: string;
  targetRef?: string;
}

/**
 * Record an output run row. Returns the inserted row id.
 *
 * The actual side-effect (calling GraphRAG, writing to warehouse,
 * emitting an alert) is handled by the consumer subdomain — Data
 * Acquisition only owns the run-record and the event emission.
 */
export async function recordOutputRun(input: OutputRunInput): Promise<{
  id: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db
    .insert(dataAcquisitionOutputRuns)
    .values({
      workspaceId: input.workspaceId,
      itemId: input.itemId,
      canonicalRecordId: input.canonicalRecordId,
      outputType: input.outputType,
      targetRef: input.targetRef,
      status: "pending",
    })
    .returning({ id: dataAcquisitionOutputRuns.id });
  return { id: created.id };
}

export async function markOutputRunCompleted(
  id: number,
  targetRef?: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(dataAcquisitionOutputRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      targetRef: targetRef ?? null,
    })
    .where(eq(dataAcquisitionOutputRuns.id, id));
}

export async function markOutputRunFailed(
  id: number,
  errorMessage: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(dataAcquisitionOutputRuns)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage,
    })
    .where(eq(dataAcquisitionOutputRuns.id, id));
}
