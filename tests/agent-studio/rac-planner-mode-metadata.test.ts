/**
 * Phase 12 §T-A.7 — RAC planner-mode metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_PLANNER_MODES,
  RAC_PLANNER_MODE_FAMILIES,
  RAC_PLANNER_MODE_METADATA,
  PHASE_12_RESERVED_MODES,
  getRacPlannerModeMetadata,
} from "../../server/agent-studio/services/rac/planner-mode.js";

describe("RAC_PLANNER_MODE_METADATA (T-A.7)", () => {
  it("has metadata for every closed-taxonomy mode", () => {
    for (const m of RAC_PLANNER_MODES) {
      expect(RAC_PLANNER_MODE_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_PLANNER_MODE_METADATA).length).toBe(
      RAC_PLANNER_MODES.length,
    );
  });

  it.each(RAC_PLANNER_MODES)(
    "%s has non-empty label + description + valid family + boolean reserved",
    (m) => {
      const md = RAC_PLANNER_MODE_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(RAC_PLANNER_MODE_FAMILIES).toContain(md.family);
      expect(typeof md.reserved).toBe("boolean");
    },
  );

  it.each(RAC_PLANNER_MODES)(
    "getRacPlannerModeMetadata(%s) returns table entry",
    (m) => {
      expect(getRacPlannerModeMetadata(m)).toBe(RAC_PLANNER_MODE_METADATA[m]);
    },
  );

  it("Phase 12 reserved modes are marked reserved=true", () => {
    for (const m of PHASE_12_RESERVED_MODES) {
      expect(RAC_PLANNER_MODE_METADATA[m].reserved).toBe(true);
    }
  });

  it("non-reserved modes equal RAC_PLANNER_MODES minus PHASE_12_RESERVED_MODES", () => {
    const reservedSet = new Set<string>(PHASE_12_RESERVED_MODES);
    for (const m of RAC_PLANNER_MODES) {
      const expectedReserved = reservedSet.has(m);
      expect(RAC_PLANNER_MODE_METADATA[m].reserved).toBe(expectedReserved);
    }
  });

  it("every family has at least one mode assigned", () => {
    const used = new Set<string>();
    for (const m of RAC_PLANNER_MODES) {
      used.add(RAC_PLANNER_MODE_METADATA[m].family);
    }
    for (const f of RAC_PLANNER_MODE_FAMILIES) {
      expect(used.has(f)).toBe(true);
    }
  });

  it("all graphrag_* modes are in graphrag_pure family", () => {
    for (const m of RAC_PLANNER_MODES) {
      if (m.startsWith("graphrag_")) {
        expect(RAC_PLANNER_MODE_METADATA[m].family).toBe("graphrag_pure");
      }
    }
  });

  it("hybrid_*_graphrag modes are in graphrag_hybrid family", () => {
    expect(RAC_PLANNER_MODE_METADATA.hybrid_cag_graphrag.family).toBe(
      "graphrag_hybrid",
    );
    expect(RAC_PLANNER_MODE_METADATA.hybrid_rac_graphrag.family).toBe(
      "graphrag_hybrid",
    );
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of RAC_PLANNER_MODES) {
      labels.add(RAC_PLANNER_MODE_METADATA[m].label);
    }
    expect(labels.size).toBe(RAC_PLANNER_MODES.length);
  });
});
