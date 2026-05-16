/**
 * `summarizeIngestionJobs` — stable-shape aggregator over an opaque
 * `agsIngestionJobs` row list (T-G.65).
 *
 * Companion to `INGESTION_JOB_STATUS_METADATA` canonization in the
 * same PR. 17th instantiation of the lesson-30 aggregator-pair
 * pattern in the post-compaction resume window.
 *
 * Use case: the ingestion admin panel needs a one-line operator
 * rollup ("8 succeeded / 1 failed / 1 unsupported_type / 2 running —
 * 4,212 artifacts / 18,440 units / 92,103 chunks created").
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across the 5 closed values.
 *   - `unknownStatusCount` partitions drift.
 *   - `terminalCount` + `inFlightCount` derived from metadata.
 *   - `successRate` = succeeded / (succeeded + failed + unsupported_type)
 *     × 100; null when no terminal rows. Treats unsupported_type as
 *     non-success terminal (the operator's response is different —
 *     register a parser vs investigate a failure — but the rate
 *     is the same denominator).
 *   - 4 counter-NumericStats axes (artifacts / units / chunks /
 *     extractions); each null when 0 rows have a non-null counter.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  INGESTION_JOB_STATUSES,
  INGESTION_JOB_STATUS_METADATA,
  type IngestionJobStatus,
} from "./types.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface IngestionJobListSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<IngestionJobStatus, number>>;
  readonly unknownStatusCount: number;
  readonly terminalCount: number;
  readonly inFlightCount: number;
  /** `byStatus.succeeded / (byStatus.succeeded + byStatus.failed +
   *  byStatus.unsupported_type) × 100`, 1-decimal. `null` when no
   *  terminal rows. */
  readonly successRate: number | null;
  /** Stats over `artifactsCreated` across all rows. */
  readonly artifactStats: NumericStats | null;
  /** Stats over `unitsCreated` across all rows. */
  readonly unitStats: NumericStats | null;
  /** Stats over `chunksCreated` across all rows. */
  readonly chunkStats: NumericStats | null;
  /** Stats over `extractionsCreated` across all rows. */
  readonly extractionStats: NumericStats | null;
  /** Rows with a non-null `failureReason`. */
  readonly withFailureReasonCount: number;
}

export interface SummarizeIngestionJobsInput {
  readonly status: string;
  readonly artifactsCreated: number;
  readonly unitsCreated: number;
  readonly chunksCreated: number;
  readonly extractionsCreated: number;
  readonly failureReason: string | null;
}

function isIngestionJobStatus(s: string): s is IngestionJobStatus {
  return (INGESTION_JOB_STATUSES as readonly string[]).includes(s);
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

export function summarizeIngestionJobs(
  rows: readonly SummarizeIngestionJobsInput[],
): IngestionJobListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of INGESTION_JOB_STATUSES) byStatus[s] = 0;

  let unknownStatusCount = 0;
  let withFailureReasonCount = 0;
  const artifacts: number[] = [];
  const units: number[] = [];
  const chunks: number[] = [];
  const extractions: number[] = [];

  for (const row of rows) {
    if (isIngestionJobStatus(row.status)) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    } else {
      unknownStatusCount += 1;
    }
    if (row.failureReason !== null) withFailureReasonCount += 1;
    artifacts.push(row.artifactsCreated);
    units.push(row.unitsCreated);
    chunks.push(row.chunksCreated);
    extractions.push(row.extractionsCreated);
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of INGESTION_JOB_STATUSES) {
    const meta = INGESTION_JOB_STATUS_METADATA[status];
    if (meta.terminal) terminalCount += byStatus[status];
    else inFlightCount += byStatus[status];
  }
  const succeeded = byStatus.succeeded;
  const failed = byStatus.failed;
  const unsupported = byStatus.unsupported_type;
  const settled = succeeded + failed + unsupported;
  const successRate =
    settled === 0 ? null : Math.round((succeeded / settled) * 1000) / 10;

  return {
    total: rows.length,
    byStatus: byStatus as Readonly<Record<IngestionJobStatus, number>>,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    successRate,
    artifactStats: computeStats(artifacts),
    unitStats: computeStats(units),
    chunkStats: computeStats(chunks),
    extractionStats: computeStats(extractions),
    withFailureReasonCount,
  };
}
