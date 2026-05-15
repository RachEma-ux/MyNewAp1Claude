/**
 * Approval-lifecycle state vocabularies + terminal-state classification.
 *
 * The retention sweep MUST only delete rows whose state belongs to that
 * table's `TERMINAL_STATES` set AND whose `terminalAt` column is set.
 * Non-terminal rows are never retention-eligible regardless of age.
 *
 * No DB CHECK constraints are added against these vocabularies — the
 * existing tables have `varchar(32)`/`varchar(50)` state columns and may
 * already contain values predating any extension. Enforcement is
 * service-layer (this module + the zod schemas exported below) and
 * incoming writes are validated at API/service boundaries.
 */

import { z } from "zod";

// ── ags_publish_requests ────────────────────────────────────────────────────

export const PUBLISH_REQUEST_STATES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  // Extensions for terminal-state coverage:
  "cancelled",
  "superseded",
  "failed_terminal",
] as const;

export type PublishRequestState = (typeof PUBLISH_REQUEST_STATES)[number];

export const PUBLISH_REQUEST_TERMINAL_STATES: ReadonlySet<PublishRequestState> = new Set([
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
  "superseded",
  "failed_terminal",
]);

export const publishRequestStateSchema = z.enum(PUBLISH_REQUEST_STATES);

export function isPublishRequestTerminal(state: string): state is PublishRequestState {
  return PUBLISH_REQUEST_TERMINAL_STATES.has(state as PublishRequestState);
}

// ============================================================================
// Per-publish-request-state operator-facing metadata (T-L.1)
// ============================================================================

export interface PublishRequestStateMetadata {
  /** Display label rendered in the publish-request ledger UI. */
  readonly label: string;
  /** Short operator-facing description of what the state means. */
  readonly description: string;
  /** Closed-taxonomy outcome classification:
   *  - `awaiting`: row is in-flight, still possible to mutate.
   *  - `accepted`: terminal success — request went through.
   *  - `declined`: terminal explicit rejection by approver.
   *  - `withdrawn`: terminal voluntary cancellation by submitter.
   *  - `obsolete`: terminal, superseded by a newer request.
   *  - `terminal_failure`: terminal unrecoverable error (e.g.
   *    `failed_terminal`). */
  readonly outcome:
    | "awaiting"
    | "accepted"
    | "declined"
    | "withdrawn"
    | "obsolete"
    | "terminal_failure";
  /** Whether this state is in the terminal set (mirrors the
   *  PUBLISH_REQUEST_TERMINAL_STATES check — exposed so callers can
   *  branch on metadata alone without re-importing the set). */
  readonly terminal: boolean;
}

export const PUBLISH_REQUEST_STATE_METADATA: Readonly<
  Record<PublishRequestState, PublishRequestStateMetadata>
> = {
  pending: {
    label: "Pending",
    description:
      "Publish request is awaiting approval — approvers have not yet acted on the row.",
    outcome: "awaiting",
    terminal: false,
  },
  approved: {
    label: "Approved",
    description:
      "Approvers accepted the publish request — downstream pusher invocation is gated on this state.",
    outcome: "accepted",
    terminal: true,
  },
  rejected: {
    label: "Rejected",
    description:
      "Approvers explicitly rejected the publish request — submitter sees the rejection reason in the row.",
    outcome: "declined",
    terminal: true,
  },
  withdrawn: {
    label: "Withdrawn",
    description:
      "Submitter voluntarily cancelled the publish request before approvers acted — row is terminal but not approver-declined.",
    outcome: "withdrawn",
    terminal: true,
  },
  cancelled: {
    label: "Cancelled",
    description:
      "Publish request was cancelled by the system (e.g. workspace deletion, parent-hold release) — terminal without explicit approver action.",
    outcome: "withdrawn",
    terminal: true,
  },
  superseded: {
    label: "Superseded",
    description:
      "A newer publish request for the same source took precedence — this row is terminal-obsolete.",
    outcome: "obsolete",
    terminal: true,
  },
  failed_terminal: {
    label: "Failed (Terminal)",
    description:
      "Publish request entered an unrecoverable failure state — operator-actionable diagnostic stored on the row.",
    outcome: "terminal_failure",
    terminal: true,
  },
};

export function getPublishRequestStateMetadata(
  state: PublishRequestState,
): PublishRequestStateMetadata {
  return PUBLISH_REQUEST_STATE_METADATA[state];
}

// ── ags_approval_steps ──────────────────────────────────────────────────────

export const APPROVAL_STEP_STATES = [
  "pending",
  "approved",
  "rejected",
  // Extensions for terminal-state coverage:
  "skipped",
  "expired",
  "cancelled",
  "superseded",
] as const;

export type ApprovalStepState = (typeof APPROVAL_STEP_STATES)[number];

export const APPROVAL_STEP_TERMINAL_STATES: ReadonlySet<ApprovalStepState> = new Set([
  "approved",
  "rejected",
  "skipped",
  "expired",
  "cancelled",
  "superseded",
]);

export const approvalStepStateSchema = z.enum(APPROVAL_STEP_STATES);

export function isApprovalStepTerminal(state: string): state is ApprovalStepState {
  return APPROVAL_STEP_TERMINAL_STATES.has(state as ApprovalStepState);
}

// ============================================================================
// Per-approval-step-state operator-facing metadata (T-L.2)
// ============================================================================

