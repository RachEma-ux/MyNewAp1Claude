/**
 * `summarizePublishTargets` — stable-shape row-state aggregator over
 * `PublishTargetRecord[]` (T-X.7).
 *
 * Companion to T-G.54 `HTTP_METHOD_METADATA` and T-X-prior
 * publish-target-type metadata. 7th instantiation of the lesson-30
 * aggregator-pair pattern across the post-compaction resume window
 * (lane-hook / extensions / scanner / CAG / commands / proposed-tool-
 * calls / publish-targets).
 *
 * Use case: the publish-targets admin panel (shipped at #937 / #962)
 * renders a registry table. The header-line summary (#962 / #970
 * /#972) is per-row counts. THIS aggregator gives the full row-state
 * surface in one call so the panel doesn't have to recompute the
 * same totals across multiple useMemo hooks.
 *
 * Stable-shape guarantees:
 *   - `byTargetType[type]` zero-filled across the closed taxonomy.
 *   - `enabledPercent` / `withProviderConnectionPercent` rounded to
 *     1 decimal; 0-on-empty (no NaN).
 *   - `enabledCount` + `disabledCount` sums to `total` (asserted in
 *     lockstep).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  PUBLISH_TARGET_TYPES,
  type PublishTargetRecord,
  type PublishTargetType,
} from "./types.js";

export interface PublishTargetListSummary {
  readonly total: number;
  /** Per-targetType count, zero-filled across the closed taxonomy. */
  readonly byTargetType: Readonly<Record<PublishTargetType, number>>;
  /** Targets with `enabled === true`. */
  readonly enabledCount: number;
  /** Targets with `enabled === false`. */
  readonly disabledCount: number;
  /** `enabledCount / total * 100`, rounded to 1 decimal. 0 on empty. */
  readonly enabledPercent: number;
  /** Targets with a non-null `providerConnectionId`. */
  readonly withProviderConnectionCount: number;
  /** `withProviderConnectionCount / total * 100`, rounded to 1
   *  decimal. 0 on empty. */
  readonly withProviderConnectionPercent: number;
  /** Targets with a non-null `config`. */
  readonly withConfigCount: number;
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizePublishTargets(
  records: readonly PublishTargetRecord[],
): PublishTargetListSummary {
  const byTargetType: Record<string, number> = {};
  for (const t of PUBLISH_TARGET_TYPES) byTargetType[t] = 0;

  let enabledCount = 0;
  let withProviderConnectionCount = 0;
  let withConfigCount = 0;

  for (const r of records) {
    byTargetType[r.targetType] = (byTargetType[r.targetType] ?? 0) + 1;
    if (r.enabled) enabledCount += 1;
    if (r.providerConnectionId !== null) withProviderConnectionCount += 1;
    if (r.config !== null) withConfigCount += 1;
  }

  const total = records.length;
  return {
    total,
    byTargetType: byTargetType as Readonly<
      Record<PublishTargetType, number>
    >,
    enabledCount,
    disabledCount: total - enabledCount,
    enabledPercent: roundPercent(enabledCount, total),
    withProviderConnectionCount,
    withProviderConnectionPercent: roundPercent(
      withProviderConnectionCount,
      total,
    ),
    withConfigCount,
  };
}
