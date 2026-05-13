/**
 * Ingestion Jobs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #670. The 12th cron scaffold on the daily-sweep
 * ladder. Sweeps `ags_ingestion_jobs` — the Universal Ingestion
 * (Phase 2-3) lifecycle wrapper.
 *
 * Defaults:
 *  - Cron: `"0 15 * * *"` — daily 15:00 UTC. 13th slot in the
 *    daily-sweep ladder (03-15 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_INGESTION_JOBS_RETENTION_CRON_DISABLED` /
 * `_CRON_EXPR` / `_DAYS`.
 *
 * Built on the shared `makeRetentionCron({...})` factory (#642).
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneOldIngestionJobs,
  type PruneOldIngestionJobsInput,
  type PruneOldIngestionJobsResult,
} from "./ingestion-jobs-retention.js";

const cron = makeRetentionCron<
  PruneOldIngestionJobsInput,
  PruneOldIngestionJobsResult
>({
  logPrefix: "ags-ingestion-jobs-retention-cron",
  envPrefix: "AGS_INGESTION_JOBS_RETENTION",
  defaultCronExpr: "0 15 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldIngestionJobsInput,
  runSweep: (input) => pruneOldIngestionJobs(input),
  formatSweepLogTail: (r, days) =>
    `jobs=${r.deletedJobsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_INGESTION_JOBS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_INGESTION_JOBS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickIngestionJobsRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldIngestionJobsInput,
    PruneOldIngestionJobsResult
  >;
export type TickIngestionJobsRetentionCronResult =
  TickRetentionCronResult<PruneOldIngestionJobsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldIngestionJobsResult>;
export type IngestionJobsRetentionCronStatus =
  RetentionCronStatus<PruneOldIngestionJobsResult>;

export const tickIngestionJobsRetentionCron = cron.tick;
export const getIngestionJobsRetentionCronStatus = cron.getStatus;
export const ensureIngestionJobsRetentionCronStarted = cron.ensureStarted;
export const _resetIngestionJobsRetentionCronForTests = cron.resetForTests;
