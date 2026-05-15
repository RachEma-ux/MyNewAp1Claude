/**
 * Phase S §T-S.7 — AGS visibility metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_VISIBILITIES,
  AGS_VISIBILITY_METADATA,
  getAgsVisibilityMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_VISIBILITY_METADATA (T-S.7)", () => {
  it("has metadata for every closed-taxonomy visibility", () => {
    for (const v of AGS_VISIBILITIES) {
      expect(AGS_VISIBILITY_METADATA[v]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_VISIBILITY_METADATA).length).toBe(
      AGS_VISIBILITIES.length,
    );
  });

  it.each(AGS_VISIBILITIES)(
    "%s has non-empty label + description + valid rank + boolean external",
    (v) => {
      const md = AGS_VISIBILITY_METADATA[v];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.external).toBe("boolean");
    },
  );

  it.each(AGS_VISIBILITIES)(
    "getAgsVisibilityMetadata(%s) returns table entry",
    (v) => {
      expect(getAgsVisibilityMetadata(v)).toBe(AGS_VISIBILITY_METADATA[v]);
    },
  );

  it("rank order matches declaration order (private=0 → public=3)", () => {
    AGS_VISIBILITIES.forEach((v, idx) => {
      expect(AGS_VISIBILITY_METADATA[v].rank).toBe(idx);
    });
  });

  it("rank is unique across visibilities", () => {
    const ranks = new Set<number>();
    for (const v of AGS_VISIBILITIES) {
      ranks.add(AGS_VISIBILITY_METADATA[v].rank);
    }
    expect(ranks.size).toBe(AGS_VISIBILITIES.length);
  });

  it("only `public` is external", () => {
    for (const v of AGS_VISIBILITIES) {
      const expected = v === "public";
      expect(AGS_VISIBILITY_METADATA[v].external).toBe(expected);
    }
  });

  it("external visibility has the highest rank", () => {
    const externalRanks = AGS_VISIBILITIES
      .filter((v) => AGS_VISIBILITY_METADATA[v].external)
      .map((v) => AGS_VISIBILITY_METADATA[v].rank);
    const maxRank = Math.max(...AGS_VISIBILITIES.map((v) => AGS_VISIBILITY_METADATA[v].rank));
    for (const r of externalRanks) {
      expect(r).toBe(maxRank);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const v of AGS_VISIBILITIES) {
      labels.add(AGS_VISIBILITY_METADATA[v].label);
    }
    expect(labels.size).toBe(AGS_VISIBILITIES.length);
  });
});
