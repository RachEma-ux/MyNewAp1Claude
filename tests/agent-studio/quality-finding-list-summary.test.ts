/**
 * Phase 23 §T-D.8 — summarizeQualityFindings lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_FINDING_SEVERITIES,
  summarizeQualityFindings,
  type QualityFindingSeverity,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

interface Finding {
  readonly id: string;
  readonly scanKind: string;
  readonly severity: QualityFindingSeverity;
}

const getKind = (f: Finding) => f.scanKind;
const getSev = (f: Finding) => f.severity;

describe("summarizeQualityFindings (T-D.8)", () => {
  it("empty input → zeros + stable-shape severity + category axes", () => {
    const s = summarizeQualityFindings<Finding>([], getKind, getSev);
    expect(s.total).toBe(0);
    expect(s.unknownScanKindCount).toBe(0);
    expect(Object.keys(s.byScanKind).length).toBe(0);
    for (const sev of QUALITY_FINDING_SEVERITIES) {
      expect(s.bySeverity[sev]).toBe(0);
    }
    expect(s.byCategory.provenance).toBe(0);
    expect(s.byCategory.structure).toBe(0);
    expect(s.byCategory.freshness).toBe(0);
    expect(s.byCategory.deduplication).toBe(0);
    expect(s.byCategory.topology).toBe(0);
  });

  it("counts findings by registered scanKind", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "medium" },
        { id: "2", scanKind: "orphan_node", severity: "low" },
        { id: "3", scanKind: "duplicate_entity", severity: "high" },
      ],
      getKind,
      getSev,
    );
    expect(s.total).toBe(3);
    expect(s.byScanKind.orphan_node).toBe(2);
    expect(s.byScanKind.duplicate_entity).toBe(1);
    expect(s.unknownScanKindCount).toBe(0);
  });

  it("counts unknown scanKind separately, never throws", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "medium" },
        { id: "2", scanKind: "made_up_scanner", severity: "low" },
      ],
      getKind,
      getSev,
    );
    expect(s.total).toBe(2);
    expect(s.unknownScanKindCount).toBe(1);
    expect(s.byScanKind.made_up_scanner).toBe(1);
  });

  it("maps scanKind to category via QUALITY_SCANNER_METADATA", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "medium" }, // topology
        { id: "2", scanKind: "duplicate_entity", severity: "high" }, // deduplication
        { id: "3", scanKind: "missing_provenance", severity: "high" }, // provenance
      ],
      getKind,
      getSev,
    );
    expect(s.byCategory.topology).toBe(1);
    expect(s.byCategory.deduplication).toBe(1);
    expect(s.byCategory.provenance).toBe(1);
  });

  it("aggregates by severity", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "low" },
        { id: "2", scanKind: "orphan_node", severity: "medium" },
        { id: "3", scanKind: "duplicate_entity", severity: "high" },
        { id: "4", scanKind: "duplicate_entity", severity: "high" },
        { id: "5", scanKind: "self_loop", severity: "critical" },
      ],
      getKind,
      getSev,
    );
    expect(s.bySeverity.low).toBe(1);
    expect(s.bySeverity.medium).toBe(1);
    expect(s.bySeverity.high).toBe(2);
    expect(s.bySeverity.critical).toBe(1);
  });

  it("Σ byScanKind == total", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "low" },
        { id: "2", scanKind: "duplicate_entity", severity: "high" },
        { id: "3", scanKind: "weird_kind", severity: "high" },
      ],
      getKind,
      getSev,
    );
    const sum = Object.values(s.byScanKind).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("Σ bySeverity == total", () => {
    const s = summarizeQualityFindings(
      [
        { id: "1", scanKind: "orphan_node", severity: "low" },
        { id: "2", scanKind: "orphan_node", severity: "high" },
      ],
      getKind,
      getSev,
    );
    const sum = Object.values(s.bySeverity).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("does not mutate input", () => {
    const input: Finding[] = [
      { id: "1", scanKind: "orphan_node", severity: "low" },
    ];
    const before = JSON.parse(JSON.stringify(input));
    summarizeQualityFindings(input, getKind, getSev);
    expect(input).toEqual(before);
  });
});
