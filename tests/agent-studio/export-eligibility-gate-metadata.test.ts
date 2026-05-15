/**
 * Phase E §T-E.4 — export-eligibility gate metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  EXPORT_ELIGIBILITY_GATES,
  EXPORT_ELIGIBILITY_GATE_METADATA,
  getExportEligibilityGateMetadata,
} from "../../server/agent-studio/services/export-eligibility.js";

describe("EXPORT_ELIGIBILITY_GATE_METADATA (T-E.4)", () => {
  it("has metadata for every closed-taxonomy gate", () => {
    for (const g of EXPORT_ELIGIBILITY_GATES) {
      expect(EXPORT_ELIGIBILITY_GATE_METADATA[g]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(EXPORT_ELIGIBILITY_GATE_METADATA).length).toBe(
      EXPORT_ELIGIBILITY_GATES.length,
    );
  });

  it.each(EXPORT_ELIGIBILITY_GATES)(
    "%s has non-empty label + description + valid concern + boolean operatorFixable",
    (g) => {
      const md = EXPORT_ELIGIBILITY_GATE_METADATA[g];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "governance",
        "metadata_completeness",
        "provider_binding",
        "idempotency",
        "runtime_readiness",
      ]).toContain(md.concern);
      expect(typeof md.operatorFixable).toBe("boolean");
    },
  );

  it.each(EXPORT_ELIGIBILITY_GATES)(
    "getExportEligibilityGateMetadata(%s) returns table entry",
    (g) => {
      expect(getExportEligibilityGateMetadata(g)).toBe(
        EXPORT_ELIGIBILITY_GATE_METADATA[g],
      );
    },
  );

  it("idempotency gates are NOT operator-fixable", () => {
    for (const g of EXPORT_ELIGIBILITY_GATES) {
      const md = EXPORT_ELIGIBILITY_GATE_METADATA[g];
      if (md.concern === "idempotency") {
        expect(md.operatorFixable).toBe(false);
      }
    }
  });

  it("every concern is represented by at least one gate", () => {
    const used = new Set<string>();
    for (const g of EXPORT_ELIGIBILITY_GATES) {
      used.add(EXPORT_ELIGIBILITY_GATE_METADATA[g].concern);
    }
    expect(used.has("governance")).toBe(true);
    expect(used.has("metadata_completeness")).toBe(true);
    expect(used.has("provider_binding")).toBe(true);
    expect(used.has("idempotency")).toBe(true);
    expect(used.has("runtime_readiness")).toBe(true);
  });

  it("provider_binding gates cover the two known binding checks", () => {
    expect(
      EXPORT_ELIGIBILITY_GATE_METADATA.provider_binding_valid.concern,
    ).toBe("provider_binding");
    expect(
      EXPORT_ELIGIBILITY_GATE_METADATA.provider_connection_active.concern,
    ).toBe("provider_binding");
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const g of EXPORT_ELIGIBILITY_GATES) {
      labels.add(EXPORT_ELIGIBILITY_GATE_METADATA[g].label);
    }
    expect(labels.size).toBe(EXPORT_ELIGIBILITY_GATES.length);
  });
});
