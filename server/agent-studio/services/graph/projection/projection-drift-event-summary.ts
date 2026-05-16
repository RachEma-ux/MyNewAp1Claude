/**
 * `summarizeProjectionDriftEvents` — stable-shape aggregator over
 * `agsGraphProjectionDriftEvents` rows (T-G.67).
 *
 * Companion to T-G.39 `DRIFT_CLASS_METADATA`. 23rd instantiation of
 * the lesson-30 aggregator-pair pattern in the post-compaction
 * resume window.
 *
 * Use case: the graph-health admin panel renders drift events
 * (#942 / #952). This aggregator turns the row list into a one-line
 * rollup ("128 events — 80 missing_in_neo4j / 32 extra_in_neo4j /
 * 12 stale_version / 4 permission_leak — 96 remediated — mean age
 * 4h").
 *
 * Stable-shape guarantees:
 *   - `byDriftClass[c]` zero-filled across `DRIFT_CLASSES`.
 *   - `bySeverity[s]` 2-value zero-filled (warning/critical from
 *     metadata).
 *   - `unknownDriftClassCount` partitions drift.
 *   - `remediatedCount` + `unresolvedCount` complement to total
 *     (minus unknowns). `remediationRate` = remediated / settled.
 *   - `securityRelevantCount` derived from metadata
 *     `.isSecurityRelevant` — counts permission_leak rows.
 *   - `ageStats` (`now - detectedAt`) over all rows.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  DRIFT_CLASSES,
  DRIFT_CLASS_METADATA,
  type DriftClass,
  type DriftClassSeverity,
} from "./drift-detector.js";

export const DRIFT_CLASS_SEVERITIES: readonly DriftClassSeverity[] = [
  "warning",
  "critical",
];

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface ProjectionDriftEventListSummary {
  readonly total: number;
  readonly byDriftClass: Readonly<Record<DriftClass, number>>;
  readonly bySeverity: Readonly<Record<DriftClassSeverity, number>>;
  readonly unknownDriftClassCount: number;
  readonly remediatedCount: number;
  readonly unresolvedCount: number;
  /** `remediatedCount / (remediatedCount + unresolvedCount) × 100`,
   *  1-decimal. `null` when no metadata-known rows. */
  readonly remediationRate: number | null;
  /** Rows whose `driftClass` metadata `.isSecurityRelevant === true`
   *  (permission_leak only today). */
  readonly securityRelevantCount: number;
  /** Age stats in milliseconds from `detectedAt` to `now`. Null on
   *  empty input. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeProjectionDriftEventsInput {
  readonly driftClass: string;
  readonly remediatedAt: Date | null;
  readonly detectedAt: Date;
}

export interface SummarizeProjectionDriftEventsOptions {
  readonly now?: Date;
}

function isDriftClass(s: string): s is DriftClass {
  return (DRIFT_CLASSES as readonly string[]).includes(s);
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

export function summarizeProjectionDriftEvents(
  rows: readonly SummarizeProjectionDriftEventsInput[],
  options: SummarizeProjectionDriftEventsOptions = {},
): ProjectionDriftEventListSummary {
  const byDriftClass: Record<string, number> = {};
  for (const c of DRIFT_CLASSES) byDriftClass[c] = 0;
  const bySeverity: Record<string, number> = {};
  for (const s of DRIFT_CLASS_SEVERITIES) bySeverity[s] = 0;

  let unknownDriftClassCount = 0;
  let remediatedCount = 0;
  let unresolvedCount = 0;
  let securityRelevantCount = 0;
  const ages: number[] = [];
  const now = (options.now ?? new Date()).getTime();

  for (const row of rows) {
    if (isDriftClass(row.driftClass)) {
      byDriftClass[row.driftClass] = (byDriftClass[row.driftClass] ?? 0) + 1;
      const meta = DRIFT_CLASS_METADATA[row.driftClass];
      bySeverity[meta.severity] = (bySeverity[meta.severity] ?? 0) + 1;
      if (meta.isSecurityRelevant) securityRelevantCount += 1;
      if (row.remediatedAt !== null) {
        remediatedCount += 1;
      } else {
        unresolvedCount += 1;
      }
    } else {
      unknownDriftClassCount += 1;
    }
    ages.push(now - row.detectedAt.getTime());
  }

  const settled = remediatedCount + unresolvedCount;
  const remediationRate =
    settled === 0
      ? null
      : Math.round((remediatedCount / settled) * 1000) / 10;

  return {
    total: rows.length,
    byDriftClass: byDriftClass as Readonly<Record<DriftClass, number>>,
    bySeverity: bySeverity as Readonly<
      Record<DriftClassSeverity, number>
    >,
    unknownDriftClassCount,
    remediatedCount,
    unresolvedCount,
    remediationRate,
    securityRelevantCount,
    ageStats: computeStats(ages),
  };
}
