/**
 * Universal error event log file — scheduled retention sweep cron.
 *
 * Sister of #645/#646 (cag-pack-events) and the 5 other daily-sweep
 * crons in the retention ladder. Runs daily; deletes
 * `logs/error-events-YYYY-MM-DD.jsonl` files older than the
 * configured retention window.
 *
 * Defaults:
 *  - Cron: `"30 9 * * *"` — daily 09:30 UTC. Slot 7.5 in the ladder
 *    (sits between the cag-pack-events sweep at 09:00 and the next
 *    free slot at 10:00 to avoid serial-scan thrash).
 *  - Retention: 30 days
 *
 * Env: `AGS_ERROR_LOG_FILE_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 *
 * Built on the shared `makeRetentionCron({...})` factory (#642).
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../retention/make-retention-cron.js";
import {
  pruneOldErrorLogFiles,
  type PruneOldErrorLogFilesInput,
  type PruneOldErrorLogFilesResult,
} from "./error-log-file-retention.js";

const cron = makeRetentionCron<
  PruneOldErrorLogFilesInput,
  PruneOldErrorLogFilesResult
>({
  logPrefix: "ags-error-log-file-retention-cron",
  envPrefix: "AGS_ERROR_LOG_FILE_RETENTION",
  defaultCronExpr: "30 9 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldErrorLogFilesInput,
  // The sweep is synchronous (fs ops). Wrap in Promise.resolve for the
  // factory's async-tick contract.
  runSweep: (input) => Promise.resolve(pruneOldErrorLogFiles(input)),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} bytesFreed=${r.bytesFreed} skipped=${r.skippedCount} errors=${r.errors.length} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_ERROR_LOG_FILE_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_ERROR_LOG_FILE_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickErrorLogFileRetentionCronOptions = TickRetentionCronOptions<
  PruneOldErrorLogFilesInput,
  PruneOldErrorLogFilesResult
>;
export type TickErrorLogFileRetentionCronResult =
  TickRetentionCronResult<PruneOldErrorLogFilesResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldErrorLogFilesResult>;
export type ErrorLogFileRetentionCronStatus =
  RetentionCronStatus<PruneOldErrorLogFilesResult>;

export const tickErrorLogFileRetentionCron = cron.tick;
export const getErrorLogFileRetentionCronStatus = cron.getStatus;
export const ensureErrorLogFileRetentionCronStarted = cron.ensureStarted;
export const _resetErrorLogFileRetentionCronForTests = cron.resetForTests;
