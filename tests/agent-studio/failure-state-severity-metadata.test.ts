/**
 * Phase 22 §T-I.32 — failure-state severity metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATE_SEVERITIES,
  FAILURE_STATE_SEVERITY_METADATA,
  getFailureStateSeverityMetadata,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("FAILURE_STATE_SEVERITY_METADATA (T-I.32)", () => {
  it("has metadata for every closed-taxonomy severity", () => {
    for (const s of FAILURE_STATE_SEVERITIES) {
      expect(FAILURE_STATE_SEVERITY_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals FAILURE_STATE_SEVERITIES.length", () => {
    expect(Object.keys(FAILURE_STATE_SEVERITY_METADATA).length).toBe(
      FAILURE_STATE_SEVERITIES.length,
    );
  });

  it.each(FAILURE_STATE_SEVERITIES)(
    "%s has non-empty label + description + valid operatorAction",
    (sev) => {
      const m = FAILURE_STATE_SEVERITY_METADATA[sev];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect(["monitor", "investigate", "escalate"]).toContain(
        m.operatorAction,
      );
    },
  );

  it.each(FAILURE_STATE_SEVERITIES)(
    "getFailureStateSeverityMetadata(%s) returns table entry",
    (sev) => {
      expect(getFailureStateSeverityMetadata(sev)).toBe(
        FAILURE_STATE_SEVERITY_METADATA[sev],
      );
    },
  );

  it("operatorAction escalates monotonically with severity", () => {
    expect(FAILURE_STATE_SEVERITY_METADATA.info.operatorAction).toBe(
      "monitor",
    );
    expect(FAILURE_STATE_SEVERITY_METADATA.warning.operatorAction).toBe(
      "investigate",
    );
    expect(FAILURE_STATE_SEVERITY_METADATA.critical.operatorAction).toBe(
      "escalate",
    );
  });

  it("every metadata key maps to a FAILURE_STATE_SEVERITIES entry", () => {
    const registered = new Set<string>(FAILURE_STATE_SEVERITIES);
    for (const key of Object.keys(FAILURE_STATE_SEVERITY_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
