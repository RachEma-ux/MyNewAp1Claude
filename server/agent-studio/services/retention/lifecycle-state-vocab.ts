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
// "Active" = retention-blocker. See follow-up audit PR for the inventory.

export const RELEASE_STATE_RETENTION_BLOCKERS: ReadonlySet<string> = new Set([
  "draft",
  "pending",
  "active",
  "published",
  "rolled_back_under_review",
]);

export function isReleaseStateRetentionBlocker(state: string): boolean {
  return RELEASE_STATE_RETENTION_BLOCKERS.has(state);
}
