import { describe, expect, it } from "vitest";

import {
  buildApprovalStepStateUpdate,
  buildNotePromotionStatusUpdate,
  buildPublishRequestStateUpdate,
} from "./lifecycle-transition";
import {
  isApprovalStepTerminal,
  isNotePromotionTerminal,
  isPublishRequestTerminal,
  isReleaseStateRetentionBlocker,
} from "./lifecycle-state-vocab";

const FROZEN_NOW = new Date("2026-05-13T00:00:00.000Z");

describe("publish-request state transitions", () => {
  it("sets terminalAt for every terminal state", () => {
    const terminals = ["approved", "rejected", "withdrawn", "cancelled", "superseded", "failed_terminal"] as const;
    for (const state of terminals) {
      const update = buildPublishRequestStateUpdate({ state, reason: `to ${state}`, now: FROZEN_NOW });
      expect(update.state).toBe(state);
      expect(update.terminalAt).toEqual(FROZEN_NOW);
      expect(update.terminalReason).toBe(`to ${state}`);
    }
  });

  it("leaves terminalAt null for pending", () => {
    const update = buildPublishRequestStateUpdate({ state: "pending", now: FROZEN_NOW });
    expect(update.terminalAt).toBeNull();
    expect(update.terminalReason).toBeNull();
  });

  it("classifies terminal vs non-terminal correctly", () => {
    expect(isPublishRequestTerminal("approved")).toBe(true);
    expect(isPublishRequestTerminal("rejected")).toBe(true);
    expect(isPublishRequestTerminal("withdrawn")).toBe(true);
    expect(isPublishRequestTerminal("cancelled")).toBe(true);
    expect(isPublishRequestTerminal("superseded")).toBe(true);
    expect(isPublishRequestTerminal("failed_terminal")).toBe(true);
    expect(isPublishRequestTerminal("pending")).toBe(false);
    expect(isPublishRequestTerminal("unknown")).toBe(false);
  });
});

describe("approval-step state transitions", () => {
  it("sets terminalAt for every terminal state including skipped/expired/cancelled/superseded", () => {
    const terminals = ["approved", "rejected", "skipped", "expired", "cancelled", "superseded"] as const;
    for (const state of terminals) {
      const update = buildApprovalStepStateUpdate({ state, now: FROZEN_NOW });
      expect(update.state).toBe(state);
      expect(update.terminalAt).toEqual(FROZEN_NOW);
    }
  });

  it("leaves terminalAt null for pending", () => {
    const update = buildApprovalStepStateUpdate({ state: "pending", now: FROZEN_NOW });
    expect(update.terminalAt).toBeNull();
  });

  it("propagates the reason verbatim", () => {
    const update = buildApprovalStepStateUpdate({ state: "expired", reason: "auto-expiry after 30d", now: FROZEN_NOW });
    expect(update.terminalReason).toBe("auto-expiry after 30d");
  });

  it("classifies terminal vs non-terminal correctly", () => {
    expect(isApprovalStepTerminal("approved")).toBe(true);
    expect(isApprovalStepTerminal("skipped")).toBe(true);
    expect(isApprovalStepTerminal("expired")).toBe(true);
    expect(isApprovalStepTerminal("pending")).toBe(false);
  });
});

describe("note-promotion status transitions", () => {
  it("sets terminalAt for every terminal status", () => {
    const terminals = ["approved", "rejected", "rolled_back", "cancelled", "superseded"] as const;
    for (const status of terminals) {
      const update = buildNotePromotionStatusUpdate({ status, now: FROZEN_NOW });
      expect(update.status).toBe(status);
      expect(update.terminalAt).toEqual(FROZEN_NOW);
    }
  });

  it("leaves terminalAt null for pending / validating / in_review", () => {
    for (const status of ["pending", "validating", "in_review"] as const) {
      const update = buildNotePromotionStatusUpdate({ status, now: FROZEN_NOW });
      expect(update.terminalAt).toBeNull();
      expect(update.status).toBe(status);
    }
  });

  it("rolled_back is treated as terminal — review-hold preservation is the holds table's job", () => {
    expect(isNotePromotionTerminal("rolled_back")).toBe(true);
    const update = buildNotePromotionStatusUpdate({ status: "rolled_back", reason: "incident #42", now: FROZEN_NOW });
    expect(update.terminalAt).toEqual(FROZEN_NOW);
    expect(update.terminalReason).toBe("incident #42");
  });

  it("returns the column name `status` (not `state`) for note-promotion table compatibility", () => {
    const update = buildNotePromotionStatusUpdate({ status: "approved", now: FROZEN_NOW });
    expect(update).toHaveProperty("status", "approved");
    expect(update).not.toHaveProperty("state");
  });
});

describe("release-state retention-blocker classification", () => {
  it("blocks retention for active / pending / draft states", () => {
    expect(isReleaseStateRetentionBlocker("draft")).toBe(true);
    expect(isReleaseStateRetentionBlocker("pending")).toBe(true);
    expect(isReleaseStateRetentionBlocker("active")).toBe(true);
    expect(isReleaseStateRetentionBlocker("published")).toBe(true);
    expect(isReleaseStateRetentionBlocker("rolled_back_under_review")).toBe(true);
  });

  it("does not block retention for retired / superseded / failed terminal states", () => {
    expect(isReleaseStateRetentionBlocker("retired")).toBe(false);
    expect(isReleaseStateRetentionBlocker("superseded")).toBe(false);
    expect(isReleaseStateRetentionBlocker("failed")).toBe(false);
  });

  it("does not block retention for unknown / future states (conservative on unknowns: caller decides)", () => {
    // The classifier returns false for unknown states by design — callers
    // that want to fail-closed on unknowns should layer their own check.
    expect(isReleaseStateRetentionBlocker("totally_unknown_state")).toBe(false);
  });
});

describe("now override", () => {
  it("uses wall-clock when `now` is omitted", () => {
    const update = buildPublishRequestStateUpdate({ state: "approved" });
    expect(update.terminalAt).toBeInstanceOf(Date);
    // Within 5s of "real" now
    expect(Date.now() - (update.terminalAt as Date).getTime()).toBeLessThan(5_000);
  });
});
