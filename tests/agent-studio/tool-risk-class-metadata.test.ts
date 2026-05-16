/**
 * Phase G §T-G.46 — Tool risk-class metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  TOOL_RISK_CLASSES,
  TOOL_RISK_CLASS_METADATA,
  getToolRiskClassMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("TOOL_RISK_CLASS_METADATA (T-G.46)", () => {
  it("has metadata for every closed-taxonomy class", () => {
    for (const c of TOOL_RISK_CLASSES) {
      expect(TOOL_RISK_CLASS_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(TOOL_RISK_CLASS_METADATA).length).toBe(
      TOOL_RISK_CLASSES.length,
    );
  });

  it.each(TOOL_RISK_CLASSES)(
    "%s has non-empty label + description + boolean requiresApproval + boolean mutatesExternalState",
    (c) => {
      const md = TOOL_RISK_CLASS_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.requiresApproval).toBe("boolean");
      expect(typeof md.mutatesExternalState).toBe("boolean");
    },
  );

  it.each(TOOL_RISK_CLASSES)(
    "getToolRiskClassMetadata(%s) returns table entry",
    (c) => {
      expect(getToolRiskClassMetadata(c)).toBe(TOOL_RISK_CLASS_METADATA[c]);
    },
  );

  it("read_only is the only no-approval class", () => {
    const noApproval = TOOL_RISK_CLASSES.filter(
      (c) => !TOOL_RISK_CLASS_METADATA[c].requiresApproval,
    );
    expect(noApproval).toEqual(["read_only"]);
  });

  it("write + external_side_effect + destructive are exactly the mutating classes", () => {
    const mutating = new Set(
      TOOL_RISK_CLASSES.filter(
        (c) => TOOL_RISK_CLASS_METADATA[c].mutatesExternalState,
      ),
    );
    expect(mutating).toEqual(
      new Set(["write", "external_side_effect", "destructive"]),
    );
  });

  it("mutatesExternalState implies requiresApproval", () => {
    for (const c of TOOL_RISK_CLASSES) {
      const md = TOOL_RISK_CLASS_METADATA[c];
      if (md.mutatesExternalState) {
        expect(md.requiresApproval).toBe(true);
      }
    }
  });

  it("read_only is the only class that is both !requiresApproval AND !mutatesExternalState", () => {
    const both = TOOL_RISK_CLASSES.filter(
      (c) =>
        !TOOL_RISK_CLASS_METADATA[c].requiresApproval &&
        !TOOL_RISK_CLASS_METADATA[c].mutatesExternalState,
    );
    expect(both).toEqual(["read_only"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of TOOL_RISK_CLASSES) {
      labels.add(TOOL_RISK_CLASS_METADATA[c].label);
    }
    expect(labels.size).toBe(TOOL_RISK_CLASSES.length);
  });
});
