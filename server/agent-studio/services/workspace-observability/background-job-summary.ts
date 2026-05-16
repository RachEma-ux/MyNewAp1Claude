/**
 * `summarizeBackgroundJobs` — stable-shape aggregator over the
 * `BackgroundJobRow[]` surface (T-I.35).
 *
 * Companion to the `BACKGROUND_JOB_STATUSES` tuple promotion in
 * the same PR. 21st instantiation of the lesson-30 aggregator-pair
 * pattern in the post-compaction resume window.
 *
 * Use case: the workspace-observability admin panel needs a one-line
 * rollup over background-job queue health ("128 jobs — 64 completed
 * / 4 failed / 12 running — mean 2.3 attempts — oldest 4h").
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across `BACKGROUND_JOB_STATUSES`.
 *   - `unknownStatusCount` partitions drift.
 *   - `terminalCount` derived from `TERMINAL_BACKGROUND_JOB_STATUSES`.
 *   - `attemptStats` over the `attempts` column (every row counted).
 *   - `withLastErrorCount` counts rows with non-null lastError.
 *   - sparse `byJobKind` (open-ended string axis) — like
 *     summarizeErrorEvents bySourceKind.
 *   - `topJobKinds` top-N truncation.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  BACKGROUND_JOB_STATUSES,
  TERMINAL_BACKGROUND_JOB_STATUSES,
  type BackgroundJobRow,
  type JobStatus,
} from "./background-jobs.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface CountEntry {
  readonly key: string;
  readonly count: number;
}

export interface BackgroundJobListSummary {
  readonly total: number;
  /** Per-status count, zero-filled across closed taxonomy. */
  readonly byStatus: Readonly<Record<JobStatus, number>>;
  /** Rows whose status isn't in `BACKGROUND_JOB_STATUSES`. */
  readonly unknownStatusCount: number;
  /** Rows whose status is in `TERMINAL_BACKGROUND_JOB_STATUSES`. */
  readonly terminalCount: number;
  /** Rows whose status is NOT terminal (pending + running). */
  readonly inFlightCount: number;
  /** Stats over `attempts` across all rows. */
  readonly attemptStats: NumericStats | null;
  /** Rows with `lastError !== null`. */
  readonly withLastErrorCount: number;
  /** Sparse per-jobKind count. */
  readonly byJobKind: Readonly<Record<string, number>>;
  /** Distinct job-kind values. */
  readonly distinctJobKindCount: number;
  /** Top-N job kinds by count desc, ties alphabetical. */
  readonly topJobKinds: readonly CountEntry[];
  /** Age stats in ms from `createdAt` to `now`. Null on empty. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeBackgroundJobsOptions {
  readonly now?: Date;
  readonly topN?: number;
}

const DEFAULT_TOP_N = 10;

function isJobStatus(s: string): s is JobStatus {
  return (BACKGROUND_JOB_STATUSES as readonly string[]).includes(s);
}

function computeStats(values: readonly number[]): NumericStats | null {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: values.length,
    sum,
    mean: Math.round((sum / values.length) * 10) / 10,
    min,
    max,
  };
}

function topN(
  byKey: Readonly<Record<string, number>>,
  n: number,
): CountEntry[] {
  const entries = Object.entries(byKey).map(([key, count]) => ({
    key,
    count,
  }));
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return entries.slice(0, n);
}

export function summarizeBackgroundJobs(
  rows: readonly BackgroundJobRow[],
  options: SummarizeBackgroundJobsOptions = {},
): BackgroundJobListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of BACKGROUND_JOB_STATUSES) byStatus[s] = 0;
  const byJobKind: Record<string, number> = {};

  let unknownStatusCount = 0;
  let withLastErrorCount = 0;
  const attempts: number[] = [];
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    if (isJobStatus(row.status)) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    } else {
      unknownStatusCount += 1;
    }
    byJobKind[row.jobKind] = (byJobKind[row.jobKind] ?? 0) + 1;
    if (row.lastError !== null) withLastErrorCount += 1;
    attempts.push(row.attempts);
    ages.push(now - row.createdAt.getTime());
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of BACKGROUND_JOB_STATUSES) {
    if (TERMINAL_BACKGROUND_JOB_STATUSES.has(status)) {
      terminalCount += byStatus[status];
    } else {
      inFlightCount += byStatus[status];
    }
  }

  return {
    total: rows.length,
    byStatus: byStatus as Readonly<Record<JobStatus, number>>,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    attemptStats: computeStats(attempts),
    withLastErrorCount,
    byJobKind,
    distinctJobKindCount: Object.keys(byJobKind).length,
    topJobKinds: topN(byJobKind, top),
    ageStats: computeStats(ages),
  };
}
