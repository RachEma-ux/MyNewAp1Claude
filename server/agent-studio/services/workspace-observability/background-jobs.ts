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

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsWorkspaceBackgroundJobs } from "../../../../drizzle/tables/agent-studio-graph-quality.js";

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
  return transitionStatus(
    jobId,
    { status: "failed", lastError: errorMessage },
    options,
  );
}

export async function markJobCancelled(
  jobId: number,
  options: ServiceOptions = {},
): Promise<BackgroundJobRow> {
  return transitionStatus(jobId, { status: "cancelled" }, options);
}
