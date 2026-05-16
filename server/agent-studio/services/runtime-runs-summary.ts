/**
 * `summarizeRuntimeRuns` — generic-accessor aggregator over an
 * opaque `agsRuntimeRuns` row list (T-G.64).
 *
 * Companion to the new `RUNTIME_RUN_STATUS_METADATA` canonization
 * in the same PR. 16th instantiation of the lesson-30 aggregator-
 * pair pattern in the post-compaction resume window.
 *
 * Use case: runtime-runs ledger needs a one-line operator rollup
 * across the 7-state ladder ("12 in-flight / 188 completed / 4
 * failed — 97.9% success rate — 12 paused for approval").
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across the 7 closed values.
 *   - `unknownStatusCount` partitions drift.
 *   - `terminalCount` + `inFlightCount` derived from metadata.
 *   - `awaitingApprovalCount` is a named accessor for the
 *     approval-pause subset (operator dashboards filter on it).
 *   - `successRate` = completed / (completed + failed + cancelled);
 *     `null` when no terminal rows. Includes `cancelled` in the
 *     denominator because operator cancellation IS a runtime outcome
 *     distinct from failure but still terminal — measures completion
 *     not infallibility.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  RUNTIME_RUN_STATUSES,
  RUNTIME_RUN_STATUS_METADATA,
  type RuntimeRunStatus,
} from "./runtime-runs-retention.js";

export interface RuntimeRunListSummary {
  readonly total: number;
  /** Per-status count, zero-filled across the closed taxonomy. */
  readonly byStatus: Readonly<Record<RuntimeRunStatus, number>>;
  /** Rows whose status is not in `RUNTIME_RUN_STATUSES`. */
  readonly unknownStatusCount: number;
  /** Rows whose status metadata `.terminal === true` (completed,
   *  failed, cancelled). */
  readonly terminalCount: number;
  /** Rows whose status metadata `.terminal === false` (queued,
   *  pending, running, awaiting_approval). */
  readonly inFlightCount: number;
  /** Named accessor — rows whose status is `awaiting_approval`.
   *  Distinct from `inFlightCount` for the common operator filter
   *  "what's pending an approver?". */
  readonly awaitingApprovalCount: number;
  /** `byStatus.completed / (byStatus.completed + byStatus.failed +
   *  byStatus.cancelled) × 100`, 1-decimal. `null` when no terminal
   *  rows. Includes cancelled as a non-success terminal outcome —
   *  measures completion-vs-non-completion, not infallibility. */
  readonly successRate: number | null;
}

function isRuntimeRunStatus(s: string): s is RuntimeRunStatus {
  return (RUNTIME_RUN_STATUSES as readonly string[]).includes(s);
}

export function summarizeRuntimeRuns<T>(
  records: readonly T[],
  getStatus: (item: T) => string,
): RuntimeRunListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of RUNTIME_RUN_STATUSES) byStatus[s] = 0;
  let unknownStatusCount = 0;

  for (const r of records) {
    const status = getStatus(r);
    if (isRuntimeRunStatus(status)) {
      byStatus[status] += 1;
    } else {
      unknownStatusCount += 1;
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of RUNTIME_RUN_STATUSES) {
    const meta = RUNTIME_RUN_STATUS_METADATA[status];
    if (meta.terminal) terminalCount += byStatus[status];
    else inFlightCount += byStatus[status];
  }
  const completed = byStatus.completed;
  const failed = byStatus.failed;
  const cancelled = byStatus.cancelled;
  const settled = completed + failed + cancelled;
  const successRate =
    settled === 0 ? null : Math.round((completed / settled) * 1000) / 10;

  return {
    total: records.length,
    byStatus: byStatus as Readonly<Record<RuntimeRunStatus, number>>,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    awaitingApprovalCount: byStatus.awaiting_approval,
    successRate,
  };
}
