/**
 * Ingestion Jobs — retention sweep service.
 *
 * Phase 22 follow-up #669. The `ags_ingestion_jobs` table is the
 * Universal Ingestion (Phase 2-3, per CLAUDE.md) lifecycle wrapper —
 * one row per ingestion request: source connector, content type,
 * status, started/finished timestamps, plus rolled-up counters
 * (artifactsCreated / unitsCreated / chunksCreated /
 * extractionsCreated) and the requesting user.
 *
 * Schema (drizzle/tables/agent-studio.ts:1972):
 *   id / workspaceId / sourceConnectorKey / sourceUri / status /
 *   contentType / artifactsCreated / unitsCreated / chunksCreated /
 *   extractionsCreated / failureReason / requestedBy /
 *   requestedAt / startedAt / finishedAt / metadataJson
 *
 * Status vocabulary (per agent-studio.ts:1981 doc-comment):
 *   - `pending` — queued, never swept
 *   - `running` — in-flight, never swept
 *   - `succeeded` — terminal, sweep-eligible
 *   - `failed` — terminal, sweep-eligible
 *   - `unsupported_type` — terminal, sweep-eligible
 *
 * No FK children reference `agsIngestionJobs`. `agsIngestionArtifacts`
 * is a SIBLING table, NOT a child — both share `workspaceId` and
 * artifacts are deduplicated on `(workspaceId, contentHash)` (the
 * unique index). Artifacts are the content-hash dedupe index for
 * ingested bytes (compliance-adjacent: deleting them breaks
 * provenance lookup by content_hash + orphans `storageRef` byte
 * pointers). **Artifacts are out of scope for retention.** This
 * service prunes job rows only.
 *
 * Cutoff: `requestedAt` (always non-null per `defaultNow()`). Using
 * `finishedAt` would be more lifecycle-semantically correct, but it
 * can be null for terminal-`failed` rows where the worker died
 * before recording finish, and using a nullable cutoff is fragile
 * (rows would never age out). `requestedAt` is the only always-
 * non-null timestamp on the row.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsIngestionJobs } from "../../../drizzle/tables/agent-studio.js";

export type IngestionJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "unsupported_type";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly IngestionJobStatus[] = [
  "succeeded",
  "failed",
  "unsupported_type",
];

const ZERO_RESULT: PruneOldIngestionJobsResult = {
  deletedJobsCount: 0,
};

export interface PruneOldIngestionJobsInput {
  /** Cutoff — jobs with `requestedAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["succeeded", "failed", "unsupported_type"]`. `pending` +
   * `running` are never swept — those are queued/in-flight.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly IngestionJobStatus[];
  /**
   * Restrict to one workspace (`eq`) or a set (`inArray`). Empty
   * array short-circuits BEFORE the ASDB probe.
   */
  readonly workspaceId?: number | readonly number[];
  /**
   * Restrict to one source connector key (`eq`) or a set
   * (`inArray`). Useful for operators sweeping one connector's
   * history (e.g. archived integrations) while preserving others.
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly sourceConnectorKey?: string | readonly string[];
}

export interface PruneOldIngestionJobsResult {
  readonly deletedJobsCount: number;
}

export interface PruneOldIngestionJobsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldIngestionJobs(
  input: PruneOldIngestionJobsInput,
  options: PruneOldIngestionJobsOptions = {},
): Promise<PruneOldIngestionJobsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.workspaceId) && input.workspaceId.length === 0) {
    return ZERO_RESULT;
  }
  if (
    Array.isArray(input.sourceConnectorKey) &&
    input.sourceConnectorKey.length === 0
  ) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsIngestionJobs.requestedAt, input.olderThan),
    inArray(agsIngestionJobs.status, statuses as IngestionJobStatus[]),
  ];
  const wsInput = input.workspaceId;
  if (wsInput !== undefined) {
    if (Array.isArray(wsInput)) {
      filters.push(inArray(agsIngestionJobs.workspaceId, wsInput));
    } else {
      filters.push(eq(agsIngestionJobs.workspaceId, wsInput as number));
    }
  }
  const connectorInput = input.sourceConnectorKey;
  if (connectorInput !== undefined) {
    if (Array.isArray(connectorInput)) {
      filters.push(
        inArray(agsIngestionJobs.sourceConnectorKey, connectorInput),
      );
    } else {
      filters.push(
        eq(agsIngestionJobs.sourceConnectorKey, connectorInput as string),
      );
    }
  }

  const candidates = await db
    .select({ id: agsIngestionJobs.id })
    .from(agsIngestionJobs)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const ids = candidates.map((r) => Number(r.id));

  const deleted = await db
    .delete(agsIngestionJobs)
    .where(inArray(agsIngestionJobs.id, ids))
    .returning({ id: agsIngestionJobs.id });

  return { deletedJobsCount: deleted.length };
}
