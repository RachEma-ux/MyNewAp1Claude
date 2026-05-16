/**
 * `summarizeKnowledgeUnits` — stable-shape aggregator over an opaque
 * `agsKnowledgeUnits` row list (T-G.66).
 *
 * Companion to the new `NORMALIZED_KNOWLEDGE_UNIT_TYPES` tuple
 * promotion in the same PR. 19th instantiation of the lesson-30
 * aggregator-pair pattern in the post-compaction resume window.
 *
 * Use case: the knowledge-base admin panel needs a one-line rollup
 * across unit types ("4,212 units — 1,800 markdown_section / 600
 * pdf_page / 400 code_function / 12 unknown_type — mean content
 * length 2,418 chars").
 *
 * Stable-shape guarantees:
 *   - `byUnitType[type]` zero-filled across
 *     `NORMALIZED_KNOWLEDGE_UNIT_TYPES`.
 *   - `unknownUnitTypeCount` partitions drift.
 *   - `contentLengthStats` is null when input is empty.
 *   - `withParentCount` counts hierarchical children (non-null
 *     parentUnitId).
 *   - `distinctSourceCount` reports unique `sourceId` values.
 *   - `distinctWorkspaceCount` reports unique `workspaceId` values.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  NORMALIZED_KNOWLEDGE_UNIT_TYPES,
  type NormalizedKnowledgeUnitType,
} from "./types.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface KnowledgeUnitListSummary {
  readonly total: number;
  /** Per-unitType count, zero-filled across the closed taxonomy. */
  readonly byUnitType: Readonly<
    Record<NormalizedKnowledgeUnitType, number>
  >;
  /** Rows whose `unitType` is not in the closed taxonomy. */
  readonly unknownUnitTypeCount: number;
  /** Stats over `contentText.length` (or supplied content-length
   *  value) across all rows. */
  readonly contentLengthStats: NumericStats | null;
  /** Rows with `parentUnitId !== null` (hierarchical children). */
  readonly withParentCount: number;
  /** Distinct `sourceId` values across the input. */
  readonly distinctSourceCount: number;
  /** Distinct `workspaceId` values across the input. */
  readonly distinctWorkspaceCount: number;
}

export interface SummarizeKnowledgeUnitsInput {
  readonly workspaceId: number;
  readonly sourceId: number;
  readonly parentUnitId: number | null;
  readonly unitType: string;
  readonly contentLength: number;
}

function isNormalizedKnowledgeUnitType(
  s: string,
): s is NormalizedKnowledgeUnitType {
  return (NORMALIZED_KNOWLEDGE_UNIT_TYPES as readonly string[]).includes(s);
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

export function summarizeKnowledgeUnits(
  rows: readonly SummarizeKnowledgeUnitsInput[],
): KnowledgeUnitListSummary {
  const byUnitType: Record<string, number> = {};
  for (const t of NORMALIZED_KNOWLEDGE_UNIT_TYPES) byUnitType[t] = 0;

  let unknownUnitTypeCount = 0;
  let withParentCount = 0;
  const sourceIds = new Set<number>();
  const workspaceIds = new Set<number>();
  const contentLengths: number[] = [];

  for (const row of rows) {
    if (isNormalizedKnowledgeUnitType(row.unitType)) {
      byUnitType[row.unitType] = (byUnitType[row.unitType] ?? 0) + 1;
    } else {
      unknownUnitTypeCount += 1;
    }
    if (row.parentUnitId !== null) withParentCount += 1;
    sourceIds.add(row.sourceId);
    workspaceIds.add(row.workspaceId);
    contentLengths.push(row.contentLength);
  }

  return {
    total: rows.length,
    byUnitType: byUnitType as Readonly<
      Record<NormalizedKnowledgeUnitType, number>
    >,
    unknownUnitTypeCount,
    contentLengthStats: computeStats(contentLengths),
    withParentCount,
    distinctSourceCount: sourceIds.size,
    distinctWorkspaceCount: workspaceIds.size,
  };
}
