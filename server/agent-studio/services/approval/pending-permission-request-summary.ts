/**
 * `summarizePendingPermissionRequests` — generic-accessor aggregator
 * over an opaque `agsPendingPermissionRequests` row list (T-I.36).
 *
 * 22nd instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window. Operates on the approval gate's
 * persisted row table directly — distinct from T-L.4
 * `summarizeApprovalSteps` (#1191) which operates on
 * `agsApprovalSteps` (the per-step row).
 *
 * Use case: the approval admin panel needs a one-line rollup over
 * pending requests ("128 requests — 96 allowed / 12 denied / 8
 * pending / 12 timed_out — mean decision lag 4.2s").
 *
 * Stable-shape guarantees:
 *   - `byStatus[status]` zero-filled across the 4 closed values.
 *   - `unknownStatusCount` partitions drift.
 *   - `terminalCount` derived from the terminal set.
 *   - `decisionLagStats` (`decidedAt - createdAt`) — null when no
 *     rows have a `decidedAt`.
 *   - `withReasonCount` + `withProposedToolCallCount` + `withExpiresAtCount`
 *     gauges.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

export const PENDING_PERMISSION_REQUEST_STATUSES = [
  "pending",
  "allowed",
  "denied",
  "timed_out",
] as const;
export type PendingPermissionRequestStatus =
  (typeof PENDING_PERMISSION_REQUEST_STATUSES)[number];

const TERMINAL_STATUSES = new Set<PendingPermissionRequestStatus>([
  "allowed",
  "denied",
  "timed_out",
]);

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface PendingPermissionRequestListSummary {
  readonly total: number;
  readonly byStatus: Readonly<
    Record<PendingPermissionRequestStatus, number>
  >;
  readonly unknownStatusCount: number;
  readonly terminalCount: number;
  readonly inFlightCount: number;
  /** Stats in milliseconds for `decidedAt - createdAt`. Null when
   *  no rows have a non-null decidedAt. */
  readonly decisionLagStats: NumericStats | null;
  /** `byStatus.allowed / (byStatus.allowed + byStatus.denied) × 100`,
   *  1-decimal. `null` when no decisions (timeouts excluded since
   *  they're not approver decisions). */
  readonly approvalRate: number | null;
  readonly withReasonCount: number;
  readonly withProposedToolCallCount: number;
  readonly withExpiresAtCount: number;
}

export interface SummarizePendingPermissionRequestsInput {
  readonly status: string;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
  readonly reason: string | null;
  readonly proposedToolCallJson: Record<string, unknown> | null;
  readonly expiresAt: Date | null;
}

function isPendingPermissionRequestStatus(
  s: string,
): s is PendingPermissionRequestStatus {
  return (
    PENDING_PERMISSION_REQUEST_STATUSES as readonly string[]
  ).includes(s);
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

export function summarizePendingPermissionRequests(
  rows: readonly SummarizePendingPermissionRequestsInput[],
): PendingPermissionRequestListSummary {
  const byStatus: Record<string, number> = {};
  for (const s of PENDING_PERMISSION_REQUEST_STATUSES) byStatus[s] = 0;
  let unknownStatusCount = 0;
  let withReasonCount = 0;
  let withProposedToolCallCount = 0;
  let withExpiresAtCount = 0;
  const decisionLags: number[] = [];

  for (const row of rows) {
    if (isPendingPermissionRequestStatus(row.status)) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    } else {
      unknownStatusCount += 1;
    }
    if (row.decidedAt !== null) {
      decisionLags.push(row.decidedAt.getTime() - row.createdAt.getTime());
    }
    if (row.reason !== null) withReasonCount += 1;
    if (row.proposedToolCallJson !== null) withProposedToolCallCount += 1;
    if (row.expiresAt !== null) withExpiresAtCount += 1;
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const status of PENDING_PERMISSION_REQUEST_STATUSES) {
    if (TERMINAL_STATUSES.has(status)) {
      terminalCount += byStatus[status];
    } else {
      inFlightCount += byStatus[status];
    }
  }
  const allowed = byStatus.allowed;
  const denied = byStatus.denied;
  const decided = allowed + denied;
  const approvalRate =
    decided === 0 ? null : Math.round((allowed / decided) * 1000) / 10;

  return {
    total: rows.length,
    byStatus: byStatus as Readonly<
      Record<PendingPermissionRequestStatus, number>
    >,
    unknownStatusCount,
    terminalCount,
    inFlightCount,
    decisionLagStats: computeStats(decisionLags),
    approvalRate,
    withReasonCount,
    withProposedToolCallCount,
    withExpiresAtCount,
  };
}
