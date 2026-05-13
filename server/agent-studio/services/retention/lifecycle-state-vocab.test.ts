// lifecycle-state-vocab — terminal-state membership locks.
//
// The three approval-lifecycle terminal-state sets feed the retention
// predicates in publish-requests-retention.ts /
// approval-steps-retention.ts / note-promotions-retention.ts. If a
// state is silently added or removed from one of these sets, the
// retention behavior for that state changes — rows that were
// preserved as non-terminal are suddenly eligible for sweep (or
// vice versa).
//
// These tests pin the exact membership of each set so any change
// requires a parallel test update, forcing the contributor to
// acknowledge the retention-semantics shift in the PR.
//
// State-vocab extensions (e.g. adding a new state to
// PUBLISH_REQUEST_STATES) are also locked here — the *_STATES arrays
// are the source of truth for what zod schemas accept, what the
// terminal-state sets are subsets of, and what the retention
// predicates can ever see.

import { describe, expect, it } from "vitest";

import {
  APPROVAL_STEP_STATES,
  APPROVAL_STEP_TERMINAL_STATES,
  NOTE_PROMOTION_STATES,
  NOTE_PROMOTION_TERMINAL_STATES,
  PUBLISH_REQUEST_STATES,
  PUBLISH_REQUEST_TERMINAL_STATES,
  RELEASE_STATE_HARD_RETENTION_BLOCKERS,
  isApprovalStepTerminal,
  isNotePromotionTerminal,
  isPublishRequestTerminal,
} from "./lifecycle-state-vocab";

describe("PUBLISH_REQUEST_STATES + PUBLISH_REQUEST_TERMINAL_STATES", () => {
  it("PUBLISH_REQUEST_STATES has the locked 7 values (4 original + 3 extensions)", () => {
    expect([...PUBLISH_REQUEST_STATES].sort()).toEqual(
      [
        "approved",
        "cancelled",
        "failed_terminal",
        "pending",
        "rejected",
        "superseded",
        "withdrawn",
      ].sort(),
    );
  });

  it("PUBLISH_REQUEST_TERMINAL_STATES contains every state except `pending`", () => {
    const expected = new Set(
      PUBLISH_REQUEST_STATES.filter((s) => s !== "pending"),
    );
    expect([...PUBLISH_REQUEST_TERMINAL_STATES].sort()).toEqual(
      [...expected].sort(),
    );
  });

  it("isPublishRequestTerminal agrees with the set for every known state", () => {
    for (const s of PUBLISH_REQUEST_STATES) {
      const inSet = PUBLISH_REQUEST_TERMINAL_STATES.has(s);
      expect(
        isPublishRequestTerminal(s),
        `isPublishRequestTerminal(${s}) must agree with set membership`,
      ).toBe(inSet);
    }
  });

  it("isPublishRequestTerminal returns false for unknown states (fail-closed for the negative path)", () => {
    expect(isPublishRequestTerminal("unknown_future_state")).toBe(false);
    expect(isPublishRequestTerminal("")).toBe(false);
  });
});

describe("APPROVAL_STEP_STATES + APPROVAL_STEP_TERMINAL_STATES", () => {
  it("APPROVAL_STEP_STATES has the locked 7 values (3 original + 4 extensions)", () => {
    expect([...APPROVAL_STEP_STATES].sort()).toEqual(
      [
        "approved",
        "cancelled",
        "expired",
        "pending",
        "rejected",
        "skipped",
        "superseded",
      ].sort(),
    );
  });

  it("APPROVAL_STEP_TERMINAL_STATES contains every state except `pending`", () => {
    const expected = new Set(
      APPROVAL_STEP_STATES.filter((s) => s !== "pending"),
    );
    expect([...APPROVAL_STEP_TERMINAL_STATES].sort()).toEqual(
      [...expected].sort(),
    );
  });

  it("isApprovalStepTerminal agrees with the set", () => {
    for (const s of APPROVAL_STEP_STATES) {
      const inSet = APPROVAL_STEP_TERMINAL_STATES.has(s);
      expect(isApprovalStepTerminal(s)).toBe(inSet);
    }
    expect(isApprovalStepTerminal("unknown")).toBe(false);
  });
});

describe("NOTE_PROMOTION_STATES + NOTE_PROMOTION_TERMINAL_STATES", () => {
  it("NOTE_PROMOTION_STATES has the locked 8 values", () => {
    expect([...NOTE_PROMOTION_STATES].sort()).toEqual(
      [
        "approved",
        "cancelled",
        "in_review",
        "pending",
        "rejected",
        "rolled_back",
        "superseded",
        "validating",
      ].sort(),
    );
  });

  it("NOTE_PROMOTION_TERMINAL_STATES treats rolled_back as terminal (differs from publish-requests)", () => {
    // The doc-block on NOTE_PROMOTION_TERMINAL_STATES explains why:
    // rolled_back means the graph projection is already reverted, so
    // the row's lifecycle is over from a retention standpoint. Active
    // holds preserve via the hold model, not the state machine.
    expect(NOTE_PROMOTION_TERMINAL_STATES.has("rolled_back")).toBe(true);
  });

  it("NOTE_PROMOTION_TERMINAL_STATES excludes pending / validating / in_review (in-flight states)", () => {
    expect(NOTE_PROMOTION_TERMINAL_STATES.has("pending")).toBe(false);
    expect(NOTE_PROMOTION_TERMINAL_STATES.has("validating")).toBe(false);
    expect(NOTE_PROMOTION_TERMINAL_STATES.has("in_review")).toBe(false);
  });

  it("isNotePromotionTerminal agrees with the set", () => {
    for (const s of NOTE_PROMOTION_STATES) {
      const inSet = NOTE_PROMOTION_TERMINAL_STATES.has(s);
      expect(isNotePromotionTerminal(s)).toBe(inSet);
    }
    expect(isNotePromotionTerminal("unknown")).toBe(false);
  });
});

describe("RELEASE_STATE_HARD_RETENTION_BLOCKERS", () => {
  it("is empty today (archivedAt IS NULL is the sole signal)", () => {
    // The doc-block on RELEASE_STATE_HARD_RETENTION_BLOCKERS explicitly
    // says this set is empty today. Future contracts may add entries;
    // when they do, update this assertion + the
    // isReleaseRetentionBlocker logic in lockstep.
    expect([...RELEASE_STATE_HARD_RETENTION_BLOCKERS]).toEqual([]);
  });
});
