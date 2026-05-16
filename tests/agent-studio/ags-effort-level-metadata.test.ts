/**
 * Phase S §T-S.13 — AGS effort-level metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_EFFORT_LEVELS,
  AGS_EFFORT_LEVEL_METADATA,
  getAgsEffortLevelMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_EFFORT_LEVEL_METADATA (T-S.13)", () => {
  it("has metadata for every closed-taxonomy level", () => {
    for (const l of AGS_EFFORT_LEVELS) {
      expect(AGS_EFFORT_LEVEL_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_EFFORT_LEVEL_METADATA).length).toBe(
      AGS_EFFORT_LEVELS.length,
    );
  });

  it.each(AGS_EFFORT_LEVELS)(
    "%s has non-empty label + description + valid rank + boolean highCost",
    (l) => {
      const md = AGS_EFFORT_LEVEL_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.highCost).toBe("boolean");
    },
  );

  it.each(AGS_EFFORT_LEVELS)(
    "getAgsEffortLevelMetadata(%s) returns table entry",
    (l) => {
      expect(getAgsEffortLevelMetadata(l)).toBe(AGS_EFFORT_LEVEL_METADATA[l]);
    },
  );

  it("rank order matches declaration order (low=0 → max=3)", () => {
    AGS_EFFORT_LEVELS.forEach((l, idx) => {
      expect(AGS_EFFORT_LEVEL_METADATA[l].rank).toBe(idx);
    });
  });

  it("rank is unique across levels", () => {
    const ranks = new Set<number>();
    for (const l of AGS_EFFORT_LEVELS) {
      ranks.add(AGS_EFFORT_LEVEL_METADATA[l].rank);
    }
    expect(ranks.size).toBe(AGS_EFFORT_LEVELS.length);
  });

  it("high + max are high-cost; low + medium are not", () => {
    expect(AGS_EFFORT_LEVEL_METADATA.low.highCost).toBe(false);
    expect(AGS_EFFORT_LEVEL_METADATA.medium.highCost).toBe(false);
    expect(AGS_EFFORT_LEVEL_METADATA.high.highCost).toBe(true);
    expect(AGS_EFFORT_LEVEL_METADATA.max.highCost).toBe(true);
  });

  it("highCost levels have rank ≥ 2", () => {
    for (const l of AGS_EFFORT_LEVELS) {
      const md = AGS_EFFORT_LEVEL_METADATA[l];
      if (md.highCost) {
        expect(md.rank).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of AGS_EFFORT_LEVELS) {
      labels.add(AGS_EFFORT_LEVEL_METADATA[l].label);
    }
    expect(labels.size).toBe(AGS_EFFORT_LEVELS.length);
  });
});
