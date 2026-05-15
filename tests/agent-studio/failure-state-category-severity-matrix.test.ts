/**
 * Phase 22 §T-I.28 — buildFailureStateCategorySeverityMatrix lockstep.
 *
 * 2D operator-dashboard matrix keyed by category × severity. Stable-
 * shape on both axes — every cell exists at zero or higher.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_SEVERITIES,
  FAILURE_STATE_METADATA,
  buildFailureStateCategorySeverityMatrix,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("buildFailureStateCategorySeverityMatrix (T-I.28)", () => {
  it("empty input → every category row + severity column at 0", () => {
    const m = buildFailureStateCategorySeverityMatrix([]);
    for (const cat of FAILURE_STATE_CATEGORIES) {
      for (const sev of FAILURE_STATE_SEVERITIES) {
        expect(m[cat][sev]).toBe(0);
      }
    }
  });

  it("counts a single kind in the correct cell", () => {
    const kind = "neo4j_unavailable";
    const meta = FAILURE_STATE_METADATA[kind];
    const m = buildFailureStateCategorySeverityMatrix([kind]);
    expect(m[meta.category][meta.defaultSeverity]).toBe(1);
  });

  it("ignores unknown kinds silently", () => {
    const m = buildFailureStateCategorySeverityMatrix([
      "neo4j_unavailable",
      "totally_made_up",
    ]);
    const meta = FAILURE_STATE_METADATA["neo4j_unavailable"];
    expect(m[meta.category][meta.defaultSeverity]).toBe(1);
  });

  it("aggregates repeated kinds correctly", () => {
    const m = buildFailureStateCategorySeverityMatrix([
      "neo4j_unavailable",
      "neo4j_unavailable",
      "neo4j_unavailable",
    ]);
    const meta = FAILURE_STATE_METADATA["neo4j_unavailable"];
    expect(m[meta.category][meta.defaultSeverity]).toBe(3);
  });

  it("Σ over the entire matrix == count of recognized kinds", () => {
    const input = [
      "neo4j_unavailable",
      "neo4j_unavailable",
      "promotion_failed",
      "totally_made_up", // ignored
    ];
    const m = buildFailureStateCategorySeverityMatrix(input);
    let sum = 0;
    for (const cat of FAILURE_STATE_CATEGORIES) {
      for (const sev of FAILURE_STATE_SEVERITIES) {
        sum += m[cat][sev];
      }
    }
    expect(sum).toBe(3); // 2 known + 1 known + 1 unknown (ignored)
  });

  it("stable-shape: matrix has every category row + severity column", () => {
    const m = buildFailureStateCategorySeverityMatrix([]);
    expect(Object.keys(m).length).toBe(FAILURE_STATE_CATEGORIES.length);
    for (const cat of FAILURE_STATE_CATEGORIES) {
      expect(Object.keys(m[cat]).length).toBe(
        FAILURE_STATE_SEVERITIES.length,
      );
    }
  });

  it("every FAILURE_STATES kind sums to 1 in its own cell when used alone", () => {
    for (const kind of FAILURE_STATES) {
      const meta = FAILURE_STATE_METADATA[kind];
      const m = buildFailureStateCategorySeverityMatrix([kind]);
      expect(m[meta.category][meta.defaultSeverity]).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not mutate input", () => {
    const input = ["neo4j_unavailable", "promotion_failed"];
    const before = [...input];
    buildFailureStateCategorySeverityMatrix(input);
    expect(input).toEqual(before);
  });
});
