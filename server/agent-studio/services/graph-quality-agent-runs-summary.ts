/**
 * `summarizeGraphQualityAgentRuns` — generic-accessor aggregator
 * over an opaque `ags_graph_quality_agent_runs` row list (T-D.17).
 *
 * Companion to T-D.14 `GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA`.
 * 13th instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window.
 *
 * Use case: the graph-quality admin panel needs a one-line summary
 * of recent agent runs ("4 completed / 1 failed / 2 running — 18
 * proposals created"). The agent runs feed the quality findings
 * which feed the correction proposals — this aggregator is the
 * top-of-funnel rollup.
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across `GRAPH_QUALITY_AGENT_RUN_STATUSES`.
 *   - Unknown status counted via `unknownStatusCount` axis.
 *   - `successRate` excludes `running` from denominator (in-flight
 *     not yet decided). `null` when no terminal rows.
 *   - `proposalStats` is null when 0 rows have a non-null
 *     `proposalsCreated`.
 *   - `durationStats` is null when 0 rows have BOTH `startedAt` +
 *     `completedAt`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  GRAPH_QUALITY_AGENT_RUN_STATUSES,
  GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA,
  type GraphQualityAgentRunStatus,
} from "./graph-quality-agent-runs-retention.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface GraphQualityAgentRunListSummary {
  readonly total: number;
  readonly byStatus: Readonly<
    Record<GraphQualityAgentRunStatus, number>
  >;
  readonly unknownStatusCount: number;
  readonly terminalCount: number;
  readonly inFlightCount: number;
  /** `byStatus.completed / (byStatus.completed + byStatus.failed) × 100`,
   *  1-decimal. `null` when no terminal rows. Excludes `running`. */
  readonly successRate: number | null;
  /** Stats over `proposalsCreated` across rows with a non-null
   *  value. `null` when no rows have a value. */
  readonly proposalStats: NumericStats | null;
  /** Duration stats in milliseconds over rows with BOTH `startedAt` +
   *  `completedAt` non-null. */
  readonly durationStats: NumericStats | null;
}

export interface SummarizeGraphQualityAgentRunsInput {
  readonly status: string;
  readonly proposalsCreated: number | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

function isGraphQualityAgentRunStatus(
  s: string,
): s is GraphQualityAgentRunStatus {
  return (GRAPH_QUALITY_AGENT_RUN_STATUSES as readonly string[]).includes(s);
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

export function summarizeGraphQualityAgentRuns(
  rows: readonly SummarizeGraphQualityAgentRunsInput[],
): GraphQualityAgentRunListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of GRAPH_QUALITY_AGENT_RUN_STATUSES) byStatus[s] = 0;

  let unknownStatusCount = 0;
  const proposalValues: number[] = [];
  const durations: number[] = [];

  for (const row of rows) {
    if (isGraphQualityAgentRunStatus(row.status)) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    } else {
      unknownStatusCount += 1;
    }
    if (row.proposalsCreated !== null) {
      proposalValues.push(row.proposalsCreated);
    }
    if (row.startedAt !== null && row.completedAt !== null) {
      durations.push(row.completedAt.getTime() - row.startedAt.getTime());
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of GRAPH_QUALITY_AGENT_RUN_STATUSES) {
    const meta = GRAPH_QUALITY_AGENT_RUN_STATUS_METADATA[status];
    if (meta.terminal) terminalCount += byStatus[status];
    else inFlightCount += byStatus[status];
  }
  const completed = byStatus.completed;
  const failed = byStatus.failed;
  const settled = completed + failed;
  const successRate =
    settled === 0 ? null : Math.round((completed / settled) * 1000) / 10;

  return {
    total: rows.length,
    byStatus: byStatus as Readonly<
      Record<GraphQualityAgentRunStatus, number>
    >,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    successRate,
    proposalStats: computeStats(proposalValues),
    durationStats: computeStats(durations),
  };
}
