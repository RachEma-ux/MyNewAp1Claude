/**
 * `summarizePublishRequests` — generic-accessor aggregator over an
 * opaque publish-request row list (T-L.5).
 *
 * Companion to T-L.1 `PUBLISH_REQUEST_STATE_METADATA` and the
 * T-L sibling-trio canonization. Parallel to T-L.4
 * `summarizeApprovalSteps` (#1191). 11th instantiation of the
 * lesson-30 aggregator-pair pattern in the post-compaction resume
 * window.
 *
 * Stable-shape guarantees mirror T-L.4:
 *   - `byState[state]` zero-filled across `PUBLISH_REQUEST_STATES`.
 *   - `byOutcome[outcome]` zero-filled across the 6 derived
 *     outcomes (one fewer than approval-step since
 *     `cancelled`+`withdrawn` collapse to the single `withdrawn`
 *     outcome).
 *   - `unknownStateCount` schema-drift detector.
 *   - `acceptanceRate` = accepted / (accepted + declined) × 100;
 *     null when no decisions. Excludes withdrawn (submitter action) /
 *     obsolete (system action) / terminal_failure (system action).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  PUBLISH_REQUEST_STATES,
  PUBLISH_REQUEST_STATE_METADATA,
  type PublishRequestState,
  type PublishRequestStateMetadata,
} from "./lifecycle-state-vocab.js";

export const PUBLISH_REQUEST_OUTCOMES: readonly PublishRequestStateMetadata["outcome"][] =
  [
    "awaiting",
    "accepted",
    "declined",
    "withdrawn",
    "obsolete",
    "terminal_failure",
  ];

export type PublishRequestOutcome = PublishRequestStateMetadata["outcome"];

export interface PublishRequestListSummary {
  readonly total: number;
  readonly byState: Readonly<Record<PublishRequestState, number>>;
  readonly byOutcome: Readonly<Record<PublishRequestOutcome, number>>;
  readonly unknownStateCount: number;
  readonly terminalCount: number;
  readonly inFlightCount: number;
  /** `byOutcome.accepted / (byOutcome.accepted + byOutcome.declined) ×
   *  100`, 1-decimal. `null` when no rows reach
   *  accepted/declined. Excludes withdrawn/obsolete/terminal_failure
   *  as they're post-decision-distinct outcomes (submitter / system,
   *  not approver judgment). */
  readonly acceptanceRate: number | null;
}

function isPublishRequestState(s: string): s is PublishRequestState {
  return (PUBLISH_REQUEST_STATES as readonly string[]).includes(s);
}

export function summarizePublishRequests<T>(
  records: readonly T[],
  getState: (item: T) => string,
): PublishRequestListSummary {
  const byState: Record<string, number> = {};
  for (const s of PUBLISH_REQUEST_STATES) byState[s] = 0;
  const byOutcome: Record<string, number> = {};
  for (const o of PUBLISH_REQUEST_OUTCOMES) byOutcome[o] = 0;

  let unknownStateCount = 0;

  for (const r of records) {
    const state = getState(r);
    if (isPublishRequestState(state)) {
      byState[state] += 1;
      const outcome = PUBLISH_REQUEST_STATE_METADATA[state].outcome;
      byOutcome[outcome] += 1;
    } else {
      unknownStateCount += 1;
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const state of PUBLISH_REQUEST_STATES) {
    const meta = PUBLISH_REQUEST_STATE_METADATA[state];
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
    byState: byState as Readonly<Record<PublishRequestState, number>>,
    byOutcome: byOutcome as Readonly<
      Record<PublishRequestOutcome, number>
    >,
    unknownStateCount,
    terminalCount,
    inFlightCount,
    acceptanceRate,
  };
}
