/**
 * `summarizePromotions` — stable-shape row-state aggregator over an
 * opaque promotion-row list (T-G.62).
 *
 * Companion to T-G.47 `PROMOTION_STATUS_METADATA` (#1163). 9th
 * instantiation of the lesson-30 aggregator-pair pattern in the
 * post-compaction resume window.
 *
 * Uses the generic-accessor signature pattern from T-D.8
 * `summarizeQualityFindings` (#1057) — the aggregator doesn't import
 * a specific row type because `agsNotePromotions` query shapes vary
 * by caller (some include `decidedByUserId` joins, some don't). The
 * caller supplies a `getStatus` accessor and (optionally) a
 * `getCreatedAt` accessor for age stats.
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across `PROMOTION_STATUSES`.
 *   - Unknown status values counted via `unknownStatusCount` axis
 *     (schema-drift detector — never pollutes the closed counters).
 *   - `terminalCount` + `inFlightCount` derived from
 *     `PROMOTION_STATUS_METADATA[*].terminal`.
 *   - `producedActiveVersionCount` derived from
 *     `PROMOTION_STATUS_METADATA[*].producedActiveVersion` — counts
 *     promotions that materialized an active version.
 *   - `successRate` = approved / (approved + rejected) × 100, rounded
 *     to 1 decimal. `null` when 0 settled-with-decision rows (no
 *     NaN; "no signal yet" vs "0%" disambiguation).
 *   - `oldestAgeStats` is null when 0 rows have a `createdAt`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  PROMOTION_STATUSES,
  PROMOTION_STATUS_METADATA,
  type PromotionStatus,
} from "./lifecycle.js";

export interface PromotionAgeStats {
  readonly count: number;
  readonly sumMs: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface PromotionListSummary {
  readonly total: number;
  /** Per-status count, zero-filled across the closed taxonomy. */
  readonly byStatus: Readonly<Record<PromotionStatus, number>>;
  /** Rows whose status is not in `PROMOTION_STATUSES`. Should be 0
   *  in steady state. */
  readonly unknownStatusCount: number;
  /** Rows whose status is terminal per metadata
   *  (`approved` + `rejected` + `rolled_back`). */
  readonly terminalCount: number;
  /** Rows whose status is non-terminal
   *  (`pending` + `validating` + `in_review`). */
  readonly inFlightCount: number;
  /** Rows whose status materialized an active version
   *  (`approved` only, per metadata `.producedActiveVersion`). */
  readonly producedActiveVersionCount: number;
  /** `byStatus.approved / (byStatus.approved + byStatus.rejected) × 100`,
   *  1-decimal. `null` when 0 settled-with-decision rows. Excludes
   *  rolled_back because rollback ≠ rejection at decision time. */
  readonly successRate: number | null;
  /** Age stats in milliseconds from row `createdAt` to `now`. Null
   *  when 0 rows have a `createdAt`. */
  readonly ageStats: PromotionAgeStats | null;
}

export interface SummarizePromotionsOptions<T> {
  /** Optional `createdAt` accessor for age stats. If omitted, age
   *  stats are not computed (null in result). */
  readonly getCreatedAt?: (item: T) => Date | null | undefined;
  /** Override the clock for deterministic tests. */
  readonly now?: Date;
}

function computeAgeStats(durations: readonly number[]): PromotionAgeStats | null {
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

function isPromotionStatus(s: string): s is PromotionStatus {
  return (PROMOTION_STATUSES as readonly string[]).includes(s);
}

export function summarizePromotions<T>(
  records: readonly T[],
  getStatus: (item: T) => string,
  options: SummarizePromotionsOptions<T> = {},
): PromotionListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of PROMOTION_STATUSES) byStatus[s] = 0;
  let unknownStatusCount = 0;

  const ages: number[] = [];
  const now = (options.now ?? new Date()).getTime();
  const getCreatedAt = options.getCreatedAt;

  for (const r of records) {
    const status = getStatus(r);
    if (isPromotionStatus(status)) {
      byStatus[status] += 1;
    } else {
      unknownStatusCount += 1;
    }
    if (getCreatedAt) {
      const createdAt = getCreatedAt(r);
      if (createdAt instanceof Date) {
        ages.push(now - createdAt.getTime());
      }
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  let producedActiveVersionCount = 0;
  for (const status of PROMOTION_STATUSES) {
    const meta = PROMOTION_STATUS_METADATA[status];
    const count = byStatus[status];
    if (meta.terminal) terminalCount += count;
    else inFlightCount += count;
    if (meta.producedActiveVersion) producedActiveVersionCount += count;
  }

  const approved = byStatus.approved;
  const rejected = byStatus.rejected;
  const decided = approved + rejected;
  const successRate =
    decided === 0
      ? null
      : Math.round((approved / decided) * 1000) / 10;

  return {
    total: records.length,
    byStatus: byStatus as Readonly<Record<PromotionStatus, number>>,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    producedActiveVersionCount,
    successRate,
    ageStats: computeAgeStats(ages),
  };
}
