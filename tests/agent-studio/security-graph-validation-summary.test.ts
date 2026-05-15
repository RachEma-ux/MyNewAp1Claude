/**
 * Phase 25 §T-G.20 — summarizeImpactPathValidationOutcomes lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  validateImpactPathSequence,
  summarizeImpactPathValidationOutcomes,
  IMPACT_PATH_VALIDATION_REASON_KEYS,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("summarizeImpactPathValidationOutcomes (T-G.20)", () => {
  it("empty input → zeros + all reason keys at 0 (stable-shape)", () => {
    const s = summarizeImpactPathValidationOutcomes([]);
    expect(s.total).toBe(0);
    expect(s.ok).toBe(0);
    expect(s.failed).toBe(0);
    for (const r of IMPACT_PATH_VALIDATION_REASON_KEYS) {
      expect(s.failedByReason[r]).toBe(0);
    }
  });

  it("counts ok results", () => {
    const s = summarizeImpactPathValidationOutcomes([
      validateImpactPathSequence(["cve", "package"]),
      validateImpactPathSequence(["component", "service"]),
    ]);
    expect(s.ok).toBe(2);
    expect(s.failed).toBe(0);
  });

  it("counts each failure reason", () => {
    const s = summarizeImpactPathValidationOutcomes([
      validateImpactPathSequence([]),                      // empty_sequence
      validateImpactPathSequence(["cve", "component"]),    // sequence_skips_steps
      validateImpactPathSequence(["cve", "cve"]),          // not_strictly_advancing
      validateImpactPathSequence(["cve", "made_up"]),      // unknown_step
    ]);
    expect(s.ok).toBe(0);
    expect(s.failed).toBe(4);
    expect(s.failedByReason.empty_sequence).toBe(1);
    expect(s.failedByReason.sequence_skips_steps).toBe(1);
    expect(s.failedByReason.sequence_not_strictly_advancing).toBe(1);
    expect(s.failedByReason.unknown_step).toBe(1);
  });

  it("ok + failed == total", () => {
    const s = summarizeImpactPathValidationOutcomes([
      validateImpactPathSequence(["cve"]),
      validateImpactPathSequence(["cve", "component"]),
      validateImpactPathSequence(["package", "component"]),
    ]);
    expect(s.ok + s.failed).toBe(s.total);
  });

  it("Σ failedByReason == failed", () => {
    const s = summarizeImpactPathValidationOutcomes([
      validateImpactPathSequence([]),
      validateImpactPathSequence(["cve", "service"]),
      validateImpactPathSequence(["package"]),
    ]);
    const sum = Object.values(s.failedByReason).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.failed);
  });

  it("stable-shape: every reason key always present", () => {
    const s = summarizeImpactPathValidationOutcomes([
      validateImpactPathSequence(["cve"]),
    ]);
    expect(Object.keys(s.failedByReason).length).toBe(
      IMPACT_PATH_VALIDATION_REASON_KEYS.length,
    );
  });

  it("does not mutate input", () => {
    const outcomes = [validateImpactPathSequence(["cve", "package"])];
    const before = JSON.parse(JSON.stringify(outcomes));
    summarizeImpactPathValidationOutcomes(outcomes);
    expect(outcomes).toEqual(before);
  });
});
