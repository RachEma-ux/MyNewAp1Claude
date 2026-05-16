/**
 * `summarizeErrorEvents` — stable-shape aggregator over the raw
 * `ErrorEventRow[]` surface (T-I.34).
 *
 * Companion to T-I.23 `summarizeFailureStateOccurrences` (#1046)
 * which operates on the CLOSED-TAXONOMY subset of error events
 * (those carrying a `failure_state:<kind>` errorClass per T-I.5
 * bridge). THIS aggregator operates on the FULL row surface
 * including free-form errorClass values not yet migrated to the
 * closed taxonomy.
 *
 * 20th instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window.
 *
 * Use case: the observability dashboard needs a one-line rollup
 * over the raw error stream ("128 events — 56 distinct error
 * classes / 14 distinct sources / 12 with user — oldest 3 days").
 *
 * Stable-shape guarantees:
 *   - `bySourceKind` is sparse (open-ended string axis).
 *   - `byErrorClass` is sparse (open-ended string axis).
 *   - `topSourceKinds` / `topErrorClasses` truncate at 10 entries
 *     to keep the rollup bounded — operators drill into the full
 *     histogram if needed.
 *   - `ageStats` is null when input is empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { ErrorEventRow } from "./error-events.js";

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

export interface ErrorEventListSummary {
  readonly total: number;
  /** Per-sourceKind count. Sparse — open-ended string axis. */
  readonly bySourceKind: Readonly<Record<string, number>>;
  /** Per-errorClass count. Sparse — open-ended string axis. */
  readonly byErrorClass: Readonly<Record<string, number>>;
  /** Distinct sourceKind values. */
  readonly distinctSourceKindCount: number;
  /** Distinct errorClass values. */
  readonly distinctErrorClassCount: number;
  /** Top 10 source kinds by count, sorted descending. Ties broken
   *  by sourceKind alphabetical order. */
  readonly topSourceKinds: readonly CountEntry[];
  /** Top 10 error classes by count, sorted descending. Ties broken
   *  alphabetically. */
  readonly topErrorClasses: readonly CountEntry[];
  /** Rows with `userId !== null`. */
  readonly withUserCount: number;
  /** Rows with `metadata !== null`. */
  readonly withMetadataCount: number;
  /** Age stats in milliseconds from `createdAt` to `now`. Null when
   *  input is empty. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeErrorEventsOptions {
  /** Override the clock for deterministic age-stats. */
  readonly now?: Date;
  /** Override the top-N truncation (default 10). */
  readonly topN?: number;
}

const DEFAULT_TOP_N = 10;

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
  // Sort: count desc, then key asc.
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return entries.slice(0, n);
}

export function summarizeErrorEvents(
  rows: readonly ErrorEventRow[],
  options: SummarizeErrorEventsOptions = {},
): ErrorEventListSummary {
  const bySourceKind: Record<string, number> = {};
  const byErrorClass: Record<string, number> = {};
  let withUserCount = 0;
  let withMetadataCount = 0;
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    bySourceKind[row.sourceKind] = (bySourceKind[row.sourceKind] ?? 0) + 1;
    byErrorClass[row.errorClass] = (byErrorClass[row.errorClass] ?? 0) + 1;
    if (row.userId !== null) withUserCount += 1;
    if (row.metadata !== null) withMetadataCount += 1;
    ages.push(now - row.createdAt.getTime());
  }

  return {
    total: rows.length,
    bySourceKind,
    byErrorClass,
    distinctSourceKindCount: Object.keys(bySourceKind).length,
    distinctErrorClassCount: Object.keys(byErrorClass).length,
    topSourceKinds: topN(bySourceKind, top),
    topErrorClasses: topN(byErrorClass, top),
    withUserCount,
    withMetadataCount,
    ageStats: computeStats(ages),
  };
}
