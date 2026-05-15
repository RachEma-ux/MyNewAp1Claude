/**
 * Phase S §T-S.1 — AGS lifecycle-state metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_LIFECYCLE_STATES,
  AGS_LIFECYCLE_STATE_METADATA,
  getAgsLifecycleStateMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_LIFECYCLE_STATE_METADATA (T-S.1)", () => {
  it("has metadata for every closed-taxonomy state", () => {
    for (const s of AGS_LIFECYCLE_STATES) {
      expect(AGS_LIFECYCLE_STATE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_LIFECYCLE_STATE_METADATA).length).toBe(
      AGS_LIFECYCLE_STATES.length,
    );
  });

  it.each(AGS_LIFECYCLE_STATES)(
    "%s has non-empty label + description + valid phase + boolean runnable",
    (s) => {
      const md = AGS_LIFECYCLE_STATE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "in_development",
        "under_validation",
        "blocked",
        "release_candidate",
        "active",
        "retired",
      ]).toContain(md.phase);
      expect(typeof md.runnable).toBe("boolean");
    },
  );

  it.each(AGS_LIFECYCLE_STATES)(
    "getAgsLifecycleStateMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsLifecycleStateMetadata(s)).toBe(
        AGS_LIFECYCLE_STATE_METADATA[s],
      );
    },
  );

  it("only `published` is runnable", () => {
    for (const s of AGS_LIFECYCLE_STATES) {
      const expected = s === "published";
      expect(AGS_LIFECYCLE_STATE_METADATA[s].runnable).toBe(expected);
    }
  });

  it("every phase has at least one state assigned", () => {
    const used = new Set<string>();
    for (const s of AGS_LIFECYCLE_STATES) {
      used.add(AGS_LIFECYCLE_STATE_METADATA[s].phase);
    }
    expect(used.has("in_development")).toBe(true);
    expect(used.has("under_validation")).toBe(true);
    expect(used.has("blocked")).toBe(true);
    expect(used.has("release_candidate")).toBe(true);
    expect(used.has("active")).toBe(true);
    expect(used.has("retired")).toBe(true);
  });

  it("only `published` is in the active phase", () => {
    for (const s of AGS_LIFECYCLE_STATES) {
      const md = AGS_LIFECYCLE_STATE_METADATA[s];
      if (md.phase === "active") {
        expect(s).toBe("published");
      }
    }
  });

  it("active phase ⇔ runnable", () => {
    for (const s of AGS_LIFECYCLE_STATES) {
      const md = AGS_LIFECYCLE_STATE_METADATA[s];
      if (md.phase === "active") {
        expect(md.runnable).toBe(true);
      } else {
        expect(md.runnable).toBe(false);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_LIFECYCLE_STATES) {
      labels.add(AGS_LIFECYCLE_STATE_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_LIFECYCLE_STATES.length);
  });
});
