/**
 * Phase V §T-V.3 — attachment-library browse sort-key metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  BROWSE_SORT_KEYS,
  BROWSE_SORT_KEY_METADATA,
  getBrowseSortKeyMetadata,
} from "../../server/agent-studio/services/vault/attachment-library.js";

describe("BROWSE_SORT_KEY_METADATA (T-V.3)", () => {
  it("has metadata for every closed-taxonomy key", () => {
    for (const k of BROWSE_SORT_KEYS) {
      expect(BROWSE_SORT_KEY_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(BROWSE_SORT_KEY_METADATA).length).toBe(
      BROWSE_SORT_KEYS.length,
    );
  });

  it.each(BROWSE_SORT_KEYS)(
    "%s has non-empty label + description + valid sortColumn + boolean ascending",
    (k) => {
      const md = BROWSE_SORT_KEY_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(["createdAt", "byteSize"]).toContain(md.sortColumn);
      expect(typeof md.ascending).toBe("boolean");
    },
  );

  it.each(BROWSE_SORT_KEYS)(
    "getBrowseSortKeyMetadata(%s) returns table entry",
    (k) => {
      expect(getBrowseSortKeyMetadata(k)).toBe(BROWSE_SORT_KEY_METADATA[k]);
    },
  );

  it("both current sorts are descending", () => {
    for (const k of BROWSE_SORT_KEYS) {
      expect(BROWSE_SORT_KEY_METADATA[k].ascending).toBe(false);
    }
  });

  it("created_at_desc sorts by createdAt; size_desc sorts by byteSize", () => {
    expect(BROWSE_SORT_KEY_METADATA.created_at_desc.sortColumn).toBe(
      "createdAt",
    );
    expect(BROWSE_SORT_KEY_METADATA.size_desc.sortColumn).toBe("byteSize");
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of BROWSE_SORT_KEYS) {
      labels.add(BROWSE_SORT_KEY_METADATA[k].label);
    }
    expect(labels.size).toBe(BROWSE_SORT_KEYS.length);
  });
});
