/**
 * Phase 25 §T-G.23 — recommendation kind metadata lockstep.
 *
 * Pins the per-kind operator-facing label + description over the
 * closed RECOMMENDATION_KINDS taxonomy.
 */

import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_KINDS,
  RECOMMENDATION_KIND_METADATA,
  getRecommendationKindMetadata,
} from "../../server/agent-studio/services/recommendation/public-api.js";

describe("RECOMMENDATION_KIND_METADATA (T-G.23)", () => {
  it("has a metadata entry for every closed-taxonomy kind", () => {
    for (const k of RECOMMENDATION_KINDS) {
      expect(RECOMMENDATION_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals RECOMMENDATION_KINDS.length (no orphans)", () => {
    expect(Object.keys(RECOMMENDATION_KIND_METADATA).length).toBe(
      RECOMMENDATION_KINDS.length,
    );
  });

  it.each(RECOMMENDATION_KINDS)(
    "%s has non-empty label + description",
    (kind) => {
      const m = RECOMMENDATION_KIND_METADATA[kind];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(RECOMMENDATION_KINDS)(
    "getRecommendationKindMetadata returns the table entry for %s",
    (kind) => {
      expect(getRecommendationKindMetadata(kind)).toBe(
        RECOMMENDATION_KIND_METADATA[kind],
      );
    },
  );

  it("every metadata key maps to a registered RECOMMENDATION_KINDS entry", () => {
    const registered = new Set<string>(RECOMMENDATION_KINDS);
    for (const key of Object.keys(RECOMMENDATION_KIND_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
