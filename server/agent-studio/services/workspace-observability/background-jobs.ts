/**
 * Workspace Observability — Background jobs service.
 *
 * Phase 22. Wires the dormant `ags_workspace_background_jobs`
 * table. Operators see job status (pending / running / failed /
 * completed) for long-running async work — projection rebuilds,
 * import scans, retention sweeps, evaluation runs.
 *
 * This is the *recorder* surface — actual job execution happens
 * in worker code elsewhere. The recorder gives workers a uniform
 * place to declare progress + failure, and operators a uniform
 * place to inspect it.
 *
 * Failure modes:
 *   - ASDB unavailable → writers throw `AsdbUnavailableError`;
 *     readers return `[]` / `null`. Same shape as the rest of
 *     Phase 14/15/16 services.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsWorkspaceBackgroundJobs } from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import { recordErrorEvent } from "./error-events.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class JobNotFoundError extends Error {
  constructor(public readonly jobId: number) {
    super(`Background job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface EnqueueJobInput {
  readonly jobKind: string;
  readonly payload?: Record<string, unknown> | null;
}

export interface BackgroundJobRow {
  readonly id: number;
  readonly jobKind: string;
  readonly payload: Record<string, unknown> | null;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceOptions {
  readonly getDb?: typeof getAsDb;
}

function rowToJob(r: Record<string, unknown>): BackgroundJobRow {
  return {
    id: Number(r.id),
    jobKind: String(r.jobKind),
    payload:
      (r.payload as Record<string, unknown> | null | undefined) ?? null,
    status: String(r.status) as JobStatus,
    attempts: Number(r.attempts ?? 0),
    lastError: r.lastError == null ? null : String(r.lastError),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

export async function enqueueJob(
  input: EnqueueJobInput,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsWorkspaceBackgroundJobs)
    .values({
      jobKind: input.jobKind,
      payload: input.payload ?? null,
      status: "pending",
      attempts: 0,
      updatedAt: new Date(),
    })
    .returning({
      id: agsWorkspaceBackgroundJobs.id,
      jobKind: agsWorkspaceBackgroundJobs.jobKind,
      payload: agsWorkspaceBackgroundJobs.payload,
      status: agsWorkspaceBackgroundJobs.status,
      attempts: agsWorkspaceBackgroundJobs.attempts,
      lastError: agsWorkspaceBackgroundJobs.lastError,
      createdAt: agsWorkspaceBackgroundJobs.createdAt,
      updatedAt: agsWorkspaceBackgroundJobs.updatedAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to enqueue background job");
  return rowToJob(row);
}

export async function getJobById(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsWorkspaceBackgroundJobs.id,
      jobKind: agsWorkspaceBackgroundJobs.jobKind,
      payload: agsWorkspaceBackgroundJobs.payload,
      status: agsWorkspaceBackgroundJobs.status,
      attempts: agsWorkspaceBackgroundJobs.attempts,
      lastError: agsWorkspaceBackgroundJobs.lastError,
      createdAt: agsWorkspaceBackgroundJobs.createdAt,
      updatedAt: agsWorkspaceBackgroundJobs.updatedAt,
    })
    .from(agsWorkspaceBackgroundJobs)
    .where(eq(agsWorkspaceBackgroundJobs.id, jobId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToJob(rows[0]);
}

export interface ListJobsInput {
  readonly status?: JobStatus;
  readonly jobKind?: string;
  readonly limit?: number;
}

export async function listJobs(
  input: ListJobsInput = {},
  options: ServiceOptions = {},
): Promise<BackgroundJobRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [];
  if (input.status !== undefined) {
    filters.push(eq(agsWorkspaceBackgroundJobs.status, input.status));
  }
  if (input.jobKind !== undefined) {
    filters.push(eq(agsWorkspaceBackgroundJobs.jobKind, input.jobKind));
  }

  const rows = await db
    .select({
      id: agsWorkspaceBackgroundJobs.id,
      jobKind: agsWorkspaceBackgroundJobs.jobKind,
      payload: agsWorkspaceBackgroundJobs.payload,
      status: agsWorkspaceBackgroundJobs.status,
      attempts: agsWorkspaceBackgroundJobs.attempts,
      lastError: agsWorkspaceBackgroundJobs.lastError,
      createdAt: agsWorkspaceBackgroundJobs.createdAt,
      updatedAt: agsWorkspaceBackgroundJobs.updatedAt,
    })
    .from(agsWorkspaceBackgroundJobs)
    .where(
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters),
    )
    .orderBy(desc(agsWorkspaceBackgroundJobs.updatedAt))
    .limit(input.limit ?? 100);
  return rows.map(rowToJob);
}

async function transitionStatus(
  jobId: number,
  patch: Record<string, unknown>,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsWorkspaceBackgroundJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agsWorkspaceBackgroundJobs.id, jobId));

  const updated = await getJobById(jobId, options);
  if (!updated) throw new JobNotFoundError(jobId);
  return updated;
}

export async function markJobStarted(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  // attempts increment on every (re)start so retry storms are
  // visible at a glance.
  const current = await getJobById(jobId, options);
  if (!current) throw new JobNotFoundError(jobId);
  return transitionStatus(
    jobId,
    { status: "running", attempts: current.attempts + 1 },
    options,
  );
}

export async function markJobCompleted(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  return transitionStatus(jobId, { status: "completed", lastError: null }, options);
}

export async function markJobFailed(
  jobId: number,
  errorMessage: string,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  const row = await transitionStatus(
    jobId,
    { status: "failed", lastError: errorMessage },
    options,
  );
  // Bridge to the error_events stream so failed background jobs show
  // up in the dashboard's error feed alongside tRPC failures captured
  // by #513's middleware. Fire-and-forget — observability writes never
  // mask the original failure-status update. Operators can correlate
  // via metadata.jobId when triaging.
  void recordErrorEvent(
    {
      sourceKind: `backgroundJob.${row.jobKind}`,
      sourceId: String(jobId),
      errorClass: "BackgroundJobFailed",
      errorMessage,
      metadata: { jobId, jobKind: row.jobKind, payload: row.payload ?? null },
    },
    { getDb: options.getDb },
  ).catch(() => {
    // Fail-soft: an observability write failure must not propagate.
  });
  return row;
}

export async function markJobCancelled(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  return transitionStatus(jobId, { status: "cancelled" }, options);
}

export class JobNotRetryableError extends Error {
  constructor(
    public readonly jobId: number,
    public readonly currentStatus: JobStatus,
  ) {
    super(
      `Background job ${jobId} cannot be retried (status='${currentStatus}'); only 'failed' jobs are retryable`,
    );
    this.name = "JobNotRetryableError";
  }
}

/**
 * Operator-triggered retry: flip a `failed` job back to `pending`
 * so the next worker pickup re-attempts it. The original row is
 * preserved (no new INSERT) and its `lastError` is cleared, but
 * `attempts` is left intact so the retry-storm signal that
 * `markJobStarted` increments stays accurate over the job's
 * lifetime.
 *
 * Refuses to retry jobs that aren't currently `failed` —
 * re-pendifying a `running` or `completed` job would shadow
 * in-flight work or lose terminal state. Operators retry
 * `cancelled` jobs by re-enqueuing instead (different intent).
 */
