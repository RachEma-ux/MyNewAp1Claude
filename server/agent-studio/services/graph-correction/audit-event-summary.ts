/**
 * `summarizeGraphCorrectionAuditEvents` — stable-shape aggregator
 * over the graph-correction `AuditEventRow[]` surface (T-D.19).
 *
 * 28th instantiation of the lesson-30 aggregator-pair pattern.
 * Companion to T-D.18 `summarizeGraphCorrectionProposals` (#1209):
 * proposals are the queue rows, audit events are the per-proposal
 * lifecycle event stream. Together they cover the graph-correction
 * surface for operator triage.
 *
 * Use case: audit-trail volume dashboard. Operators want both
 * per-event-kind counts (sparse axis — "what kinds of state
 * transitions are firing") AND per-proposal coverage rollup
 * ("are all 64 approved proposals carrying audit trails, or are
 * some missing decision events"). The top-N truncation pattern
 * handles unbounded eventKind cardinality.
 *
 * Composite slice — no new structural variant; pattern saturated
 * at 15 variants @ T-A.15 / #1205. Composes sparse-axis + top-N +
 * payload-gauge + ageStats + distinct-rollup.
 *
 * Stable-shape guarantees:
 *   - `byEventKind` is sparse (open-ended string axis).
 *   - `topEventKinds` truncates at 10 entries; ties alphabetical.
 *   - `withMetadataCount` gauge counts non-null metadata payloads.
 *   - `distinctProposalCount` rollup counts how many distinct
 *     proposals are represented (audit-trail coverage gauge).
 *   - `ageStats` is null when input is empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { AuditEventRow } from "./lifecycle.js";

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

export interface GraphCorrectionAuditEventListSummary {
  readonly total: number;
  /** Per-eventKind count. Sparse — open-ended string axis. */
  readonly byEventKind: Readonly<Record<string, number>>;
  /** Distinct eventKind values. */
  readonly distinctEventKindCount: number;
  /** Top 10 eventKinds by count, sorted descending. Ties alphabetical. */
  readonly topEventKinds: readonly CountEntry[];
  /** Rows with `metadata !== null`. */
  readonly withMetadataCount: number;
  /** Distinct proposalId values (audit-trail coverage rollup). */
  readonly distinctProposalCount: number;
  /** Age stats in ms from `createdAt` to `now`. Null on empty input. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeGraphCorrectionAuditEventsOptions {
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

export function summarizeGraphCorrectionAuditEvents(
  rows: readonly AuditEventRow[],
  options: SummarizeGraphCorrectionAuditEventsOptions = {},
): GraphCorrectionAuditEventListSummary {
  const byEventKind: Record<string, number> = {};
  const proposalIds = new Set<number>();
  let withMetadataCount = 0;
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    byEventKind[row.eventKind] = (byEventKind[row.eventKind] ?? 0) + 1;
    proposalIds.add(row.proposalId);
    if (row.metadata !== null) withMetadataCount += 1;
    ages.push(now - row.createdAt.getTime());
  }

  return {
    total: rows.length,
    byEventKind,
    distinctEventKindCount: Object.keys(byEventKind).length,
    topEventKinds: topN(byEventKind, top),
    withMetadataCount,
    distinctProposalCount: proposalIds.size,
    ageStats: computeStats(ages),
  };
}
