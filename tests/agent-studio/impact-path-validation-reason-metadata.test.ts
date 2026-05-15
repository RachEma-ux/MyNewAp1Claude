/**
 * Phase 25 §T-G.34 — impact-path validation reason metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  IMPACT_PATH_VALIDATION_REASON_KEYS,
  IMPACT_PATH_VALIDATION_REASON_METADATA,
  getImpactPathValidationReasonMetadata,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("IMPACT_PATH_VALIDATION_REASON_METADATA (T-G.34)", () => {
  it("has metadata for every closed-taxonomy reason", () => {
    for (const r of IMPACT_PATH_VALIDATION_REASON_KEYS) {
      expect(IMPACT_PATH_VALIDATION_REASON_METADATA[r]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(IMPACT_PATH_VALIDATION_REASON_METADATA).length).toBe(
      IMPACT_PATH_VALIDATION_REASON_KEYS.length,
    );
  });

  it.each(IMPACT_PATH_VALIDATION_REASON_KEYS)(
    "%s has non-empty label + description + remediation + valid classification",
    (r) => {
      const m = IMPACT_PATH_VALIDATION_REASON_METADATA[r];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(30);
      expect(m.remediation.length).toBeGreaterThan(30);
      expect(["caller_input_error", "structural_violation"]).toContain(
        m.classification,
      );
    },
  );

  it.each(IMPACT_PATH_VALIDATION_REASON_KEYS)(
    "getImpactPathValidationReasonMetadata(%s) returns table entry",
    (r) => {
      expect(getImpactPathValidationReasonMetadata(r)).toBe(
        IMPACT_PATH_VALIDATION_REASON_METADATA[r],
      );
    },
  );

  it("empty_sequence and unknown_step are caller_input_error", () => {
    expect(
      IMPACT_PATH_VALIDATION_REASON_METADATA.empty_sequence.classification,
    ).toBe("caller_input_error");
    expect(
      IMPACT_PATH_VALIDATION_REASON_METADATA.unknown_step.classification,
    ).toBe("caller_input_error");
  });

  it("not-advancing and skips-steps are structural_violation", () => {
    expect(
      IMPACT_PATH_VALIDATION_REASON_METADATA.sequence_not_strictly_advancing
        .classification,
    ).toBe("structural_violation");
    expect(
      IMPACT_PATH_VALIDATION_REASON_METADATA.sequence_skips_steps
        .classification,
    ).toBe("structural_violation");
  });

  it("every classification has at least one reason assigned", () => {
    const used = new Set<string>();
    for (const r of IMPACT_PATH_VALIDATION_REASON_KEYS) {
      used.add(IMPACT_PATH_VALIDATION_REASON_METADATA[r].classification);
    }
    expect(used.has("caller_input_error")).toBe(true);
    expect(used.has("structural_violation")).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of IMPACT_PATH_VALIDATION_REASON_KEYS) {
      labels.add(IMPACT_PATH_VALIDATION_REASON_METADATA[r].label);
    }
    expect(labels.size).toBe(IMPACT_PATH_VALIDATION_REASON_KEYS.length);
  });
});
