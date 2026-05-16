/**
 * Phase G §T-G.53 — Conflict-behavior metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CONFLICT_BEHAVIORS,
  CONFLICT_BEHAVIOR_METADATA,
  getConflictBehaviorMetadata,
} from "../../server/agent-studio/services/marketplace-installer.js";

describe("CONFLICT_BEHAVIOR_METADATA (T-G.53)", () => {
  it("has metadata for every closed-taxonomy behavior", () => {
    for (const b of CONFLICT_BEHAVIORS) {
      expect(CONFLICT_BEHAVIOR_METADATA[b]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CONFLICT_BEHAVIOR_METADATA).length).toBe(
      CONFLICT_BEHAVIORS.length,
    );
  });

  it.each(CONFLICT_BEHAVIORS)(
    "%s has non-empty label + description + boolean producesNewRecord + boolean preservesExisting",
    (b) => {
      const md = CONFLICT_BEHAVIOR_METADATA[b];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.producesNewRecord).toBe("boolean");
      expect(typeof md.preservesExisting).toBe("boolean");
    },
  );

  it.each(CONFLICT_BEHAVIORS)(
    "getConflictBehaviorMetadata(%s) returns table entry",
    (b) => {
      expect(getConflictBehaviorMetadata(b)).toBe(
        CONFLICT_BEHAVIOR_METADATA[b],
      );
    },
  );

  it("rename is the only behavior that produces a new record", () => {
    const produces = CONFLICT_BEHAVIORS.filter(
      (b) => CONFLICT_BEHAVIOR_METADATA[b].producesNewRecord,
    );
    expect(produces).toEqual(["rename"]);
  });

  it("overwrite is the only behavior that does not preserve existing", () => {
    const noPreserve = CONFLICT_BEHAVIORS.filter(
      (b) => !CONFLICT_BEHAVIOR_METADATA[b].preservesExisting,
    );
    expect(noPreserve).toEqual(["overwrite"]);
  });

  it("producesNewRecord implies preservesExisting", () => {
    for (const b of CONFLICT_BEHAVIORS) {
      const md = CONFLICT_BEHAVIOR_METADATA[b];
      if (md.producesNewRecord) {
        expect(md.preservesExisting).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const b of CONFLICT_BEHAVIORS) {
      labels.add(CONFLICT_BEHAVIOR_METADATA[b].label);
    }
    expect(labels.size).toBe(CONFLICT_BEHAVIORS.length);
  });
});
