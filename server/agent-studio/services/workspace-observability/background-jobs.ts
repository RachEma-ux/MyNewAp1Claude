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

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
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

/**
 * Bulk fan-out enqueue. Sister of `pushNotificationToUsers` (#527) on
 * the notifications surface. Single batched INSERT for N rows so a
 * sweep that needs to enqueue many jobs (e.g. one rebuild per vault)
 * doesn't cost N round-trips. Empty input short-circuits with no DB
 * call to avoid an empty-VALUES SQL error.
 *
 * Each row enters in `status='pending'` with `attempts=0`, same as
 * the singular `enqueueJob`.
 */
export async function enqueueJobs(
  inputs: readonly EnqueueJobInput[],
  options: ServiceOptions = {},
): Promise<BackgroundJobRow[]> {
  if (inputs.length === 0) return [];
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const now = new Date();
  const inserted = await db
    .insert(agsWorkspaceBackgroundJobs)
    .values(
      inputs.map((input) => ({
        jobKind: input.jobKind,
        payload: input.payload ?? null,
        status: "pending" as const,
        attempts: 0,
        updatedAt: now,
      })),
    )
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
  return inserted.map(rowToJob);
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

/**
 * Bulk read sibling of getJobById. Operators clicking a multi-select
 * action on the dashboard often need the full row payloads for the
 * selection — one round-trip instead of N. Sister of cancelJobs (#543)
 * and retryJobs (#542) on the bulk-action side: read-bulk lets the
 * UI render a "you're about to act on these" confirmation list.
 *
 * Empty input short-circuits to [] with no DB call (matches the
 * empty-array contract used across Phase 22). Returns ROWS, not a
 * partitioned skip/success pair — id-not-found is signalled by
 * absence (caller does the diff against the requested ids if needed).
 */
export async function getJobsByIds(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<BackgroundJobRow[]> {
  if (jobIds.length === 0) return [];
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

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
    .where(inArray(agsWorkspaceBackgroundJobs.id, jobIds as number[]));
  return rows.map(rowToJob);
}

export interface ListJobsInput {
  /**
   * Single status to filter by, or an array of statuses (OR semantics
   * via SQL `IN`). Operators routinely want "failed OR cancelled" for
   * incident triage or "pending OR running" for the live-work view —
   * the array form removes the need for two separate calls + a
   * client-side merge.
   *
   * Empty array short-circuits to no rows (the IN clause would be
   * vacuous), matching the intent "filter by these statuses, but
   * there are none".
   */
  readonly status?: JobStatus | readonly JobStatus[];
  /**
   * Single jobKind to filter by (exact `eq`), or an array (`IN` — OR
   * semantics). Operators reviewing a worker tier often want several
   * related kinds at once — e.g.
   * `["projection.rebuild", "projection.repair"]` — without firing
   * two calls. Empty array short-circuits to no rows (vacuous IN).
   * Mirrors the array form on listErrorEvents.sourceKind (#553).
   */
  readonly jobKind?: string | readonly string[];
  readonly limit?: number;
  /**
   * Restrict to jobs whose `createdAt` is at-or-after this timestamp.
   * Use for incident-triage queries like "show me jobs enqueued in
   * the last hour" without forcing the caller to compute the cutoff
   * via the worker tier.
   */
  readonly createdSince?: Date;
  /**
   * Restrict to jobs whose `updatedAt` is at-or-after this timestamp.
   * `updatedAt` moves on every state transition, so this answers
   * "what's been touched recently" — useful for spotting stuck-running
   * jobs or recent failure flips.
   */
  readonly updatedSince?: Date;
}

export interface ListStaleRunningJobsInput {
  /**
   * Cap on rows returned. Defaults to 10 — operators want a short
   * "what's stuck" list on the dashboard, not a full running-job
   * dump.
   */
  readonly limit?: number;
  /**
   * Optional jobKind filter — single string (`eq`) or array (`IN`).
   * Lets the dashboard scope to one worker's stuck rows when an
   * operator is triaging a single subsystem. Mirrors the same filter
   * on failStaleRunningJobs (#548). Empty array → vacuous IN
   * short-circuit (returns []).
   */
  readonly jobKind?: string | readonly string[];
}

/**
 * "Stale running" oldest-updated-first selector for the operator
 * dashboard. listJobs orders by `desc(updatedAt)` (most-recently-
 * touched first), which is the wrong sort for stuck-running
 * detection — operators want the running rows whose updatedAt is
 * oldest, since those have been running the longest without a
 * markJobStarted/markJobCompleted bump.
 *
 * Accepts either a bare `limit` number (back-compat with the
 * pre-#556 signature) or an `{limit, jobKind}` object (preferred
 * going forward).
 */
export async function listStaleRunningJobs(
  inputOrLimit?: ListStaleRunningJobsInput | number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow[]> {
  const input: ListStaleRunningJobsInput =
    typeof inputOrLimit === "number"
      ? { limit: inputOrLimit }
      : (inputOrLimit ?? {});
  const limit = input.limit ?? 10;

  // Empty jobKind array → vacuous IN; short-circuit before the ASDB
  // probe so a no-op operator filter doesn't fail when the DB is down.
  if (Array.isArray(input.jobKind) && input.jobKind.length === 0) {
    return [];
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [eq(agsWorkspaceBackgroundJobs.status, "running")];
  const jobKindInput = input.jobKind;
  if (jobKindInput !== undefined) {
    if (Array.isArray(jobKindInput)) {
      filters.push(
        inArray(agsWorkspaceBackgroundJobs.jobKind, jobKindInput as string[]),
      );
    } else {
      filters.push(
        eq(agsWorkspaceBackgroundJobs.jobKind, jobKindInput as string),
      );
    }
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
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(agsWorkspaceBackgroundJobs.updatedAt) // ASC = oldest-touched first
    .limit(limit);
  return rows.map(rowToJob);
}

export async function listJobs(
  input: ListJobsInput = {},
  options: ServiceOptions = {},
): Promise<BackgroundJobRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [];
  const statusInput = input.status;
  if (statusInput !== undefined) {
    if (Array.isArray(statusInput)) {
      // Empty array → vacuous IN clause; short-circuit to no rows.
      if (statusInput.length === 0) return [];
      filters.push(
        inArray(agsWorkspaceBackgroundJobs.status, statusInput as JobStatus[]),
      );
    } else {
      filters.push(
        eq(agsWorkspaceBackgroundJobs.status, statusInput as JobStatus),
      );
    }
  }
  const jobKindInput = input.jobKind;
  if (jobKindInput !== undefined) {
    if (Array.isArray(jobKindInput)) {
      // Empty array → vacuous IN; short-circuit to no rows.
      if (jobKindInput.length === 0) return [];
      filters.push(
        inArray(
          agsWorkspaceBackgroundJobs.jobKind,
          jobKindInput as string[],
        ),
      );
    } else {
      filters.push(
        eq(agsWorkspaceBackgroundJobs.jobKind, jobKindInput as string),
      );
    }
  }
  if (input.createdSince !== undefined) {
    filters.push(gte(agsWorkspaceBackgroundJobs.createdAt, input.createdSince));
  }
  if (input.updatedSince !== undefined) {
    filters.push(gte(agsWorkspaceBackgroundJobs.updatedAt, input.updatedSince));
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

/**
 * Worker heartbeat — refreshes `updatedAt` on a running job without
 * changing status, so `failStaleRunningJobs` (#546) doesn't auto-fail
 * a worker that's legitimately still working past the stale-after
 * window. Long-running workers (projection rebuilds, large imports)
 * should call this periodically from their inner loop.
 *
 * No-op on non-running rows — the heartbeat invariant is "I, the
 * worker that called markJobStarted, am still alive". A heartbeat on
 * a completed/failed/cancelled row would be a worker-tier bug (worker
 * leaked a reference past its job's terminal state) and silently
 * doing the update would hide that bug. Returns the row regardless so
 * the caller can inspect and decide.
 *
 * Throws JobNotFoundError if the row doesn't exist. The status-mismatch
 * case is surfaced via JobNotRunningError so a worker can distinguish
 * "row gone" from "row already terminated by external action"
 * (operator cancel, retention prune race, etc.).
 */
export class JobNotRunningError extends Error {
  constructor(
    public readonly jobId: number,
    public readonly currentStatus: JobStatus,
  ) {
    super(
      `Background job ${jobId} is not 'running' (status='${currentStatus}'); heartbeat requires the running state`,
    );
    this.name = "JobNotRunningError";
  }
}

export async function bumpJobHeartbeat(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  const current = await getJobById(jobId, options);
  if (!current) throw new JobNotFoundError(jobId);
  if (current.status !== "running") {
    throw new JobNotRunningError(jobId, current.status);
  }
  // Touch updatedAt only — status, attempts, lastError stay as-is.
  return transitionStatus(jobId, {}, options);
}

export interface BumpJobHeartbeatsResult {
  /** Rows whose updatedAt was bumped. */
  readonly bumped: readonly BackgroundJobRow[];
  /**
   * Per-id skip reasons: `"not_found"` (no row) or `"not_running"`
   * (row exists but isn't in 'running' state). The bulk operator
   * partitions rather than throws so a fan-out controller with one
   * stale id doesn't lose the heartbeat for its other in-flight
   * children. Sister of cancelJobs (#543) and retryJobs (#542).
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_running";
    readonly currentStatus?: JobStatus;
  }>;
}

/**
 * Bulk worker heartbeat. A fan-out controller worker that manages N
 * parallel children calls this periodically to keep them all alive
 * in one round-trip — sister of the singular bumpJobHeartbeat (#562).
 *
 * Empty input short-circuits with no DB call. ASDB-unavailable
 * throws (consistent with the bulk-write operators retryJobs/
 * cancelJobs — fan-out controllers want to fail loudly when the DB
 * is down rather than silently lose heartbeats).
 */
export async function bumpJobHeartbeats(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<BumpJobHeartbeatsResult> {
  if (jobIds.length === 0) return { bumped: [], skipped: [] };

  // Probe ASDB upfront so a null DB fails the whole batch loudly.
  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const bumped: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_running";
    currentStatus?: JobStatus;
  }> = [];

  for (const jobId of jobIds) {
    const current = await getJobById(jobId, options);
    if (!current) {
      skipped.push({ jobId, reason: "not_found" });
      continue;
    }
    if (current.status !== "running") {
      skipped.push({
        jobId,
        reason: "not_running",
        currentStatus: current.status,
      });
      continue;
    }
    const row = await transitionStatus(jobId, {}, options);
    bumped.push(row);
  }

  return { bumped, skipped };
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

export interface MarkJobsStartedResult {
  /** Rows successfully claimed and flipped to `running`. */
  readonly started: readonly BackgroundJobRow[];
  /**
   * Per-id skip reasons: `"not_found"` (no row) or `"not_pending"`
   * (row was already claimed by another worker, completed, failed,
   * cancelled, or running). Partition rather than throw so a pool
   * worker that races with a sibling for the same job doesn't lose
   * the claims that did land.
   *
   * Note: the singular `markJobStarted` is permissive (flips any
   * found row to running and bumps attempts). The bulk surface is
   * the stricter pool-claim contract, matching the bulk-strict /
   * singular-permissive split used by `cancelJobs` (#543).
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_pending";
    readonly currentStatus?: JobStatus;
  }>;
}

/**
 * Bulk worker-pool claim: a pool that pulled N pending jobs from
 * `listJobs({status:"pending"})` calls this once instead of N round
 * trips. Strict — only `pending` rows are claimed; anything else is
 * surfaced as a skip so the caller can drop it from its work plan.
 *
 * Sister of `markJobsCompleted` (#564) / `markJobsFailed` (#565)
 * on the partition pattern; closes the worker-tier transition trio.
 */
export async function markJobsStarted(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<MarkJobsStartedResult> {
  if (jobIds.length === 0) return { started: [], skipped: [] };

  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const started: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_pending";
    currentStatus?: JobStatus;
  }> = [];

  for (const jobId of jobIds) {
    const current = await getJobById(jobId, options);
    if (!current) {
      skipped.push({ jobId, reason: "not_found" });
      continue;
    }
    if (current.status !== "pending") {
      skipped.push({
        jobId,
        reason: "not_pending",
        currentStatus: current.status,
      });
      continue;
    }
    const row = await transitionStatus(
      jobId,
      { status: "running", attempts: current.attempts + 1 },
      options,
    );
    started.push(row);
  }

  return { started, skipped };
}

export interface MarkJobsCompletedResult {
  /** Rows successfully flipped to `completed`. */
  readonly completed: readonly BackgroundJobRow[];
  /**
   * Per-id skip reasons: `"not_found"` (no row) or `"not_running"`
   * (row already in a terminal state — `completed`, `failed`,
   * `cancelled`, or still `pending`). Partition rather than throw so
   * a fan-out controller with one stale child doesn't lose the
   * completion signal for its siblings.
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_running";
    readonly currentStatus?: JobStatus;
  }>;
}

/**
 * Bulk completion for a fan-out controller whose N children all
 * finish in one batch. Sister of cancelJobs (#543) / retryJobs
 * (#542) / bumpJobHeartbeats (#563) on the partition pattern.
 *
 * Refuses to flip non-running rows — only a `running` job should
 * become `completed`. A pending/completed/failed/cancelled row is
 * surfaced as `not_running` skip instead of being silently
 * overwritten.
 */
export async function markJobsCompleted(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<MarkJobsCompletedResult> {
  if (jobIds.length === 0) return { completed: [], skipped: [] };

  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const completed: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_running";
    currentStatus?: JobStatus;
  }> = [];

  for (const jobId of jobIds) {
    const current = await getJobById(jobId, options);
    if (!current) {
      skipped.push({ jobId, reason: "not_found" });
      continue;
    }
    if (current.status !== "running") {
      skipped.push({
        jobId,
        reason: "not_running",
        currentStatus: current.status,
      });
      continue;
    }
    const row = await transitionStatus(
      jobId,
      { status: "completed", lastError: null },
      options,
    );
    completed.push(row);
  }

  return { completed, skipped };
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

export interface MarkJobsFailedInput {
  readonly jobId: number;
  readonly errorMessage: string;
}

export interface MarkJobsFailedResult {
  /** Rows successfully flipped to `failed`. */
  readonly failed: readonly BackgroundJobRow[];
  /**
   * Per-id skip reasons: `"not_found"` (no row) or `"not_running"`
   * (row already in a terminal state — `completed`, `failed`,
   * `cancelled`, or still `pending`). Partition rather than throw so
   * a fan-out controller with a mix of running + already-terminal
   * children doesn't lose the failure signal for the rest.
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_running";
    readonly currentStatus?: JobStatus;
  }>;
}

/**
 * Bulk failure for a fan-out controller whose N children all
 * fault in one batch (each with its own error message). Sister
 * of markJobsCompleted (#564) on the partition pattern, with the
 * fire-and-forget error_events bridge preserved per-id.
 *
 * Refuses to flip non-running rows — only a `running` job should
 * become `failed`. A pending/completed/failed/cancelled row is
 * surfaced as `not_running` skip instead of being silently
 * overwritten.
 */
export async function markJobsFailed(
  inputs: readonly MarkJobsFailedInput[],
  options: ServiceOptions = {},
): Promise<MarkJobsFailedResult> {
  if (inputs.length === 0) return { failed: [], skipped: [] };

  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const failed: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_running";
    currentStatus?: JobStatus;
  }> = [];

  for (const { jobId, errorMessage } of inputs) {
    const current = await getJobById(jobId, options);
    if (!current) {
      skipped.push({ jobId, reason: "not_found" });
      continue;
    }
    if (current.status !== "running") {
      skipped.push({
        jobId,
        reason: "not_running",
        currentStatus: current.status,
      });
      continue;
    }
    const row = await transitionStatus(
      jobId,
      { status: "failed", lastError: errorMessage },
      options,
    );
    failed.push(row);
    // Fire-and-forget error_events bridge per failed row — matches
    // singular markJobFailed semantics.
    void recordErrorEvent(
      {
        sourceKind: `backgroundJob.${row.jobKind}`,
        sourceId: String(jobId),
        errorClass: "BackgroundJobFailed",
        errorMessage,
        metadata: {
          jobId,
          jobKind: row.jobKind,
          payload: row.payload ?? null,
        },
      },
      { getDb: options.getDb },
    ).catch(() => {
      // Fail-soft: an observability write failure must not propagate.
    });
  }

  return { failed, skipped };
}

export async function markJobCancelled(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  return transitionStatus(jobId, { status: "cancelled" }, options);
}

export class JobNotCancellableError extends Error {
  constructor(
    public readonly jobId: number,
    public readonly currentStatus: JobStatus,
  ) {
    super(
      `Background job ${jobId} cannot be cancelled (status='${currentStatus}'); only 'pending' or 'running' jobs are cancellable in bulk`,
    );
    this.name = "JobNotCancellableError";
  }
}

export interface CancelJobsResult {
  /** Jobs that were successfully flipped to `cancelled`. */
  readonly cancelled: readonly BackgroundJobRow[];
  /**
   * Jobs that were skipped, with the reason: `"not_found"` (no row),
   * or `"not_cancellable"` (status was already terminal —
   * completed/failed/cancelled). The bulk operator preserves
   * terminal state so a stale selection doesn't overwrite a
   * row that finished between the list-fetch and the click.
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_cancellable";
    readonly currentStatus?: JobStatus;
  }>;
}

const CANCELLABLE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "pending",
  "running",
]);

/**
 * Bulk operator cancel: flip pending/running jobs to cancelled,
 * partition terminal-status rows into skipped. Sister of `retryJobs`
 * (#542) — same partition + ASDB-upfront-probe semantics.
 *
 * Note: the singular `markJobCancelled` is permissive (no status
 * check) for back-compat with worker-tier callers that may want to
 * force-cancel a row regardless of state. The bulk surface is the
 * stricter operator-facing contract.
 */
export async function cancelJobs(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<CancelJobsResult> {
  if (jobIds.length === 0) return { cancelled: [], skipped: [] };

  // Probe ASDB upfront so a null DB fails the whole batch loudly.
  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const cancelled: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_cancellable";
    currentStatus?: JobStatus;
  }> = [];

  for (const jobId of jobIds) {
    const current = await getJobById(jobId, options);
    if (!current) {
      skipped.push({ jobId, reason: "not_found" });
      continue;
    }
    if (!CANCELLABLE_STATUSES.has(current.status)) {
      skipped.push({
        jobId,
        reason: "not_cancellable",
        currentStatus: current.status,
      });
      continue;
    }
    const row = await transitionStatus(
      jobId,
      { status: "cancelled" },
      options,
    );
    cancelled.push(row);
  }

  return { cancelled, skipped };
}

export interface FailStaleRunningJobsInput {
  /**
   * Cutoff timestamp — any job in `status='running'` whose `updatedAt`
   * is strictly older than this is treated as stale and force-failed.
   * Callers compute this from a stale-after duration (e.g.
   * `Date.now() - 30*60*1000`).
   */
  readonly olderThan: Date;
  /**
   * Optional cap on rows scanned per sweep. Defaults to 100 — same
   * page size as listJobs. The sweep is meant to be invoked
   * periodically, so an aggressive single-batch cap keeps each pass
   * bounded and preserves the next sweep's chance to catch
   * additional rows.
   */
  readonly limit?: number;
  /**
   * Error message recorded against each stale row's `lastError` and
   * mirrored to the error_events stream (markJobFailed already does
   * the bridge). Defaults to a generic "stale" reason.
   */
  readonly errorMessage?: string;
  /**
   * Optional jobKind filter — single string (`eq`) or array (`IN`).
   * Lets an operator paged on a single failing worker target only
   * that worker's stuck rows instead of nuking unrelated stale work.
   * Mirrors the array pattern from listJobs.status (#539).
   *
   * Empty array short-circuits to no rows (vacuous IN), matching the
   * intent "filter by these kinds, but there are none".
   */
  readonly jobKind?: string | readonly string[];
}

export interface FailStaleRunningJobsResult {
  readonly failed: readonly BackgroundJobRow[];
  readonly scanned: number;
}

const DEFAULT_FAIL_STALE_MESSAGE =
  "Background job auto-failed by stale-running sweep (no markJobStarted/markJobCompleted bump within the staleness window)";

/**
 * Operator/cron sweep that auto-fails jobs stuck in `status='running'`.
 * Complements `listStaleRunningJobs` (#545): the listing surfaces the
 * problem to the dashboard, this surface unsticks the rows so the
 * worker queue isn't starved by phantom in-flight work.
 *
 * Each row is failed via `markJobFailed`, which also bridges into the
 * error_events stream — so a sweep produces visible drilldown rows
 * for the operator to triage, not silent state flips.
 */
export async function failStaleRunningJobs(
  input: FailStaleRunningJobsInput,
  options: ServiceOptions = {},
): Promise<FailStaleRunningJobsResult> {
  // Empty jobKind array → vacuous IN clause; short-circuit BEFORE
  // probing ASDB so a no-op operator click doesn't fail when the DB
  // is down. Matches the enqueueJobs (#547) empty-array contract.
  if (Array.isArray(input.jobKind) && input.jobKind.length === 0) {
    return { failed: [], scanned: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const limit = input.limit ?? 100;
  const errorMessage = input.errorMessage ?? DEFAULT_FAIL_STALE_MESSAGE;

  const filters = [
    eq(agsWorkspaceBackgroundJobs.status, "running"),
    lt(agsWorkspaceBackgroundJobs.updatedAt, input.olderThan),
  ];
  const jobKindInput = input.jobKind;
  if (jobKindInput !== undefined) {
    if (Array.isArray(jobKindInput)) {
      filters.push(inArray(agsWorkspaceBackgroundJobs.jobKind, jobKindInput));
    } else {
      filters.push(
        eq(agsWorkspaceBackgroundJobs.jobKind, jobKindInput as string),
      );
    }
  }

  const stale = await db
    .select({ id: agsWorkspaceBackgroundJobs.id })
    .from(agsWorkspaceBackgroundJobs)
    .where(and(...filters))
    .orderBy(agsWorkspaceBackgroundJobs.updatedAt) // oldest first
    .limit(limit);

  const failed: BackgroundJobRow[] = [];
  for (const { id } of stale) {
    // Re-check status — the row may have completed between the SELECT
    // and the UPDATE. markJobFailed force-flips regardless, but
    // skipping here keeps the result count honest.
    const current = await getJobById(id, options);
    if (!current || current.status !== "running") continue;
    const row = await markJobFailed(id, errorMessage, options);
    failed.push(row);
  }
  return { failed, scanned: stale.length };
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

export interface RetryJobsResult {
  /** Jobs that were successfully flipped failed→pending. */
  readonly retried: readonly BackgroundJobRow[];
  /**
   * Jobs that were skipped, with the reason: either "not_found" (the
   * id didn't match a row) or "not_retryable" (status wasn't
   * "failed"). The bulk operator wants partial success so a single
   * stuck row doesn't block the whole batch.
   */
  readonly skipped: ReadonlyArray<{
    readonly jobId: number;
    readonly reason: "not_found" | "not_retryable";
    readonly currentStatus?: JobStatus;
  }>;
}

/**
 * Bulk operator retry: call retryJob() for each id, partitioning
 * results into retried + skipped instead of failing fast on the
 * first non-retryable id. The dashboard "retry all selected" button
 * uses this — operators select multiple failed rows, the call
 * retries the ones that are still failed, reports the rest.
 *
 * Empty input short-circuits to {retried: [], skipped: []}.
 * Unknown errors (e.g. AsdbUnavailableError) propagate so the
 * operator's batch fails loudly instead of silently reporting
 * partial success.
 */
export async function retryJobs(
  jobIds: readonly number[],
  options: ServiceOptions = {},
): Promise<RetryJobsResult> {
  if (jobIds.length === 0) return { retried: [], skipped: [] };

  // Probe ASDB upfront so a null DB fails the whole batch loudly
  // instead of having every id skip-as-not_found (since getJobById is
  // fail-soft on ASDB-null and would translate the infra failure
  // into per-row JobNotFoundError noise).
  const probeDb = (options.getDb ?? getAsDb)();
  if (!probeDb) throw new AsdbUnavailableError();

  const retried: BackgroundJobRow[] = [];
  const skipped: Array<{
    jobId: number;
    reason: "not_found" | "not_retryable";
    currentStatus?: JobStatus;
  }> = [];

  for (const jobId of jobIds) {
    try {
      const row = await retryJob(jobId, options);
      retried.push(row);
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        skipped.push({ jobId, reason: "not_found" });
      } else if (err instanceof JobNotRetryableError) {
        skipped.push({
          jobId,
          reason: "not_retryable",
          currentStatus: err.currentStatus,
        });
      } else {
        throw err;
      }
    }
  }

  return { retried, skipped };
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
  /**
   * Optional jobKind filter — single string (`eq`) or array (`IN`).
   * Lets an operator/cron prune one worker's old rows without
   * touching others. Mirrors the array pattern on
   * failStaleRunningJobs.jobKind (#548).
   *
   * Empty array short-circuits to `{deletedCount: 0}` (vacuous IN),
   * with no DB call so a no-op operator click doesn't fail when
   * ASDB is down.
   */
  readonly jobKind?: string | readonly string[];
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
  // Empty jobKind array → vacuous IN; short-circuit BEFORE the ASDB
  // probe (matches failStaleRunningJobs #548 + enqueueJobs #547).
  if (Array.isArray(input.jobKind) && input.jobKind.length === 0) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsWorkspaceBackgroundJobs.updatedAt, input.olderThan),
    inArray(agsWorkspaceBackgroundJobs.status, statuses as JobStatus[]),
  ];
  const jobKindInput = input.jobKind;
  if (jobKindInput !== undefined) {
    if (Array.isArray(jobKindInput)) {
      filters.push(inArray(agsWorkspaceBackgroundJobs.jobKind, jobKindInput));
    } else {
      filters.push(
        eq(agsWorkspaceBackgroundJobs.jobKind, jobKindInput as string),
      );
    }
  }

  const deleted = await db
    .delete(agsWorkspaceBackgroundJobs)
    .where(and(...filters))
    .returning({ id: agsWorkspaceBackgroundJobs.id });

  return { deletedCount: deleted.length };
}
