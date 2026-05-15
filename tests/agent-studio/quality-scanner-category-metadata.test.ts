/**
 * Phase 23 §T-D.11 — quality scanner category metadata lockstep.
 *
 * Per-category labels + descriptions over the 5-key
 * QUALITY_SCANNER_CATEGORIES taxonomy. Promotes the previously-
 * union-only type to a tuple-derived export.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_SCANNER_CATEGORIES,
  QUALITY_SCANNER_CATEGORY_METADATA,
  QUALITY_SCANNER_METADATA,
  getQualityScannerCategoryMetadata,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

describe("QUALITY_SCANNER_CATEGORY_METADATA (T-D.11)", () => {
  it("has metadata for every closed-taxonomy category", () => {
    for (const c of QUALITY_SCANNER_CATEGORIES) {
      expect(QUALITY_SCANNER_CATEGORY_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals QUALITY_SCANNER_CATEGORIES.length", () => {
    expect(Object.keys(QUALITY_SCANNER_CATEGORY_METADATA).length).toBe(
      QUALITY_SCANNER_CATEGORIES.length,
    );
  });

  it.each(QUALITY_SCANNER_CATEGORIES)(
    "%s has non-empty label + description",
    (cat) => {
      const m = QUALITY_SCANNER_CATEGORY_METADATA[cat];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(QUALITY_SCANNER_CATEGORIES)(
    "getQualityScannerCategoryMetadata(%s) returns table entry",
    (cat) => {
      expect(getQualityScannerCategoryMetadata(cat)).toBe(
        QUALITY_SCANNER_CATEGORY_METADATA[cat],
      );
    },
  );

  it("every metadata key maps to a QUALITY_SCANNER_CATEGORIES entry", () => {
    const registered = new Set<string>(QUALITY_SCANNER_CATEGORIES);
    for (const key of Object.keys(QUALITY_SCANNER_CATEGORY_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });

  it("every category referenced by QUALITY_SCANNER_METADATA exists in the categories array", () => {
    for (const scanner of Object.values(QUALITY_SCANNER_METADATA)) {
      expect(QUALITY_SCANNER_CATEGORIES).toContain(scanner.category);
    }
  });
});
