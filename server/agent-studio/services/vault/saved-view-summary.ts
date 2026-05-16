/**
 * `summarizeSavedViews` — stable-shape aggregator over the
 * `agsVaultSavedViews` row surface (T-B.7).
 *
 * Companion to the new `SAVED_VIEW_VISIBILITIES` tuple promotion +
 * T-B.6 `defaultLensKind` field on view blueprints (#1178). 18th
 * instantiation of the lesson-30 aggregator-pair pattern in the
 * post-compaction resume window.
 *
 * Use case: the saved-views admin panel needs a one-line rollup
 * ("128 saved views — 96 personal / 32 shared — 24 forked — 12
 * distinct vaults — most popular: note_list").
 *
 * Stable-shape guarantees:
 *   - `byVisibility[v]` zero-filled across `SAVED_VIEW_VISIBILITIES`.
 *   - `byViewKind` is sparse (viewKind is an open-ended string
 *     keyed by view-kind blueprints).
 *   - `withOwnerCount` counts non-null `ownerUserId`.
 *   - `forkedCount` counts non-null `parentSavedViewId` (saved-view
 *     fork-chain root vs. derived rows).
 *   - `distinctVaultCount` reports unique `vaultId` values.
 *   - `versionStats` over the `version` column — null when input
 *     empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  SAVED_VIEW_VISIBILITIES,
  type SavedViewRow,
  type SavedViewVisibility,
} from "./saved-views.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface SavedViewListSummary {
  readonly total: number;
  /** Per-visibility count, zero-filled. */
  readonly byVisibility: Readonly<Record<SavedViewVisibility, number>>;
  /** Per-viewKind count. Sparse — viewKind is an open-ended string
   *  (keyed by view-kind blueprints, but the blueprint set may
   *  extend without the aggregator knowing). */
  readonly byViewKind: Readonly<Record<string, number>>;
  /** Distinct view-kind values across the input. */
  readonly distinctViewKindCount: number;
  /** Rows with `ownerUserId !== null` (operator-owned vs. system). */
  readonly withOwnerCount: number;
  /** Rows with `parentSavedViewId !== null` (forked saved views;
   *  non-zero indicates a save-view fork-chain). */
  readonly forkedCount: number;
  /** Distinct `vaultId` values across the input — for cross-vault
   *  saved-view rollups. */
  readonly distinctVaultCount: number;
  /** Version stats across all rows. */
  readonly versionStats: NumericStats | null;
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

export function summarizeSavedViews(
  rows: readonly SavedViewRow[],
): SavedViewListSummary {
  const byVisibility: Record<string, number> = {};
  for (const v of SAVED_VIEW_VISIBILITIES) byVisibility[v] = 0;
  const byViewKind: Record<string, number> = {};

  let withOwnerCount = 0;
  let forkedCount = 0;
  const vaultIds = new Set<number>();
  const versions: number[] = [];

  for (const row of rows) {
    byVisibility[row.visibility] = (byVisibility[row.visibility] ?? 0) + 1;
    byViewKind[row.viewKind] = (byViewKind[row.viewKind] ?? 0) + 1;
    if (row.ownerUserId !== null) withOwnerCount += 1;
    if (row.parentSavedViewId !== null) forkedCount += 1;
    vaultIds.add(row.vaultId);
    versions.push(row.version);
  }

  return {
    total: rows.length,
    byVisibility: byVisibility as Readonly<
      Record<SavedViewVisibility, number>
    >,
    byViewKind,
    distinctViewKindCount: Object.keys(byViewKind).length,
    withOwnerCount,
    forkedCount,
    distinctVaultCount: vaultIds.size,
    versionStats: computeStats(versions),
  };
}
