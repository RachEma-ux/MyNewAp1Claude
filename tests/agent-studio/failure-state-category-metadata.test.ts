/**
 * Phase 22 §T-I.31 — failure-state category metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_CATEGORY_METADATA,
  getFailureStateCategoryMetadata,
} from "../../server/agent-studio/services/failure-states/public-api.js";

describe("FAILURE_STATE_CATEGORY_METADATA (T-I.31)", () => {
  it("has metadata for every closed-taxonomy category", () => {
    for (const c of FAILURE_STATE_CATEGORIES) {
      expect(FAILURE_STATE_CATEGORY_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals FAILURE_STATE_CATEGORIES.length", () => {
    expect(Object.keys(FAILURE_STATE_CATEGORY_METADATA).length).toBe(
      FAILURE_STATE_CATEGORIES.length,
    );
  });

  it.each(FAILURE_STATE_CATEGORIES)(
    "%s has non-empty label + description",
    (cat) => {
      const m = FAILURE_STATE_CATEGORY_METADATA[cat];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
    },
  );

  it.each(FAILURE_STATE_CATEGORIES)(
    "getFailureStateCategoryMetadata(%s) returns table entry",
    (cat) => {
      expect(getFailureStateCategoryMetadata(cat)).toBe(
        FAILURE_STATE_CATEGORY_METADATA[cat],
      );
    },
  );

  it("every metadata key maps to a FAILURE_STATE_CATEGORIES entry", () => {
    const registered = new Set<string>(FAILURE_STATE_CATEGORIES);
    for (const key of Object.keys(FAILURE_STATE_CATEGORY_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
