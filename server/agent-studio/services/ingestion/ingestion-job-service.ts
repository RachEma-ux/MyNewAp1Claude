/**
 * Ingestion job service — wraps each universal-ingestion run.
 *
 * One row per `IngestionJobRequest`. The status moves
 * `pending → running → succeeded | failed | unsupported_type`. Counters
 * (`artifactsCreated`, `unitsCreated`, `chunksCreated`,
 * `extractionsCreated`) are accumulated by the
 * `UniversalIngestionService` as it walks the layers.
 *
 * Failures DO NOT throw: the job row carries `failureReason`. Throwing
 * would obscure the per-job audit trail.
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import { agsIngestionJobs } from "../../../../drizzle/tables/agent-studio";

export interface StartJobInput {
  workspaceId: number;
  sourceConnectorKey: string;
  sourceUri?: string | null;
  contentType?: string | null;
  requestedBy: number;
  metadata?: Record<string, unknown>;
}

export async function startJob(input: StartJobInput): Promise<number> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const [row] = await db
    .insert(agsIngestionJobs)
    .values({
      workspaceId: input.workspaceId,
      sourceConnectorKey: input.sourceConnectorKey,
      sourceUri: input.sourceUri ?? null,
      contentType: input.contentType ?? null,
      requestedBy: input.requestedBy,
      status: "running",
      startedAt: new Date(),
      metadataJson: input.metadata ?? null,
    })
    .returning({ id: agsIngestionJobs.id });
  return row.id;
}

export interface CompleteJobInput {
  jobId: number;
  status: "succeeded" | "failed" | "unsupported_type";
  artifactsCreated: number;
  unitsCreated: number;
  chunksCreated: number;
  extractionsCreated: number;
  failureReason?: string | null;
}

export async function completeJob(input: CompleteJobInput): Promise<void> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  await db
    .update(agsIngestionJobs)
    .set({
      status: input.status,
      artifactsCreated: input.artifactsCreated,
      unitsCreated: input.unitsCreated,
      chunksCreated: input.chunksCreated,
      extractionsCreated: input.extractionsCreated,
      failureReason: input.failureReason ?? null,
      finishedAt: new Date(),
    })
    .where(eq(agsIngestionJobs.id, input.jobId));
}

export async function getJob(jobId: number) {
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agsIngestionJobs)
    .where(eq(agsIngestionJobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}
