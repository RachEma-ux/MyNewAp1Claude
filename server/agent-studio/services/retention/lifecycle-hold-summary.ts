/**
 * `summarizeLifecycleHolds` — stable-shape aggregator over the
 * `LifecycleHoldRow[]` surface (T-L.7).
 *
 * 29th instantiation of the lesson-30 aggregator-pair pattern.
 * Composite slice — composes sparse open-ended axes (entityType +
 * holdType) + top-N truncation + dual complementary partitions
 * (active/released, definite/indefinite) + presence gauges + age
 * stats. No new structural variant; catalog saturated at 15 @ T-A.15.
 *
 * Use case: retention-hold dashboard. Operators want both per-entity-
 * type rollup ("which kinds of entities have holds") AND per-hold-
 * type rollup ("are most holds litigation or audit") AND active-
 * vs-released split (sum-to-total) AND definite-vs-indefinite split
 * (holds with vs without `holdUntil` deadline — operational SLA
 * signal: indefinite holds need manual review).
 *
 * Stable-shape guarantees:
 *   - `byEntityType` is sparse (open-ended string axis).
 *   - `byHoldType` is sparse (open-ended string axis).
 *   - `topEntityTypes` / `topHoldTypes` truncate at 10; ties alpha.
 *   - `activeCount + releasedCount === total` (complementary on
 *     `releasedAt` nullable).
 *   - `definiteHoldCount + indefiniteHoldCount === total`
 *     (complementary on `holdUntil` nullable).
 *   - `ageStats` is null when input is empty (NumericStats over
 *     `now - setAt`).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { LifecycleHoldRow } from "./lifecycle-holds-management.js";

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

export interface LifecycleHoldListSummary {
  readonly total: number;
  /** Per-entityType count. Sparse — open-ended string axis. */
  readonly byEntityType: Readonly<Record<string, number>>;
  /** Per-holdType count. Sparse — open-ended string axis. */
  readonly byHoldType: Readonly<Record<string, number>>;
  /** Distinct entityType values. */
  readonly distinctEntityTypeCount: number;
  /** Distinct holdType values. */
  readonly distinctHoldTypeCount: number;
  /** Distinct entityId values (regardless of entityType). */
  readonly distinctEntityCount: number;
  /** Top 10 entityTypes by count, sorted descending. Alphabetical ties. */
  readonly topEntityTypes: readonly CountEntry[];
  /** Top 10 holdTypes by count, sorted descending. Alphabetical ties. */
  readonly topHoldTypes: readonly CountEntry[];
  /** Rows with `releasedAt === null` (still active). */
  readonly activeCount: number;
  /** Rows with `releasedAt !== null` (already released). Complementary
   *  to activeCount; sum-to-total. */
  readonly releasedCount: number;
  /** Rows with `holdUntil !== null` (have deadline). */
  readonly definiteHoldCount: number;
  /** Rows with `holdUntil === null` (indefinite hold). Complementary
   *  to definiteHoldCount; sum-to-total. */
  readonly indefiniteHoldCount: number;
  /** Rows with `reason !== null`. */
  readonly withReasonCount: number;
  /** Rows with `setBy !== null` (have an actor). */
  readonly withSetByCount: number;
  /** Rows with `releaseNote !== null`. */
  readonly withReleaseNoteCount: number;
  /** Age stats in ms from `setAt` to `now`. Null on empty input. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeLifecycleHoldsOptions {
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
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return entries.slice(0, n);
}

export function summarizeLifecycleHolds(
  rows: readonly LifecycleHoldRow[],
  options: SummarizeLifecycleHoldsOptions = {},
): LifecycleHoldListSummary {
  const byEntityType: Record<string, number> = {};
  const byHoldType: Record<string, number> = {};
  const entityKeys = new Set<string>();
  let activeCount = 0;
  let releasedCount = 0;
  let definiteHoldCount = 0;
  let indefiniteHoldCount = 0;
  let withReasonCount = 0;
  let withSetByCount = 0;
  let withReleaseNoteCount = 0;
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    byEntityType[row.entityType] = (byEntityType[row.entityType] ?? 0) + 1;
    byHoldType[row.holdType] = (byHoldType[row.holdType] ?? 0) + 1;
    entityKeys.add(`${row.entityType}:${row.entityId}`);
    if (row.releasedAt === null) activeCount += 1;
    else releasedCount += 1;
    if (row.holdUntil !== null) definiteHoldCount += 1;
    else indefiniteHoldCount += 1;
    if (row.reason !== null) withReasonCount += 1;
    if (row.setBy !== null) withSetByCount += 1;
    if (row.releaseNote !== null) withReleaseNoteCount += 1;
    ages.push(now - row.setAt.getTime());
  }

  return {
    total: rows.length,
    byEntityType,
    byHoldType,
    distinctEntityTypeCount: Object.keys(byEntityType).length,
    distinctHoldTypeCount: Object.keys(byHoldType).length,
    distinctEntityCount: entityKeys.size,
    topEntityTypes: topN(byEntityType, top),
    topHoldTypes: topN(byHoldType, top),
    activeCount,
    releasedCount,
    definiteHoldCount,
    indefiniteHoldCount,
    withReasonCount,
    withSetByCount,
    withReleaseNoteCount,
    ageStats: computeStats(ages),
  };
}
