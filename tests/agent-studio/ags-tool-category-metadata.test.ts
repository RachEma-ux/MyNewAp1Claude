/**
 * Phase S §T-S.19 — AGS tool-category metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_TOOL_CATEGORIES,
  AGS_TOOL_CATEGORY_METADATA,
  getAgsToolCategoryMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_TOOL_CATEGORY_METADATA (T-S.19)", () => {
  it("has metadata for every closed-taxonomy category", () => {
    for (const c of AGS_TOOL_CATEGORIES) {
      expect(AGS_TOOL_CATEGORY_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_TOOL_CATEGORY_METADATA).length).toBe(
      AGS_TOOL_CATEGORIES.length,
    );
  });

  it.each(AGS_TOOL_CATEGORIES)(
    "%s has non-empty label + description + booleans",
    (c) => {
      const md = AGS_TOOL_CATEGORY_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.mutatesState).toBe("boolean");
      expect(typeof md.openEnded).toBe("boolean");
    },
  );

  it.each(AGS_TOOL_CATEGORIES)(
    "getAgsToolCategoryMetadata(%s) returns table entry",
    (c) => {
      expect(getAgsToolCategoryMetadata(c)).toBe(AGS_TOOL_CATEGORY_METADATA[c]);
    },
  );

  it("filesystem/communication/network mutate state; compute/search/custom do not", () => {
    expect(AGS_TOOL_CATEGORY_METADATA.filesystem.mutatesState).toBe(true);
    expect(AGS_TOOL_CATEGORY_METADATA.communication.mutatesState).toBe(true);
    expect(AGS_TOOL_CATEGORY_METADATA.network.mutatesState).toBe(true);
    expect(AGS_TOOL_CATEGORY_METADATA.compute.mutatesState).toBe(false);
    expect(AGS_TOOL_CATEGORY_METADATA.search.mutatesState).toBe(false);
    expect(AGS_TOOL_CATEGORY_METADATA.custom.mutatesState).toBe(false);
  });

  it("only `custom` is open-ended", () => {
    for (const c of AGS_TOOL_CATEGORIES) {
      const expected = c === "custom";
      expect(AGS_TOOL_CATEGORY_METADATA[c].openEnded).toBe(expected);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of AGS_TOOL_CATEGORIES) {
      labels.add(AGS_TOOL_CATEGORY_METADATA[c].label);
    }
    expect(labels.size).toBe(AGS_TOOL_CATEGORIES.length);
  });
});
