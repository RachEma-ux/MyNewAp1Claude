/**
 * Phase G §T-G.36 — security-graph canonical impact-path step metadata
 * lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA,
  getSecurityGraphCanonicalPathStepMetadata,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA (T-G.36)", () => {
  it("has metadata for every closed-taxonomy step", () => {
    for (const s of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      expect(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[s],
      ).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA).length,
    ).toBe(SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length);
  });

  it.each(SECURITY_GRAPH_CANONICAL_IMPACT_PATH)(
    "%s has non-empty label + narrative + valid stepIndex + booleans",
    (s) => {
      const md = SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.narrative.length).toBeGreaterThan(30);
      expect(typeof md.stepIndex).toBe("number");
      expect(md.stepIndex).toBeGreaterThanOrEqual(0);
      expect(md.stepIndex).toBeLessThan(SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length);
      expect(typeof md.isTerminal).toBe("boolean");
      expect(typeof md.isOrigin).toBe("boolean");
    },
  );

  it.each(SECURITY_GRAPH_CANONICAL_IMPACT_PATH)(
    "getSecurityGraphCanonicalPathStepMetadata(%s) returns table entry",
    (s) => {
      expect(getSecurityGraphCanonicalPathStepMetadata(s)).toBe(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[s],
      );
    },
  );

  it("stepIndex matches the position in SECURITY_GRAPH_CANONICAL_IMPACT_PATH", () => {
    SECURITY_GRAPH_CANONICAL_IMPACT_PATH.forEach((step, idx) => {
      expect(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[step].stepIndex,
      ).toBe(idx);
    });
  });

  it("only the first step has isOrigin=true", () => {
    SECURITY_GRAPH_CANONICAL_IMPACT_PATH.forEach((step, idx) => {
      const expected = idx === 0;
      expect(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[step].isOrigin,
      ).toBe(expected);
    });
  });

  it("only the last step has isTerminal=true", () => {
    const lastIdx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length - 1;
    SECURITY_GRAPH_CANONICAL_IMPACT_PATH.forEach((step, idx) => {
      const expected = idx === lastIdx;
      expect(
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[step].isTerminal,
      ).toBe(expected);
    });
  });

  it("no step is both origin AND terminal (path has length > 1)", () => {
    for (const s of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      const md = SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[s];
      expect(md.isOrigin && md.isTerminal).toBe(false);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      labels.add(SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA[s].label);
    }
    expect(labels.size).toBe(SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length);
  });
});
