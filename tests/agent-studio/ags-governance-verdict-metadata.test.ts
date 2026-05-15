/**
 * Phase S §T-S.5 — AGS governance-verdict metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_GOVERNANCE_VERDICTS,
  AGS_GOVERNANCE_VERDICT_METADATA,
  getAgsGovernanceVerdictMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_GOVERNANCE_VERDICT_METADATA (T-S.5)", () => {
  it("has metadata for every closed-taxonomy verdict", () => {
    for (const v of AGS_GOVERNANCE_VERDICTS) {
      expect(AGS_GOVERNANCE_VERDICT_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_GOVERNANCE_VERDICT_METADATA).length).toBe(
      AGS_GOVERNANCE_VERDICTS.length,
    );
  });

  it.each(AGS_GOVERNANCE_VERDICTS)(
    "%s has non-empty label + description + booleans",
    (v) => {
      const md = AGS_GOVERNANCE_VERDICT_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.allowsPromotion).toBe("boolean");
      expect(typeof md.requiresOperatorAttention).toBe("boolean");
    },
  );

  it.each(AGS_GOVERNANCE_VERDICTS)(
    "getAgsGovernanceVerdictMetadata(%s) returns table entry",
    (v) => {
      expect(getAgsGovernanceVerdictMetadata(v)).toBe(
        AGS_GOVERNANCE_VERDICT_METADATA[v],
      );
    },
  );

  it("only `blocked` blocks promotion", () => {
    expect(AGS_GOVERNANCE_VERDICT_METADATA.pass.allowsPromotion).toBe(true);
    expect(AGS_GOVERNANCE_VERDICT_METADATA.warning.allowsPromotion).toBe(true);
    expect(AGS_GOVERNANCE_VERDICT_METADATA.blocked.allowsPromotion).toBe(false);
  });

  it("only `pass` does NOT require operator attention", () => {
    expect(
      AGS_GOVERNANCE_VERDICT_METADATA.pass.requiresOperatorAttention,
    ).toBe(false);
    expect(
      AGS_GOVERNANCE_VERDICT_METADATA.warning.requiresOperatorAttention,
    ).toBe(true);
    expect(
      AGS_GOVERNANCE_VERDICT_METADATA.blocked.requiresOperatorAttention,
    ).toBe(true);
  });

  it("allowsPromotion=false implies requiresOperatorAttention=true", () => {
    for (const v of AGS_GOVERNANCE_VERDICTS) {
      const md = AGS_GOVERNANCE_VERDICT_METADATA[v];
      if (!md.allowsPromotion) {
        expect(md.requiresOperatorAttention).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of AGS_GOVERNANCE_VERDICTS) {
      labels.add(AGS_GOVERNANCE_VERDICT_METADATA[v].label);
    }
    expect(labels.size).toBe(AGS_GOVERNANCE_VERDICTS.length);
  });
});
