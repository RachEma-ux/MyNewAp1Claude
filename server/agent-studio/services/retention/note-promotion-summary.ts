/**
 * `summarizeNotePromotions` — generic-accessor aggregator over an
 * opaque note-promotion row list (T-L.6).
 *
 * Completes the T-L sibling-trio aggregator series:
 *   - T-L.4 `summarizeApprovalSteps` (#1191)
 *   - T-L.5 `summarizePublishRequests` (#1192)
 *   - T-L.6 `summarizeNotePromotions` (this PR)
 *
 * 12th instantiation of the lesson-30 aggregator-pair pattern in
 * the post-compaction resume window.
 *
 * Companion to T-L.3 `NOTE_PROMOTION_STATE_METADATA`. Distinct from
 * T-G.62 `summarizePromotions` (#1190) because:
 *   - T-G.62 operates on `PromotionStatus` (6 states: pending /
 *     validating / in_review / approved / rejected / rolled_back) —
 *     the in-process lifecycle taxonomy declared in
 *     `services/promotion/lifecycle.ts`.
 *   - T-L.6 operates on `NotePromotionState` (8 states — the 6 +
 *     `cancelled` / `superseded` extensions) — the retention-vocab
 *     taxonomy declared in `services/retention/lifecycle-state-vocab.ts`.
 *   - The retention vocab adds the 2 terminal-cancellation states
 *     needed for hold-and-retention semantics.
 *
 * Stable-shape guarantees mirror T-L.4/T-L.5:
 *   - `byState[state]` zero-filled across `NOTE_PROMOTION_STATES`.
 *   - `byOutcome[outcome]` zero-filled across 6 derived outcomes.
 *   - `unknownStateCount` schema-drift detector.
 *   - `acceptanceRate` excludes `reverted`/`cancelled`/`obsolete` —
 *     these are post-decision-distinct outcomes (post-accept-revert,
 *     pre-decision cancel, succeeded-but-superseded).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  NOTE_PROMOTION_STATES,
  NOTE_PROMOTION_STATE_METADATA,
  type NotePromotionState,
  type NotePromotionStateMetadata,
} from "./lifecycle-state-vocab.js";

export const NOTE_PROMOTION_OUTCOMES: readonly NotePromotionStateMetadata["outcome"][] =
  [
    "in_progress",
    "accepted",
    "declined",
    "reverted",
    "cancelled",
    "obsolete",
  ];

export type NotePromotionOutcome = NotePromotionStateMetadata["outcome"];

export interface NotePromotionListSummary {
  readonly total: number;
  readonly byState: Readonly<Record<NotePromotionState, number>>;
  readonly byOutcome: Readonly<Record<NotePromotionOutcome, number>>;
  readonly unknownStateCount: number;
  readonly terminalCount: number;
  readonly inFlightCount: number;
  /** `byOutcome.accepted / (byOutcome.accepted + byOutcome.declined) ×
   *  100`, 1-decimal. `null` when 0 rows have accepted/declined.
   *  Excludes reverted/cancelled/obsolete (post-decision-distinct). */
  readonly acceptanceRate: number | null;
  /** Rate of `reverted` outcomes relative to historical accepts —
   *  reverted / (accepted + reverted) × 100, 1-decimal. `null` when
   *  no rows reach those outcomes. High values flag rollback
   *  pressure on the promotion pipeline. */
  readonly revertRate: number | null;
}

function isNotePromotionState(s: string): s is NotePromotionState {
  return (NOTE_PROMOTION_STATES as readonly string[]).includes(s);
}

export function summarizeNotePromotions<T>(
  records: readonly T[],
  getState: (item: T) => string,
): NotePromotionListSummary {
  const byState: Record<string, number> = {};
  for (const s of NOTE_PROMOTION_STATES) byState[s] = 0;
  const byOutcome: Record<string, number> = {};
  for (const o of NOTE_PROMOTION_OUTCOMES) byOutcome[o] = 0;

  let unknownStateCount = 0;

  for (const r of records) {
    const state = getState(r);
    if (isNotePromotionState(state)) {
      byState[state] += 1;
      const outcome = NOTE_PROMOTION_STATE_METADATA[state].outcome;
      byOutcome[outcome] += 1;
    } else {
      unknownStateCount += 1;
    }
  }

  let terminalCount = 0;
  let inFlightCount = 0;
  for (const state of NOTE_PROMOTION_STATES) {
    const meta = NOTE_PROMOTION_STATE_METADATA[state];
    if (meta.terminal) terminalCount += byState[state];
    else inFlightCount += byState[state];
  }

  const accepted = byOutcome.accepted;
  const declined = byOutcome.declined;
  const reverted = byOutcome.reverted;
  const decided = accepted + declined;
  const acceptanceRate =
    decided === 0 ? null : Math.round((accepted / decided) * 1000) / 10;
  const revertDenom = accepted + reverted;
  const revertRate =
    revertDenom === 0
      ? null
      : Math.round((reverted / revertDenom) * 1000) / 10;

  return {
    total: records.length,
    byState: byState as Readonly<Record<NotePromotionState, number>>,
    byOutcome: byOutcome as Readonly<
      Record<NotePromotionOutcome, number>
    >,
    unknownStateCount,
    terminalCount,
    inFlightCount,
    acceptanceRate,
    revertRate,
  };
}
