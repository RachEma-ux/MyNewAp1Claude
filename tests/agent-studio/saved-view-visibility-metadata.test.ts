/**
 * Phase V §T-V.1 — saved-view visibility metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  SAVED_VIEW_VISIBILITIES,
  SAVED_VIEW_VISIBILITY_METADATA,
  getSavedViewVisibilityMetadata,
} from "../../server/agent-studio/services/vault/saved-views-visibility.js";

describe("SAVED_VIEW_VISIBILITY_METADATA (T-V.1)", () => {
  it("has metadata for every closed-taxonomy visibility", () => {
    for (const v of SAVED_VIEW_VISIBILITIES) {
      expect(SAVED_VIEW_VISIBILITY_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(SAVED_VIEW_VISIBILITY_METADATA).length).toBe(
      SAVED_VIEW_VISIBILITIES.length,
    );
  });

  it.each(SAVED_VIEW_VISIBILITIES)(
    "%s has non-empty label + description + boolean visibleToOthers",
    (v) => {
      const md = SAVED_VIEW_VISIBILITY_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.visibleToOthers).toBe("boolean");
    },
  );

  it.each(SAVED_VIEW_VISIBILITIES)(
    "getSavedViewVisibilityMetadata(%s) returns table entry",
    (v) => {
      expect(getSavedViewVisibilityMetadata(v)).toBe(
        SAVED_VIEW_VISIBILITY_METADATA[v],
      );
    },
  );

  it("only workspace_shared is visible to others", () => {
    expect(SAVED_VIEW_VISIBILITY_METADATA.personal.visibleToOthers).toBe(
      false,
    );
    expect(
      SAVED_VIEW_VISIBILITY_METADATA.workspace_shared.visibleToOthers,
    ).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of SAVED_VIEW_VISIBILITIES) {
      labels.add(SAVED_VIEW_VISIBILITY_METADATA[v].label);
    }
    expect(labels.size).toBe(SAVED_VIEW_VISIBILITIES.length);
  });
});
