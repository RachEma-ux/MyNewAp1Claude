/**
 * Phase A §T-A.13 — RAC readiness-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_READINESS_STATUSES,
  RAC_READINESS_STATUS_METADATA,
  getRacReadinessStatusMetadata,
} from "../../server/agent-studio/shared/export-candidate.js";

describe("RAC_READINESS_STATUS_METADATA (T-A.13)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of RAC_READINESS_STATUSES) {
      expect(RAC_READINESS_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_READINESS_STATUS_METADATA).length).toBe(
      RAC_READINESS_STATUSES.length,
    );
  });

  it.each(RAC_READINESS_STATUSES)(
    "%s has non-empty label + description + boolean allowsExport + boolean requiresInvestigation",
    (s) => {
      const md = RAC_READINESS_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.allowsExport).toBe("boolean");
      expect(typeof md.requiresInvestigation).toBe("boolean");
    },
  );

  it.each(RAC_READINESS_STATUSES)(
    "getRacReadinessStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getRacReadinessStatusMetadata(s)).toBe(
        RAC_READINESS_STATUS_METADATA[s],
      );
    },
  );

  it("blocked is the only export-blocking status", () => {
    const blocking = RAC_READINESS_STATUSES.filter(
      (s) => !RAC_READINESS_STATUS_METADATA[s].allowsExport,
    );
    expect(blocking).toEqual(["blocked"]);
  });

  it("ready is the only no-investigation status", () => {
    const noInv = RAC_READINESS_STATUSES.filter(
      (s) => !RAC_READINESS_STATUS_METADATA[s].requiresInvestigation,
    );
    expect(noInv).toEqual(["ready"]);
  });

  it("!allowsExport implies requiresInvestigation", () => {
    for (const s of RAC_READINESS_STATUSES) {
      const md = RAC_READINESS_STATUS_METADATA[s];
      if (!md.allowsExport) {
        expect(md.requiresInvestigation).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of RAC_READINESS_STATUSES) {
      labels.add(RAC_READINESS_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(RAC_READINESS_STATUSES.length);
  });
});
