/**
 * `summarizePublishExecutions` — stable-shape row-state aggregator
 * over `PublishExecutionRow[]` (T-E.7).
 *
 * Companion to T-X.7 `summarizePublishTargets` (#1188) — the
 * publish-target row-state aggregator. Where T-X.7 reports on
 * configured target registry rows, this one reports on EXECUTION
 * rows (per-promotion publish attempts). Together they answer
 * "what's configured" + "what's been attempted" on the publish-
 * targets surface.
 *
 * 8th instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window.
 *
 * Use case: the publish-targets admin panel already renders header
 * summaries per-target (#957 / #964) + duration columns (#945) +
 * success rate (#974). THIS aggregator gives the full execution-list
 * surface in one call so the panel doesn't recompute the same totals
 * across multiple useMemo hooks.
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across the closed taxonomy.
 *   - Unknown status values counted via `unknownStatusCount` axis
 *     (never pollutes the closed-taxonomy counters).
 *   - `successRate` = succeeded / (succeeded + failed) × 100,
 *     rounded to 1 decimal. `null` when 0 rows are settled (no NaN).
 *   - `durationStats` is null when 0 rows have BOTH startedAt +
 *     completedAt (no NaN).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  PUBLISH_EXECUTION_STATUSES,
  PUBLISH_EXECUTION_STATUS_METADATA,
  type PublishExecutionStatus,
} from "./types.js";
import type { PublishExecutionRow } from "./admin-queries.js";

export interface ExecutionDurationStats {
  readonly count: number;
  readonly sumMs: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface PublishExecutionListSummary {
  readonly total: number;
  /** Per-status count, zero-filled across the closed taxonomy. */
  readonly byStatus: Readonly<Record<PublishExecutionStatus, number>>;
  /** Rows whose `status` is not in `PUBLISH_EXECUTION_STATUSES`. Should
   *  be 0 in steady state — non-zero indicates a schema drift. */
  readonly unknownStatusCount: number;
  /** Rows whose status is terminal (succeeded + failed). Derived from
   *  `PUBLISH_EXECUTION_STATUS_METADATA[*].terminal`. */
  readonly terminalCount: number;
  /** Rows whose status is non-terminal (pending + in_flight). */
  readonly inFlightCount: number;
  /** Rows with status `succeeded`. */
  readonly succeededCount: number;
  /** Rows with status `failed`. */
  readonly failedCount: number;
  /** `succeededCount / (succeededCount + failedCount) * 100`, rounded
   *  to 1 decimal. `null` when 0 rows are settled (no NaN/0 ambiguity
   *  — "no signal yet" vs "0%"). */
  readonly successRate: number | null;
  /** Rows with a non-null `errorMessage` — usually but not necessarily
   *  the `failed` rows. */
  readonly withErrorMessageCount: number;
  /** Rows with a non-null `upstreamArtifactId` — succeeded executions
   *  that recorded the upstream id. */
  readonly withUpstreamArtifactCount: number;
  /** Distinct `targetId` values across the input. */
  readonly distinctTargetCount: number;
  /** Distinct `sourcePromotionId` values across the input. */
  readonly distinctPromotionCount: number;
  /** Duration stats in milliseconds over rows with BOTH `startedAt` +
   *  `completedAt` non-null. `null` when 0 rows have both. */
  readonly durationStats: ExecutionDurationStats | null;
}

function isPublishExecutionStatus(
  s: string,
): s is PublishExecutionStatus {
  return (PUBLISH_EXECUTION_STATUSES as readonly string[]).includes(s);
}

function computeDurationStats(
  durations: readonly number[],
): ExecutionDurationStats | null {
  if (durations.length === 0) return null;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const d of durations) {
    sum += d;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return {
    count: durations.length,
    sumMs: sum,
    meanMs: Math.round(sum / durations.length),
    minMs: min,
    maxMs: max,
  };
}

export function summarizePublishExecutions(
  rows: readonly PublishExecutionRow[],
): PublishExecutionListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of PUBLISH_EXECUTION_STATUSES) byStatus[s] = 0;
  let unknownStatusCount = 0;
  let withErrorMessageCount = 0;
  let withUpstreamArtifactCount = 0;
  const targetIds = new Set<number>();
  const promotionIds = new Set<number>();
  const durations: number[] = [];

  for (const row of rows) {
    if (isPublishExecutionStatus(row.status)) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    } else {
      unknownStatusCount += 1;
    }
    if (row.errorMessage !== null) withErrorMessageCount += 1;
    if (row.upstreamArtifactId !== null) withUpstreamArtifactCount += 1;
    targetIds.add(row.targetId);
    promotionIds.add(row.sourcePromotionId);
    if (row.startedAt !== null && row.completedAt !== null) {
      durations.push(row.completedAt.getTime() - row.startedAt.getTime());
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of PUBLISH_EXECUTION_STATUSES) {
    const meta = PUBLISH_EXECUTION_STATUS_METADATA[status];
    if (meta.terminal) {
      terminalCount += byStatus[status];
    } else {
      inFlightCount += byStatus[status];
    }
  }
  const succeededCount = byStatus.succeeded;
  const failedCount = byStatus.failed;
  const settled = succeededCount + failedCount;
  const successRate =
    settled === 0
      ? null
      : Math.round((succeededCount / settled) * 1000) / 10;

  return {
    total: rows.length,
    byStatus: byStatus as Readonly<
      Record<PublishExecutionStatus, number>
    >,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    succeededCount,
    failedCount,
    successRate,
    withErrorMessageCount,
    withUpstreamArtifactCount,
    distinctTargetCount: targetIds.size,
    distinctPromotionCount: promotionIds.size,
    durationStats: computeDurationStats(durations),
  };
}