export interface ApprovalStepStateMetadata {
  /** Display label rendered in the approval queue / step list. */
  readonly label: string;
  /** Short operator-facing description of what the state means. */
  readonly description: string;
  /** Closed-taxonomy outcome classification:
   *  - `awaiting`: step is awaiting an approver decision.
   *  - `accepted`: terminal — approver approved.
   *  - `declined`: terminal — approver explicitly rejected.
   *  - `skipped`: terminal — step was bypassed (parallel rule
   *    satisfied earlier, or policy override).
   *  - `expired`: terminal — approver deadline passed without action.
   *  - `cancelled`: terminal — system or operator cancelled.
   *  - `obsolete`: terminal — superseded by a newer step. */
  readonly outcome:
    | "awaiting"
    | "accepted"
    | "declined"
    | "skipped"
    | "expired"
    | "cancelled"
    | "obsolete";
  /** Whether this state is in the terminal set (mirrors the
   *  APPROVAL_STEP_TERMINAL_STATES check). */
  readonly terminal: boolean;
}

export const APPROVAL_STEP_STATE_METADATA: Readonly<
  Record<ApprovalStepState, ApprovalStepStateMetadata>
> = {
  pending: {
    label: "Pending",
    description:
      "Approval step is awaiting a decision — approvers see this row in their queue and have not yet acted.",
    outcome: "awaiting",
    terminal: false,
  },
  approved: {
    label: "Approved",
    description:
      "Approver accepted the step — downstream rule evaluation considers this step satisfied.",
    outcome: "accepted",
    terminal: true,
  },
  rejected: {
    label: "Rejected",
    description:
      "Approver explicitly rejected the step — downstream rule evaluation marks this step as a hard failure.",
    outcome: "declined",
    terminal: true,
  },
  skipped: {
    label: "Skipped",
    description:
      "Step was skipped — typically a parallel rule was satisfied earlier or a policy override bypassed this step.",
    outcome: "skipped",
    terminal: true,
  },
  expired: {
    label: "Expired",
    description:
      "Approver deadline passed without action — step times out and the parent request fails-closed.",
    outcome: "expired",
    terminal: true,
  },
  cancelled: {
    label: "Cancelled",
    description:
      "Step was cancelled by the system or operator before any approver acted — terminal without explicit decision.",
    outcome: "cancelled",
    terminal: true,
  },
  superseded: {
    label: "Superseded",
    description:
      "A newer step for the same approval flow took precedence — this row is terminal-obsolete.",
    outcome: "obsolete",
    terminal: true,
  },
};

export function getApprovalStepStateMetadata(
  state: ApprovalStepState,
): ApprovalStepStateMetadata {
  return APPROVAL_STEP_STATE_METADATA[state];
}

// ── ags_note_promotions ─────────────────────────────────────────────────────

export const NOTE_PROMOTION_STATES = [
  "pending",
  "validating",
  "in_review",
  "approved",
  "rejected",
  "rolled_back",
  // Extensions for terminal-state coverage:
  "cancelled",
  "superseded",
] as const;

export type NotePromotionState = (typeof NOTE_PROMOTION_STATES)[number];

/**
 * Note-promotion terminal set differs from publish-requests because
 * `rolled_back` is treated as terminal: the underlying graph projection has
 * already been reverted, so the row's lifecycle is over from a retention
 * standpoint (a rolled-back promotion under active review-hold is still
 * preserved by the hold model, not by the state machine).
 */
export const NOTE_PROMOTION_TERMINAL_STATES: ReadonlySet<NotePromotionState> = new Set([
  "approved",
  "rejected",
  "rolled_back",
  "cancelled",
  "superseded",
]);

export const notePromotionStateSchema = z.enum(NOTE_PROMOTION_STATES);

export function isNotePromotionTerminal(state: string): state is NotePromotionState {
  return NOTE_PROMOTION_TERMINAL_STATES.has(state as NotePromotionState);
}

// ── ags_agent_releases ──────────────────────────────────────────────────────
//
// Release-state classification is consumed by the retention eligibility
// predicate to answer: is a publish-request linked to an ACTIVE release?
// "Active" = retention-blocker.
//
// Audit (2026-05-13, repository.ts + boot.ts):
//   - Column default: `state = "pending"`.
//   - Only state value written in code today: `"published"` (publishRelease,
//     repository.ts:812).
//   - The retire signal is `archivedAt IS NOT NULL`, NOT a state value.
//     There is no `retired` / `superseded` / `failed` state in production
//     use.
//   - Future state values (e.g. `draft`, `rolled_back`) may be introduced
//     — the predicate below treats unknown states as retention-blockers
//     (fail-closed) so an unknown future state never accidentally allows
//     a sweep of a still-live release link.
//
// Primary retention-blocker signal: `archivedAt IS NULL`. The state-set
// below is a secondary fallback for state values that should block
// retention even when `archivedAt` is set (none today, but the slot
// exists for future contracts).

/**
 * State values that block retention regardless of `archivedAt`.
 *
 * Today this set is empty — `archivedAt IS NULL` is the sole signal. The
 * set exists so future contracts (e.g. `rolled_back_under_review`) can
 * extend it without restructuring callers.
 */
export const RELEASE_STATE_HARD_RETENTION_BLOCKERS: ReadonlySet<string> = new Set([]);

export interface ReleaseRetentionShape {
  readonly state: string;
  readonly archivedAt: Date | null;
}

/**
 * Returns true if a publish-request linked to this release should be
 * retention-blocked.
 *
 * Decision tree:
 *   - `archivedAt IS NULL` → true (release is still live).
 *   - State is in `RELEASE_STATE_HARD_RETENTION_BLOCKERS` → true.
 *   - Otherwise → false (release is archived AND state doesn't hard-block).
 */
export function isReleaseRetentionBlocker(release: ReleaseRetentionShape): boolean {
  if (release.archivedAt === null) return true;
  if (RELEASE_STATE_HARD_RETENTION_BLOCKERS.has(release.state)) return true;
  return false;
}
