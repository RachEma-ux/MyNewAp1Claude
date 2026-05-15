/**
 * Phase 23 §1 — Scanner metadata lockstep.
 *
 * Asserts that every registered scanner in QUALITY_SCANNER_REGISTRY has
 * a metadata row in QUALITY_SCANNER_METADATA, that the mapping is
 * symmetric, and that each row's `proposalKind` matches the canonical
 * `FINDING_CLASS_TO_PROPOSAL_KIND` table (or is the documented
 * `review_<scanKind>` fallback for findings without a direct mapping).
 *
 * Same lockstep pattern as the failure-state bridge-wiring coverage
 * guard (#1020) — when a new scanner ships without registering metadata,
 * this test trips.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_SCANNER_REGISTRY,
  QUALITY_SCANNER_METADATA,
  getScannerMetadata,
  listScannerMetadata,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

const VALID_CATEGORIES = new Set([
  "provenance",
  "structure",
  "freshness",
  "deduplication",
  "topology",
]);

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

describe("Phase 23 scanner metadata lockstep", () => {
  it("every registered scanner has metadata", () => {
    for (const reg of QUALITY_SCANNER_REGISTRY) {
      const meta = getScannerMetadata(reg.scanKind);
      expect(meta, `missing metadata for scanKind=${reg.scanKind}`).toBeDefined();
    }
  });

  it("every metadata row maps back to a registered scanner", () => {
    const registeredKinds = new Set(
      QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind),
    );
    for (const meta of listScannerMetadata()) {
      expect(
        registeredKinds.has(meta.scanKind),
        `metadata row ${meta.scanKind} has no registered scanner`,
      ).toBe(true);
    }
  });

  it("count of registered scanners equals count of metadata rows", () => {
    expect(QUALITY_SCANNER_REGISTRY.length).toBe(
      listScannerMetadata().length,
    );
  });

  it.each(QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind))(
    "%s metadata has valid category + severity + non-empty summary",
    (scanKind) => {
      const meta = getScannerMetadata(scanKind);
      expect(meta).toBeDefined();
      if (!meta) return;
      expect(VALID_CATEGORIES.has(meta.category)).toBe(true);
      expect(VALID_SEVERITIES.has(meta.defaultSeverity)).toBe(true);
      expect(meta.summary.length).toBeGreaterThan(20);
      expect(meta.scanKind).toBe(scanKind);
    },
  );

  it.each(QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind))(
    "%s proposalKind matches FINDING_CLASS_TO_PROPOSAL_KIND or review_* fallback",
    (scanKind) => {
      const meta = getScannerMetadata(scanKind);
      expect(meta).toBeDefined();
      if (!meta) return;
      const mapped = FINDING_CLASS_TO_PROPOSAL_KIND[scanKind];
      if (mapped) {
        expect(meta.proposalKind).toBe(mapped);
      } else {
        expect(meta.proposalKind).toBe(`review_${scanKind}`);
      }
    },
  );

  it("lists exactly 10 scanners (matches §7.1 ancillary catalog count)", () => {
    expect(QUALITY_SCANNER_REGISTRY.length).toBe(10);
  });
});
