/**
 * Phase 22 §T-I.33 — failure-state per-state label lockstep.
 *
 * Locks the `label` field added to `FAILURE_STATE_METADATA` for every
 * closed-taxonomy state.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_METADATA,
  getFailureStateLabel,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("FAILURE_STATE_METADATA per-state label (T-I.33)", () => {
  it.each(FAILURE_STATES)(
    "%s has a non-empty label",
    (state) => {
      const m = FAILURE_STATE_METADATA[state];
      expect(typeof m.label).toBe("string");
      expect(m.label.length).toBeGreaterThan(2);
    },
  );

  it.each(FAILURE_STATES)(
    "getFailureStateLabel(%s) matches metadata.label",
    (state) => {
      expect(getFailureStateLabel(state)).toBe(
        FAILURE_STATE_METADATA[state].label,
      );
    },
  );

  it("every label is unique (no two states share a display name)", () => {
    const labels = new Set<string>();
    for (const s of FAILURE_STATES) {
      labels.add(FAILURE_STATE_METADATA[s].label);
    }
    expect(labels.size).toBe(FAILURE_STATES.length);
  });

  it("labels are Title Case (start with uppercase letter)", () => {
    for (const s of FAILURE_STATES) {
      const label = FAILURE_STATE_METADATA[s].label;
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  it("labels do not equal the technical identifier (snake_case)", () => {
    for (const s of FAILURE_STATES) {
      expect(FAILURE_STATE_METADATA[s].label).not.toBe(s);
    }
  });
});
