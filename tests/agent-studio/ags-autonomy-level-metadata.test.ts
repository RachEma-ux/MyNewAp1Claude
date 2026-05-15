/**
 * Phase S §T-S.3 — AGS autonomy-level metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_AUTONOMY_LEVELS,
  AGS_AUTONOMY_LEVEL_METADATA,
  getAgsAutonomyLevelMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_AUTONOMY_LEVEL_METADATA (T-S.3)", () => {
  it("has metadata for every closed-taxonomy level", () => {
    for (const l of AGS_AUTONOMY_LEVELS) {
      expect(AGS_AUTONOMY_LEVEL_METADATA[l]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_AUTONOMY_LEVEL_METADATA).length).toBe(
      AGS_AUTONOMY_LEVELS.length,
    );
  });

  it.each(AGS_AUTONOMY_LEVELS)(
    "%s has non-empty label + description + valid rank + booleans",
    (l) => {
      const md = AGS_AUTONOMY_LEVEL_METADATA[l];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3]).toContain(md.rank);
      expect(typeof md.requiresHumanApproval).toBe("boolean");
      expect(typeof md.runsContinuously).toBe("boolean");
    },
  );

  it.each(AGS_AUTONOMY_LEVELS)(
    "getAgsAutonomyLevelMetadata(%s) returns table entry",
    (l) => {
      expect(getAgsAutonomyLevelMetadata(l)).toBe(
        AGS_AUTONOMY_LEVEL_METADATA[l],
      );
    },
  );

  it("rank order matches the AGS_AUTONOMY_LEVELS declaration order", () => {
    AGS_AUTONOMY_LEVELS.forEach((level, idx) => {
      expect(AGS_AUTONOMY_LEVEL_METADATA[level].rank).toBe(idx);
    });
  });

  it("rank is unique across all levels", () => {
    const ranks = new Set<number>();
    for (const l of AGS_AUTONOMY_LEVELS) {
      ranks.add(AGS_AUTONOMY_LEVEL_METADATA[l].rank);
    }
    expect(ranks.size).toBe(AGS_AUTONOMY_LEVELS.length);
  });

  it("manual + supervised require human approval; semi/auto do not", () => {
    expect(AGS_AUTONOMY_LEVEL_METADATA.manual.requiresHumanApproval).toBe(true);
    expect(AGS_AUTONOMY_LEVEL_METADATA.supervised.requiresHumanApproval).toBe(
      true,
    );
    expect(
      AGS_AUTONOMY_LEVEL_METADATA.semi_autonomous.requiresHumanApproval,
    ).toBe(false);
    expect(AGS_AUTONOMY_LEVEL_METADATA.autonomous.requiresHumanApproval).toBe(
      false,
    );
  });

  it("only `autonomous` runs continuously", () => {
    for (const l of AGS_AUTONOMY_LEVELS) {
      const expected = l === "autonomous";
      expect(AGS_AUTONOMY_LEVEL_METADATA[l].runsContinuously).toBe(expected);
    }
  });

  it("runsContinuously=true implies requiresHumanApproval=false", () => {
    for (const l of AGS_AUTONOMY_LEVELS) {
      const md = AGS_AUTONOMY_LEVEL_METADATA[l];
      if (md.runsContinuously) {
        expect(md.requiresHumanApproval).toBe(false);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const l of AGS_AUTONOMY_LEVELS) {
      labels.add(AGS_AUTONOMY_LEVEL_METADATA[l].label);
    }
    expect(labels.size).toBe(AGS_AUTONOMY_LEVELS.length);
  });
});
