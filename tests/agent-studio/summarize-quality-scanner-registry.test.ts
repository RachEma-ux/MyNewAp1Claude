/**
 * Phase B §T-D.16 — `summarizeQualityScannerRegistry` lockstep.
 *
 * Stable-shape aggregator over the canonical `QUALITY_SCANNER_REGISTRY`
 * vs `QUALITY_SCANNER_METADATA`. Companion to `summarizeQualityFindings`
 * (T-D.8 / #1057). Lesson 30 of the V1+ session memory canonized the
 * registry-plus-row-state aggregator pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  QUALITY_SCANNER_CATEGORIES,
  QUALITY_FINDING_SEVERITIES,
  QUALITY_SCANNER_METADATA,
  QUALITY_SCANNER_REGISTRY,
  summarizeQualityScannerRegistry,
} from "../../server/agent-studio/services/graph-quality/public-api.js";
import type { ScannerRegistrationLike } from "../../server/agent-studio/services/graph-quality/public-api.js";

describe("summarizeQualityScannerRegistry — empty input", () => {
  it("totalRegistered=0 and full metadata listed as missingFromRegistry", () => {
    const s = summarizeQualityScannerRegistry([]);
    expect(s.totalRegistered).toBe(0);
    expect(s.totalMetadataKinds).toBe(
      Object.keys(QUALITY_SCANNER_METADATA).length,
    );
    expect(s.missingFromRegistry.length).toBe(s.totalMetadataKinds);
    expect(s.missingFromMetadata).toEqual([]);
    expect(s.metadataCoveragePercent).toBe(0);
  });

  it("byCategory carries every closed category at 0", () => {
    const s = summarizeQualityScannerRegistry([]);
    for (const c of QUALITY_SCANNER_CATEGORIES) {
      expect(s.byCategory[c]).toBe(0);
    }
  });

  it("byDefaultSeverity carries every closed severity at 0", () => {
    const s = summarizeQualityScannerRegistry([]);
    for (const sev of QUALITY_FINDING_SEVERITIES) {
      expect(s.byDefaultSeverity[sev]).toBe(0);
    }
  });
});

describe("summarizeQualityScannerRegistry — canonical registry", () => {
  it("reports 100% metadata coverage on the canonical registry", () => {
    const s = summarizeQualityScannerRegistry(QUALITY_SCANNER_REGISTRY);
    expect(s.totalRegistered).toBe(QUALITY_SCANNER_REGISTRY.length);
    expect(s.missingFromRegistry).toEqual([]);
    expect(s.missingFromMetadata).toEqual([]);
    expect(s.metadataCoveragePercent).toBe(100);
  });

  it("byCategory sums correctly across the canonical registry", () => {
    const s = summarizeQualityScannerRegistry(QUALITY_SCANNER_REGISTRY);
    let sum = 0;
    for (const c of QUALITY_SCANNER_CATEGORIES) sum += s.byCategory[c];
    expect(sum).toBe(QUALITY_SCANNER_REGISTRY.length);
  });

  it("byDefaultSeverity sums correctly across the canonical registry", () => {
    const s = summarizeQualityScannerRegistry(QUALITY_SCANNER_REGISTRY);
    let sum = 0;
    for (const sev of QUALITY_FINDING_SEVERITIES)
      sum += s.byDefaultSeverity[sev];
    expect(sum).toBe(QUALITY_SCANNER_REGISTRY.length);
  });
});

describe("summarizeQualityScannerRegistry — partial registry", () => {
  it("flags scan kinds missing from a partial input", () => {
    const partial: ScannerRegistrationLike[] = [
      { scanKind: "orphan_node" },
      { scanKind: "duplicate_entity" },
    ];
    const s = summarizeQualityScannerRegistry(partial);
    expect(s.totalRegistered).toBe(2);
    expect(s.byCategory.topology).toBe(1); // orphan_node
    expect(s.byCategory.deduplication).toBe(1); // duplicate_entity
    expect(s.byCategory.structure).toBe(0);
    expect(s.missingFromRegistry).toContain("self_loop");
    expect(s.missingFromRegistry).toContain("stale_node");
    expect(s.missingFromMetadata).toEqual([]);
  });

  it("coveragePercent for 2/10 → 20.0", () => {
    const partial: ScannerRegistrationLike[] = [
      { scanKind: "orphan_node" },
      { scanKind: "duplicate_entity" },
    ];
    const s = summarizeQualityScannerRegistry(partial);
    expect(s.metadataCoveragePercent).toBe(20);
  });
});

describe("summarizeQualityScannerRegistry — drift detection", () => {
  it("flags unknown scan kinds as missingFromMetadata", () => {
    const driftedRegistry: ScannerRegistrationLike[] = [
      { scanKind: "orphan_node" },
      { scanKind: "totally_made_up_kind" },
    ];
    const s = summarizeQualityScannerRegistry(driftedRegistry);
    expect(s.missingFromMetadata).toContain("totally_made_up_kind");
    expect(s.missingFromMetadata).not.toContain("orphan_node");
    // unknown kind doesn't increment category / severity counters
    expect(s.byCategory.topology).toBe(1);
  });

  it("unknown kinds count toward totalRegistered but not byCategory", () => {
    const driftedRegistry: ScannerRegistrationLike[] = [
      { scanKind: "orphan_node" },
      { scanKind: "ghost_kind" },
    ];
    const s = summarizeQualityScannerRegistry(driftedRegistry);
    expect(s.totalRegistered).toBe(2);
    let sum = 0;
    for (const c of QUALITY_SCANNER_CATEGORIES) sum += s.byCategory[c];
    expect(sum).toBe(1); // only orphan_node was metadata-known
  });
});

describe("summarizeQualityScannerRegistry — percent precision", () => {
  it("coveragePercent rounds to 1 decimal (1/10 → 10.0)", () => {
    const s = summarizeQualityScannerRegistry([{ scanKind: "orphan_node" }]);
    expect(s.metadataCoveragePercent).toBe(10);
  });

  it("never returns NaN on empty metadata-table edge (defensive)", () => {
    const s = summarizeQualityScannerRegistry([]);
    expect(Number.isNaN(s.metadataCoveragePercent)).toBe(false);
  });
});
