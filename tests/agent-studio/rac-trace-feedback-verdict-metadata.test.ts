/**
 * Phase A §T-A.14 — RAC trace feedback-verdict metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_TRACE_FEEDBACK_VERDICTS,
  RAC_TRACE_FEEDBACK_VERDICT_METADATA,
  getRacTraceFeedbackVerdictMetadata,
} from "../../server/agent-studio/services/rac/trace/store.js";

describe("RAC_TRACE_FEEDBACK_VERDICT_METADATA (T-A.14)", () => {
  it("has metadata for every closed-taxonomy verdict", () => {
    for (const v of RAC_TRACE_FEEDBACK_VERDICTS) {
      expect(RAC_TRACE_FEEDBACK_VERDICT_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_TRACE_FEEDBACK_VERDICT_METADATA).length).toBe(
      RAC_TRACE_FEEDBACK_VERDICTS.length,
    );
  });

  it.each(RAC_TRACE_FEEDBACK_VERDICTS)(
    "%s has non-empty label + description + boolean isPositive",
    (v) => {
      const md = RAC_TRACE_FEEDBACK_VERDICT_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.isPositive).toBe("boolean");
    },
  );

  it.each(RAC_TRACE_FEEDBACK_VERDICTS)(
    "getRacTraceFeedbackVerdictMetadata(%s) returns table entry",
    (v) => {
      expect(getRacTraceFeedbackVerdictMetadata(v)).toBe(
        RAC_TRACE_FEEDBACK_VERDICT_METADATA[v],
      );
    },
  );

  it("thumbs_up is the only positive verdict", () => {
    const pos = RAC_TRACE_FEEDBACK_VERDICTS.filter(
      (v) => RAC_TRACE_FEEDBACK_VERDICT_METADATA[v].isPositive,
    );
    expect(pos).toEqual(["thumbs_up"]);
  });

  it("thumbs_down is the only negative verdict", () => {
    const neg = RAC_TRACE_FEEDBACK_VERDICTS.filter(
      (v) => !RAC_TRACE_FEEDBACK_VERDICT_METADATA[v].isPositive,
    );
    expect(neg).toEqual(["thumbs_down"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of RAC_TRACE_FEEDBACK_VERDICTS) {
      labels.add(RAC_TRACE_FEEDBACK_VERDICT_METADATA[v].label);
    }
    expect(labels.size).toBe(RAC_TRACE_FEEDBACK_VERDICTS.length);
  });
});
