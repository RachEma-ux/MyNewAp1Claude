/**
 * Phase G §T-G.45 — CAG governance-verdict metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_GOVERNANCE_VERDICTS,
  CAG_GOVERNANCE_VERDICT_METADATA,
  getCagGovernanceVerdictMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_GOVERNANCE_VERDICT_METADATA (T-G.45)", () => {
  it("has metadata for every closed-taxonomy verdict", () => {
    for (const v of CAG_GOVERNANCE_VERDICTS) {
      expect(CAG_GOVERNANCE_VERDICT_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_GOVERNANCE_VERDICT_METADATA).length).toBe(
      CAG_GOVERNANCE_VERDICTS.length,
    );
  });

  it.each(CAG_GOVERNANCE_VERDICTS)(
    "%s has non-empty label + description + boolean allowsDispatch + boolean hasSignal",
    (v) => {
      const md = CAG_GOVERNANCE_VERDICT_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.allowsDispatch).toBe("boolean");
      expect(typeof md.hasSignal).toBe("boolean");
    },
  );

  it.each(CAG_GOVERNANCE_VERDICTS)(
    "getCagGovernanceVerdictMetadata(%s) returns table entry",
    (v) => {
      expect(getCagGovernanceVerdictMetadata(v)).toBe(
        CAG_GOVERNANCE_VERDICT_METADATA[v],
      );
    },
  );

  it("blocked is the only dispatch-blocking verdict", () => {
    const blocking = CAG_GOVERNANCE_VERDICTS.filter(
      (v) => !CAG_GOVERNANCE_VERDICT_METADATA[v].allowsDispatch,
    );
    expect(blocking).toEqual(["blocked"]);
  });

  it("cleared is the only no-signal verdict", () => {
    const noSignal = CAG_GOVERNANCE_VERDICTS.filter(
      (v) => !CAG_GOVERNANCE_VERDICT_METADATA[v].hasSignal,
    );
    expect(noSignal).toEqual(["cleared"]);
  });

  it("hasSignal + !allowsDispatch implies blocked", () => {
    for (const v of CAG_GOVERNANCE_VERDICTS) {
      const md = CAG_GOVERNANCE_VERDICT_METADATA[v];
      if (md.hasSignal && !md.allowsDispatch) {
        expect(v).toBe("blocked");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of CAG_GOVERNANCE_VERDICTS) {
      labels.add(CAG_GOVERNANCE_VERDICT_METADATA[v].label);
    }
    expect(labels.size).toBe(CAG_GOVERNANCE_VERDICTS.length);
  });
});
