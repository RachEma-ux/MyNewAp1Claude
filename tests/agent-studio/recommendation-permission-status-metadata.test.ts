/**
 * Phase 25 §T-G.27 — recommendation permission-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_PERMISSION_STATUSES,
  RECOMMENDATION_PERMISSION_STATUS_METADATA,
  getRecommendationPermissionStatusMetadata,
} from "../../server/agent-studio/services/recommendation/public-api.js";

describe("RECOMMENDATION_PERMISSION_STATUS_METADATA (T-G.27)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of RECOMMENDATION_PERMISSION_STATUSES) {
      expect(RECOMMENDATION_PERMISSION_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals RECOMMENDATION_PERMISSION_STATUSES.length", () => {
    expect(Object.keys(RECOMMENDATION_PERMISSION_STATUS_METADATA).length).toBe(
      RECOMMENDATION_PERMISSION_STATUSES.length,
    );
  });

  it.each(RECOMMENDATION_PERMISSION_STATUSES)(
    "%s has non-empty label + description + boolean rendered",
    (status) => {
      const m = RECOMMENDATION_PERMISSION_STATUS_METADATA[status];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect(typeof m.rendered).toBe("boolean");
    },
  );

  it.each(RECOMMENDATION_PERMISSION_STATUSES)(
    "getRecommendationPermissionStatusMetadata(%s) returns table entry",
    (status) => {
      expect(getRecommendationPermissionStatusMetadata(status)).toBe(
        RECOMMENDATION_PERMISSION_STATUS_METADATA[status],
      );
    },
  );

  it("rendered field matches operator semantics (visible/redacted yes, hidden no)", () => {
    expect(RECOMMENDATION_PERMISSION_STATUS_METADATA.visible.rendered).toBe(
      true,
    );
    expect(RECOMMENDATION_PERMISSION_STATUS_METADATA.redacted.rendered).toBe(
      true,
    );
    expect(RECOMMENDATION_PERMISSION_STATUS_METADATA.hidden.rendered).toBe(
      false,
    );
  });

  it("every metadata key maps to a status entry", () => {
    const registered = new Set<string>(RECOMMENDATION_PERMISSION_STATUSES);
    for (const key of Object.keys(RECOMMENDATION_PERMISSION_STATUS_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
