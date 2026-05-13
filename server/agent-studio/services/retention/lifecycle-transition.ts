/**
 * Approval-lifecycle terminal-transition helpers.
 *
 * Every state-mutation call site for `agsPublishRequests`, `agsApprovalSteps`,
 * and `agsNotePromotions` must route its update through `buildTerminalUpdate`
 * (or the table-specific wrappers below) so that `terminalAt` and
 * `terminalReason` are set atomically with the state transition.
 *
 * Retention eligibility is computed from `terminalAt`, not from `createdAt`
 * or `decidedAt`. If a state transition lands a row in a terminal state
 * without setting `terminalAt`, the sweep will never recognize it — the row
 * will live forever. Standing principle (user 2026-05-12 §0): schema first,
 * retention second; do not weaken the predicate.
 */

import {
  APPROVAL_STEP_TERMINAL_STATES,
  type ApprovalStepState,
  isApprovalStepTerminal,
  isNotePromotionTerminal,
  isPublishRequestTerminal,
  type NotePromotionState,
  NOTE_PROMOTION_TERMINAL_STATES,
  PUBLISH_REQUEST_TERMINAL_STATES,
  type PublishRequestState,
} from "./lifecycle-state-vocab";

/**
 * Generic shape returned by all terminal-transition helpers.
 * Spread into the Drizzle `.set({...})` call.
 */
export interface TerminalTransitionUpdate<TState extends string> {
  readonly state: TState;
  readonly terminalAt: Date | null;
  readonly terminalReason: string | null;
}

interface BuildOptions {
  /**
   * Override for tests. Production callers leave this as the default
   * (current wall-clock time at the moment of transition).
   */
  readonly now?: Date;
}

function applyTerminal<TState extends string>(
  state: TState,
  terminal: boolean,
  reason: string | undefined,
  options: BuildOptions,
): TerminalTransitionUpdate<TState> {
  if (!terminal) {
    return { state, terminalAt: null, terminalReason: null };
  }
  return {
    state,
    terminalAt: options.now ?? new Date(),
    terminalReason: reason ?? null,
  };
}

// ── ags_publish_requests ────────────────────────────────────────────────────

export function buildPublishRequestStateUpdate(input: {
  state: PublishRequestState;
  reason?: string;
  now?: Date;
}): TerminalTransitionUpdate<PublishRequestState> {
  return applyTerminal(
    input.state,
    isPublishRequestTerminal(input.state),
    input.reason,
    { now: input.now },
  );
}

// ── ags_approval_steps ──────────────────────────────────────────────────────

export function buildApprovalStepStateUpdate(input: {
  state: ApprovalStepState;
  reason?: string;
  now?: Date;
}): TerminalTransitionUpdate<ApprovalStepState> {
  return applyTerminal(
    input.state,
    isApprovalStepTerminal(input.state),
    input.reason,
    { now: input.now },
  );
}

// ── ags_note_promotions (uses `status` column rather than `state`) ──────────

/**
 * `agsNotePromotions` uses `status` as the column name; the helper accepts
 * the same conceptual input but the caller spreads `{ status: state, ... }`
 * (or uses `buildNotePromotionStatusUpdate` below which already renames).
 */
export function buildNotePromotionStatusUpdate(input: {
  status: NotePromotionState;
  reason?: string;
  now?: Date;
}): {
  readonly status: NotePromotionState;
  readonly terminalAt: Date | null;
  readonly terminalReason: string | null;
} {
  const inner = applyTerminal(
    input.status,
    isNotePromotionTerminal(input.status),
    input.reason,
    { now: input.now },
  );
  return {
    status: inner.state,
    terminalAt: inner.terminalAt,
    terminalReason: inner.terminalReason,
  };
}

// ── Re-exports for callers that want the terminal-set predicates ────────────

export {
  APPROVAL_STEP_TERMINAL_STATES,
  isApprovalStepTerminal,
  isNotePromotionTerminal,
  isPublishRequestTerminal,
  NOTE_PROMOTION_TERMINAL_STATES,
  PUBLISH_REQUEST_TERMINAL_STATES,
};
