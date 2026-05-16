/**
 * Phase D §T-D.15 — PII severity metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PII_SEVERITIES,
  PII_SEVERITY_METADATA,
  getPiiSeverityMetadata,
} from "../../server/agent-studio/services/ingestion/pii-detector.js";

describe("PII_SEVERITY_METADATA (T-D.15)", () => {
  it("has metadata for every closed-taxonomy severity", () => {
    for (const s of PII_SEVERITIES) {
      expect(PII_SEVERITY_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(PII_SEVERITY_METADATA).length).toBe(
      PII_SEVERITIES.length,
    );
  });

  it.each(PII_SEVERITIES)(
    "%s has non-empty label + description + boolean halts",
    (s) => {
      const md = PII_SEVERITY_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.halts).toBe("boolean");
    },
  );

  it.each(PII_SEVERITIES)(
    "getPiiSeverityMetadata(%s) returns table entry",
    (s) => {
      expect(getPiiSeverityMetadata(s)).toBe(PII_SEVERITY_METADATA[s]);
    },
  );

  it("block is the only halting severity", () => {
    const halting = PII_SEVERITIES.filter(
      (s) => PII_SEVERITY_METADATA[s].halts,
    );
    expect(halting).toEqual(["block"]);
  });

  it("warn is the only non-halting severity", () => {
    const ok = PII_SEVERITIES.filter(
      (s) => !PII_SEVERITY_METADATA[s].halts,
    );
    expect(ok).toEqual(["warn"]);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of PII_SEVERITIES) {
      labels.add(PII_SEVERITY_METADATA[s].label);
    }
    expect(labels.size).toBe(PII_SEVERITIES.length);
  });
});
