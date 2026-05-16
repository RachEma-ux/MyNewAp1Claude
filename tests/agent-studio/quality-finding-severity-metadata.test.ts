/**
 * Phase D §T-D.13 — Quality finding severity metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_FINDING_SEVERITIES,
  QUALITY_FINDING_SEVERITY_METADATA,
  getQualityFindingSeverityMetadata,
} from "../../server/agent-studio/services/graph-quality/scanner-metadata.js";

describe("QUALITY_FINDING_SEVERITY_METADATA (T-D.13)", () => {
  it("has metadata for every closed-taxonomy severity", () => {
    for (const s of QUALITY_FINDING_SEVERITIES) {
      expect(QUALITY_FINDING_SEVERITY_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(QUALITY_FINDING_SEVERITY_METADATA).length).toBe(
      QUALITY_FINDING_SEVERITIES.length,
    );
  });

  it.each(QUALITY_FINDING_SEVERITIES)(
    "%s has non-empty label + description + valid rank + boolean blocksPublish",
    (s) => {
      const md = QUALITY_FINDING_SEVERITY_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.blocksPublish).toBe("boolean");
    },
  );

  it.each(QUALITY_FINDING_SEVERITIES)(
    "getQualityFindingSeverityMetadata(%s) returns table entry",
    (s) => {
      expect(getQualityFindingSeverityMetadata(s)).toBe(
        QUALITY_FINDING_SEVERITY_METADATA[s],
      );
    },
  );

  it("rank order matches declaration order (low=0 → critical=3)", () => {
    QUALITY_FINDING_SEVERITIES.forEach((s, idx) => {
      expect(QUALITY_FINDING_SEVERITY_METADATA[s].rank).toBe(idx);
    });
  });

  it("rank is unique across severities", () => {
    const ranks = new Set<number>();
    for (const s of QUALITY_FINDING_SEVERITIES) {
      ranks.add(QUALITY_FINDING_SEVERITY_METADATA[s].rank);
    }
    expect(ranks.size).toBe(QUALITY_FINDING_SEVERITIES.length);
  });

  it("high + critical block publish; low + medium do not", () => {
    expect(QUALITY_FINDING_SEVERITY_METADATA.low.blocksPublish).toBe(false);
    expect(QUALITY_FINDING_SEVERITY_METADATA.medium.blocksPublish).toBe(false);
    expect(QUALITY_FINDING_SEVERITY_METADATA.high.blocksPublish).toBe(true);
    expect(QUALITY_FINDING_SEVERITY_METADATA.critical.blocksPublish).toBe(true);
  });

  it("blocksPublish severities have rank ≥ 2", () => {
    for (const s of QUALITY_FINDING_SEVERITIES) {
      const md = QUALITY_FINDING_SEVERITY_METADATA[s];
      if (md.blocksPublish) {
        expect(md.rank).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of QUALITY_FINDING_SEVERITIES) {
      labels.add(QUALITY_FINDING_SEVERITY_METADATA[s].label);
    }
    expect(labels.size).toBe(QUALITY_FINDING_SEVERITIES.length);
  });
});
