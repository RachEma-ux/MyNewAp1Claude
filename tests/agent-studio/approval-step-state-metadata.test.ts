/**
 * Phase L §T-L.2 — approval-step-state metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  APPROVAL_STEP_STATES,
  APPROVAL_STEP_TERMINAL_STATES,
  APPROVAL_STEP_STATE_METADATA,
  getApprovalStepStateMetadata,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

describe("APPROVAL_STEP_STATE_METADATA (T-L.2)", () => {
  it("has metadata for every closed-taxonomy state", () => {
    for (const s of APPROVAL_STEP_STATES) {
      expect(APPROVAL_STEP_STATE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(APPROVAL_STEP_STATE_METADATA).length).toBe(
      APPROVAL_STEP_STATES.length,
    );
  });

  it.each(APPROVAL_STEP_STATES)(
    "%s has non-empty label + description + valid outcome + boolean terminal",
    (s) => {
      const md = APPROVAL_STEP_STATE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "awaiting",
        "accepted",
        "declined",
        "skipped",
        "expired",
        "cancelled",
        "obsolete",
      ]).toContain(md.outcome);
      expect(typeof md.terminal).toBe("boolean");
    },
  );

  it.each(APPROVAL_STEP_STATES)(
    "getApprovalStepStateMetadata(%s) returns table entry",
    (s) => {
      expect(getApprovalStepStateMetadata(s)).toBe(
        APPROVAL_STEP_STATE_METADATA[s],
      );
    },
  );

  it("metadata.terminal mirrors APPROVAL_STEP_TERMINAL_STATES exactly", () => {
    for (const s of APPROVAL_STEP_STATES) {
      const expected = APPROVAL_STEP_TERMINAL_STATES.has(s);
      expect(APPROVAL_STEP_STATE_METADATA[s].terminal).toBe(expected);
    }
  });

  it("only `pending` is non-terminal (outcome: awaiting)", () => {
    expect(APPROVAL_STEP_STATE_METADATA.pending.terminal).toBe(false);
    expect(APPROVAL_STEP_STATE_METADATA.pending.outcome).toBe("awaiting");
    for (const s of APPROVAL_STEP_STATES) {
      if (s !== "pending") {
        expect(APPROVAL_STEP_STATE_METADATA[s].terminal).toBe(true);
      }
    }
  });

  it("awaiting outcome implies non-terminal; non-awaiting implies terminal", () => {
    for (const s of APPROVAL_STEP_STATES) {
      const md = APPROVAL_STEP_STATE_METADATA[s];
      if (md.outcome === "awaiting") {
        expect(md.terminal).toBe(false);
      } else {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of APPROVAL_STEP_STATES) {
      labels.add(APPROVAL_STEP_STATE_METADATA[s].label);
    }
    expect(labels.size).toBe(APPROVAL_STEP_STATES.length);
  });
});
