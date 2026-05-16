/**
 * `summarizeRacSources` — stable-shape aggregator over the
 * `agsRacSources` row surface (T-A.15).
 *
 * Companion to T-A.10 `RAC_OWNER_MODULES` metadata + T-A.8
 * `RAC_SOURCE_TYPE_METADATA`. 24th instantiation of the lesson-30
 * aggregator-pair pattern in the post-compaction resume window.
 *
 * Use case: the RAC source registry admin panel needs a rollup over
 * source-type + owner-module + enabled state + embedding-binding
 * coverage.
 *
 * Stable-shape guarantees:
 *   - `bySourceType[t]` zero-filled across `RAC_SOURCE_TYPES` (7).
 *   - `byOwnerModule[m]` zero-filled across `RAC_OWNER_MODULES` (4).
 *   - `unknownSourceTypeCount` + `unknownOwnerModuleCount` partition
 *     drift on both axes.
 *   - `enabledCount` + `disabledCount` complementary to total.
 *   - `withEmbeddingProviderCount` counts non-null
 *     embeddingProviderConnectionId (binding completeness signal).
 *   - `withChunkOverrideCount` counts non-null chunkSizeOverride.
 *   - `priorityStats` over the priority column.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  RAC_OWNER_MODULES,
  RAC_SOURCE_TYPES,
  type RacOwnerModule,
  type RacSourceType,
} from "./types.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface RacSourceListSummary {
  readonly total: number;
  /** Per-source-type count, zero-filled. */
  readonly bySourceType: Readonly<Record<RacSourceType, number>>;
  /** Per-owner-module count, zero-filled. */
  readonly byOwnerModule: Readonly<Record<RacOwnerModule, number>>;
  /** Rows whose sourceType isn't in `RAC_SOURCE_TYPES`. */
  readonly unknownSourceTypeCount: number;
  /** Rows whose ownerModule isn't in `RAC_OWNER_MODULES`. */
  readonly unknownOwnerModuleCount: number;
  /** Sources with `enabled === true`. */
  readonly enabledCount: number;
  /** Sources with `enabled === false`. */
  readonly disabledCount: number;
  /** Sources with non-null `embeddingProviderConnectionId` — binding
   *  completeness signal. */
  readonly withEmbeddingProviderCount: number;
  /** Sources with non-null `chunkSizeOverride` (operator override
   *  applied). */
  readonly withChunkOverrideCount: number;
  /** Distinct `profileId` values across the input. */
  readonly distinctProfileCount: number;
  /** Distinct `workspaceId` values across the input. */
  readonly distinctWorkspaceCount: number;
  /** Stats over the `priority` column. */
  readonly priorityStats: NumericStats | null;
}

export interface SummarizeRacSourcesInput {
  readonly workspaceId: number;
  readonly profileId: number;
  readonly sourceType: string;
  readonly ownerModule: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly embeddingProviderConnectionId: number | null;
  readonly chunkSizeOverride: number | null;
}

function isSourceType(s: string): s is RacSourceType {
  return (RAC_SOURCE_TYPES as readonly string[]).includes(s);
}

function isOwnerModule(s: string): s is RacOwnerModule {
  return (RAC_OWNER_MODULES as readonly string[]).includes(s);
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

export function summarizeRacSources(
  rows: readonly SummarizeRacSourcesInput[],
): RacSourceListSummary {
  const bySourceType: Record<string, number> = {};
  for (const t of RAC_SOURCE_TYPES) bySourceType[t] = 0;
  const byOwnerModule: Record<string, number> = {};
  for (const m of RAC_OWNER_MODULES) byOwnerModule[m] = 0;

  let unknownSourceTypeCount = 0;
  let unknownOwnerModuleCount = 0;
  let enabledCount = 0;
  let withEmbeddingProviderCount = 0;
  let withChunkOverrideCount = 0;
  const profileIds = new Set<number>();
  const workspaceIds = new Set<number>();
  const priorities: number[] = [];

  for (const row of rows) {
    if (isSourceType(row.sourceType)) {
      bySourceType[row.sourceType] =
        (bySourceType[row.sourceType] ?? 0) + 1;
    } else {
      unknownSourceTypeCount += 1;
    }
    if (isOwnerModule(row.ownerModule)) {
      byOwnerModule[row.ownerModule] =
        (byOwnerModule[row.ownerModule] ?? 0) + 1;
    } else {
      unknownOwnerModuleCount += 1;
    }
    if (row.enabled) enabledCount += 1;
    if (row.embeddingProviderConnectionId !== null) {
      withEmbeddingProviderCount += 1;
    }
    if (row.chunkSizeOverride !== null) withChunkOverrideCount += 1;
    profileIds.add(row.profileId);
    workspaceIds.add(row.workspaceId);
    priorities.push(row.priority);
  }

  const total = rows.length;
  return {
    total,
    bySourceType: bySourceType as Readonly<Record<RacSourceType, number>>,
    byOwnerModule: byOwnerModule as Readonly<
      Record<RacOwnerModule, number>
    >,
    unknownSourceTypeCount,
    unknownOwnerModuleCount,
    enabledCount,
    disabledCount: total - enabledCount,
    withEmbeddingProviderCount,
    withChunkOverrideCount,
    distinctProfileCount: profileIds.size,
    distinctWorkspaceCount: workspaceIds.size,
    priorityStats: computeStats(priorities),
  };
}
