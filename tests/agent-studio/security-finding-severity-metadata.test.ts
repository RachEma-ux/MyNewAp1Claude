/**
 * Phase 25 §T-G.29 — security-finding severity metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_FINDING_SEVERITIES,
  SECURITY_FINDING_SEVERITY_METADATA,
  getSecurityFindingSeverityMetadata,
  cvssScoreToSeverity,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("SECURITY_FINDING_SEVERITY_METADATA (T-G.29)", () => {
  it("has metadata for every closed-taxonomy severity", () => {
    for (const s of SECURITY_FINDING_SEVERITIES) {
      expect(SECURITY_FINDING_SEVERITY_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals SECURITY_FINDING_SEVERITIES.length", () => {
    expect(Object.keys(SECURITY_FINDING_SEVERITY_METADATA).length).toBe(
      SECURITY_FINDING_SEVERITIES.length,
    );
  });

  it.each(SECURITY_FINDING_SEVERITIES)(
    "%s has non-empty label + description + valid operatorAction",
    (sev) => {
      const m = SECURITY_FINDING_SEVERITY_METADATA[sev];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect([
        "informational",
        "monitor",
        "schedule_patch",
        "patch_soon",
        "patch_now",
      ]).toContain(m.operatorAction);
    },
  );

  it.each(SECURITY_FINDING_SEVERITIES)(
    "getSecurityFindingSeverityMetadata(%s) returns table entry",
    (sev) => {
      expect(getSecurityFindingSeverityMetadata(sev)).toBe(
        SECURITY_FINDING_SEVERITY_METADATA[sev],
      );
    },
  );

  it("cvssRange is null only for informational", () => {
    expect(SECURITY_FINDING_SEVERITY_METADATA.informational.cvssRange).toBeNull();
    expect(SECURITY_FINDING_SEVERITY_METADATA.low.cvssRange).not.toBeNull();
    expect(SECURITY_FINDING_SEVERITY_METADATA.medium.cvssRange).not.toBeNull();
    expect(SECURITY_FINDING_SEVERITY_METADATA.high.cvssRange).not.toBeNull();
    expect(SECURITY_FINDING_SEVERITY_METADATA.critical.cvssRange).not.toBeNull();
  });

  it("cvssRange boundaries match cvssScoreToSeverity buckets", () => {
    for (const sev of SECURITY_FINDING_SEVERITIES) {
      const range = SECURITY_FINDING_SEVERITY_METADATA[sev].cvssRange;
      if (range === null) continue;
      const [lo, hi] = range;
      expect(cvssScoreToSeverity(lo)).toBe(sev);
      expect(cvssScoreToSeverity(hi)).toBe(sev);
    }
  });

  it("operatorAction escalates monotonically with severity", () => {
    expect(SECURITY_FINDING_SEVERITY_METADATA.informational.operatorAction).toBe(
      "informational",
    );
    expect(SECURITY_FINDING_SEVERITY_METADATA.low.operatorAction).toBe(
      "monitor",
    );
    expect(SECURITY_FINDING_SEVERITY_METADATA.medium.operatorAction).toBe(
      "schedule_patch",
    );
    expect(SECURITY_FINDING_SEVERITY_METADATA.high.operatorAction).toBe(
      "patch_soon",
    );
    expect(SECURITY_FINDING_SEVERITY_METADATA.critical.operatorAction).toBe(
      "patch_now",
    );
  });
});
