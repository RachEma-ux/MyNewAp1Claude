/**
 * `summarizeApprovalSteps` — generic-accessor aggregator over an
 * opaque approval-step row list (T-L.4).
 *
 * Companion to T-L.2 `APPROVAL_STEP_STATE_METADATA` (the T-L sibling-
 * trio metadata canonization from lesson 27 of the V1+ session
 * memory). 10th instantiation of the lesson-30 aggregator-pair
 * pattern in the post-compaction resume window.
 *
 * Uses the generic-accessor signature from T-D.8
 * `summarizeQualityFindings` (#1057) + T-G.62
 * `summarizePromotions` (#1190) — `agsApprovalSteps` query shapes
 * vary by caller, and the typed `state` field may arrive as `string`
 * after a Drizzle row narrowing.
 *
 * Stable-shape guarantees:
 *   - `byState[state]` zero-filled across `APPROVAL_STEP_STATES`.
 *   - `byOutcome[outcome]` zero-filled across the 7 closed outcomes
 *     derived from `APPROVAL_STEP_STATE_METADATA.outcome`.
 *   - Unknown state values counted via `unknownStateCount` axis
 *     (schema-drift detector — never pollutes the closed counters).
 *   - `terminalCount` + `inFlightCount` + `unknownStateCount` sums
 *     to total.
 *   - `acceptanceRate` = accepted / (accepted + declined) × 100,
 *     rounded to 1 decimal. `null` when 0 decision-recorded rows.
 *     Skips skipped / expired / cancelled / obsolete — those are
 *     post-decision-distinct.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  APPROVAL_STEP_STATES,
  APPROVAL_STEP_STATE_METADATA,
  type ApprovalStepState,
  type ApprovalStepStateMetadata,
} from "./lifecycle-state-vocab.js";

/**
 * Closed taxonomy of outcome values derived from
 * `APPROVAL_STEP_STATE_METADATA[*].outcome`. Exporting this constant
 * gives the lockstep test a single source of truth to iterate.
 */
export const APPROVAL_STEP_OUTCOMES: readonly ApprovalStepStateMetadata["outcome"][] =
  [
    "awaiting",
    "accepted",
    "declined",
    "skipped",
    "expired",
    "cancelled",
    "obsolete",
  ];

export type ApprovalStepOutcome = ApprovalStepStateMetadata["outcome"];

export interface ApprovalStepListSummary {
  readonly total: number;
  /** Per-state count, zero-filled across the closed taxonomy. */
  readonly byState: Readonly<Record<ApprovalStepState, number>>;
  /** Per-outcome count, zero-filled across the 7 derived outcomes. */
  readonly byOutcome: Readonly<Record<ApprovalStepOutcome, number>>;
  /** Rows whose state isn't in `APPROVAL_STEP_STATES`. */
  readonly unknownStateCount: number;
  /** Rows whose state is terminal per metadata. */
  readonly terminalCount: number;
  /** Rows whose state is non-terminal (pending only, today). */
  readonly inFlightCount: number;
  /** `byOutcome.accepted / (byOutcome.accepted + byOutcome.declined) ×
   *  100`, 1-decimal. `null` when 0 rows have a decision-recorded
   *  outcome. Skipped/expired/cancelled/obsolete are excluded as
   *  post-decision-distinct. */
  readonly acceptanceRate: number | null;
}

function isApprovalStepState(s: string): s is ApprovalStepState {
  return (APPROVAL_STEP_STATES as readonly string[]).includes(s);
}

export function summarizeApprovalSteps<T>(
  records: readonly T[],
  getState: (item: T) => string,
): ApprovalStepListSummary {
  const byState: Record<string, number> = {};
  for (const s of APPROVAL_STEP_STATES) byState[s] = 0;
  const byOutcome: Record<string, number> = {};
  for (const o of APPROVAL_STEP_OUTCOMES) byOutcome[o] = 0;

  let unknownStateCount = 0;

  for (const r of records) {
    const state = getState(r);
    if (isApprovalStepState(state)) {
      byState[state] += 1;
      const outcome = APPROVAL_STEP_STATE_METADATA[state].outcome;
      byOutcome[outcome] += 1;
    } else {
      unknownStateCount += 1;
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const state of APPROVAL_STEP_STATES) {
    const meta = APPROVAL_STEP_STATE_METADATA[state];
    if (meta.terminal) terminalCount += byState[state];
    else inFlightCount += byState[state];
  }

  const accepted = byOutcome.accepted;
  const declined = byOutcome.declined;
  const decided = accepted + declined;
  const acceptanceRate =
    decided === 0 ? null : Math.round((accepted / decided) * 1000) / 10;

  return {
    total: records.length,
    byState: byState as Readonly<Record<ApprovalStepState, number>>,
    byOutcome: byOutcome as Readonly<Record<ApprovalStepOutcome, number>>,
    unknownStateCount,
    terminalCount,
    inFlightCount,
    acceptanceRate,
  };
}