export async function retryJob(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  const current = await getJobById(jobId, options);
  if (!current) throw new JobNotFoundError(jobId);
  if (current.status !== "failed") {
    throw new JobNotRetryableError(jobId, current.status);
  }
  return transitionStatus(
    jobId,
    { status: "pending", lastError: null },
    options,
  );
}

// ---------- retention prune ----------

export interface PruneOldBackgroundJobsInput {
  /**
   * Delete jobs whose updatedAt is strictly older than this cutoff.
   * Uses updatedAt (not createdAt) so a job that's been re-attempted
   * recently is preserved even if it was first enqueued long ago.
   */
  readonly olderThan: Date;
  /**
   * Restrict deletion to jobs in these terminal statuses. Default
   * ["completed", "cancelled"] — failed jobs are preserved by default
   * because their lastError + audit trail may still be operator-relevant.
   * Pass ["completed", "failed", "cancelled"] for aggressive cleanup,
   * or ["completed"] for the safest policy.
   */
  readonly statuses?: readonly JobStatus[];
}

export interface PruneOldBackgroundJobsResult {
  readonly deletedCount: number;
}

const DEFAULT_TERMINAL_STATUSES: readonly JobStatus[] = ["completed", "cancelled"];

/**
 * Bulk-delete background jobs older than the given cutoff. Sister of
 * pruneOldErrorEvents (#519) and pruneOldNotifications (#520) — same
 * fail-soft contract on ASDB-null.
 *
 * Defaults preserve `failed` jobs because their error context typically
 * outlives the immediate retention window. Operators investigating an
 * incident days later still want the failed-job rows around.
 */
export async function pruneOldBackgroundJobs(
  input: PruneOldBackgroundJobsInput,
  options: ServiceOptions = {},
): Promise<PruneOldBackgroundJobsResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsWorkspaceBackgroundJobs.updatedAt, input.olderThan),
    inArray(agsWorkspaceBackgroundJobs.status, statuses as JobStatus[]),
  ];

  const deleted = await db
    .delete(agsWorkspaceBackgroundJobs)
    .where(and(...filters))
    .returning({ id: agsWorkspaceBackgroundJobs.id });

  return { deletedCount: deleted.length };
}
