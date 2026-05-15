/**
 * Phase L §T-L.3 — note-promotion-state metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  NOTE_PROMOTION_STATES,
  NOTE_PROMOTION_TERMINAL_STATES,
  NOTE_PROMOTION_STATE_METADATA,
  getNotePromotionStateMetadata,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

describe("NOTE_PROMOTION_STATE_METADATA (T-L.3)", () => {
  it("has metadata for every closed-taxonomy state", () => {
    for (const s of NOTE_PROMOTION_STATES) {
      expect(NOTE_PROMOTION_STATE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(NOTE_PROMOTION_STATE_METADATA).length).toBe(
      NOTE_PROMOTION_STATES.length,
    );
  });

  it.each(NOTE_PROMOTION_STATES)(
    "%s has non-empty label + description + valid outcome + boolean terminal",
    (s) => {
      const md = NOTE_PROMOTION_STATE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "in_progress",
        "accepted",
        "declined",
        "reverted",
        "cancelled",
        "obsolete",
      ]).toContain(md.outcome);
      expect(typeof md.terminal).toBe("boolean");
    },
  );

  it.each(NOTE_PROMOTION_STATES)(
    "getNotePromotionStateMetadata(%s) returns table entry",
    (s) => {
      expect(getNotePromotionStateMetadata(s)).toBe(
        NOTE_PROMOTION_STATE_METADATA[s],
      );
    },
  );

  it("metadata.terminal mirrors NOTE_PROMOTION_TERMINAL_STATES exactly", () => {
    for (const s of NOTE_PROMOTION_STATES) {
      const expected = NOTE_PROMOTION_TERMINAL_STATES.has(s);
      expect(NOTE_PROMOTION_STATE_METADATA[s].terminal).toBe(expected);
    }
  });

  it("pending/validating/in_review are the non-terminal in_progress states", () => {
    expect(NOTE_PROMOTION_STATE_METADATA.pending.terminal).toBe(false);
    expect(NOTE_PROMOTION_STATE_METADATA.validating.terminal).toBe(false);
    expect(NOTE_PROMOTION_STATE_METADATA.in_review.terminal).toBe(false);
    expect(NOTE_PROMOTION_STATE_METADATA.pending.outcome).toBe("in_progress");
    expect(NOTE_PROMOTION_STATE_METADATA.validating.outcome).toBe(
      "in_progress",
    );
    expect(NOTE_PROMOTION_STATE_METADATA.in_review.outcome).toBe(
      "in_progress",
    );
  });

  it("in_progress outcome ⇔ non-terminal", () => {
    for (const s of NOTE_PROMOTION_STATES) {
      const md = NOTE_PROMOTION_STATE_METADATA[s];
      if (md.outcome === "in_progress") {
        expect(md.terminal).toBe(false);
      } else {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("rolled_back is the only `reverted` outcome", () => {
    expect(NOTE_PROMOTION_STATE_METADATA.rolled_back.outcome).toBe("reverted");
    for (const s of NOTE_PROMOTION_STATES) {
      if (s !== "rolled_back") {
        expect(NOTE_PROMOTION_STATE_METADATA[s].outcome).not.toBe("reverted");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of NOTE_PROMOTION_STATES) {
      labels.add(NOTE_PROMOTION_STATE_METADATA[s].label);
    }
    expect(labels.size).toBe(NOTE_PROMOTION_STATES.length);
  });
});
